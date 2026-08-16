// ============================================================================
// Patienten-Disambiguierung — PURE Hilfsfunktionen (unit-testbar, kein I/O).
//
// Anlass (Gespräch 2026-06-11, "Stefan-Meier-Loop"): zwei Patienten hiessen
// identisch "Stefan Meier" -> Clara fragte woertlich "Stefan Meier oder
// Stefan Meier?" und drehte sich endlos im Kreis, weil
//   1. die gesprochenen Labels nicht unterscheidbar waren,
//   2. die Hint-Eingrenzung nur Vornamen/Jahrgang kannte — weder die vom
//      Chef genannte TELEFONNUMMER noch "der erste/zweite" noch der exakte
//      volle Name grenzten ein.
// Diese Datei macht die Aufloesung deterministisch: eindeutige Labels,
// Ordinal-Auswahl, Telefon-Fragment-Match, Exakt-Name-Match.
// ============================================================================

function s(v) {
  return v == null ? "" : String(v).trim();
}

export function birthYear(b) {
  const t = s(b);
  return /^\d{4}/.test(t) ? t.slice(0, 4) : "";
}

export function fullName(p) {
  return `${s(p.firstName)} ${s(p.lastName)}`.replace(/\s+/g, " ").trim();
}

export function patientLabel(p) {
  const name = fullName(p);
  const y = birthYear(p.birthDate);
  return y ? `${name} (Jahrgang ${y})` : name;
}

function canonPhoneDigits(raw) {
  let d = s(raw).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // Laendervorwahl auf nationale Schreibweise normalisieren: +49 177... == 0177...
  if (d.startsWith("49") && d.length >= 10) d = `0${d.slice(2)}`;
  return d;
}

function phoneDigits(p) {
  return canonPhoneDigits(p.mobilePhoneNumber || p.phone);
}

const ORDINAL_WORDS = ["der erste", "der zweite", "der dritte", "der vierte", "der fünfte", "der sechste"];

/**
 * Garantiert UNTERSCHEIDBARE gesprochene Labels fuer eine Kandidatenliste.
 * Stufen: Name -> + Jahrgang -> + Telefon-Endung -> + Ordinal.
 * "Stefan Meier oder Stefan Meier?" kann damit nicht mehr entstehen.
 */
export function distinctPatientLabels(patients = []) {
  const labels = patients.map((p) => fullName(p) || "Unbekannt");

  const dupes = (ls) => {
    const seen = new Map();
    ls.forEach((l, i) => seen.set(l, [...(seen.get(l) || []), i]));
    return [...seen.values()].filter((idx) => idx.length > 1).flat();
  };

  // Bei Namenskollision bekommt JEDER Betroffene sein bestes Merkmal —
  // Jahrgang, sonst Telefon-Endung, sonst "ohne Telefonnummer". Nur einen
  // der beiden zu markieren liesse den anderen weiter unkenntlich.
  for (const i of dupes(labels)) {
    const y = birthYear(patients[i].birthDate);
    if (y) {
      labels[i] = `${labels[i]} (Jahrgang ${y})`;
      continue;
    }
    const d = phoneDigits(patients[i]);
    labels[i] = d.length >= 3
      ? `${labels[i]}, Nummer endet auf ${d.slice(-3).split("").join(" ")}`
      : `${labels[i]}, ohne Telefonnummer`;
  }
  // Ordinal als letzte Rettung — spaetestens hier ist alles eindeutig.
  for (const i of dupes(labels)) {
    labels[i] = `${ORDINAL_WORDS[i] || `Nummer ${i + 1}`}: ${labels[i]}`;
  }
  return labels;
}

/**
 * Gesprochene Rueckfrage bei mehreren Treffern — nummeriert, mit
 * unterscheidbaren Labels und dem Hinweis auf die Ordinal-Antwort.
 */
