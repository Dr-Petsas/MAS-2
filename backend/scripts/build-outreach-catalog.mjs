// ============================================================================
// W-OUTREACH: Outreach-Katalog aus den 26 Onboarding-Fachkatalogen bauen.
//
// Quelle:  F:\pickadoc-live-base\onboarding-pickadoc\landingpages-catalog\*.json
//          (redaktionell geprüfte Landingpage-Texte pro Besuchsgrund)
// Ziel 1:  backend/src/clara/outreach-catalog.json         (MAS: Lisa-Anrufe/SMS)
// Ziel 2:  docgendaweb/public/outreach-catalog.de.json     (CampaignR-Vorbelegung)
//
// Pro Besuchsgrund werden aus der Landingpage-Beschreibung extrahiert:
//   what        — was beim Termin passiert           (Absatz 1, ohne Begrüßungs-Floskeln)
//   purpose     — warum der Termin wichtig ist       (Absatz 2, ohne "Unser Ziel..."-Floskel)
//   consequence — was passiert, wenn er ausbleibt    (Absatz 3, ohne Verschiebe-Floskeln)
//
// Qualitäts-Garantien (Guards):
//   - Du-Form wird konservativ in Sie-Form normalisiert; bleibt Du-Form übrig,
//     wird das FELD verworfen (Fallback auf Klassen-Vorlage zur Laufzeit).
//   - Kein HTML, keine Preise/€, harte Längen-Caps, Satzgrenzen respektiert.
//   - Der Build bricht ab, wenn ein Fachkatalog gar keine Motive liefert.
//
// Aufruf:  node scripts/build-outreach-catalog.mjs
//   Env:   OUTREACH_SRC_DIR   (Default s. unten)
//          OUTREACH_MAS_OUT   / OUTREACH_WEB_OUT
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC_DIR = process.env.OUTREACH_SRC_DIR ||
  "F:\\pickadoc-live-base\\onboarding-pickadoc\\landingpages-catalog";
const MAS_OUT = process.env.OUTREACH_MAS_OUT ||
  path.join(__dirname, "..", "src", "clara", "outreach-catalog.json");
const WEB_OUT = process.env.OUTREACH_WEB_OUT ||
  "F:\\pickadoc-live-base\\docgendaweb\\public\\outreach-catalog.de.json";

// Längen-Caps (Zeichen). Anruf-Instruktion gesamt <= 1550, SMS <= 440 — die
// Bausteine müssen deutlich darunter bleiben.
const CAP = { what: 260, purpose: 320, purposeShort: 150, consequence: 220 };
const MIN_LEN = 25; // kürzere Extrakte sind meist Floskel-Reste -> verwerfen

// ---------------------------------------------------------------------------
// Text-Werkzeuge
// ---------------------------------------------------------------------------

function stripHtmlToParagraphs(html) {
  const raw = String(html || "");
  const parts = raw.split(/<\/p\s*>/i).map((p) =>
    p.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
      .replace(/\s+/g, " ").trim()
  ).filter(Boolean);
  return parts;
}

// Satz-Splitter mit Schutz gängiger Abkürzungen der Katalogtexte.
const ABBREV = ["ca.", "z. B.", "z.B.", "u. a.", "u.a.", "inkl.", "ggf.", "bzw.", "Dr.", "min.", "mind.", "evtl.", "etc."];
function splitSentences(text) {
  let t = String(text || "");
  ABBREV.forEach((a, i) => { t = t.split(a).join(`\u0000${i}\u0000`); });
  const parts = t.split(/(?<=[.!?])\s+/).map((x) => {
    let y = x;
    ABBREV.forEach((a, i) => { y = y.split(`\u0000${i}\u0000`).join(a); });
    return y.trim();
  }).filter(Boolean);
  return parts;
}

// Konservative Du->Sie-Normalisierung. Die Katalogsätze sind "Wir..."-zentriert,
// die Du-Anteile stehen als Objekt ("wir begleiten dich") — Objektersetzung
// funktioniert dort zuverlässig. Verbformen ("kannst du") kommen in den
// extrahierten Kernsätzen praktisch nicht vor; Rest fängt der Guard.
const DU_MAP = [
  [/\bdich\b/g, "Sie"], [/\bDich\b/g, "Sie"],
  [/\bdir\b/g, "Ihnen"], [/\bDir\b/g, "Ihnen"],
  [/\bdeinen\b/g, "Ihren"], [/\bDeinen\b/g, "Ihren"],
  [/\bdeinem\b/g, "Ihrem"], [/\bDeinem\b/g, "Ihrem"],
  [/\bdeiner\b/g, "Ihrer"], [/\bDeiner\b/g, "Ihrer"],
  [/\bdeines\b/g, "Ihres"], [/\bDeines\b/g, "Ihres"],
  [/\bdeine\b/g, "Ihre"], [/\bDeine\b/g, "Ihre"],
  [/\bdein\b/g, "Ihr"], [/\bDein\b/g, "Ihr"],
  [/\bdu\b/g, "Sie"], [/\bDu\b/g, "Sie"],
];
function duToSie(text) {
  let t = String(text || "");
  for (const [re, to] of DU_MAP) t = t.replace(re, to);
  return t;
}
function stillDuForm(text) {
  return /\b(du|dich|dir|dein\w*)\b/i.test(String(text || ""));
}

function capAtSentence(text, cap) {
  const t = String(text || "").trim();
  if (t.length <= cap) return t;
  const sentences = splitSentences(t);
  let out = "";
  for (const sent of sentences) {
    if ((out + " " + sent).trim().length > cap) break;
    out = (out + " " + sent).trim();
  }
  return out; // lieber kürzer als mitten im Satz abschneiden
}

