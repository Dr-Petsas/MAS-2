// Lena Trainingscenter (Chef 24.07.2026) — PUBLIC Endpunkte (Geraet ODER Login).
//
// Zweck: Jede Praxis schaerft die Lena-Spracherkennung auf ihr INDIVIDUELLES
// Fachvokabular (Ueberweiser, Labore, Implantat-/Materialmarken, Abkuerzungen)
// und wir sammeln dabei AUDIO+TEXT pro Kunde als Trainingskorpus fuer spaeteres
// LoRA-Fine-Tuning.
//
// Ablauf:
//   PDF/Brief (Browser -> Text) / manueller Begriff -> POST /training/extract
//     -> LOKALES LLM extrahiert Kandidaten -> clients/{id}/lenaVocab
//   Begriff-Karte antippen -> Mikro (16 kHz PCM) -> POST /training/attempt
//     -> MAS reicht PCM an lena_stt /transcribe -> Treffer/Verhoerung
//     -> WAV in Storage (clients/{id}/lena-training/{sampleId}.wav)
//     -> Sample-Metadaten (clients/{id}/lenaSamples) = Korpus
//     -> Gamification (XP/Level/Streak/Coverage/Badges)
//
// DSGVO: Term-Extraktion NUR ueber das lokale LLM (mail/llm.js, on-prem).
// Clara bleibt unangetastet — rein additive Routen + eigener Firestore-Bereich.

import express from "express";
import admin from "./../firebase.js";
import { identifyByDevice } from "../clara/devices.js";
import { chat, strongLlm } from "../mail/llm.js";
import { log } from "../log.js";
import {
  XP_OK, XP_TEACH, normText, isMatch, levelForXp, levelTitle,
  berlinDay, nextStreak, computeBadges, pcmToWav,
} from "../lena/trainingScore.js";

const router = express.Router();

// Begriffs-Extraktion & Satz-Generierung wollen das STARKE Modell (RTX-5090,
// qwen3.6) fuer brauchbare, fachspezifische Ergebnisse. Ist der 5090 nicht
// erreichbar, faellt es auf das lokale Modell zurueck (besser als gar nichts).
async function chatSmart(messages, opts = {}) {
  const strong = strongLlm();
  const first = await chat(messages, { ...opts, baseUrl: strong.base, model: strong.model });
  if (first.ok) return first;
  log.warn("training.strong_llm_unreachable_fallback_local", { reason: first.reason || "error" });
  return chat(messages, opts);
}

const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
const LENA_STT_PORT = Number(process.env.LENA_STT_PORT || 8140);
const FieldValue = admin.firestore.FieldValue;

// ── Auth: gekoppeltes Geraet (deviceKey) ODER eingeloggter Nutzer (Bearer) ──
async function trainingActor(req) {
  const clientId = String(req.body?.clientId || req.query?.clientId || "").trim();
  const deviceId = String(req.body?.deviceId || req.query?.deviceId || "").trim();
  const deviceKey = String(req.body?.deviceKey || req.query?.deviceKey || "").trim();
  if (ID_RE.test(clientId) && deviceId && deviceKey) {
    const who = await identifyByDevice(clientId, deviceId, deviceKey).catch(() => null);
    if (who) {
      return { ok: true, clientId, speaker: String(who.doctorName || who.name || "Behandler").slice(0, 60) };
    }
  }
  // Eingeloggter Plattform-Nutzer (auth.js hat req.auth gesetzt).
  if (req.auth?.kind === "user" && ID_RE.test(String(req.auth.clientId || ""))) {
    return {
      ok: true,
      clientId: String(req.auth.clientId),
      speaker: String(req.auth.name || req.auth.email || "Behandler").slice(0, 60),
    };
  }
  // Service-Token/Dev: erlaubt, clientId muss dann im Body stehen.
  if ((req.auth?.kind === "service" || req.auth?.kind === "anon") && ID_RE.test(clientId)) {
    return { ok: true, clientId, speaker: "Behandler" };
  }
  return { ok: false };
}

// ── Firestore-Referenzen ────────────────────────────────────────────────────
function clientRef(clientId) {
  return admin.firestore().collection("clients").doc(clientId);
}
function vocabCol(clientId) {
  return clientRef(clientId).collection("lenaVocab");
}
function samplesCol(clientId) {
  return clientRef(clientId).collection("lenaSamples");
}
function statsRef(clientId) {
  return clientRef(clientId).collection("lenaVocabMeta").doc("stats");
}

