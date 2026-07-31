// ============================================================================
// Deutsche Phonetik fuer die Namenserkennung (Chef 31.07.2026).
//
// PURE Hilfsfunktionen (kein I/O, unit-testbar). Zweck: einen GESPROCHENEN,
// vom STT evtl. verhoerten Namen ("Termos", "Dermos") verlaesslich dem echten
// Patientennamen ("Thermos") zuordnen — unabhaengig von exakter Schreibweise.
//
// Kern ist die KOELNER PHONETIK (fuer Deutsch entwickelt): jeder Name wird zu
// einer Ziffernfolge, die den KLANG abbildet. Gleich klingende Namen bekommen
// denselben Code:
//     Thermos = Termos = Dermos = 2768
//     Meier   = Mayer  = Maier  = 67
// Damit kann die Suche verzeihen, ohne dass das STT perfekt sein muss.
// ============================================================================

function stripDiacritics(s) {
  return String(s || "")
    .replace(/ß/g, "ss")
    .replace(/ä/gi, "ae").replace(/ö/gi, "oe").replace(/ü/gi, "ue")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Ein einzelnes Namens-Token in seinen Koelner-Phonetik-Code (Ziffernfolge)
// umwandeln. Mehrwort-Namen bitte tokenweise verarbeiten (siehe phoneticKey).
export function koelnerPhonetikToken(word) {
  const w = stripDiacritics(word).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "";
  const n = w.length;
  const codeAt = (i) => {
    const c = w[i];
    const prev = i > 0 ? w[i - 1] : "";
    const next = i + 1 < n ? w[i + 1] : "";
    switch (c) {
      case "a": case "e": case "i": case "j": case "o": case "u": case "y":
        return "0";
      case "h": return "";
      case "b": return "1";
      case "p": return next === "h" ? "3" : "1";
      case "d": case "t":
        return "csz".includes(next) ? "8" : "2";
      case "f": case "v": case "w": return "3";
      case "g": case "k": case "q": return "4";
      case "c":
        if (i === 0) {
          return "ahkloqrux".includes(next) ? "4" : "8";
        }
        if ("sz".includes(prev)) return "8";
        return "ahkoqux".includes(next) ? "4" : "8";
      case "x":
        return "ckq".includes(prev) ? "8" : "48";
      case "l": return "5";
      case "m": case "n": return "6";
      case "r": return "7";
      case "s": case "z": return "8";
      default: return "";
    }
  };

  let raw = "";
  for (let i = 0; i < n; i++) raw += codeAt(i);

  // 1) aufeinanderfolgende gleiche Ziffern zusammenfassen
  let collapsed = "";
  for (const ch of raw) {
    if (ch !== collapsed[collapsed.length - 1]) collapsed += ch;
  }
  // 2) alle '0' entfernen AUSSER an erster Stelle
  if (!collapsed) return "";
  const head = collapsed[0];
  const tail = collapsed.slice(1).replace(/0/g, "");
  return head + tail;
}

// Ganzen (Mehrwort-)Namen in einen stabilen Phonetik-Schluessel bringen:
// tokenweise Koelner Phonetik, Tokens sortiert (Reihenfolge Vor-/Nachname egal),
// mit "-" verbunden. Leere Tokens fallen raus.
export function phoneticKey(name) {
  const toks = stripDiacritics(name).toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const codes = toks.map(koelnerPhonetikToken).filter(Boolean);
  codes.sort();
  return codes.join("-");
}

// Klingen zwei Namen gleich? (kompletter Schluessel identisch)
export function soundsSame(a, b) {
  const ka = phoneticKey(a);
  const kb = phoneticKey(b);
  return !!ka && ka === kb;
}

// Teilt sich mindestens EIN klanggleiches Token? (fuer Faelle, in denen nur der
// Nachname gesprochen wurde: "Termos" vs. "Xenofon Thermos").
export function sharesPhoneticToken(a, b) {
  const ca = new Set(stripDiacritics(a).toLowerCase().split(/[^a-z]+/).filter(Boolean).map(koelnerPhonetikToken).filter(Boolean));
  const cb = stripDiacritics(b).toLowerCase().split(/[^a-z]+/).filter(Boolean).map(koelnerPhonetikToken).filter(Boolean);
  return cb.some((c) => ca.has(c));
}

/**
 * Aus einer Kandidatenliste (echte Namen/Objekte) die phonetisch zum
 * gesprochenen Namen passenden herausfiltern. `getName` extrahiert den
 * Vergleichsnamen aus einem Kandidaten (Default: der String selbst).
 * Rueckgabe: Treffer mit vollem Schluessel-Match zuerst, dann Token-Match.
 */
export function phoneticCandidates(spoken, candidates, getName = (x) => x) {
  const full = [];
  const partial = [];
  for (const cand of candidates || []) {
    const name = getName(cand);
    if (!name) continue;
    if (soundsSame(spoken, name)) full.push(cand);
    else if (sharesPhoneticToken(spoken, name)) partial.push(cand);
  }
  return { full, partial };
}
