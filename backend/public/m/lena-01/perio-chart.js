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
    // etwas fester/deckender — vorher .85 war zu transparent (Chef 20.07.2026)
    wurzelfuellung: { fill: "rgba(70,130,210,.96)", stroke: "#2f5f9a" },
    i_wurzelfuellung: { fill: "rgba(196,74,58,.96)", stroke: "#8f3a2e" },
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
   * Lokale Apex-x einer Kontur (apikale 24 %). Mehrere Treffer = mehrwurzelig.
   */
  function pathApexTipXs(pts, upper) {
    if (!pts.length) return [];
    let y0 = Infinity, y1 = -Infinity;
    pts.forEach((p) => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const h = Math.max(1, y1 - y0);
    const nearApex = (y) => (upper ? (y - y0) / h : (y1 - y) / h) <= 0.24;
    const n = pts.length;
    const cand = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (!nearApex(p[1])) continue;
      const a = pts[(i - 4 + n) % n], b = pts[(i + 4) % n];
      const isTip = upper ? (p[1] <= a[1] && p[1] <= b[1]) : (p[1] >= a[1] && p[1] >= b[1]);
      if (isTip) cand.push(p);
    }
    cand.sort((p, q) => (upper ? p[1] - q[1] : q[1] - p[1]));
    const out = [];
    cand.forEach((p) => {
      if (!out.some((x) => Math.abs(x - p[0]) < 12)) out.push(p[0]);
    });
    return out.slice(0, 3);
  }

  /**
   * Schmales Kanalband entlang der Wurzelmitte(n) — NICHT die ganze Wurzel.
   * seedTips (optional): feste Apex-x-Seeds (OK-Molaren/14/24).
   * Mehrwurzel OK: Apex→CEJ; im gemeinsamen Stamm bleiben Kanäle lateral
   * getrennt (Teilung weiter koronal, Chef 20.07.2026).
   */
  function canalRibbons(pts, cejY, apexY, upper, seedTips) {
    if (!pts.length) return [];
    const dir = upper ? -1 : 1;
    // Kanal bis nahe an die CEJ (vorher +14 → Teilung wirkte zu apikal)
    const yCej = cejY + dir * 5;
    const yApex = apexY - dir * 4;
    if (upper ? yApex >= yCej : yApex <= yCej) return [];
    let tips = (seedTips && seedTips.length)
      ? seedTips.filter((x) => Number.isFinite(x)).slice(0, 3)
      : pathApexTipXs(pts, upper);
    if (!tips.length) tips = pathApexTipXs(pts, upper);
    const multi = upper && tips.length >= 2;
    const yStart = multi ? yApex : yCej;
    const yEnd = multi ? yCej : yApex;
    const spanLen = Math.abs(yEnd - yStart);
    const steps = Math.max(22, Math.round(spanLen / 1.4));
    const halfOf = (w, tApex) => {
      // etwas dicker als zuvor (palatinale 14/24 waren schon gut, +bisschen)
      const frac = 0.36 * (1 - 0.62 * tApex * tApex);
      return Math.max(1.45, Math.min(w * 0.44, w * frac * 0.5));
    };
    const tipSorted = tips.slice().sort((a, b) => a - b);
    const tracks = multi
      ? tips.map((tx) => ({ mid: tx, tipX: tx, left: [], right: [], mids: [] }))
      : [];
    for (let i = 0; i <= steps; i++) {
      const y = yStart + (yEnd - yStart) * (i / steps);
      // tApex = 0 an der CEJ, 1 am Apex
      const tApex = Math.min(1, Math.abs(y - yCej) / Math.max(1, spanLen));
      const spans = silSpansAtY(pts, y).filter((e) => (e.x1 - e.x0) >= 4 && (e.x1 - e.x0) < 90);
      if (!spans.length) continue;
      if (!tracks.length) {
        spans.forEach((e) => {
          const w = e.x1 - e.x0;
          const half = halfOf(w, tApex);
          const mid = (e.x0 + e.x1) / 2;
          tracks.push({
            mid, tipX: mid,
            left: [[mid - half, y]],
            right: [[mid + half, y]],
            mids: [[mid, y]],
          });
        });
        continue;
      }
      const used = new Set();
      const sharedTrunk = multi && spans.length === 1 && tracks.length >= 2;
      tracks.forEach((tr) => {
        let best = -1, bestD = 1e9;
        spans.forEach((e, si) => {
          const spanMid = (e.x0 + e.x1) / 2;
          const inside = tr.mid >= e.x0 - 2 && tr.mid <= e.x1 + 2;
          if (!multi && used.has(si)) return;
          // an Tip-x anbinden (bukkal = mesial bei 14/24)
          const dTip = Math.abs(spanMid - tr.tipX);
          const d = inside ? dTip * 0.15 : Math.min(Math.abs(spanMid - tr.mid), dTip);
          if (d < bestD) { bestD = d; best = si; }
        });
        if (best < 0 || bestD > (multi ? 48 : 28)) return;
        used.add(best);
        const e = spans[best];
        const w = e.x1 - e.x0;
        const spanMid = (e.x0 + e.x1) / 2;
        // Einzelwurzel → Mitte; Stamm → Tip-Lage halten
        const snap = multi ? (w < 22 ? 0.55 : (w < 40 ? 0.18 : 0.06)) : 1;
        let mid = tr.mid * (1 - snap) + spanMid * snap;
        // Gemeinsamer Stamm: Kanäle koronal stark lateral halten →
        // Teilungsstelle der WF wandert nach koronal (nicht erst am Apex)
        if (sharedTrunk) {
          const rank = Math.max(0, tipSorted.indexOf(tr.tipX));
          const n = Math.max(1, tipSorted.length - 1);
          const targetX = e.x0 + (e.x1 - e.x0) * (0.20 + 0.60 * (rank / n));
          const sep = 0.72 * (1 - tApex * 0.85);
          mid = mid * (1 - sep) + targetX * sep;
        }
        mid = Math.max(e.x0 + 1.8, Math.min(e.x1 - 1.8, mid));
        const widthForCanal = multi ? Math.min(w, 28) : w;
        let half = halfOf(widthForCanal, tApex);
        if (multi) half = Math.min(half, 4.8);
        half = Math.min(half, mid - e.x0 - 0.35, e.x1 - mid - 0.35);
        half = Math.max(1.25, half);
        tr.mid = mid;
        tr.left.push([mid - half, y]);
        tr.right.push([mid + half, y]);
        tr.mids.push([mid, y]);
      });
      if (!multi) {
        spans.forEach((e, si) => {
          if (used.has(si)) return;
          const w = e.x1 - e.x0;
          const half = halfOf(w, tApex);
          const mid = (e.x0 + e.x1) / 2;
          tracks.push({
            mid, tipX: mid,
            left: [[mid - half, y]],
            right: [[mid + half, y]],
            mids: [[mid, y]],
          });
        });
      }
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
   * - Wurzelfuellung: BLAU als schmales Kanalband entlang der Wurzelmitte
   *   (Silhouette + Extra-Wurzeln); OK-Molaren/14/24 apex-geseedet.
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
    const dirApex = c.upper ? -1 : 1;
    // insuffiziente WF endet bei ~58 % der Wurzellaenge (nicht bis zum Apex)
    const fillEndY = hasIWF ? cej + (apexY - cej) * 0.58 : apexY;
    const style = ROOT_PAINT[hasIWF ? "i_wurzelfuellung" : "wurzelfuellung"];

    const g = mk("g", { class: "bef-rootcanal" });
    const silWrap = mk("g", { "clip-path": "url(#st-sil-" + c.fdi + ")" });
    g.appendChild(silWrap);
    const rootWrap = mk("g", { "clip-path": "url(#st-rt-" + c.fdi + ")" });
    silWrap.appendChild(rootWrap);

    const paths = [sil];
    if (Array.isArray(extraRoots)) {
      extraRoots.forEach((d) => { if (d && d !== sil) paths.push(d); });
    }
    const allTips = rootApexPoints(c, sil, extraRoots);
    const toothN = (+c.fdi) % 10;
    const mesialRight = mesialIsRight(c.fdi);
    const collectRibs = (apexForFill) => {
      const out = [];
      const seen = new Set();
      paths.forEach((dPath, pi) => {
        const pts = samplePathPts(dPath, 220);
        if (!pts.length) return;
        const pb = pathBounds(dPath) || sb;
        const pathMid = (pb.x0 + pb.x1) / 2;
        const pathCej = cejYAt(seg, pathMid);
        const rootApex = apexForFill != null
          ? apexForFill
          : (c.upper ? pb.y0 : pb.y1);
        // Tip-Seeds: welche Apex-Punkte gehoeren zu diesem Pfad?
        let seedXs = allTips
          .filter((t) => t.x >= pb.x0 - 10 && t.x <= pb.x1 + 10)
          .map((t) => t.x);
        if (c.upper && allTips.length) {
          const sorted = allTips.slice().sort((a, b) => a.x - b.x);
          // 14/24: palatinale Wurzel = EXTRA (schon gut); bukkale = mesialere
          // auf der Hauptsilhouette — explizit mesialen Tip auf SIL seedern
          if ((toothN === 4) && pi === 0) {
            const mes = mesialRight ? sorted[sorted.length - 1] : sorted[0];
            seedXs = mes ? [mes.x] : seedXs.slice(0, 1);
          } else if ((toothN === 4) && pi > 0) {
            // Extra-Pfad = palatinal = distalere Spitze
            const pal = mesialRight ? sorted[0] : sorted[sorted.length - 1];
            seedXs = pal ? [pal.x] : seedXs.slice(0, 1);
          } else if (toothN >= 6 && pi === 0) {
            // Molar-SIL: alle Tips im SIL-Band (MB/DB); Palatinal kommt als EXTRA
            seedXs = allTips
              .filter((t) => t.x >= pb.x0 - 6 && t.x <= pb.x1 + 6)
              .map((t) => t.x);
            if (seedXs.length < 2) seedXs = pathApexTipXs(pts, c.upper);
          }
        }
        if (!seedXs.length) seedXs = pathApexTipXs(pts, c.upper);
        canalRibbons(pts, pathCej, rootApex, c.upper, seedXs).forEach((rib) => {
          if (!rib.mids.length) return;
          const key = Math.round(rib.mids[0][0] / 6) + ":" + Math.round(rib.mids[0][1] / 8);
          if (seen.has(key)) return;
          seen.add(key);
          out.push(rib);
        });
      });
      return out;
    };

    const fillRibs = (hasWF || hasIWF || hasPost)
      ? collectRibs(hasIWF ? fillEndY : null)
      : [];
    if (hasWF || hasIWF) {
      fillRibs.forEach((rib) => {
        rootWrap.appendChild(mk("path", {
          d: rib.d, fill: style.fill, stroke: style.stroke,
          "stroke-width": "1.15", "stroke-linejoin": "round", class: "bef-root-fill",
        }));
      });
    }

    if (hasPost) {
      // Stift mittig im Kanal, bis in die Krone (Chef 19.07.2026).
      let bx = midX, by = cej + (apexY - cej) * 0.66;
      const ribs = fillRibs.length ? fillRibs : collectRibs(null);
      if (ribs.length) {
        let best = null, bestD = 1e9;
        ribs.forEach((rib) => {
          // mids[0] liegt je nach Laufrichtung an CEJ oder Apex — Mitte nehmen
          const idx = Math.floor(rib.mids.length * 0.5);
          const m = rib.mids[idx];
          const d0 = Math.abs(m[0] - midX);
          if (d0 < bestD) { bestD = d0; best = m; }
        });
        if (best) { bx = best[0]; by = best[1]; }
      }
      const topY = cej - dirApex * 24;
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
