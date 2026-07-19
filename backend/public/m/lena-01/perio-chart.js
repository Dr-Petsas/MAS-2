/**
 * Lena 01 · Chart-Overlays: Flaechen (MODVL), Wurzelfuellung, Implantat (struktur01),
 * Brueckenglied, generische Badge-Grafiken.
 */
(function (global) {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";

  const SURFACE_KEYS = ["okklusal", "mesial", "distal", "vestibulaer", "lingual_palatinal"];
  const SURFACE_PAINT = {
    fuellung: { fill: "rgba(147,197,253,.78)", stroke: "#3b6fa8" },
    // insuffiziente Fuellung = Fuellung mit ROTEN Raendern (Chef 19.07.2026)
    insuffizient: { fill: "rgba(147,197,253,.66)", stroke: "#dc2626", sw: 2.4 },
    // Kariesflaechen sind ROT (Chef 19.07.2026)
    karies: { fill: "rgba(220,38,38,.68)", stroke: "#7f1d1d" },
    goldinlay: { fill: "rgba(232,192,64,.82)", stroke: "#b89020" },
    keramikinlay: { fill: "rgba(232,216,200,.82)", stroke: "#8b5e34" },
    versiegelung: { fill: "rgba(255,255,255,.88)", stroke: "#94a3b8" },
  };
  const ROOT_PAINT = {
    wurzelfuellung: { fill: "rgba(91,143,212,.85)", stroke: "#3b6fa8" },
    i_wurzelfuellung: { fill: "rgba(196,74,58,.85)", stroke: "#a04838" },
    wurzelstift: { fill: "#b8c0c8", stroke: "#6a7078" },
  };

  function emptySurfaces() {
    const o = {};
    SURFACE_KEYS.forEach((k) => { o[k] = []; });
    return o;
  }

  function ensureChart(s) {
    if (!s.surfaces) s.surfaces = emptySurfaces();
    SURFACE_KEYS.forEach((k) => {
      if (!Array.isArray(s.surfaces[k])) s.surfaces[k] = [];
    });
    if (!Array.isArray(s.rootMarkers)) s.rootMarkers = [];
    return s;
  }

  function isSurfacePaint(id) { return !!SURFACE_PAINT[id]; }
  function isRootPaint(id) { return !!ROOT_PAINT[id]; }

  function mesialIsRight(fdi) {
    // Frontalansicht: Q1 (OK rechts) und Q4 (UK rechts) liegen im Bild links,
    // ihre Mesialflaeche zeigt zur Mittellinie = nach rechts
    const q = Math.floor((+fdi) / 10);
    return q === 1 || q === 4;
  }

  function usesIncisal(fdi) {
    const t = String(fdi);
    return ["13", "12", "11", "21", "22", "23", "33", "32", "31", "41", "42", "43"].includes(t);
  }

  /**
   * Kronen-Rechteck aus Silhouette + CEJ (fuer Flaecheneinteilung).
   * OK: Apex bei kleinem y, Krone von CEJ Richtung Inzisal/Okklusal (groesseres y).
   * UK: Apex bei grossem y, Krone von CEJ Richtung Okklusal (kleineres y).
   */
  function crownBox(c, silBounds, cejMidY, split) {
    const sb = silBounds || { x0: c.x0, x1: c.x1, y0: c.upper ? 40 : split, y1: c.upper ? split : split + 120 };
    const padX = Math.max(2, (Math.min(c.x1, sb.x1) - Math.max(c.x0, sb.x0)) * 0.06);
    const x0 = Math.max(c.x0, sb.x0) + padX;
    const x1 = Math.min(c.x1, sb.x1) - padX;
    let y0, y1;
    if (c.upper) {
      const cej = cejMidY != null ? cejMidY : split * 0.78;
      const tip = sb.y1; // inzisal/okklusal Richtung SPLIT
      y0 = cej + 1;
      y1 = Math.min(tip - 2, y0 + Math.max(28, (tip - cej) * 0.88));
    } else {
      const cej = cejMidY != null ? cejMidY : split * 1.22;
      const tip = sb.y0; // okklusal Richtung SPLIT
      y1 = cej - 1;
      y0 = Math.max(tip + 2, y1 - Math.max(28, (cej - tip) * 0.88));
    }
    if (y1 <= y0) { y0 = Math.min(y0, y1 - 20); y1 = y0 + 20; }
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  /**
   * Anatomisch angepasste Flaechenregionen (Chef 19.07.2026):
   * Regionen werden grosszuegig UEBER die Kronenkontur hinaus definiert und
   * per Silhouetten-/Kronenband-Clip exakt auf die Aussenlinien des Zahns
   * beschnitten — keine geometrischen Vielecke mehr. Nur die "Rueckseite"
   * (palatinal/lingual), die in der Ansicht unsichtbar ist, steht als
   * schematisches Oval UEBER dem Zahn im Bissspalt (clip: false).
   */
  function surfaceRegions(c, box) {
    const dir = c.upper ? 1 : -1;            // Richtung Okklusal/Bissspalt
    const tipY = c.upper ? box.y1 : box.y0;
    const O = 12;                            // Ueberstand, Clip schneidet zu
    const yLo = Math.min(box.y0, box.y1) - O;
    const yHi = Math.max(box.y0, box.y1) + O;
    const mRight = mesialIsRight(c.fdi);
    const sideW = box.w * 0.30;
    const okklH = Math.max(14, box.h * 0.34);
    const rect = (x0, y0, x1, y1) =>
      `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y0.toFixed(1)} ` +
      `L ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x0.toFixed(1)} ${y1.toFixed(1)} Z`;
    const ell = (cx, cy, rx, ry) =>
      `M ${(cx - rx).toFixed(1)} ${cy.toFixed(1)} ` +
      `A ${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(cx + rx).toFixed(1)} ${cy.toFixed(1)} ` +
      `A ${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(cx - rx).toFixed(1)} ${cy.toFixed(1)} Z`;

    const okkl = c.upper
      ? rect(box.x0 - O, tipY - okklH, box.x1 + O, tipY + O)
      : rect(box.x0 - O, tipY - O, box.x1 + O, tipY + okklH);
    const leftD = rect(box.x0 - O, yLo, box.x0 + sideW, yHi);
    const rightD = rect(box.x1 - sideW, yLo, box.x1 + O, yHi);
    const bCy = c.upper ? box.y0 + box.h * 0.46 : box.y1 - box.h * 0.46;
    // Bukkal-Oval kompakt halten: bei schmalen Praemolaren nicht hochkant
    const bRx = Math.max(5, box.w * 0.30);
    const bRy = Math.min(Math.max(6, box.h * 0.26), bRx * 1.4);
    const bukk = ell(box.cx, bCy, bRx, bRy);
    const backCy = tipY + dir * 16;
    const backRx = Math.max(9, Math.min(16, box.w * 0.30));
    const back = ell(box.cx, backCy, backRx, 6.5);
    // Klickflaeche des Rueckseiten-Ovals grosszuegiger als die Optik —
    // das Oval ist auf der Gesamtbuehne nur wenige Pixel gross
    const backHit = ell(box.cx, backCy, backRx + 7, 13);

    return [
      {
        key: "okklusal", label: usesIncisal(c.fdi) ? "I" : "O", d: okkl, clip: true,
        lx: box.cx, ly: tipY - dir * okklH * 0.42,
      },
      {
        key: mRight ? "distal" : "mesial", label: mRight ? "D" : "M", d: leftD, clip: true,
        lx: box.x0 + sideW * 0.42, ly: box.cy,
      },
      {
        key: mRight ? "mesial" : "distal", label: mRight ? "M" : "D", d: rightD, clip: true,
        lx: box.x1 - sideW * 0.42, ly: box.cy,
      },
      { key: "vestibulaer", label: "B", d: bukk, clip: true, lx: box.cx, ly: bCy },
      {
        key: "lingual_palatinal", label: c.upper ? "P" : "L", d: back, clip: false,
        lx: box.cx, ly: backCy, schematic: true, hitD: backHit,
      },
    ];
  }

  function polyD(pts) {
    return "M " + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ") + " Z";
  }

  function mk(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }

  function toggleSurfaceMarker(s, surfaceKey, markerId, mode) {
    ensureChart(s);
    const arr = s.surfaces[surfaceKey];
    if (!arr) return;
    const has = arr.includes(markerId);
    if (mode === "remove" || (mode === "toggle" && has)) {
      s.surfaces[surfaceKey] = arr.filter((x) => x !== markerId);
      return;
    }
    // Restaurationen / Karies gegenseitig ersetzen auf derselben Flaeche
    const rivals = Object.keys(SURFACE_PAINT);
    s.surfaces[surfaceKey] = arr.filter((x) => !rivals.includes(x));
    s.surfaces[surfaceKey].push(markerId);
  }

  function toggleRootMarker(s, markerId, mode) {
    ensureChart(s);
    const has = s.rootMarkers.includes(markerId);
    const isWF = markerId === "wurzelfuellung" || markerId === "i_wurzelfuellung";
    if (mode === "remove" || (mode === "toggle" && has)) {
      s.rootMarkers = s.rootMarkers.filter((x) => x !== markerId);
      // WF weg -> Wurzelstift verliert seine Voraussetzung
      if (isWF && !s.rootMarkers.includes("wurzelfuellung")
          && !s.rootMarkers.includes("i_wurzelfuellung")) {
        s.rootMarkers = s.rootMarkers.filter((x) => x !== "wurzelstift");
      }
      return;
    }
    // WF-Varianten ersetzen einander; der Stift ist additiv dazu
    if (isWF) {
      s.rootMarkers = s.rootMarkers.filter(
        (x) => x !== "wurzelfuellung" && x !== "i_wurzelfuellung");
    }
    // Wurzelstift setzt eine Wurzelfuellung voraus (Chef 19.07.2026)
    if (markerId === "wurzelstift"
        && !s.rootMarkers.includes("wurzelfuellung")
        && !s.rootMarkers.includes("i_wurzelfuellung")) {
      s.rootMarkers.push("wurzelfuellung");
    }
    if (!s.rootMarkers.includes(markerId)) s.rootMarkers.push(markerId);
  }

  function hasSurfaceMarker(s, markerId) {
    if (!s || !s.surfaces) return false;
    return SURFACE_KEYS.some((k) => (s.surfaces[k] || []).includes(markerId));
  }

  function hasRootMarker(s, markerId) {
    return !!(s && s.rootMarkers && s.rootMarkers.includes(markerId));
  }

  /**
   * Flaechen zeichnen. Die Gruppe clippt sich selbst: die vier anatomischen
   * Regionen auf Silhouette + Kronenband (Farbe endet exakt an der
   * Zahnaussenlinie), das schematische Rueckseiten-Oval bleibt ungeclippt.
   * Buchstaben-Labels liegen ungeclippt obenauf.
   */
  function drawSurfaces(c, s, box, showGuides) {
    ensureChart(s);
    const g = mk("g", { class: "bef-surfaces", "data-fdi": String(c.fdi) });
    const clipWrap = mk("g", { "clip-path": "url(#st-sil-" + c.fdi + ")" });
    const clipIn = mk("g", { "clip-path": "url(#st-cr-" + c.fdi + ")" });
    clipWrap.appendChild(clipIn);
    g.appendChild(clipWrap);
    const labels = mk("g", { class: "bef-surf-labels" });
    let any = false;
    surfaceRegions(c, box).forEach((seg) => {
      const markers = s.surfaces[seg.key] || [];
      const paintIds = markers.filter((id) => SURFACE_PAINT[id]);
      const primary = paintIds.includes("karies") ? "karies" : paintIds[0];
      const style = primary ? SURFACE_PAINT[primary] : null;
      if (!style && !showGuides) return;
      any = true;
      const p = mk("path", {
        d: seg.d,
        class: "bef-surface" + (style ? " filled" : ""),
        fill: style ? style.fill : "rgba(255,255,255,.05)",
        stroke: style ? style.stroke : "rgba(220,200,160,.4)",
        "stroke-width": style ? String(style.sw || 1.4) : "0.9",
      });
      if (seg.schematic && !style) p.setAttribute("stroke-dasharray", "3 2");
      (seg.clip ? clipIn : g).appendChild(p);
      const t = mk("text", {
        x: seg.lx.toFixed(1), y: (seg.ly + 3).toFixed(1),
        "text-anchor": "middle", class: "bef-surface-lab",
      });
      t.textContent = seg.label;
      labels.appendChild(t);
    });
    g.appendChild(labels);
    return any ? g : null;
  }

  /** Pfad dicht abtasten (Browser-SVG-Geometrie). */
  function samplePathPts(d, n) {
    if (!d || typeof document === "undefined") return [];
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", d);
    let len = 0;
    try { len = p.getTotalLength(); } catch (e) { return []; }
    if (!(len > 0)) return [];
    const pts = [];
    const steps = Math.max(40, n || 160);
    for (let i = 0; i <= steps; i++) {
      const pt = p.getPointAtLength((len * i) / steps);
      pts.push([pt.x, pt.y]);
    }
    return pts;
  }

  /** Alle x-Schnitte der Silhouette bei y, sortiert. */
  function silXsAtY(pts, y) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const y0 = a[1], y1 = b[1];
      if ((y0 < y && y1 < y) || (y0 > y && y1 > y)) continue;
      if (Math.abs(y1 - y0) < 1e-6) { xs.push(a[0], b[0]); continue; }
      const t = (y - y0) / (y1 - y0);
      if (t < -0.02 || t > 1.02) continue;
      xs.push(a[0] + t * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    // nahe Duplikate zusammenfassen
    const out = [];
    xs.forEach((x) => {
      if (!out.length || Math.abs(out[out.length - 1] - x) > 1.2) out.push(x);
    });
    return out;
  }

  /** Paare (x0,x1) je Wurzelquerschnitt — Mehrwurzel = mehrere Spans. */
  function silSpansAtY(pts, y) {
    const xs = silXsAtY(pts, y);
    if (xs.length < 2) return [];
    const spans = [];
    if (xs.length === 2) {
      spans.push({ x0: xs[0], x1: xs[1] });
      return spans;
    }
    // gerade Anzahl: Paare; ungerade: aeusserste + innere Paare
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (w >= 3) spans.push({ x0: xs[i], x1: xs[i + 1] });
    }
    if (!spans.length) spans.push({ x0: xs[0], x1: xs[xs.length - 1] });
    return spans;
  }

  /**
   * Baender entlang der Wurzelkontur(en).
   * Default (Kanal): schmales Band, Start erst unterhalb CEJ (kein
   * Furkations-T in der Krone). Mit opts.full: VOLLE Wurzelbreite je Wurzel
   * (fuer die anatomische Wurzelfuellung) — die Furkations-Bucht zwischen
   * den Wurzeln bleibt frei, weil je y nur die echten Spans gefuellt werden.
   * Spans werden ueber y per naechstem Mid verfolgt, damit das Band der
   * Wurzel folgt.
   */
  function canalRibbons(pts, cejY, apexY, upper, opts) {
    if (!pts.length) return [];
    const full = !!(opts && opts.full);
    const dir = upper ? -1 : 1;
    // Kanal: ~2–3 mm apikal der CEJ starten; volle Fuellung: knapp
    // kronenseitig starten (das Wurzelband-Clip schneidet an der CEJ)
    const yStart = cejY + dir * (full ? -6 : 14);
    const yEnd = apexY - dir * (full ? 1 : 5);
    if (upper ? yEnd >= yStart : yEnd <= yStart) return [];
    const spanLen = Math.abs(yEnd - yStart);
    const steps = Math.max(20, Math.round(spanLen / 1.5));
    const minW = full ? 3 : 4;
    const maxW = full ? 160 : 90;
    const maxJump = full ? 34 : 28;
    const halfOf = (w, t) => {
      if (full) return Math.max(1.2, w * 0.5 - 0.6);
      const frac = 0.30 * (1 - 0.7 * t * t);
      return Math.max(1.1, Math.min(w * 0.36, w * frac * 0.5));
    };
    // tracks: { mid, left:[], right:[], mids:[] }
    const tracks = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = yStart + (yEnd - yStart) * t;
      const spans = silSpansAtY(pts, y).filter((e) => (e.x1 - e.x0) >= minW && (e.x1 - e.x0) < maxW);
      if (!spans.length) continue;
      const used = new Set();
      // bestehende Tracks fortsetzen
      tracks.forEach((tr) => {
        let best = -1, bestD = 1e9;
        spans.forEach((e, si) => {
          if (used.has(si)) return;
          const mid = (e.x0 + e.x1) / 2;
          const d = Math.abs(mid - tr.mid);
          if (d < bestD) { bestD = d; best = si; }
        });
        if (best < 0 || bestD > maxJump) return;
        used.add(best);
        const e = spans[best];
        const w = e.x1 - e.x0;
        const half = halfOf(w, t);
        const mid = (e.x0 + e.x1) / 2;
        tr.mid = mid;
        tr.left.push([mid - half, y]);
        tr.right.push([mid + half, y]);
        tr.mids.push([mid, y]);
      });
      // neue Spans = neue Wurzeln
      spans.forEach((e, si) => {
        if (used.has(si)) return;
        const w = e.x1 - e.x0;
        const half = halfOf(w, t);
        const mid = (e.x0 + e.x1) / 2;
        tracks.push({
          mid,
          left: [[mid - half, y]],
          right: [[mid + half, y]],
          mids: [[mid, y]],
        });
      });
    }
    return tracks.filter((b) => b.left.length >= 5).map((b) => {
      const sm = (arr) => {
        let cur = arr.slice();
        for (let pass = 0; pass < 2; pass++) {
          cur = cur.map((p, i) => {
            if (i === 0 || i === cur.length - 1) return p;
            const a = cur[i - 1], c = cur[i + 1];
            return [(a[0] + p[0] * 2 + c[0]) / 4, p[1]];
          });
        }
        return cur;
      };
      const left = sm(b.left), right = sm(b.right);
      return {
        d: polyD(left.concat(right.slice().reverse())),
        mids: b.mids,
      };
    });
  }

  function ensureClipEl(defs, id, d) {
    if (!defs || !d) return false;
    if (defs.querySelector("#" + CSS.escape(id))) return true;
    const cp = mk("clipPath", { id });
    cp.appendChild(mk("path", { d }));
    defs.appendChild(cp);
    return true;
  }

  /**
   * Wurzelspitzen eines Zahns (Chef 19.07.2026, fuer CAP-Punkte und
   * WSR-Schnittstriche): lokale Extrema der Silhouette Richtung Apex plus
   * die Spitzen der extra gezeichneten Wurzeln. Max. 3 Punkte {x, y}.
   */
  function rootApexPoints(c, sil, extraRoots) {
    if (!sil) return [];
    const pts = samplePathPts(sil, 240);
    if (!pts.length) return [];
    let y0 = Infinity, y1 = -Infinity;
    pts.forEach((p) => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const h = Math.max(1, y1 - y0);
    // nur die apikalen 22 % zaehlen als "Spitzenzone" (keine Hoecker/Kronen)
    const nearApex = (y) => (c.upper ? (y - y0) / h : (y1 - y) / h) <= 0.22;
    const n = pts.length;
    const cand = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (!nearApex(p[1])) continue;
      const a = pts[(i - 4 + n) % n], b = pts[(i + 4) % n];
      const isTip = c.upper ? (p[1] <= a[1] && p[1] <= b[1]) : (p[1] >= a[1] && p[1] >= b[1]);
      if (isTip) cand.push(p);
    }
    cand.sort((p, q) => (c.upper ? p[1] - q[1] : q[1] - p[1]));
    const out = [];
    cand.forEach((p) => {
      if (!out.some((o) => Math.abs(o.x - p[0]) < 15)) out.push({ x: p[0], y: p[1] });
    });
    (extraRoots || []).forEach((d) => {
      const ep = samplePathPts(d, 90);
      if (!ep.length) return;
      const tip = ep.reduce((m, p) => ((c.upper ? p[1] < m[1] : p[1] > m[1]) ? p : m));
      if (!out.some((o) => Math.abs(o.x - tip[0]) < 12)) out.push({ x: tip[0], y: tip[1] });
    });
    return out.slice(0, 3);
  }

  /**
   * Wurzel-Befunde (Chef 19.07.2026):
   * - Wurzelfuellung: BLAU und folgt anatomisch der Wurzelform — die ganze
   *   Wurzelregion (Silhouette + Extra-Wurzeln apikal der CEJ) wird gefuellt.
   * - insuffiziente WF: ROT und KUERZER, endet deutlich VOR dem Apex.
   * - Wurzelstift: sitzt mittig in der Wurzelfuellung und reicht bis in die
   *   Zahnkrone (Voraussetzung WF erzwingt toggleRootMarker).
   * Die Gruppe clippt sich selbst; der Stift liegt nur im Silhouetten-Clip,
   * damit er ueber die CEJ hinaus in die Krone ragen darf.
   */
  function drawRootCanal(c, s, seg, cejYAt, pathBounds, sil, extraRoots, defs) {
    ensureChart(s);
    if (!s.rootMarkers.length || !seg || !sil) return null;
    const hasWF = s.rootMarkers.includes("wurzelfuellung");
    const hasIWF = s.rootMarkers.includes("i_wurzelfuellung");
    const hasPost = s.rootMarkers.includes("wurzelstift");
    if (!hasWF && !hasIWF && !hasPost) return null;

    const sb = pathBounds(sil);
    if (!sb) return null;
    const midX = (sb.x0 + sb.x1) / 2;
    const cej = cejYAt(seg, midX);
    const apexY = c.upper ? sb.y0 : sb.y1;
    const dirApex = c.upper ? -1 : 1;          // von CEJ Richtung Apex
    // insuffiziente WF endet bei ~58 % der Wurzellaenge (nicht bis zum Apex)
    const fillEndY = hasIWF ? cej + (apexY - cej) * 0.58 : apexY + dirApex * 6;
    const style = ROOT_PAINT[hasIWF ? "i_wurzelfuellung" : "wurzelfuellung"];

    const g = mk("g", { class: "bef-rootcanal" });
    const silWrap = mk("g", { "clip-path": "url(#st-sil-" + c.fdi + ")" });
    g.appendChild(silWrap);
    const rootWrap = mk("g", { "clip-path": "url(#st-rt-" + c.fdi + ")" });
    silWrap.appendChild(rootWrap);

    // Fuellband je Wurzel in VOLLER Wurzelbreite (folgt der Kontur; die
    // Furkations-Bucht zwischen den Wurzeln bleibt frei), bei insuffizienter
    // WF vor fillEndY abgeschnitten (zusaetzlicher Band-Clip in defs)
    const drawFullRoots = (host, dPath) => {
      const pts = samplePathPts(dPath, 220);
      if (!pts.length) return false;
      const pb = pathBounds(dPath) || sb;
      const rootApex = c.upper ? pb.y0 : pb.y1;
      let drew = false;
      canalRibbons(pts, cej, rootApex, c.upper, { full: true }).forEach((rib) => {
        drew = true;
        host.appendChild(mk("path", {
          d: rib.d, fill: style.fill, stroke: style.stroke,
          "stroke-width": "0.9", "stroke-linejoin": "round", class: "bef-root-fill",
        }));
      });
      return drew;
    };

    if (hasWF || hasIWF) {
      let fillHost = rootWrap;
      if (hasIWF && defs) {
        // Kuerzungs-Clip: Band von CEJ-Seite bis fillEndY
        const id = "rf-cut-" + c.fdi;
        const y0 = Math.min(cej - dirApex * 20, fillEndY);
        const y1 = Math.max(cej - dirApex * 20, fillEndY);
        const dCut = `M ${(sb.x0 - 8).toFixed(1)} ${y0.toFixed(1)} ` +
          `L ${(sb.x1 + 8).toFixed(1)} ${y0.toFixed(1)} ` +
          `L ${(sb.x1 + 8).toFixed(1)} ${y1.toFixed(1)} ` +
          `L ${(sb.x0 - 8).toFixed(1)} ${y1.toFixed(1)} Z`;
        const old = defs.querySelector("#" + CSS.escape(id));
        if (old) old.remove();
        if (ensureClipEl(defs, id, dCut)) {
          fillHost = mk("g", { "clip-path": "url(#" + id + ")" });
          rootWrap.appendChild(fillHost);
        }
      }
      const drewMain = drawFullRoots(fillHost, sil);
      // Extra gezeichnete Wurzeln (z. B. palatinal) mitfuellen
      if (Array.isArray(extraRoots)) {
        extraRoots.forEach((d) => {
          if (d && d !== sil) drawFullRoots(fillHost, d);
        });
      }
      if (!drewMain) {
        // Fallback: Rechteck (Clip formt die Wurzel), falls Sampling scheitert
        fillHost.appendChild(mk("rect", {
          x: (sb.x0 - 4).toFixed(1),
          y: Math.min(cej - dirApex * 8, fillEndY).toFixed(1),
          width: (sb.x1 - sb.x0 + 8).toFixed(1),
          height: Math.max(1, Math.abs(fillEndY - (cej - dirApex * 8))).toFixed(1),
          fill: style.fill, stroke: "none", class: "bef-root-fill",
        }));
      }
    }

    if (hasPost) {
      // Stift mittig in der Wurzelfuellung, bis in die Krone (Chef 19.07.2026).
      // Zentralen Kanal ueber die Wurzelkontur suchen (naechster an der Mitte).
      let bx = midX, by = cej + (apexY - cej) * 0.66;
      const ribs = canalRibbons(samplePathPts(sil, 220), cej, apexY + dirApex * -5, c.upper);
      if (ribs.length) {
        let best = null, bestD = 1e9;
        ribs.forEach((rib) => {
          const m = rib.mids[Math.min(rib.mids.length - 1, Math.floor(rib.mids.length * 0.68))];
          const d0 = Math.abs(rib.mids[0][0] - midX);
          if (d0 < bestD) { bestD = d0; best = m; }
        });
        if (best) { bx = best[0]; by = best[1]; }
      }
      const topY = cej - dirApex * 24;         // reicht in die Krone hinein
      const topW = 3.6, botW = 1.9;
      const post = `M ${(bx - botW).toFixed(1)} ${by.toFixed(1)} ` +
        `L ${(midX - topW).toFixed(1)} ${topY.toFixed(1)} ` +
        `L ${(midX + topW).toFixed(1)} ${topY.toFixed(1)} ` +
        `L ${(bx + botW).toFixed(1)} ${by.toFixed(1)} Z`;
      silWrap.appendChild(mk("path", {
        d: post, fill: ROOT_PAINT.wurzelstift.fill,
        stroke: ROOT_PAINT.wurzelstift.stroke, "stroke-width": "1",
        "stroke-linejoin": "round", class: "bef-root-post",
      }));
      silWrap.appendChild(mk("line", {
        x1: ((bx + midX) / 2 - 0.6).toFixed(1), y1: (by - dirApex * 2).toFixed(1),
        x2: (midX - 0.6).toFixed(1), y2: (topY + dirApex * 2).toFixed(1),
        stroke: "#eef2f6", "stroke-width": "1.1", "stroke-linecap": "round", opacity: "0.85",
      }));
    }
    return g;
  }

  function drawPontic(c, box) {
    const g = mk("g", { class: "bef-pontic" });
    const pad = 3;
    g.appendChild(mk("rect", {
      x: (box.x0 - pad).toFixed(1), y: (box.y0 - pad).toFixed(1),
      width: (box.w + pad * 2).toFixed(1), height: (box.h + pad * 2).toFixed(1),
      rx: "6", fill: "rgba(252,231,243,.82)", stroke: "#ec4899", "stroke-width": "1.6",
      "stroke-dasharray": "4 2",
    }));
    const t = mk("text", {
      x: box.cx.toFixed(1), y: (box.cy + 5).toFixed(1),
      "text-anchor": "middle", class: "bef-pontic-lab",
    });
    t.textContent = "B";
    g.appendChild(t);
    return g;
  }

  /** struktur01: konischer Schraubenkoerper + 5 Gewinde-Ellipsen + Plattform */
  function drawImplantScrew(c, seg, cejYAt, opts) {
    opts = opts || {};
    const midX = (c.x0 + c.x1) / 2;
    const cej = seg ? cejYAt(seg, midX) : (c.upper ? 300 : 480);
    const dir = c.upper ? -1 : 1;
    // Masse wie struktur01 ImplantOverlay (konische Schraube + 5 Gewinde-Ellipsen).
    // Anker: Plattform (koronales Ende) buendig an der LIVE-Knochenkante
    // (Chef 19.07.2026: "tiefer sitzen, bis an die Knochenkante, nicht hoeher").
    // Fallback ohne crestY: alte CEJ-Naeherung.
    const centerY = opts.crestY != null ? opts.crestY + dir * 34 : cej + dir * 36;
    const yOffsets = [-34, -18, 0, 18, 34];
    const widths = c.upper ? [22, 29, 35, 38, 38] : [38, 38, 35, 29, 22];
    const heights = [5.2, 6.1, 7.2, 6.1, 5.2];
    const topY = centerY + yOffsets[0];
    const botY = centerY + yOffsets[yOffsets.length - 1];
    const left = yOffsets.map((o, i) => [midX - widths[i] / 2, centerY + o]);
    const right = yOffsets.map((o, i) => [midX + widths[i] / 2, centerY + o]).reverse();
    const bodyD = polyD(left.concat(right));
    const g = mk("g", { class: "bef-implant-screw" });
    const stroke = opts.fracture ? "#b91c1c" : "#64748b";
    const fill = opts.loosening ? "rgba(226,232,240,.55)" : "#e2e8f0";
    const highlight = "#f8fafc";
    g.appendChild(mk("path", { d: bodyD, fill, stroke, "stroke-width": "1.8", "stroke-linejoin": "round" }));
    g.appendChild(mk("path", {
      d: `M ${midX - 5} ${topY + 4} L ${midX - 2} ${botY - 4} L ${midX + 4.5} ${botY - 4} L ${midX + 1.5} ${topY + 4} Z`,
      fill: highlight, opacity: "0.95",
    }));
    g.appendChild(mk("line", {
      x1: midX.toFixed(1), y1: (topY + 2).toFixed(1), x2: midX.toFixed(1), y2: (botY - 2).toFixed(1),
      stroke, "stroke-width": "1.2", opacity: "0.42",
    }));
    yOffsets.forEach((o, i) => {
      g.appendChild(mk("ellipse", {
        cx: (midX + i * 0.35 - 0.7).toFixed(1), cy: (centerY + o).toFixed(1),
        rx: (widths[i] / 2).toFixed(1), ry: heights[i].toFixed(1),
        fill: "none", stroke, "stroke-width": i === 2 ? "2.6" : "2.1",
      }));
      g.appendChild(mk("ellipse", {
        cx: (midX + i * 0.35 - 0.7).toFixed(1), cy: (centerY + o - 0.7).toFixed(1),
        rx: Math.max(widths[i] / 2 - 1.6, 2).toFixed(1), ry: Math.max(heights[i] - 1.5, 1.2).toFixed(1),
        fill: "none", stroke: highlight, "stroke-width": "0.85", opacity: "0.9",
      }));
    });
    // Plattform-Kappe am KORONALEN Ende (OK unten, UK oben), buendig auf der
    // Knochenkante — ragt nicht mehr 5 px darueber hinaus
    const capY = c.upper ? botY : topY;
    g.appendChild(mk("ellipse", {
      cx: midX.toFixed(1), cy: capY.toFixed(1), rx: "8.5", ry: "3.4",
      fill: highlight, stroke, "stroke-width": "1.2",
    }));
    if (opts.loosening) {
      g.setAttribute("transform", `translate(0 ${dir * -8})`);
      const ghost = mk("path", {
        d: bodyD, fill: "none", stroke: "#94a3b8", "stroke-width": "1.85",
        "stroke-dasharray": "5 4", "stroke-linejoin": "round", opacity: "0.88",
      });
      const wrap = mk("g", { class: "bef-implant-loose" });
      wrap.appendChild(ghost);
      wrap.appendChild(g);
      return wrap;
    }
    if (opts.fracture) {
      const splitY = centerY;
      g.appendChild(mk("path", {
        d: `M ${midX - 21} ${splitY - 2} l 4.5 2.8 5 -1.8 5.5 3 5 -2 5.5 2.8 5 -2.2 4.5 2.5`,
        fill: "none", stroke: "#b91c1c", "stroke-width": "2.35",
        "stroke-linecap": "round", "stroke-linejoin": "round",
      }));
      g.appendChild(mk("path", {
        d: `M ${midX - 19} ${splitY + 1.2} L ${midX + 19} ${splitY - 0.8}`,
        fill: "none", stroke: "#7f1d1d", "stroke-width": "1.2", opacity: "0.55",
        "stroke-linecap": "round",
      }));
    }
    return g;
  }

  function buildSurfaceHits(c, box, onSurface) {
    const g = mk("g", { class: "surface-hits", "data-fdi": String(c.fdi) });
    const clipWrap = mk("g", { "clip-path": "url(#st-sil-" + c.fdi + ")" });
    const clipIn = mk("g", { "clip-path": "url(#st-cr-" + c.fdi + ")" });
    clipWrap.appendChild(clipIn);
    g.appendChild(clipWrap);
    surfaceRegions(c, box).forEach((seg) => {
      const p = mk("path", {
        d: seg.d,
        class: "surface-hit",
        fill: "rgba(111,224,212,.08)",
        stroke: "rgba(111,224,212,.55)",
        "stroke-width": "1",
      });
      if (seg.schematic) p.setAttribute("stroke-dasharray", "3 2");
      const wireEvents = (el) => {
        el.style.cursor = "crosshair";
        el.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          onSurface(c.fdi, seg.key, "toggle");
        });
        el.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          onSurface(c.fdi, seg.key, "remove");
        });
      };
      (seg.clip ? clipIn : g).appendChild(p);
      if (seg.hitD) {
        // sichtbares Oval nur Optik; die (groessere) unsichtbare Flaeche klickt
        p.setAttribute("pointer-events", "none");
        const hp = mk("path", { d: seg.hitD, fill: "transparent", stroke: "none" });
        wireEvents(hp);
        g.appendChild(hp);
      } else {
        wireEvents(p);
      }
      const t = mk("text", {
        x: seg.lx.toFixed(1), y: (seg.ly + 3).toFixed(1),
        "text-anchor": "middle", class: "bef-surface-lab hit-lab",
      });
      t.textContent = seg.label;
      g.appendChild(t);
    });
    return g;
  }

  global.PerioChart = {
    SURFACE_KEYS, SURFACE_PAINT, ROOT_PAINT,
    emptySurfaces, ensureChart,
    isSurfacePaint, isRootPaint,
    crownBox, surfaceRegions,
    toggleSurfaceMarker, toggleRootMarker,
    hasSurfaceMarker, hasRootMarker,
    drawSurfaces, drawRootCanal, drawPontic, drawImplantScrew,
    buildSurfaceHits, rootApexPoints,
  };
})(typeof window !== "undefined" ? window : globalThis);
