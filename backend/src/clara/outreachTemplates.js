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
export const CALL_INSTRUCTION_LIMIT = 2100;
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
  "Sagt der Patient zu, rufe SOFORT book_slot mit dem angebotenen Termin (slot_iso) auf und bestätige den Termin ERST NACH der Werkzeug-Bestätigung verbindlich. " +
  "Passt der Termin nicht oder wünscht der Patient einen anderen Zeitpunkt, rufe offer_slots auf (den Wunsch, z. B. 'Donnerstag nachmittags', als wish übergeben) und biete die freien Termine an — jeder Terminwunsch bekommt ein konkretes Angebot, du lehnst NIE ab. " +
  "Meldet book_slot, dass der Termin inzwischen vergeben ist, entschuldige dich kurz und biete die zurückgemeldeten Alternativen direkt an. " +
  "Funktionieren die Werkzeuge nicht, versprich nichts Festes, sondern kündige an, dass die Praxis kurzfristig mit Terminvorschlägen zurückruft.";

/**
 * Anruf-Instruktion für Lisa (Recall-/Lückenfüller-Anruf).
 * Kürzungs-Reihenfolge bei Überlänge: what -> consequence -> purpose->Short.
 * Regeln, Angebot und Abschluss werden NIE gekürzt.
 */
export function composeRecallCallInstruction({
  practiceName, patientName, date, timeLabel, calendarName,
  visitMotiveName, overdueDays = 0, source = "campaign",
  outreach = null, campaignPrompt = "", liveBooking = false,
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

  const rules = liveBooking ? [CALL_RULES, LIVE_BOOKING_RULES] : [CALL_RULES];
  const assemble = (blocks) => [head, ...rules, ...blocks, offer, closing].join(" ");

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
    if (text.length > CALL_INSTRUCTION_LIMIT && o.texts.purposeShort) {
      blocks = blocks.map((b) => b.startsWith("Hintergrund") ? `Hintergrund, den du sinngemäß erklären darfst: ${o.texts.purposeShort}` : b);
      text = assemble(blocks);
    }
  }
  if (text.length > CALL_INSTRUCTION_LIMIT) {
    // Letzte Sicherung (z. B. überlanger Kampagnen-Prompt): Motiv-Teil kappen,
    // Regeln/Angebot/Abschluss bleiben vollständig.
    const fixedLen = [head, ...rules, offer, closing].join(" ").length + 2;
    const budget = Math.max(0, CALL_INSTRUCTION_LIMIT - fixedLen);
    const motivePart = blocks.join(" ").slice(0, budget > 1 ? budget - 1 : 0) + "…";
    text = [head, ...rules, motivePart, offer, closing].join(" ");
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
  const topic = o.topicLabel || s(visitMotiveName);

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
    (withPurpose && o.texts.purposeShort ? `${o.texts.purposeShort} ` : "") +
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
  const topic = o.topicLabel || s(visitMotiveName);
  if (!topic) return "";
  let msg = `Laut Erinnerungssystem ist wieder ein Termin fällig: ${topic}.`;
  if (o.texts.purposeShort && (msg.length + o.texts.purposeShort.length) < 240) {
    msg += ` ${o.texts.purposeShort}`;
  }
  return msg;
}
