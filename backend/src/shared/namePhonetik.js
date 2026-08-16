/**
 * Unscharfe Namensauflösung fuer gesprochene Namen (Kölner Phonetik).
 *
 * WARUM: Das Telefon-STT (Parakeet) verstuemmelt ungewoehnliche und fremd-
 * sprachige Namen, und deutsche Namen haben ohnehin lautgleiche Schreib-
 * varianten. Belegt aus echten Anrufen dieser Praxis:
 *   - gesprochen "Peter Meyer"      -> Kartei "Peter Maier"
 *   - gesprochen "Frau Transauer"   -> Kartei "Nicole Thrandorf"
 *   - gesprochen "Hayla Ottmann"    -> Kartei "Haila El-Otmani"
 * Eine woertliche Suche findet in allen drei Faellen nichts, meldet "kein
 * Patient gefunden" und das Gespraech dreht sich im Kreis.
 *
 * VERFAHREN: Die Kölner Phonetik ist das deutsche Gegenstueck zu Soundex --
 * sie bildet gleich KLINGENDE Zeichenfolgen auf denselben Zifferncode ab.
 * Meyer/Maier/Mayer/Meier ergeben alle "67". Fuer verstuemmelte Namen genuegt
 * das nicht, darum wird zusaetzlich die Editierdistanz auf dem CODE und auf
 * der Rohschreibweise gewertet: so bleibt "Transauer" (27687) noch in Reich-
 * weite von "Thrandorf" (276273).
 *
 * Diese Datei liegt bewusst in shared/: Clara-Tools, Lisa-Anrufe und die
 * Kontaktkarte muessen DENSELBEN Namen finden, sonst ruft Lisa jemand anderen
 * an als die Karte zeigt.
 */

/** Umlaute/ß auflösen, Satzzeichen weg, alles gross. */
export function normalisiere(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[àáâãå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõ]/g, "o")
    .replace(/[ùúû]/g, "u")
    .replace(/ç/g, "c")
    .replace(/ñ/g, "n")
    .replace(/[^a-z]/g, "")
    .toUpperCase();
}

/**
 * Kölner Phonetik nach Postel (1969).
 * Rueckgabe: Zifferncode ohne Wiederholungen, Nullen nur an erster Stelle.
 */
export function koelnerPhonetik(text) {
  const s = normalisiere(text);
  if (!s) return "";
  const codes = [];

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const vor = s[i - 1] || "";   // Vorgaenger
    const nach = s[i + 1] || "";  // Nachfolger
    let code = null;

    switch (c) {
      case "A": case "E": case "I": case "J": case "O": case "U": case "Y":
        code = "0"; break;
      case "H":
        code = null; break; // traegt keinen eigenen Code
      case "B":
        code = "1"; break;
      case "P":
        code = nach === "H" ? "3" : "1"; break;
      case "D": case "T":
        code = "CSZ".includes(nach) ? "8" : "2"; break;
      case "F": case "V": case "W":
        code = "3"; break;
      case "G": case "K": case "Q":
        code = "4"; break;
      case "C":
        if (i === 0) {
          // Am Wortanfang: vor A,H,K,L,O,Q,R,U,X wie K, sonst wie S
          code = "AHKLOQRUX".includes(nach) ? "4" : "8";
        } else if ("SZ".includes(vor)) {
          code = "8";
        } else {
          code = "AHKOQUX".includes(nach) ? "4" : "8";
        }
        break;
      case "X":
        // Nach C, K, Q ist das X nur noch das S; sonst "ks"
        code = "CKQ".includes(vor) ? "8" : "48";
        break;
      case "L":
        code = "5"; break;
      case "M": case "N":
        code = "6"; break;
      case "R":
        code = "7"; break;
      case "S": case "Z":
        code = "8"; break;
      default:
        code = null;
    }
    if (code) codes.push(code);
  }

  const flach = codes.join("");
  // Wiederholungen zusammenfassen
  let ohneDoppel = "";
  for (const z of flach) {
    if (z !== ohneDoppel[ohneDoppel.length - 1]) ohneDoppel += z;
  }
  // Nullen nur an erster Stelle behalten
  return ohneDoppel[0] + ohneDoppel.slice(1).replace(/0/g, "");
}

