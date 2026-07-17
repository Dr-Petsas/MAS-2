// Lena — Strukturierung + Abrechnungsvorschlaege LOKAL (11.07.2026)
// ------------------------------------------------------------------
// Ersetzt die OpenAI-Cloud-Functions structureTreatmentNote /
// generateTreatmentBilling der Plattform:
//   - Der OpenAI-Account ist ohne Guthaben (429 insufficient_quota) — der
//     "Strukturieren"-Knopf lieferte deshalb leere Karteikarten.
//   - Patiententexte gehoeren ohnehin NICHT in die Cloud (DSGVO-Linie wie
//     Nadine/Clara): alles laeuft ueber das lokale Qwen (mail/llm.js).
//
// Grundsatz W-LENA-3 (§ 630f BGB): Das LLM KLASSIFIZIERT nur — jedes Segment
// bekommt genau einen Abschnitt + Smalltalk-Flag. Die Karteikarte wird danach
// DETERMINISTISCH aus den ECHTEN Segmenttexten gebaut (kein Umschreiben,
// keine erfundenen Befunde). Abrechnungsziffern werden gegen den Katalog
// validiert; ohne LLM greift die deterministische Jargon/Ketten-Expansion.

import admin from "../firebase.js";
import { chat, strongLlm } from "../mail/llm.js";
import { inventsNumbers } from "../clara/summarize.js";
import { writeTreatmentSummaryEvent } from "../clara/treatmentDoc.js";
import {
  buildGroundingContext,
  enrichCodesWithEvidence,
  expandBillingFromText,
  validateCatalogCodes,
} from "./billingKnowledge.js";

// MUSS mit LENA_SECTIONS im Frontend uebereinstimmen
// (docgendaweb/src/services/treatmentDictationService.ts).
export const TREATMENT_SECTIONS = [
  { key: "anamnese", title: "Anamnese / Vorgeschichte", color: "#e7e9ec" },
  { key: "befund", title: "Befund", color: "#f2c94c" },
  { key: "diagnose", title: "Diagnose", color: "#f2994a" },
  { key: "aufklaerung", title: "Besprechung / Aufklärung", color: "#eb5757" },
  { key: "vorbereitung", title: "Vorbereitung (Anästhesie / Kofferdam)", color: "#9b51e0" },
  { key: "behandlung", title: "Behandlung", color: "#2f80ed" },
  { key: "nebenleistung", title: "Nebenleistungen / Material", color: "#2fb8c6" },
  { key: "nachsorge", title: "Nachsorge / Empfehlung", color: "#27ae60" },
  { key: "procedere", title: "Procedere / Plan", color: "#4b4b4b" },
];
const SECTION_KEYS = new Set(TREATMENT_SECTIONS.map((s) => s.key));
const MAX_SEGMENTS = 200;

function apptRef(clientId, locationId, appointmentId) {
  return admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(appointmentId);
}

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* weiter */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* weiter */ }
  }
  return null;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Deterministischer Junk-/Test-Filter (fachneutral) — Befund Chef 11.07.:
// "du musst endlich filtern, der Quatsch muss raus". Der LLM-Smalltalk-Flag
// allein ist zu flaky/langsam; Zaehlen, Mikrofontests, Ausrufe und Rollenspiel
// bleiben stehen. Diese Funktion markiert GANZ SICHEREN Muell OHNE LLM als
// Smalltalk. Konservativ (§ 630f, "im Zweifel kein Smalltalk"): es greift nur
// bei (a) reinen Zahlen/Zeichen, (b) reinen Zahlwort-Segmenten oder (c) einer
// eindeutigen Test-/Ausruf-Phrase OHNE jeglichen klinischen Wortstamm. Klinik
// wie "Zahn 36 Implantation" oder "Faktor 3,5 Augmentat" faellt nie durch.
const _NUMBER_WORDS = new Set([
  "null", "eins", "ein", "eine", "einen", "zwei", "drei", "vier", "fuenf", "fünf",
  "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwoelf", "zwölf", "polizei",
]);

