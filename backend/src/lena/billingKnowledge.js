// Abrechnungs-Wissensbasis fuer Lena (11.07.2026)
// ------------------------------------------------
// JS-Port von docgendaweb/functions/src/services/billingKnowledgeService.ts —
// die Cloud-Function-Variante haengt an OpenAI (Quota tot, DSGVO-Problem bei
// Patiententexten). Lena laeuft deshalb komplett lokal ueber MAS: dieselben
// Katalogdaten (src/data/billing-catalog/*.json), dieselbe Grounding- und
// Validierungslogik, aber das LLM ist das lokale Qwen (mail/llm.js).
//
// Drei Schichten:
//   1. KATALOG    – strukturierte BEMA-/GOZ-Positionen (bema.json / goz.json).
//   2. JARGON     – Praxisjargon -> Begriff + Kandidaten-Ziffern (jargon.json).
//   3. GROUNDING  – Kandidaten + Ketten als LLM-Kontext; das LLM darf NUR
//                   Katalog-Ziffern vorschlagen, eine Validierung filtert den Rest.
// Deterministische Expansion (expandBillingFromText) ist der Fallback ohne LLM.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = path.join(__dirname, "..", "data", "billing-catalog");

let bemaCache = null;
let gozCache = null;
let jargonCache = null;
let rulesCache = null;
let chainsCache = null;

function readJson(filename) {
  const filePath = path.join(CATALOG_DIR, filename);
  try {
    if (!existsSync(filePath)) {
      console.warn(`[lena/billing] Katalogdatei fehlt: ${filePath}`);
      return null;
    }
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`[lena/billing] Katalogdatei kaputt: ${filePath}`, e?.message || e);
    return null;
  }
}

function normalizePositions(raw) {
  const list = raw && Array.isArray(raw.positions) ? raw.positions : [];
  return list
    .filter((p) => p && typeof p.code === "string")
    .map((p) => ({
      code: String(p.code),
      label: typeof p.label === "string" ? p.label : "",
      category: typeof p.category === "string" ? p.category : undefined,
      points: typeof p.points === "number" ? p.points : undefined,
      note: typeof p.note === "string" && p.note ? p.note : undefined,
    }));
}

/** Lowercase + Umlaute/diakritische Vereinfachung fuer robustes Matching. */
function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMatchContext(text) {
  const joined = normalizeText(text);
  return { joined, words: joined.split(" ").filter(Boolean) };
}

/** Wortgrenzen-bewusster Abgleich (Phrasen / Kuerzel / Teilwoerter). */
function needleMatches(ctx, rawNeedle) {
  const needle = normalizeText(rawNeedle);
  if (!needle) return false;
  if (needle.includes(" ")) return ctx.joined.includes(needle);
  if (needle.length <= 3) return ctx.words.includes(needle);
  return ctx.words.some((w) => w.includes(needle));
}

