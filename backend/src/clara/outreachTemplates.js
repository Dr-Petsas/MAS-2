// ============================================================================
// W-OUTREACH — Motivspezifische Ansprache für proaktive Patientenkontakte.
//
// Warum es dieses Modul gibt (Auftrag Chef 05.07.2026): Man ruft nicht an und
// sagt "der Doktor hat Luft". Jeder Anruf/jede SMS braucht einen ehrlichen,
// fachlich richtigen ANLASS ("Ihre PZR ist wieder fällig, weil ...").
// KEIN Arzt pflegt solche Inhalte — sie kommen deshalb EINMAL zentral aus den
// redaktionell geprüften Onboarding-Fachkatalogen (build-outreach-catalog.mjs
// -> src/clara/outreach-catalog.json) und werden hier pro Kontakt aufgelöst.
//
// Auflösungs-Kaskade (jede Stufe ist sicher, höhere nur spezifischer):
//   1. Kampagnen-Override  cfg.phoneKi.prompt der Kampagne (Praxis-Vorgabe)
//   2. Katalog exakt       Motivname == Katalogname (erst eigene Fachrichtung,
//                          dann alle — Präfixe wie "GYN " werden normalisiert)
//   3. Katalog fuzzy       Token-Überlappung >= 0.5 (eindeutiger Bestwert)
//   4. Kanonische Klasse   reinigung/vorsorge/kontrolle/nachsorge/beratung
//   5. Generisch           heutiges Verhalten ("laut Recall fällig")
//
// SICHERHEITSRAHMEN: Die Gesprächsregeln (keine Diagnosen, keine Preise, kein
// Druck, ein Angebot + eine Alternative, Nein akzeptieren, Rückruf statt
// Medizinauskunft, Opt-out respektieren) stehen IMMER in der Instruktion und
// werden NIE gekürzt — egal welche Stufe der Kaskade greift.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { specialtyKeyForClient } from "./dokuPflicht.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, "outreach-catalog.json");

const TZ = "Europe/Berlin";

// Obergrenzen: lisaStartCall kappt die Instruktion bei 2200, lisaSendSms bei
// 480 — wir bleiben mit Reserve darunter, damit NIE mitten im Satz gekappt wird.
// (2100 seit W-OUTREACH-2: Live-Buchungs-Regeln brauchen Platz.)
// 28.07.2026: von 2100 auf 3400 angehoben — der Einwand-Block ("Wer sind Sie?
// Woher haben Sie meine Nummer? Wo muss ich hin?") gehoert FEST in jede
// Recall-Instruktion (Patienten erwarten den Anruf nicht) und darf die
// Motiv-Bausteine (was wird gemacht / warum wichtig) nicht aus dem Budget
// druecken. Live-Probe mit ZE-Motiv: 2900 war exakt an der Kante, die
// Kaskade schnitt routinemaessig. ~3400 Zeichen sind ~850 Tokens — fuer den
// ElevenLabs-Prompt unkritisch.
export const CALL_INSTRUCTION_LIMIT = 3400;
export const SMS_LIMIT = 440;

function s(v) {
  return v == null ? "" : String(v).trim();
}

// ---------------------------------------------------------------------------
// Katalog laden (einmal pro Prozess; nie werfend)
// ---------------------------------------------------------------------------

let _catalog = null;

export function loadOutreachCatalog() {
  if (_catalog) return _catalog;
  try {
    _catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  } catch {
    _catalog = { version: 0, specialties: {} };
  }
  return _catalog;
}

/** Nur für Tests: Katalog-Cache zurücksetzen. */
export function _resetOutreachCache() {
  _catalog = null;
}

// ---------------------------------------------------------------------------
// Namens-Normalisierung + Matching
// ---------------------------------------------------------------------------

const STOP_TOKENS = new Set(["min", "minuten", "termin", "und", "der", "die", "das", "im", "mit", "fuer", "bei", "rahmen"]);