export function disambiguationQuestion(patients = [], { max = 5 } = {}) {
  const pool = patients.slice(0, max);
  const labels = distinctPatientLabels(pool);
  const numbered = labels.map((l, i) => `${ORDINAL_WORDS[i] ? ORDINAL_WORDS[i].replace("der ", "") : i + 1}: ${l}`);
  const more = patients.length > max ? ` Und ${patients.length - max} weitere.` : "";
  // KEINE zitierbare Beispielantwort ("Sagen Sie: der erste") anhaengen —
  // das 4B-Modell hat die sonst woertlich als eigene Antwort uebernommen
  // (dlg-korrektur-Regression). Eine direkte Frage reicht; Ordinal, Jahrgang
  // und Telefonnummer versteht die Server-Eingrenzung ohnehin.
  const ask = pool.length === 2
    ? "Welchen meinen Sie — den ersten oder den zweiten?"
    : "Welchen meinen Sie?";
  return `Es gibt ${pool.length === 2 ? "zwei" : "mehrere"} Treffer — ${numbered.join("; ")}.${more} ${ask}`;
}

/**
 * Gesprochene Antwort, wenn zu einem Namen NICHTS gefunden wurde.
 *
 * Bis zum 16.08.2026 endeten diese Faelle in einer Sackgasse: "Kein Patient mit
 * dem Namen Transauer gefunden." — Punkt. Der Chef wiederholte daraufhin den
 * Namen, das Spracherkennen verhoerte sich identisch, Clara sagte wieder
 * dasselbe. Im Anruf vom 04.08.2026 gingen so sechs Zuege ohne einen einzigen
 * Fortschritt vorbei (Haila El-Otmani).
 *
 * Deshalb nennt die Antwort jetzt ZWEI Wege, die beide am Verhoerer
 * vorbeifuehren: buchstabieren (der Worker setzt Buchstaben und Tafelwoerter
 * wieder zu einem Namen zusammen, ``stt_postcorrect.buchstabiertes_zusammenziehen``)
 * oder Vorname plus Jahrgang (andere Woerter, anderer Klang, neue Chance).
 * Beides in EINEM Satz, damit bei einem zweiten Fehlschlag nichts wiederholt
 * werden muss — eine Zaehlung der Versuche braucht es dafuer nicht.
 *
 * Bewusst KEIN Namensvorschlag "Meinten Sie ...?": eine abgestufte
 * Klang-Aehnlichkeit waere hier gefaehrlich, weil der falsche Treffer hoeher
 * liegen kann als der richtige (gemessen 16.08.2026: "Transauer" liegt naeher
 * an "Thermos" als an der richtigen "Thrandorf"). Geraten wird nicht — siehe
 * die Stolperdraht-Pruefungen in ``backend/tests/test-patient-catalog.mjs``.
 *
 * @param {string} name   der gesuchte Name, so wie verstanden
 * @param {{quelle?: string}} [opts] ``quelle`` benennt, wo gesucht wurde
 */
export function nichtGefundenFrage(name, { quelle = "" } = {}) {
  const wen = String(name || "").trim();
  const wo = String(quelle || "").trim();
  const kopf = wen
    ? `Unter ${wen} finde ich ${wo ? `${wo} ` : ""}niemanden.`
    : `Ich finde ${wo ? `${wo} ` : ""}niemanden mit diesem Namen.`;
  // Keine zitierbare Beispielantwort (siehe disambiguationQuestion): das
  // 4B-Modell uebernimmt Musterantworten woertlich, statt die Frage zu stellen.
  return `${kopf} Buchstabieren Sie mir bitte den Nachnamen, oder nennen Sie mir Vornamen und Jahrgang.`;
}