async function loadStats(clientId) {
  const snap = await statsRef(clientId).get();
  const d = snap.exists ? (snap.data() || {}) : {};
  return {
    totalTerms: Number(d.totalTerms || 0),
    confirmed: Number(d.confirmed || 0),
    coveragePct: Number(d.coveragePct || 0),
    xp: Number(d.xp || 0),
    level: Number(d.level || 1),
    streakDays: Number(d.streakDays || 0),
    lastTrainingDay: String(d.lastTrainingDay || ""),
    samples: Number(d.samples || 0),
    badges: Array.isArray(d.badges) ? d.badges : [],
  };
}

/** Zaehlt Begriffe neu aus (billiger als laufend zu inkrementieren, robust
    gegen Doppel-Delivery) und schreibt totalTerms/confirmed/coveragePct. */
async function recountTerms(clientId, agg) {
  const snap = await vocabCol(clientId).where("status", "!=", "retired").get().catch(() => null);
  let total = 0, confirmed = 0;
  if (snap) {
    snap.forEach((doc) => {
      const s = String(doc.data()?.status || "");
      if (s === "retired") return;
      total++;
      if (s === "confirmed") confirmed++;
    });
  }
  agg.totalTerms = total;
  agg.confirmed = confirmed;
  agg.coveragePct = total ? Math.round((confirmed / total) * 100) : 0;
  return agg;
}