// Test-/Ausruf-Phrasen, die in echter Behandlungsdoku praktisch nie vorkommen.
const _NOISE_RE = /(ich bin der (arzt|patient|doktor)|ich bin da|wer bist du|was (willst du|soll das)|kannst du.*klappern|klappern|klapp?halten|ich muss (das|es) testen|telefonapparat|\bpolizei\b|\bhilfe\b|thank you|you'?re done|you are done|jetzt haben wir ruhig)/i;

// Klinischer Anker (fachneutrale Wortstaemme): ist EINER da, ist es NIE Junk.
const _CLINICAL_RE = /(zahn|regio|position\s*\d|implant|krone|br(ü|ue)cke|f(ü|ue)llung|extrakt|osteo|wurzel|endo|karies|an(ä|ae)sth|infiltrat|leitung|befund|diagnos|r(ö|oe)ntgen|paro|prophyl|pzr|augment|argumentat|transplantat|schraub|naht|schmerz|faktor|goz|bema|\bmg\b|\bml\b)/i;

/** Sicherer, deterministischer Muell (ohne LLM als Smalltalk zu markieren). */
export function isJunkSegment(text) {
  const raw = String(text || "").trim();
  if (!raw) return true;
  if (_CLINICAL_RE.test(raw)) return false; // klinischer Anker -> nie Junk
  const letters = raw.toLowerCase().replace(/[^a-zäöüß]/g, "");
  // (a) fast keine Buchstaben -> reine Zahlen/Zeichen ("12. 34.", "1911 1213")
  if (letters.length < 3) return true;
  const words = raw.toLowerCase().replace(/[^a-zäöüß0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  // (b) nur Ziffern + Zahlwoerter ("drei vier", "eins zwei drei", "1 2 Polizei")
  const contentWords = words.filter((w) => !/^\d+$/.test(w) && !_NUMBER_WORDS.has(w));
  if (words.length && contentWords.length === 0) return true;
  // (c) eindeutige Test-/Ausruf-Phrase ohne klinischen Anker
  if (_NOISE_RE.test(raw)) return true;
  return false;
}

/** Nicht gestrichene Segmente des Termins in Diktier-Reihenfolge. */
async function loadSegments(clientId, locationId, appointmentId) {
  const snap = await apptRef(clientId, locationId, appointmentId)
    .collection("dictations")
    .orderBy("createdAt", "asc")
    .limit(MAX_SEGMENTS)
    .get();
  const segs = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    if (d.struck === true) return;
    const t = typeof d.text === "string" ? d.text.trim() : "";
    if (t) {
      segs.push({
        id: doc.id,
        text: t,
        source: typeof d.source === "string" ? d.source : "",
        section: typeof d.section === "string" ? d.section : "",
        smalltalk: d.smalltalk === true,
        // "classified" = Smalltalk-Flag wurde schon einmal gesetzt (auch false).
        // Die Auto-Klassifikation fasst nur unklassifizierte Segmente an.
        classified: typeof d.smalltalk === "boolean",
      });
    }
  });
  return segs;
}

/**
 * Klassifikation per lokalem LLM: jedes Segment -> genau ein Abschnitts-Key +
 * Smalltalk-Flag. Antwort-JSON: {"classify":[{"i":1,"section":"befund","smalltalk":false}, ...]}
 * (exportiert fuer Tests — kein Firestore noetig)
 */
function speakerLabel(source) {
  const s = String(source || "").toLowerCase();
  if (s === "raum" || s === "patient") return "Patient";
  if (s === "arzt") return "Arzt";
  if (s === "nachdiktat") return "Nachdiktat";
  return "Praxis";
}

export async function classifySegments(segs, { timeoutMs = 90000 } = {}) {
  const keyList = TREATMENT_SECTIONS.map((s) => `${s.key} = ${s.title}`).join("; ");
  const numbered = segs
    .map((s, idx) => `[${idx + 1}] (${speakerLabel(s.source)}) ${s.text.slice(0, 400)}`)
    .join("\n");

  const messages = [
    {
      role: "system",
      content: [
        "Du klassifizierst Gespraechs-Segmente aus einem (zahn)aerztlichen Behandlungsgespraech.",
        "Ordne JEDES Segment (Nummer i) GENAU EINEM Abschnitts-Key zu und markiere Smalltalk.",
        `Erlaubte Keys: ${keyList}.`,
        "Ziel der Zusammenfassung: NUR medizinisch/abrechnungsrelevant. Alles andere = smalltalk=true.",
        "smalltalk=true fuer: Begruessung, Verabschiedung, Wetter, Urlaub, Familie, Spielzeug/Tiere,",
        "Sport, Privatplausch, Mikrofon-/Geraetetests, reine Hoerfehler ohne Klinikbezug, Termin-Organisation ohne Behandlung.",
        "Alles Klinische/Abrechnungsrelevante ist NIE smalltalk (Befund, Schmerzen, Zahne, Material, Ziffern).",
        "Bei Smalltalk trotzdem den plausibelsten Key setzen. Du schreibst NICHTS um, du ordnest nur zu.",
        'Antworte NUR mit JSON: {"classify":[{"i":1,"section":"befund","smalltalk":false}, ...]} — genau ein Eintrag pro Segment.',
      ].join("\n"),
    },
    { role: "user", content: `Segmente (${segs.length}):\n${numbered}` },
  ];

  const maxTokens = Math.min(3000, 200 + segs.length * 28);
  const res = await chat(messages, { temperature: 0, maxTokens, timeoutMs });
  if (!res.ok) return { ok: false, reason: res.reason || "llm" };

  const parsed = extractJson(res.text);
  if (!parsed || !Array.isArray(parsed.classify)) return { ok: false, reason: "llm_bad_json" };

  const byId = new Map();
  for (const c of parsed.classify) {
    const i = typeof c?.i === "number" ? c.i : parseInt(c?.i, 10);
    if (!Number.isFinite(i) || i < 1 || i > segs.length) continue;
    const seg = segs[i - 1];
    const section = typeof c?.section === "string" && SECTION_KEYS.has(c.section) ? c.section : "";
    byId.set(seg.id, { section, smalltalk: c?.smalltalk === true });
  }
  if (byId.size === 0) return { ok: false, reason: "llm_no_classify" };
  return { ok: true, byId, model: res.model };
}

/**
 * Smalltalk-ONLY-Klassifikation (Auto-Lauf waehrend/nach dem Diktat, 11.07.2026):
 * Die Struktur-Ansicht ist abgeschafft (Chef) — was bleibt, ist das Rauskuerzen
 * medizinisch belangloser Inhalte im Dialog. Diese schlanke Variante fragt das
 * lokale LLM NUR nach Smalltalk-Indizes; Antwort: {"smalltalk":[2,5]}.
 * (exportiert fuer Tests — kein Firestore noetig)
 */
export async function classifySmalltalk(segs, { timeoutMs = 60000 } = {}) {
  const numbered = segs
    .map((s, idx) => `[${idx + 1}] (${speakerLabel(s.source)}) ${s.text.slice(0, 300)}`)
    .join("\n");
  const messages = [
    {
      role: "system",
      content: [
        "Du pruefst Gespraechs-Segmente aus einem (zahn)aerztlichen Behandlungsgespraech.",
        "Nenne die Nummern der Segmente, die REINER Smalltalk sind: Begruessung, Verabschiedung, Wetter, Urlaub, Kaffee, Familie, Spielzeug, Sport, Privatplausch, Geraete-/Mikrofontest, Organisatorisches ohne Behandlungsbezug.",
        "NIE Smalltalk: alles Klinische (Befund, Diagnose, Behandlung, Schmerzen, Medikamente, Aufklaerung, Material) und alles Abrechnungsrelevante (Ziffern, Faktor, privat/Kasse).",
        "Im Zweifel: KEIN Smalltalk (lieber zu viel Doku als zu wenig).",
        'Antworte NUR mit JSON: {"smalltalk":[1,4]} — leere Liste, wenn nichts Smalltalk ist.',
      ].join("\n"),
    },
    { role: "user", content: `Segmente (${segs.length}):\n${numbered}` },
  ];
  const res = await chat(messages, { temperature: 0, maxTokens: 300, timeoutMs });
  if (!res.ok) return { ok: false, reason: res.reason || "llm" };
  const parsed = extractJson(res.text);
  if (!parsed || !Array.isArray(parsed.smalltalk)) return { ok: false, reason: "llm_bad_json" };
  const idx = new Set(
    parsed.smalltalk
      .map((v) => (typeof v === "number" ? v : parseInt(v, 10)))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= segs.length),
  );
  const byId = new Map();
  segs.forEach((s, i) => byId.set(s.id, idx.has(i + 1)));
  return { ok: true, byId, model: res.model };
}

