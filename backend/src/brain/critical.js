// ============================================================================
// Eskalations-Radar + Fristen-Wächter (Nacht 12.06.2026).
//
// "Wichtiger ist es, dringende Aufgaben zu betonen … Anwaltsschreiben, Anrufe
// von der Kammer, stressende Patienten, Rechnungen in Mahnstufe, Pfändungen."
// (O-Ton Chef). Dieses Modul beantwortet deterministisch zwei Fragen über
// JEDE eingehende Kommunikation (Mail wie Telefonat):
//
//   1. Ist das BRISANT?  -> signals.critical + Kategorie (anwalt, behoerde,
//      mahnung, pfaendung, eskalation) — bewusst eng gefasste Schlüsselwörter,
//      lieber einen Treffer verpassen als täglich falschen Alarm schlagen.
//   2. Steckt eine FRIST drin? -> deadlineMs (epoch), aus "bis zum 24.06.",
//      "Frist: 24. Juni 2026", "innerhalb von 14 Tagen", "zahlbar bis …".
//
// Kritische Events erscheinen ZUERST: im Morgen-Moment ("first thing to do"),
// im Abend-Moment und als rote Liste im Cockpit. Keine Statistik, keine
// Umsatzzahlen — nur das, was nicht liegen bleiben darf.
// ============================================================================