// Feld-Guard: liefert "" wenn der Extrakt unbrauchbar ist.
function guard(text, cap) {
  let t = duToSie(String(text || "").replace(/\s+/g, " ").trim());
  if (!t) return "";
  if (t.length < MIN_LEN) return "";
  if (/[<>]/.test(t)) return "";                       // HTML-Reste
  if (/€|\beuro\b|\bEUR\b|\bkostet\b/i.test(t)) return ""; // niemals Preise
  if (stillDuForm(t)) return "";                       // Anredeform nicht sauber
  t = capAtSentence(t, cap);
  if (t.length < MIN_LEN) return "";
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}

// ---------------------------------------------------------------------------
// Extraktion pro Besuchsgrund
// ---------------------------------------------------------------------------

// Floskel-Erkennung (generierte Rahmensätze, tragen keine Information):
const BOILER_P1 = [
  /^wir freuen uns/i,
  /nichts (perfekt )?vorbereiten/i,
  /begleiten (dich|sie) schritt/i,
  /beantworten alle fragen/i,
];
const BOILER_P2 = [
  /^unser ziel ist es/i,
];
const BOILER_P3 = [
  /^wir wissen, dass termine/i,
  /bescheid/i,
  /^so können wir/i,
  /^so koennen wir/i,
  /verschieben oder absagen/i,
];

function pickSentences(paragraph, boilerRes, maxSentences) {
  const sentences = splitSentences(paragraph || "");
  const keep = sentences.filter((sent) => !boilerRes.some((re) => re.test(sent)));
  return keep.slice(0, maxSentences).join(" ");
}

function extractMotive(vm) {
  const lp = vm.landingPage || {};
  const paragraphs = stripHtmlToParagraphs(lp.description);
  const [p1 = "", p2 = "", p3 = ""] = paragraphs;

  const what = guard(pickSentences(p1, BOILER_P1, 2), CAP.what);
  const purpose = guard(pickSentences(p2, BOILER_P2, 2), CAP.purpose);
  const purposeShort = purpose ? guard(splitSentences(purpose)[0] || "", CAP.purposeShort) : "";
  const consequence = guard(pickSentences(p3, BOILER_P3, 1), CAP.consequence);

  return { what, purpose, purposeShort, consequence };
}

// "6-m" -> "alle 6 Monate", "1-y" -> "jedes Jahr" ...
function intervalDe(interval) {
  const m = String(interval || "").match(/^(\d+)-(d|w|m|y)$/);
  if (!m) return "";
  const n = Number(m[1]);
  const unit = m[2];
  if (n === 1) return { d: "täglich", w: "jede Woche", m: "jeden Monat", y: "jedes Jahr" }[unit];
  const plural = { d: "Tage", w: "Wochen", m: "Monate", y: "Jahre" }[unit];
  return `alle ${n} ${plural}`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build() {
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".json"));
  if (!files.length) throw new Error(`Keine Fachkataloge gefunden in ${SRC_DIR}`);

  const specialties = {};
  let motiveCount = 0;
  let fieldStats = { what: 0, purpose: 0, consequence: 0 };
  const report = [];

  for (const file of files.sort()) {
    if (file.startsWith("_")) continue; // Hilfsdateien (z. B. _test_counter.json)
    const cat = JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), "utf8"));
    if (!cat.specialtyKey) continue; // kein Fachkatalog
    const key = String(cat.specialtyKey).toLowerCase();
    const motives = Array.isArray(cat.visitMotives) ? cat.visitMotives : [];
    if (!motives.length) throw new Error(`Fachkatalog ${file} enthält keine visitMotives — Build abgebrochen.`);

    const out = [];
    for (const vm of motives) {
      const t = extractMotive(vm);
      const entry = {
        bp: String(vm.blueprintId || ""),
        group: String(vm.group || ""),
        name: String(vm.name || ""),
        patName: String(vm.nameForPatient || vm.name || ""),
        interval: String(vm.recurrenceInterval || ""),
        intervalDe: intervalDe(vm.recurrenceInterval) || "",
        recall: vm.recurrenceCount !== 0 && !!vm.recurrenceInterval,
        what: t.what,
        purpose: t.purpose,
        purposeShort: t.purposeShort,
        consequence: t.consequence,
      };
      if (!entry.name) continue;
      out.push(entry);
      motiveCount++;
      if (entry.what) fieldStats.what++;
      if (entry.purpose) fieldStats.purpose++;
      if (entry.consequence) fieldStats.consequence++;
    }

    specialties[key] = { nameDe: String(cat.specialtyNameDe || key), motives: out };
    report.push(`${key}: ${out.length} Motive`);
  }

  const result = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "onboarding-pickadoc/landingpages-catalog",
    counts: { specialties: Object.keys(specialties).length, motives: motiveCount, ...fieldStats },
    specialties,
  };

  fs.mkdirSync(path.dirname(MAS_OUT), { recursive: true });
  fs.writeFileSync(MAS_OUT, JSON.stringify(result, null, 1), "utf8");
  fs.writeFileSync(WEB_OUT, JSON.stringify(result), "utf8");

  console.log(report.join("\n"));
  console.log(`\nFachrichtungen: ${result.counts.specialties}, Motive: ${motiveCount}`);
  console.log(`Felder gefüllt: what=${fieldStats.what}, purpose=${fieldStats.purpose}, consequence=${fieldStats.consequence}`);
  console.log(`-> ${MAS_OUT}`);
  console.log(`-> ${WEB_OUT} (${Math.round(fs.statSync(WEB_OUT).size / 1024)} KB)`);
}

build();