/**
 * Auto-Smalltalk: alle noch UNKLASSIFIZIERTEN Segmente des Termins pruefen und
 * das Smalltalk-Flag (true/false) auf die Segment-Dokumente schreiben. Bereits
 * klassifizierte Segmente werden nie umgeflaggt (manuelle Sichtung bleibt).
 */
export async function flagSmalltalk(clientId, locationId, appointmentId) {
  const segs = await loadSegments(clientId, locationId, appointmentId);
  if (!segs.length) return { ok: true, classified: 0, smalltalk: 0 };

  const segCol = apptRef(clientId, locationId, appointmentId).collection("dictations");
  const batch = admin.firestore().batch();
  let writes = 0;
  let smalltalkCount = 0;
  let classifiedCount = 0;

  // 1) Deterministischer Junk zuerst — reiner Muell (Zaehlen, Mikrofontest,
  //    Ausrufe) wird IMMER gefiltert, auch wenn das LLM ausfaellt/verfehlt UND
  //    auch, wenn ein FRUEHERER Lauf ihn faelschlich als "kein Smalltalk"
  //    markiert hat (Vorfall 11.07.: Junk blieb in der bereinigten Box stehen).
  const rest = [];
  for (const s of segs) {
    if (isJunkSegment(s.text)) {
      smalltalkCount += 1;
      if (!s.smalltalk) { batch.set(segCol.doc(s.id), { smalltalk: true }, { merge: true }); writes += 1; classifiedCount += 1; }
    } else if (!s.classified) {
      rest.push(s);
    }
  }

  // 2) Den unklaren Rest (noch nie geprueft) bekommt das LLM (Kontext-Smalltalk:
  //    Wetter, Urlaub …). Faellt es aus, bleibt der Rest unklassifiziert.
  let llmModel = "";
  if (rest.length) {
    const cls = await classifySmalltalk(rest);
    if (cls.ok) {
      llmModel = cls.model || "";
      for (const [id, ist] of cls.byId.entries()) {
        if (ist) smalltalkCount += 1;
        classifiedCount += 1;
        batch.set(segCol.doc(id), { smalltalk: ist }, { merge: true });
        writes += 1;
      }
    } else if (writes === 0) {
      // Nichts zu schreiben (kein Junk korrigiert) UND LLM tot -> ehrlicher Fehler.
      return { ok: false, error: cls.reason || "llm" };
    }
  }

  if (writes) await batch.commit();
  console.log(`[lena/smalltalk] appt=${appointmentId} neu-klassifiziert=${classifiedCount} smalltalk-gesamt=${smalltalkCount} (llm=${llmModel || "uebersprungen/aus"})`);
  return { ok: true, classified: classifiedCount, smalltalk: smalltalkCount };
}

