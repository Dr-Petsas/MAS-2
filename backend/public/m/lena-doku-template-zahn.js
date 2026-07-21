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
    if (prev && v.length > prev.length) state.values[key] = v;
    else if (!prev) state.values[key] = v;
    else if (!prev.toLowerCase().includes(v.toLowerCase())) {
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

  /**
   * Heuristik: Segmente -> Felder/Bloecke. Kein LLM.
   * Planwechsel nur bei Entscheidungssprache; Zustimmung aus Kontext.
   */
  function applySegments(state, segments) {
    if (!state) return state;
    const texts = (segments || [])
      .map((s) => String(s.text || s.textCorrected || "").trim())
      .filter(Boolean);
    const all = texts.join("\n");
    if (!all) return state;

    for (const t of texts) {
      for (const z of extractTeeth(t)) state.teeth.add(z);
    }
    if (state.chart && global.LenaVoiceChart) {
      const last = global.LenaVoiceChart.applySegments(state.chart, segments);
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

    // Befund / Therapie / Diagnose (grob)
    for (const t of texts) {
      if (/kari[oö]s|befund|perkussion|vitalit[aä]t|locker|fistel|schwellung|schmerz/i.test(t)) {
        setField(state, "befund", t, "live");
      }
      if (/diagnos|caries|pulpitis|periodontitis|fractur|fraktur/i.test(t)) {
        setField(state, "diagnose", t, "live");
      }
      if (/exkav|f[uü]ll|komposit|trepan|aufbereit|obturat|extrah|naht|pr[aä]par|zement|einsetz/i.test(t)) {
        setField(state, "therapie", t, "live");
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
    parts.push(
      '<div class="tpl-title"><h2>' + escapeHtml(TEMPLATE.title) + "</h2>" +
      '<span class="tpl-gaps" id="tplGaps">Lücken: ' + (state.gapCount || 0) + "</span></div>"
    );

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
    render,
    focusLastTouched,
    toStructuredText,
    corpus,
    SOUFFLE_BOX,
  };
})(typeof window !== "undefined" ? window : globalThis);