// ── POST /training/extract — Text (aus PDF/Brief) -> Kandidatenbegriffe ──────
router.post("/training/extract", async (req, res) => {
  try {
    const actor = await trainingActor(req);
    if (!actor.ok) return res.status(403).json({ ok: false, error: "forbidden" });
    const raw = String(req.body?.text || "").slice(0, 40000).trim();
    const source = String(req.body?.source || "pdf").slice(0, 20);
    if (!raw) return res.status(400).json({ ok: false, error: "empty_text" });

    const sys = [
      "Du extrahierst aus einem deutschen zahnmedizinischen/medizinischen Text NUR",
      "die Begriffe, die eine Spracherkennung wahrscheinlich falsch versteht:",
      "Eigennamen (Ärzte, Labore, Orte), Marken/Produkte (Implantatsysteme,",
      "Materialien, Medikamente), seltene Fachbegriffe und Abkürzungen.",
      "KEINE Alltagswörter, keine Sätze, keine Patientennamen.",
      "Antworte AUSSCHLIESSLICH als JSON-Array von Objekten",
      '{"term":"…","category":"eigenname|marke|medikament|fachbegriff|abkuerzung"}.',
      "Maximal 40 Einträge, jeder Begriff kurz (1-4 Wörter).",
    ].join(" ");
    const llm = await chatSmart(
      [{ role: "system", content: sys }, { role: "user", content: raw }],
      { temperature: 0.1, maxTokens: 1200, timeoutMs: 45000 },
    );
    if (!llm.ok) return res.status(502).json({ ok: false, error: "llm_" + (llm.reason || "error") });

    let items = [];
    try {
      const m = llm.text.match(/\[[\s\S]*\]/);
      items = JSON.parse(m ? m[0] : llm.text);
    } catch {
      return res.status(502).json({ ok: false, error: "llm_parse" });
    }
    if (!Array.isArray(items)) items = [];

    // Bestehende Begriffe laden (Dedup ueber normalisierten Term).
    const existing = new Set();
    const cur = await vocabCol(actor.clientId).get().catch(() => null);
    if (cur) cur.forEach((doc) => existing.add(normText(doc.data()?.term)));

    const nowMs = Date.now();
    const batch = admin.firestore().batch();
    const added = [];
    for (const it of items.slice(0, 40)) {
      const term = String(it?.term || "").trim().slice(0, 80);
      if (!term || term.length < 2) continue;
      const norm = normText(term);
      if (!norm || existing.has(norm)) continue;
      existing.add(norm);
      const category = String(it?.category || "fachbegriff").toLowerCase().slice(0, 20);
      const ref = vocabCol(actor.clientId).doc();
      batch.set(ref, {
        id: ref.id, term, display: term, norm, aliases: [], category,
        status: "candidate", source,
        attempts: 0, recognizedOk: 0, samples: 0,
        lastMisrecognition: "", lastHeardAtMs: 0, createdAtMs: nowMs,
      });
      added.push({ id: ref.id, term, category, status: "candidate" });
    }
    if (added.length) await batch.commit();

    const agg = await loadStats(actor.clientId);
    await recountTerms(actor.clientId, agg);
    agg.badges = computeBadges(agg);
    await statsRef(actor.clientId).set(agg, { merge: true });

    res.set("Cache-Control", "no-store");
    res.json({ ok: true, added: added.length, terms: added, stats: agg });
  } catch (e) {
    log.warn("training.extract_error", { error: String(e?.message || e) });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── POST /training/generate — Uebungssaetze generieren (statt PDF-Upload) ────
// Fachgebiet-Dropdown -> lokales LLM erzeugt vorsprechbare Saetze mit je EINEM
// schweren Begriff im Kontext (Satz > Einzelwort = besseres Trainingssignal).
router.post("/training/generate", async (req, res) => {
  try {
    const actor = await trainingActor(req);
    if (!actor.ok) return res.status(403).json({ ok: false, error: "forbidden" });
    const label = String(req.body?.category || "Zahnmedizin allgemein").slice(0, 80).trim() || "Zahnmedizin allgemein";
    const count = Math.min(12, Math.max(3, Number(req.body?.count || 8) || 8));

    const sys = [
      "Du erstellst deutsche ÜBUNGS-Sätze, mit denen ein Zahnarzt einer",
      "Spracherkennung schwierige Fachbegriffe VORSPRICHT.",
      "Jeder Satz: 6-14 Wörter, natürliche Behandlungs-/Diktatsprache, und enthält",
      "GENAU EINEN schwer zu transkribierenden Begriff (Marke, Medikament,",
      "Fachbegriff, Abkürzung oder Eigenname). KEINE echten Patientennamen.",
      "Antworte AUSSCHLIESSLICH als JSON-Array",
      '[{"sentence":"…","term":"…"}]. Der "term" MUSS wortwörtlich im "sentence"',
      "vorkommen. Keine Dopplungen. Maximal " + count + " Einträge.",
    ].join(" ");
    const llm = await chatSmart(
      [{ role: "system", content: sys }, { role: "user", content: "Fachgebiet: " + label + ". Erzeuge " + count + " Übungssätze." }],
      { temperature: 0.6, maxTokens: 1300, timeoutMs: 60000 },
    );
    if (!llm.ok) return res.status(502).json({ ok: false, error: "llm_" + (llm.reason || "error") });

    let items = [];
    try {
      const m = llm.text.match(/\[[\s\S]*\]/);
      items = JSON.parse(m ? m[0] : llm.text);
    } catch {
      return res.status(502).json({ ok: false, error: "llm_parse" });
    }
    if (!Array.isArray(items)) items = [];

    const existing = new Set();
    const cur = await vocabCol(actor.clientId).get().catch(() => null);
    if (cur) cur.forEach((doc) => existing.add(normText(doc.data()?.term)));

    const nowMs = Date.now();
    const batch = admin.firestore().batch();
    const added = [];
    for (const it of items.slice(0, count)) {
      const term = String(it?.term || "").trim().slice(0, 80);
      const sentence = String(it?.sentence || "").trim().slice(0, 200);
      if (!term || term.length < 2 || !sentence) continue;
      // Sicherheit: der Begriff muss wirklich im Satz stehen (sonst unbrauchbar).
      if (!normText(sentence).includes(normText(term))) continue;
      const norm = normText(term);
      if (!norm || existing.has(norm)) continue;
      existing.add(norm);
      const ref = vocabCol(actor.clientId).doc();
      batch.set(ref, {
        id: ref.id, term, display: term, norm, aliases: [], category: "generiert",
        promptSentence: sentence, status: "candidate", source: "generated",
        attempts: 0, recognizedOk: 0, samples: 0,
        lastMisrecognition: "", lastHeardAtMs: 0, createdAtMs: nowMs,
      });
      added.push({ id: ref.id, term, promptSentence: sentence, status: "candidate" });
    }
    if (added.length) await batch.commit();

    const agg = await loadStats(actor.clientId);
    await recountTerms(actor.clientId, agg);
    agg.badges = computeBadges(agg);
    await statsRef(actor.clientId).set(agg, { merge: true });

    res.set("Cache-Control", "no-store");
    res.json({ ok: true, added: added.length, terms: added, stats: agg });
  } catch (e) {
    log.warn("training.generate_error", { error: String(e?.message || e) });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── GET /training/terms — Liste + Statistik ─────────────────────────────────
router.get("/training/terms", async (req, res) => {
  try {
    const actor = await trainingActor(req);
    if (!actor.ok) return res.status(403).json({ ok: false, error: "forbidden" });
    const snap = await vocabCol(actor.clientId).get();
    const terms = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.status === "retired") return;
      terms.push({
        id: doc.id, term: d.term, category: d.category || "fachbegriff",
        status: d.status || "candidate", attempts: Number(d.attempts || 0),
        recognizedOk: Number(d.recognizedOk || 0), samples: Number(d.samples || 0),
        lastMisrecognition: d.lastMisrecognition || "",
        promptSentence: d.promptSentence || "",
      });
    });
    terms.sort((a, b) => {
      const rank = (s) => (s === "hard" ? 0 : s === "candidate" ? 1 : 2);
      return rank(a.status) - rank(b.status) || String(a.term).localeCompare(b.term, "de");
    });
    const agg = await loadStats(actor.clientId);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, terms, stats: { ...agg, levelTitle: levelTitle(agg.level) } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── POST /training/term — Begriff manuell anlegen/aendern ────────────────────
router.post("/training/term", async (req, res) => {
  try {
    const actor = await trainingActor(req);
    if (!actor.ok) return res.status(403).json({ ok: false, error: "forbidden" });
    const term = String(req.body?.term || "").trim().slice(0, 80);
    if (!term || term.length < 2) return res.status(400).json({ ok: false, error: "bad_term" });
    const category = String(req.body?.category || "fachbegriff").toLowerCase().slice(0, 20);
    const norm = normText(term);
    // Dedup: existiert der normalisierte Begriff schon?
    const dup = await vocabCol(actor.clientId).where("norm", "==", norm).limit(1).get().catch(() => null);
    if (dup && !dup.empty) {
      return res.json({ ok: true, id: dup.docs[0].id, term, duplicate: true });
    }
    const ref = vocabCol(actor.clientId).doc();
    await ref.set({
      id: ref.id, term, display: term, norm, aliases: [], category,
      status: "candidate", source: "manual",
      attempts: 0, recognizedOk: 0, samples: 0,
      lastMisrecognition: "", lastHeardAtMs: 0, createdAtMs: Date.now(),
    });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, id: ref.id, term });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── POST /training/term-delete — Begriff stilllegen (retire) ─────────────────
router.post("/training/term-delete", async (req, res) => {
  try {
    const actor = await trainingActor(req);
    if (!actor.ok) return res.status(403).json({ ok: false, error: "forbidden" });
    const termId = String(req.body?.termId || "").trim();
    if (!ID_RE.test(termId)) return res.status(400).json({ ok: false, error: "bad_id" });
    await vocabCol(actor.clientId).doc(termId).set({ status: "retired" }, { merge: true });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// lena_stt /transcribe: rohes int16le/mono/16k PCM -> {ok,text,conf,...}.
async function lenaTranscribe(pcm) {
  try {
    const resp = await fetch(`http://127.0.0.1:${LENA_STT_PORT}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: pcm,
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: !!data?.ok, text: String(data?.text || ""), conf: Number(data?.conf || 0), reason: data?.reason || "" };
  } catch (e) {
    return { ok: false, text: "", conf: 0, reason: "unreachable" };
  }
}

// ── POST /training/attempt — Aufnahme bewerten + Korpus sammeln ──────────────
router.post("/training/attempt", async (req, res) => {
  try {
    const actor = await trainingActor(req);
    if (!actor.ok) return res.status(403).json({ ok: false, error: "forbidden" });
    const termId = String(req.body?.termId || "").trim();
    if (!ID_RE.test(termId)) return res.status(400).json({ ok: false, error: "bad_id" });
    const termSnap = await vocabCol(actor.clientId).doc(termId).get();
    if (!termSnap.exists) return res.status(404).json({ ok: false, error: "term_not_found" });
    const termDoc = termSnap.data() || {};
    const target = String(termDoc.term || "");

    const sampleRate = Number(req.body?.sampleRate || 16000) || 16000;
    const b64 = String(req.body?.pcm16 || "");
    let pcm = null;
    if (b64) {
      try { pcm = Buffer.from(b64, "base64"); } catch { pcm = null; }
    }
    // Erkanntes: entweder mitgeliefert, oder wir transkribieren das PCM selbst.
    let recognized = String(req.body?.recognizedText || "").trim();
    let conf = Number(req.body?.conf || 0);
    if (!recognized && pcm && pcm.length > 32) {
      const tr = await lenaTranscribe(pcm);
      recognized = tr.text;
      conf = tr.conf;
    }

    const ok = isMatch(target, recognized);
    const nowMs = Date.now();
    const durationMs = pcm ? Math.round((pcm.length / 2) / (sampleRate / 1000)) : 0;

    // Audio als WAV in den Trainingskorpus (Storage), Metadaten nach Firestore.
    let audioPath = "";
    const sampleRef = samplesCol(actor.clientId).doc();
    if (pcm && pcm.length > 32) {
      audioPath = `clients/${actor.clientId}/lena-training/${sampleRef.id}.wav`;
      try {
        await admin.storage().bucket().file(audioPath).save(pcmToWav(pcm, sampleRate), {
          contentType: "audio/wav",
          resumable: false,
          metadata: { metadata: { clientId: actor.clientId, termId, term: target } },
        });
      } catch (e) {
        log.warn("training.audio_store_failed", { error: String(e?.message || e) });
        audioPath = "";
      }
    }
    await sampleRef.set({
      id: sampleRef.id, termId, term: target,
      targetText: target, recognizedText: recognized, ok, conf,
      audioPath, durationMs, sampleRate,
      speaker: actor.speaker, createdAtMs: nowMs,
    });

    // Begriff-Status + Zaehler.
    const attempts = Number(termDoc.attempts || 0) + 1;
    const recognizedOk = Number(termDoc.recognizedOk || 0) + (ok ? 1 : 0);
    const samples = Number(termDoc.samples || 0) + (audioPath ? 1 : 0);
    await vocabCol(actor.clientId).doc(termId).set({
      status: ok ? "confirmed" : "hard",
      attempts, recognizedOk, samples,
      lastMisrecognition: ok ? "" : (recognized || termDoc.lastMisrecognition || ""),
      lastHeardAtMs: nowMs,
    }, { merge: true });

    // Gamification aktualisieren.
    const agg = await loadStats(actor.clientId);
    const prevLevel = levelForXp(agg.xp);
    agg.xp += ok ? XP_OK : XP_TEACH;
    if (audioPath) agg.samples += 1;
    const today = berlinDay(nowMs);
    agg.streakDays = nextStreak(agg.streakDays, agg.lastTrainingDay, today);
    agg.lastTrainingDay = today;
    agg.level = levelForXp(agg.xp);
    await recountTerms(actor.clientId, agg);
    const prevBadges = new Set(agg.badges);
    agg.badges = computeBadges(agg);
    const newBadges = agg.badges.filter((x) => !prevBadges.has(x));
    await statsRef(actor.clientId).set(agg, { merge: true });

    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      match: ok,
      recognized,
      target,
      stored: !!audioPath,
      leveledUp: agg.level > prevLevel,
      newBadges,
      stats: { ...agg, levelTitle: levelTitle(agg.level) },
    });
  } catch (e) {
    log.warn("training.attempt_error", { error: String(e?.message || e) });
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── GET /training/stats — nur die Aggregatzahlen (fuer den Spiel-Header) ─────
router.get("/training/stats", async (req, res) => {
  try {
    const actor = await trainingActor(req);
    if (!actor.ok) return res.status(403).json({ ok: false, error: "forbidden" });
    const agg = await loadStats(actor.clientId);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, stats: { ...agg, levelTitle: levelTitle(agg.level) } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ── GET /training/export — bestaetigte Begriffe + reale Korrekturpaare ───────
// Fuer den spaeteren lena_stt-Hotword-/Postkorrektur-Loader (eigene AP T4) und
// das LoRA-Fine-Tuning. Auth: Publish-Token (LENA_STT_PUBLISH_TOKEN) ODER Actor.
router.get("/training/export", async (req, res) => {
  try {
    const want = String(process.env.LENA_STT_PUBLISH_TOKEN || "").trim();
    const got = String(req.get("x-lena-token") || req.query?.token || "").trim();
    const tokenOk = !!(want && got && got === want);
    const clientId = String(req.query?.clientId || "").trim();
    if (!ID_RE.test(clientId)) return res.status(400).json({ ok: false, error: "bad_ids" });
    if (!tokenOk) {
      const actor = await trainingActor(req);
      if (!actor.ok || actor.clientId !== clientId) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
    }
    const snap = await vocabCol(clientId).get();
    const hotwords = [];
    const corrections = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.status === "retired") return;
      hotwords.push(String(d.term || ""));
      // Reale Verhoerung -> deterministische Korrektur (nur wenn eindeutig).
      const mis = normText(d.lastMisrecognition);
      if (d.status === "hard" && mis && mis !== normText(d.term)) {
        corrections.push({ from: d.lastMisrecognition, to: d.term });
      }
    });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, clientId, hotwords: hotwords.filter(Boolean), corrections });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
