/**
 * Stimme → FDI + KZBV-/klinische Marks im Tages-Schema (Befund/Therapie/Paro/Kiefer).
 * Abhängigkeit: LenaZahnstatusKatalog (vorher laden).
 *
 * Während Behandlungsaufnahme (nicht 01-Modus): Segmente füllen die Zeilen.
 * Befund zuerst (z. B. Ka+d); sobald Füllung diktiert → Therapie Fu+Flächen.
 */
(function (global) {
  "use strict";

  const LAYERS = ["befund", "therapie"];

  function kat() {
    return global.LenaZahnstatusKatalog || null;
  }

  function norm(text) {
    return String(text || "")
      .replace(/ß/g, "ss")
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue");
  }

  function extractFdi(text) {
    const K = kat();
    if (!K) return [];
    const out = [];
    const seen = new Set();
    const push = (n) => {
      const fdi = Number(n);
      if (!K.ALL_FDI.has(fdi) || seen.has(fdi)) return;
      seen.add(fdi);
      out.push(fdi);
    };
    const raw = String(text || "");
    let m;
    const reDigit = /\b([1-4][1-8])\b/g;
    while ((m = reDigit.exec(raw))) push(m[1]);
    const low = norm(raw).toLowerCase();
    Object.keys(K.WORD_FDI).forEach((w) => {
      if (low.includes(w)) push(K.WORD_FDI[w]);
    });
    return out;
  }

  function extractCodes(text) {
    const K = kat();
    if (!K) return [];
    const codes = [];
    const seen = new Set();
    const add = (c) => {
      if (!c || seen.has(c)) return;
      seen.add(c);
      codes.push(c);
    };
    const low = String(text || "").toLowerCase();
    const tokenRe = /\b(abw|pkw|skw|stw|sbw|sew|sow|t2w|ix|kw|bw|pw|ww|sk|st|tw|ur|ab|aw|sb|se|so|ew|rw)\b/gi;
    let m;
    while ((m = tokenRe.exec(low))) add(m[1].toLowerCase());
    const single = /\b([1-4][1-8])\s+(kw|ww|pw|bw|ix|[fkxbc])(?=[\s,;:.]|$)/gi;
    while ((m = single.exec(low))) {
      const tok = m[2].toLowerCase();
      if (tok === "c") add("Ka");
      else add(tok);
    }
    const lone = /(?:^|[\s,;:])([fkxbc])(?=[\s,;:.]|$)/gi;
    while ((m = lone.exec(low))) {
      const tok = m[1].toLowerCase();
      if (tok === "c") add("Ka");
      else add(tok);
    }

    K.SPEECH.forEach((rule) => {
      if (rule.re.test(text)) add(rule.code);
    });
    return codes;
  }

  function extractSurfaces(text) {
    const K = kat();
    if (!K) return [];
    const out = [];
    const seen = new Set();
    const add = (c) => {
      if (!c || seen.has(c)) return;
      seen.add(c);
      out.push(c);
    };
    const block = String(text || "").match(/\b([modiblvz]{2,6})\b/i);
    if (block) {
      block[1].toLowerCase().split("").forEach((ch) => {
        if (K.SURFACES[ch]) add(ch);
      });
    }
    K.SURFACE_SPEECH.forEach((rule) => {
      if (rule.re.test(text)) add(rule.code);
    });
    return out;
  }

  function layerOf(code) {
    const K = kat();
    if (K?.LAYER_OF?.[code]) return K.LAYER_OF[code];
    return "befund";
  }

  function parseUtterance(text) {
    const t = String(text || "").trim();
    if (!t) return [];
    const fdis = extractFdi(t);
    const codes = extractCodes(t);
    const surfaces = extractSurfaces(t);
    if (!fdis.length && !codes.length && !surfaces.length) return [];
    if (!fdis.length) {
      return [{ fdi: null, codes, surfaces, text: t }];
    }
    return fdis.map((fdi) => ({ fdi, codes: codes.slice(), surfaces: surfaces.slice(), text: t }));
  }

  function parseSegments(segments) {
    const events = [];
    (segments || []).forEach((s) => {
      const txt = String(s?.text || s?.textCorrected || "").trim();
      if (!txt) return;
      // Befund-Diktat (Trigger "Befund", Chef 21.07.): Segment traegt
      // forceLayer="befund" — alle Marks landen in der B-Zeile.
      const fl = s && s.forceLayer ? String(s.forceLayer) : "";
      parseUtterance(txt).forEach((ev) => {
        if (fl) ev.forceLayer = fl;
        events.push(ev);
      });
    });
    return events;
  }

  function emptyCell() {
    return {
      befund: "",
      therapie: "",
      codes: [],
      surfaces: [],
    };
  }

  function emptyChart() {
    const K = kat();
    const chart = {};
    if (!K) return chart;
    K.FDI_OK.concat(K.FDI_UK).forEach((fdi) => {
      chart[fdi] = emptyCell();
    });
    return chart;
  }

  function appendMark(cell, layer, mark) {
    if (!cell || !layer || !mark) return;
    const cur = String(cell[layer] || "").trim();
    const parts = cur ? cur.split(/\s+/) : [];
    // Spezifischeres ersetzt Allgemeines: c → cd, f → fMOD
    if (parts.some((p) => p === mark || (p.startsWith(mark) && p.length > mark.length))) return;
    const kept = parts.filter((p) => !(mark.startsWith(p) && mark.length > p.length));
    kept.push(mark);
    cell[layer] = kept.join(" ");
  }

  function surfTag(surfaces) {
    return (surfaces || []).join("").toUpperCase();
  }

  function formatMark(code, surfaces) {
    const K = kat();
    if (K?.markForLayer) return K.markForLayer(code, surfaces) || code;
    return code;
  }

  function mergeEvent(chart, ev, lastFdi) {
    if (!chart) return lastFdi;
    const fdi = ev.fdi || lastFdi;
    if (!fdi || !chart[fdi]) return lastFdi;
    const cell = chart[fdi];
    const codes = ev.codes || [];
    const surfaces = ev.surfaces || [];

    // f allein = fehlend (Befund) — nicht Füllung
    if (codes.includes("f") && !codes.includes("Fu")) {
      cell.befund = "f";
      cell.therapie = "";
      cell.codes = ["f"];
      cell.surfaces = [];
      return fdi;
    }

    surfaces.forEach((s) => {
      if (!cell.surfaces.includes(s)) cell.surfaces.push(s);
    });

    if (!codes.length && surfaces.length) {
      appendMark(cell, "befund", surfaces.join("").toLowerCase());
      return fdi;
    }

    codes.forEach((c) => {
      if (c === "f") return; // fehlend oben erledigt
      if (!cell.codes.includes(c)) cell.codes.push(c);
      // Befund-Diktat: erzwungene Zeile schlaegt die Code-Zuordnung —
      // "17 Fuellung insuffizient" im Befund-Modus ist BESTAND (B-Zeile),
      // keine heutige Therapie.
      const layer = ev.forceLayer === "befund" ? "befund" : layerOf(c);
      const dest = layer === "therapie" ? "therapie" : "befund";
      let mark = formatMark(c, surfaces);
      if (ev.forceLayer === "befund" && c === "Fu") {
        // Bestehende Fuellung in der B-Zeile: "fu"+Flaechen — NIE "f",
        // das hiesse dort "fehlender Zahn" (KZBV).
        mark = "fu" + surfTag(surfaces).toLowerCase();
      }
      if (mark) appendMark(cell, dest, mark);
    });

    return fdi;
  }

  function applySegments(chart, segments) {
    let last = null;
    parseSegments(segments).forEach((ev) => {
      last = mergeEvent(chart, ev, last);
    });
    return last;
  }

  /** Kurztext für Summary-Zeile / Zahn-Badge (Therapie vor Befund). */
  function badge(cell) {
    if (!cell) return "";
    if (cell.therapie) return cell.therapie;
    if (cell.befund) return cell.befund;
    return "";
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function layerCell(chart, fdi, layer, selectedFdi) {
    const c = chart && chart[fdi];
    const val = c ? String(c[layer] || "") : "";
    const on = selectedFdi === fdi ? " is-sel" : "";
    const has = val ? " has-mark" : "";
    const miss = c && (c.befund === "f" || (c.codes || []).includes("f")) ? " is-miss" : "";
    return (
      '<div class="zs-cell zs-layer' + on + has + miss + '" data-fdi="' + fdi + '" data-layer="' + layer + '">' +
      (val ? esc(val) : "") +
      "</div>"
    );
  }

  function numCell(chart, fdi, selectedFdi) {
    const c = chart && chart[fdi];
    const b = badge(c);
    const on = selectedFdi === fdi ? " is-sel" : "";
    const has = b ? " has-mark" : "";
    const miss = c && (c.befund === "f" || (c.codes || []).includes("f")) ? " is-miss" : "";
    const done = c && c.therapie && /Fu/i.test(c.therapie) ? " is-done" : "";
    return (
      '<div class="zs-cell zs-num' + on + has + miss + done + '" data-fdi="' + fdi + '">' +
      '<span class="zs-fdi">' + fdi + "</span>" +
      "</div>"
    );
  }

  function layerRow(chart, list, layer, selectedFdi, label) {
    return (
      '<div class="zs-row zs-row-layer" data-layer="' + layer + '">' +
      '<span class="zs-row-lab" title="' + esc(label) + '">' + esc(label.charAt(0)) + "</span>" +
      '<div class="zs-arch">' + list.map((fdi) => layerCell(chart, fdi, layer, selectedFdi)).join("") + "</div>" +
      "</div>"
    );
  }

  function numRow(chart, list, selectedFdi) {
    return (
      '<div class="zs-row zs-row-nums">' +
      '<span class="zs-row-lab">#</span>' +
      '<div class="zs-arch">' + list.map((fdi) => numCell(chart, fdi, selectedFdi)).join("") + "</div>" +
      "</div>"
    );
  }

  /**
   * OK: Zeilen B/T oberhalb der Ziffern.
   * UK: Ziffern, darunter B/T.
   */
  function renderSchemaHtml(chart, selectedFdi) {
    const K = kat();
    if (!K) return "";
    const ok = K.FDI_OK;
    const uk = K.FDI_UK;
    return (
      '<div class="zs-schema" aria-label="Zahnschema Befund Therapie">' +
      '<div class="zs-block zs-ok">' +
      '<div class="zs-block-h">OK</div>' +
      layerRow(chart, ok, "befund", selectedFdi, "Befund") +
      layerRow(chart, ok, "therapie", selectedFdi, "Therapie") +
      numRow(chart, ok, selectedFdi) +
      "</div>" +
      '<div class="zs-block zs-uk">' +
      '<div class="zs-block-h">UK</div>' +
      numRow(chart, uk, selectedFdi) +
      layerRow(chart, uk, "befund", selectedFdi, "Befund") +
      layerRow(chart, uk, "therapie", selectedFdi, "Therapie") +
      "</div>" +
      '<p class="zs-hint">B: c=Karies · f=fehlend · T: fMOD=Füllung · LA</p>' +
      "</div>"
    );
  }

  function summaryLines(chart) {
    const lines = [];
    if (!chart) return lines;
    Object.keys(chart).forEach((fdi) => {
      const c = chart[fdi];
      const parts = [];
      if (c.befund) parts.push("B:" + c.befund);
      if (c.therapie) parts.push("T:" + c.therapie);
      if (parts.length) lines.push(fdi + " " + parts.join(" "));
    });
    return lines;
  }

  global.LenaVoiceChart = {
    LAYERS,
    extractFdi,
    extractCodes,
    extractSurfaces,
    layerOf,
    parseUtterance,
    parseSegments,
    emptyChart,
    mergeEvent,
    applySegments,
    badge,
    summaryLines,
    renderSchemaHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
