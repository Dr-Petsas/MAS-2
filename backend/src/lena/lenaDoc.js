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
import { appendEvent } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";
import {
  buildGroundingContext,
  enrichCodesWithEvidence,
  expandBillingFromText,
  validateCatalogCodes,
} from "./billingKnowledge.js";
import { mergeCrossChannel } from "./crossChannel.js";
import { acceptCorrection, acceptLiveCorrection } from "./garbleCorrect.js";
import {
  llmExtractTemplateFields,
  serializeTemplateFields,
  composeStructuredFromTemplate,
} from "./templateZahn.js";

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

/**
 * Anzuzeigender/weiterzuverarbeitender Text eines Segments: die qwen-Korrektur
 * (`textCorrected`) hat Vorrang, sonst der STT-Rohtext (`text`). Der Rohtext
 * bleibt § 630f-konform IMMER erhalten; hier wird nur ausgewaehlt, was in
 * Klassifikation, Dialog, Karteikarte und Abrechnung landet.
 */
export function segText(s) {
  const c = s && typeof s.textCorrected === "string" ? s.textCorrected.trim() : "";
  return c || String((s && s.text) || "").trim();
}

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
        // qwen-korrigierter Text (falls vorhanden); Roh `text` bleibt Wahrheit.
        textCorrected: typeof d.textCorrected === "string" ? d.textCorrected.trim() : "",
        source: typeof d.source === "string" ? d.source : "",
        section: typeof d.section === "string" ? d.section : "",
        smalltalk: d.smalltalk === true,
        // Absolute Sprech-Zeit (0 = unbekannt/Alt-Segment) fuer den Cross-Channel-Merge.
        startMs: Number(d.startMs) || 0,
        endMs: Number(d.endMs) || 0,
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
    .map((s, idx) => `[${idx + 1}] (${speakerLabel(s.source)}) ${segText(s).slice(0, 400)}`)
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
        "Auch UMGANGSSPRACHLICHE Krankheits-/Befund-Beschreibungen sind klinisch (NIE smalltalk): z. B. 'Loch', 'kaputt', 'abgebrochen', 'wackelt/locker', 'tut weh', 'Nerv', 'Zahnfleischbluten', 'druckt', 'empfindlich'.",
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
    .map((s, idx) => `[${idx + 1}] (${speakerLabel(s.source)}) ${segText(s).slice(0, 300)}`)
    .join("\n");
  const messages = [
    {
      role: "system",
      content: [
        "Du pruefst Gespraechs-Segmente aus einem (zahn)aerztlichen Behandlungsgespraech.",
        "Nenne die Nummern der Segmente, die REINER Smalltalk sind: Begruessung, Verabschiedung, Wetter, Urlaub, Kaffee, Familie, Spielzeug, Sport, Privatplausch, Geraete-/Mikrofontest, Organisatorisches ohne Behandlungsbezug.",
        "NIE Smalltalk: alles Klinische (Befund, Diagnose, Behandlung, Schmerzen, Medikamente, Aufklaerung, Material) und alles Abrechnungsrelevante (Ziffern, Faktor, privat/Kasse).",
        "NIE Smalltalk sind auch umgangssprachliche Befund-Beschreibungen: 'Loch', 'kaputt', 'abgebrochen', 'wackelt/locker', 'tut weh', 'Nerv', 'Zahnfleischbluten', 'empfindlich'.",
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
    if (isJunkSegment(segText(s))) continue;
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
    htmlParts.push(`<ul>${list.map((s) => `<li>${escapeHtml(segText(s))}</li>`).join("")}</ul>`);
    textParts.push(sec.title.toUpperCase());
    for (const s of list) textParts.push(`- ${segText(s)}`);
    textParts.push("");
  }
  if (unclassified.length) {
    htmlParts.push("<h4>Weitere Angaben</h4>");
    htmlParts.push(`<ul>${unclassified.map((s) => `<li>${escapeHtml(segText(s))}</li>`).join("")}</ul>`);
    textParts.push("WEITERE ANGABEN");
    for (const s of unclassified) textParts.push(`- ${segText(s)}`);
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
    const text = segText(s);
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
        "Erlaubt: umgangssprachliche zahnmedizinische Umschreibungen dezent in die Fachsprache heben, WENN der Sinn eindeutig ist. Beispiele: 'Loch'->'karioese Stelle', 'kaputt'/'abgebrochen'->'defekt'/'frakturiert', 'wackelt'/'locker'->'gelockert', 'Nerv'->'Pulpa (Zahnnerv)', 'Zahnfleischbluten'->'Zahnfleischbluten', 'tut weh'/'Aua'->'Schmerzen', 'Zahnstein'->'Zahnstein/Konkremente', 'Zahnspange'->'kieferorthopaedische Apparatur'.",
        "Dabei die AUSSAGE und SICHERHEIT unveraendert lassen (keine neue Diagnose/Gewissheit); nur die Fassung des Behandlers heben, Patienten-Schilderungen bleiben Schilderungen; im Zweifel die Original-Formulierung behalten.",
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

// ---------------------------------------------------------------------------
// Fachbegriff-Korrektur (W-LENA-7, 17.07./21.07./25.07.2026): STT-Rohtext
// (Conformer, ggf. Parakeet-Hybrid) geht an qwen3.6, das NUR offensichtliche Spracherkennungs-
// Verhoerer glaettet — v. a. Fachbegriffe ("Barottis"->"Parotis"). § 630f:
// Roh-Wortlaut bleibt als `text`, Korrektur nur als `textCorrected`.
// acceptCorrection() verwirft Erfindungen. Notaus: LENA_LLM_CORRECT=0.
// ---------------------------------------------------------------------------

/**
 * Glaettet Fachbegriff-Verhoerer je Segment mit dem starken 5090-Modell
 * (qwen3.6). Kontext der Nachbarzeilen hilft bei der Disambiguierung. Gibt eine
 * Map segId -> korrigierter Text zurueck (nur die uebernommenen, guard-geprueft).
 * (exportiert fuer Tests)
 *
 * @param {Array} segs  Gespraechs-Segmente ({id,text,source}), ohne Nachdiktat.
 * @returns {Promise<{ok:boolean, byId:Map, model?:string, reason?:string}>}
 */
export async function correctGarbles(segs, { timeoutMs = 90000, chunk = 40 } = {}) {
  const byId = new Map();
  if (String(process.env.LENA_LLM_CORRECT || "1") === "0") return { ok: false, byId, reason: "disabled" };
  const list = (segs || []).filter((s) => segText(s) && !isJunkSegment(segText(s)));
  if (!list.length) return { ok: true, byId, model: "" };

  const s = strongLlm();
  let model = "";
  let anyOk = false;
  for (let start = 0; start < list.length; start += chunk) {
    const part = list.slice(start, start + chunk);
    const numbered = part
      .map((seg, idx) => `[${idx + 1}] (${speakerLabel(seg.source)}) ${segText(seg).slice(0, 500)}`)
      .join("\n");
    const messages = [
      {
        role: "system",
        content: [
          "Du korrigierst SPRACHERKENNUNGS-Fehler im Transkript eines (zahn)aerztlichen Behandlungsgespraechs (STT).",
          "Deine EINZIGE Aufgabe: offensichtlich falsch erkannte Woerter — vor allem zahnmedizinische Fachbegriffe — in die korrekte Schreibweise bringen.",
          "Nutze den Gespraechskontext der Nachbarzeilen zur Disambiguierung.",
          "Typische Verhoerer (Beispiele, nicht abschliessend): 'Barottis'/'Barotis'->'Parotis', 'in Blattat'/'Implantart'->'Implantat', 'Hauchzehe'->'Backenzahn', 'Approximat'->'Approximal', 'Karius'->'Karies', 'Paradontose'->'Parodontose', 'Kompositfuellung' korrekt lassen.",
          "STRENG VERBOTEN: Inhalte hinzufuegen, entfernen, umformulieren oder zusammenfassen. Kein Satz wird im Sinn laenger oder kuerzer.",
          "Aendere NIEMALS Zahlen, Zahnnummern, Mengen, Faktoren oder Abrechnungsziffern.",
          "Aendere NICHT den Sprachstil: Umgangssprache des Patienten ('Loch', 'tut weh', 'kaputt') bleibt WOERTLICH stehen — nur echte Verhoerer korrigieren, nicht 'schoener' machen.",
          "Ist eine Zeile bereits korrekt oder der Fehler unklar, gib sie UNVERAENDERT zurueck.",
          'Antworte NUR mit JSON: {"fix":[{"i":1,"text":"korrigierte Zeile OHNE Sprecher-Praefix"}, ...]} — genau ein Eintrag pro Segment, gleiche Reihenfolge.',
        ].join("\n"),
      },
      { role: "user", content: `Segmente (${part.length}):\n${numbered}` },
    ];
    let res;
    try {
      res = await chat(messages, {
        temperature: 0,
        maxTokens: Math.min(3500, 300 + part.length * 60),
        timeoutMs,
        baseUrl: s.base,
        model: s.model,
      });
    } catch { continue; }
    if (!res || !res.ok) continue;
    const parsed = extractJson(res.text);
    if (!parsed || !Array.isArray(parsed.fix)) continue;
    anyOk = true;
    model = res.model || model;
    for (const c of parsed.fix) {
      const i = typeof c?.i === "number" ? c.i : parseInt(c?.i, 10);
      if (!Number.isFinite(i) || i < 1 || i > part.length) continue;
      const seg = part[i - 1];
      const fixed = typeof c?.text === "string" ? c.text.trim() : "";
      if (acceptCorrection(segText(seg), fixed)) byId.set(seg.id, fixed);
    }
  }
  return { ok: anyOk, byId, model };
}

// ---------------------------------------------------------------------------
// Bench-Korrektur (Chef 24.07.2026, "overwrite"): die Lena-Doku transkribiert
// jetzt EXAKT wie der Conformer-Bench (stt.pickadoc-tunnel.com). qwen3.6 (5090)
// bereinigt pro Segment LIVE: Fachbegriffe kontextuell, korrekte Gross-/
// Kleinschreibung, Zahnbezeichnungen im FDI-Format ("drei sechs"->"36"),
// Messwerte als Ziffern, Selbstkorrektur/Versprecher aufgeloest. Der Roh-Text
// bleibt als `text` erhalten (verstecktes Backup), angezeigt wird `textCorrected`.
// Notaus: LENA_LLM_CORRECT=0. Guard: acceptLiveCorrection (erlaubt Ziffern).
// ---------------------------------------------------------------------------

const _BENCH_CORRECT_SYSTEM = [
  "Du bist Korrektor fuer deutschsprachige zahnaerztliche/medizinische Diktate",
  "(Spracherkennung am Behandlungsstuhl). Du bekommst EIN Roh-Segment und gibst",
  "NUR die bereinigte Fassung zurueck.",
  "Regeln:",
  "- Korrigiere offensichtliche Erkennungsfehler und Fachbegriffe sinngemaess aus",
  "  dem Kontext (z. B. 'hapikale paronditis' -> 'apikale Parodontitis', 'lenthin'",
  "  -> 'Dentin', 'fossa kannina' -> 'Fossa canina', 'Barottis' -> 'Parotis').",
  "- Korrekte deutsche Gross-/Kleinschreibung und sinnvolle Zeichensetzung.",
  "- Gesprochene Zahnbezeichnungen ins FDI-Format als ZWEISTELLIGE Zahl:",
  "  'drei sechs' -> '36', 'zwei vier' -> '24', 'vier fuenf' -> '45'.",
  "- Gesprochene Zahlen und Messwerte als Ziffern: 'sechs Millimeter' -> '6 mm'.",
  "- SELBSTKORREKTUREN/VERSPRECHER AUFLOESEN: Korrigiert sich der Sprecher",
  "  ('drei sechs, aeh nein, vier sechs', 'also nicht 36 sondern 46', 'streich das',",
  "  'ich meinte', 'Quatsch'), gib NUR die zuletzt gemeinte Fassung wieder und",
  "  entferne das Zurueckgenommene samt Fuellwoertern (aeh, aehm, halt, quasi).",
  "- ERFINDE NICHTS: keine zusaetzlichen Befunde, Zaehne, Werte oder Woerter, die",
  "  nicht gesagt wurden (ausser der Aufloesung einer Selbstkorrektur). Im Zweifel",
  "  nah am Original bleiben.",
  "- Antworte AUSSCHLIESSLICH mit dem korrigierten Text. Keine Anfuehrungszeichen,",
  "  keine Erklaerung, kein Vorspann.",
].join("\n");

/**
 * Live-Korrektur EINES Segments mit dem Bench-Prompt (qwen3.6 auf dem 5090).
 * Kontextzeilen (vorherige Segmente) helfen bei der Disambiguierung. Gibt den
 * korrigierten Text zurueck (guard-geprueft) oder ok:false.
 * (exportiert fuer Tests)
 *
 * @param {string} text          STT-Rohtext des Segments.
 * @param {string[]} contextLines vorherige (Roh-)Segmente zur Orientierung.
 * @returns {Promise<{ok:boolean, text:string, model?:string, reason?:string}>}
 */
export async function correctSegmentLive(text, contextLines = [], { timeoutMs = 30000 } = {}) {
  if (String(process.env.LENA_LLM_CORRECT || "1") === "0") return { ok: false, text: "", reason: "disabled" };
  const raw = String(text || "").trim();
  if (!raw || isJunkSegment(raw)) return { ok: false, text: "", reason: "empty" };
  const ctx = (contextLines || []).map((x) => String(x || "").trim()).filter(Boolean).slice(-5).join("\n");
  const s = strongLlm();
  const messages = [
    { role: "system", content: _BENCH_CORRECT_SYSTEM },
    {
      role: "user",
      content: (ctx ? `Bisheriger Kontext (nur zur Orientierung, NICHT mit ausgeben):\n${ctx}\n\n` : "")
        + `Zu korrigierendes Segment:\n${raw}`,
    },
  ];
  let res;
  try {
    res = await chat(messages, { temperature: 0.2, maxTokens: 400, timeoutMs, baseUrl: s.base, model: s.model });
  } catch (e) {
    return { ok: false, text: "", reason: "llm_throw" };
  }
  if (!res || !res.ok) return { ok: false, text: "", reason: res?.reason || "llm" };
  const out = String(res.text || "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (!acceptLiveCorrection(raw, out)) return { ok: false, text: "", reason: "guard" };
  return { ok: true, text: out, model: res.model };
}

// ---------------------------------------------------------------------------
// Live-Themen-Trennung (Chef 26.07.2026): qwen3.6 ordnet JEDES Segment live
// GENAU EINER Doku-Box zu, damit anamnestische/diagnostische Inhalte nicht mehr
// pauschal im Befund landen. Der Schluessel wird als `section` neben dem Segment
// gespeichert; das iPad routet danach (Heuristik nur noch als Uebergangs-
// Fallback, bis die Sektion eintrifft). Notaus: LENA_LLM_CLASSIFY=0.
// Box-Keys spiegeln EXAKT die Frontend-Boxen (lena-doku-template-zahn.js).
// ---------------------------------------------------------------------------
export const LIVE_SECTION_KEYS = ["anamnese", "befund", "diagnose", "therapie", "aufklaerung", "procedere"];
const _LIVE_SECTION_SET = new Set(LIVE_SECTION_KEYS);

const _CLASSIFY_SYSTEM = [
  "Du ordnest EIN Segment aus einem zahnaerztlichen Behandlungsgespraech GENAU",
  "EINER Doku-Box zu. Antworte NUR mit dem Box-Schluessel (ein Wort, klein,",
  "ohne Punkt, ohne Erklaerung).",
  "Box-Schluessel:",
  "- anamnese: was der Patient an Vorgeschichte/Beschwerden BERICHTET (seit wann",
  "  Schmerzen, Allergien, Medikamente, Vorerkrankungen, Rauchen/Schwangerschaft,",
  "  'tut seit drei Tagen weh', 'ist beim Kauen empfindlich').",
  "- befund: klinischer Ist-Zustand/Untersuchung (Zahnstatus, Sondierungstiefe,",
  "  Perkussion, Vitalitaet/Kaeltetest, Lockerungsgrad, Roentgenbefund,",
  "  'Zahn 36 kariös', 'insuffiziente Füllung', 'Zahn fehlt').",
  "- diagnose: Beurteilung/Diagnose (Pulpitis, Parodontitis, apikale Parodontitis,",
  "  Caries profunda, Gingivitis).",
  "- therapie: durchgefuehrte Behandlung inkl. Vorbereitung/Material (Anaesthesie,",
  "  Exkavation, Praeparation, Fuellung gelegt, Extraktion, Naht, Ultracain, Krone",
  "  eingesetzt).",
  "- aufklaerung: Aufklaerung/Einwilligung/Risiken besprochen, Patient einverstanden.",
  "- procedere: Plan/naechste Schritte/Empfehlung/Recall/Rezept/Wiedervorstellung.",
  "- none: Smalltalk, Steuerbefehl, Geraetetest, Hoerfehler ohne Klinikbezug.",
  "Gib GENAU einen dieser Schluessel zurueck.",
].join("\n");

/**
 * Live-Klassifikation EINES Segments in eine Doku-Box (qwen3.6, 5090).
 * Kontextzeilen (vorherige Segmente) helfen bei der Zuordnung. Gibt den
 * Box-Schluessel zurueck ("" = none/unsicher -> Heuristik entscheidet).
 * (exportiert fuer Tests)
 *
 * @param {string} text           STT-/korrigierter Text des Segments.
 * @param {string[]} contextLines vorherige Segmente zur Orientierung.
 * @returns {Promise<{ok:boolean, section:string, model?:string, reason?:string}>}
 */
export async function classifySegmentLive(text, contextLines = [], { timeoutMs = 20000 } = {}) {
  if (String(process.env.LENA_LLM_CLASSIFY || "1") === "0") return { ok: false, section: "", reason: "disabled" };
  const raw = String(text || "").trim();
  if (!raw || isJunkSegment(raw)) return { ok: false, section: "", reason: "empty" };
  const ctx = (contextLines || []).map((x) => String(x || "").trim()).filter(Boolean).slice(-4).join("\n");
  const messages = [
    { role: "system", content: _CLASSIFY_SYSTEM },
    {
      role: "user",
      content: (ctx ? `Bisheriger Kontext (nur zur Orientierung):\n${ctx}\n\n` : "")
        + `Zu klassifizierendes Segment:\n${raw}`,
    },
  ];
  let res;
  try {
    res = await chat(messages, { temperature: 0, maxTokens: 12, timeoutMs, baseUrl: strongLlm().base, model: strongLlm().model });
  } catch (e) {
    return { ok: false, section: "", reason: "llm_throw" };
  }
  if (!res || !res.ok) return { ok: false, section: "", reason: res?.reason || "llm" };
  const section = normalizeLiveSection(res.text);
  if (!section) return { ok: false, section: "", reason: "none" };
  return { ok: true, section, model: res.model };
}

/** qwen-Rohantwort -> gueltiger Box-Schluessel oder "" (none/unbekannt). */
export function normalizeLiveSection(out) {
  const t = String(out || "").toLowerCase();
  // Erstes bekanntes Schluesselwort im Text (robust gegen "Box: befund." o.ae.).
  const m = t.match(/anamnese|befund|diagnose|therapie|aufkl(?:ae|ä)rung|procedere/);
  if (!m) return "";
  const hit = m[0].replace("ä", "ae");
  return _LIVE_SECTION_SET.has(hit) ? hit : "";
}

const _REINSCHRIFT_SYSTEM = [
  "Du bist medizinische Schreibkraft in einer Zahnarztpraxis. Du bekommst die der",
  "Reihe nach diktierten Befund-Segmente einer Behandlung (bereits grob korrigiert)",
  "und erzeugst daraus EINE saubere Reinschrift.",
  "Regeln:",
  "- Loese SEGMENTUEBERGREIFENDE Selbstkorrekturen auf: sagt der Sprecher spaeter",
  "  'das war 46, nicht 36', 'streich den letzten Befund', 'Korrektur zu Zahn ...',",
  "  dann korrigiere bzw. entferne den betroffenen FRUEHEREN Eintrag entsprechend.",
  "- Entferne Fehlstarts, Dopplungen und Fuellwoerter (aeh, aehm, halt).",
  "- Behalte JEDEN eigenstaendigen Befund; fasse nur zusammen, was klar",
  "  zusammengehoert. Reihenfolge beibehalten.",
  "- Korrekte Gross-/Kleinschreibung, FDI-Zahnnummern, Ziffern fuer Messwerte,",
  "  Zeichensetzung.",
  "- ERFINDE NICHTS Neues: keine zusaetzlichen Befunde, Zaehne oder Werte.",
  "- Gib NUR die Reinschrift zurueck (kurze Befund-Zeilen, je Befund eine Zeile),",
  "  ohne Ueberschrift, ohne Erklaerung, ohne Nummerierung.",
].join("\n");

/**
 * Gesamt-Reinschrift ueber alle (korrigierten) Segment-Texte: loest auch spaete,
 * SEGMENTUEBERGREIFENDE Selbstkorrekturen auf (Bench-Verhalten beim "Speichern").
 * (exportiert fuer Tests)
 *
 * @param {string[]} segTexts  behaltene Segment-Texte in Diktier-Reihenfolge.
 * @returns {Promise<{ok:boolean, text:string, model?:string, reason?:string}>}
 */
export async function consolidateReinschrift(segTexts, { timeoutMs = 90000 } = {}) {
  if (String(process.env.LENA_LLM_CORRECT || "1") === "0") return { ok: false, text: "", reason: "disabled" };
  const segs = (segTexts || []).map((s) => String(s || "").trim()).filter(Boolean);
  if (!segs.length) return { ok: false, text: "", reason: "empty" };
  const listed = segs.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const s = strongLlm();
  const messages = [
    { role: "system", content: _REINSCHRIFT_SYSTEM },
    { role: "user", content: `Diktierte Segmente (in Reihenfolge):\n${listed}` },
  ];
  let res;
  try {
    res = await chat(messages, { temperature: 0.2, maxTokens: 1400, timeoutMs, baseUrl: s.base, model: s.model });
  } catch (e) {
    return { ok: false, text: "", reason: "llm_throw" };
  }
  if (!res || !res.ok) return { ok: false, text: "", reason: res?.reason || "llm" };
  const out = String(res.text || "").trim();
  if (out.length < 3) return { ok: false, text: "", reason: "empty" };
  return { ok: true, text: out, model: res.model };
}

// ---------------------------------------------------------------------------
// 01-Befund-Reinschrift (Chef 26.07.2026): Der Arzt diktiert die eingehende
// Untersuchung (01) Ziffer fuer Ziffer ins Zahnschema ("vier ... vier ...
// Krone"). Beim UEBERGANG zur Behandlungs-Doku wird der gesammelte 01-Befund
// EINMAL an qwen3.6 geschickt, damit FDI-Zahnnummern (zweistellig) und
// Rechtschreibung stimmen — es gab keinen Verhoerer, nur Politur. Kein
// Erfinden, keine neuen Zaehne/Befunde. Notaus: LENA_LLM_CORRECT=0.
// ---------------------------------------------------------------------------
const _BEFUND01_SYSTEM = [
  "Du bist medizinische Schreibkraft in einer Zahnarztpraxis und erstellst die",
  "Reinschrift der 01-Befundaufnahme (eingehende Untersuchung). Du bekommst die",
  "der Reihe nach diktierten Befund-Segmente und erzeugst daraus EINEN sauberen,",
  "zahnaerztlichen Befund.",
  "Regeln:",
  "- ZAHNNUMMERN: Der Arzt diktiert Zaehne oft Ziffer fuer Ziffer (Quadrant, dann",
  "  Zahn). Paare aufeinanderfolgende Einzelziffern zu FDI-Zahnnummern (zweistellig,",
  "  11–48): 'vier ... vier ... Krone' -> 'Zahn 44: Krone'; 'eins sechs fehlt' ->",
  "  'Zahn 16: fehlt'. Schreibe Zahnnummern IMMER als zweistellige FDI-Ziffern.",
  "- Selbstkorrekturen aufloesen: 'nein, 46' / 'Korrektur zu Zahn ...' -> den",
  "  betroffenen frueheren Eintrag entsprechend anpassen bzw. entfernen.",
  "- Fehlstarts, Dopplungen und Fuellwoerter (aeh, aehm, halt) entfernen.",
  "- Korrekte deutsche Rechtschreibung, Gross-/Kleinschreibung und zahnaerztliche",
  "  Fachbegriffe (Krone, Fuellung, insuffizient, kariös, Wurzelrest, fehlt ...).",
  "- ERFINDE NICHTS: keine zusaetzlichen Zaehne, Befunde oder Werte. Nur was",
  "  diktiert wurde.",
  "- Format: je Zahn/Befund EINE Zeile, wenn moeglich 'Zahn NN: <Befund>'.",
  "  Befunde ohne Zahnbezug als eigene Zeile. Reihenfolge beibehalten.",
  "- Gib NUR die Reinschrift zurueck — ohne Ueberschrift, ohne Nummerierung,",
  "  ohne Erklaerung.",
].join("\n");

/**
 * Reinschrift des gesammelten 01-Befunds beim Uebergang zur Behandlungs-Doku.
 * Einziger LLM-Durchlauf ueber die Befundphase (FDI + Rechtschreibung).
 * (exportiert fuer Tests)
 *
 * @param {string[]} texts  Segment-Texte der 01-Phase in Diktier-Reihenfolge
 *   (bereits korrigierte Fassung bevorzugt).
 * @returns {Promise<{ok:boolean, text:string, model?:string, reason?:string}>}
 */
export async function consolidateBefund01(texts, { timeoutMs = 60000 } = {}) {
  if (String(process.env.LENA_LLM_CORRECT || "1") === "0") return { ok: false, text: "", reason: "disabled" };
  const segs = (texts || []).map((s) => String(s || "").trim()).filter(Boolean);
  if (!segs.length) return { ok: false, text: "", reason: "empty" };
  const listed = segs.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const s = strongLlm();
  const messages = [
    { role: "system", content: _BEFUND01_SYSTEM },
    { role: "user", content: `Diktierte 01-Befund-Segmente (in Reihenfolge):\n${listed}` },
  ];
  let res;
  try {
    res = await chat(messages, { temperature: 0.2, maxTokens: 1200, timeoutMs, baseUrl: s.base, model: s.model });
  } catch (e) {
    return { ok: false, text: "", reason: "llm_throw" };
  }
  if (!res || !res.ok) return { ok: false, text: "", reason: res?.reason || "llm" };
  const out = String(res.text || "").trim();
  if (out.length < 3) return { ok: false, text: "", reason: "empty" };
  return { ok: true, text: out, model: res.model };
}

// ---------------------------------------------------------------------------
// W-LENA-8b/8c: Doku-Template-Felder aus den Segmenten robust per LLM fuellen
// und unter treatment/main.templateFields PERSISTIEREN. Daraus wird 8c der
// template-basierte structuredText + die Abrechnungshinweise abgeleitet (ohne
// Ziffern — Sophie entscheidet), und 8d liest die gewichteten Felder fuer das
// Clara-Briefing. Kein Umschreiben der Akte: llmExtractTemplateFields extrahiert
// nur, mergeTemplateFields ist additiv (geplant bleibt geplant), und der
// Roh-Dialog-structuredText (W-LENA-6) bleibt unangetastet.
// ---------------------------------------------------------------------------

/**
 * Template-Felder eines Termins neu extrahieren (qwen), additiv mergen und unter
 * treatment/main persistieren (templateFields + templateStructuredText +
 * billingHints). Best-effort — der Aufrufer behandelt !ok tolerant.
 *
 * @param {object} opts.segs  optional vorbereitete Segmente (mit textCorrected),
 *   sonst werden sie frisch geladen.
 * @returns {Promise<{ok:boolean, templateFields?:object, structuredText?:string, billingHints?:string[], reason?:string, model?:string}>}
 */
export async function refreshTemplateFields(clientId, locationId, appointmentId, { updatedBy = "mas-lena", segs = null } = {}) {
  const ref = apptRef(clientId, locationId, appointmentId);
  const treatmentRef = ref.collection("treatment").doc("main");
  const [apptSnap, mainSnap] = await Promise.all([ref.get(), treatmentRef.get()]);
  const anlass = apptSnap.exists ? String(apptSnap.data()?.visitMotive?.name || "").trim() : "";

  const allSegs = Array.isArray(segs) ? segs : await loadSegments(clientId, locationId, appointmentId);
  const conversation = allSegs.filter(
    (s) => String(s.source || "").toLowerCase() !== "nachdiktat" && !isJunkSegment(segText(s)),
  );
  const nachdiktatLines = allSegs
    .filter((s) => String(s.source || "").toLowerCase() === "nachdiktat")
    .map((s) => String(s.text || "").trim())
    .filter(Boolean);
  if (!conversation.length && !nachdiktatLines.length) return { ok: false, reason: "no_segments" };

  const existing = mainSnap.exists ? (mainSnap.data()?.templateFields || null) : null;
  const ex = await llmExtractTemplateFields(conversation, { anlass, existing });
  if (!ex.ok) return { ok: false, reason: ex.reason || "llm" };

  const templateFields = serializeTemplateFields(ex.fields, { model: ex.model, updatedBy });
  const composed = composeStructuredFromTemplate(ex.fields, { nachdiktatLines });

  await treatmentRef.set({
    templateFields,
    templateStructuredText: composed.structuredText,
    billingHints: composed.billingHints,
    templateUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy,
  }, { merge: true });

  const filled = Object.values(templateFields.values).filter(Boolean).length;
  console.log(`[lena/template] appt=${appointmentId} felder=${filled} bloecke=[${templateFields.openBlocks.join(",")}] luecken=${templateFields.gapCount} hinweise=${composed.billingHints.length} (model=${ex.model || "qwen"})`);
  return { ok: true, templateFields, structuredText: composed.structuredText, billingHints: composed.billingHints, model: ex.model };
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
  // Cross-Channel-Merge NUR auf dem Gespraech (Zwei-Mikro-Bleed); Nachdiktat ist
  // einkanalig/wortwoertlich und wird nie zusammengefasst. Greift nur bei echten
  // Zeitstempeln -> Alt-Termine ohne Timing bleiben unveraendert.
  const conversationSegs = mergeCrossChannel(
    segs.filter((s) => String(s.source || "").toLowerCase() !== "nachdiktat"),
  );
  if (!conversationSegs.length && !nachdiktatSegs.length) return { ok: false, error: "no_segments" };

  // Fachbegriff-Garble per qwen3.6 glaetten (STT->qwen). Setzt nur
  // `textCorrected` in-memory; der Roh-`text` bleibt unangetastet. Ab hier
  // (Klassifikation, Dialog, Karteikarte) laeuft alles ueber segText().
  let correctModel = "";
  let correctedCount = 0;
  if (conversationSegs.length) {
    // Bench-Korrektur (Chef 24.07.) laeuft schon LIVE pro Segment und legt
    // `textCorrected` ab. Diese Segmente NICHT erneut durch die alte
    // konservative Batch schicken — nur die (noch) unkorrigierten nachziehen.
    const needCorrect = conversationSegs.filter((s) => !String(s.textCorrected || "").trim());
    correctedCount = conversationSegs.length - needCorrect.length;
    if (needCorrect.length) {
      const corr = await correctGarbles(needCorrect);
      if (corr.ok && corr.byId.size) {
        correctModel = corr.model || "";
        for (const seg of needCorrect) {
          const fixed = corr.byId.get(seg.id);
          if (fixed) { seg.textCorrected = fixed; correctedCount += 1; }
        }
      }
    }
  }

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
  // qwen-Korrektur mitschreiben (§ 630f: Roh-`text` bleibt, `textCorrected` daneben).
  for (const seg of conversationSegs) {
    if (seg.textCorrected) batch.set(segCol.doc(seg.id), { textCorrected: seg.textCorrected }, { merge: true });
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
    correctedCount,
    model: `local:${llmModel || "qwen"}${correctModel ? `+correct:${correctModel}` : ""}${strongModel ? `+strong:${strongModel}` : ""}`,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy,
  }, { merge: true });

  // Zusammenfassung ins geteilte Praxisgedaechtnis (lena_doc) — auffindbar in
  // der MAS-Suche + im Patienten-Dossier fuer alle (Nadine/Lisa/Bianca lesen aus
  // demselben Speicher). Best-effort, blockiert die Antwort nicht bei Fehler.
  await writeTreatmentSummaryEvent(clientId, { locationId, appointmentId, structuredText });

  // W-LENA-8b/8c: Template-Felder robust per LLM extrahieren + persistieren
  // (fuer das Clara-Briefing 8d und die Abrechnungshinweise). Nutzt die schon
  // garble-korrigierten Segmente; best-effort — Fehler kippen die Struktur nie.
  let templateFields = null;
  let billingHints = [];
  try {
    const tf = await refreshTemplateFields(clientId, locationId, appointmentId, {
      updatedBy,
      segs: [...conversationSegs, ...nachdiktatSegs],
    });
    if (tf.ok) {
      templateFields = tf.templateFields;
      billingHints = tf.billingHints || [];
    }
  } catch (tfErr) {
    console.warn(`[lena/template] appt=${appointmentId} uebersprungen: ${tfErr?.message || tfErr}`);
  }

  console.log(`[lena/structure] appt=${appointmentId} segmente=${segs.length} klassifiziert=${byId.size} korrigiert=${correctedCount}${correctModel ? ` (correct=${correctModel})` : ""}${strongModel ? ` (dialog=${strongModel})` : ""}${templateFields ? ` template=${templateFields.gapCount}luecken` : ""}`);

  return {
    ok: true,
    structuredHtml: karte.structuredHtml,
    structuredText,
    segmentsCount: segs.length,
    classifiedCount: byId.size,
    correctedCount,
    templateFields,
    billingHints,
  };
}

const DOKU_MEMORY_TAGE = 45;

/**
 * Abschluss eines Lena-Eintrags: Karteikarte + Shared Memory (lena_doc).
 * Wird vom iPad-Button „Speichern“ ausgeloest — nicht waehrend der Live-Aufnahme.
 * Clara kann die Doku danach vorlesen (dictations bleiben fuehrend; Summary-Event
 * macht den Stand auch in MAS-Suche / Praxisgedaechtnis sichtbar).
 */
export async function finalizeTreatmentDoc(
  clientId,
  locationId,
  appointmentId,
  { structuredText: incomingText = "", updatedBy = "mas-lena" } = {},
) {
  const segs = await loadSegments(clientId, locationId, appointmentId);
  const treatmentRef = apptRef(clientId, locationId, appointmentId).collection("treatment").doc("main");
  const mainSnap = await treatmentRef.get();
  const mainData = mainSnap.exists ? (mainSnap.data() || {}) : {};

  let structuredText = String(incomingText || "").trim();
  if (!structuredText) {
    structuredText = String(mainData.structuredText || "").trim();
  }
  if (!structuredText) {
    const clinical = [];
    const nach = [];
    for (const s of segs) {
      if (s.smalltalk || isJunkSegment(segText(s))) continue;
      const line = segText(s);
      if (!line) continue;
      if (String(s.source || "").toLowerCase() === "nachdiktat") nach.push(line);
      else clinical.push(line);
    }
    const parts = [];
    if (clinical.length) parts.push(clinical.join("\n"));
    if (nach.length) parts.push("NACHDIKTAT\n" + nach.map((t) => "- " + t).join("\n"));
    structuredText = parts.join("\n\n").trim();
  }
  if (!structuredText && !segs.length) {
    return { ok: false, error: "no_content" };
  }
  if (!structuredText) {
    structuredText = segs.map((s) => segText(s)).filter(Boolean).join("\n");
  }

  // Reinschrift (Chef 24.07., "overwrite"): qwen3.6 konsolidiert alle behaltenen
  // (bereits korrigierten) Befund-Segmente zu EINER sauberen Fassung und loest
  // SEGMENTUEBERGREIFENDE Selbstkorrekturen auf ("das war 46, nicht 36"). Der
  // korrigierte Text wird der Akteninhalt; die Roh-Segmente bleiben als
  // verstecktes Backup in dictations/*. Nachdiktat bleibt wortwoertlich (kein
  // Konsolidieren). Best-effort — bei Notaus/Fehler bleibt der bisherige Text.
  let reinschrift = "";
  let reinschriftModel = "";
  try {
    const clinicalKept = [];
    const nachKept = [];
    for (const s of segs) {
      if (s.smalltalk || isJunkSegment(segText(s))) continue;
      const line = segText(s);
      if (!line) continue;
      if (String(s.source || "").toLowerCase() === "nachdiktat") nachKept.push(line);
      else clinicalKept.push(line);
    }
    if (clinicalKept.length) {
      const cons = await consolidateReinschrift(clinicalKept);
      if (cons.ok && cons.text) {
        reinschriftModel = cons.model || "";
        const parts = [cons.text.trim()];
        if (nachKept.length) parts.push("NACHDIKTAT\n" + nachKept.map((t) => "- " + t).join("\n"));
        reinschrift = parts.join("\n\n").trim();
      }
    }
  } catch (consErr) {
    console.warn(`[lena/finalize] reinschrift uebersprungen: ${consErr?.message || consErr}`);
  }
  if (reinschrift) structuredText = reinschrift;

  await treatmentRef.set({
    structuredText: structuredText.slice(0, 40000),
    ...(reinschrift ? { reinschrift: reinschrift.slice(0, 40000), reinschriftModel } : {}),
    finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
    finalizedBy: updatedBy,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy,
  }, { merge: true });

  await writeTreatmentSummaryEvent(clientId, {
    locationId, appointmentId, structuredText,
  });

  // Segment-Events erst jetzt ins Praxisgedaechtnis (nicht live waehrend Aufnahme).
  let memorySegments = 0;
  try {
    const apptSnap = await apptRef(clientId, locationId, appointmentId).get();
    const ap = apptSnap.exists ? (apptSnap.data() || {}) : {};
    const subjId = String(ap.patientId || ap.patient?.id || "").trim();
    const subjName = `${ap.patient?.firstName || ""} ${ap.patient?.lastName || ""}`.trim();
    for (const s of segs) {
      const text = String(s.text || "").trim();
      if (!text || !s.id) continue;
      const source = String(s.source || "arzt").slice(0, 20) || "arzt";
      const kurz = text.length > 420 ? text.slice(0, 417) + "..." : text;
      await appendEvent(clientId, {
        id: `lena-doc:${appointmentId}:${s.id}`,
        channel: CHANNELS.LENA_DOC,
        type: EVENT_TYPES.NOTE,
        direction: DIRECTIONS.INTERNAL,
        counterparty: { kind: "system", name: "Lena", ref: null },
        subject: subjId
          ? { patientId: subjId, name: subjName, matchStatus: "matched", matchMethod: "name" }
          : { name: subjName, matchStatus: "unmatched" },
        status: "none",
        summary: `Behandlungsdokumentation (Lena, ${source}): ${kurz}`,
        payloadRef: { kind: "dictation", id: s.id },
        extractor: "lena@finalize",
        tags: ["lena", "dokumentation", "behandlung"],
        expiresAtMs: Date.now() + DOKU_MEMORY_TAGE * 86400000,
      });
      memorySegments += 1;
    }
  } catch (memErr) {
    console.warn(`[lena/finalize] memory segments: ${memErr?.message || memErr}`);
  }

  console.log(
    `[lena/finalize] appt=${appointmentId} chars=${structuredText.length} segs=${segs.length} memory=${memorySegments}`,
  );
  return {
    ok: true,
    structuredText,
    reinschrift: reinschrift || "",
    segmentsCount: segs.length,
    memorySegments,
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
  // Doku-Stand einmal lesen: liefert (a) den structuredText-Notnagel fuer
  // Alt-Termine ohne Segmente und (b) die 8c-Abrechnungshinweise aus dem
  // Template (nur Richtung, keine Ziffern — als Grounding fuer die Ziffern-KI).
  const mainSnap = await treatmentRef.get();
  const mainData = mainSnap.exists ? (mainSnap.data() || {}) : {};
  const billingHints = Array.isArray(mainData.billingHints) ? mainData.billingHints.slice(0, 12) : [];

  // Basis sind IMMER die echten Segmente (ohne Smalltalk/Gestrichenes) — eine
  // alte strukturierte Karteikarte darf neue Diktate nicht verschatten. Die
  // Struktur-Ansicht ist abgeschafft; structuredText bleibt nur Notnagel fuer
  // Alt-Termine ganz ohne Segmente.
  const segs = await loadSegments(clientId, locationId, appointmentId);
  // Junk (Zaehlen/Tests/Ausrufe) fliegt IMMER raus — auch wenn das Smalltalk-
  // Flag (noch) nicht/falsch gesetzt ist. So bekommt die Abrechnung nie Muell.
  let basis = segs.filter((s) => !s.smalltalk && !isJunkSegment(segText(s))).map(segText).join("\n");
  if (!basis) {
    basis = typeof mainData.structuredText === "string" ? mainData.structuredText : "";
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
        ...(billingHints.length
          ? [
            "",
            "----------------------------------------",
            "Hinweise aus dem Doku-Template (nur Richtung/Leistungsgruppe — KEINE Ziffern-Vorgabe, leite Ziffern weiter aus dem Behandlungstext ab):",
            ...billingHints.map((h) => "- " + h),
          ]
          : []),
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

  console.log(`[lena/billing] appt=${appointmentId} quelle=${quelle} jargon=[${grounding.matchedTerms.join(",")}] bema=${billing.bema.length} bemaPlus=${billing.bemaPlus.length} goz=${billing.goz.length} hinweise=${billingHints.length}`);
  return { ok: true, billing, quelle, billingHints };
}