function foldGerman(text) {
  return s(text).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

/** Praxis-Motivnamen tragen oft Kürzel-Präfixe ("PRO ", "GYN ", "ORTHO ") und
 *  Dauer-Anhänge ("30 Min."). Für das Matching zählt der Kern. */
function nameTokens(name) {
  const cleaned = s(name).replace(/^[A-ZÄÖÜ]{2,6}\s+/, ""); // Kürzel-Präfix
  return foldGerman(cleaned)
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t.length > 1 && !STOP_TOKENS.has(t) && !/^\d+$/.test(t));
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function normFull(name) {
  return nameTokens(name).join(" ");
}

function* iterEntries(catalog, specialtyKey) {
  const specs = catalog?.specialties || {};
  // Eigene Fachrichtung zuerst — bei gleichen Namen gewinnt die eigene.
  const order = specialtyKey && specs[specialtyKey]
    ? [specialtyKey, ...Object.keys(specs).filter((k) => k !== specialtyKey)]
    : Object.keys(specs);
  for (const key of order) {
    for (const m of specs[key]?.motives || []) yield { ...m, specialtyKey: key };
  }
}

// ---------------------------------------------------------------------------
// Kanonische Klassen (Stufe 4) — handgeschriebene, bewusst zurückhaltende
// Vorlagen. Sie behaupten NICHTS Motivspezifisches, nur den Typ des Termins.
// ---------------------------------------------------------------------------

const CLASS_DEFS = [
  {
    id: "reinigung",
    re: /(zahnreinigung|pzr|prophylaxe|zahnhygiene|dentalhygiene)/,
    texts: {
      purpose: "Eine regelmäßige professionelle Zahnreinigung entfernt Beläge an den Stellen, die die häusliche Pflege nicht erreicht, und schützt Zähne und Zahnfleisch.",
      purposeShort: "Eine regelmäßige professionelle Zahnreinigung schützt Zähne und Zahnfleisch.",
      consequence: "Bleiben Beläge länger, können sich Zahnstein und Zahnfleischentzündungen entwickeln.",
      what: "",
    },
  },
  {
    id: "vorsorge",
    re: /(vorsorge|screening|frueherkennung|check.?up|krebsfrueherkennung|impf)/,
    texts: {
      purpose: "Regelmäßige Vorsorge hilft, Veränderungen früh zu erkennen — oft lange bevor Beschwerden entstehen.",
      purposeShort: "Regelmäßige Vorsorge hilft, Veränderungen früh zu erkennen.",
      consequence: "Bleibt die Vorsorge länger aus, können Veränderungen unbemerkt bleiben; eine spätere Behandlung ist oft aufwendiger.",
      what: "",
    },
  },
  {
    id: "nachsorge",
    re: /(nachsorge|upt|nachkontrolle|verlaufskontrolle|verbandswechsel|fadenzug)/,
    texts: {
      purpose: "Nach einer Behandlung sind regelmäßige Nachsorgetermine wichtig, damit das Ergebnis stabil bleibt und wir früh gegensteuern können, falls sich etwas verändert.",
      purposeShort: "Nachsorgetermine halten das Behandlungsergebnis stabil.",
      consequence: "Fällt die Nachsorge aus, können Veränderungen unbemerkt bleiben.",
      what: "",
    },
  },
  {
    id: "kontrolle",
    re: /(kontrolle|kontrolluntersuchung|untersuchung|check)/,
    texts: {
      purpose: "Bei der Kontrolle prüfen wir den aktuellen Stand und können früh gegensteuern, falls sich etwas verändert hat.",
      purposeShort: "Die Kontrolle zeigt den aktuellen Stand und erkennt Veränderungen früh.",
      consequence: "Ohne regelmäßige Kontrolle können Veränderungen unbemerkt bleiben.",
      what: "",
    },
  },
  {
    id: "beratung",
    re: /(beratung|besprechung|aufklaerung|erstgespraech|sprechstunde)/,
    texts: {
      purpose: "Im Gespräch klären wir offene Fragen in Ruhe und finden gemeinsam den sinnvollen nächsten Schritt — unverbindlich und ohne Zeitdruck.",
      purposeShort: "Im Gespräch klären wir offene Fragen und den sinnvollen nächsten Schritt.",
      consequence: "",
      what: "",
    },
  },
];

// ---------------------------------------------------------------------------
// Auflösung (pur, testbar — Katalog kommt als Parameter oder aus der Datei)
// ---------------------------------------------------------------------------

/**
 * Löst einen Praxis-Besuchsgrund gegen den zentralen Katalog auf.
 * @returns {{ matchLevel: "exact"|"fuzzy"|"class"|"generic",
 *             entry: object|null, classId: string|null,
 *             texts: { what, purpose, purposeShort, consequence, intervalDe },
 *             topicLabel: string }}
 */
export function resolveOutreach({ specialtyKey = "", visitMotiveName = "", catalog = null } = {}) {
  const cat = catalog || loadOutreachCatalog();
  const nameNorm = normFull(visitMotiveName);
  const tokens = nameTokens(visitMotiveName);

  const generic = {
    matchLevel: "generic", entry: null, classId: null,
    texts: { what: "", purpose: "", purposeShort: "", consequence: "", intervalDe: "" },
    topicLabel: s(visitMotiveName),
  };
  if (!nameNorm) return generic;

  // Stufe 2: exakt (eigene Fachrichtung zuerst — iterEntries sortiert so).
  for (const entry of iterEntries(cat, specialtyKey)) {
    if (normFull(entry.name) === nameNorm || normFull(entry.patName) === nameNorm) {
      return {
        matchLevel: "exact", entry, classId: null,
        texts: { what: entry.what, purpose: entry.purpose, purposeShort: entry.purposeShort, consequence: entry.consequence, intervalDe: entry.intervalDe },
        topicLabel: entry.patName || s(visitMotiveName),
      };
    }
  }

  // Stufe 3: fuzzy über Token-Überlappung; eigene Fachrichtung gewinnt bei
  // Gleichstand (frühere Position in iterEntries).
  let best = null;
  let bestScore = 0;
  for (const entry of iterEntries(cat, specialtyKey)) {
    const score = Math.max(jaccard(tokens, nameTokens(entry.name)), jaccard(tokens, nameTokens(entry.patName)));
    if (score > bestScore) { best = entry; bestScore = score; }
  }
  if (best && bestScore >= 0.5) {
    return {
      matchLevel: "fuzzy", entry: best, classId: null,
      texts: { what: best.what, purpose: best.purpose, purposeShort: best.purposeShort, consequence: best.consequence, intervalDe: best.intervalDe },
      topicLabel: best.patName || s(visitMotiveName),
    };
  }

  // Stufe 4: kanonische Klasse über den Praxis-Motivnamen.
  const folded = foldGerman(visitMotiveName);
  for (const def of CLASS_DEFS) {
    if (def.re.test(folded)) {
      return {
        matchLevel: "class", entry: null, classId: def.id,
        texts: { ...def.texts, intervalDe: "" },
        topicLabel: s(visitMotiveName),
      };
    }
  }

  return generic;
}

/** Async-Komfort: Fachrichtung des Mandanten auflösen + Katalog matchen. */
export async function outreachForClient(clientId, visitMotiveName) {
  let specialtyKey = "";
  try {
    specialtyKey = await specialtyKeyForClient(clientId);
  } catch { /* Katalog-Matching funktioniert auch ohne Fachrichtung */ }
  return resolveOutreach({ specialtyKey, visitMotiveName });
}

// ---------------------------------------------------------------------------
// Kompositionen — hier entsteht, was Lisa sagt bzw. was in der SMS steht.
// ---------------------------------------------------------------------------

function dateDe(isoDate) {
  const d = new Date(`${s(isoDate)}T12:00:00Z`);
  if (isNaN(d.getTime())) return s(isoDate);
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
}

/** Ehrliche Zeitangabe: Kampagnen-Kandidaten kennen den letzten Besuch,
 *  Recall-Kandidaten das geplante Fälligkeitsdatum. NIE etwas behaupten,
 *  was die Daten nicht hergeben. */
function overduePhrase(overdueDays, source) {
  const days = Number(overdueDays) || 0;
  if (days < 21) return "";
  const months = Math.round(days / 30);
  const span = months >= 24 ? `über ${Math.floor(months / 12)} Jahre`
    : months >= 2 ? `etwa ${months} Monate`
    : "einige Wochen";
  if (source === "recall") return ` Der Termin ist seit ${span} überfällig.`;
  return ` Der letzte Besuch liegt ${span} zurück.`;
}

// ---------------------------------------------------------------------------
// Kontroll-Fokus fuer Recall-Ansprachen (Chef 28.07.2026, Live-Anruf ~13:05:
// "lisa will zahnersatz eingliedern lassen und redet nicht von
// kontrolltermin-vereinbarung"). Ein Recall zu einer ZURUECKLIEGENDEN
// Behandlung ist IMMER eine Einladung zur KONTROLLE — nie ein Angebot, die
// Behandlung (erneut) durchzufuehren. Deterministisch aus dem Motivnamen
// abgeleitet (kein Katalog-Fuzzy, kein LLM-Raten). Kampagnen-Prompts der
// Praxis bleiben unangetastet (Schutz vom 17.07.2026).
//
// Chef-Vorgaben woertlich: Zahnersatz-Eingliederung -> "x Monate/Jahre sind
// vorbei, wir moechten den Zahnersatz zur Einhaltung unserer Qualitaets-
// sicherung kontrollieren"; Fuellungen -> "wir rufen an, um diese zu
// kontrollieren"; Parodontitis -> "den Zustand des Zahnfleisches ueberpruefen";
// Implantate -> "begutachten, ob chronische Entzuendungen mit Knochenabbau
// vorliegen"; KB/Schienen -> "Schienenkontrolle"; usw. — immer mit der
// Betonung, dass der letzte Termin weit zurueckliegt.
// ---------------------------------------------------------------------------

/** "5 Jahren" / "14 Monaten" / "einigen Wochen" — fuer "vor ueber X". */
function spanDativ(overdueDays) {
  const days = Number(overdueDays) || 0;
  if (days < 21) return "";
  const months = Math.round(days / 30);
  if (months >= 24) return `${Math.floor(months / 12)} Jahren`;
  if (months >= 2) return `${months} Monaten`;
  return "einigen Wochen";
}

// Motive, die selbst schon Kontroll-/Vorsorge-/Beratungs-Charakter tragen,
// behalten den Katalog-Weg (deren Texte SIND bereits die Kontrolle bzw. bei
// Beratungen gibt es noch keinen Bestand, den man kontrollieren koennte).
// "Nachsorge" fehlt hier BEWUSST: "PAR Nachsorge/UPT" soll den
// Zahnfleisch-Fokus bekommen, nicht den generischen Katalogtext.
const KONTROLL_SCHON_RE = /(kontroll|check|untersuchung|prophylaxe|\bpzr\b|zahnreinigung|beratung|besprechung|aufklaerung|erstgespraech|vorsorge|recall)/;

const KONTROLL_FAELLE = [
  {
    id: "implantat",
    re: /implant/,
    gruppe: "Implantate",
    topic: "Kontrolle Ihrer Implantate",
    zweck: (vor) =>
      `${vor ? `Vor ${vor}` : "Vor einiger Zeit"} wurden Implantate gesetzt. ` +
      "Wir möchten die Implantate begutachten und sicherstellen, dass keine chronische Entzündung mit Knochenabbau vorliegt.",
    kurz: "Wir möchten Ihre Implantate kontrollieren — so erkennen wir Entzündungen am Knochen früh.",
  },
  {
    id: "parodontitis",
    re: /(parodont|\bpa\b|\bpar\b|\bparo\b|\bupt\b|zahnfleisch)/,
    gruppe: "Parodontitis-Nachsorge",
    topic: "Kontrolle Ihres Zahnfleisches",
    zweck: (vor) =>
      `Die Parodontitis-Behandlung liegt ${vor ? `über ${vor}` : "längere Zeit"} zurück. ` +
      "Wir möchten den Zustand des Zahnfleisches überprüfen, damit sich die Entzündung nicht unbemerkt neu bildet.",
    kurz: "Wir möchten den Zustand Ihres Zahnfleisches nach der Parodontitis-Behandlung überprüfen.",
  },
  {
    id: "schiene",
    re: /(schiene|aufbiss|knirsch|\bkb\b)/,
    gruppe: "Schienen",
    topic: "Kontrolle Ihrer Schiene",
    zweck: (vor) =>
      `Sie haben ${vor ? `vor ${vor}` : "vor einiger Zeit"} eine Schiene von uns bekommen. ` +
      "Wir möchten Sitz und Zustand der Schiene kontrollieren und sie bei Bedarf anpassen.",
    kurz: "Wir möchten Sitz und Zustand Ihrer Schiene kontrollieren.",
  },
  {
    id: "fuellung",
    re: /(fuellung|\bkch\b|\bkons\b|komposit|inlay|onlay|restauration)/,
    gruppe: "Füllungen",
    topic: "Kontrolle Ihrer Füllung",
    zweck: (vor) =>
      `${vor ? `Vor ${vor}` : "Vor einiger Zeit"} wurde eine Füllung gelegt. ` +
      "Wir rufen an, um die Füllung zu kontrollieren — ob sie weiterhin dicht und intakt ist.",
    kurz: "Wir möchten kontrollieren, ob Ihre Füllung weiterhin dicht und intakt ist.",
  },
  {
    id: "zahnersatz",
    re: /(zahnersatz|eingliederung|krone|bruecke|prothese|teleskop|veneer|\bze\b)/,
    gruppe: "Zahnersatz",
    topic: "Kontrolle Ihres Zahnersatzes",
    zweck: (vor) =>
      `${vor ? `Vor ${vor}` : "Vor einiger Zeit"} wurde Ihr Zahnersatz eingegliedert. ` +
      "Zur Einhaltung unserer Qualitätssicherung möchten wir den Zahnersatz jetzt kontrollieren.",
    kurz: "Wir möchten Ihren Zahnersatz im Rahmen unserer Qualitätssicherung kontrollieren.",
  },
];

// Nicht verhandelbar, steht in JEDER Kontroll-Fokus-Instruktion: Lisa darf
// die zurueckliegende Behandlung NIE als neues Angebot verkaufen.
const KONTROLL_VERBOT =
  "WICHTIG: Es geht um einen reinen KONTROLLTERMIN. Biete NIEMALS an, die damalige Behandlung erneut oder neu durchzuführen " +
  "(nichts 'eingliedern lassen', keine neue Füllung, kein neues Implantat, keine neue Schiene) — " +
  "es geht ausschließlich darum, den Zustand zu überprüfen. Betone freundlich, dass der letzte Termin schon länger zurückliegt.";

/**
 * Kontroll-Fokus fuer ein Recall-Motiv. null => Motiv traegt selbst schon
 * Kontroll-/Beratungs-Charakter, der Katalog-Weg bleibt.
 * source "recall": overdueDays = Ueberfaelligkeit => Behandlung liegt
 * MINDESTENS so lange zurueck ("vor über X"). source "campaign":
 * overdueDays = Zeit seit letztem Besuch ("vor etwa X"). Nie mehr behaupten,
 * als die Daten hergeben.
 */
export function recallKontrollFokus({ visitMotiveName, overdueDays = 0, source = "recall" } = {}) {
  const motiv = s(visitMotiveName);
  if (!motiv) return null;
  const folded = foldGerman(motiv);
  if (KONTROLL_SCHON_RE.test(folded)) return null;
  const fall = KONTROLL_FAELLE.find((f) => f.re.test(folded)) || null;
  // Kein benannter Behandlungs-Fall => Katalog-Weg bleibt (dort liegen fuer
  // Vorsorge/Kontrolle/20 Fachrichtungen die richtigen Texte). Weitere
  // Faelle ("usw.") kommen auf Chef-Zuruf in KONTROLL_FAELLE dazu.
  if (!fall) return null;
  const span = spanDativ(overdueDays);
  const vor = span ? (source === "campaign" ? `etwa ${span}` : `über ${span}`) : "";
  return {
    id: fall.id,
    gruppe: fall.gruppe,
    topic: fall.topic,
    anlass: `${fall.topic} — der zugehörige Termin („${motiv}“) liegt ${vor ? `${vor}` : "längere Zeit"} zurück.`,
    purpose: fall.zweck(vor),
    purposeShort: fall.kurz,
  };
}

// Die Regeln sind der nicht verhandelbare Kern jeder Instruktion.
const CALL_RULES =
  "Regeln: Stelle keine Diagnosen, nenne keine Preise und gib keine Heilversprechen. " +
  "Kein Druck: ein klares Nein (kein Interesse) akzeptierst du freundlich. " +
  "Medizinische Fragen beantwortest du nicht, sondern bietest einen Rückruf der Praxis an. " +
  "Wünscht jemand keine Anrufe mehr, bestätige das ausdrücklich und verabschiede dich höflich.";

// W-OUTREACH-2 (Chef, 05.07.2026): "Es werden keine Terminwünsche verneint."
// Lisa hat zwei Kalender-Werkzeuge (offer_slots, book_slot) und bucht LIVE im
// Gespräch. Kein "die Praxis meldet sich", solange die Werkzeuge funktionieren.
const LIVE_BOOKING_RULES =
  "Terminbuchung: Du hast Kalender-Werkzeuge. " +
  // 28.07.2026: slot_iso beim Auftrags-Termin WEGLASSEN — das LLM schrieb den
  // Zeitstempel ab und vertippte sich live im Jahr (2023 statt 2026), die
  // Buchung des voellig freien Slots platzte ("nicht mehr verfuegbar").
  "Sagt der Patient zu, rufe SOFORT book_slot auf — OHNE slot_iso, der angebotene Termin ist serverseitig hinterlegt. Bestätige den Termin ERST NACH der Werkzeug-Bestätigung verbindlich. " +
  "Passt der Termin nicht oder wünscht der Patient einen anderen Zeitpunkt, rufe offer_slots auf (den Wunsch, z. B. 'Donnerstag nachmittags', als wish übergeben) und biete die freien Termine an — jeder Terminwunsch bekommt ein konkretes Angebot, du lehnst NIE ab. " +
  "Wählt der Patient einen dieser Termine, übergib dessen iso-Wert UNVERÄNDERT als slot_iso an book_slot (nie selbst tippen). " +
  "Meldet book_slot, dass der Termin inzwischen vergeben ist, entschuldige dich kurz und biete die zurückgemeldeten Alternativen direkt an. " +
  "Funktionieren die Werkzeuge nicht, versprich nichts Festes, sondern kündige an, dass die Praxis kurzfristig mit Terminvorschlägen zurückruft.";

// Einwand-Sicherheit (Chef 28.07.2026: "Patienten erwarten diesen Anruf
// nicht. Lisa muss sich sicherlich verteidigen können — wer sind Sie, was
// wollen Sie, woher haben Sie meine Nummer, wo muss ich überhaupt hin?").
// Der Block steht FEST in jeder Recall-Instruktion und wird nie weggekürzt.
function einwandBlock({ praxis, practicePhone, practiceAddress }) {
  const saetze = [
    "Der Patient erwartet diesen Anruf nicht — beantworte Rückfragen ruhig und transparent, ohne auszuweichen:",
    `„Wer sind Sie?“ — Du bist Lisa, die Terminassistentin von ${praxis}.`,
    "„Woher haben Sie meine Nummer?“ — Aus der Patientenkartei: Der Patient ist bei uns in Behandlung gewesen, die Nummer ist dort hinterlegt und wird nur für Terminanliegen genutzt.",
    "„Was wollen Sie verkaufen?“ — Nichts: Es geht ausschließlich um einen fälligen Kontrolltermin, ein Nein genügt.",
  ];
  if (s(practiceAddress)) {
    saetze.push(`„Wo ist die Praxis / wo muss ich hin?“ — ${praxis}, ${s(practiceAddress)}.`);
  }
  if (s(practicePhone)) {
    saetze.push(`Bei Misstrauen: Der Patient kann jederzeit selbst in der Praxis anrufen und den Termin dort bestätigen — Telefon ${s(practicePhone)}.`);
  }
  return saetze.join(" ");
}

/**
 * Anruf-Instruktion für Lisa (Recall-/Lückenfüller-Anruf).
 * Kürzungs-Reihenfolge bei Überlänge: what -> consequence -> purpose->Short.
 * Regeln, Angebot und Abschluss werden NIE gekürzt.
 */
export function composeRecallCallInstruction({
  practiceName, practicePhone = "", practiceAddress = "",
  patientName, date, timeLabel, calendarName,
  visitMotiveName, overdueDays = 0, source = "campaign",
  outreach = null, campaignPrompt = "", liveBooking = false,
  chefHinweis = "",
} = {}) {
  const praxis = s(practiceName) || "der Praxis";
  const o = outreach || resolveOutreach({ visitMotiveName });
  const topic = o.topicLabel || s(visitMotiveName) || "ein fälliger Termin";

  const head = `Du rufst freundlich im Auftrag von ${praxis} an. Gesprächspartner: ${s(patientName) || "der Patient"}.`;

  const offer =
    `Angebot: Am ${dateDe(date)} um ${s(timeLabel)} Uhr${calendarName ? ` bei ${s(calendarName)}` : ""} ` +
    `ist kurzfristig ein Termin frei geworden. Frage, ob der Termin passt.`;
  // Mit Live-Buchung (W-OUTREACH-2) bucht Lisa selbst und bestätigt erst nach
  // der Werkzeug-Rückmeldung. Ohne Werkzeuge (Fallback) verspricht sie nichts
  // Festes — dann meldet sich die Praxis.
  const closing = liveBooking
    ? "Bei Zusage: buche SOFORT mit book_slot und bestätige den Termin erst nach der Werkzeug-Bestätigung. " +
      "Möchte der Patient lieber einen anderen Zeitpunkt: offer_slots aufrufen und die freien Termine anbieten — kein Terminwunsch wird abgelehnt. " +
      "Nur wenn der Patient gar keinen Termin möchte: bedanke dich freundlich und verabschiede dich."
    : "Bei Zusage: bestätige, dass die Praxis den Termin einträgt und sich zur Bestätigung meldet. " +
      "Bei Terminwunsch zu anderer Zeit: sichere zu, dass die Praxis kurzfristig mit passenden Vorschlägen zurückruft. " +
      "Bei Absage: bedanke dich freundlich.";

  // Motiv-Block: Kampagnen-Override (Stufe 1) ODER Katalog/Klasse/generisch.
  let motiveBlocks;
  let fokus = null;
  if (s(campaignPrompt)) {
    // WICHTIG (Vorfall 17.07.2026): KEINE Katalog-Auflösung des Motivnamens in
    // die Ansprache mischen. "KFO/KB Besprechung" fuzzy-matchte auf einen
    // fremden Katalog-Eintrag ("Schnarchschienen-Beratung") — Lisa sprach eine
    // falsche, nie vereinbarte Behandlung aus. Bei Praxis-Vorgaben zählt AUSSCHLIESSLICH
    // der Kampagnen-Prompt; er definiert vollständig, was Lisa sagt.
    motiveBlocks = [
      `Vorgaben der Praxis für dieses Gespräch (halte dich genau an Inhalt und Reihenfolge, erfinde keine Behandlung dazu): ${s(campaignPrompt)}`,
    ];
  } else {
    // Kontroll-Fokus (Chef 28.07.2026): Recall zu einer zurueckliegenden
    // Behandlung wird IMMER als Kontroll-Einladung gesprochen — nie als
    // Angebot, die Behandlung (erneut) durchzufuehren ("Zahnersatz
    // eingliedern lassen" war der Live-Fehlgriff).
    fokus = recallKontrollFokus({ visitMotiveName, overdueDays, source });
    if (fokus) {
      motiveBlocks = [
        `Anlass: ${fokus.anlass}`,
        `Hintergrund, den du sinngemäß erklären darfst: ${fokus.purpose}`,
        KONTROLL_VERBOT,
      ];
    } else {
      const anlass =
        `Anlass: „${topic}“ ist laut Erinnerungssystem der Praxis wieder fällig` +
        `${o.texts.intervalDe ? ` — empfohlen wird der Termin ${o.texts.intervalDe}` : ""}.` +
        overduePhrase(overdueDays, source);
      motiveBlocks = [
        anlass,
        o.texts.purpose ? `Hintergrund, den du sinngemäß erklären darfst: ${o.texts.purpose}` : "",
        o.texts.what ? `Falls gefragt wird, was bei dem Termin gemacht wird: ${o.texts.what}` : "",
        o.texts.consequence ? `Nur falls der Patient zögert, darfst du sachlich ergänzen: ${o.texts.consequence}` : "",
      ].filter(Boolean);
    }
  }

  // Chef-Vorgabe (28.07.2026: "clara bespricht den prompt mit mir und nimmt
  // korrekturen auf"): Diktierte Anpassungen des Praxisinhabers stehen als
  // eigener Block MIT VORRANG in der Instruktion und werden NIE weggekuerzt.
  const chefBlock = s(chefHinweis)
    ? `Ausdrückliche Vorgabe des Praxisinhabers für dieses Gespräch (hat bei Widersprüchen Vorrang): ${s(chefHinweis)}`
    : "";
  const rules = liveBooking ? [CALL_RULES, LIVE_BOOKING_RULES] : [CALL_RULES];
  // Einwand-Sicherheit gehoert zu den festen Bloecken (nie kuerzen): der
  // Patient erwartet den Anruf nicht, Identitaet/Nummer-Herkunft/Adresse
  // muessen IMMER sicher beantwortet werden.
  rules.push(einwandBlock({ praxis, practicePhone, practiceAddress }));
  const fixe = chefBlock ? [...rules, chefBlock] : rules;
  const assemble = (blocks) => [head, ...fixe, ...blocks, offer, closing].join(" ");

  // Kürzen bei Überlänge — von der entbehrlichsten Info zur wichtigsten.
  let blocks = motiveBlocks;
  let text = assemble(blocks);
  if (text.length > CALL_INSTRUCTION_LIMIT && !s(campaignPrompt)) {
    blocks = blocks.filter((b) => !b.startsWith("Falls gefragt wird"));
    text = assemble(blocks);
    if (text.length > CALL_INSTRUCTION_LIMIT) {
      blocks = blocks.filter((b) => !b.startsWith("Nur falls der Patient"));
      text = assemble(blocks);
    }
    const pShort = fokus ? fokus.purposeShort : o.texts.purposeShort;
    if (text.length > CALL_INSTRUCTION_LIMIT && pShort) {
      blocks = blocks.map((b) => b.startsWith("Hintergrund") ? `Hintergrund, den du sinngemäß erklären darfst: ${pShort}` : b);
      text = assemble(blocks);
    }
  }
  if (text.length > CALL_INSTRUCTION_LIMIT) {
    // Letzte Sicherung (z. B. überlanger Kampagnen-Prompt): Motiv-Teil kappen,
    // Regeln/Chef-Vorgabe/Angebot/Abschluss bleiben vollständig.
    const fixedLen = [head, ...fixe, offer, closing].join(" ").length + 2;
    const budget = Math.max(0, CALL_INSTRUCTION_LIMIT - fixedLen);
    const motivePart = blocks.join(" ").slice(0, budget > 1 ? budget - 1 : 0) + "…";
    text = [head, ...fixe, motivePart, offer, closing].join(" ");
  }
  return text;
}

/**
 * SMS mit Terminangebot (Erst-Kontakt für Nur-SMS-Consent oder Fallback nach
 * Nichterreichen). Formulierung mit Doppelpunkt umgeht Genus-Fallen
 * ("Ihre/Ihr Check-up"). Immer <= SMS_LIMIT.
 */
export function composeRecallSms({
  practiceName, practicePhone, patientName, date, timeLabel,
  visitMotiveName, outreach = null, claimUrl = "",
} = {}) {
  const praxis = s(practiceName) || "Ihrer Praxis";
  const phone = s(practicePhone);
  const o = outreach || resolveOutreach({ visitMotiveName });
  // Kontroll-Fokus (Chef 28.07.2026): auch die SMS spricht von der KONTROLLE
  // der zurueckliegenden Behandlung, nie von der Behandlung selbst
  // ("faellig: ZE Eingliederung" las sich wie ein neues Eingliedern).
  const fokus = recallKontrollFokus({ visitMotiveName });
  const topic = fokus ? fokus.topic : (o.topicLabel || s(visitMotiveName));
  const purposeShort = fokus ? fokus.purposeShort : o.texts.purposeShort;

  // Online-Zusage (Chef 28.07.2026): Mit Link sagt der Patient per Tipp zu —
  // die erste Zusage bucht den Slot fest (routes/zusage.js). Der Link darf
  // NIE gekappt werden, deshalb wird er nach dem Kuerzen angehaengt und sein
  // Platz vorher vom Budget abgezogen.
  const linkTeil = s(claimUrl) ? ` Direkt online zusagen: ${s(claimUrl)}` : "";
  const schluss = s(claimUrl)
    ? `wenn Sie möchten, sichern Sie sich den Termin über den Link — oder rufen Sie uns kurz an${phone ? ` unter ${phone}` : ""}.`
    : `wenn Sie möchten, rufen Sie uns kurz an${phone ? ` unter ${phone}` : ""}, dann reservieren wir ihn für Sie.`;

  const base = (withPurpose) =>
    `Guten Tag${s(patientName) ? ` ${s(patientName)}` : ""}, hier ist ${praxis}. ` +
    (topic
      ? `Laut unserem Erinnerungssystem ist bei Ihnen wieder ein Termin fällig: ${topic}. `
      : `Bei Ihnen ist laut unserem Erinnerungssystem wieder ein Termin fällig. `) +
    (withPurpose && purposeShort ? `${purposeShort} ` : "") +
    `Am ${dateDe(date)} um ${s(timeLabel)} Uhr ist kurzfristig ein Termin frei geworden — ` +
    schluss;

  const budget = SMS_LIMIT - linkTeil.length;
  let text = base(true);
  if (text.length > budget) text = base(false);
  if (text.length > budget) text = text.slice(0, budget - 1) + "…";
  return `${text}${linkTeil}`;
}

/**
 * Auto-Botschaft für das gezielte Einbestellen (gapfill_call_patient), wenn
 * der Chef KEINE eigene Botschaft diktiert hat. Kurz — sie läuft durch
 * composeInviteInstruction (Budget ~790) und wird dem Chef vorgelesen.
 */
export function buildAutoInviteMessage({ visitMotiveName, outreach = null } = {}) {
  const o = outreach || resolveOutreach({ visitMotiveName });
  // Kontroll-Fokus auch beim gezielten Einbestellen ohne Chef-Diktat.
  const fokus = recallKontrollFokus({ visitMotiveName });
  const topic = fokus ? fokus.topic : (o.topicLabel || s(visitMotiveName));
  if (!topic) return "";
  let msg = `Laut Erinnerungssystem ist wieder ein Termin fällig: ${topic}.`;
  const pShort = fokus ? fokus.purposeShort : o.texts.purposeShort;
  if (pShort && (msg.length + pShort.length) < 240) {
    msg += ` ${pShort}`;
  }
  return msg;
}