/**
 * Ein Ordinal MIT Uhrzeit waehlt einen TERMINVORSCHLAG, keinen Patienten
 * ("Der erste, morgen um 12.05 Uhr" / "den zweiten um 11 Uhr 15").
 *
 * Vorfall 16.08.2026: Clara bot zwei freie Termine an, der Chef nahm den
 * ersten — und MAS las daraus das erste Element einer laengst veralteten
 * Patienten-Kandidatenliste und meldete einen wildfremden Namen zurueck.
 * Nur die UHRZEIT ist hier das Ausschluss-Signal: "der erste, der gestern da
 * war" oder "der zweite mit dem Termin am Montag" bleiben echte Patienten-
 * Auswahlen und muessen weiter funktionieren.
 */
const SLOT_TIME_RE = /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*uhr\b/i;

export function looksLikeSlotChoice(text) {
  return SLOT_TIME_RE.test(s(text));
}

/** "der erste" / "die zweite" / "nummer drei" / "der letzte" -> Kandidat. */
export function ordinalPick(hintLower, candidates = []) {
  const h = s(hintLower).toLowerCase();
  if (!h || !candidates.length) return null;
  if (looksLikeSlotChoice(h)) return null;
  if (/\b(letzte|letzter|letzten)\b/.test(h)) return candidates[candidates.length - 1];
  const map = [
    [/\b(erste|ersten|erster|eins|nummer 1|nummer eins)\b/, 0],
    [/\b(zweite|zweiten|zweiter|zwei|nummer 2|nummer zwei)\b/, 1],
    [/\b(dritte|dritten|dritter|drei|nummer 3|nummer drei)\b/, 2],
    [/\b(vierte|vierten|vierter|nummer 4|nummer vier)\b/, 3],
    [/\b(fünfte|fünften|fünfter|fuenfte|nummer 5|nummer fünf)\b/, 4],
  ];
  for (const [re, idx] of map) {
    if (re.test(h) && idx < candidates.length) return candidates[idx];
  }
  return null;
}

/**
 * Telefon-Fragment-Match: der Chef nennt eine (oft unvollstaendige) Nummer
 * ("0177 600 467"). Match = gemeinsamer Praefix von mindestens 6 Ziffern
 * oder Endungs-Match (>= 3 Ziffern, z.B. "endet auf 600").
 */
export function narrowByPhoneFragment(hintLower, candidates = []) {
  const said = canonPhoneDigits(s(hintLower).replace(/\D/g, ""));
  if (said.length < 3) return [];
  return candidates.filter((p) => {
    const d = phoneDigits(p);
    if (!d) return false;
    if (said.length >= 6) {
      let common = 0;
      while (common < Math.min(said.length, d.length) && said[common] === d[common]) common++;
      if (common >= 6) return true;
    }
    return d.endsWith(said) || said.endsWith(d);
  });
}

/**
 * Exakter Voll-Name-Match ("Stefan Meier" trifft Stefan Meier, aber nicht
 * Stefanie Meierhoefer). Grenzt nur ein, wenn das Ergebnis ECHT kleiner wird.
 */
function foldName(raw) {
  return ` ${s(raw).toLowerCase().replace(/[-']/g, " ").replace(/\s+/g, " ").trim()} `;
}

const NAME_PARTICLES = new Set([
  "el", "al", "ben", "bin", "van", "von", "de", "di", "da", "du", "le", "la",
]);

function nameTokens(raw) {
  return foldName(raw).trim().split(/\s+/).filter((t) => t.length >= 2);
}

export function narrowByExactName(nameOrHintLower, candidates = []) {
  const h = foldName(nameOrHintLower);
  if (h.trim().length < 5) return [];
  const hits = candidates.filter((p) => {
    const fn = foldName(fullName(p)).trim();
    return fn.length >= 5 && h.includes(` ${fn} `);
  });
  return hits.length && hits.length < candidates.length ? hits : [];
}

/**
 * Fast-exakter Name: alle echten Namenswörter der Anfrage stecken im Treffer.
 * "Haila El-Otmani" trifft "Haila El Otmani" und wirft Theresa Heldmann raus.
 * Bindestrich und Partikel (El/Van/De) zählen nicht als Unterschied.
 */
