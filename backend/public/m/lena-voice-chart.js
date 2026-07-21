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

  /** Diktat-Formate ("1,6", "vier sechs", "16x14x") vereinheitlichen. */
  function normTeeth(text) {
    const K = kat();
    if (K?.normalizeToothText) return K.normalizeToothText(text);
    return String(text || "");
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
    const raw = normTeeth(text);
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
    const low = normTeeth(text).toLowerCase();
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

  // Deutsche Woerter, die NUR aus Flaechenbuchstaben bestehen — nie als
  // Flaechenblock lesen ("im rechten" wurde live zu Flaechen i+m).
  const SURFACE_STOPWORDS = new Set(["im", "ob", "obi", "bio", "mild", "doll", "dom", "mob", "lob", "oma", "omi"]);

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
    const re = /\b([modiblvz]{2,6})\b/gi;
    let block;
    while ((block = re.exec(String(text || "")))) {
      const tok = block[1].toLowerCase();
      if (SURFACE_STOPWORDS.has(tok)) continue;
      tok.split("").forEach((ch) => {
        if (K.SURFACES[ch]) add(ch);
      });
      break; // wie bisher: nur der erste echte Block zaehlt
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

  // Blosse Nomen (Implantat/Krone/Bruecke/Teleskop) OHNE Zahnnummer nie per
  // Carry-over auf den zuletzt genannten Zahn uebertragen — "Entzuendung der
  // Implantate im rechten Unterkiefer" haengte live ein sk an Zahn 14.
  const BARE_NOUN_CODES = new Set(["sk", "k", "b", "t", "pkw"]);

  // Zahnloser Kiefer (Live 13:12: "Alle Zaehne fehlend."): markiert alle
  // Zaehne des Scopes mit f. Scope: Oberkiefer/Unterkiefer/alle.
  const RE_EDENTULOUS = /alle\s+z[aä]hne\s+(?:fehlen(?:d)?|weg|entfernt)|zahnlos|unbezahnt/i;

  function edentulousEvents(text) {
    const K = kat();
    if (!K || !RE_EDENTULOUS.test(text)) return null;
    const low = norm(text).toLowerCase();
    let list = K.FDI_OK.concat(K.FDI_UK);
    const ok = /oberkiefer|\bok\b/.test(low);
    const uk = /unterkiefer|\buk\b/.test(low);
    if (ok && !uk) list = K.FDI_OK.slice();
    else if (uk && !ok) list = K.FDI_UK.slice();
    return list.map((fdi) => ({ fdi, codes: ["f"], surfaces: [], text }));
  }

  function parseUtterance(text) {
    const t = String(text || "").trim();
    if (!t) return [];
    const eden = edentulousEvents(t);
    if (eden) return eden;
    const fdis = extractFdi(t);
    const codes = extractCodes(t);
    const surfaces = extractSurfaces(t);
    if (!fdis.length && !codes.length && !surfaces.length) return [];
    if (!fdis.length) {
      const strong = codes.filter((c) => !BARE_NOUN_CODES.has(c));
      if (!strong.length && !surfaces.length) return [];
      return [{ fdi: null, codes: strong, surfaces, text: t }];
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