// Umlaut-Faltung wie im extractor (lokal dupliziert, um keinen Import-Zyklus
// extractor<->critical zu schaffen — beide brauchen einander).
function fold(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

// Muster in GEFALTETER ASCII-Form (fold() macht ä->ae usw.), Wortgrenzen wo
// sinnvoll. Reihenfolge = Anzeige-Priorität bei Mehrfach-Treffern.
const CATEGORIES = [
  {
    id: "pfaendung",
    label: "Pfändung/Vollstreckung",
    patterns: [/\bpfaendung\b/, /\bkontopfaendung\b/, /\bzwangsvollstreckung\b/, /\bgerichtsvollzieher\b/, /\bvollstreckungsbescheid\b/],
  },
  {
    id: "anwalt",
    label: "Anwaltsschreiben/Rechtliches",
    patterns: [
      /\brechtsanwalt\b/, /\brechtsanwaelt/, /\bkanzlei\b/, /\babmahnung\b/,
      /\bklage\b/, /\bklageschrift\b/, /\beinstweilige\b/, /\bunterlassung/,
      /\bschadensersatz/, /\bschmerzensgeld\b/, /\brechtsstreit\b/, /\bmahnbescheid\b/,
      /\banwalt eingeschaltet\b/, /\bmein anwalt\b/, /\bmeinem anwalt\b/, /\brechtliche schritte\b/,
    ],
  },
  {
    id: "behoerde",
    label: "Kammer/Behörde",
    patterns: [
      /\bzahnaerztekammer\b/, /\baerztekammer\b/, /\bkammer\b/, /\bkzv\b/,
      /\bgesundheitsamt\b/, /\bamtsgericht\b/, /\blandgericht\b/, /\bstaatsanwalt/,
      /\bordnungsamt\b/, /\bfinanzamt\b/, /\bbetriebspruefung\b/, /\bgewerbeaufsicht\b/,
      /\bberufsaufsicht\b/, /\baufsichtsbehoerde\b/, /\bdatenschutzbehoerde\b/,
    ],
  },
  {
    id: "mahnung",
    label: "Mahnung/Inkasso",
    patterns: [
      /\bmahnung\b/, /\bmahnstufe\b/, /\bletzte zahlungsaufforderung\b/,
      /\binkasso\b/, /\bzahlungsverzug\b/, /\bverzugszinsen\b/,
      /\b(?:2|3|zweite|dritte|letzte)\.?\s*mahnung\b/,
    ],
  },
  {
    id: "eskalation",
    label: "Eskalierender Kontakt",
    patterns: [
      /\banzeige erstatte/, /\bstrafanzeige\b/, /\ban die presse\b/,
      /\bbei der kammer melden\b/, /\bkammer einschalten\b/,
      /\bnie wieder\b.{0,30}\bbezahl/, /\bich verklage\b/,
    ],
  },
];

// Frist-Erkennung: Datum in der Nähe eines Frist-Worts, oder relative Angabe.
const MONTHS = {
  januar: 1, februar: 2, maerz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};
// W-STABIL-8 (28.07.2026): um Behoerden-/Anwalts-/Zahlungs-Formulierungen
// erweitert ("Widerspruch bis ...", "Zahlungsfrist: ...", "zu zahlen bis ...").
const DEADLINE_CUE = /(frist|bis zum|bis spaetestens|spaetestens (?:am|zum)|zahlbar bis|zahlungsziel|faellig am|einzureichen bis|antwort bis|rueckmeldung bis|widerspruch|einspruch|stellungnahme|nachfrist|zu zahlen bis|zahlung bis|begleichen|ueberweisen sie|bis einschliesslich)/;

// STARKE Frist-Woerter: eindeutig rechtlich/zahlungsbezogen. Erster Live-Lauf
// der Wiedervorlage (28.07.2026): Werbemails ("Angebot nur bis zum 24.07.",
// FLYERALARM) und lockere Patienten-Mails landeten ueber das schwache
// "bis zum" als "Frist" auf der Liste. Schwache Treffer bleiben fuer die rote
// Liste erhalten (deadlineMs), aber nur starke tragen deadlineStrong=true —
// und nur die (plus Kritisches/Rechnungen) erscheinen auf der Wiedervorlage.
const DEADLINE_CUE_STRONG = /(frist|widerspruch|einspruch|stellungnahme|zahlbar|zahlungsziel|nachfrist|faellig am|einzureichen bis|zu zahlen|zahlung bis|begleichen|ueberweisen sie|spaetestens (?:am|zum)|mahnung|vollstreckung)/;

function parseDmy(d, m, y) {
  const day = Number(d);
  const month = Number(m);
  let year = y != null ? Number(y) : null;
  if (year != null && year < 100) year += 2000;
  if (!day || !month || day > 31 || month > 12) return null;
  const now = new Date();
  if (year == null) {
    // "bis zum 24.06." — gemeint ist das nächste Vorkommen dieses Datums.
    year = now.getFullYear();
    const probe = new Date(year, month - 1, day, 23, 59);
    if (probe.getTime() < now.getTime() - 86400000) year += 1;
  }
  const dt = new Date(year, month - 1, day, 23, 59);
  return Number.isFinite(dt.getTime()) ? dt.getTime() : null;
}

/**
 * Frist aus deutschem Fließtext, NUR wenn ein Frist-Stichwort in der Nähe
 * steht (max. 60 Zeichen davor) — ein nacktes Datum ist keine Frist.
 * `strong` sagt, ob ein STARKES (rechtlich/zahlungsbezogenes) Frist-Wort in
 * der Nähe stand — nur solche Fristen gehören auf die Wiedervorlage.
 * @returns {{ms: number, strong: boolean}|null}
 */
export function extractDeadlineInfo(text) {
  const t = fold(text).replace(/\s+/g, " ");

  // 1) "innerhalb von 14 tagen / zwei wochen" — relativ ab jetzt.
  const rel = t.match(/innerhalb von (\d{1,2}|einer|zwei|drei|vier) (tag|tagen|woche|wochen)/);
  if (rel) {
    const words = { einer: 1, zwei: 2, drei: 3, vier: 4 };
    const n = words[rel[1]] != null ? words[rel[1]] : Number(rel[1]);
    const days = /woche/.test(rel[2]) ? n * 7 : n;
    if (days >= 1 && days <= 90) {
      // "innerhalb von 14 Tagen ZU ZAHLEN" — das starke Wort steht oft dahinter.
      const umfeld = t.slice(Math.max(0, rel.index - 60), rel.index + rel[0].length + 60);
      return { ms: Date.now() + days * 86400000, strong: DEADLINE_CUE_STRONG.test(umfeld) };
    }
  }

  // 2) Numerisches Datum nach Frist-Stichwort: "frist ... 24.06.2026" / "bis zum 24.06."
  for (const m of t.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/g)) {
    const before = t.slice(Math.max(0, m.index - 60), m.index);
    if (!DEADLINE_CUE.test(before)) continue;
    const ms = parseDmy(m[1], m[2], m[3]);
    if (ms) return { ms, strong: DEADLINE_CUE_STRONG.test(before) };
  }

  // 3) Ausgeschriebener Monat: "bis zum 24. juni 2026"
  for (const m of t.matchAll(/(\d{1,2})\.?\s+(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s*(\d{4})?/g)) {
    const before = t.slice(Math.max(0, m.index - 60), m.index);
    if (!DEADLINE_CUE.test(before)) continue;
    const ms = parseDmy(m[1], MONTHS[m[2]], m[3]);
    if (ms) return { ms, strong: DEADLINE_CUE_STRONG.test(before) };
  }

  return null;
}

/** Kompatibel zur alten API: nur die Frist (epoch ms) oder null. */
export function extractDeadlineMs(text) {
  return extractDeadlineInfo(text)?.ms ?? null;
}

// ---------------------------------------------------------------------------
// W-STABIL-8 Rechnungs-/Zahlungs-Waechter (28.07.2026): Verkaufskern 24/25.
// Deterministisch wie der Rest dieses Moduls — lieber einen Treffer verpassen
// als taeglich Fehlalarm. WICHTIG (Chef-Regel): Betraege werden NIE gesprochen,
// nur auf der Karte gezeigt — dieses Modul extrahiert nur, spricht nicht.
// ---------------------------------------------------------------------------

// Rechnungs-/Zahlungs-Vorgang? Eng gefasste Stichworte (gefaltete Form).
const INVOICE_CUE = /(rechnung\b|rechnungsbetrag|rechnungsnummer|rechnungs-?nr|zahlungsaufforderung|zahlungserinnerung|zahlbar|zahlungsziel|offene[rn]? betrag|offene forderung|forderung in hoehe|kostennote|honorarnote|mahnung|inkasso|ueberweisen sie|verwendungszweck|zu zahlen|begleichen)/;

/** Steckt ein Rechnungs-/Zahlungsvorgang im Text? (deterministisch) */
export function detectInvoiceOrPayment(text) {
  return INVOICE_CUE.test(fold(text).replace(/\s+/g, " "));
}

const AMOUNT_NEAR_CUE = /(betrag|summe|forderung|rechnung|gesamt|zu zahlen|zahlbar|offen|ueberweisen|hoehe von)/;

/**
 * Geldbetrag aus deutschem Fliesstext, in Cent. Formate: "1.234,56 EUR",
 * "234,50 €", "EUR 1.234,56", "150 Euro". Bei mehreren Betraegen gewinnt der
 * mit Zahlungs-Stichwort in der Naehe (40 Zeichen davor), sonst der groesste.
 * Unplausibles (> 1 Mio Euro, 0) wird verworfen.
 * @returns {number|null} Cent oder null
 */
export function extractAmountCents(text) {
  const t = fold(text).replace(/\s+/g, " ");
  const found = [];
  const push = (idx, euroStr, centStr) => {
    const euros = Number(String(euroStr).replace(/\./g, ""));
    const cents = centStr != null ? Number(String(centStr).padEnd(2, "0").slice(0, 2)) : 0;
    if (!Number.isFinite(euros) || !Number.isFinite(cents)) return;
    const total = euros * 100 + cents;
    if (total <= 0 || total > 100_000_000) return; // > 1 Mio € = vermutlich Muell
    const before = t.slice(Math.max(0, idx - 40), idx);
    found.push({ cents: total, nearCue: AMOUNT_NEAR_CUE.test(before) });
  };
  // "1.234,56 eur|euro|€"  (Waehrung dahinter)
  for (const m of t.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:eur(?:o)?\b|€)/g)) {
    push(m.index, m[1], m[2]);
  }
  // "eur|€ 1.234,56"  (Waehrung davor)
  for (const m of t.matchAll(/(?:eur|€)\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g)) {
    push(m.index, m[1], m[2]);
  }
  if (!found.length) return null;
  const cued = found.filter((f) => f.nearCue);
  const pool = cued.length ? cued : found;
  return pool.reduce((max, f) => Math.max(max, f.cents), 0) || null;
}