/**
 * Karteikarte DETERMINISTISCH aus den klassifizierten ECHTEN Segmenten bauen:
 * Abschnitte in fester Reihenfolge, Original-Wortlaut, Smalltalk/Junk aussen vor.
 * Nachdiktat wird NICHT klassifiziert — immer wortwoertlich angehaengt.
 */
function buildKarteikarte(conversationSegs, byId, nachdiktatSegs = []) {
  const bySection = new Map();
  const unclassified = [];
  for (const s of conversationSegs) {
    if (isJunkSegment(s.text)) continue;
    const meta = byId.get(s.id) || { section: s.section, smalltalk: s.smalltalk };
    if (meta.smalltalk) continue;
    const key = meta.section && SECTION_KEYS.has(meta.section) ? meta.section : "";
    if (!key) { unclassified.push(s); continue; }
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(s);
  }

  const htmlParts = [];
  const textParts = [];
  for (const sec of TREATMENT_SECTIONS) {
    const list = bySection.get(sec.key);
    if (!list || !list.length) continue;
    htmlParts.push(`<h4>${escapeHtml(sec.title)}</h4>`);
    htmlParts.push(`<ul>${list.map((s) => `<li>${escapeHtml(s.text)}</li>`).join("")}</ul>`);
    textParts.push(sec.title.toUpperCase());
    for (const s of list) textParts.push(`- ${s.text}`);
    textParts.push("");
  }
  if (unclassified.length) {
    htmlParts.push("<h4>Weitere Angaben</h4>");
    htmlParts.push(`<ul>${unclassified.map((s) => `<li>${escapeHtml(s.text)}</li>`).join("")}</ul>`);
    textParts.push("WEITERE ANGABEN");
    for (const s of unclassified) textParts.push(`- ${s.text}`);
  }
  // Nachdiktat: wortwoertlich, kein Smalltalk-Filter, eigene Sektion.
  const nd = (nachdiktatSegs || []).filter((s) => String(s.text || "").trim());
  if (nd.length) {
    htmlParts.push("<h4>Nachdiktat</h4>");
    htmlParts.push(`<ul>${nd.map((s) => `<li>${escapeHtml(s.text)}</li>`).join("")}</ul>`);
    textParts.push("NACHDIKTAT");
    for (const s of nd) textParts.push(`- ${s.text}`);
  }
  return {
    structuredHtml: htmlParts.join("\n").slice(0, 40000),
    structuredText: textParts.join("\n").trim().slice(0, 40000),
  };
}

