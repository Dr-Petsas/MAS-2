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

/** "der erste" / "die zweite" / "nummer drei" / "der letzte" -> Kandidat. */
export function ordinalPick(hintLower, candidates = []) {
  const h = s(hintLower).toLowerCase();
  if (!h || !candidates.length) return null;
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
export function narrowByExactName(nameOrHintLower, candidates = []) {
  const h = ` ${s(nameOrHintLower).toLowerCase().replace(/\s+/g, " ")} `;
  if (h.trim().length < 5) return [];
  const hits = candidates.filter((p) => {
    const fn = fullName(p).toLowerCase();
    return fn.length >= 5 && h.includes(` ${fn} `);
  });
  return hits.length && hits.length < candidates.length ? hits : [];
}