/** Cent -> Kartentext "1.234,56 €" (NUR fuer Karten, nie fuer Sprache). */
export function formatEuro(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${(n / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

// 27.07.2026 (Live 17:15, Heads-up): Im Tages-Lagebild standen als
// Auffälligkeiten "Post von Kammer oder Behörde" — einmal von
// „Hörgerät-Sensation 2026", einmal von prepaid@reichelt.de, dazu 26 weitere
// Punkte. Werbemails also. Ursache ist die PFLICHT-FUSSZEILE deutscher
// Geschäftsmails: „Registergericht: Amtsgericht München HRB 12345",
// „zuständige Kammer: IHK …". Das Eskalations-Radar las das als Behördenpost.
// Der Rechtsanhang gehört nicht zur Nachricht — er wird vor der Bewertung
// abgeschnitten. Der eigentliche Text (und damit jede echte Drohung, Mahnung
// oder Kammer-Anfrage im Fließtext) bleibt unangetastet.
const FUSSZEILEN_RE = new RegExp(
  "^\\s*(?:-{2,}\\s*$|_{3,}\\s*$"
  + "|impressum\\b|registergericht\\b|handelsregister\\b|amtsgericht\\s+\\w+\\s+hr"
  + "|sitz\\s+der\\s+gesellschaft\\b|gesch(?:ä|ae)ftsf(?:ü|ue)hrer\\b"
  + "|ust[-\\s]?idnr\\b|umsatzsteuer-?identifikationsnummer\\b"
  + "|steuernummer\\b|zust(?:ä|ae)ndige\\s+kammer\\b|aufsichtsbeh(?:ö|oe)rde\\b"
  + "|diese\\s+e-?mail\\s+(?:und|enth)|newsletter\\s+abbestellen\\b"
  + "|vom\\s+newsletter\\s+abmelden\\b|unsubscribe\\b|abmelden\\b)",
  "i");

/** Rechts-/Werbe-Fusszeile abschneiden (ab der ersten Marker-Zeile). */
export function ohneFusszeile(text) {
  const zeilen = String(text || "").split(/\r?\n/);
  const i = zeilen.findIndex((z) => FUSSZEILEN_RE.test(z));
  // Nur schneiden, wenn noch echter Text davor steht — sonst bewerten wir nichts.
  if (i <= 0) return String(text || "");
  return zeilen.slice(0, i).join("\n");
}

/**
 * Brisanz-Einschätzung über Betreff + Text (Mail) bzw. Patienten-Turns
 * (Telefonat). Deterministisch, keywords-basiert, mit Beleg-Zitat.
 *
 * @param {{subject?: string, text?: string}} input
 * @returns {{critical: boolean, category: string|null, label: string|null, quote: string, deadlineMs: number|null}}
 */
export function assessCritical({ subject = "", text = "" } = {}) {
  const raw = ohneFusszeile(`${subject}\n${text}`);
  const haystack = fold(raw).replace(/\s+/g, " ");

  let hitCat = null;
  let quote = "";
  for (const cat of CATEGORIES) {
    const pattern = cat.patterns.find((p) => p.test(haystack));
    if (!pattern) continue;
    hitCat = cat;
    // Beleg: die Original-Zeile, in der das Muster zuschlägt.
    for (const line of raw.split(/\n+/)) {
      if (pattern.test(fold(line))) {
        const trimmed = line.trim();
        quote = trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed;
        break;
      }
    }
    break; // erste (= höchstpriorisierte) Kategorie gewinnt
  }

  const deadline = extractDeadlineInfo(raw);

  // W-STABIL-8: Rechnungs-/Zahlungssignal + Betrag (Betrag NIE sprechen,
  // nur Karte). Additiv — bestehende Aufrufer ignorieren die neuen Felder.
  const invoiceOrPayment = detectInvoiceOrPayment(raw);
  const amountCents = invoiceOrPayment || hitCat ? extractAmountCents(raw) : null;

  return {
    critical: !!hitCat,
    category: hitCat?.id || null,
    label: hitCat?.label || null,
    quote,
    deadlineMs: deadline?.ms || null,
    deadlineStrong: !!deadline?.strong,
    invoiceOrPayment,
    amountCents,
  };
}

/** Gesprochene Kurzbezeichnung für Briefings ("ein Anwaltsschreiben"). */
export const SPOKEN_CATEGORY = Object.freeze({
  pfaendung: "eine Pfändungssache",
  anwalt: "ein Anwaltsschreiben",
  behoerde: "Post von Kammer oder Behörde",
  mahnung: "eine Mahnung",
  eskalation: "einen eskalierenden Kontakt",
});