// ---------------------------------------------------------------------------
// Dialog-Zusammenfassung (W-LENA-6, 17.07.2026, Chef): Die Anzeige-/PDF-
// Zusammenfassung behaelt das Arzt-Patient-GESPRAECHSSCHEMA (kein anonymer
// Fliesstext, keine Klinik-Abschnitte). Smalltalk/Junk faellt raus (wie bei der
// Karteikarte), der Rest wird als "Arzt:"/"Patient:"-Dialog aufbereitet und
// vom STARKEN 5090-Modell (qwen3.6) leicht bereinigt (STT-Hoerfehler geglaettet,
// Fuellsel raus). Nachdiktat bleibt wortwoertlich. § 630f: nur Politur, keine
// erfundenen Befunde/Zaehne/Ziffern (Zahlen-Waechter + Fallback).
// ---------------------------------------------------------------------------

/** Sprecher-Praefix fuer die Dialogzeile (Arzt vs Patient/Raum). */
function dialogueSpeaker(source) {
  return String(source || "").toLowerCase() === "arzt" ? "Arzt" : "Patient";
}

/**
 * Deterministischer Dialog-Entwurf aus den ECHTEN Gespraechs-Segmenten:
 * Smalltalk/Junk raus, Reihenfolge erhalten, aufeinanderfolgende gleiche
 * Sprecher zusammengezogen. Das ist zugleich der Fallback, wenn das LLM
 * ausfaellt. (exportiert fuer Tests)
 */
export function buildDialogueDraft(conversationSegs, byId) {
  const turns = [];
  for (const s of conversationSegs || []) {
    const text = String(s.text || "").trim();
    if (!text) continue;
    if (isJunkSegment(text)) continue;
    const meta = (byId && byId.get(s.id)) || { smalltalk: s.smalltalk };
    if (meta.smalltalk) continue;
    const speaker = dialogueSpeaker(s.source);
    const last = turns[turns.length - 1];
    if (last && last.speaker === speaker) last.text += " " + text;
    else turns.push({ speaker, text });
  }
  return turns.map((t) => `${t.speaker}: ${t.text}`).join("\n");
}

/** Nachdiktat wortwoertlich als eigener Block. */
function nachdiktatBlock(nachdiktatSegs) {
  const nd = (nachdiktatSegs || [])
    .map((s) => String(s.text || "").trim())
    .filter(Boolean);
  if (!nd.length) return "";
  return "NACHDIKTAT\n" + nd.map((t) => `- ${t}`).join("\n");
}

/**
 * Dialog-Politur durch das starke 5090-Modell (qwen3.6). Behaelt das
 * Arzt-Patient-Schema strikt bei, glaettet nur offensichtliche STT-Fehler und
 * streicht Fuellsel. Bei jedem Zweifel (LLM aus/leer, erfundene Zahlen) faellt
 * der Aufrufer auf den deterministischen Draft zurueck. (exportiert fuer Tests)
 *
 * @param {string} draft  Deterministischer Arzt/Patient-Dialog (Quelle der Wahrheit).
 * @returns {Promise<{ok:boolean, text:string, reason?:string, model?:string}>}
 */