/** Editierdistanz (Levenshtein), iterativ mit einer Zeile Speicher. */
export function editierdistanz(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let vorige = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const aktuelle = [i];
    for (let j = 1; j <= b.length; j++) {
      aktuelle[j] = Math.min(
        vorige[j] + 1,
        aktuelle[j - 1] + 1,
        vorige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    vorige = aktuelle;
  }
  return vorige[b.length];
}

/** Aehnlichkeit 0..1 aus der Editierdistanz. */
export function distanzAehnlichkeit(a, b) {
  const laenge = Math.max(String(a || "").length, String(b || "").length);
  if (!laenge) return 0;
  return 1 - editierdistanz(a, b) / laenge;
}

/**
 * Aehnlichkeit zweier Namensteile: 0..1.
 *
 * Gewichtung: der Klang zaehlt mehr als die Schreibweise -- genau darum geht
 * es hier. Vollstaendige Klanggleichheit (Meyer/Maier) gilt als sicherer
 * Treffer, auch wenn sich die Buchstaben deutlich unterscheiden.
 */
export function teilAehnlichkeit(a, b) {
  const na = normalisiere(a);
  const nb = normalisiere(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const pa = koelnerPhonetik(a);
  const pb = koelnerPhonetik(b);
  if (pa && pa === pb) return 0.97; // klanggleich -> praktisch sicher

  const klang = distanzAehnlichkeit(pa, pb);
  const schrift = distanzAehnlichkeit(na, nb);

  // Ein gemeinsamer Anfang ist bei STT-Verstuemmelungen das verlaesslichste
  // Signal ("Otmani" aus "El-Otmani", "Elot" aus "El-Otmani").
  let anfang = 0;
  const kurz = Math.min(na.length, nb.length);
  while (anfang < kurz && na[anfang] === nb[anfang]) anfang++;
  const anfangsBonus = kurz >= 3 ? Math.min(0.15, (anfang / kurz) * 0.15) : 0;

  // Enthaltensein: "Otmani" steckt in "ELOTMANI"
  const steckt = (na.length >= 4 && nb.includes(na))
    || (nb.length >= 4 && na.includes(nb));

  const basis = klang * 0.65 + schrift * 0.35 + anfangsBonus;
  return Math.min(0.95, steckt ? Math.max(basis, 0.82) : basis);
}

// Anreden und Titel sind KEINE Namensteile. Ohne diesen Filter zog "Frau" in
// "Frau Transauer" den Wert des richtigen Treffers unter die Schwelle (gemessen
// 0.57 -> 0.43) und ein falscher Eintrag rutschte nach oben.
const ANREDEN = new Set([
  "FRAU", "HERR", "HERRN", "FRAEULEIN", "DR", "DOKTOR", "PROF", "PROFESSOR",
  "PATIENT", "PATIENTIN", "PATIENTEN", "KOLLEGE", "KOLLEGIN",
]);

/** Die tatsaechlichen Namensworte einer Aeusserung (ohne Anrede/Titel). */
export function namensWorte(gesprochen) {
  return String(gesprochen || "")
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter((w) => {
      const n = normalisiere(w);
      return n.length >= 2 && !ANREDEN.has(n);
    });
}

/**
 * Aehnlichkeit eines gesprochenen Namens zu einem Kartei-Eintrag.
 *
 * Der gesprochene Name kann Vor- und Nachname in beliebiger Reihenfolge oder
 * nur einen von beiden enthalten ("Otmani", "Hayla Ottmann", "Frau Thrandorf").
 * Darum wird jedes gesprochene Wort gegen Vor- UND Nachname geprueft und der
 * beste Zuordnung gewertet.
 */
export function namensAehnlichkeit(gesprochen, eintrag) {
  const worte = namensWorte(gesprochen);
  if (!worte.length) return 0;

  const felder = [eintrag.vorname, eintrag.nachname]
    .map((f) => String(f || "").trim())
    .filter(Boolean);
  // Doppelnamen ("El-Otmani") zusaetzlich in Teile zerlegen
  const kandidatenFelder = [...felder];
  for (const f of felder) {
    for (const teil of f.split(/[-\s]+/)) {
      if (normalisiere(teil).length >= 3 && !kandidatenFelder.includes(teil)) {
        kandidatenFelder.push(teil);
      }
    }
  }
  if (!kandidatenFelder.length) return 0;

  // Bestes Feld je gesprochenem Wort, dann Mittelwert -- so zieht ein
  // Fuellwort den Wert nicht nach unten, ein falscher Nachname aber doch.
  const werte = worte.map((w) => Math.max(
    ...kandidatenFelder.map((f) => teilAehnlichkeit(w, f)),
  ));
  werte.sort((x, y) => y - x);

  // Ein einzelnes gesprochenes Wort: der beste Feldtreffer zaehlt.
  if (werte.length === 1) return werte[0];
  // Mehrere Woerter: die zwei besten Treffer tragen (Vor- + Nachname),
  // weitere Woerter zaehlen nur noch abgeschwaecht mit.
  const kern = (werte[0] + werte[1]) / 2;
  const rest = werte.slice(2);
  if (!rest.length) return kern;
  const restMittel = rest.reduce((s, v) => s + v, 0) / rest.length;
  return kern * 0.85 + restMittel * 0.15;
}

// ---------------------------------------------------------------------------
// Zwei Stufen -- und warum eine einzelne Schwelle nicht genuegt
// ---------------------------------------------------------------------------
// Gemessen an den echten Faellen dieser Praxis:
//   "Transauer"    -> Nicole Thrandorf      0.567  RICHTIG
//   "Heyla Money"  -> Ahlam El Mouhmouh     0.737  FALSCH (Clara erfand den Namen)
// Der falsche Treffer liegt HOEHER als der richtige. Keine Schwelle kann die
// beiden trennen -- die Zahl allein darf also nicht entscheiden.
//
// Deshalb zwei Stufen:
//   sicher    (>= 0.90 oder klanggleich): darf ohne Rueckfrage benutzt werden.
//   vorschlag (>= 0.55): wird als Frage angeboten ("Meinten Sie ...?"), NIE
//             stillschweigend verwendet -- erst recht nicht fuer einen Anruf.
// Damit landet Transauer als Rueckfrage beim Chef (er bestaetigt, fertig) und
// ein erfundener Name kann niemals einen Anruf auslösen.
export const SCHWELLE_SICHER = 0.90;
export const SCHWELLE_VORSCHLAG = 0.55;

/**
 * Kandidaten aus der Kartei zu einem gesprochenen Namen, bester zuerst.
 *
 * @param {string} gesprochen  Name wie verstanden ("Hayla Ottmann")
 * @param {Array<{vorname?:string,nachname?:string,id?:string}>} kartei
 * @param {{schwelle?:number, maximal?:number}} [opts]
 * @returns {Array<{eintrag:object, wert:number, klanggleich:boolean,
 *                  stufe:"sicher"|"vorschlag"}>}
 */
export function findeNamensKandidaten(gesprochen, kartei, opts = {}) {
  const schwelle = typeof opts.schwelle === "number"
    ? opts.schwelle : SCHWELLE_VORSCHLAG;
  const maximal = typeof opts.maximal === "number" ? opts.maximal : 5;
  if (!gesprochen || !Array.isArray(kartei) || !kartei.length) return [];

  const gesprochenCodes = namensWorte(gesprochen).map((w) => koelnerPhonetik(w));

  const treffer = [];
  for (const eintrag of kartei) {
    const wert = namensAehnlichkeit(gesprochen, eintrag);
    if (wert < schwelle) continue;
    const eintragCodes = [eintrag.vorname, eintrag.nachname]
      .filter(Boolean)
      .map((f) => koelnerPhonetik(f));
    const klanggleich = gesprochenCodes.some(
      (c) => c && c.length >= 2 && eintragCodes.includes(c),
    );
    treffer.push({
      eintrag,
      wert,
      klanggleich,
      stufe: (wert >= SCHWELLE_SICHER) ? "sicher" : "vorschlag",
    });
  }
  treffer.sort((a, b) => b.wert - a.wert);
  return treffer.slice(0, maximal);
}

/**
 * Urteil zu einem gesprochenen Namen: eindeutig, mehrdeutig oder unbekannt.
 *
 * Das ist die Schnittstelle, die die Tools benutzen sollten -- sie macht die
 * Entscheidung explizit, statt sie jedem Aufrufer erneut zu ueberlassen.
 *   { art: "eindeutig",  eintrag }            -> direkt verwenden
 *   { art: "mehrdeutig", kandidaten: [...] }  -> "Meinten Sie ...?" fragen
 *   { art: "unbekannt" }                      -> ehrlich sagen, nicht raten
 */
export function loeseNamenAuf(gesprochen, kartei, opts = {}) {
  const kandidaten = findeNamensKandidaten(gesprochen, kartei, opts);
  if (!kandidaten.length) return { art: "unbekannt", kandidaten: [] };

  const sichere = kandidaten.filter((k) => k.stufe === "sicher");
  // Genau ein sicherer Treffer und kein zweiter gleich guter -> eindeutig.
  if (sichere.length === 1
      && (kandidaten.length === 1 || kandidaten[1].wert < SCHWELLE_SICHER)) {
    return { art: "eindeutig", eintrag: sichere[0].eintrag, kandidaten };
  }
  return { art: "mehrdeutig", kandidaten };
}

