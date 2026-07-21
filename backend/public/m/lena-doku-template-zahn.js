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
    };
  }

  /**
   * SignR-/Akte-Anamnese in die Anamnese-Box legen (status=pre).
   * findings: [{ category, text }] von /treatment/current.
   */
  function applySignrPrefill(state, { findings, docsStatus } = {}) {
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
    const ds = String(docsStatus || "").toLowerCase();
    if (ds === "green" || ds === "signed" || ds === "ok") {
      if (!state.values.aufklaerung) {
        state.values.aufklaerung = "Aufklärungsdokumente unterschrieben (SignR)";
        state.status.aufklaerung = "pre";
      }
    }
    return state;
  }

  /** Pflicht-Lücken setzen (auch ohne Segmente — für Souffleuse). */
  function ensureGaps(state) {
    if (!state) return state;
    const need = ["befund", "diagnose", "therapie", "komplikationen", "procedere"];
    for (const k of need) {
      if (!String(state.values[k] || "").trim() && state.status[k] !== "pre") {
        state.status[k] = "gap";
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
    komplikationen: "Komplikationen",
    procedere: "Procedere",
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
      komplikationen: "Komplikationen? (sonst: keine)",
      procedere: "Procedere / nächster Schritt?",
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
      /^(?:ende|stopp?)\s+befund\b/i.test(s) ||
      /^therapie\b[:,.]?\s*$/i.test(s)
    );
  }

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
   * @returns Array<{ text: string, forced: boolean }>
   */
  function routeSegments(state, texts) {
    let mode = null;
    const routed = [];
    for (const t of texts) {
      // Ende-Kommando VOR dem Trigger pruefen — "Befund Ende" wuerde sonst
      // vom Trigger-Regex ("befund\b" + Rest) als Neustart gelesen.
      if (befundEndCommand(t)) {
        mode = null;
        continue;
      }
      const trig = befundTrigger(t);
      if (trig) {
        mode = "befund";
        if (trig.rest) routed.push({ text: trig.rest, forced: true });
        continue;
      }
      if (mode === "befund" && isTherapyActionDone(t)) {
        mode = null; // Therapie beginnt — ohne Trigger-Wort (Chef-Vorgabe)
        routed.push({ text: t, forced: false });
        continue;
      }
      routed.push({ text: t, forced: mode === "befund" });
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
    const texts = (segments || [])
      .map((s) => String(s.text || s.textCorrected || "").trim())
      .filter(Boolean);
    if (!texts.length) {
      state.dictMode = null;
      return state;
    }
    const routed = routeSegments(state, texts);
    // Block-/LA-/Plan-Scans nur ueber Auto-Segmente: "17 Fuellung insuffizient"
    // im Befund-Diktat ist Bestand und darf keinen Fuellung-Block oeffnen.
    const all = routed.filter((r) => !r.forced).map((r) => r.text).join("\n");

    for (const r of routed) {
      for (const z of extractTeeth(r.text)) state.teeth.add(z);
    }
    if (state.chart && global.LenaVoiceChart) {
      const chartSegs = routed.map((r) => ({
        text: r.text,
        forceLayer: r.forced ? "befund" : "",
      }));
      const last = global.LenaVoiceChart.applySegments(state.chart, chartSegs);
      if (last) {
        state.lastChartFdi = last;
        state.teeth.add(last);
      }
      const lines = global.LenaVoiceChart.summaryLines
        ? global.LenaVoiceChart.summaryLines(state.chart)
        : [];
      if (lines.length) setField(state, "zaehne", lines.join(" · "), "live");
    } else if (state.teeth.size) {
      const list = [...state.teeth].sort((a, b) => a - b).join(", ");
      setField(state, "zaehne", "Zahn " + list, "live");
    }

    // Befund / Therapie / Diagnose
    for (const r of routed) {
      const t = r.text;
      if (r.forced) {
        // Befund-Diktat: JEDES Segment in die Befund-Box (Chef 21.07.),
        // Diagnose-Sprache zusaetzlich in die Diagnose-Box.
        setField(state, "befund", t, "live");
        if (/diagnos|caries|pulpitis|periodontitis|fractur|fraktur/i.test(t)) {
          setField(state, "diagnose", t, "live");
        }
        continue;
      }
      if (/\bkaries\b|kari[oö]s|befund|perkussion|vitalit[aä]t|locker|fistel|schwellung|schmerz|sondier|druckdolent|aufbiss|entz[uü]nd|eitr\w*|abszess|mobil|blutung.*sondier|rezession|furkation/i.test(t)) {
        setField(state, "befund", t, "live");
      }
      if (/diagnos|caries|pulpitis|periodontitis|fractur|fraktur/i.test(t)) {
        setField(state, "diagnose", t, "live");
      }
      if (/exkav|f[uü]ll|komposit|trepan|aufbereit|obturat|extrah|naht|pr[aä]par|zement|einsetz/i.test(t)) {
        // Soll-/Passiv-Form ("muss extrahiert werden") = Befund/Plan,
        // nicht durchgefuehrte Therapie (Live 21.07.).
        if (THERAPY_NEED_RE.test(t) || THERAPY_PASSIVE_RE.test(t)) {
          setField(state, "befund", t, "live");
        } else {
          setField(state, "therapie", t, "live");
        }
      }
      if (/kontrolle|wiedervorstellung|rezept|schonung|procedere|n[aä]chste/i.test(t)) {
        setField(state, "procedere", t, "live");
      }
      if (/keine komplikationen|komplikationslos|ohne besonderheit/i.test(t)) {
        setField(state, "komplikationen", "keine", "live");
      } else if (/komplikation|blutung|fraktur.*wurzel|via falsa/i.test(t)) {
        setField(state, "komplikationen", t, "live");
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

    // Pflicht-Luecken fuer sichtbare Felder
    const need = ["befund", "diagnose", "therapie", "komplikationen", "procedere"];
    for (const k of need) {
      if (!state.values[k]) state.status[k] = "gap";
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
      return global.LenaVoiceChart.renderSchemaHtml(state.chart, state.lastChartFdi || null);
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

    parts.push(fieldHtml("Aufklärung", "aufklaerung", state));
    parts.push(fieldHtml("Komplikationen", "komplikationen", state));
    parts.push(fieldHtml("Procedere", "procedere", state));

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
    routeSegments,
    render,
    focusLastTouched,
    toStructuredText,
    corpus,
    SOUFFLE_BOX,
  };
})(typeof window !== "undefined" ? window : globalThis);
