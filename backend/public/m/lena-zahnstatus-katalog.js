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
  const SPEECH = [
    { re: /erneuerungsbed[uü]rftig(?:e|en)?\s+krone|krone\s+erneuern|kw\b/i, code: "kw" },
    { re: /teilkrone|pkw\b/i, code: "pkw" },
    { re: /\bkrone\b/i, code: "k" },
    { re: /erneuerungsbed[uü]rftig(?:e|en)?\s+br[uü]ckenglied|\bbw\b/i, code: "bw" },
    { re: /br[uü]ckenglied|pontic/i, code: "b" },
    { re: /\bbr[uü]cke\b/i, code: "b" },
    { re: /weitgehend(?:e|er)?\s+zerst[oö]r|behandlungsbed[uü]rftig|\bww\b/i, code: "ww" },
    { re: /partiell(?:e|er)?\s+substanz|\bpw\b/i, code: "pw" },
    { re: /nicht\s+erhaltungsw[uü]rdig|zu\s+extrah|\bextraktion\b/i, code: "x" },
    { re: /fehlend(?:er|e)?\s+zahn|zahn\s+fehlt|\bfehlt\b/i, code: "f" },
    { re: /implantat\s+entfernen|\bix\b/i, code: "ix" },
    { re: /implantat\s*krone|\bsk\b/i, code: "sk" },
    { re: /\bimplantat\b/i, code: "sk" },
    { re: /teleskop|\bt\b(?!\w)/i, code: "t" },
    { re: /l[uü]ckenschluss/i, code: ")(" },
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
    { re: /\bvestibul[aä]r\b|\bbukkal\b|\blabial\b|\bv\b(?!\w)/i, code: "v" },
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

  function isKzbv(code) {
    return Object.prototype.hasOwnProperty.call(BEFUND, code);
  }

  function labelOf(code) {
    return BEFUND[code] || CLINICAL[code] || SURFACES[code] || code;
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
    isKzbv,
    labelOf,
    TO_PERIO,
    source: "Schema B/T: c=Karies, f in B=fehlend, f+MOD in T=Füllung",
  };
})(typeof window !== "undefined" ? window : globalThis);
