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
import { chat } from "../mail/llm.js";
import {
  buildGroundingContext,
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
export async function classifySegments(segs, { timeoutMs = 90000 } = {}) {
  const keyList = TREATMENT_SECTIONS.map((s) => `${s.key} = ${s.title}`).join("; ");
  const numbered = segs
    .map((s, idx) => `[${idx + 1}] (${s.source === "raum" ? "Patient" : s.source === "arzt" ? "Arzt" : "Praxis"}) ${s.text.slice(0, 400)}`)
    .join("\n");

  const messages = [
    {
      role: "system",
      content: [
        "Du klassifizierst Gespraechs-Segmente aus einem (zahn)aerztlichen Behandlungsgespraech.",
        "Ordne JEDES Segment (Nummer i) GENAU EINEM Abschnitts-Key zu und markiere Smalltalk.",
        `Erlaubte Keys: ${keyList}.`,
        "smalltalk=true NUR fuer nicht-behandlungsrelevanten Plausch (Begruessung, Wetter, Urlaub, Termin-Organisation, Verabschiedung).",
        "Alles Klinische/Abrechnungsrelevante ist NIE smalltalk. Bei Smalltalk trotzdem den plausibelsten Key setzen.",
        "Du schreibst NICHTS um, du ordnest nur zu.",
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
 * Karteikarte DETERMINISTISCH aus den klassifizierten ECHTEN Segmenten bauen:
 * Abschnitte in fester Reihenfolge, Original-Wortlaut, Smalltalk aussen vor.
 */
function buildKarteikarte(segs, byId) {
  const bySection = new Map();
  const unclassified = [];
  for (const s of segs) {
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
  return {
    structuredHtml: htmlParts.join("\n").slice(0, 40000),
    structuredText: textParts.join("\n").trim().slice(0, 40000),
  };
}

/**
 * Strukturieren: klassifizieren (lokales LLM), Klassifikation auf die
 * Segment-Dokumente schreiben, Karteikarte deterministisch bauen und unter
 * treatment/main ablegen.
 */
export async function structureTreatment(clientId, locationId, appointmentId, { updatedBy = "mas-lena" } = {}) {
  const segs = await loadSegments(clientId, locationId, appointmentId);
  if (!segs.length) return { ok: false, error: "no_segments" };

  const cls = await classifySegments(segs);
  if (!cls.ok) return { ok: false, error: cls.reason || "llm" };

  // Klassifikation als Anzeige-Metadaten auf die Segmente schreiben.
  const batch = admin.firestore().batch();
  const segCol = apptRef(clientId, locationId, appointmentId).collection("dictations");
  for (const [id, meta] of cls.byId.entries()) {
    batch.set(segCol.doc(id), { section: meta.section, smalltalk: meta.smalltalk }, { merge: true });
  }
  await batch.commit();

  const karte = buildKarteikarte(segs, cls.byId);
  const treatmentRef = apptRef(clientId, locationId, appointmentId).collection("treatment").doc("main");
  await treatmentRef.set({
    structuredHtml: karte.structuredHtml,
    structuredText: karte.structuredText,
    segmentsCount: segs.length,
    sectionsMeta: TREATMENT_SECTIONS,
    classifiedCount: cls.byId.size,
    model: `local:${cls.model || "qwen"}`,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy,
  }, { merge: true });

  return {
    ok: true,
    structuredHtml: karte.structuredHtml,
    structuredText: karte.structuredText,
    segmentsCount: segs.length,
    classifiedCount: cls.byId.size,
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
  const treatmentSnap = await treatmentRef.get();
  let basis = typeof treatmentSnap.data()?.structuredText === "string" ? treatmentSnap.data().structuredText : "";
  if (!basis) {
    const segs = await loadSegments(clientId, locationId, appointmentId);
    basis = segs.filter((s) => !s.smalltalk).map((s) => s.text).join("\n");
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
        'Antworte NUR mit JSON: {"bema":[{"code":"","label":"","note":""}],"bemaPlus":[],"goz":[],"suggestions":"","completeness":[]}',
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

  await treatmentRef.set({
    billing,
    billingSystem: "all",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy,
  }, { merge: true });

  console.log(`[lena/billing] appt=${appointmentId} quelle=${quelle} jargon=[${grounding.matchedTerms.join(",")}] bema=${billing.bema.length} bemaPlus=${billing.bemaPlus.length} goz=${billing.goz.length}`);
  return { ok: true, billing, quelle };
}
