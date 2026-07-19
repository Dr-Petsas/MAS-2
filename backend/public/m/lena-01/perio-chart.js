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
    karies: { fill: "rgba(252,165,165,.78)", stroke: "#a04838" },
    goldinlay: { fill: "rgba(232,192,64,.82)", stroke: "#b89020" },
    keramikinlay: { fill: "rgba(232,216,200,.82)", stroke: "#8b5e34" },
    versiegelung: { fill: "rgba(255,255,255,.88)", stroke: "#94a3b8" },
  };
  const ROOT_PAINT = {
    wurzelfuellung: { fill: "#5b8fd4", stroke: "#3b6fa8" },
    i_wurzelfuellung: { fill: "#c45a4a", stroke: "#a04838" },
    wurzelstift: { fill: "#9aa3ad", stroke: "#6a7078" },
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
    const q = Math.floor((+fdi) / 10);
    return q === 1 || q === 3;
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

  function surfaceSegments(c, box) {
    const { x0, x1, y0, y1, cx, cy } = box;
    const ox = Math.max(3, box.w * 0.08);
    const oy = Math.max(3, box.h * 0.1);
    const ix = Math.max(8, box.w * 0.28);
    const iy = Math.max(8, box.h * 0.28);
    const ol = x0 + ox, or_ = x1 - ox, ot = y0 + oy, ob = y1 - oy;
    const il = x0 + ix, ir = x1 - ix, it = y0 + iy, ib = y1 - iy;
    const mRight = mesialIsRight(c.fdi);
    const topKey = c.upper ? "vestibulaer" : "lingual_palatinal";
    const topLab = c.upper ? "B" : "L";
    const botKey = c.upper ? "lingual_palatinal" : "vestibulaer";
    const botLab = c.upper ? "P" : "B";
    const leftKey = mRight ? "distal" : "mesial";
    const leftLab = mRight ? "D" : "M";
    const rightKey = mRight ? "mesial" : "distal";
    const rightLab = mRight ? "M" : "D";
    return [
      {
        key: topKey, label: topLab,
        points: [[ol, ot], [or_, ot], [ir, it], [il, it]],
        lx: cx, ly: (ot + it) / 2,
      },
      {
        key: "okklusal", label: usesIncisal(c.fdi) ? "I" : "O",
        points: [[il, it], [ir, it], [ir, ib], [il, ib]],
        lx: cx, ly: cy,
      },
      {
        key: leftKey, label: leftLab,
        points: [[ol, ot], [il, it], [il, ib], [ol, ob]],
        lx: (ol + il) / 2, ly: cy,
      },
      {
        key: rightKey, label: rightLab,
        points: [[or_, ot], [or_, ob], [ir, ib], [ir, it]],
        lx: (ir + or_) / 2, ly: cy,
      },
      {
        key: botKey, label: botLab,
        points: [[ol, ob], [il, ib], [ir, ib], [or_, ob]],
        lx: cx, ly: (ib + ob) / 2,
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
    if (mode === "remove" || (mode === "toggle" && has)) {
      s.rootMarkers = s.rootMarkers.filter((x) => x !== markerId);
      return;
    }
    const rivals = Object.keys(ROOT_PAINT);
    s.rootMarkers = s.rootMarkers.filter((x) => !rivals.includes(x) || x === markerId);
    if (!s.rootMarkers.includes(markerId)) s.rootMarkers.push(markerId);
  }

  function hasSurfaceMarker(s, markerId) {
    if (!s || !s.surfaces) return false;
    return SURFACE_KEYS.some((k) => (s.surfaces[k] || []).includes(markerId));
  }

  function hasRootMarker(s, markerId) {
    return !!(s && s.rootMarkers && s.rootMarkers.includes(markerId));
  }

  function drawSurfaces(c, s, box, showGuides) {
    const g = mk("g", { class: "bef-surfaces", "data-fdi": String(c.fdi) });
    ensureChart(s);
    surfaceSegments(c, box).forEach((seg) => {
      const markers = s.surfaces[seg.key] || [];
      const paintIds = markers.filter((id) => SURFACE_PAINT[id]);
      const primary = paintIds.includes("karies") ? "karies" : paintIds[0];
      const style = primary ? SURFACE_PAINT[primary] : null;
      const p = mk("path", {
        d: polyD(seg.points),
        class: "bef-surface" + (style ? " filled" : ""),
        fill: style ? style.fill : (showGuides ? "rgba(255,255,255,.04)" : "transparent"),
        stroke: style ? style.stroke : (showGuides ? "rgba(220,200,160,.35)" : "none"),
        "stroke-width": style ? "1.2" : "0.8",
      });
      g.appendChild(p);
      if (showGuides || style) {
        const t = mk("text", {
          x: seg.lx.toFixed(1), y: (seg.ly + 3).toFixed(1),
          "text-anchor": "middle", class: "bef-surface-lab",
        });
        t.textContent = seg.label;
        g.appendChild(t);
      }
    });
    return g;
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
   * Kanalbaender entlang der Wurzelkontur(en).
   * Start erst unterhalb CEJ (kein Furkations-T in der Krone); Spans werden
   * ueber y hinweg per naechstem Mid verfolgt, damit der Kanal der Wurzel folgt.
   */
  function canalRibbons(pts, cejY, apexY, upper) {
    if (!pts.length) return [];
    const dir = upper ? -1 : 1;
    // ~2–3 mm apikal der CEJ starten (Pulpakammer / Furkation ueberspringen)
    const yStart = cejY + dir * 14;
    const yEnd = apexY - dir * 5;
    if (upper ? yEnd >= yStart : yEnd <= yStart) return [];
    const spanLen = Math.abs(yEnd - yStart);
    const steps = Math.max(20, Math.round(spanLen / 1.5));
    // tracks: { mid, left:[], right:[], mids:[] }
    const tracks = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = yStart + (yEnd - yStart) * t;
      const spans = silSpansAtY(pts, y).filter((e) => (e.x1 - e.x0) >= 4 && (e.x1 - e.x0) < 90);
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
        if (best < 0 || bestD > 28) return;
        used.add(best);
        const e = spans[best];
        const w = e.x1 - e.x0;
        const frac = 0.30 * (1 - 0.7 * t * t);
        const half = Math.max(1.1, Math.min(w * 0.36, w * frac * 0.5));
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
        const frac = 0.30 * (1 - 0.7 * t * t);
        const half = Math.max(1.1, Math.min(w * 0.36, w * frac * 0.5));
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

  function drawRootCanal(c, s, seg, cejYAt, pathBounds, sil, extraRoots) {
    ensureChart(s);
    if (!s.rootMarkers.length || !seg) return null;
    const marker = s.rootMarkers.includes("i_wurzelfuellung")
      ? "i_wurzelfuellung"
      : (s.rootMarkers.includes("wurzelstift") ? "wurzelstift" : s.rootMarkers[0]);
    const style = ROOT_PAINT[marker];
    if (!style) return null;

    // Hauptkontur + ggf. extra gezeichnete Wurzeln (Palatinal etc.)
    const paths = [];
    if (sil) paths.push(sil);
    if (Array.isArray(extraRoots)) {
      extraRoots.forEach((d) => { if (d && d !== sil) paths.push(d); });
    }
    if (!paths.length) return null;

    const g = mk("g", { class: "bef-rootcanal" });
    let drew = false;
    const seen = new Set();
    paths.forEach((dPath, pi) => {
      const pts = samplePathPts(dPath, 220);
      if (!pts.length) return;
      const sb = pathBounds(dPath);
      const midX = sb ? (sb.x0 + sb.x1) / 2 : (c.x0 + c.x1) / 2;
      const cej = cejYAt(seg, midX);
      const apex = c.upper
        ? (sb ? sb.y0 + 5 : cej - 80)
        : (sb ? sb.y1 - 5 : cej + 80);
      // Extra-Wurzel-Pfade: nur eigener Span; SIL: alle Spans (Mehrwurzel)
      const ribs = canalRibbons(pts, cej, apex, c.upper);
      ribs.forEach((rib) => {
        // Dedup: SIL + EXTRA_ROOTS koennen dieselbe Wurzel doppelt liefern
        const key = Math.round(rib.mids[0][0] / 6) + ":" + Math.round(rib.mids[0][1] / 8);
        if (seen.has(key)) return;
        seen.add(key);
        drew = true;
        g.appendChild(mk("path", {
          d: rib.d, fill: style.fill, stroke: style.stroke,
          "stroke-width": "0.85", class: "bef-root-fill",
        }));
        if (marker === "wurzelstift" && rib.mids.length > 1) {
          const a = rib.mids[0], b = rib.mids[rib.mids.length - 1];
          g.appendChild(mk("line", {
            x1: a[0].toFixed(1), y1: a[1].toFixed(1),
            x2: b[0].toFixed(1), y2: b[1].toFixed(1),
            stroke: "#c5ccd4", "stroke-width": "2", "stroke-linecap": "round",
          }));
        }
      });
    });
    return drew ? g : null;
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
    surfaceSegments(c, box).forEach((seg) => {
      const p = mk("path", {
        d: polyD(seg.points),
        class: "surface-hit",
        fill: "rgba(111,224,212,.08)",
        stroke: "rgba(111,224,212,.55)",
        "stroke-width": "1",
      });
      p.style.cursor = "crosshair";
      p.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onSurface(c.fdi, seg.key, "toggle");
      });
      p.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onSurface(c.fdi, seg.key, "remove");
      });
      g.appendChild(p);
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
    crownBox, surfaceSegments,
    toggleSurfaceMarker, toggleRootMarker,
    hasSurfaceMarker, hasRootMarker,
    drawSurfaces, drawRootCanal, drawPontic, drawImplantScrew,
    buildSurfaceHits,
  };
})(typeof window !== "undefined" ? window : globalThis);
