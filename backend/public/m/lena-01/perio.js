/**
 * Lena 01 · Parodontologie – aus DEINEN drei gebackenen Ebenen (PNG):
 *   Zaehne -> Knochen (opacity 0.75, UEBER den Zaehnen) -> Zahnfleisch.
 *
 * Abbau/Rezession = bogenfoermige Absenkung der koronalen Kante mit an den
 * Nachbarzaehnen FIXIERTEN Endpunkten. Die koronale Basiskante wird PRO X aus
 * der echten Grafik gemessen (edges[]) -> wirkt auch an Molaren. Aussenkante
 * bleibt fix (OK oben / UK unten). Umgesetzt per dynamischem clipPath je Kiefer.
 */
(function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const XLINK = "http://www.w3.org/1999/xlink";
  const STEP = 3, EPS = 2, BAND = 26;
  const OVERLAP = 6;             // Knochen-Overlap der alten Saumkanten-Naeherung (Fallback)
  const CEJ_BONE_GAP_MM = 1.8;   // gesunder Knochen endet ~1,5-2 mm apikal der Grenzlinie
  const GUM_H = 12;              // Bandhoehe der freien Gingiva (px, ~2 mm)
  const GUM_X = { up: [73, 1303], lo: [63, 1313] };  // Fallback: Knochen-Ausdehnung
  let BONE_EDGE = null;          // koronale Knochenkante je Spalte (bone-edge.json)

  let COLS = null, EDGES = null, SIL = null, MM = 6, CW = 1376, CH = 768, SPLIT = 384;
  let BASE_UP = null, BASE_LO = null;   // geglaettete Saum-Basislinie je Kiefer
  let BONE_UP = null, BONE_LO = null;   // Knochenkante = weiche Girlande (+Overlap)
  let PIX = null, PIXW = 0, PIXH = 0;   // gerastertes Original-teethSVG (Pixelwahrheit)
  const PIXS = 2;                       // Raster-Skalierung gegenueber Quellkoordinaten
  let SOURCE_CEJ_D = {};                // exakte Krone/Wurzel-Grenze je FDI (aus PIX)
  let SOURCE_CEJ_ARR = {};              // dieselbe Grenze als y-Werte je Quell-x (fuer Knochen)
  let EXTRA_ROOTS = {};                 // Zweit-/Palatinalwurzel-Pfade (14/25, 16/17/26/27)
  let svgEl = null;
  let APEXX = {};                       // Beschriftungs-x je FDI: Mitte der Wurzelspitzen
  const state = {};
  let selected = 46;
  let boneOpacity = 0.75;   // Knochen-Deckkraft, live per Regler einstellbar
  const st = (fdi) => state[fdi];
  const upperCols = () => COLS.cols.filter((c) => c.upper);
  const lowerCols = () => COLS.cols.filter((c) => !c.upper);

  const edgeAt = (arr, x) => arr[Math.max(0, Math.min(CW - 1, Math.round(x)))];

  function pathBounds(d) {
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const xs = [], ys = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      xs.push(nums[i]); ys.push(nums[i + 1]);
    }
    return xs.length
      ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
      : null;
  }

  // Beschriftungs-x: Mitte des apikalen Silhouetten-Bandes (= Wurzelspitzen),
  // nicht die Spaltenmitte -> Nummern stehen symmetrisch ueber/unter den Spitzen
  function apexCenterX(fdi, upper) {
    const d = SIL[fdi] || "";
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    if (!pts.length) return null;
    let y0 = Infinity, y1 = -Infinity;
    pts.forEach(([, y]) => { y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    const apexY = upper ? y0 : y1;
    const band = (y1 - y0) * 0.16;
    let mn = Infinity, mx = -Infinity;
    pts.forEach(([x, y]) => {
      if (Math.abs(y - apexY) <= band) { mn = Math.min(mn, x); mx = Math.max(mx, x); }
    });
    return Number.isFinite(mn) ? (mn + mx) / 2 : null;
  }

  const TEETH_SRC = "/m/lena-01/teeth-source.svg?v=1";

  // teethSVG einmal unsichtbar rastern: die Grenze wird aus den tatsaechlich
  // sichtbaren Farben gelesen (Malreihenfolge/Overlays damit automatisch korrekt).
  async function rasterizeTeethSource() {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = TEETH_SRC;
    });
    PIXW = CW * PIXS; PIXH = CH * PIXS;
    const canvas = document.createElement("canvas");
    canvas.width = PIXW; canvas.height = PIXH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, PIXW, PIXH);
    PIX = ctx.getImageData(0, 0, PIXW, PIXH).data;
    SOURCE_CEJ_D = {};
    SOURCE_CEJ_ARR = {};
  }

  // 1 = Kronenfarbe (#EBE7CA), 2 = eine der Wurzel-/Dentinfarben, 0 = sonstiges
  const ROOT_RGB = [
    [216, 203, 170], [188, 174, 149], [193, 184, 160], [189, 181, 167], [180, 164, 146],
  ];
  function classifyAt(x, y) {
    if (!PIX || x < 0 || y < 0 || x >= PIXW || y >= PIXH) return 0;
    const i = (y * PIXW + x) << 2;
    const r = PIX[i], g = PIX[i + 1], b = PIX[i + 2];
    const near = (p, t) => {
      const dr = r - p[0], dg = g - p[1], db = b - p[2];
      return dr * dr + dg * dg + db * db <= t * t;
    };
    if (near([235, 231, 202], 16)) return 1;
    for (const p of ROOT_RGB) if (near(p, 14)) return 2;
    return 0;
  }

  // Exakte gezeichnete Krone/Wurzel-Grenze eines Zahns: pro Rasterspalte der
  // erste sichtbare Kronenpixel von der Wurzelseite her, akzeptiert nur, wenn
  // wurzelseitig echte Wurzelfarbe folgt (schliesst Silhouetten-Aussenkanten aus).
  function cejFromRaster(c) {
    if (!PIX) return "";
    const sb = pathBounds(SIL[c.fdi] || "");
    if (!sb) return "";
    const yTop = Math.max(0, Math.floor((sb.y0 - 2) * PIXS));
    const yBot = Math.min(PIXH - 1, Math.ceil((sb.y1 + 2) * PIXS));
    const x0 = Math.ceil((c.x0 + 2) * PIXS), x1 = Math.floor((c.x1 - 2) * PIXS);
    const n = x1 - x0 + 1;
    if (n < 16 * PIXS) return "";
    const rootward = c.upper ? -1 : 1;
    const crownward = -rootward;
    const ys = new Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      const px = x0 + i;
      const from = c.upper ? yTop : yBot;
      const to = c.upper ? yBot : yTop;
      for (let py = from; py !== to; py += crownward) {
        if (classifyAt(px, py) !== 1) continue;
        if (classifyAt(px, py + crownward * 3) !== 1) continue;   // kein 1px-Splitter
        let ok = false;
        for (let k = 2; k <= 16; k++) {
          const cl = classifyAt(px, py + rootward * k);
          if (cl === 2) { ok = true; break; }
          if (cl === 1) break;
        }
        if (ok) ys[i] = py / PIXS;
        break;
      }
    }

    let first = -1, last = -1;
    for (let i = 0; i < n; i++) if (Number.isFinite(ys[i])) { if (first < 0) first = i; last = i; }
    if (first < 0 || last - first < 12 * PIXS) return "";
    let prev = first;
    for (let i = first + 1; i <= last; i++) {
      if (!Number.isFinite(ys[i])) continue;
      for (let j = prev + 1; j < i; j++) {
        ys[j] = ys[prev] + (ys[i] - ys[prev]) * (j - prev) / (i - prev);
      }
      prev = i;
    }

    const m = last - first + 1;
    const med = new Array(m);
    for (let i = 0; i < m; i++) {
      const w = [];
      for (let j = Math.max(0, i - 4); j <= Math.min(m - 1, i + 4); j++) w.push(ys[first + j]);
      w.sort((a, b) => a - b);
      med[i] = w[Math.floor(w.length / 2)];
    }
    const sm = new Array(m);
    for (let i = 0; i < m; i++) {
      let sum = 0, k = 0;
      for (let j = Math.max(0, i - 3); j <= Math.min(m - 1, i + 3); j++) { sum += med[j]; k++; }
      sm[i] = sum / k;
    }

    // Molaren: die Vorlage zeichnet die Grenze dort fast gerade -> ein weicher,
    // gerundeter Bogen Richtung Wurzel macht den Verlauf natuerlicher.
    if (c.fdi % 10 >= 6) {
      const bowAmp = 5;
      for (let i = 0; i < m; i++) {
        sm[i] += rootward * bowAmp * Math.sin(Math.PI * (i / (m - 1)));
      }
    }

    // Grenze zusaetzlich als y je Quell-x ablegen -> Basis fuer die Knochenkante
    const sx0 = Math.ceil((x0 + first) / PIXS), sx1 = Math.floor((x0 + last) / PIXS);
    const arr = [];
    for (let sx = sx0; sx <= sx1; sx++) {
      const ri = Math.min(m - 1, Math.max(0, sx * PIXS - x0 - first));
      arr.push(sm[ri]);
    }
    if (arr.length) SOURCE_CEJ_ARR[c.fdi] = { x0: sx0, ys: arr };

    const pts = [];
    const stepPx = 2 * PIXS;
    for (let i = 0; i < m; i += stepPx) pts.push({ x: (x0 + first + i) / PIXS, y: sm[i] });
    if ((m - 1) % stepPx) pts.push({ x: (x0 + last) / PIXS, y: sm[m - 1] });
    if (pts.length < 4) return "";

    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(2)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(2)} ` +
        `${(p2.x - (p3.x - p1.x) / 6).toFixed(2)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(2)} ` +
        `${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  }

  function buildCejSourceLayer(parent) {
    const layer = document.createElementNS(SVGNS, "g");
    layer.setAttribute("id", "cejSourceLayer");
    COLS.cols.forEach((c) => {
      if (st(c.fdi).missing) return;
      if (!(c.fdi in SOURCE_CEJ_D)) SOURCE_CEJ_D[c.fdi] = cejFromRaster(c);
      const d = SOURCE_CEJ_D[c.fdi];
      if (!d) return;
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", d);
      p.setAttribute("class", "cej-source-line");
      layer.appendChild(p);
    });
    parent.appendChild(layer);
  }

  // Zweit-/Palatinalwurzeln direkt aus den Originalpfaden von teethSVG:
  // 14 zeichnet die zweite Wurzel mit Gradient-Fuellung, 25 und die palatinalen
  // Wurzeln von 16/17/26/27 als #BCAE95-Form mittig im Wurzelfeld.
  function readExtraRoots(svgText) {
    EXTRA_ROOTS = {};
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const paths = [...doc.querySelectorAll("path")].map((p) => ({
      d: p.getAttribute("d") || "",
      fill: p.getAttribute("fill") || "",
      b: pathBounds(p.getAttribute("d") || ""),
    })).filter((p) => p.b);
    [14, 24, 25, 16, 17, 18, 26, 27, 28].forEach((fdi) => {
      const c = COLS.cols.find((k) => k.fdi === fdi);
      if (!c) return;
      const q = (c.x1 - c.x0) * 0.1;
      const hits = paths.filter((p) => {
        const cx = (p.b.x0 + p.b.x1) / 2;
        const w = p.b.x1 - p.b.x0, h = p.b.y1 - p.b.y0;
        if (cx < c.x0 + q || cx > c.x1 - q) return false;
        if (fdi === 14 || fdi === 24) return p.fill.startsWith("url(") && w >= 25 && h >= 120;
        return p.fill.toUpperCase() === "#BCAE95" && w >= 20 && h >= 55 && p.b.y0 < 245;
      });
      if (!hits.length) return;
      hits.sort((a, b) =>
        (b.b.x1 - b.b.x0) * (b.b.y1 - b.b.y0) - (a.b.x1 - a.b.x0) * (a.b.y1 - a.b.y0));
      // alle gezeichneten Wurzel-Formen uebernehmen (max. 3), nicht nur die groesste
      EXTRA_ROOTS[fdi] = hits.slice(0, 3).map((p) => p.d);
    });
  }

  function ensureGrad(defs, id, type, attrs, stops) {
    if (defs.querySelector("#" + id)) return;
    const g = document.createElementNS(SVGNS, type);
    g.setAttribute("id", id);
    g.setAttribute("gradientUnits", "userSpaceOnUse");
    Object.keys(attrs).forEach((k) => g.setAttribute(k, attrs[k]));
    stops.forEach(([off, col]) => {
      const s = document.createElementNS(SVGNS, "stop");
      s.setAttribute("offset", off);
      s.setAttribute("stop-color", col);
      g.appendChild(s);
    });
    defs.appendChild(g);
  }

  function cejYAt(seg, x) {
    const i = Math.max(0, Math.min(seg.ys.length - 1, Math.round(x) - seg.x0));
    return seg.ys[i];
  }

  // Clip-Band eines Zahns ober-/unterhalb seiner exakten Grenzlinie
  function bandD(c, toCrown) {
    const seg = SOURCE_CEJ_ARR[c.fdi];
    if (!seg) return "";
    const x0 = Math.floor(c.x0) - 2, x1 = Math.ceil(c.x1) + 2;
    const yFar = toCrown ? SPLIT : (c.upper ? -20 : CH + 20);
    let d = "";
    for (let x = x0; x <= x1; x += 2) {
      d += (d ? " L " : "M ") + x + " " + cejYAt(seg, x).toFixed(1);
    }
    d += ` L ${x1} ${yFar} L ${x0} ${yFar} Z`;
    return d;
  }

  function bandRect(c, gradId, cls) {
    const r = document.createElementNS(SVGNS, "rect");
    r.setAttribute("x", Math.floor(c.x0) - 2);
    r.setAttribute("width", Math.ceil(c.x1 - c.x0) + 4);
    r.setAttribute("y", c.upper ? 0 : SPLIT);
    r.setAttribute("height", c.upper ? SPLIT : CH - SPLIT);
    r.setAttribute("fill", "url(#" + gradId + ")");
    r.setAttribute("class", cls);
    return r;
  }

  // Studio-Warm-Plastik (Stil aus der Zeichenstil-Studie, Karte 04):
  // Kronen: diagonaler Schmelzverlauf #fffdf4->#efd9b8->#c99a68 + Original-
  // Anatomie als Multiply + Glanzlicht. Wurzeln: Zylinderverlauf
  // #7c5340->#d7a074->#7c5340 + apikale Tiefe als Multiply ueber der
  // Originalzeichnung (Furkationen/Einzelwurzeln bleiben erhalten).
  function buildPlasticLayer(defs) {
    const old = svgEl.querySelector("#plasticLayer");
    if (old) old.remove();
    const layer = document.createElementNS(SVGNS, "g");
    layer.setAttribute("id", "plasticLayer");
    COLS.cols.forEach((c) => {
      if (st(c.fdi).missing) return;
      const fdi = c.fdi;
      const seg = SOURCE_CEJ_ARR[fdi];
      const silD = SIL[fdi];
      const sb = silD ? pathBounds(silD) : null;
      if (!seg || !sb) return;
      let cerv = 0;
      seg.ys.forEach((y) => { cerv += y; });
      cerv /= seg.ys.length;
      const incY = c.upper ? sb.y1 : sb.y0;
      const apexY = c.upper ? sb.y0 : sb.y1;
      const w = c.x1 - c.x0;

      ensureClip(defs, "st-sil-" + fdi, silD);
      ensureClip(defs, "st-cr-" + fdi, bandD(c, true));
      ensureClip(defs, "st-rt-" + fdi, bandD(c, false));
      ensureGrad(defs, "st-cg-" + fdi, "linearGradient",
        { x1: c.x0, y1: incY, x2: c.x1, y2: cerv },
        [[0, "#fffdf4"], [0.55, "#efd9b8"], [1, "#c99a68"]]);
      ensureGrad(defs, "st-cs-" + fdi, "radialGradient",
        { cx: c.cx - w * 0.14, cy: incY + (cerv - incY) * 0.42, r: Math.max(20, w * 0.5) },
        [[0, "rgba(255,255,255,.95)"], [0.5, "rgba(255,255,255,.28)"], [1, "rgba(255,255,255,0)"]]);
      ensureGrad(defs, "st-rx-" + fdi, "linearGradient",
        { x1: c.x0, y1: 0, x2: c.x1, y2: 0 },
        [[0, "#a97e5f"], [0.5, "#e4bb94"], [1, "#a97e5f"]]);
      ensureGrad(defs, "st-rc-" + fdi, "linearGradient",
        { x1: c.x0, y1: 0, x2: c.x1, y2: 0 },
        [[0, "rgba(70,40,25,.34)"], [0.3, "rgba(70,40,25,0)"],
         [0.7, "rgba(70,40,25,0)"], [1, "rgba(70,40,25,.34)"]]);
      ensureGrad(defs, "st-ry-" + fdi, "linearGradient",
        { x1: 0, y1: cerv, x2: 0, y2: apexY },
        [[0, "rgba(120,70,40,0)"], [0.6, "rgba(120,70,40,.08)"], [1, "rgba(120,70,40,.3)"]]);

      // aeussere Gruppe traegt den Schlagschatten (Filter isoliert die
      // Mischmodi -> Wurzelband bekommt eine eigene Bildkopie als Basis)
      const tooth = document.createElementNS(SVGNS, "g");
      tooth.setAttribute("class", "studio-tooth");
      const silG = document.createElementNS(SVGNS, "g");
      silG.setAttribute("clip-path", "url(#st-sil-" + fdi + ")");
      tooth.appendChild(silG);

      const mkImg = (cls) => {
        const im = document.createElementNS(SVGNS, "image");
        im.setAttribute("x", 0); im.setAttribute("y", 0);
        im.setAttribute("width", CW); im.setAttribute("height", CH);
        im.setAttribute("preserveAspectRatio", "none");
        im.setAttribute("href", TEETH_SRC);
        im.setAttributeNS(XLINK, "href", TEETH_SRC);
        im.setAttribute("class", cls);
        return im;
      };

      const root = document.createElementNS(SVGNS, "g");
      root.setAttribute("clip-path", "url(#st-rt-" + fdi + ")");
      root.appendChild(mkImg("studio-root-base"));
      root.appendChild(bandRect(c, "st-rx-" + fdi, "studio-root-tone"));
      root.appendChild(bandRect(c, "st-rc-" + fdi, "studio-root-cyl"));
      root.appendChild(bandRect(c, "st-ry-" + fdi, "studio-root-depth"));
      (EXTRA_ROOTS[fdi] || []).forEach((d, i) => {
        const rb = pathBounds(d);
        if (!rb) return;
        // eigener Zylinder-Verlauf je Wurzelform -> jede Wurzel liest sich
        // als heller, runder Koerper vor dem dunklen Furkations-Hintergrund
        ensureGrad(defs, "st-xr-" + fdi + "-" + i, "linearGradient",
          { x1: rb.x0, y1: 0, x2: rb.x1, y2: 0 },
          [[0, "#96684c"], [0.45, "#e0b58c"], [1, "#96684c"]]);
        const p = document.createElementNS(SVGNS, "path");
        p.setAttribute("d", d);
        p.setAttribute("fill", "url(#st-xr-" + fdi + "-" + i + ")");
        p.setAttribute("class", "studio-extra-root");
        root.appendChild(p);
      });
      silG.appendChild(root);

      const crown = document.createElementNS(SVGNS, "g");
      crown.setAttribute("clip-path", "url(#st-cr-" + fdi + ")");
      crown.appendChild(bandRect(c, "st-cg-" + fdi, "studio-crown-fill"));
      crown.appendChild(mkImg("studio-crown-anat"));
      crown.appendChild(bandRect(c, "st-cs-" + fdi, "studio-crown-shine"));
      silG.appendChild(crown);

      layer.appendChild(tooth);
    });
    svgEl.insertBefore(layer, svgEl.querySelector("#boneLayer"));
  }

  // Gingiva-Randlinie je Kiefer: ueber jedem Zahn EXAKT die Grenzlinie,
  // zwischen den Zaehnen weiche Papillen Richtung Kontaktpunkt, ueber
  // Zahnluecken flacher Kieferkamm, distal Ueberblendung auf die
  // Original-Saumlinie bis zum Knochenende.
  function gumRangeX(upper) {
    const e = BONE_EDGE && BONE_EDGE[upper ? "up" : "lo"];
    return e ? [e.x0, e.x1] : (upper ? GUM_X.up : GUM_X.lo);
  }

  function gumMarginArr(cols, base, upper) {
    const crownward = upper ? 1 : -1;
    const [gx0, gx1] = gumRangeX(upper);
    const boneEdge = BONE_EDGE && BONE_EDGE[upper ? "up" : "lo"];
    // distale Zielkurve: Zahnfleisch folgt der koronalen Knochenkante,
    // minimal krownwaerts versetzt, damit es den Knochenrand ueberdeckt
    const target = (x) => {
      const cx = Math.max(0, Math.min(CW - 1, x));
      if (boneEdge && boneEdge.edge[cx] != null) return boneEdge.edge[cx] + crownward * 4;
      return base[cx];
    };
    const arr = new Array(CW).fill(NaN);
    const segs = [];
    cols.forEach((c) => {
      if (st(c.fdi).missing) return;
      const seg = SOURCE_CEJ_ARR[c.fdi];
      if (!seg) return;
      segs.push({ x0: seg.x0, x1: seg.x0 + seg.ys.length - 1, seg });
      for (let i = 0; i < seg.ys.length; i++) arr[seg.x0 + i] = seg.ys[i];
    });
    segs.sort((a, b) => a.x0 - b.x0);

    for (let i = 0; i + 1 < segs.length; i++) {
      const L = segs[i], R = segs[i + 1];
      const gap = R.x0 - L.x1;
      if (gap < 4 || gap > 60) continue;   // nur echte Interdentalraeume
      const yL = L.seg.ys[L.seg.ys.length - 1];
      const yR = R.seg.ys[0];
      const amp = Math.min(13, gap * 0.5);
      for (let x = L.x1 + 1; x < R.x0; x++) {
        const t = (x - L.x1) / gap;
        arr[x] = yL + (yR - yL) * t + crownward * amp * Math.sin(Math.PI * t);
      }
    }

    if (!segs.length) {
      for (let x = gx0; x <= gx1; x++) arr[x] = target(x);
      return arr;
    }
    // breitere Luecken (fehlende Zaehne): flacher Kamm ohne Papille
    const first = segs[0].x0, last = segs[segs.length - 1].x1;
    let prev = first;
    for (let x = first + 1; x <= last; x++) {
      if (!Number.isFinite(arr[x])) continue;
      for (let j = prev + 1; j < x; j++) {
        arr[j] = arr[prev] + (arr[x] - arr[prev]) * (j - prev) / (x - prev);
      }
      prev = x;
    }
    // distal: weich auf die koronale Knochenkante ueberblenden und ihr
    // bis zum Ende des Kieferknochens folgen (retromolar)
    const FADE = 70;
    for (let x = gx0; x < first; x++) {
      const t = Math.min(1, (first - x) / FADE);
      arr[x] = (1 - t) * arr[first] + t * target(x);
    }
    for (let x = last + 1; x <= gx1; x++) {
      const t = Math.min(1, (x - last) / FADE);
      arr[x] = (1 - t) * arr[last] + t * target(x);
    }
    return arr;
  }

  function catmullD(pts) {
    if (pts.length < 3) return "";
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
      const p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(2)} ` +
        `${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(2)} ` +
        `${p2.x.toFixed(1)} ${p2.y.toFixed(2)}`;
    }
    return d;
  }

  function marginPoints(margin, gx0, gx1) {
    const pts = [];
    for (let x = gx0; x <= gx1; x += 3) pts.push({ x, y: margin[x] });
    if (pts[pts.length - 1].x !== gx1) pts.push({ x: gx1, y: margin[gx1] });
    return pts;
  }

  function buildGumLayer(defs) {
    const gumLayer = svgEl.querySelector("#gumLayer");
    if (!gumLayer) return;
    gumLayer.textContent = "";
    [
      { cols: upperCols(), base: BASE_UP, upper: true, key: "up" },
      { cols: lowerCols(), base: BASE_LO, upper: false, key: "lo" },
    ].forEach(({ cols, base, upper, key }) => {
      const crownward = upper ? 1 : -1;
      const [gx0, gx1] = gumRangeX(upper);
      const raw = gumMarginArr(cols, base, upper);
      // ausserhalb des Bandes mit Randwerten fuellen, damit die Glaettung sauber laeuft
      for (let x = 0; x < gx0; x++) raw[x] = raw[gx0];
      for (let x = gx1 + 1; x < CW; x++) raw[x] = raw[gx1];
      const margin = smoothArr(raw, 5);
      const broad = smoothArr(raw, 101);
      const apical = new Array(CW);
      const TAPER = 46;   // Band laeuft an den distalen Enden weich aus
      for (let x = 0; x < CW; x++) {
        const edge = Math.min(x - gx0, gx1 - x);
        const h = GUM_H * (edge < TAPER ? Math.max(0.22, edge / TAPER) : 1);
        const a = broad[x] - crownward * h;
        apical[x] = upper
          ? Math.min(a, margin[x] - 2.5)
          : Math.max(a, margin[x] + 2.5);
      }

      const pts = marginPoints(margin, gx0, gx1);
      const dEdge = catmullD(pts);
      let dBody = `M ${gx0} ${apical[gx0].toFixed(1)} ` + dEdge.replace(/^M/, "L");
      dBody += ` L ${gx1} ${apical[gx1].toFixed(1)}`;
      for (let x = gx1; x >= gx0; x -= 4) dBody += ` L ${x} ${apical[x].toFixed(1)}`;
      dBody += " Z";

      let mSum = 0, aSum = 0;
      for (let x = gx0; x <= gx1; x++) { mSum += margin[x]; aSum += apical[x]; }
      const mY = mSum / (gx1 - gx0 + 1), aY = aSum / (gx1 - gx0 + 1);
      ensureGrad(defs, "gum-g-" + key, "linearGradient",
        { x1: 0, y1: mY, x2: 0, y2: aY },
        [[0, "#e39694"], [0.45, "#d57678"], [1, "#b25f63"]]);
      ensureClip(defs, "gum-clip-" + key, dBody);

      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "gum-group");
      const body = document.createElementNS(SVGNS, "path");
      body.setAttribute("d", dBody);
      body.setAttribute("fill", "url(#gum-g-" + key + ")");
      body.setAttribute("class", "gum-body");
      g.appendChild(body);

      const inner = document.createElementNS(SVGNS, "g");
      inner.setAttribute("clip-path", "url(#gum-clip-" + key + ")");
      const gloss = document.createElementNS(SVGNS, "path");
      gloss.setAttribute("d", dEdge);
      gloss.setAttribute("class", "gum-gloss");
      gloss.setAttribute("transform", "translate(0," + (crownward * -3.4).toFixed(1) + ")");
      inner.appendChild(gloss);
      g.appendChild(inner);

      const seam = document.createElementNS(SVGNS, "path");
      seam.setAttribute("d", dEdge);
      seam.setAttribute("class", "gum-seam");
      g.appendChild(seam);

      gumLayer.appendChild(g);
    });
  }

  // gleitender Mittelwert (Fenster win) -> glatter Bogen ohne alten Scallop
  function smoothArr(arr, win) {
    const n = arr.length, h = win >> 1, ps = new Array(n + 1);
    ps[0] = 0;
    for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + arr[i];
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - h), b = Math.min(n - 1, i + h);
      out[i] = (ps[b + 1] - ps[a]) / (b - a + 1);
    }
    return out;
  }

  // Knochenkante "gesund": folgt exakt der Krone/Wurzel-Grenzlinie, um
  // CEJ_BONE_GAP_MM nach apikal versetzt. Zwischen den Zaehnen verbindet ein
  // Stueck die Linien-Enden (interdentales Septum bis knapp unter den Kontakt),
  // anschliessend leichte Glaettung. Ohne Rasterdaten: alte Saumkanten-Naeherung.
  function boneCrestArr(cols, base, upper) {
    const apical = upper ? -1 : 1;
    const gap = CEJ_BONE_GAP_MM * MM;
    const arr = new Array(CW).fill(NaN);
    cols.forEach((c) => {
      const seg = SOURCE_CEJ_ARR[c.fdi];
      if (!seg) return;
      for (let i = 0; i < seg.ys.length; i++) {
        const x = seg.x0 + i;
        if (x >= 0 && x < CW) arr[x] = seg.ys[i] + apical * gap;
      }
    });
    let first = -1, last = -1;
    for (let x = 0; x < CW; x++) {
      if (Number.isFinite(arr[x])) { if (first < 0) first = x; last = x; }
    }
    if (first < 0) {
      const B = (x) => base[Math.max(0, Math.min(CW - 1, x))];
      for (let x = 0; x < CW; x++) arr[x] = B(x) + apical * (BAND - OVERLAP);
      return arr;
    }
    let prev = first;
    for (let x = first + 1; x <= last; x++) {
      if (!Number.isFinite(arr[x])) continue;
      for (let j = prev + 1; j < x; j++) {
        arr[j] = arr[prev] + (arr[x] - arr[prev]) * (j - prev) / (x - prev);
      }
      prev = x;
    }
    for (let x = 0; x < first; x++) arr[x] = arr[first];
    for (let x = last + 1; x < CW; x++) arr[x] = arr[last];
    return smoothArr(arr, 9);
  }

  function curveY(x, cols, arr, sign, key) {
    const e = edgeAt(arr, x);
    for (const c of cols) {
      if (x >= c.x0 && x <= c.x1) {
        const s = st(c.fdi);
        if (!s || s.missing) return e - sign * EPS;
        const val = (s[key] || 0) * MM;
        const t = (x - c.x0) / Math.max(1, c.x1 - c.x0);
        const dip = 4 * t * (1 - t);
        return e - sign * EPS + sign * val * dip;
      }
    }
    return e - sign * EPS;
  }

  function clipPathD(cols, arr, upper, key, full) {
    if (!cols.length) return "";
    const inFirst = cols[0].x0, inLast = cols[cols.length - 1].x1;
    const xS = full ? 0 : inFirst, xE = full ? CW : inLast;
    const sign = upper ? -1 : 1;
    const outer = upper ? 0 : CH;
    // ausserhalb der Zahnreihe (retromolar) NICHT koronal beschneiden ->
    // kompletter Knochen sichtbar; innerhalb: bogenfoermige Kante
    const yAt = (x) =>
      (x < inFirst || x > inLast) ? SPLIT : curveY(x, cols, arr, sign, key);
    let d = `M ${xS} ${outer} L ${xE} ${outer}`;
    for (let x = xE; x >= xS; x -= STEP) {
      d += ` L ${x.toFixed(1)} ${yAt(x).toFixed(1)}`;
    }
    d += ` L ${xS} ${yAt(xS).toFixed(1)} Z`;
    return d;
  }

  function ensureClip(defs, id, d) {
    let cp = defs.querySelector("#" + id);
    if (!cp) {
      cp = document.createElementNS(SVGNS, "clipPath");
      cp.setAttribute("id", id);
      cp.setAttribute("clipPathUnits", "userSpaceOnUse");
      cp.appendChild(document.createElementNS(SVGNS, "path"));
      defs.appendChild(cp);
    }
    cp.firstChild.setAttribute("d", d);
  }

  function clippedImg(href, clipId) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("clip-path", "url(#" + clipId + ")");
    const im = document.createElementNS(SVGNS, "image");
    im.setAttribute("x", 0); im.setAttribute("y", 0);
    im.setAttribute("width", CW); im.setAttribute("height", CH);
    im.setAttribute("preserveAspectRatio", "none");
    im.setAttribute("href", href);
    im.setAttributeNS(XLINK, "href", href);
    g.appendChild(im);
    return g;
  }

  function render() {
    let defs = svgEl.querySelector("defs#clipDefs");
    if (!defs) {
      defs = document.createElementNS(SVGNS, "defs");
      defs.setAttribute("id", "clipDefs");
      svgEl.insertBefore(defs, svgEl.firstChild);
    }
    const oc = upperCols(), lc = lowerCols();
    ensureClip(defs, "cb-up", clipPathD(oc, BONE_UP, true, "loss", true));
    ensureClip(defs, "cb-lo", clipPathD(lc, BONE_LO, false, "loss", true));
    buildPlasticLayer(defs);

    const boneLayer = svgEl.querySelector("#boneLayer");
    boneLayer.textContent = "";
    boneLayer.setAttribute("opacity", boneOpacity.toFixed(2));
    boneLayer.appendChild(clippedImg("/m/lena-01/bone-k.png?v=7", "cb-up"));
    boneLayer.appendChild(clippedImg("/m/lena-01/bone-k.png?v=7", "cb-lo"));
    buildGumLayer(defs);

    // Zweit-/Palatinalwurzeln: leichtes Echo UEBER dem Knochen, sonst
    // verschwinden sie bei hoher Knochen-Deckkraft wieder
    let echo = svgEl.querySelector("#extraRootEcho");
    if (echo) echo.remove();
    echo = document.createElementNS(SVGNS, "g");
    echo.setAttribute("id", "extraRootEcho");
    // Klasse zusaetzlich zur id: im Lupen-Klon werden ids entfernt,
    // das Styling muss dort ueber die Klasse weiterwirken
    echo.setAttribute("class", "extra-root-echo");
    COLS.cols.forEach((c) => {
      if (st(c.fdi).missing || !EXTRA_ROOTS[c.fdi]) return;
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("clip-path", "url(#st-rt-" + c.fdi + ")");
      EXTRA_ROOTS[c.fdi].forEach((d) => {
        const p = document.createElementNS(SVGNS, "path");
        p.setAttribute("d", d);
        g.appendChild(p);
      });
      echo.appendChild(g);
    });
    svgEl.insertBefore(echo, boneLayer.nextSibling);

    // fehlende Zaehne: NUR den Zahn entfernen (Rechteck ZWISCHEN Zaehnen und
    // Knochen) -> Knochen + Zahnfleisch bleiben erhalten (liegen darueber).
    let miss = svgEl.querySelector("#missLayer");
    if (miss) miss.remove();
    miss = document.createElementNS(SVGNS, "g");
    miss.setAttribute("id", "missLayer");
    COLS.cols.forEach((c) => {
      if (!st(c.fdi).missing) return;
      const r = document.createElementNS(SVGNS, "rect");
      r.setAttribute("x", c.x0); r.setAttribute("width", Math.max(1, c.x1 - c.x0));
      r.setAttribute("y", c.upper ? 0 : SPLIT);
      r.setAttribute("height", c.upper ? SPLIT : CH - SPLIT);
      r.setAttribute("fill", "#16222c");
      miss.appendChild(r);
    });
    svgEl.insertBefore(miss, boneLayer);

    buildHits();
    updateZoom();
    syncPanel();
  }

  // Lupen-Modul links: Klon der kompletten Buehne mit viewBox auf den
  // gewaehlten Zahn. IDs werden im Klon entfernt; url(#...)-Referenzen
  // loesen dokumentweit auf die Original-Defs auf (gleiches Koordinatensystem).
  function updateZoom() {
    const host = document.getElementById("zoomStage");
    if (!host || !svgEl) return;
    const label = document.getElementById("zoomLabel");
    if (label) label.textContent = "Zahn " + selected;
    host.textContent = "";
    const sb = pathBounds(SIL[selected] || "");
    if (!sb) return;
    const clone = svgEl.cloneNode(true);
    clone.removeAttribute("class");
    clone.removeAttribute("id");
    clone.querySelectorAll(".hit, .flab, .selout").forEach((n) => n.remove());
    clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    const padX = 10, padY = 14;
    const vx = sb.x0 - padX, vy = sb.y0 - padY;
    const vw = sb.x1 - sb.x0 + 2 * padX, vh = sb.y1 - sb.y0 + 2 * padY;
    clone.setAttribute("viewBox",
      vx.toFixed(0) + " " + vy.toFixed(0) + " " + vw.toFixed(0) + " " + vh.toFixed(0));
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
    clone.setAttribute("class", "zoom-svg");
    // WIRKLICH nur dieser Zahn: alles ausserhalb des Ausschnitts wegclippen
    const zdefs = document.createElementNS(SVGNS, "defs");
    const zclip = document.createElementNS(SVGNS, "clipPath");
    zclip.setAttribute("id", "zoomClip");
    const zr = document.createElementNS(SVGNS, "rect");
    zr.setAttribute("x", vx); zr.setAttribute("y", vy);
    zr.setAttribute("width", vw); zr.setAttribute("height", vh);
    zclip.appendChild(zr);
    zdefs.appendChild(zclip);
    const wrap = document.createElementNS(SVGNS, "g");
    wrap.setAttribute("clip-path", "url(#zoomClip)");
    while (clone.firstChild) wrap.appendChild(clone.firstChild);
    clone.appendChild(zdefs);
    clone.appendChild(wrap);
    host.appendChild(clone);
  }

  function buildHits() {
    let front = svgEl.querySelector("#hitLayer");
    if (front) front.remove();
    front = document.createElementNS(SVGNS, "g");
    front.setAttribute("id", "hitLayer");

    // Highlight: Silhouette (Krone+Wurzel) des gewaehlten Zahns, kein Viereck
    const selD = SIL[selected];
    if (selD) {
      const sp = document.createElementNS(SVGNS, "path");
      sp.setAttribute("d", selD);
      sp.setAttribute("class", "selout");
      front.appendChild(sp);
    }

    // Pink: ausschliesslich Originalkonturen aus teethSVG. Ein schmaler
    // CEJ-Clip blendet nur die gemeinsame Grenze von Kronen- und Wurzelpfad ein.
    buildCejSourceLayer(front);

    COLS.cols.forEach((c) => {
      const r = document.createElementNS(SVGNS, "rect");
      r.setAttribute("x", c.x0); r.setAttribute("width", Math.max(1, c.x1 - c.x0));
      r.setAttribute("y", c.upper ? 0 : SPLIT);
      r.setAttribute("height", c.upper ? SPLIT : CH - SPLIT);
      r.setAttribute("class", "hit");
      r.addEventListener("click", () => { selected = c.fdi; render(); });
      front.appendChild(r);
      const t = document.createElementNS(SVGNS, "text");
      t.setAttribute("x", APEXX[c.fdi] != null ? APEXX[c.fdi] : c.cx);
      t.setAttribute("y", c.upper ? 20 : CH - 8);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", "flab" + (c.fdi === selected ? " on" : ""));
      t.textContent = c.fdi;
      front.appendChild(t);
    });
    svgEl.appendChild(front);
  }

  function syncPanel() {
    const s = st(selected);
    document.getElementById("selLabel").textContent = "Zahn " + selected;
    document.getElementById("loss").value = s.loss;
    document.getElementById("miss").checked = s.missing;
    document.getElementById("lossVal").textContent = s.loss + " mm";
    document.getElementById("calVal").textContent = "Knochenabbau " + s.loss + " mm";
    const bo = document.getElementById("boneOp");
    if (bo) {
      bo.value = Math.round(boneOpacity * 100);
      document.getElementById("boneOpVal").textContent = Math.round(boneOpacity * 100) + " %";
    }
  }

  function preset(kind) {
    COLS.cols.forEach((c) => { state[c.fdi] = { rec: 0, loss: 0, missing: false }; });
    if (kind === "demo") {
      const set = (f, l) => { if (state[f]) state[f] = { rec: 0, loss: l, missing: false }; };
      set(46, 7); set(36, 5); set(16, 4); set(11, 3); set(41, 5); set(31, 4); set(26, 6);
    }
    if (kind === "gen") {
      COLS.cols.forEach((c) => { state[c.fdi] = { rec: 0, loss: 4, missing: false }; });
    }
    render();
  }

  async function boot() {
    const host = document.getElementById("stage");
    const [svgTxt, cols, teethTxt, boneEdge] = await Promise.all([
      fetch("/m/lena-01/perio-layers.svg?v=13").then((r) => r.text()),
      fetch("/m/lena-01/perio-cols.json?v=12").then((r) => r.json()),
      fetch(TEETH_SRC).then((r) => r.text()),
      fetch("/m/lena-01/bone-edge.json?v=1").then((r) => r.json()).catch(() => null),
    ]);
    BONE_EDGE = boneEdge;
    COLS = cols; EDGES = cols.edges; SIL = cols.sil; MM = cols.mm || 6;
    CW = cols.cw; CH = cols.ch; SPLIT = cols.split;
    await rasterizeTeethSource();
    COLS.cols.forEach((c) => { SOURCE_CEJ_D[c.fdi] = cejFromRaster(c); });
    readExtraRoots(teethTxt);
    APEXX = {};
    COLS.cols.forEach((c) => { APEXX[c.fdi] = apexCenterX(c.fdi, c.upper); });
    BASE_UP = smoothArr(EDGES.gumUp, 111);
    BASE_LO = smoothArr(EDGES.gumLo, 111);
    BONE_UP = boneCrestArr(cols.cols.filter((c) => c.upper), BASE_UP, true);
    BONE_LO = boneCrestArr(cols.cols.filter((c) => !c.upper), BASE_LO, false);
    host.innerHTML = svgTxt;
    svgEl = host.querySelector("svg");
    svgEl.removeAttribute("width");
    svgEl.removeAttribute("height");
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svgEl.classList.add("perio-svg");

    COLS.cols.forEach((c) => { state[c.fdi] = { rec: 0, loss: 0, missing: false }; });
    document.getElementById("loss").addEventListener("input", (e) => { st(selected).loss = +e.target.value; render(); });
    document.getElementById("miss").addEventListener("change", (e) => { st(selected).missing = e.target.checked; render(); });
    const boEl = document.getElementById("boneOp");
    if (boEl) boEl.addEventListener("input", (e) => {
      boneOpacity = Math.max(0, Math.min(1, (+e.target.value) / 100));
      const bl = svgEl.querySelector("#boneLayer");
      if (bl) bl.setAttribute("opacity", boneOpacity.toFixed(2));
      document.getElementById("boneOpVal").textContent = (+e.target.value) + " %";
      updateZoom();
    });
    document.getElementById("presetDemo").addEventListener("click", () => preset("demo"));
    document.getElementById("presetGen").addEventListener("click", () => preset("gen"));
    document.getElementById("presetReset").addEventListener("click", () => preset("reset"));

    preset("demo");
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