function tokenClose(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    diff += 1;
    if (diff > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

export function narrowByNearName(query, candidates = []) {
  const q = nameTokens(query).filter((t) => !NAME_PARTICLES.has(t));
  if (!q.length) return [];
  if (q.length === 1 && q[0].length < 5) return [];
  const exact = (candidates || []).filter((p) => {
    const have = new Set(nameTokens(fullName(p)));
    return q.every((t) => have.has(t));
  });
  if (exact.length && exact.length < candidates.length) return exact;
  // STT-Tipp: Hayla/Haila — Nachname exakt, Vorname Distanz 1.
  const fuzzy = (candidates || []).filter((p) => {
    const have = nameTokens(fullName(p)).filter((t) => !NAME_PARTICLES.has(t));
    if (!have.length) return false;
    const last = have[have.length - 1];
    const qLast = q[q.length - 1];
    if (last !== qLast && !tokenClose(last, qLast)) return false;
    return q.slice(0, -1).every((t) => have.slice(0, -1).some((u) => tokenClose(t, u)));
  });
  return fuzzy.length && fuzzy.length < candidates.length ? fuzzy : [];
}

/** "Den ersten Eintrag bitte" ist eine Auswahl, kein Patientenname. */
export function isOrdinalChoice(text) {
  const h = s(text).toLowerCase();
  if (!h || !ordinalPick(h, [{}, {}, {}, {}, {}])) return false;
  return stripRelativeRef(h).length < 3;
}

/**
 * Anschluss an das gerade Gesprochene ("von eben", "vorhin").
 * "letzte/r" fehlt bewusst — das ist Datum ("letzten Montag").
 */
export const CONTINUITY_RE = /\b(vorhin|vorher|eben|grad eben|gerade eben|von gerade|zuletzt|von vorhin|von eben)\b/i;

export function isContinuityPhrase(text) {
  return CONTINUITY_RE.test(s(text));
}

/**
 * Relative Woerter und Zeigewoerter entfernen. Was uebrig bleibt, ist der
 * echte Name — oder nichts ("Den ersten Eintrag bitte" / "der von eben").
 * "dieser Jens von eben" -> "Jens".
 */
export function stripRelativeRef(text) {
  return s(text)
    .replace(CONTINUITY_RE, " ")
    .replace(/\b(der|die|das|den|dem|dieser|diese|dieses|diesen|diesem|jener|jene|jenen|derselbe|dieselbe|denselben|bitte|eintrag\w*|vorschlag\w*|treffer\w*|nimm|nehmen|wir|patient\w*|kontakt\w*|karte\w*)\b/gi, " ")
    .replace(/\b(erste[rn]?|zweite[rn]?|dritte[rn]?|vierte[rn]?|fünfte[rn]?|fuenfte[rn]?|letzte[rn]?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reiner Rueckbezug, kein neuer Name — gegen die gemerkte Liste aufloesen. */
export function isPureRelativeRef(text) {
  const h = s(text);
  if (!h) return false;
  if (stripRelativeRef(h).length >= 3) return false;
  return !!(
    ordinalPick(h, [{}, {}, {}, {}, {}])
    || isContinuityPhrase(h)
    || /^(?:der|die|das|den|dem|dieser|diese|diesen|diesem)\b/i.test(h)
  );
}

// ============================================================================
// Gleiche-Person-Duplikate zusammenfassen (Chef-Regel 31.07.2026)
//
// Anlass: "Thermos" liefert DREI Treffer — Nadine Thermos (1985) und ZWEIMAL
// Xenofon Thermos (einer mit Jahrgang 1982, einer ganz ohne Geburtsdatum =
// doppelt angelegt). Bei doppelten Eintraegen mit gleichen Daten (oder nur
// minimal anders geschriebenem Namen) soll Clara einfach EINEN nehmen, statt
// den Nutzer in eine unaufloesbare "Xenofon oder Xenofon?"-Schleife zu treiben.
// NUR wirklich verschiedene Personen (Nadine vs. Xenofon) bleiben als echte
// Auswahl uebrig. Rein additiv — die bestehende Disambiguierung bekommt danach
// eine schon entdoppelte Liste.
// ============================================================================

function normName(v) {
  return s(v).toLowerCase().replace(/\s+/g, " ").trim();
}

// Levenshtein-Distanz (klein gehalten; nur fuer kurze Namens-Token genutzt).
function editDistance(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * Zwei Treffer sind DIESELBE Person, wenn Vor- und Nachname exakt gleich sind
 * (oder nur minimal abweichen = Tippfehler) UND die Geburtsjahre nicht
 * widersprechen (leeres Jahr passt zu jedem). Bei nur AEHNLICHEM Namen wird
 * zur Sicherheit ein uebereinstimmendes, echtes Geburtsjahr verlangt — damit
 * echte verschiedene Personen (Meier/Meyer) NICHT faelschlich verschmelzen.
 */
export function samePerson(a, b) {
  const lnA = normName(a.lastName), lnB = normName(b.lastName);
  const fnA = normName(a.firstName), fnB = normName(b.firstName);
  const nameExact = lnA === lnB && fnA === fnB && !!(lnA || fnA);
  const nameNear = lnA && lnB && fnA && fnB
    && editDistance(lnA, lnB) <= 1 && editDistance(fnA, fnB) <= 1;
  if (!nameExact && !nameNear) return false;
  const yA = birthYear(a.birthDate), yB = birthYear(b.birthDate);
  if (yA && yB && yA !== yB) return false;         // echte, verschiedene Jahre
  if (!nameExact && !(yA && yB && yA === yB)) return false; // Fast-Name nur mit gleichem Jahr
  return true;
}

// Vollstaendigerer Datensatz (Geburtsdatum, dann Telefon) als Rueckfall-Kriterium.
function completeness(p) {
  return (birthYear(p.birthDate) ? 2 : 0) + (phoneDigits(p) ? 1 : 0);
}

// Erstell-Zeitpunkt in Millisekunden aus verschiedenen moeglichen Formaten
// (ISO-String, Millis-Zahl, Firestore-Timestamp {seconds}/{_seconds}/toMillis).
// 0 = unbekannt (Feld wird von der Suche erst geliefert, wenn masSearchPatients
// es mitgibt) -> dann greift der Vollstaendigkeits-Rueckfall.
export function createdMillis(p) {
  const c = p && (p.createdAt ?? p.created ?? p.creationDate);
  if (c == null) return 0;
  if (typeof c === "number") return c;
  if (typeof c === "object") {
    if (typeof c.toMillis === "function") { try { return c.toMillis(); } catch { /* noop */ } }
    if (typeof c._seconds === "number") return c._seconds * 1000;
    if (typeof c.seconds === "number") return c.seconds * 1000;
  }
  const t = Date.parse(String(c));
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Fasst Treffer, die DIESELBE Person sind, zu je einem Eintrag zusammen.
 * Sieger-Wahl (Chef-Regel 31.07.2026): bei sonst gleichen/aehnlichen Daten,
 * aber unterschiedlichem Telefon/E-Mail zaehlt der ZULETZT erstellte (aktuellste)
 * Eintrag. Ist kein Erstell-Datum bekannt, gewinnt der vollstaendigste Datensatz.
 * Reihenfolge der zuerst gesehenen Personen bleibt erhalten; verschiedene
 * Personen bleiben getrennt.
 */
export function collapseSamePerson(patients = []) {
  const groups = [];
  for (const p of patients) {
    const g = groups.find((grp) => samePerson(grp[0], p));
    if (g) g.push(p); else groups.push([p]);
  }
  return groups.map((grp) => grp.slice().sort((x, y) => {
    const dc = createdMillis(y) - createdMillis(x); // neuester zuerst
    if (dc !== 0) return dc;
    return completeness(y) - completeness(x);       // sonst vollstaendigster
  })[0]);
}