export async function polishDialogueSummary(draft, { timeoutMs = 90000 } = {}) {
  const src = String(draft || "").trim();
  if (src.length < 40) return { ok: false, text: "", reason: "too_short" };

  const s = strongLlm();
  const messages = [
    {
      role: "system",
      content: [
        "Du bereinigst das Transkript eines (zahn)aerztlichen Behandlungsgespraechs.",
        "BEHALTE das Gespraechsschema strikt bei: jede Zeile beginnt mit 'Arzt:' oder 'Patient:'.",
        "Fasse NICHT zu Fliesstext zusammen und erfinde KEINE Abschnittsueberschriften.",
        "Erlaubt: offensichtliche Spracherkennungs-Fehler glaetten, Fuellwoerter/Wiederholungen/abgebrochene Silben entfernen, Zeichensetzung korrigieren.",
        "VERBOTEN: Inhalte erfinden oder hinzufuegen — keine Befunde, Zaehne, Regionen, Mengen, Ziffern, Medikamente oder Diagnosen, die nicht dastehen.",
        "Aendere KEINE Zahlen, Zahnnummern oder Abrechnungsziffern.",
        "Streiche Zeilen, die reiner Smalltalk oder Geraetetests sind, nur wenn eindeutig; im Zweifel behalten.",
        "Antworte NUR mit dem bereinigten Dialog, nichts davor oder danach.",
      ].join("\n"),
    },
    { role: "user", content: src.slice(0, 12000) },
  ];

  const res = await chat(messages, {
    temperature: 0.1,
    maxTokens: 2000,
    timeoutMs,
    baseUrl: s.base,
    model: s.model,
  });
  if (!res.ok) return { ok: false, text: "", reason: res.reason || "llm" };

  let text = String(res.text || "").trim();
  if (text.length < 20) return { ok: false, text: "", reason: "empty" };
  // Anti-Erfindung: keine Ziffernfolge, die im Quell-Dialog fehlt.
  if (inventsNumbers(text, src)) return { ok: false, text: "", reason: "guard_numbers" };
  // Schema-Wache: es muss weiter ein Sprecher-Dialog sein.
  if (!/^\s*(Arzt|Patient)\s*:/im.test(text)) return { ok: false, text: "", reason: "guard_schema" };
  return { ok: true, text, model: res.model };
}

/**
 * Strukturieren: klassifizieren (lokales LLM), Klassifikation auf die
 * Segment-Dokumente schreiben, Karteikarte deterministisch bauen und unter
 * treatment/main ablegen.
 * Nachdiktat bleibt wortwoertlich; aus dem Arzt-Patient-Gespraech nur Klinik.
 */
export async function structureTreatment(clientId, locationId, appointmentId, { updatedBy = "mas-lena" } = {}) {
  const segs = await loadSegments(clientId, locationId, appointmentId);
  if (!segs.length) return { ok: false, error: "no_segments" };

  const nachdiktatSegs = segs.filter((s) => String(s.source || "").toLowerCase() === "nachdiktat");
  const conversationSegs = segs.filter((s) => String(s.source || "").toLowerCase() !== "nachdiktat");
  if (!conversationSegs.length && !nachdiktatSegs.length) return { ok: false, error: "no_segments" };

  const byId = new Map();
  let llmModel = "";
  if (conversationSegs.length) {
    const cls = await classifySegments(conversationSegs);
    if (!cls.ok) return { ok: false, error: cls.reason || "llm" };
    llmModel = cls.model || "";
    for (const [id, meta] of cls.byId.entries()) byId.set(id, meta);
  }

  // Deterministischer Junk immer als Smalltalk — auch wenn das LLM ihn verfehlt.
  for (const s of conversationSegs) {
    if (!isJunkSegment(s.text)) continue;
    const prev = byId.get(s.id) || { section: s.section || "befund", smalltalk: false };
    byId.set(s.id, { section: prev.section || "befund", smalltalk: true });
  }

  const batch = admin.firestore().batch();
  const segCol = apptRef(clientId, locationId, appointmentId).collection("dictations");
  for (const [id, meta] of byId.entries()) {
    batch.set(segCol.doc(id), { section: meta.section, smalltalk: meta.smalltalk }, { merge: true });
  }
  // Nachdiktat: nie als Smalltalk markieren (wortwoertlich fuer Akte).
  for (const s of nachdiktatSegs) {
    batch.set(segCol.doc(s.id), { smalltalk: false, section: "nachdiktat" }, { merge: true });
  }
  await batch.commit();

  // Abschnitts-HTML bleibt die interne/Desktop-Karteikarte (Bullets aus den
  // Originalsegmenten, § 630f). Die ANZEIGE-Zusammenfassung (structuredText)
  // wird der bereinigte Arzt-Patient-Dialog.
  const karte = buildKarteikarte(conversationSegs, byId, nachdiktatSegs);

  const dialogueDraft = buildDialogueDraft(conversationSegs, byId);
  let dialogueBody = dialogueDraft;
  let strongModel = "";
  if (dialogueDraft) {
    const polished = await polishDialogueSummary(dialogueDraft);
    if (polished.ok) {
      dialogueBody = polished.text;
      strongModel = polished.model || "";
    } else {
      console.log(`[lena/structure] appt=${appointmentId} Dialog-Politur uebersprungen (${polished.reason}) -> Fallback-Draft`);
    }
  }
  const ndBlock = nachdiktatBlock(nachdiktatSegs);
  const structuredText = [dialogueBody, ndBlock].filter(Boolean).join("\n\n").trim().slice(0, 40000)
    || karte.structuredText;

  const treatmentRef = apptRef(clientId, locationId, appointmentId).collection("treatment").doc("main");
  await treatmentRef.set({
    structuredHtml: karte.structuredHtml,
    structuredText,
    segmentsCount: segs.length,
    sectionsMeta: TREATMENT_SECTIONS,
    classifiedCount: byId.size,
    model: `local:${llmModel || "qwen"}${strongModel ? `+strong:${strongModel}` : ""}`,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy,
  }, { merge: true });

  // Zusammenfassung ins geteilte Praxisgedaechtnis (lena_doc) — auffindbar in
  // der MAS-Suche + im Patienten-Dossier fuer alle (Nadine/Lisa/Bianca lesen aus
  // demselben Speicher). Best-effort, blockiert die Antwort nicht bei Fehler.
  await writeTreatmentSummaryEvent(clientId, { locationId, appointmentId, structuredText });

  return {
    ok: true,
    structuredHtml: karte.structuredHtml,
    structuredText,
    segmentsCount: segs.length,
    classifiedCount: byId.size,
  };
}

