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

  /* ── Positions-Scan (Voll-Grammatik, Chef 21.07. nachts) ─────────────────
     Zahn- und Befund-Tokens werden MIT Textposition erhoben — auf dem
     ASCII-gefalteten, Zahn-normalisierten Text. Damit binden wir:
       a) "27 Fuellung"                (Befund NACH Zahn)
       b) "Fuellung, Krone an 27"      (Befunde VOR Zahn + Praeposition)
       c) "13,14,15 fehlen"            (Zahn-LISTE + ein Befund, distributiv)
       d) "es fehlen 23,24" / "Krone und Fuellung an 27" (vorangestellt) */

  let _speechGlob = null;
  function speechGlobals() {
    const K = kat();
    if (!K) return [];
    if (_speechGlob && _speechGlob.src === K.SPEECH) return _speechGlob.list;
    const list = K.SPEECH.map((r) => ({ code: r.code, re: new RegExp(r.re.source, "gi") }));
    _speechGlob = { src: K.SPEECH, list };
    return list;
  }

  let _wordFdiRe = null;
  function wordFdiRegex(K) {
    if (_wordFdiRe && _wordFdiRe.src === K.WORD_FDI) return _wordFdiRe.re;
    const words = Object.keys(K.WORD_FDI).sort((a, b) => b.length - a.length);
    const re = new RegExp("\\b(" + words.join("|") + ")\\b", "gi");
    _wordFdiRe = { src: K.WORD_FDI, re };
    return re;
  }

  function scanToothTokens(low, K) {
    const out = [];
    let m;
    const reDigit = /\b([1-4][1-8])\b/g;
    while ((m = reDigit.exec(low))) {
      const fdi = Number(m[1]);
      if (K.ALL_FDI.has(fdi)) out.push({ type: "tooth", fdi, at: m.index, end: m.index + m[0].length });
    }
    const wre = wordFdiRegex(K);
    wre.lastIndex = 0;
    while ((m = wre.exec(low))) {
      const fdi = K.WORD_FDI[m[1].toLowerCase()];
      if (fdi) out.push({ type: "tooth", fdi, at: m.index, end: m.index + m[0].length });
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  function scanCodeTokens(low) {
    const out = [];
    const seenAt = new Set();
    const push = (code, at, end) => {
      if (!code) return;
      const key = code + "@" + at;
      if (seenAt.has(key)) return;
      seenAt.add(key);
      out.push({ type: "code", code, at, end });
    };
    let m;
    speechGlobals().forEach((ent) => {
      ent.re.lastIndex = 0;
      while ((m = ent.re.exec(low))) {
        push(ent.code, m.index, m.index + m[0].length);
        if (m.index === ent.re.lastIndex) ent.re.lastIndex++;
      }
    });
    // Freistehende KZBV-Mehrbuchstaben-Codes (eindeutig, keine dt. Woerter).
    const tokenRe = /\b(abw|pkw|skw|stw|sbw|sew|sow|t2w|ix|kw|bw|pw|ww|sk|st|tw|ur|aw|sb|ew|rw)\b/gi;
    while ((m = tokenRe.exec(low))) push(m[1].toLowerCase(), m.index, m.index + m[0].length);
    // Mehrdeutige Kurz-Codes ("ab"=Praeposition, "so"/"se"=Alltagswoerter):
    // NUR direkt nach einer Zahnnummer werten ("16 ab", "35 so").
    const nearRe = /\b[1-4][1-8]\s*[.,]?\s+(ab|so|se)(?=[\s,;:.!?]|$)/gi;
    while ((m = nearRe.exec(low))) {
      const at = m.index + m[0].lastIndexOf(m[1]);
      push(m[1].toLowerCase(), at, at + m[1].length);
    }
    // Einzelbuchstaben f/k/x/b/c zwischen Trennern ("Befund eines x bei 46").
    const loneRe = /(?:^|[\s,;:])([fkxbc])(?=[\s,;:.!?]|$)/gi;
    while ((m = loneRe.exec(low))) {
      const at = m.index + m[0].indexOf(m[1]);
      const tok = m[1].toLowerCase();
      push(tok === "c" ? "Ka" : tok, at, at + 1);
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  function extractFdi(text) {
    const K = kat();
    if (!K) return [];
    const low = norm(normTeeth(text)).toLowerCase();
    const out = [];
    const seen = new Set();
    scanToothTokens(low, K).forEach((t) => {
      if (seen.has(t.fdi)) return;
      seen.add(t.fdi);
      out.push(t.fdi);
    });
    return out;
  }

  function extractCodes(text) {
    const K = kat();
    if (!K) return [];
    const low = norm(normTeeth(text)).toLowerCase();
    const out = [];
    const seen = new Set();
    scanCodeTokens(low).forEach((c) => {
      if (seen.has(c.code)) return;
      seen.add(c.code);
      out.push(c.code);
    });
    return out;
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

  // Fuellwoerter, die zwischen vorangestellten Befunden und der Zahnnummer
  // stehen duerfen ("Fuellung, Krone an 27", "fehlend sind 31 32").
  const BIND_FILLERS = new Set([
    "an", "auf", "am", "bei", "beim", "und", "auch", "noch", "sind", "ist",
    "es", "der", "die", "das", "den", "dem", "ein", "eine", "einen", "einem",
    "eines", "zahn", "zaehne", "zahne", "nummer", "regio", "jetzt", "dann",
    "mal", "bitte", "hier", "vorne", "hinten",
  ]);
  const BIND_PREPS = new Set(["an", "auf", "am", "bei", "beim"]);
  // Zahn-Listen-Trenner: "13,14,15", "13 14 15", "16 und 14".
  const RE_LIST_GAP = /^[\s,.;:!?]*(?:und|oder|sowie|plus)?[\s,.;:!?]*$/i;

  function parseUtterance(text, opts) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const K = kat();
    if (!K) return [];
    // Dental-STT-Garbles (Telesco/Zülung/…) — sicher fuer Box+Schema.
    const t = K.speechGarbleCorrect ? K.speechGarbleCorrect(raw) : raw;
    const eden = edentulousEvents(t);
    if (eden) return eden;

    const low = norm(normTeeth(t)).toLowerCase();
    const teethToks = scanToothTokens(low, K);
    const codeToks = scanCodeTokens(low);
    const surfaces = extractSurfaces(t);
    const allowBare = !!(opts && opts.allowBareNouns);

    if (!teethToks.length) {
      const codes = [];
      const seen = new Set();
      codeToks.forEach((c) => {
        if (seen.has(c.code)) return;
        seen.add(c.code);
        codes.push(c.code);
      });
      // Schema/Befund-forceLayer: nacktes "Teleskopkrone"/"Krone" auf lastFdi
      // (Live 22.07.: "Eins, sechs." + "Telesco."). Ausserhalb bleibt der
      // Bare-Noun-Schutz (Implantat ohne Zahl darf nicht an 14 haengen).
      const strong = allowBare ? codes : codes.filter((c) => !BARE_NOUN_CODES.has(c));
      if (!strong.length && !surfaces.length) return [];
      return [{ fdi: null, codes: strong, surfaces, text: t }];
    }

    // Vorwaerts-Bindung: Befund-Token gehoert zum NAECHSTEN Zahn, wenn bis
    // dahin nur Fuellwoerter stehen UND eine Praeposition dabei ist
    // ("Krone an 27"). Andere Befund-Tokens im Zwischenraum (z. B. bei
    // "Krone und Fuellung an 27") werden vorher maskiert.
    const masked = (() => {
      const arr = low.split("");
      codeToks.forEach((c) => {
        for (let i = c.at; i < c.end && i < arr.length; i++) arr[i] = " ";
      });
      return arr.join("");
    })();

    function bindsForward(tok) {
      const next = teethToks.find((tt) => tt.at >= tok.end);
      if (!next) return false;
      const gap = masked.slice(tok.end, next.at);
      const words = gap.match(/[a-z0-9äöüß]+/g) || [];
      if (!words.length) return false;
      let hasPrep = false;
      for (const w of words) {
        if (!BIND_FILLERS.has(w)) return false;
        if (BIND_PREPS.has(w)) hasPrep = true;
      }
      return hasPrep;
    }

    function isListGap(fromEnd, toStart) {
      if (codeToks.some((c) => c.at >= fromEnd && c.at < toStart)) return false;
      return RE_LIST_GAP.test(low.slice(fromEnd, toStart));
    }

    const stream = teethToks.concat(codeToks).sort((a, b) => a.at - b.at);
    const groups = [];
    let pending = [];
    let cur = null;
    stream.forEach((tok) => {
      if (tok.type === "tooth") {
        if (cur && !cur.codesAfter.length && isListGap(cur.lastEnd, tok.at)) {
          cur.teeth.push(tok.fdi);
          cur.lastEnd = tok.end;
        } else {
          cur = { teeth: [tok.fdi], codesBefore: pending, codesAfter: [], lastEnd: tok.end };
          pending = [];
          groups.push(cur);
        }
        return;
      }
      if (!cur || bindsForward(tok)) pending.push(tok.code);
      else cur.codesAfter.push(tok.code);
    });

    const events = [];
    groups.forEach((g) => {
      const codes = [];
      const seen = new Set();
      g.codesBefore.concat(g.codesAfter).forEach((c) => {
        if (seen.has(c)) return;
        seen.add(c);
        codes.push(c);
      });
      g.teeth.forEach((fdi) => {
        events.push({ fdi, codes: codes.slice(), surfaces: surfaces.slice(), text: t });
      });
    });
    return events;
  }

  function parseSegments(segments) {
    const events = [];
    (segments || []).forEach((s) => {
      const txt = String(s?.text || s?.textCorrected || "").trim();
      if (!txt) return;
      // Befund-Diktat (Trigger "Befund", Chef 21.07.): Segment traegt
      // forceLayer="befund" — alle Marks landen in der B-Zeile.
      const fl = s && s.forceLayer ? String(s.forceLayer) : "";
      const opts = fl === "befund" ? { allowBareNouns: true } : null;
      parseUtterance(txt, opts).forEach((ev) => {
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
      // Plural ohne Zahn ("Es fehlen.") darf NICHT rueckwaerts auf den
      // letzten Zahn fallen — sonst wurde live 16=f statt Teleskop
      // (Chef 22.07. 01:38). Singular "fehlt." bleibt Carry-over.
      if (!ev.fdi) {
        const raw = String(ev.text || "");
        if (/\bfehlen\b/i.test(raw) && !/\bfehlt\b/i.test(raw)) {
          return lastFdi;
        }
      }
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

  /** Parser-Code -> Legenden-/Mark-Schluessel (Ka->c, Fu->fu, sonst klein). */
  function markKeyOf(code) {
    if (code === "Ka") return "c";
    if (code === "Fu") return "fu";
    return String(code || "").toLowerCase();
  }

  /**
   * startLast (optional): Carry-over-Zahn aus einem frueheren Chunk —
   * die Loesch-Kommandos (Chef 22.07.) bauen das Chart in Abschnitten
   * ("16 neu" -> Zelle leeren, danach bindet die naechste Code-Ansage
   * wieder an 16). Ohne drittes Argument byte-identisches Verhalten.
   */
  function applySegments(chart, segments, startLast) {
    let last = startLast || null;
    let lastMark = null;
    parseSegments(segments).forEach((ev) => {
      last = mergeEvent(chart, ev, last);
      if (ev.codes && ev.codes.length) {
        lastMark = { fdi: ev.fdi || last, keys: ev.codes.map(markKeyOf) };
      }
    });
    // Fuer Legenden-Flash (zuletzt gesetztes Kuerzel). Kein FDI-Schluessel —
    // summaryLines/Render ueberspringen "_"-Eintraege.
    if (chart) {
      if (lastMark) chart._lastMark = lastMark;
      else delete chart._lastMark;
    }
    return last;
  }

  /** Loesch-Kommando "16 loeschen" (Chef 22.07.): Zelle komplett leeren. */
  function resetTooth(chart, fdi) {
    if (!chart || !chart[fdi]) return;
    chart[fdi] = emptyCell();
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

  function numCell(chart, fdi, selectedFdi, namedSet) {
    const c = chart && chart[fdi];
    const b = badge(c);
    const on = selectedFdi === fdi ? " is-sel" : "";
    const has = b ? " has-mark" : "";
    const miss = c && (c.befund === "f" || (c.codes || []).includes("f")) ? " is-miss" : "";
    const done = c && c.therapie && /Fu/i.test(c.therapie) ? " is-done" : "";
    // Genannt, aber (noch) ohne Kuerzel: sichtbar aktivieren — der Arzt testet
    // "12, 15, 34 ..." und will JEDEN erkannten Zahn im Schema sehen.
    const named = namedSet && namedSet.has(fdi) && !b ? " is-named" : "";
    return (
      '<div class="zs-cell zs-num' + on + has + miss + done + named + '" data-fdi="' + fdi + '">' +
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

  function numRow(chart, list, selectedFdi, namedSet) {
    return (
      '<div class="zs-row zs-row-nums">' +
      '<span class="zs-row-lab">#</span>' +
      '<div class="zs-arch">' + list.map((fdi) => numCell(chart, fdi, selectedFdi, namedSet)).join("") + "</div>" +
      "</div>"
    );
  }

  /** Im Chart verwendete Legenden-Schluessel (c, fu, f, k, ...). */
  function usedLegendKeys(chart) {
    const used = new Set();
    Object.keys(chart || {}).forEach((fdi) => {
      if (fdi.charAt(0) === "_") return;
      const c = chart[fdi];
      if (!c || !Array.isArray(c.codes)) return;
      c.codes.forEach((code) => used.add(markKeyOf(code)));
    });
    return used;
  }

  /** KZBV-Legende unter dem Schema. flashKeys: zuletzt gesetzte Kuerzel
      (bekommen die Puls-Optik des aktiven Zahns), used: dezente Markierung.
      Layout (Chef 22.07. 01:59): nur die haeufigsten Kuerzel + alle
      benutzten/aufleuchtenden sofort sichtbar, der Rest hinter einem
      dezenten "mehr"-Toggle. Der Auf/Zu-Zustand ueberlebt Re-Renders
      (Modul-Flag legendOpen, Klick via LenaVoiceChart.toggleLegendOpen). */
  let legendOpen = false;
  function toggleLegendOpen(btn) {
    legendOpen = !legendOpen;
    const box = btn && btn.closest ? btn.closest(".zs-legend") : null;
    if (box) box.classList.toggle("is-open", legendOpen);
    if (btn) {
      btn.textContent = legendOpen
        ? "weniger"
        : "+" + (btn.getAttribute("data-more") || "") + " mehr";
    }
    return legendOpen;
  }
  function legendHtml(chart, flashKeys) {
    const K = kat();
    if (!K || typeof K.legendEntries !== "function") return "";
    const used = usedLegendKeys(chart);
    const flash = new Set(flashKeys || []);
    const common = new Set(K.LEGEND_COMMON || []);
    const chip = (e, rest) => {
      const cls = "zs-leg" +
        (rest ? " zs-leg--rest" : "") +
        (used.has(e.code) ? " is-used" : "") +
        (flash.has(e.code) ? " is-flash" : "");
      return (
        '<span class="' + cls + '" data-code="' + esc(e.code) + '" title="' + esc(e.label) + '">' +
        '<b class="zs-leg-k">' + esc(e.code) + "</b>" +
        '<span class="zs-leg-t">' + esc(e.label) + "</span>" +
        "</span>"
      );
    };
    const prim = [];
    const rest = [];
    K.legendEntries().forEach((e) => {
      // Benutzte/aufleuchtende Kuerzel NIE hinter "mehr" verstecken.
      if (common.has(e.code) || used.has(e.code) || flash.has(e.code)) prim.push(chip(e, false));
      else rest.push(chip(e, true));
    });
    const more = rest.length
      ? '<button type="button" class="zs-leg-more" data-more="' + rest.length + '"' +
        ' onclick="try{LenaVoiceChart.toggleLegendOpen(this)}catch(e){}">' +
        (legendOpen ? "weniger" : "+" + rest.length + " mehr") + "</button>"
      : "";
    return (
      '<div class="zs-legend' + (legendOpen ? " is-open" : "") + '" aria-label="KZBV-Legende">' +
      prim.join("") + more + rest.join("") +
      "</div>"
    );
  }

  /**
   * OK: Zeilen B/T oberhalb der Ziffern.
   * UK: Ziffern, darunter B/T.
   * namedTeeth (optional Set): genannte Zaehne ohne Kuerzel — werden aktiviert.
   * opts (optional): { hideTherapy, legend, flashKeys } — Schema-Seite ist
   * REINE Befundaufnahme (Chef 21.07.): T-Zeile weg, KZBV-Legende drunter.
   */
  function renderSchemaHtml(chart, selectedFdi, namedTeeth, opts) {
    const K = kat();
    if (!K) return "";
    const o = opts || {};
    const ok = K.FDI_OK;
    const uk = K.FDI_UK;
    const therapyRow = (list) =>
      o.hideTherapy ? "" : layerRow(chart, list, "therapie", selectedFdi, "Therapie");
    const foot = o.legend
      ? legendHtml(chart, o.flashKeys)
      : '<p class="zs-hint">B: c=Karies · f=fehlend · T: fMOD=Füllung · LA</p>';
    return (
      '<div class="zs-schema" aria-label="Zahnschema Befund Therapie">' +
      '<div class="zs-block zs-ok">' +
      '<div class="zs-block-h">OK</div>' +
      layerRow(chart, ok, "befund", selectedFdi, "Befund") +
      therapyRow(ok) +
      numRow(chart, ok, selectedFdi, namedTeeth) +
      "</div>" +
      '<div class="zs-block zs-uk">' +
      '<div class="zs-block-h">UK</div>' +
      numRow(chart, uk, selectedFdi, namedTeeth) +
      layerRow(chart, uk, "befund", selectedFdi, "Befund") +
      therapyRow(uk) +
      "</div>" +
      foot +
      "</div>"
    );
  }

  /* ── Befund-Echo (Chef 21.07.: gesprochene Rueckmeldung je Befund) ───────
     Pure Funktionen, damit der Kettentest die Schleifen-Sicherheit prueft:
     Snapshot -> Diff -> Echo-Text. Der Echo-Text selbst darf beim Wieder-
     Einspeisen (Mikro nimmt Lautsprecher auf) KEINE NEUEN Marks erzeugen. */

  /** Kompakter Mark-Snapshot je Zahn (fuer Diff zwischen zwei Commits). */
  function chartEchoSnapshot(chart) {
    const snap = {};
    Object.keys(chart || {}).forEach((fdi) => {
      if (fdi.charAt(0) === "_") return;
      const c = chart[fdi];
      if (!c || !Array.isArray(c.codes) || !c.codes.length) return;
      snap[fdi] = c.codes.slice().sort().join(",");
    });
    return snap;
  }

  /** Diff zweier Snapshots + genannte Zaehne: was ist NEU dazugekommen? */
  function diffChartForEcho(prevSnap, chart, prevNamed, named) {
    const added = [];
    const snap = chartEchoSnapshot(chart);
    Object.keys(snap).forEach((fdi) => {
      const prevSet = new Set(
        prevSnap && prevSnap[fdi] ? String(prevSnap[fdi]).split(",") : [],
      );
      const neu = snap[fdi].split(",").filter((c) => c && !prevSet.has(c));
      if (neu.length) added.push({ fdi: Number(fdi), codes: neu });
    });
    const namedOnly = [];
    (named ? Array.from(named) : []).forEach((fdi) => {
      if (prevNamed && prevNamed.has(fdi)) return;
      if (snap[fdi]) return; // hat Marks -> steckt in added
      namedOnly.push(Number(fdi));
    });
    return { added, namedOnly };
  }

  /**
   * Zwei Echo-Diffs vereinen (Sammel-Puffer, Chef 22.07.: bei schneller
   * Diktat-Serie darf kein committeter Befund unquittiert verfallen).
   * codes je Zahn = Union; namedOnly ohne Zaehne, die inzwischen Marks haben.
   */
  function mergeEchoDiffs(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    const byFdi = new Map();
    (a.added || []).concat(b.added || []).forEach((e) => {
      if (!e || !e.fdi) return;
      const cur = byFdi.get(Number(e.fdi)) || [];
      (e.codes || []).forEach((c) => { if (c && !cur.includes(c)) cur.push(c); });
      byFdi.set(Number(e.fdi), cur);
    });
    const added = [...byFdi.entries()]
      .map(([fdi, codes]) => ({ fdi, codes }))
      .sort((x, y) => x.fdi - y.fdi);
    const namedSet = new Set(
      (a.namedOnly || []).concat(b.namedOnly || []).map(Number),
    );
    const namedOnly = [...namedSet].filter((f) => !byFdi.has(f)).sort((x, y) => x - y);
    return { added, namedOnly };
  }

  /**
   * Aufeinanderfolgende FDIs als Bereich sprechen: [13,14,15,16,17] ->
   * "eins drei bis eins sieben" (Chef 22.07.: gebuendelte Echos). Nie
   * Zahlwoerter wie "dreizehn" — die wuerden als FDI zurueckparsen.
   */
  function spokenTeethParts(K, teeth) {
    const list = [...new Set((teeth || []).map(Number))].sort((a, b) => a - b);
    const parts = [];
    let i = 0;
    while (i < list.length) {
      let j = i;
      while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
      if (j - i >= 2) parts.push(K.spokenFdi(list[i]) + " bis " + K.spokenFdi(list[j]));
      else for (let k = i; k <= j; k++) parts.push(K.spokenFdi(list[k]));
      i = j + 1;
    }
    return parts;
  }

  /**
   * Diff -> gesprochener Echo-Text. Zahnnummern als Einzelziffern
   * ("zwei sieben", Dental-Konvention), Kuerzel als Klartext.
   * "27 Fuellung" -> "Zwei sieben: Füllung."
   * Serien als Bereich: "Eins drei bis eins sieben: fehlt."
   * Viele verstreute Zaehne -> "Mehrere Zähne: fehlt." (NIE Zahlwoerter
   * wie "sechzehn Zaehne" — die wuerden beim Wieder-Einspeisen als FDI parsen).
   */
  function buildEchoText(diff) {
    const K = kat();
    if (!K || !diff) return "";
    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const parts = [];
    const groups = new Map(); // codes-Key -> { codes, teeth[] }
    (diff.added || []).forEach((a) => {
      const key = a.codes.join("+");
      if (!groups.has(key)) groups.set(key, { codes: a.codes, teeth: [] });
      groups.get(key).teeth.push(a.fdi);
    });
    groups.forEach((g) => {
      const label = g.codes.map((c) => K.speechLabelOf(c)).join(" und ");
      const spoken = spokenTeethParts(K, g.teeth);
      // Bis zu 2 Bereichs-/Einzel-Teile immer sprechen; sonst ab 7 Zaehnen
      // zusammenfassen (zahnloser Kiefer bleibt "Mehrere Zähne: fehlt.").
      const teethTxt = (spoken.length > 2 && g.teeth.length > 6)
        ? "mehrere Zähne"
        : spoken.join(", ");
      parts.push(cap(teethTxt) + ": " + label + ".");
    });
    const named = spokenTeethParts(K, diff.namedOnly || []).slice(0, 4);
    if (named.length) {
      parts.push(cap(named.join(", ")) + ".");
    }
    return parts.join(" ");
  }

  function summaryLines(chart) {
    const lines = [];
    if (!chart) return lines;
    Object.keys(chart).forEach((fdi) => {
      if (fdi.charAt(0) === "_") return; // Meta (_lastMark), keine Zelle
      const c = chart[fdi];
      if (!c) return;
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
    resetTooth,
    badge,
    summaryLines,
    renderSchemaHtml,
    markKeyOf,
    legendHtml,
    toggleLegendOpen,
    chartEchoSnapshot,
    diffChartForEcho,
    mergeEchoDiffs,
    buildEchoText,
  };
})(typeof window !== "undefined" ? window : globalThis);
