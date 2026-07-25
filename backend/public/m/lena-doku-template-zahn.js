/**
 * Lena Doku-Template Zahnmedizin (Phase 1).
 * Ein interaktives Template: Basis-Felder + adaptive Bloecke.
 * Extraktion vorerst heuristisch aus Segmenttexten (spaeter LLM).
 */
(function (global) {
  "use strict";

  const TEMPLATE = {
    id: "zahnmedizin",
    title: "Doku-Template · Zahnmedizin",
    fields: [
      { key: "anlass", label: "Anlass", persistence: "visit", quelle: "termin" },
      // Patientenanliegen heute (Chef 24.07.2026): was der Patient HEUTE
      // moechte/berichtet. Wird per Raummikro (source=raum, AP3) gefuellt.
      { key: "anliegen", label: "Patientenanliegen heute", persistence: "visit", quelle: "patient" },
      { key: "anamnese", label: "Anamnese-Risiken", persistence: "patient", quelle: "signr_anamnese" },
      { key: "zaehne", label: "Zähne / Lokalisation", persistence: "visit", quelle: "diktat", type: "teeth" },
      { key: "befund", label: "Befund", persistence: "visit", quelle: "diktat" },
      { key: "diagnose", label: "Diagnose", persistence: "visit", quelle: "diktat" },
      { key: "therapie", label: "Therapie", persistence: "visit", quelle: "diktat" },
      { key: "aufklaerung", label: "Aufklärung", persistence: "visit", quelle: "signr_dokumente" },
      { key: "komplikationen", label: "Komplikationen", persistence: "visit", quelle: "diktat" },
      { key: "procedere", label: "Procedere", persistence: "visit", quelle: "diktat" },
    ],
    blocks: [
      {
        id: "planwechsel",
        title: "Planänderung",
        hint: "geplant vs. gemacht · Zustimmung aus Kontext",
        fields: [
          { key: "plan_geplant", label: "Geplant" },
          { key: "plan_durchgefuehrt", label: "Heute entschieden / gemacht" },
          { key: "plan_zustimmung", label: "Aufklärung / Zustimmung" },
        ],
      },
      {
        id: "la",
        title: "Lokalanästhesie",
        fields: [
          { key: "la_mittel", label: "Wirkstoff / Menge" },
          { key: "la_region", label: "Region" },
        ],
      },
      {
        id: "fuellung",
        title: "Füllung / Restauration",
        fields: [
          { key: "fuellung_material", label: "Material" },
          { key: "fuellung_flaechen", label: "Flächen" },
        ],
      },
      {
        id: "endo",
        title: "Endodontie",
        fields: [
          { key: "endo_kanaele", label: "Kanäle / Medikation" },
        ],
      },
      {
        id: "extraktion",
        title: "Extraktion",
        fields: [
          { key: "ex_zahn", label: "Zahn / Besonderheit" },
        ],
      },
      {
        id: "bildgebung",
        title: "Bildgebung",
        hint: "StrlSchG",
        fields: [
          { key: "roe_region", label: "Aufnahme / Region" },
          { key: "roe_indikation", label: "Rechtfertigende Indikation" },
          { key: "roe_befund", label: "Röntgenbefund" },
        ],
      },
    ],
  };

  function emptyState(anlass) {
    const values = {};
    const status = {};
    for (const f of TEMPLATE.fields) {
      values[f.key] = "";
      status[f.key] = "empty";
    }
    for (const b of TEMPLATE.blocks) {
      for (const f of b.fields) {
        values[f.key] = "";
        status[f.key] = "empty";
      }
    }
    const a = String(anlass || "").trim();
    if (a) {
      values.anlass = a;
      status.anlass = "pre";
      values.plan_geplant = a;
      status.plan_geplant = "pre";
    }
    return {
      anlass: a,
      values,
      status,
      openBlocks: guessStartBlocks(a),
      teeth: new Set(),
      chart: global.LenaVoiceChart ? global.LenaVoiceChart.emptyChart() : null,
      lastChartFdi: null,
      gapCount: 0,
      lastTouchedKey: "",
      dictMode: null, // null = auto | "befund" = Befund-Diktat (Trigger-Wort)
      page: "doku", // "schema" = nur Zahnschema | "doku" = Text-Boxen
      befund01: "", // qwen3.6-Reinschrift des 01-Befunds (Uebergang Schema->Doku)
      befund01Until: 0, // startMs-Grenze der 01-Phase (Rohtext-Unterdrueckung)
    };
  }

  /* Schema-Diktat: Segment besteht NUR aus einer Einzelziffer ("Vier.",
     "6", "und drei")? Dann Quadrant+Zahn ueber Segmentgrenzen paaren —
     der Arzt diktiert Ziffer fuer Ziffer, das VAD trennt die Woerter. */
  const SINGLE_DIGIT_RE = new RegExp(
    "^(?:so|und|dann|jetzt|zahn|der|die|das)?[\\s,.:;!?-]*" +
    "([1-8]|eins|zwei|zwo|drei|vier|f(?:ue|ü)nf|fuenf|sechs|sieben|acht)" +
    "[\\s,.!?;:]*$",
    "i",
  );
  const DIGIT_WORD_LOCAL = {
    eins: "1", zwei: "2", zwo: "2", drei: "3", vier: "4",
    fuenf: "5", "fünf": "5", sechs: "6", sieben: "7", acht: "8",
  };
  function singleDigitOf(text) {
    const m = SINGLE_DIGIT_RE.exec(String(text || "").trim());
    if (!m) return null;
    const t = m[1].toLowerCase();
    if (/^[1-8]$/.test(t)) return t;
    return DIGIT_WORD_LOCAL[t] || null;
  }

  /* ── "01 fertig" (Chef 22.07. 01:56): Sprachkommando schliesst den Befund
     (01 = eingehende Untersuchung) ab und schaltet zur Behandlungs-Doku.
     STEUER-Segment: erzeugt NIE Chart-/Box-Inhalt. Der Seitenwechsel selbst
     passiert in ipad-app.html und NUR fuer frisch eingetroffene Segmente
     (schemaFinishShouldSwitch) — Voll-Rebuilds ueberspringen das Segment
     lediglich. "fertig" ALLEIN ist bewusst KEIN Kommando (kommt im Diktat
     vor, z. B. "Zahn 41 fertig praepariert"). */
  const FINISH_DONE = "(?:fertig|abgeschlossen|beendet|erledigt|abschliessen|abschließen)";
  const FINISH_SEP = "[\\s,;:.—–-]+";
  const FINISH_TAIL = "[\\s.,!?;:]*$";
  // "01" gesprochen: "null eins", STT-Schreibweisen "01" / "0 1" / "0-1" / "Nulleins".
  const FINISH_NULL_EINS = "(?:0\\s*[-–,.]?\\s*1|null\\s*[-,.]?\\s*eins)";
  const RE_FINISH_LIST = [
    // "01 fertig" / "null eins fertig" / "die 01 ist abgeschlossen"
    new RegExp("^(?:der\\s+|die\\s+)?" + FINISH_NULL_EINS + "(?:\\s+ist)?" + FINISH_SEP + FINISH_DONE + FINISH_TAIL, "i"),
    // "Befund fertig" / "Befund abgeschlossen" / "der Befund ist fertig"
    new RegExp("^(?:der\\s+)?befund(?:aufnahme|erhebung)?(?:\\s+ist)?" + FINISH_SEP + FINISH_DONE + FINISH_TAIL, "i"),
    // "fertig mit dem Befund" / "fertig mit der 01"
    new RegExp("^" + FINISH_DONE + "\\s+mit\\s+(?:dem\\s+|der\\s+)?(?:befund(?:aufnahme|erhebung)?|" + FINISH_NULL_EINS + ")" + FINISH_TAIL, "i"),
    // "weiter zur Doku" / "weiter mit der Doku" / "weiter zur Behandlungs-Doku"
    new RegExp("^weiter\\s+(?:zur?|mit)\\s+(?:der\\s+|die\\s+)?(?:behandlungs[\\s-]*)?doku(?:mentation)?" + FINISH_TAIL, "i"),
    // "Lena weiter" / "weiter Lena" (Chef 24.07.2026): direkter Weiterschalt-
    // Befehl an Lena. Der Name macht ihn eindeutig (blosses "weiter" bleibt
    // bewusst KEIN Kommando — kommt im Diktat vor).
    new RegExp("^lena" + FINISH_SEP + "weiter" + FINISH_TAIL, "i"),
    new RegExp("^weiter" + FINISH_SEP + "lena" + FINISH_TAIL, "i"),
  ];
  // Quittungs-Echo ("Befund abgeschlossen — weiter zur Behandlungs-Doku."):
  // falls es trotz Worker-/Frontend-Echo-Schutz als Segment durchkommt,
  // hier ebenfalls als Steuer-Text erkennen -> nie Inhalt, nie Chart.
  const RE_FINISH_ECHO = /(?:befund\s+abgeschlossen|los\s+geht'?s|alles\s+klar)[\s\S]{0,24}weiter\s+(?:zur?|mit)\s+(?:der\s+|die\s+)?(?:behandlungs[\s-]*)?doku/i;

  /** Segment ist ein "Befund fertig"-Kommando (ganzes Segment, strikt)? */
  function schemaFinishCommand(text) {
    const s = stripLeadFillers(text);
    if (!s || s.length > 64) return false;
    return RE_FINISH_LIST.some((re) => re.test(s));
  }

  /** Steuer-Text (Kommando ODER Quittungs-Echo) — beim Rebuild ueberspringen. */
  function isFinishControlText(text) {
    return schemaFinishCommand(text) || RE_FINISH_ECHO.test(String(text || "").trim());
  }

  /**
   * Seitenwechsel-Entscheid fuer ein NEU eingetroffenes Kommando-Segment
   * (Live-Push/Poll in ipad-app.html). Idempotenz: historische Segmente
   * (aelter als der Aufnahmestart) und Re-Deliveries (at <= letzter
   * Wechsel) schalten NICHT erneut. Voll-Rebuilds rufen das nie auf.
   */
  function schemaFinishShouldSwitch(text, opts) {
    if (!schemaFinishCommand(text)) return false;
    const o = opts || {};
    const at = Number(o.at) || 0;
    const started = Number(o.recStartedAt) || 0;
    const last = Number(o.lastSwitchAt) || 0;
    if (at && started && at < started - 5000) return false;
    if (at && last && at <= last) return false;
    return true;
  }

  /* ── Loesch-Kommandos (Chef 22.07. 02:51) ────────────────────────────────
     Steuer-Segmente wie "01 fertig", ABER mit Rebuild-Wirkung: der Voll-
     Rebuild wertet sie aus — Reset-Marker verwirft alles Aeltere, Zahn-
     Loeschung ueberspringt fruehere Marks des Zahns. Die Kommandos selbst
     erzeugen NIE Inhalt. Abgrenzung: "16 fehlt" ist BEFUND f, kein
     Loeschen; "nochmal bitte" (an Lena) ist kein Zahn-Kommando. */
  const RESET_TAIL = "(?:\\s+bitte)?[\\s.,!?;:]*$";
  const RE_RESET_LIST = [
    // "lösch alles" / "lösche mal alles"
    new RegExp("^l(?:\u00f6|oe)sche?\\s+(?:mal\\s+)?alles" + RESET_TAIL, "i"),
    // "alles löschen"
    new RegExp("^alles\\s+l(?:\u00f6|oe)schen" + RESET_TAIL, "i"),
    // "alles neu" / "alles wieder neu machen"
    new RegExp("^alles\\s+(?:wieder\\s+)?neu(?:\\s+machen)?" + RESET_TAIL, "i"),
    // "von vorne" / "wir fangen von vorne an"
    new RegExp("^(?:wir\\s+fangen\\s+|fangen\\s+wir\\s+)?von\\s+vorne?(?:\\s+an(?:fangen)?|\\s+beginnen)?" + RESET_TAIL, "i"),
    // "nochmal neu" / "noch mal ganz von vorne"
    new RegExp("^noch\\s*mal\\s+(?:ganz\\s+)?(?:neu|von\\s+vorne?)" + RESET_TAIL, "i"),
    // "alles auf Anfang"
    new RegExp("^alles\\s+auf\\s+anfang" + RESET_TAIL, "i"),
  ];

  /** Segment ist ein globales Reset-Kommando ("loesch alles")? */
  function schemaResetCommand(text) {
    const s = stripLeadFillers(text);
    if (!s || s.length > 48) return false;
    return RE_RESET_LIST.some((re) => re.test(s));
  }

  const DEL_FDI = "([1-4][1-8])";
  const DEL_SEP = "[\\s,;:.—–-]+";
  // Loesch-Verben: "fehlt" fehlt hier BEWUSST (Befund f, kein Kommando).
  const RE_TOOTH_DEL_LIST = [
    // "16 löschen" / "Zahn 16 weg" / "die 16 raus" / "16 streichen"
    new RegExp("^(?:zahn\\s+)?(?:der\\s+|die\\s+|den\\s+)?" + DEL_FDI + "(?:\\s+(?:wieder|bitte))?" + DEL_SEP + "(?:l(?:\u00f6|oe)schen?|weg(?:\\s+damit)?|raus|entfernen|streichen)" + RESET_TAIL, "i"),
    // "lösche 16" / "entferne Zahn 16" / "streich die 16"
    new RegExp("^(?:l(?:\u00f6|oe)sche?|entferne?|streiche?)\\s+(?:mal\\s+)?(?:zahn\\s+)?(?:der\\s+|die\\s+|den\\s+)?" + DEL_FDI + RESET_TAIL, "i"),
  ];
  const RE_TOOTH_REDO_LIST = [
    // "16 neu" / "16 nochmal" / "16 korrigieren" -> loeschen + Zahn pending
    new RegExp("^(?:zahn\\s+)?(?:der\\s+|die\\s+|den\\s+)?" + DEL_FDI + DEL_SEP + "(?:neu|noch\\s*mals?|korrigier(?:en)?|korrektur)" + RESET_TAIL, "i"),
  ];

  /**
   * Segment ist ein Einzelzahn-Loesch-Kommando?
   * @returns { fdi, rebind } | null — rebind=true ("16 neu"/"16 nochmal"):
   * Zahn bleibt pending, die naechste Code-Ansage bindet an ihn.
   */
  function toothDeleteCommand(text) {
    const KAT = global.LenaZahnstatusKatalog;
    let s = stripLeadFillers(text);
    if (!s || s.length > 48) return null;
    // "eins sechs löschen" -> "16 löschen", "sechzehn löschen" -> "16 löschen"
    if (KAT && KAT.normalizeToothText) s = KAT.normalizeToothText(s);
    if (KAT && KAT.WORD_FDI) {
      s = s.replace(/[a-z\u00e4\u00f6\u00fc\u00df]+/gi, (w) => {
        const f = KAT.WORD_FDI[w.toLowerCase()];
        return f ? String(f) : w;
      });
    }
    for (const re of RE_TOOTH_REDO_LIST) {
      const m = re.exec(s);
      if (m) return { fdi: Number(m[1]), rebind: true };
    }
    for (const re of RE_TOOTH_DEL_LIST) {
      const m = re.exec(s);
      if (m) return { fdi: Number(m[1]), rebind: false };
    }
    return null;
  }

  // Quittungen/Rueckfragen der Loesch-/Klaer-Strecke: Steuer-Text — falls
  // sie trotz Echo-Schutz als Segment landen, nie Inhalt ("Eins sechs:
  // gelöscht." wuerde sonst beim Rebuild Zahn 16 wieder benennen).
  const CTRL_Q = "(?:eins|zwei|zwo|drei|vier)\\s+(?:eins|zwei|zwo|drei|vier|f(?:\u00fc|ue)nf|sechs|sieben|acht)";
  const RE_CONTROL_ECHOES = [
    new RegExp("^alles\\s+gel(?:\u00f6|oe)scht\\b", "i"),
    new RegExp("^" + CTRL_Q + "\\s*[:,]?\\s*gel(?:\u00f6|oe)scht\\b", "i"),
    new RegExp("^" + CTRL_Q + "\\s*[—–:,-]*\\s*was\\s+genau\\b", "i"),
    new RegExp("^noch\\s*mal\\s+bitte\\b", "i"),
  ];

  function isControlEchoText(text) {
    const s = String(text || "").trim();
    return RE_CONTROL_ECHOES.some((re) => re.test(s));
  }

  /** Steuer-Text JEDER Art (Kommandos, Quittungen, Rueckfragen). */
  function isControlOrReceiptText(text) {
    return (
      isFinishControlText(text) ||
      schemaResetCommand(text) ||
      !!toothDeleteCommand(text) ||
      isControlEchoText(text)
    );
  }

  /**
   * Chart-Aufbau mit Loesch-Marken: Segmente in Abschnitten anwenden; bei
   * { del: { fdi, rebind } } die Zelle leeren. rebind=true macht den Zahn
   * zum Carry-over — die naechste Code-Ansage bindet wieder an ihn.
   */
  function buildChartWithDeletes(chart, ops) {
    const VC = global.LenaVoiceChart;
    if (!VC || !chart) return null;
    let last = null;
    let chunk = [];
    const flush = () => {
      if (!chunk.length) return;
      last = VC.applySegments(chart, chunk, last);
      chunk = [];
    };
    for (const op of ops) {
      if (op && op.del) {
        flush();
        if (VC.resetTooth) VC.resetTooth(chart, op.del.fdi);
        // Legenden-Flash nicht auf einem geloeschten Mark stehen lassen.
        if (chart._lastMark && Number(chart._lastMark.fdi) === Number(op.del.fdi)) {
          delete chart._lastMark;
        }
        last = op.del.rebind ? op.del.fdi : null;
        continue;
      }
      chunk.push(op);
    }
    flush();
    return last;
  }

  /* ── Rueckfragen bei Unverstandenem (Chef 22.07. 02:51) ──────────────────
     Zahn erkannt, Rest unparsebar -> "Eins sechs — was genau?" (Zahn bleibt
     als genannt/pending stehen, die naechste Code-Ansage bindet per
     Carry-over an ihn). Gar nichts erkannt -> "Nochmal bitte?" (Rate-Limit
     liegt beim Aufrufer). NIE fragen bei Steuer-/Quittungstexten,
     Einzelziffern (Paarung!), System-Nachfragen oder Hoeflichkeitsfloskeln. */
  const CLARIFY_IGNORE_RE =
    /^(?:ja|nein|genau|gut|danke(?:\s+sch(?:\u00f6|oe)n)?|bitte|moment(?:\s+mal)?|warte(?:\s+mal)?|wie\s+bitte|okay|ok|super|prima|passt(?:\s+so)?|alles\s+klar|weiter|stopp?|pause)[\s.,!?]*$/i;
  const CLARIFY_FILLER = new Set([
    "zahn", "der", "die", "das", "den", "dem", "und", "auch", "bitte", "so",
    "ok", "okay", "ja", "jetzt", "dann", "mal", "noch", "am", "an", "ist",
    "mit", "haben", "hat", "wir", "bis",
  ]);

  /** Woerter, die nach Abzug von Zahn-Tokens/Fuellern uebrig bleiben. */
  function clarifyRestWords(s, KAT) {
    let t = KAT && KAT.normalizeToothText ? KAT.normalizeToothText(s) : s;
    t = String(t).toLowerCase();
    t = t.replace(/[1-4][1-8]/g, " ");
    t = t.replace(/\b[1-8]\b/g, " ");
    let n = 0;
    for (const w of t.split(/[^a-z\u00e4\u00f6\u00fc\u00df]+/i)) {
      if (!w) continue;
      if (CLARIFY_FILLER.has(w)) continue;
      if (DIGIT_WORD_LOCAL[w]) continue; // "eins", "sechs", ...
      if (KAT && KAT.WORD_FDI && KAT.WORD_FDI[w]) continue; // "sechzehn"
      n++;
    }
    return n;
  }

  /**
   * Rueckfrage-Analyse fuer ein frisches Schema-Segment.
   * @returns { ask: "tooth", fdi } | { ask: "repeat" } | null
   */
  function schemaClarifyAnalyze(text) {
    const KAT = global.LenaZahnstatusKatalog;
    const VC = global.LenaVoiceChart;
    if (!VC || !VC.extractFdi) return null;
    const raw = String(text || "").trim();
    if (!raw) return null;
    const garble = KAT && (KAT.schemaSpeechGarble || KAT.speechGarbleCorrect)
      ? (KAT.schemaSpeechGarble || KAT.speechGarbleCorrect)
      : (t) => t;
    const alias = KAT && KAT.schemaDigitAlias ? KAT.schemaDigitAlias : (t) => t;
    const s = alias(garble(raw));
    if (isControlOrReceiptText(s) || isControlOrReceiptText(raw)) return null;
    if (singleDigitOf(s) != null) return null;
    if (SYSTEM_CHATTER_RE.test(s)) return null;
    const stripped = stripLeadFillers(s);
    if (!stripped || CLARIFY_IGNORE_RE.test(stripped)) return null;
    const codes = VC.extractCodes(stripped);
    const surfaces = VC.extractSurfaces ? VC.extractSurfaces(stripped) : [];
    if (codes.length || surfaces.length) return null; // etwas wurde verstanden
    const teeth = VC.extractFdi(stripped);
    if (teeth.length) {
      // Blosse Zahn-Ansagen ("16.", "Zahn 16 und 17") sind normal — nur
      // fragen, wenn nach den Zahn-Tokens echter Resttext steht.
      if (clarifyRestWords(stripped, KAT) > 0) {
        return { ask: "tooth", fdi: teeth[teeth.length - 1] };
      }
      return null;
    }
    const words = stripped.split(/\s+/).filter((w) => /[a-z\u00e4\u00f6\u00fc\u00df]/i.test(w));
    if (words.length >= 2) return { ask: "repeat" };
    return null;
  }

  /** Rueckfrage-Wortlaut zum Analyse-Ergebnis ("" wenn keine Frage). */
  function clarifyQuestionText(res) {
    if (!res || !res.ask) return "";
    if (res.ask === "tooth") {
      const KAT = global.LenaZahnstatusKatalog;
      const spoken = KAT && KAT.spokenFdi ? KAT.spokenFdi(res.fdi) : String(res.fdi);
      return spoken.charAt(0).toUpperCase() + spoken.slice(1) + " — was genau?";
    }
    if (res.ask === "repeat") return "Nochmal bitte?";
    return "";
  }

  /**
   * Schema-Seite: Chart aus Segmenten NEU aufbauen (idempotent).
   * Keine Text-Boxen — Lena erwartet hier nur Ziffern + Marks.
   * Vorverarbeitung: Garble-Aliasse (hier->vier) + Einzelziffern-Paarung.
   */
  function applySchemaSegments(state, segments) {
    if (!state) return state;
    state.page = "schema";
    state.teeth = new Set();
    state.lastChartFdi = null;
    state.chart = global.LenaVoiceChart ? global.LenaVoiceChart.emptyChart() : null;
    const KAT = global.LenaZahnstatusKatalog;
    const garble = KAT && KAT.schemaSpeechGarble
      ? KAT.schemaSpeechGarble
      : (KAT && KAT.speechGarbleCorrect ? KAT.speechGarbleCorrect : (t) => t);
    const alias = KAT && KAT.schemaDigitAlias ? KAT.schemaDigitAlias : (t) => t;
    const allFdi = KAT && KAT.ALL_FDI ? KAT.ALL_FDI : null;
    const PAIR_WINDOW_MS = 8000;
    const items = (segments || [])
      .map((s) => ({
        // Garble vor Digit-Alias: "Sex-Teleskop" sonst → "sechs-Teleskop"
        text: alias(garble(String(s.text || s.textCorrected || "").trim())),
        at: Number(s.startMs) || 0,
      }))
      .filter((x) => x.text);
    const texts = [];
    let pend = null; // { d: "1".."4", at: ms }
    for (const it of items) {
      // "01 fertig"-Steuersegment (Chef 22.07.): reines Kommando — kein
      // Chart-Inhalt, offene Einzelziffer verwerfen (Befund ist zu Ende).
      if (isFinishControlText(it.text)) {
        pend = null;
        continue;
      }
      // Globales Reset ("lösch alles", Chef 22.07. 02:51): alles VOR dem
      // juengsten Reset verfaellt — der Rebuild beginnt dort von vorne.
      if (schemaResetCommand(it.text)) {
        texts.length = 0;
        pend = null;
        continue;
      }
      // Einzelzahn-Loeschung ("16 löschen" / "16 neu"): als Marker in den
      // Ablauf einreihen — beim Chart-Aufbau verfallen fruehere Marks.
      const del = toothDeleteCommand(it.text);
      if (del) {
        texts.push({ del });
        pend = null;
        continue;
      }
      // Quittungen/Rueckfragen (falls je als Segment committet): nie Inhalt.
      if (isControlEchoText(it.text)) {
        pend = null;
        continue;
      }
      const d = singleDigitOf(it.text);
      if (d != null) {
        if (pend && (!pend.at || !it.at || it.at - pend.at <= PAIR_WINDOW_MS)) {
          const fdi = pend.d + d;
          if (!allFdi || allFdi.has(Number(fdi))) {
            texts.push(fdi);
            pend = null;
            continue;
          }
        }
        pend = /^[1-4]$/.test(d) ? { d, at: it.at } : null;
        continue;
      }
      // Offene Ziffer verwerfen, sobald ein Nicht-Ziffern-Segment kommt —
      // sonst paart "Zeit."(=zwei) spaeter mit "Hier?"(=vier) zu Geister-24
      // statt "vier"+"sieben"→47 (Live 21.07. 21:37).
      pend = null;
      texts.push(it.text);
    }
    state.pendingDigit = pend ? pend.d : "";
    state.pendingDigitAt = pend ? pend.at : 0;
    if (!texts.length) {
      state.values.zaehne = "";
      state.status.zaehne = "empty";
      return state;
    }
    // Reihenfolge-treu: eine Loeschung entfernt den Zahn auch aus der
    // "genannt"-Menge; "16 neu" laesst ihn als pending (tuerkis) stehen.
    for (const t of texts) {
      if (typeof t === "object" && t && t.del) {
        state.teeth.delete(t.del.fdi);
        if (t.del.rebind) state.teeth.add(t.del.fdi);
        continue;
      }
      for (const z of extractTeeth(t)) state.teeth.add(z);
    }
    if (state.chart && global.LenaVoiceChart) {
      // Schema-Seite ist REINE Befundaufnahme (Chef 21.07.): alles in die
      // B-Zeile zwingen — "17 Fuellung" ist hier Bestand, keine Therapie.
      const last = buildChartWithDeletes(
        state.chart,
        texts.map((t) => (
          typeof t === "object" && t && t.del
            ? t
            : { text: t, forceLayer: "befund" }
        )),
      );
      if (last) {
        state.lastChartFdi = last;
        state.teeth.add(last);
      }
      const lines = global.LenaVoiceChart.summaryLines
        ? global.LenaVoiceChart.summaryLines(state.chart)
        : [];
      const marked = new Set(lines.map((l) => parseInt(l, 10)));
      const namedOnly = [...state.teeth]
        .filter((z) => !marked.has(z))
        .sort((a, b) => a - b);
      const zparts = lines.slice();
      if (namedOnly.length) zparts.push("genannt: " + namedOnly.join(", "));
      state.values.zaehne = zparts.join(" · ");
      state.status.zaehne = zparts.length ? "live" : "empty";
    } else if (state.teeth.size) {
      state.values.zaehne = "Zahn " + [...state.teeth].sort((a, b) => a - b).join(", ");
      state.status.zaehne = "live";
    }
    return state;
  }

  /** Grosse Schema-Ansicht (ohne Befund-/Therapie-Boxen). */
  function renderSchemaOnly(container, state) {
    if (!container || !state) return;
    const named = state.teeth || new Set();
    const list = [...named].sort((a, b) => a - b);
    // Legenden-Flash: zuletzt gesetzte Kuerzel pulsieren mit dem Zahn —
    // aber nur solange der Eintrag frisch ist (Re-Renders/Partials sollen
    // einen alten Befund nicht ewig weiterblinken lassen).
    let flashKeys = [];
    const lm = state.chart && state.chart._lastMark;
    if (lm && lm.keys && lm.keys.length) {
      const key = String(lm.fdi || "") + ":" + lm.keys.join(",");
      if (!state._legendFlash || state._legendFlash.key !== key) {
        state._legendFlash = { key, at: Date.now() };
      }
      if (Date.now() - state._legendFlash.at < 5000) flashKeys = lm.keys;
    }
    const chartHtml = global.LenaVoiceChart && state.chart
      ? global.LenaVoiceChart.renderSchemaHtml(
          state.chart,
          state.lastChartFdi || null,
          state.teeth,
          { hideTherapy: true, legend: true, flashKeys },
        )
      : "";
    // Halbe Ansage ("Vier ...") sichtbar machen — nur wenn frisch (<10 s).
    const pendFresh = state.pendingDigit
      && (!state.pendingDigitAt || Date.now() - state.pendingDigitAt < 10000);
    const pendHtml = pendFresh
      ? ' <span class="zs-pend">' + escapeHtml(state.pendingDigit) + "&hellip;</span>"
      : "";
    const live = list.length || pendFresh
      ? '<div class="zs-live-line">Aktiv: <b>' + escapeHtml(list.join(" · ")) + "</b>" + pendHtml + "</div>"
      : '<div class="zs-live-line zs-live-line--empty">Sag eine Zahnnummer — z.&nbsp;B. <b>12</b>, <b>15</b>, <b>34</b></div>';
    container.innerHTML = (
      '<div class="tpl-title tpl-title--schema">' +
      "<h2>Zahnschema</h2>" +
      '<span class="tpl-mode" id="tplMode">● nur Ziffern + Befund</span>' +
      "</div>" +
      '<p class="zs-schema-lead">Hier landet nur das Schema. Text-Boxen folgen auf der nächsten Seite.</p>' +
      live +
      chartHtml +
      (state.values.zaehne
        ? '<div class="tpl-val zs-schema-sum">' + escapeHtml(state.values.zaehne) + "</div>"
        : "")
    );
  }

  /** Box-Doku ohne grosses Schema (Schema war eigene Seite). */
  /** Aufklaerungs-Box: gesprochener Text + Liste der unterschriebenen
      Dokumente mit PDF-Link (falls vom Backend geliefert). */
  function aufklaerungBodyHtml(state) {
    const val = String(state.values.aufklaerung || "").trim();
    const docs = Array.isArray(state.aufklaerungDocs) ? state.aufklaerungDocs : [];
    let html = val
      ? '<div class="tpl-val">' + escapeHtml(val) + "</div>"
      : (docs.length ? "" : '<div class="tpl-val empty">—</div>');
    if (docs.length) {
      html += '<ul class="tpl-docs">';
      for (const d of docs) {
        const name = escapeHtml(String(d.name || "Dokument"));
        const when = d.signedAtMs ? " · " + new Date(d.signedAtMs).toLocaleDateString("de-DE") : "";
        html += d.url
          ? '<li><a href="' + escapeAttr(d.url) + '" target="_blank" rel="noopener">📄 ' + name + "</a>" + when + "</li>"
          : "<li>📄 " + name + when + " <em>(kein Link)</em></li>";
      }
      html += "</ul>";
    }
    return html;
  }

  function renderBoxesOnly(container, state) {
    if (!container || !state) return;
    state.page = "doku";
    const parts = [];
    parts.push(
      '<div class="tpl-title"><h2>Dokumentation</h2>' +
      '<span class="tpl-gaps" id="tplGaps">Lücken: ' + (state.gapCount || 0) + "</span></div>"
    );
    // Reihenfolge (Chef 24.07.2026): oben Termingrund + Patientenanliegen,
    // dann die diktierten Boxen. "Zähne / Status" hier bewusst raus.
    parts.push(fieldHtml("Termingrund", "anlass", state));
    parts.push(fieldHtml("Patientenanliegen heute", "anliegen", state));
    parts.push(fieldHtml("Anamnese-Risiken", "anamnese", state));
    parts.push(fieldHtml("Befund", "befund", state));
    parts.push(fieldHtml("Diagnose", "diagnose", state));
    parts.push(fieldHtml("Therapie", "therapie", state));
    for (const b of TEMPLATE.blocks) {
      if (!state.openBlocks.has(b.id)) continue;
      parts.push('<div class="tpl-block" data-block="' + b.id + '">');
      parts.push(
        '<div class="tpl-block-head">' + escapeHtml(b.title) +
        (b.hint ? "<em>" + escapeHtml(b.hint) + "</em>" : "") +
        '</div><div class="tpl-block-body">'
      );
      for (const f of b.fields) parts.push(fieldHtml(f.label, f.key, state));
      parts.push("</div></div>");
    }
    parts.push(fieldHtml("Aufklärung", "aufklaerung", state, aufklaerungBodyHtml(state)));
    // Komplikationen / Procedere: vorerst ausgeblendet (Chef 23.07.) —
    // nur anzeigen, wenn doch etwas diktiert wurde.
    if (String(state.values.komplikationen || "").trim()) {
      parts.push(fieldHtml("Komplikationen", "komplikationen", state));
    }
    if (String(state.values.procedere || "").trim()) {
      parts.push(fieldHtml("Procedere", "procedere", state));
    }
    container.innerHTML = parts.join("");
    focusLastTouched(container, state);
  }

  /**
   * SignR-/Akte-Anamnese in die Anamnese-Box legen (status=pre).
   * findings: [{ category, text }] von /treatment/current.
   */
  function applySignrPrefill(state, { findings, docsStatus, aufklaerungDocs } = {}) {
    if (!state) return state;
    const lines = [];
    (Array.isArray(findings) ? findings : []).forEach((f) => {
      const cat = String(f?.category || "").trim();
      const txt = String(f?.text || "").trim();
      if (!txt) return;
      lines.push(cat ? (cat + ": " + txt) : txt);
    });
    // Nur vorausfüllen, wenn noch nichts live diktiert wurde.
    if (lines.length && (state.status.anamnese === "empty" || !String(state.values.anamnese || "").trim())) {
      state.values.anamnese = lines.join(" · ");
      state.status.anamnese = "pre";
    }
    // Unterschriebene Aufklaerungsdokumente (mit PDF-Link) an den State haengen
    // -> aufklaerungBodyHtml rendert sie als Liste. Nur setzen, wenn geliefert;
    // spaeter live diktierter Aufklaerungstext bleibt daneben erhalten.
    if (Array.isArray(aufklaerungDocs) && aufklaerungDocs.length) {
      state.aufklaerungDocs = aufklaerungDocs.slice(0, 12);
      if (state.status.aufklaerung === "empty" || state.status.aufklaerung === "gap") {
        state.status.aufklaerung = "pre";
      }
    }
    const ds = String(docsStatus || "").toLowerCase();
    if ((ds === "green" || ds === "signed" || ds === "ok") &&
        !String(state.values.aufklaerung || "").trim() &&
        !(Array.isArray(state.aufklaerungDocs) && state.aufklaerungDocs.length)) {
      state.values.aufklaerung = "Aufklärungsdokumente unterschrieben (SignR)";
      state.status.aufklaerung = "pre";
    }
    return state;
  }

  /** Patientenanliegen (AP3, Chef 24.07.2026): Raum-/Patienten-Segmente in die
      Box "anliegen" buendeln (dedupe, Reihenfolge erhalten). Idempotent — beim
      Voll-Rebuild wird die Box aus der kompletten Raum-Liste neu aufgebaut. */
  function applyAnliegenSegments(state, segs) {
    if (!state || !Array.isArray(segs) || !segs.length) return state;
    const seen = new Set();
    const parts = [];
    for (const s of segs) {
      const t = String(s?.text || "").trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(t);
    }
    const joined = parts.join(" ");
    if (joined) {
      state.values.anliegen = joined;
      if (state.status.anliegen !== "pre") state.status.anliegen = "live";
    }
    return state;
  }

  /** Pflicht-Lücken setzen (auch ohne Segmente — für Souffleuse).
   * Komplikationen/Procedere vorerst NICHT pflichtig (Chef 23.07.) —
   * nur Aufklärung neben Befund/Diagnose/Therapie. */
  function ensureGaps(state) {
    if (!state) return state;
    const need = ["befund", "diagnose", "therapie", "aufklaerung"];
    for (const k of need) {
      if (!String(state.values[k] || "").trim() && state.status[k] !== "pre") {
        state.status[k] = "gap";
      }
    }
    // Alte Pflicht-Flags abraeumen, falls noch aus frueherem Stand.
    for (const k of ["komplikationen", "procedere"]) {
      if (state.status[k] === "gap" && !String(state.values[k] || "").trim()) {
        state.status[k] = "empty";
      }
    }
    if (state.openBlocks.has("fuellung")) {
      if (!state.values.fuellung_material) state.status.fuellung_material = "gap";
      if (!state.values.fuellung_flaechen) state.status.fuellung_flaechen = "gap";
    }
    if (state.openBlocks.has("la") && !state.values.la_mittel) {
      state.status.la_mittel = "gap";
    }
    if (state.openBlocks.has("bildgebung")) {
      if (!state.values.roe_indikation) state.status.roe_indikation = "gap";
      if (!state.values.roe_region) state.status.roe_region = "gap";
    }
    if (state.openBlocks.has("planwechsel") && !state.values.plan_zustimmung) {
      state.status.plan_zustimmung = "gap";
    }
    state.gapCount = Object.keys(state.status).filter((k) => state.status[k] === "gap").length;
    return state;
  }

  const SOUFFLE_BOX = {
    befund: "Befund",
    diagnose: "Diagnose",
    therapie: "Therapie",
    aufklaerung: "Aufklärung",
    la_mittel: "Lokalanästhesie",
    fuellung_material: "Füllungsmaterial",
    fuellung_flaechen: "Füllungsflächen",
    roe_indikation: "Röntgen-Indikation",
    roe_region: "Röntgen-Region",
    plan_zustimmung: "Planänderung Zustimmung",
    zaehne: "Zähne",
  };

  /**
   * Nächster Souffleuse-Hinweis: „Denk noch an: Befund.“
   * skipped = bereits gesprochene Keys (Set).
   */
  function nextSouffleHint(state, skipped) {
    if (!state) return null;
    ensureGaps(state);
    const skip = skipped || new Set();
    const order = Object.keys(SOUFFLE_BOX);
    for (const k of order) {
      if (skip.has(k)) continue;
      if ((state.status[k] || "") !== "gap") continue;
      const box = SOUFFLE_BOX[k];
      return { key: k, box, text: "Denk noch an: " + box + "." };
    }
    return null;
  }

  /** Offene Lücken als kurze Dialog-Prompts (Nachdiktat). */
  function openGapPrompts(state) {
    if (!state) return [];
    ensureGaps(state);
    const labels = {
      befund: "Befund noch offen — was war der klinische Befund?",
      diagnose: "Diagnose fehlt — wie lautet sie?",
      therapie: "Therapie fehlt — was wurde gemacht?",
      aufklaerung: "Aufklärung dokumentiert?",
      la_mittel: "Lokalanästhesie: Wirkstoff / Menge?",
      fuellung_material: "Füllung: Material?",
      fuellung_flaechen: "Füllung: Flächen?",
      roe_indikation: "Röntgen: rechtfertigende Indikation?",
    };
    return Object.keys(labels)
      .filter((k) => (state.status[k] || "") === "gap")
      .map((k) => ({ key: k, question: labels[k] }))
      .slice(0, 8);
  }

  function guessStartBlocks(anlass) {
    const t = String(anlass || "").toLowerCase();
    const open = new Set();
    if (/f[uü]ll|komposit|restaurat|inlay|onlay|overlay/.test(t)) open.add("fuellung");
    if (/endo|wurzel|revital/.test(t)) open.add("endo");
    if (/extrak|zieh|osteotom/.test(t)) open.add("extraktion");
    if (/implant/.test(t)) {/* geplant — kein Therapie-Block vorab */}
    if (/pzr|prophylaxe|reinigung|recall/.test(t)) {/* basis reicht */}
    if (/f[uü]ll|endo|extrak|osteotom|chirurgie|implant|pr[aä]p/.test(t)) open.add("la");
    return open;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // Attribut-Escape (href): escapeHtml maskiert bereits & < > " -> genuegt fuer
  // doppelt gequotete Attribute.
  const escapeAttr = escapeHtml;

  function setField(state, key, text, st) {
    const v = String(text || "").trim();
    if (!v) return;
    const prev = state.values[key] || "";
    if (prev && prev.length >= v.length && prev.toLowerCase().includes(v.toLowerCase())) return;
    // Ersetzen NUR wenn der neue Text den alten enthaelt (wachsendes Partial /
    // Server-Korrektur). Sonst anhaengen — vorher verlor die Box gesammelte
    // Eintraege, sobald ein laengeres neues Diktat kam (Chef 21.07.:
    // "Lena reagiert nicht mit Eintraegen im Befund").
    if (prev && v.length > prev.length && v.toLowerCase().includes(prev.toLowerCase())) {
      state.values[key] = v;
    } else if (!prev) {
      state.values[key] = v;
    } else if (!prev.toLowerCase().includes(v.toLowerCase())) {
      state.values[key] = prev + (prev.endsWith(".") ? " " : ". ") + v;
    }
    state.status[key] = st || "live";
    if ((st || "live") === "live") state.lastTouchedKey = key;
  }

  /** Live-Felder vor Idempotent-Rebuild leeren (SignR/Anlass = status "pre" bleiben). */
  function clearLiveFields(state) {
    if (!state || !state.values) return;
    for (const k of Object.keys(state.values)) {
      if (state.status[k] === "pre") continue;
      if (k === "anlass") continue;
      delete state.values[k];
      state.status[k] = "empty";
    }
    // Bloecke neu aus dem Diktat ableiten (Startbloecke bleiben Basis).
    state.openBlocks = guessStartBlocks(state.anlass || state.values.anlass || "");
    state.gapCount = 0;
    state.lastTouchedKey = "";
  }

  /**
   * Kurze Quittungen / Fülllaute — kein Freitext-Sink (Doku-Seite).
   * Echte Formulierungen (>= ~12 Zeichen oder >= 3 Woerter) kommen durch.
   */
  function isDokuChatter(text) {
    const s = String(text || "").trim();
    if (!s) return true;
    if (SYSTEM_CHATTER_RE.test(s)) return true;
    if (/^(?:ja|nein|ok|okay|gut|danke|bitte|moment|weiter|richtig|genau|super|perfekt|mh+|mhm+|aha|hm+)[\s.!?]*$/i.test(s)) {
      return true;
    }
    const words = s.split(/\s+/).filter(Boolean);
    if (s.length < 12 && words.length < 3) return true;
    return false;
  }

  function extractTeeth(text) {
    if (global.LenaVoiceChart?.extractFdi) {
      return global.LenaVoiceChart.extractFdi(text);
    }
    const out = [];
    const re = /\b([1-4][1-8])\b/g;
    let m;
    while ((m = re.exec(text))) out.push(Number(m[1]));
    return out;
  }

  function corpus(segments) {
    return (segments || [])
      .map((s) => String(s.text || s.textCorrected || "").trim())
      .filter(Boolean)
      .join("\n");
  }

  /* ── Befund-Diktat (Trigger-Wort, Chef 21.07.) ────────────────────────────
     Der Arzt sagt "Befund" → ALLE folgenden Diktate landen im Befund
     (Box + Zahnschema B-Zeile), bis Therapie-HANDLUNG diktiert wird
     (ohne Trigger-Wort) oder explizit "Befund Ende" kommt. */

  const LEAD_FILLERS = /^(?:so|gut|okay|ok|ja|jetzt|dann|und|als\s+n[aä]chstes)[,.\s]+/i;

  function stripLeadFillers(text) {
    let s = String(text || "").trim();
    for (;;) {
      const m = s.match(LEAD_FILLERS);
      if (!m) break;
      s = s.slice(m[0].length);
    }
    return s;
  }

  /** Segment startet das Befund-Diktat? -> { rest } (Rest nach dem Kommando) */
  function befundTrigger(text) {
    const s = stripLeadFillers(text);
    const m = s.match(/^befund(?:aufnahme|erhebung|status)?\b[:,.]?\s*/i);
    if (m) return { rest: s.slice(m[0].length).trim() };
    if (/^(?:ich\s+)?(?:beginne|starte)n?\s+(?:jetzt\s+)?(?:mit\s+)?(?:dem\s+|der\s+)?befund/i.test(s)) {
      return { rest: "" };
    }
    // Kommando-Form mitten im Satz (Live 21.07.: "Schreib in den Befund ein
    // 16x14x."): Verb ... Befund [ein/rein] -> Rest ist Befund-Inhalt.
    const cmd = s.match(/\b(?:schreib\w*|trag\w*|notier\w*|nimm|setz\w*|mach\w*)\b[^.\n]{0,40}?\bbefund\b[:,]?\s*(?:ein|rein|auf|mit)?\b[:,]?\s*/i);
    if (cmd) return { rest: s.slice(cmd.index + cmd[0].length).trim() };
    return null;
  }

  /** Explizites Ende (optional — Therapie-Handlung beendet auch ohne). */
  function befundEndCommand(text) {
    const s = stripLeadFillers(text);
    return (
      /^befund\s+(?:ende|fertig|abgeschlossen|stopp?)\b/i.test(s) ||
      /^(?:ende|stopp?)\s+befund\b/i.test(s)
    );
  }

  /** Segment startet Diagnose-Diktat? */
  function diagnoseTrigger(text) {
    const s = stripLeadFillers(text);
    const m = s.match(/^diagnos(?:e|is)\b[:,.]?\s*/i);
    if (m) return { rest: s.slice(m[0].length).trim() };
    const cmd = s.match(
      /\b(?:schreib\w*|trag\w*|notier\w*|nimm|setz\w*|mach\w*|fakte)\b[^.\n]{0,40}?\bdiagnos(?:e|is)\b[:,]?\s*(?:ein|rein|auf|mit)?\b[:,]?\s*/i,
    );
    if (cmd) return { rest: s.slice(cmd.index + cmd[0].length).trim() };
    return null;
  }

  /** Segment startet Therapie-Diktat? ("Therapie." allein = Modus, ohne Inhalt) */
  function therapieTrigger(text) {
    const s = stripLeadFillers(text);
    const m = s.match(/^therapie\b[:,.]?\s*/i);
    if (m) return { rest: s.slice(m[0].length).trim() };
    const cmd = s.match(
      /\b(?:schreib\w*|trag\w*|notier\w*)\b[^.\n]{0,40}?\btherapie\b[:,]?\s*(?:ein|rein|auf|mit)?\b[:,]?\s*/i,
    );
    if (cmd) return { rest: s.slice(cmd.index + cmd[0].length).trim() };
    return null;
  }

  /** Segment startet Aufklärungs-Notiz? */
  function aufklaerungTrigger(text) {
    const s = stripLeadFillers(text);
    const m = s.match(/^aufkl[aä]rung\b[:,.]?\s*/i);
    if (m) return { rest: s.slice(m[0].length).trim() };
    return null;
  }

  /* Nachfragen ans System ("Hoerst du mich?", Live 13:12) sind kein Befund —
     im Befund-Modus ueberspringen (bleiben nur im Rohdialog-Archiv). */
  const SYSTEM_CHATTER_RE =
    /\bh[oö]rst\s+du\b|\bverstehst\s+du\b|\bbist\s+du\s+(?:da|noch\s+da|bereit)\b|\bfunktioniert\s+(?:das|es|die\s+aufnahme)\b|\bhallo\s+(?:lena|clara)\b|\bkannst\s+du\s+mich\s+h[oö]ren\b/i;

  /** Therapie-HANDLUNG (Verben/LA) — beendet das Befund-Diktat automatisch. */
  const THERAPY_ACTION_RE = new RegExp(
    [
      "exkavier\\w*", "pr[aä]parier\\w*", "trepanier\\w*", "aufbereit\\w*",
      "obturier\\w*", "extrahier\\w*", "zementier\\w*", "injizier\\w*",
      "infiltrier\\w*", "an[aä]sthesier\\w*", "\\ban[aä]sthesie\\b",
      "ultracain", "ubistesin", "scandonest", "xylocain",
      "gebondet", "bonding", "ge[aä]tzt", "angeätzt", "angeaetzt",
      "gesp[uü]lt", "sp[uü]le\\b", "gen[aä]ht", "naht\\s+gelegt",
      "f[uü]llung\\s+(?:gelegt|gemacht)", "\\bgelegt\\b", "\\bgesetzt\\b",
      "eingesetzt", "abformung", "\\babdruck\\b",
      "membran", "knochenaufbau", "augment", "bio[- ]?oss", "sinuslift",
    ].join("|"),
    "i",
  );

  /* "muss extrahiert werden" / "ist zu fuellen" ist BEFUND/Plan, keine
     durchgefuehrte Handlung (Live 21.07.: beendete faelschlich den
     Befund-Modus). Soll-/Passiv-Formen erkennen und drinbleiben. */
  const THERAPY_NEED_RE =
    /\b(?:muss|m[uü]ssen|musst|soll(?:te)?n?|w[aä]re|ist|sind|w[uü]rde|wird|werden)\b[^.\n]{0,60}\b(?:extrahier|exkavier|pr[aä]parier|trepanier|aufbereit|obturier|zementier|f[uü]ll|zieh|entfern|ersetz|[uü]berkron|behandel)/i;
  const THERAPY_PASSIVE_RE =
    /\b(?:extrahiert|exkaviert|pr[aä]pariert|trepaniert|aufbereitet|obturiert|zementiert|gef[uü]llt|gezogen|entfernt|ersetzt|[uü]berkront|behandelt)\s+(?:werden|wird|w[uü]rde)\b/i;

  function isTherapyActionDone(text) {
    return (
      THERAPY_ACTION_RE.test(text) &&
      !THERAPY_NEED_RE.test(text) &&
      !THERAPY_PASSIVE_RE.test(text)
    );
  }

  /**
   * Modus je Lauf NEU aus der Segment-Reihenfolge ableiten. applySegments
   * bekommt immer die VOLLE Liste — so bleibt das Routing idempotent, auch
   * wenn der State zwischendurch frisch aufgebaut wird.
   * @returns Array<{ text: string, forced: boolean, box?: string }>
   */
  // Live-Themen-Boxen (Chef 26.07.2026): qwen3.6 klassifiziert jedes Segment
  // (Feld `section`); diese LLM-Zuordnung hat Vorrang vor der Heuristik/dem
  // Trigger-Modus. Nur diese Schluessel sind gueltige Ziel-Boxen.
  const SECTION_BOX = new Set(["anamnese", "befund", "diagnose", "therapie", "aufklaerung", "procedere"]);
  function normSection(x) {
    const s = String(x || "").toLowerCase().trim();
    return SECTION_BOX.has(s) ? s : "";
  }

  /**
   * Segmente -> Ziel-Boxen. Eingabe: Strings ODER {text, section}. Eine
   * gueltige LLM-Sektion setzt die Box hart (forced) und hat Vorrang vor der
   * Trigger-/Modus-Heuristik; Steuerbefehle werden weiterhin abgefangen.
   * Segmente OHNE Sektion (Klassifikation noch unterwegs / LLM aus) laufen wie
   * bisher ueber Trigger-Woerter + Modus + Freitext-Fallback.
   */
  function routeSegments(state, texts) {
    let mode = null; // befund | diagnose | therapie | aufklaerung | null
    const routed = [];
    const items = (texts || []).map((x) => (
      (x && typeof x === "object")
        ? { text: String(x.text || ""), section: normSection(x.section) }
        : { text: String(x || ""), section: "" }
    ));
    const pushForced = (box, rest) => {
      if (rest) routed.push({ text: rest, forced: true, box });
    };
    for (const it of items) {
      const t = it.text;
      const sec = it.section; // "" oder gueltiger Box-Key (LLM)
      if (befundEndCommand(t)) {
        mode = null;
        continue;
      }
      if (isFinishControlText(t) || schemaResetCommand(t) || isControlEchoText(t)) {
        continue;
      }
      const delCmd = toothDeleteCommand(t);
      if (delCmd) {
        routed.push({ text: "", forced: false, del: delCmd });
        continue;
      }
      // Trigger-Woerter: Praefix strippen (Rest ist Inhalt). Zielbox = LLM-
      // Sektion, sonst die vom Trigger gemeinte Box.
      const dTrig = diagnoseTrigger(t);
      if (dTrig) { mode = sec || "diagnose"; pushForced(mode, dTrig.rest); continue; }
      const thTrig = therapieTrigger(t);
      if (thTrig) { mode = sec || "therapie"; pushForced(mode, thTrig.rest); continue; }
      const aTrig = aufklaerungTrigger(t);
      if (aTrig) { mode = sec || "aufklaerung"; pushForced(mode, aTrig.rest); continue; }
      const trig = befundTrigger(t);
      if (trig) { mode = sec || "befund"; pushForced(mode, trig.rest); continue; }
      // LLM-Sektion vorhanden -> sie bestimmt die Box (Vorrang vor Heuristik).
      if (sec) {
        routed.push({ text: t, forced: true, box: sec });
        mode = sec;
        continue;
      }
      // Therapie-Handlung beendet Befund-Modus und landet in Therapie.
      if (mode === "befund" && isTherapyActionDone(t)) {
        mode = "therapie";
        routed.push({ text: t, forced: true, box: "therapie" });
        continue;
      }
      if (mode === "befund" && SYSTEM_CHATTER_RE.test(t)) continue;
      if (mode) {
        routed.push({ text: t, forced: true, box: mode });
        continue;
      }
      routed.push({ text: t, forced: false });
    }
    if (state) state.dictMode = mode;
    return routed;
  }

  /**
   * Heuristik: Segmente -> Felder/Bloecke. Kein LLM.
   * Planwechsel nur bei Entscheidungssprache; Zustimmung aus Kontext.
   */
  function applySegments(state, segments) {
    if (!state) return state;
    // Schema-Seite hat eigenen Pfad (keine Boxen).
    if (state.page === "schema") {
      return applySchemaSegments(state, segments);
    }
    // {text, section}: section = qwen3.6-Live-Klassifikation (Chef 26.07.),
    // bestimmt in routeSegments die Ziel-Box. segForBoxes hat `text` bereits auf
    // die korrigierte Fassung gehoben; `section` wird durchgereicht.
    let items = (segments || [])
      .map((s) => ({
        text: String(s.text || s.textCorrected || "").trim(),
        section: normSection(s.section),
        startMs: Number(s.startMs) || 0,
      }))
      .filter((x) => x.text);
    // Globales Reset ("lösch alles") gilt auch fuer den Doku-Rebuild:
    // alles vor dem juengsten Reset verfaellt (Chart UND Boxen).
    for (let i = items.length - 1; i >= 0; i--) {
      if (schemaResetCommand(items[i].text)) {
        items = items.slice(i + 1);
        break;
      }
    }
    // Idempotenter Rebuild: Live-Boxen leeren, dann aus der VOLLEN Liste
    // neu befuellen (sonst bleiben gestrichene Segmente in den Boxen).
    clearLiveFields(state);
    if (!items.length) {
      state.dictMode = null;
      return state;
    }
    // 01-Befund-Reinschrift (Chef 26.07.2026): liegt eine konsolidierte
    // 01-Fassung vor (state.befund01, beim Uebergang einmal per qwen3.6
    // erzeugt), fuellen die Segmente der BEFUNDPHASE die Befund-Box NICHT mehr
    // einzeln (kein "vier, vier Krone") — sie sind durch die Reinschrift
    // ersetzt. Grenze: bis inkl. letztem Finish-Kommando ODER startMs bis zum
    // Uebergangs-Zeitpunkt (befund01Until). Das ZAHN-CHART nutzt weiter ALLE
    // Segmente (Zahnstatus bleibt vollstaendig). Ohne befund01: Verhalten
    // unveraendert (treatItems === items).
    let treatItems = items;
    if (state.befund01) {
      const until = Number(state.befund01Until) || 0;
      let bnd = -1;
      for (let i = items.length - 1; i >= 0; i--) {
        if (isFinishControlText(items[i].text)) { bnd = i; break; }
      }
      treatItems = items.filter((it, i) => {
        if (bnd >= 0 && i <= bnd) return false;
        if (until && it.startMs && it.startMs <= until) return false;
        return true;
      });
    }
    // Boxen aus der Behandlungsphase (dictMode folgt ihr); Chart aus allem.
    const routed = routeSegments(state, treatItems);
    const routedChart = (treatItems === items) ? routed : routeSegments(null, items);
    // Block-/LA-/Plan-Scans: Befund-Diktat (forced befund) darf keine Bloecke
    // oeffnen ("17 Fuellung insuffizient" = Bestand). Therapie-Segmente schon.
    const all = routed
      .filter((r) => !r.forced || r.box === "therapie")
      .map((r) => r.text)
      .filter(Boolean)
      .join("\n");

    // Chart idempotent neu aufbauen (volle Segmentliste), dann Text-Boxen.
    // UI der Doku-Seite zeigt das Schema nicht — Stand bleibt in state.chart
    // fuer Summary / "aus Schema"-Zeile.
    state.teeth = new Set();
    state.lastChartFdi = null;
    for (const r of routedChart) {
      if (r.del) {
        state.teeth.delete(r.del.fdi);
        if (r.del.rebind) state.teeth.add(r.del.fdi);
        continue;
      }
      for (const z of extractTeeth(r.text)) state.teeth.add(z);
    }
    if (global.LenaVoiceChart) {
      state.chart = global.LenaVoiceChart.emptyChart();
      const chartSegs = routedChart.map((r) => (
        r.del ? { del: r.del } : {
          text: r.text,
          forceLayer: (r.forced && (!r.box || r.box === "befund")) ? "befund" : "",
        }
      ));
      const last = buildChartWithDeletes(state.chart, chartSegs);
      if (last) {
        state.lastChartFdi = last;
        state.teeth.add(last);
      }
      const lines = global.LenaVoiceChart.summaryLines
        ? global.LenaVoiceChart.summaryLines(state.chart)
        : [];
      const marked = new Set(lines.map((l) => parseInt(l, 10)));
      const namedOnly = [...state.teeth]
        .filter((z) => !marked.has(z))
        .sort((a, b) => a - b);
      const zparts = lines.slice();
      if (namedOnly.length) zparts.push("genannt: " + namedOnly.join(", "));
      if (zparts.length) {
        state.values.zaehne = zparts.join(" · ");
        state.status.zaehne = "live";
      }
    }

    // Anamnese / Befund / Therapie / Diagnose / Aufklärung (+ Freitext-Fallback).
    // NB: Das ist nur noch der Uebergangs-Fallback — die qwen3.6-Live-Sektion
    // (routeSegments, forced/box) hat Vorrang. Anamnestische Patienten-
    // Schilderungen (frueher pauschal Befund) bekommen hier endlich eine Box.
    const ANAMNESE_RE =
      /\banamnese\b|patient(?:in)?\s+(?:berichtet|schildert|gibt\s+an|klagt|erz[aä]hlt|meint|sagt)|\b(?:seit|vor)\s+(?:\d+|einigen?|ein\s+paar|mehreren|wenigen)\s+(?:tag|woch|monat|jahr)|\bseit\s+(?:gestern|vorgestern|heute|letzter?\s+woche)|beschwerden\s+seit|schmerz(?:en)?\s+seit|vorerkrank|\ballergi|blutverd[uü]nn|marcumar|bisphosphonat|schwanger|\braucht\b|nichtraucher/i;
    const DIAGNOSE_RE =
      /diagnos|\bcap\b|abszess|abscess|parodontit|periodontit|gingivit|pulpit|\bcaries\b|apikal(?:e|er|es)?\s+parodont|fossa\s+canina|submuk[oö]s|chronisch\s+apikal|eitrig(?:e|er)?\s+entz[uü]nd/i;
    const BEFUND_RE =
      /\bbefund\b|perkussion|vitalit[aä]t|locker|fistel|schwellung|sondier|druckdolent|aufbiss|entz[uü]nd|mobil|blutung.*sondier|rezession|furkation|\bkaries\b|kari[oö]s|fehlt|fehlend|insuffizient/i;
    const THERAPIE_RE =
      /exkav|f[uü]ll|komposit|trepan|aufbereit|obturat|extrah|\bextraktion\b|naht|pr[aä]par|zement|einsetz|membran|knochenaufbau|augment|bio[- ]?oss|sinuslift|implant(?:at)?\s+(?:gesetzt|inseriert|gelegt)|(?:gesetzt|inseriert|gelegt)\w*\s+implant|gezogen|provisor|krone\s+(?:gesetzt|eingesetzt|zementiert)|ultracain|ubistesin|an[aä]sthes/i;
    const AUFKL_RE =
      /aufkl[aä]r|risiken?\s+besprochen|einverstanden|unterschr|aufgekl[aä]rt|patient\s+(?:ist\s+)?informiert/i;

    // 01-Befund-Reinschrift zuerst in die Befund-Box (qwen3.6, FDI + Recht-
    // schreibung). Spaeter im Behandlungsverlauf diktierte Befunde haengen sich
    // darunter an (setField). Kompakt (eine Zeile je Befund -> " · ").
    if (state.befund01) {
      const clean = String(state.befund01)
        .split(/\r?\n+/).map((l) => l.trim()).filter(Boolean).join(" · ");
      if (clean) setField(state, "befund", clean, "live");
    }

    for (const r of routed) {
      if (r.del) continue;
      const t = r.text;
      if (!t) continue;
      if (r.forced && r.box) {
        setField(state, r.box, t, "live");
        continue;
      }
      // Legacy: forced ohne box = Befund-Diktat
      if (r.forced) {
        setField(state, "befund", t, "live");
        if (DIAGNOSE_RE.test(t)) setField(state, "diagnose", t, "live");
        continue;
      }
      let placed = false;
      if (ANAMNESE_RE.test(t)) {
        setField(state, "anamnese", t, "live");
        placed = true;
      }
      if (DIAGNOSE_RE.test(t)) {
        setField(state, "diagnose", t, "live");
        placed = true;
      }
      if (BEFUND_RE.test(t)) {
        setField(state, "befund", t, "live");
        placed = true;
      }
      if (THERAPIE_RE.test(t)) {
        if (THERAPY_NEED_RE.test(t) || THERAPY_PASSIVE_RE.test(t)) {
          setField(state, "befund", t, "live");
        } else {
          setField(state, "therapie", t, "live");
        }
        placed = true;
      }
      if (AUFKL_RE.test(t)) {
        setField(state, "aufklaerung", t, "live");
        placed = true;
      }
      // Procedere nur bei explizitem Stichwort (keine Pflicht-Box / Souffleuse).
      if (/kontrolle|wiedervorstellung|rezept|schonung|procedere|n[aä]chste\s+(?:woche|termin)|vorgehen/i.test(t)) {
        setField(state, "procedere", t, "live");
        placed = true;
      }
      if (/keine komplikationen|komplikationslos|ohne besonderheit/i.test(t)) {
        setField(state, "komplikationen", "keine", "live");
        placed = true;
      } else if (/\bkomplikation/i.test(t)) {
        setField(state, "komplikationen", t, "live");
        placed = true;
      }
      if (!placed && !isDokuChatter(t)) {
        setField(state, "befund", t, "live");
      }
    }

    // LA
    if (/ultracain|ubistesin|scandonest|xylocain|an[aä]sthes|leitungsan|infiltrationsan/i.test(all)) {
      state.openBlocks.add("la");
      const m = all.match(/(ultracain|ubistesin|scandonest|xylocain)[^\n.]{0,40}/i);
      if (m) setField(state, "la_mittel", m[0].trim(), "live");
      if (/leitung/i.test(all)) setField(state, "la_region", "Leitungsanästhesie", "live");
      else if (/infiltration/i.test(all)) setField(state, "la_region", "Infiltration", "live");
    }

    // Bloecke nach Inhalt
    if (/f[uü]ll|komposit|adh[aä]siv|mehrschicht/i.test(all)) {
      state.openBlocks.add("fuellung");
      if (/komposit/i.test(all)) setField(state, "fuellung_material", "Komposit", "live");
      const fl = all.match(/\b([MODIBLVmodiblv]{1,5})\b/);
      if (fl && /[modiblv]/i.test(fl[1])) setField(state, "fuellung_flaechen", fl[1].toUpperCase(), "live");
      else if (/occlus|okklusal/i.test(all)) setField(state, "fuellung_flaechen", "O", "live");
    }
    if (/wurzelbehandlung|endodont|trepanation|aufbereitung|guttapercha|canal/i.test(all)) {
      state.openBlocks.add("endo");
      setField(state, "endo_kanaele", "Endodontie erwähnt", "live");
    }
    if (/\bextraktion\b|zahn\s+zieh|ziehen wir|osteotomie/i.test(all)) {
      state.openBlocks.add("extraktion");
      if (state.teeth.size) {
        setField(state, "ex_zahn", "Zahn " + [...state.teeth].join(", "), "live");
      } else setField(state, "ex_zahn", "Extraktion erwähnt", "live");
    }
    if (/\b(?:r[oö]e?|roentgen|röntgen|opg|dvt|zahnfilm|bissfl)/i.test(all)) {
      state.openBlocks.add("bildgebung");
      const rm = all.match(/(?:zahnfilm|opg|dvt|r[oö]e?)[^\n.]{0,30}/i);
      if (rm) setField(state, "roe_region", rm[0].trim(), "live");
    }

    // Planwechsel: Entscheidungssprache (nicht nur Optionen)
    const planDecision =
      /verschieben|umentschieden|doch erst|stattdessen|nicht mehr (?:das )?implant|machen wir (?:dann |heute )?erst|erst (?:den |die |das )?(?:schmerz|zahn)|plan[aä]nder|abweichen/i.test(all);
    const consent =
      /einverstanden|zustimmen|stimmt zu|patient (?:ist )?einverstanden|\bja[,.]?\s*(?:machen|gerne|in ordnung)|in ordnung/i.test(all);

    if (planDecision || (consent && (state.openBlocks.has("endo") || state.openBlocks.has("extraktion")))) {
      state.openBlocks.add("planwechsel");
      if (!state.values.plan_geplant && state.anlass) {
        setField(state, "plan_geplant", state.anlass, "pre");
      }
      let neu = "";
      if (state.openBlocks.has("endo") && !/endo|wurzel/i.test(state.anlass || "")) neu = "Endodontie";
      else if (state.openBlocks.has("extraktion") && !/extrak|zieh/i.test(state.anlass || "")) neu = "Extraktion";
      else if (/schmerz/i.test(all) && /implant/i.test(state.anlass || "")) neu = "Schmerzbehandlung zuerst";
      if (neu) setField(state, "plan_durchgefuehrt", neu, "live");
      if (consent) setField(state, "plan_zustimmung", "aus Gespräch: Zustimmung erkannt", "live");
      else if (planDecision) {
        state.status.plan_zustimmung = state.values.plan_zustimmung ? state.status.plan_zustimmung : "gap";
      }
    }

    // Pflicht-Luecken fuer sichtbare Felder (ohne Komplikationen/Procedere)
    const need = ["befund", "diagnose", "therapie", "aufklaerung"];
    for (const k of need) {
      if (!state.values[k] && state.status[k] !== "pre") state.status[k] = "gap";
    }
    for (const k of ["komplikationen", "procedere"]) {
      if (state.status[k] === "gap" && !state.values[k]) state.status[k] = "empty";
    }
    if (state.openBlocks.has("bildgebung")) {
      if (!state.values.roe_indikation) state.status.roe_indikation = "gap";
      if (!state.values.roe_region) state.status.roe_region = "gap";
    }
    if (state.openBlocks.has("planwechsel") && !state.values.plan_zustimmung) {
      state.status.plan_zustimmung = "gap";
    }

    state.gapCount = Object.keys(state.status).filter((k) => state.status[k] === "gap").length;
    return state;
  }

  function teethHtml(state) {
    if (global.LenaVoiceChart && state.chart) {
      return global.LenaVoiceChart.renderSchemaHtml(state.chart, state.lastChartFdi || null, state.teeth || null);
    }
    const selected = state.teeth || new Set();
    const row = (nums) => nums.map((n) => {
      const on = selected.has(n) ? " on" : "";
      return '<div class="tooth' + on + '">' + n + "</div>";
    }).join("");
    return (
      '<div class="teeth">' +
      row([18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]) +
      row([48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]) +
      "</div>"
    );
  }

  function fieldHtml(label, key, state, extra, opts) {
    const st = state.status[key] || "empty";
    const val = state.values[key] || "";
    let cls = "tpl-field";
    if (opts && opts.wide) cls += " tpl-field--wide";
    if (state.lastTouchedKey === key) cls += " is-focus";
    if (st === "gap") cls += " is-gap";
    else if (st === "pre") cls += " is-pre";
    else if (st === "live" || (val && st !== "empty")) cls += " is-filled";
    let badge = "";
    if (st === "pre") badge = '<span class="tpl-badge pre">Termin / Akte</span>';
    else if (st === "gap") badge = '<span class="tpl-badge gap">Lücke</span>';
    else if (st === "live" || val) badge = '<span class="tpl-badge live">live</span>';
    const body = extra || (
      val
        ? '<div class="tpl-val">' + escapeHtml(val) + "</div>"
        : '<div class="tpl-val empty">—</div>'
    );
    return (
      '<div class="' + cls + '" data-key="' + key + '">' +
      '<div class="tpl-lab">' + escapeHtml(label) + " " + badge + "</div>" +
      body +
      "</div>"
    );
  }

  function focusLastTouched(container, state) {
    if (!container || !state?.lastTouchedKey) return;
    const el = container.querySelector('.tpl-field[data-key="' + state.lastTouchedKey + '"]');
    if (el && typeof el.scrollIntoView === "function") {
      try { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (_) {}
    }
  }

  function render(container, state) {
    if (!container || !state) return;
    const parts = [];
    const modeChip = state.dictMode === "befund"
      ? '<span class="tpl-mode" id="tplMode">● Befund-Diktat — alles geht in den Befund</span>'
      : "";
    parts.push(
      '<div class="tpl-title"><h2>' + escapeHtml(TEMPLATE.title) + "</h2>" + modeChip +
      '<span class="tpl-gaps" id="tplGaps">Lücken: ' + (state.gapCount || 0) + "</span></div>"
    );
    if (state.dictMode === "befund" && !state.lastTouchedKey) state.lastTouchedKey = "befund";

    parts.push(fieldHtml("Anlass", "anlass", state));
    parts.push(fieldHtml("Patientenanliegen heute", "anliegen", state));
    parts.push(fieldHtml("Anamnese-Risiken", "anamnese", state));
    parts.push(fieldHtml("Zähne / Status (KZBV)", "zaehne", state, teethHtml(state) +
      (state.values.zaehne ? '<div class="tpl-val" style="margin-top:6px">' + escapeHtml(state.values.zaehne) + "</div>" : ""),
      { wide: true }));
    parts.push(fieldHtml("Befund", "befund", state));
    parts.push(fieldHtml("Diagnose", "diagnose", state));
    parts.push(fieldHtml("Therapie", "therapie", state));

    for (const b of TEMPLATE.blocks) {
      if (!state.openBlocks.has(b.id)) continue;
      parts.push('<div class="tpl-block" data-block="' + b.id + '">');
      parts.push(
        '<div class="tpl-block-head">' + escapeHtml(b.title) +
        (b.hint ? '<em>' + escapeHtml(b.hint) + "</em>" : "") +
        "</div><div class=\"tpl-block-body\">"
      );
      for (const f of b.fields) parts.push(fieldHtml(f.label, f.key, state));
      parts.push("</div></div>");
    }

    parts.push(fieldHtml("Aufklärung", "aufklaerung", state, aufklaerungBodyHtml(state)));
    if (String(state.values.komplikationen || "").trim()) {
      parts.push(fieldHtml("Komplikationen", "komplikationen", state));
    }
    if (String(state.values.procedere || "").trim()) {
      parts.push(fieldHtml("Procedere", "procedere", state));
    }

    container.innerHTML = parts.join("");
    focusLastTouched(container, state);
  }

  function toStructuredText(state) {
    if (!state) return "";
    const lines = ["DOKU-TEMPLATE ZAHNMEDIZIN", ""];
    const push = (lab, key) => {
      const v = state.values[key];
      if (v) lines.push(lab + ": " + v);
    };
    push("Anlass", "anlass");
    push("Patientenanliegen", "anliegen");
    push("Anamnese", "anamnese");
    push("Zähne", "zaehne");
    push("Befund", "befund");
    push("Diagnose", "diagnose");
    push("Therapie", "therapie");
    if (state.openBlocks.has("planwechsel")) {
      lines.push("PLANÄNDERUNG");
      push("  Geplant", "plan_geplant");
      push("  Durchgeführt", "plan_durchgefuehrt");
      push("  Zustimmung", "plan_zustimmung");
    }
    for (const b of TEMPLATE.blocks) {
      if (b.id === "planwechsel" || !state.openBlocks.has(b.id)) continue;
      lines.push(b.title.toUpperCase());
      for (const f of b.fields) push("  " + f.label, f.key);
    }
    push("Aufklärung", "aufklaerung");
    push("Komplikationen", "komplikationen");
    push("Procedere", "procedere");
    return lines.join("\n").trim();
  }

  global.LenaDokuZahn = {
    TEMPLATE,
    emptyState,
    applySignrPrefill,
    ensureGaps,
    nextSouffleHint,
    openGapPrompts,
    applySegments,
    applyAnliegenSegments,
    applySchemaSegments,
    routeSegments,
    schemaFinishCommand,
    schemaFinishShouldSwitch,
    schemaResetCommand,
    toothDeleteCommand,
    isControlOrReceiptText,
    schemaClarifyAnalyze,
    clarifyQuestionText,
    render,
    renderSchemaOnly,
    renderBoxesOnly,
    focusLastTouched,
    toStructuredText,
    corpus,
    SOUFFLE_BOX,
  };
})(typeof window !== "undefined" ? window : globalThis);
