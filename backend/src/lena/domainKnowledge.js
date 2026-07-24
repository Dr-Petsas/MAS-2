// Fachrichtungs-Domaenenwissen fuer Lena (Node/MAS) — 24.07.2026.
// ---------------------------------------------------------------------------
// Node/MAS-Spiegel von F:\Lena-Voice\lena_stt\domain_knowledge.py. Beide lesen
// dieselbe Datenstruktur je Fachrichtung aus src/data/knowledge/<spec>.json
// (zahnmedizin, dermatologie, radiologie, orthopaedie ...). Aendert sich das
// Fachwissen, BEIDE Kopien anpassen (lena_stt + MAS).
//
// Nutzung:
//   resolveSpec("Zahnarztpraxis") -> "zahnmedizin"
//   buildLlmContext(spec)         -> Grounding-Text fuer die Qwen-Korrektur.
//   buildHotwords(spec) / buildCorrectionMap(spec) / expandTeeth(phrase)

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, "..", "data", "knowledge");
const DEFAULT_SPEC = (process.env.LENA_STT_SPEC || "zahnmedizin").trim().toLowerCase() || "zahnmedizin";

const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

let indexCache = null; // { byKey: {key->path}, alias: {aliasnorm->key} }
const kbCache = new Map(); // spec -> kb

function buildIndex(forceReload = false) {
  if (indexCache && !forceReload) return indexCache;
  const byKey = {};
  const alias = {};
  try {
    if (existsSync(KNOWLEDGE_DIR)) {
      for (const f of readdirSync(KNOWLEDGE_DIR).filter((x) => x.endsWith(".json")).sort()) {
        const fp = path.join(KNOWLEDGE_DIR, f);
        let meta = {};
        try { meta = (JSON.parse(readFileSync(fp, "utf8")) || {}).meta || {}; } catch { continue; }
        const key = String(meta.fachrichtung || path.basename(f, ".json")).trim().toLowerCase();
        if (!key) continue;
        byKey[key] = fp;
        alias[normKey(key)] = key;
        for (const al of [meta.label || "", ...(meta.aliases || [])]) {
          const n = normKey(al);
          if (n && !(n in alias)) alias[n] = key;
        }
      }
    }
  } catch (e) {
    console.error("[lena/domain] Index-Aufbau fehlgeschlagen:", e?.message || e);
  }
  indexCache = { byKey, alias };
  return indexCache;
}

export function listSpecialties() {
  return Object.keys(buildIndex().byKey).sort();
}

/** Freitext/Label/Key einer Praxis -> KB-Key (Default: DEFAULT_SPEC). */
export function resolveSpec(raw) {
  const { byKey, alias } = buildIndex();
  const n = normKey(raw);
  const fallback = byKey[DEFAULT_SPEC] ? DEFAULT_SPEC : (Object.keys(byKey)[0] || DEFAULT_SPEC);
  if (!n) return fallback;
  if (alias[n]) return alias[n];
  const aliases = Object.keys(alias).sort((a, b) => b.length - a.length);
  for (const a of aliases) if (a.length >= 4 && n.includes(a)) return alias[a];
  return fallback;
}

export function loadKb(spec = DEFAULT_SPEC, forceReload = false) {
  const { byKey } = buildIndex(forceReload);
  const key = byKey[spec] ? spec : resolveSpec(spec);
  if (kbCache.has(key) && !forceReload) return kbCache.get(key);
  const fp = byKey[key] || path.join(KNOWLEDGE_DIR, `${key}.json`);
  let kb = {};
  try {
    if (existsSync(fp)) kb = JSON.parse(readFileSync(fp, "utf8"));
    else console.warn(`[lena/domain] Wissensdatei fehlt: ${fp}`);
  } catch (e) {
    console.error(`[lena/domain] Wissensdatei kaputt: ${fp}`, e?.message || e);
    kb = {};
  }
  kbCache.set(key, kb);
  return kb;
}

/** Gruppen-/Positionswort -> FDI-Zahnliste ("achter" -> [18,28,38,48]). Nur Zahnmedizin. */
export function expandTeeth(phrase) {
  const kb = loadKb("zahnmedizin");
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

/** Kanonische Begriffe (begriffe + Abkuerzungen + Diagnose-Begriffe). */
export function buildHotwords(spec = DEFAULT_SPEC) {
  const kb = loadKb(spec);
  const seen = new Map();
  const add = (w) => {
    const s = String(w || "").trim();
    if (s && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
  };
  for (const b of kb.begriffe || []) add(b);
  for (const ab of kb.abkuerzungen || []) { add(ab.kurz); add(ab.lang); }
  for (const dg of kb.diagnosen || []) add(dg.begriff);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "de"));
}

/** Deterministische alias->kanonisch-Map (Kleinschreibung als Schluessel). */
export function buildCorrectionMap(spec = DEFAULT_SPEC) {
  const kb = loadKb(spec);
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

function renderStrukturiert(blocks, L) {
  for (const b of blocks || []) {
    if (b.titel) L.push(`## ${b.titel}`);
    if (b.erklaerung) L.push(String(b.erklaerung));
    if (b.paare && typeof b.paare === "object") {
      for (const [k, v] of Object.entries(b.paare)) L.push(`- ${k} = ${v}`);
    }
    for (const item of b.liste || []) L.push(`- ${item}`);
    L.push("");
  }
}

/** Kompakter deutscher Grounding-Block fuer die LLM-Korrektur (Qwen 3.6 / 5090). */
export function buildLlmContext(spec = DEFAULT_SPEC, maxChars = 8000) {
  const kb = loadKb(spec);
  const meta = kb.meta || {};
  const label = meta.label || meta.domain || spec;
  const L = [];
  L.push(`# ${String(label).toUpperCase()} — DOMAeNENWISSEN (fuer die Transkript-Korrektur)`, "");

  const fdi = kb.fdi_schema || {};
  if (fdi.erklaerung) {
    L.push("## FDI-Zahnschema", fdi.erklaerung);
    if (fdi.quadranten) L.push("Quadranten: " + Object.entries(fdi.quadranten).map(([k, v]) => `${k}=${v}`).join("; "));
    if (fdi.positionen) L.push("Positionen: " + Object.entries(fdi.positionen).map(([k, v]) => `${k}=${v}`).join("; "));
    if (fdi.namensgruppen) L.push("Gruppen: " + Object.entries(fdi.namensgruppen).map(([n, t]) => `${n} = ${t.join(", ")}`).join("; "));
    if (Array.isArray(fdi.kombinations_grammatik)) { L.push("Ansage-Grammatik:"); for (const r of fdi.kombinations_grammatik) L.push(`- ${r}`); }
    L.push("");
  }
  const fl = kb.flaechen || {};
  if (fl.codes) {
    L.push("## Zahnflaechen");
    L.push("Kuerzel: " + Object.entries(fl.codes).map(([k, v]) => `${k}=${v}`).join("; "));
    if (fl.kombis) L.push("Kombinationen: " + Object.entries(fl.kombis).map(([k, v]) => `${k}=${v}`).join("; "));
    L.push("");
  }

  renderStrukturiert(kb.strukturiert, L);

  if (Array.isArray(kb.abkuerzungen)) { L.push("## Abkuerzungen"); for (const a of kb.abkuerzungen) if (a.kurz) L.push(`- ${a.kurz} = ${a.lang}`); L.push(""); }
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
