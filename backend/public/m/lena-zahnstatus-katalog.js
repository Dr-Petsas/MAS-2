/**
 * KZBV/EBZ Befundkürzel (Heil- und Kostenplan Zeile B) + Speech-Aliases.
 * Quelle: KZBV EBZ Anlage Befund-/Therapiekürzel (Stand 2022/2026).
 *
 * WICHTIG: f = fehlender Zahn (NICHT Füllung).
 * Füllungen sind kein EBZ-Befundkürzel → klinische Erweiterung "Fu" + Flächen (BMV-Z).
 */
(function (global) {
  "use strict";

  /** Offizielle EBZ-Befundkürzel (lowercase). */
  const BEFUND = {
    a: "Adhäsivbrücke (Anker)",
    ab: "Adhäsivbrücke (Brückenglied)",
    abw: "erneuerungsbedürftige Adhäsivbrücke (Brückenglied)",
    aw: "erneuerungsbedürftige Adhäsivbrücke (Anker)",
    b: "Brückenglied",
    bw: "erneuerungsbedürftiges Brückenglied",
    e: "ersetzter Zahn",
    ew: "ersetzter, aber erneuerungsbedürftiger Zahn",
    f: "fehlender Zahn",
    ix: "zu entfernendes Implantat",
    k: "klinisch intakte Krone",
    kw: "erneuerungsbedürftige Krone",
    pkw: "erneuerungsbedürftige Teilkrone",
    pw: "erhaltungswürdiger Zahn mit partiellen Substanzdefekten",
    r: "Wurzelstiftkappe mit ersetztem Zahn",
    rw: "erneuerungsbedürftige Wurzelstiftkappe",
    sb: "implantatgetragenes Brückenglied",
    sbw: "erneuerungsbedürftiges implantatgetragenes Brückenglied",
    se: "ersetzter Zahn (implantatgetragene Prothese)",
    sew: "erneuerungsbedürftiger ersetzter Zahn (Implantat-Prothese)",
    sk: "implantatgetragene intakte Krone",
    skw: "erneuerungsbedürftige implantatgetragene Krone",
    so: "implantatgetragenes Verbindungselement",
    sow: "erneuerungsbedürftiges implantatgetragenes Verbindungselement",
    st: "implantatgetragene Teleskopkrone",
    stw: "erneuerungsbedürftige implantatgetragene Teleskopkrone",
    t: "Teleskopkrone",
    t2w: "erneuerungsbedürftiges Sekundärteil einer Teleskopkrone",
    tw: "erneuerungsbedürftige Teleskopkrone",
    ur: "unzureichende Retention",
    ww: "erhaltungswürdiger Zahn mit weitgehender Zerstörung",
    x: "nicht erhaltungswürdiger Zahn",
    ")(": "Lückenschluss",
  };

  /** Klinisch — Anzeige im Schema: B=c (Karies), T=f+Flächen (Füllung). */
  const CLINICAL = {
    Fu: "Füllung (Therapie-Zeile: f + Flächen)",
    Ka: "Karies (Befund-Zeile: c)",
    WF: "Wurzelfüllung",
    LA: "Lokalanästhesie",
    Paro: "Parodontalbefund",
    Kief: "Kiefer / CMD",
  };

  /**
   * Schema-Notation (Zeile B vs T):
   * B: c=Karies, f=fehlend (KZBV), k/ww/x/…
   * T: f+MOD=Füllung, LA, WF, …
   */
  function markForLayer(code, surfaces) {
    const surfU = (surfaces || []).join("").toUpperCase();
    const surfL = (surfaces || []).join("").toLowerCase();
    if (code === "Ka") return "c" + surfL;
    if (code === "Fu") return "f" + surfU;
    if (code === "f") return "f";
    if (code === "LA") return "LA";
    if (code === "WF") return "WF";
    if (code === "Paro" || code === "Kief") return code === "Paro" ? "P" : "K";
    // KZBV / sonst: Kürzel + optional Flächen am Befund
    return String(code) + (surfL && code !== "Fu" ? surfL : "");
  }

  /** Wohin im Tages-Schema (02): befund | therapie | paro | kiefer */
  const LAYER_OF = {
    f: "befund", k: "befund", kw: "befund", b: "befund", bw: "befund",
    ww: "befund", pw: "befund", x: "befund", sk: "befund", t: "befund",
    pkw: "befund", ix: "befund", ")(": "befund",
    Ka: "befund",
    Fu: "therapie", WF: "therapie", LA: "therapie",
    Paro: "befund",
    Kief: "befund",
  };

  /** BMV-Z Füllungslage. */
  const SURFACES = {
    m: "mesial",
    o: "okklusal/inzisal",
    d: "distal",
    v: "vestibulär",
    b: "bukkal",
    l: "lingual/palatinal",
    i: "inzisal",
    z: "zervikal",
  };

  /**
   * Gesprochene Wörter → Kürzel (längere Phrasen zuerst matchen).
   * Reihenfolge: spezifisch vor generisch.
   */
  // WICHTIG: Jede Regel muss Umlaut- UND ASCII-Form treffen ("Brücke" wie
  // "Bruecke") — der Parser matcht seit 21.07. nachts auf dem ASCII-
  // gefalteten Text (Positions-Bindung), Garble-/Nachkorrektur-Pfade
  // liefern ohnehin beide Schreibweisen.
  const SPEECH = [
    { re: /erneuerungsbed(?:[uü]|ue)rftig(?:e|en)?\s+krone|krone\s+erneuern|kw\b/i, code: "kw" },
    { re: /teilkrone|pkw\b/i, code: "pkw" },
    { re: /\bkrone\b/i, code: "k" },
    { re: /erneuerungsbed(?:[uü]|ue)rftig(?:e|en)?\s+br(?:[uü]|ue)ckenglied|\bbw\b/i, code: "bw" },
    { re: /br(?:[uü]|ue)ckenglied|pontic/i, code: "b" },
    { re: /\bbr(?:[uü]|ue)cke\b/i, code: "b" },
    { re: /weitgehend(?:e|er)?\s+zerst(?:[oö]|oe)r|behandlungsbed(?:[uü]|ue)rftig|\bww\b/i, code: "ww" },
    { re: /partiell(?:e|er)?\s+substanz|\bpw\b/i, code: "pw" },
    // "muss extrahiert werden" = Befund x (Live 21.07.), nicht nur "Extraktion"
    { re: /nicht\s+erhaltungsw(?:[uü]|ue)rdig|zu\s+extrah|\bextraktion\b|extrahiert\s+werden|muss\s+(?:\w+\s+)?extrahiert|\bmuss\s+raus\b/i, code: "x" },
    // Plural/Voranstellung (Chef 21.07.: "13,14,15 fehlen", "es fehlen 23,24",
    // "fehlend sind 31 32") — \bfehl(t|en|end[e|er|en]) faengt alle Formen;
    // "Fehler"/"empfehlen" bleiben draussen (Wortgrenze + Suffix-Liste).
    { re: /\bfehl(?:t|en|end(?:e[rn]?)?)\b|zahn\s+fehlt/i, code: "f" },
    { re: /implantat\s+entfernen|\bix\b/i, code: "ix" },
    { re: /implantat\s*krone|\bsk\b/i, code: "sk" },
    { re: /\bimplantat\b/i, code: "sk" },
    { re: /teleskop|\bt\b(?!\w)/i, code: "t" },
    { re: /l(?:[uü]|ue)ckenschluss/i, code: ")(" },
    // Klinisch (kein EBZ-f) — Umlaute auch als ae/oe/ue (Garble-/ASCII-Pfad)
    { re: /f(?:[uü]|ue)llung|komposit|inlay|onlay|\bfu\b/i, code: "Fu" },
    { re: /\bkaries\b|kari(?:[oö]|oe)s|(?:^|[\s,;:])c(?=[\s,;:.]|$)/i, code: "Ka" },
    { re: /wurzelf(?:[uü]|ue)ll|guttapercha|\bwf\b/i, code: "WF" },
    { re: /lokalan(?:[aä]|ae)sthes|leitungsan(?:[aä]|ae)sthes|infiltrationsan|\ban(?:[aä]|ae)sthesie\b|\bultracain\b|\bubistesin\b/i, code: "LA" },
    { re: /sondiertiefen|taschentiefe|parodont|\bparo\b|\bbop\b/i, code: "Paro" },
    { re: /\bkiefergelenk\b|\bcmd\b|\bmyalgie\b/i, code: "Kief" },
  ];

  const SURFACE_SPEECH = [
    { re: /\bmesial\b|\bm\b(?!\w)/i, code: "m" },
    { re: /\bokklusal\b|\bocclus|\binzisal\b|\bo\b(?!\w)/i, code: "o" },
    { re: /\bdistal\b|\bd\b(?!\w)/i, code: "d" },
    { re: /\bvestibul(?:[aä]|ae)r\b|\bbukkal\b|\blabial\b|\bv\b(?!\w)/i, code: "v" },
    { re: /\blingual\b|\bpalatinal\b|\bl\b(?!\w)/i, code: "l" },
    { re: /\bzervikal\b|\bhals\b|\bz\b(?!\w)/i, code: "z" },
  ];

  /** FDI Wortzahlen (deutsch). */
  const WORD_FDI = {
    elf: 11, zwoelf: 12, zwolf: 12, dreizehn: 13, vierzehn: 14, fuenfzehn: 15, funfzehn: 15,
    sechzehn: 16, siebzehn: 17, achtzehn: 18,
    einundzwanzig: 21, zweiundzwanzig: 22, dreiundzwanzig: 23, vierundzwanzig: 24,
    fuenfundzwanzig: 25, funfundzwanzig: 25, sechsundzwanzig: 26, siebenundzwanzig: 27, achtundzwanzig: 28,
    einunddreissig: 31, einunddreißig: 31, zweiunddreissig: 32, zweiunddreißig: 32,
    dreiunddreissig: 33, dreiunddreißig: 33, vierunddreissig: 34, vierunddreißig: 34,
    fuenfunddreissig: 35, fuenfunddreißig: 35, funfunddreissig: 35, funfunddreißig: 35,
    sechsunddreissig: 36, sechsunddreißig: 36, siebenunddreissig: 37, siebenunddreißig: 37,
    achtunddreissig: 38, achtunddreißig: 38,
    einundvierzig: 41, zweiundvierzig: 42, dreiundvierzig: 43, vierundvierzig: 44,
    fuenfundvierzig: 45, funfundvierzig: 45, sechsundvierzig: 46, siebenundvierzig: 47, achtundvierzig: 48,
  };

  const FDI_OK = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const FDI_UK = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  const ALL_FDI = new Set([...FDI_OK, ...FDI_UK]);

  /* ── FDI-Normalisierung (Live-Befund 21.07., Patientin N.) ────────────────
     Diktiert wird Quadrant+Zahn als EINZELNE Ziffern: Parakeet/Whisper
     schreiben "1,6" / "1, 4" / "vier, sechs" / kompakt "16x14x".
     Der Parser sah nur \b[1-4][1-8]\b und WORD_FDI-Komposita — alles
     andere ging verloren. Diese Normalisierung laeuft VOR jeder Extraktion. */

  const DIGIT_WORD = {
    eins: "1", zwei: "2", zwo: "2", drei: "3", vier: "4",
    fuenf: "5", "fünf": "5", funf: "5", sechs: "6", sieben: "7", acht: "8",
  };

  // Nach einer Ziffern-Paarung deutet eine Einheit auf Messwert, nicht Zahn
  // ("3,5 Millimeter Sondierungstiefe", "1,7 ml Ultracain", "zwei, drei Wochen").
  const UNIT_AFTER =
    "(?:millimeter|zentimeter|milliliter|milligramm|mm|cm|ml|mg|prozent|%|" +
    "uhr|minuten?|stunden?|sekunden?|grad|euro|wochen?|tagen?|monaten?|" +
    "jahren?|mal|termine?n?|patient(?:en|innen)?)";
  // KEIN Lookbehind (aeltere iPad-Safari werfen sonst beim new RegExp und der
  // ganze Katalog faellt aus) — Vorgaenger-Zeichen wird mitgefangen.
  // Nach der zweiten Ziffer: keine weitere Ziffer ("1,23") und kein ",/."
  // MIT Ziffer ("1.2.2026") — aber Satzende "1,2." ist erlaubt.
  const RE_PAIR_DIGIT = new RegExp(
    "(^|[^\\d,.])([1-4])\\s*[,.]\\s*([1-8])(?!\\d)(?![,.]\\d)(?!\\s*" + UNIT_AFTER + ")",
    "gi",
  );
  const RE_PAIR_WORD = new RegExp(
    "\\b(eins|zwei|zwo|drei|vier)\\s*[,.]?\\s+(eins|zwei|zwo|drei|vier|f(?:ue|[uü])nf|sechs|sieben|acht)\\b" +
    "(?!\\s*" + UNIT_AFTER + ")",
    "gi",
  );
  // Schema-Diktat: "1 2" / "1  5" (ohne Komma) — haeufig bei schnellem Ansagen.
  const RE_PAIR_SPACE = new RegExp(
    "(^|[^\\d,.])([1-4])\\s+([1-8])(?!\\d)(?!\\s*" + UNIT_AFTER + ")",
    "gi",
  );
  // Kompakt-Diktat "16x14x" / "46x": x direkt an der Zahl, ohne Wortgrenze.
  const RE_COMPACT_X = /([1-4][1-8])\s*([xX])(?=$|[\s.,;:]|[1-4])/g;

  function normalizeToothText(text) {
    let s = String(text || "");
    s = s.replace(RE_PAIR_WORD, (m, a, b) => {
      const fdi = (DIGIT_WORD[a.toLowerCase()] || "") + (DIGIT_WORD[b.toLowerCase()] || "");
      return ALL_FDI.has(Number(fdi)) ? fdi : m;
    });
    s = s.replace(RE_PAIR_DIGIT, (m, pre, a, b) => {
      const fdi = a + b;
      return ALL_FDI.has(Number(fdi)) ? (pre + fdi) : m;
    });
    // Mehrfach: "1 6 1 4" -> "16 14"
    for (let i = 0; i < 8; i++) {
      const next = s.replace(RE_PAIR_SPACE, (m, pre, a, b) => {
        const fdi = a + b;
        return ALL_FDI.has(Number(fdi)) ? (pre + fdi) : m;
      });
      if (next === s) break;
      s = next;
    }
    s = s.replace(RE_COMPACT_X, "$1 x ");
    return s;
  }

  /* ── Schema-Diktat: Garble-Aliasse (Live-Diktate 21.07. abends) ──────────
     Parakeet/Whisper verhoeren einzelne Zahl-Woerter systematisch, wenn der
     Anlaut fehlt: "vier" -> "hier/wir/fear", "drei" -> "right/frei/bei",
     "zwei" -> "zeit/why". NUR im Schema-Schritt anwenden (dort werden
     ausschliesslich Ziffern + Befunde erwartet) — in den Text-Boxen sind
     "hier"/"bei" normale Woerter. */
  const SCHEMA_DIGIT_ALIAS = {
    hier: "vier", hia: "vier", wir: "vier", wier: "vier", fear: "vier", via: "vier",
    bei: "drei", by: "drei", right: "drei", frei: "drei",
    zeit: "zwei", why: "zwei", wei: "zwei", zwo: "zwei",
    sex: "sechs", sechse: "sechs",
  };
  const RE_ALIAS_TOKEN = /[a-zA-ZäöüßÄÖÜ]+/g;
  function schemaDigitAlias(text) {
    return String(text || "").replace(RE_ALIAS_TOKEN, (w) => {
      const k = w.toLowerCase();
      return Object.prototype.hasOwnProperty.call(SCHEMA_DIGIT_ALIAS, k)
        ? SCHEMA_DIGIT_ALIAS[k]
        : w;
    });
  }

  function isKzbv(code) {
    return Object.prototype.hasOwnProperty.call(BEFUND, code);
  }

  function labelOf(code) {
    return BEFUND[code] || CLINICAL[code] || SURFACES[code] || code;
  }

  /* ── Legende + gesprochenes Echo (Chef 21.07.: "erstmal einen perfekten
     Befund") ─────────────────────────────────────────────────────────────
     Kompakte, SPRECHBARE Kurz-Labels: Quelle fuer die Legende unter dem
     Schema UND fuer das gesprochene Befund-Echo ("27 Füllung" ->
     "Zwei sieben: Füllung."). Keine Abkuerzungen — die Texte laufen durch
     ElevenLabs. Schluessel sind die MARK-Prefixe der B-Zeile (KZBV-Codes
     plus klinisch c=Karies, fu=Bestandsfuellung). */
  const SHORT_LABEL = {
    f: "fehlt",
    c: "Karies",
    fu: "Füllung",
    k: "Krone",
    kw: "Krone erneuerungsbedürftig",
    x: "extraktionswürdig",
    ww: "weitgehend zerstört",
    pw: "Substanzdefekt",
    e: "ersetzter Zahn",
    ew: "Ersatz erneuerungsbedürftig",
    b: "Brückenglied",
    bw: "Brückenglied erneuerungsbedürftig",
    t: "Teleskopkrone",
    tw: "Teleskop erneuerungsbedürftig",
    t2w: "Teleskop-Sekundärteil defekt",
    pkw: "Teilkrone erneuerungsbedürftig",
    sk: "Implantatkrone",
    skw: "Implantatkrone erneuerungsbedürftig",
    st: "Implantat-Teleskop",
    stw: "Implantat-Teleskop erneuerungsbedürftig",
    sb: "Implantat-Brückenglied",
    sbw: "Implantat-Brückenglied erneuerungsbedürftig",
    se: "Implantat-Ersatz",
    sew: "Implantat-Ersatz erneuerungsbedürftig",
    so: "Implantat-Verbindungselement",
    sow: "Verbindungselement erneuerungsbedürftig",
    ix: "Implantat zu entfernen",
    a: "Adhäsivbrücke Anker",
    ab: "Adhäsivbrücke Glied",
    aw: "Adhäsivbrücke Anker erneuerungsbedürftig",
    abw: "Adhäsivbrücke Glied erneuerungsbedürftig",
    r: "Wurzelstiftkappe",
    rw: "Wurzelstiftkappe erneuerungsbedürftig",
    ur: "unzureichende Retention",
    ")(": "Lückenschluss",
  };

  function shortLabelOf(code) {
    const c = String(code || "");
    if (Object.prototype.hasOwnProperty.call(SHORT_LABEL, c)) return SHORT_LABEL[c];
    const low = c.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(SHORT_LABEL, low)) return SHORT_LABEL[low];
    return labelOf(c);
  }

  /** Parser-Code -> gesprochener Klartext fuers Befund-Echo (ElevenLabs). */
  function speechLabelOf(code) {
    const c = String(code || "");
    if (c === "Ka") return SHORT_LABEL.c;      // Karies
    if (c === "Fu") return SHORT_LABEL.fu;     // Füllung
    if (c === "WF") return "Wurzelfüllung";
    if (c === "LA") return "Anästhesie";
    if (c === "Paro") return "Parodontalbefund";
    if (c === "Kief") return "Kieferbefund";
    return shortLabelOf(c);
  }

  /** FDI als Einzelziffern sprechen (Dental-Konvention): 27 -> "zwei sieben". */
  const SPOKEN_DIGIT = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"];
  function spokenFdi(fdi) {
    const s = String(fdi || "");
    if (!/^[1-4][1-8]$/.test(s)) return s;
    return SPOKEN_DIGIT[Number(s[0])] + " " + SPOKEN_DIGIT[Number(s[1])];
  }

  // Anzeige-Reihenfolge: haeufigste zuerst, danach der komplette Rest aus
  // BEFUND (nichts geht verloren, wenn der Katalog waechst).
  const LEGEND_COMMON = [
    "f", "c", "fu", "k", "kw", "x", "ww", "pw", "e", "ew", "b", "bw",
  ];

  /** Alle Legenden-Eintraege: [{ code, label }] — Quelle BEFUND + c/fu. */
  function legendEntries() {
    const seen = new Set();
    const out = [];
    const push = (code) => {
      if (!code || seen.has(code)) return;
      seen.add(code);
      out.push({ code, label: shortLabelOf(code) });
    };
    LEGEND_COMMON.forEach(push);
    Object.keys(BEFUND).forEach(push);
    return out;
  }

  /** Map KZBV/klinisch → 01-perio finding id (wenn vorhanden). */
  const TO_PERIO = {
    f: "zahn_fehlt",
    k: "krone",
    kw: "krone",
    b: "brueckenglied",
    bw: "brueckenglied",
    ww: "zahn_zerstoert",
    x: "zahn_zerstoert",
    sk: "implantat",
    Fu: "fuellung",
    Ka: "karies",
    WF: "wurzelfuellung",
    pkw: "teilkrone",
    t: "teleskop",
  };

  global.LenaZahnstatusKatalog = {
    BEFUND,
    CLINICAL,
    SURFACES,
    SPEECH,
    SURFACE_SPEECH,
    WORD_FDI,
    FDI_OK,
    FDI_UK,
    ALL_FDI,
    LAYER_OF,
    markForLayer,
    normalizeToothText,
    schemaDigitAlias,
    DIGIT_WORD,
    isKzbv,
    labelOf,
    SHORT_LABEL,
    shortLabelOf,
    speechLabelOf,
    spokenFdi,
    legendEntries,
    TO_PERIO,
    source: "Schema B/T: c=Karies, f in B=fehlend, f+MOD in T=Füllung",
  };
})(typeof window !== "undefined" ? window : globalThis);
