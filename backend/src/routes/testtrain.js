// Test & Training (/testtrain/*): LLM-Testlaeufe, Plattform-Runs, Duo-Gespraeche.
// Mechanischer W1.2-Split aus server.js (04.07.2026): Pfade und Handler
// byte-identisch uebernommen, nur app. -> router. Kein Verhalten geaendert.
import express from "express";
import { assertAppEnabled } from "../entitlements.js";
import { queryRecent } from "../brain/eventStore.js";
import { listRuns, getRun, startRun, cancelRun, runStatus, catalogInfo } from "../testtrain/runner.js";
import { listPlatformRuns, getPlatformRun, startPlatformRun, cancelPlatformRun, platformRunStatus, PLATFORM_GROUPS } from "../testtrain/platformRunner.js";
import { startDuoRun, cancelDuoRun, duoRunStatus, listDuoRuns, getDuoRun, streamDuoAudio, streamDuoTurnAudio } from "../testtrain/duo.js";
import { resolveClientId } from "./_shared.js";

const router = express.Router();


// ============================================================================
// Test & Train — Superuser-Cockpit fuer die Clara-Testsuite + Gespraechs-Review.
//
// Die Testlaeufe (Python, F:\Clara-Voice\testsuite) laufen auf DIESER Maschine;
// die Endpunkte hier sind die Bruecke fuer das Superuser-UI. Lessons/Prompt-
// Versionen (der "Train"-Teil) nutzen die bestehenden /brain/lessons- und
// /brain/prompt-Routen — Test & Train ergaenzt nur Runs + Gespraechs-Sicht.
//
// Zugriff: NUR Superuser (oder Service-Token/Dev) — Testlaeufe belegen GPU
// und Ollama, das darf kein Praxis-Account ausloesen koennen.
// ============================================================================

function requireSuperuser(req, res) {
  const a = req.auth || {};
  if (a.kind === "user" && !a.superUser) {
    res.status(403).json({ error: "superuser_only" });
    return false;
  }
  return true;
}


