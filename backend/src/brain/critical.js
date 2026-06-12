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
const DEADLINE_CUE = /(frist|bis zum|bis spaetestens|spaetestens (?:am|zum)|zahlbar bis|zahlungsziel|faellig am|einzureichen bis|antwort bis|rueckmeldung bis)/;

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
 * @returns {number|null} epoch ms (Tagesende) oder null
 */
export function extractDeadlineMs(text) {
  const t = fold(text).replace(/\s+/g, " ");

  // 1) "innerhalb von 14 tagen / zwei wochen" — relativ ab jetzt.
  const rel = t.match(/innerhalb von (\d{1,2}|einer|zwei|drei|vier) (tag|tagen|woche|wochen)/);
  if (rel) {
    const words = { einer: 1, zwei: 2, drei: 3, vier: 4 };
    const n = words[rel[1]] != null ? words[rel[1]] : Number(rel[1]);
    const days = /woche/.test(rel[2]) ? n * 7 : n;
    if (days >= 1 && days <= 90) return Date.now() + days * 86400000;
  }

  // 2) Numerisches Datum nach Frist-Stichwort: "frist ... 24.06.2026" / "bis zum 24.06."
  for (const m of t.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/g)) {
    const before = t.slice(Math.max(0, m.index - 60), m.index);
    if (!DEADLINE_CUE.test(before)) continue;
    const ms = parseDmy(m[1], m[2], m[3]);
    if (ms) return ms;
  }

  // 3) Ausgeschriebener Monat: "bis zum 24. juni 2026"
  for (const m of t.matchAll(/(\d{1,2})\.?\s+(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s*(\d{4})?/g)) {
    const before = t.slice(Math.max(0, m.index - 60), m.index);
    if (!DEADLINE_CUE.test(before)) continue;
    const ms = parseDmy(m[1], MONTHS[m[2]], m[3]);
    if (ms) return ms;
  }

  return null;
}

/**
 * Brisanz-Einschätzung über Betreff + Text (Mail) bzw. Patienten-Turns
 * (Telefonat). Deterministisch, keywords-basiert, mit Beleg-Zitat.
 *
 * @param {{subject?: string, text?: string}} input
 * @returns {{critical: boolean, category: string|null, label: string|null, quote: string, deadlineMs: number|null}}
 */
export function assessCritical({ subject = "", text = "" } = {}) {
  const raw = `${subject}\n${text}`;
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

  const deadlineMs = extractDeadlineMs(raw);

  return {
    critical: !!hitCat,
    category: hitCat?.id || null,
    label: hitCat?.label || null,
    quote,
    deadlineMs,
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