/**
 * Abrechnungsvorschlaege (BEMA / BEMA+ / GOZ) aus der Doku: lokales LLM mit
 * Katalog-Grounding; jede Ziffer wird gegen den Katalog validiert. Faellt das
 * LLM aus oder liefert es nichts Gueltiges, greift die deterministische
 * Jargon/Ketten-Expansion. Ergebnis wird unter treatment/main.billing gemerkt.
 */
export async function billTreatment(clientId, locationId, appointmentId, { updatedBy = "mas-lena" } = {}) {
  const treatmentRef = apptRef(clientId, locationId, appointmentId).collection("treatment").doc("main");
  // Basis sind IMMER die echten Segmente (ohne Smalltalk/Gestrichenes) — eine
  // alte strukturierte Karteikarte darf neue Diktate nicht verschatten. Die
  // Struktur-Ansicht ist abgeschafft; structuredText bleibt nur Notnagel fuer
  // Alt-Termine ganz ohne Segmente.
  const segs = await loadSegments(clientId, locationId, appointmentId);
  // Junk (Zaehlen/Tests/Ausrufe) fliegt IMMER raus — auch wenn das Smalltalk-
  // Flag (noch) nicht/falsch gesetzt ist. So bekommt die Abrechnung nie Muell.
  let basis = segs.filter((s) => !s.smalltalk && !isJunkSegment(s.text)).map((s) => s.text).join("\n");
  if (!basis) {
    const treatmentSnap = await treatmentRef.get();
    basis = typeof treatmentSnap.data()?.structuredText === "string" ? treatmentSnap.data().structuredText : "";
  }
  basis = String(basis || "").trim();
  if (!basis) return { ok: false, error: "no_content" };

  const grounding = buildGroundingContext(basis);

  const messages = [
    {
      role: "system",
      content: [
        "Du bist ein praeziser zahnmedizinischer Abrechnungsassistent fuer eine Praxis in Deutschland.",
        "Erzeuge Abrechnungs-VORSCHLAEGE nach BEMA, BEMA+ und GOZ.",
        "BEMA = gesetzliche Kassenleistung, GOZ = Privatleistung, BEMA+ = BEMA mit ergaenzenden Zusatzpositionen (Ziffern aus dem BEMA-Katalog).",
        "Verstehe den Praxisjargon (z. B. 'x' = Extraktion, 'I' = Infiltrationsanaesthesie, 'L' = Leitungsanaesthesie).",
        "WICHTIG: Verwende AUSSCHLIESSLICH Ziffern aus den unten gelisteten zulaessigen Positionen. Erfinde KEINE Ziffern.",
        "Leite die Positionen ausschliesslich aus dem dokumentierten Behandlungstext ab; erfinde KEINE Leistungen.",
        "REGEL IMPLIZITE ANAESTHESIE: Bei Extraktion, Osteotomie, Implantation, Wurzelbehandlung, Fuellung oder PAR-Chirurgie ohne explizit ausgeschlossene Anaesthesie schlage Infiltration (BEMA 40 / GOZ 0090) oder Leitung (BEMA 41a / GOZ 0100) passend mit an (note: 'implizit, nicht diktiert').",
        "Beachte die Bezugseinheit (je Zahn/Kanal/Flaeche): bei mehreren Einheiten die Position entsprechend mehrfach ansetzen (im note vermerken).",
        "Positionen, die der Text NICHT eindeutig belegt, gehoeren NICHT in die Listen, sondern als Rueckfrage in 'completeness'.",
        "Fuer JEDE Position: 'evidence' = die WOERTLICHE Textstelle aus der Doku, die diese Ziffer belegt (kurzes Zitat, max. ein Satz; bei impliziter Anaesthesie leer lassen).",
        "Fuer JEDE Position: 'tooth' = der konkrete Zahn bzw. die Region aus der Doku (z. B. 'Zahn 36' oder 'Regio 48'); wenn nicht genannt, leer lassen.",
        'Antworte NUR mit JSON: {"bema":[{"code":"","label":"","note":"","evidence":"","tooth":""}],"bemaPlus":[],"goz":[],"suggestions":"","completeness":[]}',
        "suggestions: kurzer deutscher Hinweistext. completeness: konkrete Rueckfragen (z. B. 'Anzahl der Kanaele erfasst?').",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Behandlungsdokumentation:",
        "",
        basis.slice(0, 9000),
        "",
        "----------------------------------------",
        grounding.context.slice(0, 14000),
      ].join("\n"),
    },
  ];

  let billing = null;
  let quelle = "llm";
  try {
    const res = await chat(messages, { temperature: 0, maxTokens: 1400, timeoutMs: 90000 });
    if (res.ok) {
      const parsed = extractJson(res.text) || {};
      const bema = validateCatalogCodes("bema", parsed.bema);
      const goz = validateCatalogCodes("goz", parsed.goz);
      if (bema.length + goz.length > 0) {
        billing = {
          bema,
          bemaPlus: validateCatalogCodes("bema", parsed.bemaPlus),
          goz,
          suggestions: typeof parsed.suggestions === "string" ? parsed.suggestions.slice(0, 4000) : "",
          completeness: Array.isArray(parsed.completeness)
            ? parsed.completeness.filter((s) => typeof s === "string" && s).slice(0, 20)
            : [],
          disclaimer: "Unverbindliche KI-Vorschläge (lokal) – keine rechtsverbindliche Abrechnung.",
          generatedAt: Date.now(),
        };
      }
    }
  } catch { /* unten deterministisch */ }

  if (!billing) {
    quelle = "deterministisch";
    const expanded = expandBillingFromText(basis);
    billing = {
      bema: expanded.bema,
      bemaPlus: [],
      goz: expanded.goz,
      suggestions: expanded.suggestions.slice(0, 4000),
      completeness: expanded.completeness,
      disclaimer: "KI-Vorschläge v1.0 (deterministisch, Jargon+Ketten) – bitte klinisch prüfen.",
      generatedAt: Date.now(),
    };
  }

  // Beleg (Link zur Textstelle) + Zahnangabe deterministisch nachtragen —
  // unabhaengig davon, ob LLM oder Fallback die Ziffern lieferte.
  billing.bema = enrichCodesWithEvidence(billing.bema, basis);
  billing.bemaPlus = enrichCodesWithEvidence(billing.bemaPlus, basis);
  billing.goz = enrichCodesWithEvidence(billing.goz, basis);

  await treatmentRef.set({
    billing,
    billingSystem: "all",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy,
  }, { merge: true });

  console.log(`[lena/billing] appt=${appointmentId} quelle=${quelle} jargon=[${grounding.matchedTerms.join(",")}] bema=${billing.bema.length} bemaPlus=${billing.bemaPlus.length} goz=${billing.goz.length}`);
  return { ok: true, billing, quelle };
}
