// Zahnmedizinische Verstehens-/Korrektur-Wissensbasis fuer Lena (24.07.2026).
// ---------------------------------------------------------------------------
// Node/MAS-Spiegel von F:\Lena-Voice\lena_stt\dental_knowledge.py. Beide lesen
// dieselbe Datenstruktur (FDI-Schema, Flaechen, Abkuerzungen, Diagnosen,
// Verhoerungen, Muster, Reasoning). Quelle liegt hier als eigene Kopie unter
// src/data/dental/ — analog zur BEMA/GOZ-Wissensbasis (billingKnowledge.js).
// Aendert sich das Fachwissen, BEIDE Kopien anpassen (lena_stt + MAS).
//
// Nutzung:
//   buildLlmContext()    -> Grounding-Text fuer die Qwen-3.6-Korrektur (5090).
//   buildHotwords()      -> kanonische Begriffe (STT-Bias / Referenz).
//   buildCorrectionMap() -> deterministische alias->kanonisch-Map.
//   expandTeeth("achter")-> FDI-Zahnliste zu einem Gruppenwort.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_PATH = path.join(__dirname, "..", "data", "dental", "dental_knowledge_de.json");

let kbCache = null;

export function loadDentalKb(forceReload = false) {
  if (kbCache && !forceReload) return kbCache;
  try {
    if (!existsSync(KB_PATH)) {
      console.warn(`[lena/dental] Wissensdatei fehlt: ${KB_PATH}`);
      kbCache = {};
      return kbCache;
    }
    kbCache = JSON.parse(readFileSync(KB_PATH, "utf8"));
  } catch (e) {
    console.error(`[lena/dental] Wissensdatei kaputt: ${KB_PATH}`, e?.message || e);
    kbCache = {};
  }
  return kbCache;
}

/** Gruppen-/Positionswort -> FDI-Zahnliste ("achter" -> [18,28,38,48]). */
export function expandTeeth(phrase) {
  const kb = loadDentalKb();
  const fdi = kb.fdi_schema || {};
  const key = String(phrase || "").trim().toLowerCase();
  for (const group of ["namensgruppen", "positionsgruppen"]) {
    const table = fdi[group] || {};
    if (Array.isArray(table[key])) return [...table[key]];
    for (const [name, teeth] of Object.entries(table)) {
      if (key === name || key.replace(/e$/, "") === name.replace(/e$/, "")) return [...teeth];
    }
  }
  return [];
}

/** Kanonische Begriffe (Abkuerzungen lang/kurz + Diagnose-Begriffe). */
export function buildHotwords() {
  const kb = loadDentalKb();
  const seen = new Map();
  const add = (w) => {
    const s = String(w || "").trim();
    if (s && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
  };
  for (const ab of kb.abkuerzungen || []) { add(ab.kurz); add(ab.lang); }
  for (const dg of kb.diagnosen || []) add(dg.begriff);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "de"));
}

/** Deterministische alias->kanonisch-Map (Kleinschreibung als Schluessel). */
export function buildCorrectionMap() {
  const kb = loadDentalKb();
  const m = {};
  for (const v of kb.verhoerungen || []) {
    const f = String(v.falsch || "").trim();
    const r = String(v.richtig || "").trim();
    if (f && r && f.toLowerCase() !== r.toLowerCase()) m[f.toLowerCase()] = r;
  }
  for (const dg of kb.diagnosen || []) {
    const canon = String(dg.begriff || "").trim();
    for (const a of dg.aliases || []) {
      const al = String(a || "").trim();
      if (al && canon && al.toLowerCase() !== canon.toLowerCase() && !(al.toLowerCase() in m)) {
        m[al.toLowerCase()] = canon;
      }
    }
  }
  return m;
}

/**
 * Kompakter deutscher Grounding-Block fuer die LLM-Korrektur (Qwen 3.6 / 5090):
 * FDI-Logik, Flaechen, Abkuerzungen, typische Verhoerungen, Befund-Muster und
 * die Schlussfolgerungs-Regeln. Das ist "wie man vom Verhoerten aufs Gemeinte
 * schliesst" — als System-Kontext fuer den Korrekturassistenten.
 */
export function buildLlmContext(maxChars = 6000) {
  const kb = loadDentalKb();
  const fdi = kb.fdi_schema || {};
  const fl = kb.flaechen || {};
  const L = [];
  L.push("# ZAHNMEDIZINISCHES DOMAeNENWISSEN (fuer die Transkript-Korrektur)", "");
  if (fdi.erklaerung) {
    L.push("## FDI-Zahnschema", fdi.erklaerung);
    if (fdi.quadranten) L.push("Quadranten: " + Object.entries(fdi.quadranten).map(([k, v]) => `${k}=${v}`).join("; "));
    if (fdi.positionen) L.push("Positionen: " + Object.entries(fdi.positionen).map(([k, v]) => `${k}=${v}`).join("; "));
    if (fdi.namensgruppen) L.push("Gruppen: " + Object.entries(fdi.namensgruppen).map(([n, t]) => `${n} = ${t.join(", ")}`).join("; "));
    if (Array.isArray(fdi.kombinations_grammatik)) { L.push("Ansage-Grammatik:"); for (const r of fdi.kombinations_grammatik) L.push(`- ${r}`); }
    L.push("");
  }
  if (fl.codes) {
    L.push("## Zahnflaechen");
    L.push("Kuerzel: " + Object.entries(fl.codes).map(([k, v]) => `${k}=${v}`).join("; "));
    if (fl.kombis) L.push("Kombinationen: " + Object.entries(fl.kombis).map(([k, v]) => `${k}=${v}`).join("; "));
    L.push("");
  }
  if (Array.isArray(kb.abkuerzungen)) { L.push("## Abkuerzungen"); for (const a of kb.abkuerzungen) L.push(`- ${a.kurz} = ${a.lang}`); L.push(""); }
  if (Array.isArray(kb.verhoerungen)) {
    L.push("## Typische Verhoerungen (falsch -> richtig)");
    for (const v of kb.verhoerungen) L.push(`- "${v.falsch}" -> "${v.richtig}"${v.kontext ? `  [${v.kontext}]` : ""}`);
    L.push("");
  }
  if (Array.isArray(kb.diagnosen)) { L.push("## Haeufige Befund-/Diagnose-Begriffe"); for (const d of kb.diagnosen) L.push(`- ${d.begriff}${d.bedeutung ? ` — ${d.bedeutung}` : ""}`); L.push(""); }
  if (Array.isArray(kb.befund_muster)) { L.push("## Befund-Muster"); for (const p of kb.befund_muster) L.push(`- ${p}`); L.push(""); }
  if (Array.isArray(kb.reasoning)) { L.push("## So schliesst du vom Verhoerten aufs Gemeinte"); for (const r of kb.reasoning) L.push(`- ${r}`); }
  let text = L.join("\n");
  if (text.length > maxChars) text = text.slice(0, maxChars - 1).trimEnd() + "…";
  return text;
}