// Historische Testlaeufe (kompakte Zusammenfassungen, neueste zuerst).
router.get("/testtrain/runs", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    res.json({ ok: true, runs: listRuns({ limit: Number(req.query?.limit) || 50 }), catalog: catalogInfo() });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Ein Lauf im Detail (alle Faelle inkl. Fails/Antworten).
router.get("/testtrain/runs/:file", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const run = getRun(req.params.file);
    if (!run) return res.status(404).json({ error: "run_not_found" });
    res.json({ ok: true, ...run });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Neuen Lauf starten. Body: { model?, stt?, tts?, limit?, noAudio?, noDialogs?, ids? }
router.post("/testtrain/runs", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const by = req.auth?.kind === "user" ? req.auth.userId || "Superuser" : "Service";
    const out = startRun(req.body || {}, { by });
    if (!out.ok) return res.status(409).json(out);
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Status des aktiven Laufs (+ Log-Tail fuer die Live-Konsole im UI).
router.get("/testtrain/status", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  res.json({ ok: true, ...runStatus() });
});


// Aktiven Lauf abbrechen.
router.post("/testtrain/cancel", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  const out = cancelRun();
  if (!out.ok) return res.status(409).json(out);
  res.json(out);
});


// --- Plattform-Testsuite (Cloud Functions, Apps, Landingpages, Browser) ---

// Historische Plattform-Laeufe + Gruppen-Katalog.
router.get("/testtrain/platform/runs", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    res.json({ ok: true, runs: listPlatformRuns({ limit: Number(req.query?.limit) || 50 }), groups: PLATFORM_GROUPS });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Ein Plattform-Lauf im Detail (alle Checks + Markdown-Report mit Agent-Briefing).
router.get("/testtrain/platform/runs/:file", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const run = getPlatformRun(req.params.file);
    if (!run) return res.status(404).json({ error: "run_not_found" });
    res.json({ ok: true, ...run });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Plattform-Lauf starten. Body: { groups?: string[], noBrowser?: boolean,
// smsNumber?: string } — smsNumber ist die Handynummer des Testers fuer den
// SMS-Check dieses Laufs (leer = SMS-Check wird uebersprungen).
router.post("/testtrain/platform/runs", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const by = req.auth?.kind === "user" ? req.auth.userId || "Superuser" : "Service";
    const out = startPlatformRun({ ...(req.body || {}), trigger: "ui" }, { by });
    if (!out.ok) return res.status(409).json(out);
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.get("/testtrain/platform/status", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  res.json({ ok: true, ...platformRunStatus() });
});


router.post("/testtrain/platform/cancel", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  const out = cancelPlatformRun();
  if (!out.ok) return res.status(409).json(out);
  res.json(out);
});


// --- Gespraechssimulation: Doktor-LLM ↔ Clara (echte Pipeline, LIVE-Daten) ---

// Simulation starten. Body: { turns?: number, noAudio?: boolean, langs?: string[] }
// langs = Fremdsprachen-Zuege des Doktors (z. B. ["en","fr","es"]) fuer die
// Realtime-Verkaufsdemo - Clara folgt der Sprache ueber die Produktions-Pipeline.
router.post("/testtrain/duo/start", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const by = req.auth?.kind === "user" ? req.auth.userId || "Superuser" : "Service";
    const out = startDuoRun(req.body || {}, { by });
    if (!out.ok) return res.status(409).json(out);
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Live-Status inkl. der bisher gesprochenen Zuege (UI pollt alle 2 s).
router.get("/testtrain/duo/status", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  res.json({ ok: true, ...duoRunStatus() });
});


router.post("/testtrain/duo/cancel", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  const out = cancelDuoRun();
  if (!out.ok) return res.status(409).json(out);
  res.json(out);
});


// Historische Simulationen (neueste zuerst).
router.get("/testtrain/duo/runs", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    res.json({ ok: true, runs: listDuoRuns({ limit: Number(req.query?.limit) || 20 }) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Ein Lauf im Detail (alle Zuege + Audio-Verfuegbarkeit).
router.get("/testtrain/duo/runs/:runId", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  const run = getDuoRun(req.params.runId);
  if (!run) return res.status(404).json({ error: "run_not_found" });
  res.json({ ok: true, ...run });
});


// MP3 eines Laufs streamen (<audio src> im Superuser-Dashboard). Auth laeuft
// hier ueber ?t=<Firebase-ID-Token> (auth.js), weil ein Audio-Element keine
// Header setzen kann.
router.get("/testtrain/duo/audio/:runId", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  if (!streamDuoAudio(req.params.runId, res)) {
    res.status(404).json({ error: "audio_not_found" });
  }
});


// Einzel-Zug-MP3 streamen (Live-Mithoeren waehrend einer laufenden Simulation).
router.get("/testtrain/duo/audio/:runId/:file", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  if (!streamDuoTurnAudio(req.params.runId, req.params.file, res)) {
    res.status(404).json({ error: "audio_not_found" });
  }
});


// Echte Gespraeche (Clara/Bianca/Lisa) der letzten Tage als Review-Liste:
// kompakt, mit Signalen (Abbruch/negativ/Beschwerde) und Prompt-Version-Tag,
// damit Auffaelligkeiten direkt einer Version zuzuordnen sind.
router.get("/testtrain/conversations", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const sinceDays = Math.min(90, Number(req.query?.sinceDays) || 7);
    const events = await queryRecent(clientId, Date.now() - sinceDays * 86400000, 1000);
    const CALL_CHANNELS = new Set(["bianca_call", "clara_voice", "lisa_call", "lisa_outbound"]);
    const conversations = events
      .filter((e) => e.type === "interaction" && CALL_CHANNELS.has(e.channel))
      .map((e) => {
        const sig = e.signals || {};
        const flags = [];
        if (sig.abortedEarly) flags.push("abgebrochen");
        if (sig.sentiment === "negative") flags.push("negativ");
        if (sig.complaintStated) flags.push("beschwerde");
        // ts ist epoch ms; aeltere Events tragen z. T. Firestore-Timestamps in
        // "at" — beides auf eine Zahl normalisieren, damit das UI sortieren kann.
        const rawTs = e.ts ?? e.at ?? e.createdAt ?? 0;
        const at = typeof rawTs === "object" && rawTs
          ? Number(rawTs._seconds || rawTs.seconds || 0) * 1000
          : Number(rawTs) || 0;
        return {
          id: e.id,
          at,
          channel: e.channel,
          direction: e.direction,
          summary: e.summary || "",
          counterparty: e.counterparty?.name || e.counterparty?.kind || "",
          status: e.status || "",
          flags,
          promptVersion: (e.tags || []).find((t) => typeof t === "string" && t.startsWith("pv:")) || null,
        };
      })
      .sort((a, b) => (b.at || 0) - (a.at || 0));
    const flagged = conversations.filter((c) => c.flags.length).length;
    res.json({ ok: true, clientId, sinceDays, count: conversations.length, flagged, conversations });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

export default router;