function extractFdiTeeth(text) {
  const found = new Set();
  const re = /\b([1-4][1-8])\b/g;
  let m;
  const norm = normalizeText(text);
  while ((m = re.exec(norm)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 11 && n <= 48) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

function extractUptLetters(ctx) {
  const found = new Set();
  for (const w of ctx.words) {
    const m = /^upt([a-g])$/.exec(w);
    if (m) found.add(m[1]);
  }
  const idx = ctx.joined.indexOf("upt");
  if (idx >= 0) {
    const tail = ctx.joined.slice(idx, idx + 48);
    for (const m of tail.matchAll(/([a-g])/g)) found.add(m[1]);
  }
  return [...found];
}

function putCode(target, system, code, note) {
  if (!code) return;
  const list = system === "bema" ? loadBema() : loadGoz();
  const pos = list.find((p) => p.code === code);
  if (!pos) return;
  const existing = target.get(code);
  const mergedNote = note || existing?.note;
  target.set(code, mergedNote ? { code, label: pos.label, note: mergedNote } : { code, label: pos.label });
}

function pickBemaFromList(codes, ctx) {
  if (!codes.length) return undefined;
  if (ctx.joined.includes("tief frakturiert") && codes.includes("45")) return "45";
  if (ctx.joined.includes("mehrwurzel") && codes.includes("44")) return "44";
  if ((ctx.words.includes("f4") || ctx.joined.includes("mehrflaechig")) && codes.includes("13d")) return "13d";
  if ((ctx.words.includes("f3") || ctx.joined.includes("dreiflaechig")) && codes.includes("13c")) return "13c";
  if ((ctx.words.includes("f2") || ctx.joined.includes("zweiflaechig")) && codes.includes("13b")) return "13b";
  if ((ctx.words.includes("f1") || ctx.joined.includes("einflaechig")) && codes.includes("13a")) return "13a";
  return codes[0];
}

function pickGozFromList(codes, ctx) {
  if (!codes.length) return undefined;
  if (ctx.joined.includes("tief frakturiert") && codes.includes("3020")) return "3020";
  if (ctx.joined.includes("osteotom") || ctx.joined.includes("retiniert") || ctx.joined.includes("verlagert")) {
    if (codes.includes("3040")) return "3040";
    if (codes.includes("3030")) return "3030";
  }
  if (ctx.words.includes("f4") && codes.includes("2120")) return "2120";
  if (ctx.words.includes("f3") && codes.includes("2100")) return "2100";
  if (ctx.words.includes("f2") && codes.includes("2080")) return "2080";
  if (ctx.words.includes("f1") && codes.includes("2060")) return "2060";
  if (ctx.joined.includes("dreiflaechig") && codes.includes("2100")) return "2100";
  if (ctx.joined.includes("zweiflaechig") && codes.includes("2080")) return "2080";
  return codes[0];
}

function needsImplicitAnaesthesia(ctx, chains) {
  if (chains.some((c) => ["extraktion", "osteotomie", "endo_wkb", "fuellung", "implantat", "pa_geschlossen"].includes(c.id))) {
    return true;
  }
  return ctx.words.includes("i") || ctx.joined.includes("infiltration") ||
    ctx.joined.includes("leitung") || ctx.joined.includes("anaesthes");
}

function hasAnaesthesiaCodes(bema, goz) {
  const anaBema = ["40", "41a", "41b"];
  const anaGoz = ["0090", "0100", "0080"];
  return anaBema.some((c) => bema.has(c)) || anaGoz.some((c) => goz.has(c));
}

export function loadBema(forceReload = false) {
  if (bemaCache && !forceReload) return bemaCache;
  bemaCache = normalizePositions(readJson("bema.json"));
  return bemaCache;
}

export function loadGoz(forceReload = false) {
  if (gozCache && !forceReload) return gozCache;
  gozCache = normalizePositions(readJson("goz.json"));
  return gozCache;
}

export function loadJargon(forceReload = false) {
  if (jargonCache && !forceReload) return jargonCache;
  const raw = readJson("jargon.json");
  const list = raw && Array.isArray(raw.entries) ? raw.entries : [];
  jargonCache = list
    .filter((e) => e && typeof e.term === "string")
    .map((e) => ({
      term: String(e.term),
      aliases: Array.isArray(e.aliases) ? e.aliases.filter((a) => typeof a === "string") : [],
      meaning: typeof e.meaning === "string" ? e.meaning : "",
      category: typeof e.category === "string" ? e.category : undefined,
      bema: Array.isArray(e.bema) ? e.bema.filter((c) => typeof c === "string") : [],
      goz: Array.isArray(e.goz) ? e.goz.filter((c) => typeof c === "string") : [],
    }));
  return jargonCache;
}

export function loadRules(forceReload = false) {
  if (rulesCache && !forceReload) return rulesCache;
  rulesCache = readJson("rules.json") || {};
  return rulesCache;
}

export function loadChains(forceReload = false) {
  if (chainsCache && !forceReload) return chainsCache;
  const raw = readJson("chains.json");
  const list = raw && Array.isArray(raw.chains) ? raw.chains : [];
  chainsCache = list
    .filter((c) => c && typeof c.id === "string")
    .map((c) => ({
      id: String(c.id),
      label: typeof c.label === "string" ? c.label : c.id,
      trigger: Array.isArray(c.trigger) ? c.trigger.filter((t) => typeof t === "string") : [],
      obligatorisch: Array.isArray(c.obligatorisch) ? c.obligatorisch : [],
      optional: Array.isArray(c.optional) ? c.optional : [],
      vollstaendigkeitsChecks: Array.isArray(c.vollstaendigkeitsChecks)
        ? c.vollstaendigkeitsChecks.filter((s) => typeof s === "string") : [],
    }));
  return chainsCache;
}

/** Erkennt im Behandlungstext vorkommenden Jargon (Wort-/Phrasen-Match). */
export function detectJargon(text) {
  const ctx = buildMatchContext(text);
  const matched = [];
  for (const entry of loadJargon()) {
    const needles = [entry.term, ...entry.aliases];
    if (needles.some((n) => needleMatches(ctx, n))) matched.push(entry);
  }
  return matched;
}

/** Kandidaten-Ziffern (aus Jargon-Treffern) je System – katalog-validiert. */
export function candidateCodes(matched) {
  const bemaByCode = new Map(loadBema().map((p) => [p.code, p]));
  const gozByCode = new Map(loadGoz().map((p) => [p.code, p]));
  const bema = new Map();
  const goz = new Map();
  for (const m of matched) {
    m.bema.forEach((c) => { const p = bemaByCode.get(c); if (p) bema.set(c, p); });
    m.goz.forEach((c) => { const p = gozByCode.get(c); if (p) goz.set(c, p); });
  }
  return { bema: [...bema.values()], goz: [...goz.values()] };
}

/** Erkennt aktivierte Abrechnungsketten anhand der Trigger-Begriffe im Text. */
export function detectChains(text) {
  const ctx = buildMatchContext(text);
  return loadChains().filter((chain) => chain.trigger.some((t) => needleMatches(ctx, t)));
}

export function isValidCode(system, code) {
  const list = system === "bema" ? loadBema() : loadGoz();
  return list.some((p) => p.code === code);
}

/** Nur Katalog-Ziffern behalten, Label aus dem Katalog anreichern. */
export function validateCatalogCodes(system, codes) {
  const list = system === "bema" ? loadBema() : loadGoz();
  const byCode = new Map(list.map((p) => [p.code, p]));
  return (Array.isArray(codes) ? codes : [])
    .filter((c) => c && byCode.has(c.code))
    .map((c) => {
      const cat = byCode.get(c.code);
      const label = cat.label || c.label || "";
      return c.note ? { code: c.code, label, note: c.note } : { code: c.code, label };
    });
}

/** Voller Katalog als kompakte Zeilen (LLM-Kontext). */
export function catalogLines(system) {
  const list = system === "bema" ? loadBema() : loadGoz();
  return list.map((p) => `${p.code} — ${p.label}${p.note ? ` (${p.note})` : ""}`).join("\n");
}

/**
 * Deterministische Abrechnungs-Expansion (v1.0): Jargon + Ketten + implizite
 * Anaesthesie. Fallback wenn das lokale LLM nicht antwortet; alle Ziffern
 * sind katalog-validiert.
 */
export function expandBillingFromText(text) {
  const ctx = buildMatchContext(text);
  const teeth = extractFdiTeeth(text);
  const teethNote = teeth.length ? `Zaehne FDI: ${teeth.join(", ")}` : "";

  const bema = new Map();
  const goz = new Map();
  const completeness = [];

  const jargon = detectJargon(text);
  for (const entry of jargon) {
    const b = pickBemaFromList(entry.bema, ctx);
    const g = pickGozFromList(entry.goz, ctx);
    if (b) putCode(bema, "bema", b, `${entry.term}${teethNote ? "; " + teethNote : ""}`);
    if (g) putCode(goz, "goz", g, `${entry.term}${teethNote ? "; " + teethNote : ""}`);
  }
  if (ctx.words.includes("bmf")) {
    putCode(bema, "bema", "12", "besondere Massnahmen Praeparieren/Fuellen, Zahn 12");
  }

  const chains = detectChains(text);
  for (const chain of chains) {
    for (const step of chain.obligatorisch) {
      const b = pickBemaFromList(step.bema || [], ctx);
      const g = pickGozFromList(step.goz || [], ctx);
      if (b) putCode(bema, "bema", b, `${step.role}${step.bezug ? ", " + step.bezug : ""}${teethNote ? "; " + teethNote : ""}`);
      if (g) putCode(goz, "goz", g, `${step.role}${step.bezug ? ", " + step.bezug : ""}${teethNote ? "; " + teethNote : ""}`);
    }
    for (const step of chain.optional) {
      const roleNorm = normalizeText(step.role);
      const hit =
        (roleNorm.includes("anaesthes") && (ctx.joined.includes("anaesthes") || ctx.words.includes("i") || ctx.words.includes("l1"))) ||
        (roleNorm.includes("roentgen") && (ctx.joined.includes("roentgen") || ctx.joined.includes("opg") || ctx.joined.includes("messaufnahme"))) ||
        (roleNorm.includes("nachbehandlung") && (ctx.joined.includes("nachbehandlung") || ctx.joined.includes("wv") || ctx.joined.includes("faeden"))) ||
        (roleNorm.includes("laengenmessung") && ctx.joined.includes("laengenmessung")) ||
        (roleNorm.includes("medikament") && ctx.joined.includes("med")) ||
        (roleNorm.includes("provisor") && ctx.joined.includes("provisor")) ||
        (roleNorm.includes("mikroskop") && ctx.joined.includes("mikroskop")) ||
        (roleNorm.includes("zuschlag") && (ctx.joined.includes("osteotom") || ctx.joined.includes("implant"))) ||
        (roleNorm.includes("augmentation") && (ctx.joined.includes("bio") || ctx.joined.includes("knochen"))) ||
        (roleNorm.includes("sinus") && ctx.joined.includes("sinus")) ||
        (roleNorm.includes("planung") && (ctx.joined.includes("vermessung") || ctx.joined.includes("diagnostik")));
      if (!hit) continue;
      const b = pickBemaFromList(step.bema || [], ctx);
      const g = pickGozFromList(step.goz || [], ctx);
      if (b) putCode(bema, "bema", b, step.role);
      if (g) putCode(goz, "goz", g, step.role);
    }
    completeness.push(...chain.vollstaendigkeitsChecks);
  }

  if (ctx.joined.includes("upt")) {
    for (const letter of extractUptLetters(ctx)) {
      putCode(bema, "bema", `UPT${letter}`, "UPT-Strecke explizit genannt");
    }
  }

  if (ctx.joined.includes("sofortimplantat") || (ctx.joined.includes("implantat") && ctx.joined.includes("x"))) {
    putCode(goz, "goz", "9010", "Sofortimplantation je Implantat");
    putCode(goz, "goz", "9110", "Interner Sinuslift");
    putCode(goz, "goz", "9140", "Autologer Knochen Region 18");
    putCode(goz, "goz", "9000", "Implantat-Analyse/Vermessung");
    putCode(goz, "goz", "0530", "OP-Zuschlag ambulant (9010 >= 1200 Pkt)");
    goz.delete("0500");
    completeness.push("Implantat/Membran/Bio-Oss Material gesondert (BEB) – nicht im BEMA/GOZ-Katalog.");
  }

  const politurTeeth = teeth.filter((t) => [14, 15, 16].some((x) => t === x));
  if (ctx.joined.includes("politur") && politurTeeth.length) {
    putCode(goz, "goz", "2130", `Politur/Kontrolle je Zahn: ${politurTeeth.join(", ")}`);
  }

  // Zahnstein (107) schliesst PZR (1040) aus – nicht beides.
  if (bema.has("107")) goz.delete("1040");

  // Extraktion: konkrete Zaehne aus Text.
  if (ctx.joined.includes(" x ") || ctx.words.includes("x1") || ctx.words.includes("x2")) {
    if (ctx.joined.includes("17") || ctx.words.includes("17")) {
      if (ctx.joined.includes("tief frakturiert")) {
        putCode(bema, "bema", "45", "Zahn 17");
        putCode(goz, "goz", "3020", "Zahn 17");
      } else {
        putCode(bema, "bema", "44", "Zahn 17 (Seitenzahn)");
        putCode(goz, "goz", "3010", "Zahn 17");
      }
    }
    if (ctx.joined.includes("24") || ctx.words.includes("24")) {
      putCode(bema, "bema", "44", "Zahn 24");
      putCode(goz, "goz", "3010", "Zahn 24");
    }
  }
  if (ctx.joined.includes("n 16") || (ctx.joined.includes("nachbehandlung") && ctx.joined.includes("16"))) {
    putCode(bema, "bema", "38", "Nachbehandlung Zahn/Region 16");
  }

  if (needsImplicitAnaesthesia(ctx, chains) && !hasAnaesthesiaCodes(bema, goz)) {
    const surgical = chains.some((c) => ["extraktion", "osteotomie", "implantat"].includes(c.id)) ||
      ctx.joined.includes("osteotom") || ctx.joined.includes("sofortimplantat");
    if (surgical) {
      putCode(bema, "bema", "41a", "implizit, nicht diktiert");
      putCode(goz, "goz", "0100", "implizit, nicht diktiert");
    } else {
      putCode(bema, "bema", "40", "implizit, nicht diktiert");
      putCode(goz, "goz", "0090", "implizit, nicht diktiert");
    }
  }

  if (ctx.joined.includes("wv") || ctx.joined.includes("faeden")) {
    completeness.push("Wiedervorstellung Fadenzug in 2 Wochen: dann GOZ 3290/3300 oder BEMA 38 je OP-Gebiet.");
  }

  const suggestions = [
    "Deterministische v1.0-Expansion (Jargon+Ketten). Bitte klinisch pruefen.",
    teethNote,
    chains.length ? `Ketten: ${chains.map((c) => c.label).join(", ")}` : "",
    jargon.length ? `Jargon: ${jargon.map((j) => j.term).join(", ")}` : "",
  ].filter(Boolean).join(" ");

  return {
    bema: [...bema.values()],
    goz: [...goz.values()],
    completeness: [...new Set(completeness)].slice(0, 12),
    suggestions,
  };
}

/**
 * Grounding-Kontext fuer das lokale LLM: erkannter Jargon, aktivierte Ketten,
 * Kandidaten + vollstaendiger zulaessiger Katalog.
 */
export function buildGroundingContext(text) {
  const matched = detectJargon(text);
  const candidates = candidateCodes(matched);
  const chains = detectChains(text);

  const jargonBlock = matched.length
    ? matched.map((m) => `- "${m.term}" = ${m.meaning} [BEMA: ${m.bema.join(", ") || "-"} | GOZ: ${m.goz.join(", ") || "-"}]`).join("\n")
    : "(kein eindeutiger Jargon erkannt)";

  const candidateBema = candidates.bema.length
    ? candidates.bema.map((p) => `${p.code} — ${p.label}`).join("\n")
    : "(keine eindeutigen Kandidaten – siehe vollstaendigen Katalog unten)";
  const candidateGoz = candidates.goz.length
    ? candidates.goz.map((p) => `${p.code} — ${p.label}`).join("\n")
    : "(keine eindeutigen Kandidaten – siehe vollstaendigen Katalog unten)";

  const chainBlock = chains.length
    ? chains.map((c) => {
      const fmtStep = (s) =>
        `    • ${s.role} [BEMA: ${(s.bema || []).join("/") || "-"} | GOZ: ${(s.goz || []).join("/") || "-"}]${s.bezug ? ` (${s.bezug})` : ""}${s.frage ? ` — ${s.frage}` : ""}`;
      return [
        `# Kette "${c.label}":`,
        "  Obligatorisch:",
        c.obligatorisch.map(fmtStep).join("\n") || "    -",
        "  Optional / zu pruefen:",
        c.optional.map(fmtStep).join("\n") || "    -",
        "  Vollstaendigkeits-Rueckfragen:",
        c.vollstaendigkeitsChecks.map((s) => `    ? ${s}`).join("\n") || "    -",
      ].join("\n");
    }).join("\n\n")
    : "(keine Kette aktiviert)";

  const context = [
    "ERKANNTER PRAXIS-JARGON:",
    jargonBlock,
    "",
    "AKTIVIERTE ABRECHNUNGSKETTEN (Leistungskomplexe – auf Vollstaendigkeit pruefen, fehlende Positionen als Rueckfrage markieren):",
    chainBlock,
    "",
    "WAHRSCHEINLICHE KANDIDATEN aus erkanntem Jargon (BEMA):",
    candidateBema,
    "",
    "WAHRSCHEINLICHE KANDIDATEN aus erkanntem Jargon (GOZ):",
    candidateGoz,
    "",
    "================================================================",
    "VOLLSTAENDIGER ZULAESSIGER KATALOG – verwende AUSSCHLIESSLICH Ziffern aus diesen Listen.",
    "Waehle die jeweils passendste Ziffer (z. B. Fuellung nach Flaechenzahl, Extraktion nach Wurzelzahl).",
    "----------------------------------------------------------------",
    "ALLE ZULAESSIGEN BEMA-POSITIONEN:",
    catalogLines("bema"),
    "",
    "ALLE ZULAESSIGEN GOZ-POSITIONEN:",
    catalogLines("goz"),
  ].join("\n");

  return { context, matchedTerms: matched.map((m) => m.term), chains: chains.map((c) => c.id) };
}
