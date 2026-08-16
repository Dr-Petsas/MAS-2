/**
 * Lena 01 · Parodontologie – aus DEINEN drei gebackenen Ebenen (PNG):
 *   Zaehne -> Knochen (opacity 0.45 Default) -> Zahnfleisch.
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
  const EXTRACT_DROP_MM = 2;     // Extraktionsdefekt: Knochenkante 2 mm apikal (sichtbare Mulde)
  const GUM_H = 24;              // Bandhoehe der freien Gingiva (px, ~4 mm, Wunsch: doppelt)
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
  let GUM_GEO = { up: null, lo: null }; // margin/apical je Kiefer fuer Befund-Clips
  let LOSS_PX = { up: null, lo: null }; // Abbau in px je Spalte (Bogen Mid→Mid)
  let svgEl = null;
  let APEXX = {};                       // Beschriftungs-x je FDI: Mitte der Wurzelspitzen
  const state = {};
  let selected = 46;
  let boneOpacity = 0.45;   // Knochen-Deckkraft Default 45 % (permanent)
  let armedFinding = null;  // aktives Legenden-Item; null = nur Zahn waehlen
  let activeTab = "Pro";    // sichtbare Legende + Overlay-Filter

  function markOf(s) {
    if (!s.mark) s.mark = {};
    // Legacy-Alias: altes s.pro → s.mark
    if (s.pro) Object.keys(s.pro).forEach((k) => { if (s.pro[k] && s.mark[k] == null) s.mark[k] = true; });
    return s.mark;
  }
  function hasMark(s, id) {
    if (!s) return false;
    if (window.PerioChart) {
      if (PerioChart.isSurfacePaint(id) && PerioChart.hasSurfaceMarker(s, id)) return true;
      if (PerioChart.isRootPaint(id) && PerioChart.hasRootMarker(s, id)) return true;
    }
    const m = markOf(s);
    return !!m[id];
  }

  function emptyTooth() {
    return {
      rec: 0, loss: 0, missing: false, mark: {}, pro: {},
      pocket: { m: 1, d: 1 },
      surfaces: window.PerioChart ? PerioChart.emptySurfaces() : {},
      rootMarkers: [],
    };
  }

  // deterministischer Zufall je Zahn -> Overlays wackeln nicht bei jedem Render
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
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

  // Abdeckung beim Loeschen: NUR die Watershed-Silhouette (+ Extra-Wurzeln).
  // Fruehere Ansaetze (Spalt-Rechteck, Distal-Flare 12-22px, UK-Trapez,
  // Stroke 8/10) malten undurchsichtige Flaechen in die Nachbarzaehne und
  // erzeugten senkrechte Schnittkanten — gemessen ~5000 Nachbar-Pixel bei
  // vielen Luecken. Die SIL aus build-perio-layers.py enthaelt die mesial
  // gekippten UK-Molar-Barrieren bereits; kein zusaetzliches Polygon noetig.
  // Farbe = Hintergrund der Basisebene teeth-source.svg (#122432), NICHT der
  // SVG-Rect-Ton #241a15 — sonst steht ein sichtbar braunes Band in der Luecke.
  let MISS_BG = "#122432";
  // Nur Anti-Alias-Saum (~1 px je Seite). Stroke 10 blutet sichtbar in Nachbarn.

  // Hit-Targets / Lupe: Spaltenbreite (+ SIL/Extra, ohne Distal-Flare).
  // NICHT fuer die visuelle Abdeckung verwenden — Rechtecke schneiden Nachbarn.
  function missCoverBounds(c) {
    let x0 = c.x0, x1 = c.x1;
    let y0 = c.upper ? 0 : SPLIT;
    let y1 = c.upper ? SPLIT : CH;
    const absorb = (b, pad) => {
      if (!b) return;
      x0 = Math.min(x0, b.x0 - pad);
      x1 = Math.max(x1, b.x1 + pad);
      y0 = Math.min(y0, b.y0 - pad);
      y1 = Math.max(y1, b.y1 + pad);
    };
    absorb(pathBounds(SIL[c.fdi] || ""), 2);
    (EXTRA_ROOTS[c.fdi] || []).forEach((d) => absorb(pathBounds(d), 2));
    y0 = Math.max(0, y0);
    y1 = Math.min(CH, y1);
    x0 = Math.max(0, x0);
    x1 = Math.min(CW, x1);
    return { x0, x1, y0, y1 };
  }

  // Original-Artwork eines Zahns AUSBLENDEN geht nur per Maske auf #teethImg.
  // Der alte Ansatz (Silhouette in MISS_BG UEBERMALEN) liess die hellen
  // Aussenlinien der Zeichnung stehen (sie liegen ausserhalb der Watershed-
  // Silhouette) und toente den halbtransparenten Knochen dunkel — sichtbare
  // "Zahn-Geister" bei jedem entfernten Zahn.
  function rebuildTeethMask(defs) {
    const teethImg = svgEl.querySelector("#teethImg") || svgEl.querySelector("image");
    if (!teethImg) return;
    const old = defs.querySelector("#missMask");
    if (old) old.remove();
    // Alle Zaehne, deren Original verschwinden muss: fehlend, Milchzahn-
    // Ersatz, chirurgisch verschoben/gedreht, Wurzelrest (Neuzeichnung
    // uebernimmt die Darstellung in derselben Zelle)
    const hide = COLS.cols.filter((c) => {
      const s = st(c.fdi);
      if (!s) return false;
      if (s.missing) return true;
      const m = markOf(s);
      return !!(milkInfo(c) || (chirDisplacement(c) || {}).str || m.wurzelrest);
    });
    if (!hide.length) { teethImg.removeAttribute("mask"); return; }
    const mm = document.createElementNS(SVGNS, "mask");
    mm.setAttribute("id", "missMask");
    mm.setAttribute("maskUnits", "userSpaceOnUse");
    mm.setAttribute("x", 0); mm.setAttribute("y", 0);
    mm.setAttribute("width", CW); mm.setAttribute("height", CH);
    const bg = document.createElementNS(SVGNS, "rect");
    bg.setAttribute("x", 0); bg.setAttribute("y", 0);
    bg.setAttribute("width", CW); bg.setAttribute("height", CH);
    bg.setAttribute("fill", "#fff");
    mm.appendChild(bg);
    hide.forEach((c) => {
      const pontic = !!(st(c.fdi).missing && markOf(st(c.fdi)).brueckenglied);
      if (pontic && SOURCE_CEJ_ARR[c.fdi] && SIL[c.fdi]) {
        // Brueckenglied: nur die Wurzel ausstanzen — die Porzellan-Krone
        // wird deckend UEBER die Original-Krone gemalt
        ensureClip(defs, "st-rt-" + c.fdi, bandD(c, false));
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("clip-path", "url(#st-rt-" + c.fdi + ")");
        [SIL[c.fdi]].concat(EXTRA_ROOTS[c.fdi] || []).forEach((d) => {
          if (!d) return;
          const p = document.createElementNS(SVGNS, "path");
          p.setAttribute("d", d);
          p.setAttribute("fill", "#000");
          p.setAttribute("stroke", "#000");
          p.setAttribute("stroke-width", "4");
          p.setAttribute("stroke-linejoin", "round");
          g.appendChild(p);
        });
        mm.appendChild(g);
        return;
      }
      // Silhouette + breiter Rand: die gemalte AUSSENLINIE des Zahns liegt
      // knapp AUSSERHALB der Watershed-Silhouette — der Stroke stanzt sie mit
      [SIL[c.fdi]].concat(EXTRA_ROOTS[c.fdi] || []).forEach((d) => {
        if (!d) return;
        const p = document.createElementNS(SVGNS, "path");
        p.setAttribute("d", d);
        p.setAttribute("fill", "#000");
        p.setAttribute("stroke", "#000");
        p.setAttribute("stroke-width", "5");
        p.setAttribute("stroke-linejoin", "round");
        mm.appendChild(p);
      });
    });
    // Nachbarzaehne (und deren Aussenlinien) wieder freistellen — die
    // Rechtecke duerfen NIE Nachbarkonturen wegschneiden (Vorfall 19.07.)
    COLS.cols.forEach((n) => {
      const s = st(n.fdi);
      if (s && s.missing) return;
      if (milkInfo(n) || (chirDisplacement(n) || {}).str || markOf(s || {}).wurzelrest) return;
      if (!SIL[n.fdi]) return;
      [SIL[n.fdi]].concat(EXTRA_ROOTS[n.fdi] || []).forEach((d) => {
        if (!d) return;
        const p = document.createElementNS(SVGNS, "path");
        p.setAttribute("d", d);
        p.setAttribute("fill", "#fff");
        p.setAttribute("stroke", "#fff");
        p.setAttribute("stroke-width", "2.4");
        p.setAttribute("stroke-linejoin", "round");
        mm.appendChild(p);
      });
    });
    defs.appendChild(mm);
    teethImg.setAttribute("mask", "url(#missMask)");
  }

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
    const colX0 = Math.min(c.x0 + 2, sb.x0 + 1);
    const colX1 = Math.max(c.x1 - 2, sb.x1 - 1);
    const x0 = Math.ceil(colX0 * PIXS), x1 = Math.floor(colX1 * PIXS);
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

  // Aussenkontur eines Pfads glaetten: gleichmaessig abtasten, zyklisch
  // mitteln, als geschlossene Catmull-Rom-Kurve neu aufbauen. Entfernt die
  // zackeligen Vertex-Ketten der Original-Wurzelpfade (14/16-18/24-28).
  // Geschlossenen Pfad resampeln, mehrfach glaetten und optional nach AUSSEN
  // versetzen. offsetPx > 0 schiebt die Kontur entlang der Normalen vom
  // Schwerpunkt weg — der dunkle Umriss liegt dann AUSSEN um die gezeichnete
  // Wurzel statt auf ihrer Innenseite (Chef 20.07.).
  function smoothPathD(d, samples, passes, offsetPx) {
    const tmp = document.createElementNS(SVGNS, "svg");
    tmp.setAttribute("width", "0");
    tmp.setAttribute("height", "0");
    tmp.style.position = "absolute";
    tmp.style.left = "-9999px";
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", d);
    tmp.appendChild(p);
    document.body.appendChild(tmp);
    let out = d;
    try {
      const L = p.getTotalLength();
      const m = samples || 44;
      if (L > 40) {
        let pts = [];
        for (let i = 0; i < m; i++) {
          const q = p.getPointAtLength((L * i) / m);
          pts.push({ x: q.x, y: q.y });
        }
        const rounds = Math.max(1, passes || 1);
        for (let r = 0; r < rounds; r++) {
          pts = pts.map((_, i) => {
            const a = pts[(i - 1 + m) % m], b = pts[i], c = pts[(i + 1) % m];
            return { x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4 };
          });
        }
        if (offsetPx) {
          let cx = 0, cy = 0;
          pts.forEach((q) => { cx += q.x; cy += q.y; });
          cx /= m; cy /= m;
          pts = pts.map((q, i) => {
            const a = pts[(i - 1 + m) % m], c = pts[(i + 1) % m];
            let nx = -(c.y - a.y), ny = c.x - a.x;
            const nl = Math.hypot(nx, ny) || 1;
            nx /= nl; ny /= nl;
            // Normale vom Schwerpunkt weg orientieren
            if (nx * (q.x - cx) + ny * (q.y - cy) < 0) { nx = -nx; ny = -ny; }
            return { x: q.x + nx * offsetPx, y: q.y + ny * offsetPx };
          });
        }
        const sm = pts;
        let dd = `M ${sm[0].x.toFixed(1)} ${sm[0].y.toFixed(1)}`;
        for (let i = 0; i < m; i++) {
          const p0 = sm[(i - 1 + m) % m], p1 = sm[i];
          const p2 = sm[(i + 1) % m], p3 = sm[(i + 2) % m];
          dd += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ` +
            `${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ` +
            `${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        }
        out = dd + " Z";
      }
    } catch (e) { /* im Zweifel Originalpfad behalten */ }
    document.body.removeChild(tmp);
    return out;
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
      // alle gezeichneten Wurzel-Formen uebernehmen (max. 3), nicht nur die
      // groesste. Kraeftig glaetten (3 Passes, 72 Samples — Zacken weg) und
      // 2 px nach aussen versetzen: der Umriss sitzt AUSSEN um die Wurzel,
      // nicht auf der Innenseite der Zeichnung (Chef 20.07.).
      EXTRA_ROOTS[fdi] = hits.slice(0, 3).map((p) => smoothPathD(p.d, 72, 3, 2));
    });
    // Obere 6er/7er: die erkannten #BCAE95-Formen sind nur Dentin-Zungen/
    // Innenflaechen — als umrandete Formen wirkten sie wie haessliche
    // Schlaufen ueber den bukkalen Wurzeln. Ersetzt durch eine sauber
    // konstruierte Palatinalwurzel (buildPalatalRoots, nach CEJ-Abtastung).
    [16, 17, 26, 27].forEach((fdi) => { delete EXTRA_ROOTS[fdi]; });
  }

  // Palatinalwurzel der oberen Molaren neu zeichnen: breite, weich
  // zulaufende Wurzel mittig HINTER den bukkalen Wurzeln, Apex leicht nach
  // distal geneigt, etwas kuerzer als die bukkalen Apizes. Basis liegt 6 px
  // in der Kronenzone — das Wurzelband-Clip (st-rt) schneidet sie an der
  // CEJ ab, sichtbar sind nur Flanken und Apex.
  function buildPalatalRoots() {
    [16, 17, 26, 27].forEach((fdi) => {
      const silD = SIL[fdi];
      const seg = SOURCE_CEJ_ARR[fdi];
      if (!silD || !seg) return;
      const sb = pathBounds(silD);
      if (!sb) return;
      let cerv = 0;
      seg.ys.forEach((y) => { cerv += y; });
      cerv /= seg.ys.length;
      const w = sb.x1 - sb.x0;
      const cx = (sb.x0 + sb.x1) / 2;
      const rootLen = cerv - sb.y0;          // Oberkiefer: Apex oben
      if (rootLen < 40 || w < 30) return;
      const dxAp = (fdi < 20 ? -1 : 1) * w * 0.05;
      const bw = w * 0.30;                   // halbe Basisbreite
      const aw = w * 0.10;                   // halbe Apexbreite
      const yB = cerv + 6;
      const yA = sb.y0 + rootLen * 0.08;
      const pts = [
        [cx - bw, yB],
        [cx - bw * 0.98, yB - rootLen * 0.30],
        [cx - bw * 0.82, yB - rootLen * 0.56],
        [cx + dxAp - aw * 1.7, yB - rootLen * 0.78],
        [cx + dxAp - aw, yA + rootLen * 0.05],
        [cx + dxAp, yA],
        [cx + dxAp + aw, yA + rootLen * 0.05],
        [cx + dxAp + aw * 1.7, yB - rootLen * 0.78],
        [cx + bw * 0.82, yB - rootLen * 0.56],
        [cx + bw * 0.98, yB - rootLen * 0.30],
        [cx + bw, yB],
        [cx, yB + 4],
      ];
      const d = "M " + pts.map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join(" L ") + " Z";
      EXTRA_ROOTS[fdi] = [smoothPathD(d, 72, 2, 0)];
    });
  }

  function ensureGrad(defs, id, type, attrs, stops) {
    let g = defs.querySelector("#" + id);
    if (!g) {
      g = document.createElementNS(SVGNS, type);
      g.setAttribute("id", id);
      defs.appendChild(g);
    } else {
      while (g.firstChild) g.removeChild(g.firstChild);
    }
    g.setAttribute("gradientUnits", "userSpaceOnUse");
    Object.keys(attrs).forEach((k) => g.setAttribute(k, attrs[k]));
    stops.forEach(([off, col, op]) => {
      const s = document.createElementNS(SVGNS, "stop");
      s.setAttribute("offset", off);
      s.setAttribute("stop-color", col);
      if (op != null) s.setAttribute("stop-opacity", op);
      g.appendChild(s);
    });
  }

  function cejYAt(seg, x) {
    const i = Math.max(0, Math.min(seg.ys.length - 1, Math.round(x) - seg.x0));
    return seg.ys[i];
  }

  // Volle sichtbare Zahnbreite: Spaltengrenzen UND Silhouetten-Bounds.
  // Molarenwurzeln laden distal ueber die Spalte hinaus aus -- ein Clip nur
  // auf Spaltenbreite schnitt dort eine sichtbare VERTIKALE Kante ins Shading.
  function toothSpanX(c) {
    const sb = pathBounds(SIL[c.fdi] || "");
    const x0 = Math.floor(sb ? Math.min(c.x0, sb.x0) : c.x0) - 3;
    const x1 = Math.ceil(sb ? Math.max(c.x1, sb.x1) : c.x1) + 3;
    return [x0, x1];
  }

  // Clip-Band eines Zahns ober-/unterhalb seiner exakten Grenzlinie
  function bandD(c, toCrown) {
    const seg = SOURCE_CEJ_ARR[c.fdi];
    if (!seg) return "";
    const [x0, x1] = toothSpanX(c);
    const yFar = toCrown ? SPLIT : (c.upper ? -20 : CH + 20);
    let d = "";
    for (let x = x0; x <= x1; x += 2) {
      d += (d ? " L " : "M ") + x + " " + cejYAt(seg, x).toFixed(1);
    }
    d += ` L ${x1} ${yFar} L ${x0} ${yFar} Z`;
    return d;
  }

  function bandRect(c, gradId, cls) {
    const [x0, x1] = toothSpanX(c);
    const r = document.createElementNS(SVGNS, "rect");
    r.setAttribute("x", x0);
    r.setAttribute("width", x1 - x0);
    r.setAttribute("y", c.upper ? 0 : SPLIT);
    r.setAttribute("height", c.upper ? SPLIT : CH - SPLIT);
    r.setAttribute("fill", "url(#" + gradId + ")");
    r.setAttribute("class", cls);
    return r;
  }

  /**
   * Milchzahn (Chef 19.07.2026): kleiner dargestellt als der bleibende Zahn.
   * - 1er-3er: derselbe Zahn, Skalierung 0.8 um die CEJ-Mitte (Krone kuerzer,
   *   Wurzel kuerzer, Girlande passt weiter).
   * - 4er/5er: es gibt KEINE Milch-Praemolaren — an ihrer Stelle steht ein
   *   MILCHMOLAR (Form des 6ers im selben Quadranten, auf Spaltbreite skaliert).
   * - 6er-8er haben keinen Milchzahn-Vorgaenger (applyFindingToTooth blockt).
   * Liefert Geometrie-Quelle + transform (Quellraum -> Anzeige).
   */
  function milkInfo(c) {
    const s = st(c.fdi);
    if (!s || s.missing || !hasMark(s, "milchzahn")) return null;
    const n = (+c.fdi) % 10;
    if (n >= 6) return null;
    let src = c;
    if (n >= 4) {
      const molar = COLS.cols.find((cc) => cc.fdi === (((+c.fdi) / 10) | 0) * 10 + 6);
      if (molar) src = molar;
    }
    const k = src === c
      ? 0.8
      : Math.min(0.9, (0.85 * (c.x1 - c.x0)) / Math.max(1, src.x1 - src.x0));
    const cSeg = SOURCE_CEJ_ARR[c.fdi], sSeg = SOURCE_CEJ_ARR[src.fdi];
    const cMid = (c.x0 + c.x1) / 2, sMid = (src.x0 + src.x1) / 2;
    const cCej = cSeg ? cejYAt(cSeg, cMid) : (c.upper ? SPLIT * 0.75 : SPLIT * 1.25);
    const sCej = sSeg ? cejYAt(sSeg, sMid) : cCej;
    const tx = cMid - k * sMid, ty = cCej - k * sCej;
    return {
      src, k,
      transform: `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(4)})`,
    };
  }

  /**
   * Chirurgische Lage-Befunde (Chef 19.07.2026): Verschiebung/Drehung des
   * ganzen Zahns fuer retiniert / impaktiert / verlagert / Luxation.
   * - retiniert: deutlich tiefer — die Kaukante steht etwa auf Hoehe des
   *   Kieferkamms statt in der Zahnreihe.
   * - impaktiert: komplett im Knochen (Kaukante apikal der Knochenkante);
   *   die Wurzel ist nur rudimentaer (~halbe Laenge, Clip st-impk-<fdi>).
   * - verlagert: Drehung GEGEN den Uhrzeigersinn in 60-Grad-Schritten
   *   (m.verlagert traegt den Winkel in Grad).
   * - Luxation: etwas nach koronal heraus; den schwarzen Alveolen-Spalt
   *   um die Wurzel zeichnet buildPlasticLayer.
   */
  function chirDisplacement(c) {
    const s = st(c.fdi);
    if (!s || s.missing) return null;
    const m = markOf(s);
    const rot = +m.verlagert || 0;
    if (!m.retiniert && !m.impaktiert && !m.luxation && !rot) return null;
    const sb = pathBounds(SIL[c.fdi] || "");
    if (!sb) return null;
    const dirAp = c.upper ? -1 : 1;              // y-Richtung nach apikal
    const incY = c.upper ? sb.y1 : sb.y0;        // Kaukante/Schneidekante
    let dy = 0;
    if (m.retiniert || m.impaktiert) {
      const crest = liveCrestY(c);
      const target = m.impaktiert ? crest + dirAp * 12 : crest - dirAp * 8;
      dy = target - incY;
      // nur einsenken, nie herausheben
      dy = dirAp > 0 ? Math.max(0, dy) : Math.min(0, dy);
    } else if (m.luxation) {
      dy = -dirAp * 10;                          // etwas aus der Alveole heraus
    }
    const parts = [];
    if (dy) parts.push(`translate(0 ${dy.toFixed(1)})`);
    if (rot) {
      const cx = (sb.x0 + sb.x1) / 2, cy = (sb.y0 + sb.y1) / 2;
      parts.push(`rotate(${-rot} ${cx.toFixed(1)} ${cy.toFixed(1)})`);
    }
    return { str: parts.join(" "), impk: !!m.impaktiert, lux: !!m.luxation, rot };
  }

  // Gezackte Bruchkante fuer den Wurzelrest: Zickzack apikal der CEJ —
  // tief genug, dass das Gingiva-Band die Kante nicht verdeckt.
  // clipD haelt nur die Wurzel unterhalb der Kante, edgeD ist die Kante selbst.
  function breakEdge(c, cerv) {
    const [x0, x1] = toothSpanX(c);
    const dirAp = c.upper ? -1 : 1;
    const yFar = c.upper ? -20 : CH + 20;
    let edge = "";
    let i = 0;
    for (let x = x0; x <= x1; x += 9, i++) {
      const y = cerv + dirAp * (i % 2 ? 15 : 7);
      edge += (edge ? " L " : "M ") + x + " " + y.toFixed(1);
    }
    edge += ` L ${x1} ${(cerv + dirAp * 10).toFixed(1)}`;
    return { clipD: edge + ` L ${x1} ${yFar} L ${x0} ${yFar} Z`, edgeD: edge };
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
      // Milchzahn: Original abdecken, Quellzahn (ggf. 6er statt Praemolar)
      // verkleinert an dieselbe CEJ-Position zeichnen (milkInfo)
      const milk = milkInfo(c);
      const gc = milk ? milk.src : c;
      const fdi = gc.fdi;
      const seg = SOURCE_CEJ_ARR[fdi];
      const silD = SIL[fdi];
      const sb = silD ? pathBounds(silD) : null;
      if (!seg || !sb) return;
      let cerv = 0;
      seg.ys.forEach((y) => { cerv += y; });
      cerv /= seg.ys.length;
      const incY = gc.upper ? sb.y1 : sb.y0;
      const apexY = gc.upper ? sb.y0 : sb.y1;
      const w = gc.x1 - gc.x0;

      ensureClip(defs, "st-sil-" + fdi, silD);
      ensureClip(defs, "st-cr-" + fdi, bandD(gc, true));
      ensureClip(defs, "st-rt-" + fdi, bandD(gc, false));
      ensureGrad(defs, "st-cg-" + fdi, "linearGradient",
        { x1: gc.x0, y1: incY, x2: gc.x1, y2: cerv },
        [[0, "#fffdf4"], [0.55, "#efd9b8"], [1, "#c99a68"]]);
      ensureGrad(defs, "st-cs-" + fdi, "radialGradient",
        { cx: gc.cx - w * 0.14, cy: incY + (cerv - incY) * 0.42, r: Math.max(20, w * 0.5) },
        [[0, "rgba(255,255,255,.95)"], [0.5, "rgba(255,255,255,.28)"], [1, "rgba(255,255,255,0)"]]);
      ensureGrad(defs, "st-rx-" + fdi, "linearGradient",
        { x1: gc.x0, y1: 0, x2: gc.x1, y2: 0 },
        [[0, "#a97e5f"], [0.5, "#e4bb94"], [1, "#a97e5f"]]);
      ensureGrad(defs, "st-rc-" + fdi, "linearGradient",
        { x1: gc.x0, y1: 0, x2: gc.x1, y2: 0 },
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
      root.appendChild(bandRect(gc, "st-rx-" + fdi, "studio-root-tone"));
      root.appendChild(bandRect(gc, "st-rc-" + fdi, "studio-root-cyl"));
      root.appendChild(bandRect(gc, "st-ry-" + fdi, "studio-root-depth"));
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

      const m = markOf(st(c.fdi));
      if (m.wurzelrest) {
        // Wurzelrest (Chef 19.07.2026): Krone entfernt, die Wurzel endet
        // knapp apikal der CEJ in einer gezackten "abgebrochenen" Kante
        const jag = breakEdge(gc, cerv);
        ensureClip(defs, "st-wr-" + fdi, jag.clipD);
        const wr = document.createElementNS(SVGNS, "g");
        wr.setAttribute("clip-path", "url(#st-wr-" + fdi + ")");
        wr.appendChild(root);
        silG.appendChild(wr);
        const edge = mkPath(jag.edgeD, "wr-edge", "none");
        edge.setAttribute("stroke", "rgba(58,38,24,.9)");
        edge.setAttribute("stroke-width", "1.6");
        edge.setAttribute("stroke-linejoin", "round");
        silG.appendChild(edge);
      } else {
        silG.appendChild(root);
        const crown = document.createElementNS(SVGNS, "g");
        crown.setAttribute("clip-path", "url(#st-cr-" + fdi + ")");
        crown.appendChild(bandRect(gc, "st-cg-" + fdi, "studio-crown-fill"));
        crown.appendChild(mkImg("studio-crown-anat"));
        crown.appendChild(bandRect(gc, "st-cs-" + fdi, "studio-crown-shine"));
        silG.appendChild(crown);
      }

      if (m.fraktur) {
        // frakturierter Zahn: diagonale Trennung von oben links nach unten
        // rechts durch Krone UND Wurzel, mit sichtbarem Spalt (Hintergrund-
        // Farbe) und dunklem Randschatten — an die Silhouette geclippt
        const d = `M ${(sb.x0 - 3).toFixed(1)} ${(sb.y0 - 3).toFixed(1)} ` +
          `L ${(sb.x1 + 3).toFixed(1)} ${(sb.y1 + 3).toFixed(1)}`;
        const shade = mkPath(d, "frx-shade", "none");
        shade.setAttribute("stroke", "rgba(30,18,10,.55)");
        shade.setAttribute("stroke-width", "7");
        silG.appendChild(shade);
        const gapP = mkPath(d, "frx-gap", "none");
        gapP.setAttribute("stroke", MISS_BG);
        gapP.setAttribute("stroke-width", "4");
        silG.appendChild(gapP);
      }

      if (m.luxation) {
        // Zahnluxation: deutlicher SCHWARZER Spalt rund um die Wurzel
        // (verbreiterter Parodontalspalt der herausgehobenen Alveole).
        // Liegt VOR silG im tooth-g -> wandert mit der Verschiebung mit;
        // die Zahn-Malerei deckt den inneren Stroke-Anteil wieder ab.
        const halo = document.createElementNS(SVGNS, "g");
        halo.setAttribute("clip-path", "url(#st-rt-" + fdi + ")");
        const hp = (d) => {
          const p = mkPath(d, "lux-halo", "rgba(8,6,4,.85)");
          p.setAttribute("stroke", "rgba(8,6,4,.85)");
          p.setAttribute("stroke-width", "9");
          p.setAttribute("stroke-linejoin", "round");
          halo.appendChild(p);
        };
        hp(silD);
        (EXTRA_ROOTS[fdi] || []).forEach((d) => hp(d));
        tooth.insertBefore(halo, silG);
      }

      if (m.impaktiert) {
        // impaktierter Zahn: Wurzel nicht ausgeformt — nur ~halbe Laenge
        const rootLen = Math.abs(apexY - cerv);
        const cutY = cerv + (gc.upper ? -1 : 1) * rootLen * 0.5;
        const [ix0, ix1] = toothSpanX(gc);
        const yTop = gc.upper ? cutY : SPLIT - 20;
        const yBot = gc.upper ? SPLIT + 20 : cutY;
        ensureClip(defs, "st-impk-" + fdi,
          `M ${ix0 - 24} ${yTop.toFixed(1)} L ${ix1 + 24} ${yTop.toFixed(1)} ` +
          `L ${ix1 + 24} ${yBot.toFixed(1)} L ${ix0 - 24} ${yBot.toFixed(1)} Z`);
        const iw = document.createElementNS(SVGNS, "g");
        iw.setAttribute("clip-path", "url(#st-impk-" + fdi + ")");
        tooth.removeChild(silG);
        iw.appendChild(silG);
        tooth.appendChild(iw);
      }

      const disp = chirDisplacement(c);
      const tf = [disp && disp.str, milk && milk.transform].filter(Boolean).join(" ");
      // Original-Zahn der Basiszeichnung wird per missMask auf #teethImg
      // ausgeblendet (rebuildTeethMask) — kein Uebermalen mehr
      if (tf) tooth.setAttribute("transform", tf);
      layer.appendChild(tooth);
    });
    svgEl.insertBefore(layer, svgEl.querySelector("#boneLayer"));
  }

  // Gingiva-Randlinie je Kiefer: ueber jedem Zahn EXAKT die Grenzlinie,
  // zwischen den Zaehnen weiche Papillen Richtung Kontaktpunkt, ueber
  // Zahnluecken flacher Kieferkamm, distal Ueberblendung auf die
  // Original-Saumlinie bis zum Knochenende.
  // Gingiva-Band endet kurz distal der Weisheitszaehne mit runder Kappe.
  // NICHT ueber den ganzen retromolaren Knochen ziehen: dort steigt der
  // Kamm steil an und bone-edge.json hat je Quadrant Luecken — die lange
  // "Verlaengerung" schwebte deshalb ueber bzw. unter dem Knochen.
  const GUM_EXT = 16;
  function gumRangeX(upper) {
    const e = BONE_EDGE && BONE_EDGE[upper ? "up" : "lo"];
    const b0 = e ? e.x0 : 0, b1 = e ? e.x1 : CW - 1;
    const cols = (COLS && COLS.cols)
      ? COLS.cols.filter((c) => !!c.upper === upper)
      : [];
    let t0 = Infinity, t1 = -Infinity;
    cols.forEach((c) => {
      const seg = SOURCE_CEJ_ARR[c.fdi];
      if (!seg) return;
      t0 = Math.min(t0, seg.x0);
      t1 = Math.max(t1, seg.x0 + seg.ys.length - 1);
    });
    if (!Number.isFinite(t0)) return e ? [b0, b1] : (upper ? GUM_X.up : GUM_X.lo);
    return [
      Math.max(0, Math.max(b0, Math.floor(t0 - GUM_EXT))),
      Math.min(CW - 1, Math.min(b1, Math.ceil(t1 + GUM_EXT))),
    ];
  }

  /**
   * Gingiva-Margin. liveCrest = Knochenkante inkl. Abbau/Extraktion.
   * extractMask[x]=1: Margin liegt bereits auf dem Live-Kamm (kein zweites LOSS).
   */
  function gumMarginArr(cols, base, upper, liveCrest, extractMask, papMask, sagArr) {
    const crownward = upper ? 1 : -1;
    const [gx0, gx1] = gumRangeX(upper);
    const boneEdge = BONE_EDGE && BONE_EDGE[upper ? "up" : "lo"];
    const healthy = upper ? BONE_UP : BONE_LO;
    const crestAt = (x) => {
      const cx = Math.max(0, Math.min(CW - 1, x));
      if (liveCrest && Number.isFinite(liveCrest[cx])) return liveCrest[cx];
      if (healthy && Number.isFinite(healthy[cx])) return healthy[cx];
      if (boneEdge && boneEdge.edge[cx] != null) return boneEdge.edge[cx];
      return base[cx];
    };
    const target = (x) => crestAt(x) + crownward * 4;
    // Extraktionskamm: Gingiva folgt Live-Knochenoberkante
    const ridgeAt = (x) => crestAt(x) + crownward * 2.5;

    const arr = new Array(CW).fill(NaN);
    const segs = [];
    cols.forEach((c) => {
      const s = st(c.fdi);
      const seg = SOURCE_CEJ_ARR[c.fdi];
      if (!seg) return;
      if (s && s.missing && !markOf(s).implantat) {
        // Brueckenglied: Zahnfleisch schmiegt sich an die Pontic-Krone
        // (CEJ-Saum wie am echten Zahn), kein Extraktionskamm
        if (markOf(s).brueckenglied) {
          segs.push({ x0: seg.x0, x1: seg.x0 + seg.ys.length - 1, seg });
          for (let i = 0; i < seg.ys.length; i++) arr[seg.x0 + i] = seg.ys[i];
          return;
        }
        for (let i = 0; i < seg.ys.length; i++) {
          const x = seg.x0 + i;
          if (x < 0 || x >= CW) continue;
          // seichte Welle statt Brett: der zahnlose Kamm sackt pro Zahn
          // leicht ein (Chef 20.07.: "deutlich flacher, wie eine seichte Welle")
          const t = seg.ys.length > 1 ? i / (seg.ys.length - 1) : 0.5;
          const sag = 2.2 * Math.sin(Math.PI * t);
          arr[x] = ridgeAt(x) - crownward * sag;
          if (extractMask) extractMask[x] = 1;
          if (sagArr) sagArr[x] = sag;
        }
        return;
      }
      if (s && s.missing) return; // Implantat: kein CEJ-Saum
      // retiniert/impaktiert: Zahn liegt (fast) im Knochen — die Gingiva
      // laeuft flach ueber die Stelle wie ueber eine Zahnluecke
      if (s && (hasMark(s, "retiniert") || hasMark(s, "impaktiert"))) {
        for (let i = 0; i < seg.ys.length; i++) {
          const x = seg.x0 + i;
          if (x < 0 || x >= CW) continue;
          arr[x] = ridgeAt(x);
          if (extractMask) extractMask[x] = 1;
        }
        return;
      }
      segs.push({ x0: seg.x0, x1: seg.x0 + seg.ys.length - 1, seg });
      for (let i = 0; i < seg.ys.length; i++) arr[seg.x0 + i] = seg.ys[i];
    });
    segs.sort((a, b) => a.x0 - b.x0);

    for (let i = 0; i + 1 < segs.length; i++) {
      const L = segs[i], R = segs[i + 1];
      const gap = R.x0 - L.x1;
      if (gap < 4) continue;
      if (gap > 55) {
        for (let x = L.x1 + 1; x < R.x0; x++) {
          if (Number.isFinite(arr[x])) continue;
          arr[x] = ridgeAt(x);
          if (extractMask) extractMask[x] = 1;
        }
        continue;
      }
      const yL = L.seg.ys[L.seg.ys.length - 1];
      const yR = R.seg.ys[0];
      // Papille laenger + spitzer (Feedback 22 distal: zu rund/kurz →
      // schwarzes Dreieck im Interdentalraum). Geschaerftes Sinus-Profil;
      // papMask merkt die Spitze fuer die Re-Injektion nach der Glaettung.
      const amp = Math.min(6.5, gap * 0.42);
      for (let x = L.x1 + 1; x < R.x0; x++) {
        if (Number.isFinite(arr[x])) continue;
        const t = (x - L.x1) / gap;
        const prof = Math.pow(Math.sin(Math.PI * t), 1.5);
        arr[x] = yL + (yR - yL) * t + crownward * amp * prof;
        if (papMask) papMask[x] = Math.max(papMask[x] || 0, prof);
      }
    }

    if (!segs.length) {
      for (let x = gx0; x <= gx1; x++) {
        arr[x] = target(x);
        if (extractMask) extractMask[x] = 1;
      }
      return arr;
    }
    const filledXs = [];
    for (let x = gx0; x <= gx1; x++) if (Number.isFinite(arr[x])) filledXs.push(x);
    if (!filledXs.length) {
      for (let x = gx0; x <= gx1; x++) arr[x] = target(x);
      return arr;
    }
    const first = filledXs[0], last = filledXs[filledXs.length - 1];
    let prev = first;
    for (let x = first + 1; x <= last; x++) {
      if (!Number.isFinite(arr[x])) continue;
      for (let j = prev + 1; j < x; j++) {
        if (Number.isFinite(arr[j])) continue;
        // zwischen gesetzt: wenn Extrakt in der Naehe → Kamm, sonst lerp
        if (extractMask && (extractMask[prev] || extractMask[x])) {
          arr[j] = ridgeAt(j);
          extractMask[j] = 1;
        } else {
          arr[j] = arr[prev] + (arr[x] - arr[prev]) * (j - prev) / (x - prev);
        }
      }
      prev = x;
    }

    // Girlanden flachen an Extraktionsluecken ab (Chef 19.07.2026): die
    // Papille des Nachbarzahns zur Luecke hin wird weich auf den Kieferkamm
    // gesenkt. DEUTLICH flach (Chef 20.07.: "seichte Welle"): breite Zone,
    // Gewicht zum Kamm hin verstaerkt und Rest-Hoecker zusaetzlich gedeckelt.
    if (extractMask) {
      const FLAT = 38;                       // Einflusszone im Nachbarzahn (px)
      const easeT = (t) => t * t * (3 - 2 * t);
      const nearExtract = (edge, dirOut) => {
        for (let k = 1; k <= 14; k++) {
          const x = edge + dirOut * k;
          if (x < 0 || x >= CW) return false;
          if (extractMask[x]) return true;
        }
        return false;
      };
      segs.forEach((sg) => {
        [[sg.x0, -1], [sg.x1, 1]].forEach(([edge, dirOut]) => {
          if (!nearExtract(edge, dirOut)) return;
          for (let k = 0; k <= FLAT; k++) {
            const x = edge - dirOut * k;
            if (x < sg.x0 || x > sg.x1 || x < 0 || x >= CW) break;
            let w = easeT(1 - k / FLAT);
            w = 1 - (1 - w) * (1 - w);       // frueh Richtung Kamm ziehen
            arr[x] = arr[x] * (1 - w) + ridgeAt(x) * w;
            // Deckel: koronaler Rest-Hoecker waechst nur langsam mit dem
            // Abstand zur Luecke — kein spitzer Papillen-Zipfel am Rand
            const lim = 1.2 + (k / FLAT) * 6.5;
            const dev = (arr[x] - ridgeAt(x)) * crownward;
            if (dev > lim) arr[x] = ridgeAt(x) + crownward * lim;
          }
        });
      });
    }
    // Kurze Endkappe distal der 8er: in GUM_EXT px weich auf den
    // Knochenkamm absetzen (Band endet dort, siehe gumRangeX)
    const FADE = Math.max(8, GUM_EXT - 2);
    const ease = (t) => t * t * (3 - 2 * t);
    for (let x = gx0; x < first; x++) {
      const t = ease(Math.min(1, (first - x) / FADE));
      arr[x] = (1 - t) * arr[first] + t * ridgeAt(x);
      if (extractMask && t > 0.5) extractMask[x] = 1;
    }
    for (let x = last + 1; x <= gx1; x++) {
      const t = ease(Math.min(1, (x - last) / FADE));
      arr[x] = (1 - t) * arr[last] + t * ridgeAt(x);
      if (extractMask && t > 0.5) extractMask[x] = 1;
    }
    return arr;
  }

  function catmullD(pts) {
    if (pts.length < 3) return "";
    // Endpunkte verdoppeln → kein Catmull-Ueberschwinger an den Raendern
    // (Nadelspitze distal der Weisheitszaehne)
    const p = [pts[0]].concat(pts, pts[pts.length - 1]);
    let d = `M ${p[1].x.toFixed(1)} ${p[1].y.toFixed(2)}`;
    for (let i = 1; i < p.length - 2; i++) {
      const p0 = p[i - 1], p1 = p[i];
      const p2 = p[i + 1], p3 = p[i + 2];
      let c1x = p1.x + (p2.x - p0.x) / 6;
      let c1y = p1.y + (p2.y - p0.y) / 6;
      let c2x = p2.x - (p3.x - p1.x) / 6;
      let c2y = p2.y - (p3.y - p1.y) / 6;
      // y-Controls mit TOLERANZ klemmen: harte Klemmung [p1.y,p2.y] machte
      // aus runden Molaren-Boegen eckige Polygonzuege (jeder Flanken-
      // Uebergang wurde plattgedrueckt). Etwas Ueberschwingen ist noetig
      // fuer runde Boegen; die Schranke verhindert weiterhin Spike-Loops.
      const yLo = Math.min(p1.y, p2.y), yHi = Math.max(p1.y, p2.y);
      const pad = 0.35 * (yHi - yLo) + 0.6;
      c1y = Math.max(yLo - pad, Math.min(yHi + pad, c1y));
      c2y = Math.max(yLo - pad, Math.min(yHi + pad, c2y));
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(2)} ` +
        `${c2x.toFixed(1)} ${c2y.toFixed(2)} ` +
        `${p2.x.toFixed(1)} ${p2.y.toFixed(2)}`;
    }
    return d;
  }

  function marginPoints(margin, gx0, gx1) {
    // 2-px-Raster PLUS lokale Extrema: sonst verfehlt das Raster die
    // Papillenspitze um 1-2 px und die Catmull-Kurve stumpft sie ab
    const pts = [];
    let lastX = -Infinity;
    for (let x = gx0; x <= gx1; x++) {
      const isPeak = x > gx0 && x < gx1
        && (margin[x] - margin[x - 1]) * (margin[x + 1] - margin[x]) < 0
        && Math.abs(margin[x + 1] - margin[x - 1]) +
           Math.abs(margin[x] - margin[x - 1]) > 0.08;
      if (x === gx0 || x === gx1 || isPeak || x - lastX >= 2) {
        pts.push({ x, y: margin[x] });
        lastX = x;
      }
    }
    return pts;
  }

  function buildGumLayer(defs, liveUp, liveLo) {
    const gumLayer = svgEl.querySelector("#gumLayer");
    if (!gumLayer) return;
    gumLayer.textContent = "";
    [
      { cols: upperCols(), base: BASE_UP, upper: true, key: "up", live: liveUp },
      { cols: lowerCols(), base: BASE_LO, upper: false, key: "lo", live: liveLo },
    ].forEach(({ cols, base, upper, key, live }) => {
      const crownward = upper ? 1 : -1;
      const apicalDir = upper ? -1 : 1;
      const [gx0, gx1] = gumRangeX(upper);
      const extractMask = new Array(CW).fill(0);
      const papMask = new Array(CW).fill(0);
      const sagArr = new Array(CW).fill(0);
      const raw = gumMarginArr(cols, base, upper, live, extractMask, papMask, sagArr);
      // Par-Abbau nur an vorhandenen Zaehnen; Extraktionskamm ist schon live
      const lossArr = LOSS_PX[key] || new Array(CW).fill(0);
      for (let x = 0; x < CW; x++) {
        if (!Number.isFinite(raw[x]) || extractMask[x]) continue;
        raw[x] += apicalDir * (lossArr[x] || 0);
      }
      // ausserhalb des Bandes mit Randwerten fuellen, damit die Glaettung sauber laeuft
      for (let x = 0; x < gx0; x++) raw[x] = raw[gx0];
      for (let x = gx1 + 1; x < CW; x++) raw[x] = raw[gx1];
      // weich glaetten; Extraktionskamm + retromolar danach sanft auf Kamm
      const margin = smoothArr(smoothArr(raw, 9), 7);
      // Papillenspitzen re-injizieren: die Glaettung buegelt sie sonst rund
      // und kurz (schwarzes Dreieck interdental, Feedback 22 distal)
      for (let x = gx0; x <= gx1; x++) {
        const w = papMask[x] * 0.9;
        if (w > 0) margin[x] = margin[x] * (1 - w) + raw[x] * w;
      }
      // Molaren/Praemolaren: Girlande aktiv rund formen. Die CEJ-Quelllinie
      // ist dort flach + wellig (Ecken statt Bogen, Feedback 20.07.). Pro
      // Zahn wird die Margin gegen einen idealen Bogen geblendet: Endpunkte
      // (Papillen-Anschluss) bleiben exakt, der Zenit liegt mittig apikal.
      cols.forEach((c) => {
        const digit = c.fdi % 10;
        if (digit < 4) return;                 // Front behaelt CEJ-Form
        const s = st(c.fdi);
        if (s && (s.missing || hasMark(s, "retiniert") || hasMark(s, "impaktiert"))) return;
        const seg = SOURCE_CEJ_ARR[c.fdi];
        if (!seg) return;
        const x0 = Math.max(gx0, seg.x0);
        const x1 = Math.min(gx1, seg.x0 + seg.ys.length - 1);
        const w = x1 - x0;
        if (w < 14) return;
        let wgt = digit >= 6 ? 0.85 : 0.5;
        for (let x = x0; x <= x1; x++) {
          if (extractMask[x]) { wgt *= 0.5; break; } // neben Luecke sanfter
        }
        const yL = margin[x0], yR = margin[x1];
        // Amplitude: NIE unter der anatomischen Mindest-Bogentiefe und NIE
        // flacher als der Bestand. Molaren liefern aus dem Raster eine fast
        // flache CEJ, und die Interdental-Papillen sind dort winzig — die
        // Sehne (yL->yR) liegt quasi AUF dem Zenit, der Bogen wurde
        // horizontal (Chef 20.07.: "verliert die Bogenform"). Mindesttiefe
        // deshalb kraeftig und breitenskaliert; apikal ist sicher (nie auf
        // die Krone). Bestehende tiefe Boegen (Praemolaren) nicht deckeln.
        let D = 0;
        for (let x = x0 + 1; x < x1; x++) {
          const t = (x - x0) / w;
          D = Math.max(D, apicalDir * (margin[x] - (yL + (yR - yL) * t)));
        }
        const minA = digit >= 6 ? Math.max(12, w * 0.2) : 6;
        const A = Math.min(18, Math.max(minA, D));
        const easeW = (t) => { const u = Math.min(1, t / 0.26); return u * u * (3 - 2 * u); };
        for (let x = x0 + 1; x < x1; x++) {
          const t = (x - x0) / w;
          const arc = yL + (yR - yL) * t
            + apicalDir * A * Math.sin(Math.PI * t);
          // Randzonen (Papillenflanken) original lassen, Mitte runden
          const w2 = wgt * easeW(Math.min(t, 1 - t));
          margin[x] = margin[x] * (1 - w2) + arc * w2;
        }
      });
      // Zenit-Boegen extra runden — NUR ausserhalb der Papillen, damit
      // deren Spitzen stehen bleiben
      {
        const tmp = margin.slice();
        for (let x = gx0 + 2; x <= gx1 - 2; x++) {
          if (papMask[x] > 0.12) continue;
          margin[x] = (tmp[x - 2] + tmp[x - 1] * 2 + tmp[x] * 3 +
            tmp[x + 1] * 2 + tmp[x + 2]) / 9;
        }
      }
      const crestY = (x) => {
        const cx = Math.max(0, Math.min(CW - 1, x));
        if (live && Number.isFinite(live[cx])) return live[cx];
        if (base && Number.isFinite(base[cx])) return base[cx];
        return margin[cx];
      };
      let tooth0 = Infinity, tooth1 = -Infinity;
      cols.forEach((c) => {
        const seg = SOURCE_CEJ_ARR[c.fdi];
        if (!seg) return;
        tooth0 = Math.min(tooth0, seg.x0);
        tooth1 = Math.max(tooth1, seg.x0 + seg.ys.length - 1);
      });
      if (!Number.isFinite(tooth0)) { tooth0 = gx0; tooth1 = gx1; }
      const easeR = (t) => t * t * (3 - 2 * t);
      const FADE_R = 14;
      for (let x = gx0; x <= gx1; x++) {
        const ridge = crestY(x) + crownward * 2.5;
        if (extractMask[x] && x >= tooth0 && x <= tooth1) {
          // seichte Welle ueber der Luecke erhalten (sagArr), kein Brett
          margin[x] = ridge - crownward * (sagArr[x] || 0);
          continue;
        }
        if (x < tooth0) {
          const t = easeR(Math.min(1, (tooth0 - x) / FADE_R));
          margin[x] = (1 - t) * margin[tooth0] + t * ridge;
        } else if (x > tooth1) {
          const t = easeR(Math.min(1, (x - tooth1) / FADE_R));
          margin[x] = (1 - t) * margin[tooth1] + t * ridge;
        }
      }
      // Retromolar noch einmal leicht glaetten (keine Kanten)
      {
        const tmp = margin.slice();
        for (let x = gx0 + 1; x < tooth0; x++) {
          margin[x] = (tmp[x - 1] + tmp[x] * 2 + tmp[x + 1]) / 4;
        }
        for (let x = tooth1 + 1; x < gx1; x++) {
          margin[x] = (tmp[x - 1] + tmp[x] * 2 + tmp[x + 1]) / 4;
        }
      }

      // Apikale Kante: folgt NICHT den Papillen nach koronal, sondern einer
      // geglaetteten Zenit-Huellkurve (erodiertes Margin-Profil). Unter den
      // Papillen bleibt so ein deutlich breiterer Saum stehen; an den
      // Zahnhaelsen misst das Band weiterhin GUM_H. Endkappen kurz halten —
      // lange CAP + steiler Ast = Nadelspitze.
      const ERO = 35;   // halbe Fensterbreite ~ Zahnteilung/2 (Papille erfasst)
      const env = new Array(CW);
      for (let x = 0; x < CW; x++) {
        const a = Math.max(gx0, x - ERO), b = Math.min(gx1, x + ERO);
        let m = margin[Math.max(gx0, Math.min(gx1, x))];
        for (let i = a; i <= b; i++) {
          m = upper ? Math.min(m, margin[i]) : Math.max(m, margin[i]);
        }
        env[x] = m;
      }
      const envSm = smoothArr(env, 21);
      // Apikale Kante: BOGENFOERMIG kongruent zur CEJ-Girlande (Chef 20.07.:
      // auch die apikale Seite muss die Bogenform zeigen, nicht horizontal).
      // Die Zenit-Boegen werden stark mitgefahren (Rate ~0.85), die Papillen-
      // Spitzen laufen aber in eine Saettigung — unter den Papillen bleibt
      // der breite Saum erhalten (Anforderung 20.07. frueher am Tag).
      const SAT = GUM_H * 0.55;   // maximale Anhebung unter Papillen (px)
      const RATE = 0.85;          // Kongruenz an den Bogen-Flanken
      const apical = new Array(CW);
      const CAP = 8;
      for (let x = 0; x < CW; x++) {
        const edge = Math.max(0, Math.min(x - gx0, gx1 - x));
        let h = GUM_H;
        if (edge < CAP) {
          const t = edge / CAP;
          h *= Math.max(0.2, Math.sqrt(t * (2 - t)));
        }
        const devCor = Math.max(0, (margin[x] - envSm[x]) * crownward);
        const rise = SAT * (1 - Math.exp(-(RATE * devCor) / SAT));
        const y = envSm[x] + apicalDir * h + crownward * rise;
        apical[x] = upper
          ? Math.min(y, margin[x] - 2.5)
          : Math.max(y, margin[x] + 2.5);
      }

      // beide Raender mit derselben Catmull-Rom-Kurve -> kongruente Girlanden
      const ptsCor = marginPoints(margin, gx0, gx1);
      const ptsAp = marginPoints(apical, gx0, gx1).reverse();
      const dEdge = catmullD(ptsCor);
      const dAp = catmullD(ptsAp);
      const dBody = dEdge + " " + dAp.replace(/^M/, "L") + " Z";

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
      // apikale Naht = dieselbe Kurvenform (nur versetzt) -> Kongruenz sichtbar
      const seamAp = document.createElementNS(SVGNS, "path");
      seamAp.setAttribute("d", catmullD(marginPoints(apical, gx0, gx1)));
      seamAp.setAttribute("class", "gum-seam gum-seam-ap");
      g.appendChild(seamAp);

      // Geometrie merken: Konkremente-Roetung muss EXAKT in diesem Band bleiben
      GUM_GEO[key] = { margin, apical, gx0, gx1, dBody };

      // Entzuendungs-Rot bei Konkrementen: INNERHALB der Gingiva-Gruppe
      // (clip = Girlande), Peak in der Bogenmitte, nach aussen ausfadend
      const inflamHost = document.createElementNS(SVGNS, "g");
      inflamHost.setAttribute("clip-path", "url(#gum-clip-" + key + ")");
      inflamHost.setAttribute("class", "gum-inflam-host");
      cols.forEach((c) => {
        const s = st(c.fdi);
        if (!s || s.missing || !hasMark(s, "konkremente")) return;
        const midX = (c.x0 + c.x1) / 2;
        const half = Math.max(10, (c.x1 - c.x0) * 0.55 + 4);
        const xL = Math.max(gx0, Math.floor(midX - half));
        const xR = Math.min(gx1, Math.ceil(midX + half));
        let dInf = "";
        for (let x = xL; x <= xR; x += 2) {
          dInf += (dInf ? " L " : "M ") + x + " " + margin[x].toFixed(1);
        }
        for (let x = xR; x >= xL; x -= 2) {
          dInf += ` L ${x} ${apical[x].toFixed(1)}`;
        }
        ensureGrad(defs, "bef-inflam-" + c.fdi, "linearGradient",
          { x1: xL, y1: 0, x2: xR, y2: 0 },
          [
            [0, "#c81830", 0],
            [0.2, "#c81830", 0.12],
            [0.5, "#a80e24", 0.72],
            [0.8, "#c81830", 0.12],
            [1, "#c81830", 0],
          ]);
        inflamHost.appendChild(
          mkPath(dInf + " Z", "bef-konk-inflam", "url(#bef-inflam-" + c.fdi + ")"));
      });
      if (inflamHost.childNodes.length) g.appendChild(inflamHost);

      gumLayer.appendChild(g);
    });
  }

  // ---------------------------------------------------------------------
  // Prophylaxe-Overlays (Konzept aus struktur01 NACHGEBAUT, nicht kopiert):
  // jede Markierung wird an der ECHTEN Geometrie verankert (CEJ-Linie,
  // Silhouetten- und Kronen-/Wurzelband-Clips) und im Studio-Warm-Stil
  // gezeichnet.
  //
  // Logische Stack-Reihenfolge (unten → oben):
  //   plastic → befundDeep (WF, Implantat-Schraube) → bone → echo →
  //   befundApex (CAP/WSR, Konkremente) → gum → befundLayer (Krone/Flaechen/
  //   Badges) → hitLayer
  // ---------------------------------------------------------------------

  function befGroup(c, toCrown) {
    const outer = document.createElementNS(SVGNS, "g");
    outer.setAttribute("clip-path", "url(#st-sil-" + c.fdi + ")");
    const inner = document.createElementNS(SVGNS, "g");
    inner.setAttribute("clip-path", "url(#st-" + (toCrown ? "cr" : "rt") + "-" + c.fdi + ")");
    outer.appendChild(inner);
    return { outer, inner };
  }

  function mkPath(d, cls, fill) {
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", d);
    if (cls) p.setAttribute("class", cls);
    if (fill) p.setAttribute("fill", fill);
    return p;
  }

  // geschlossene, weiche Fleckform um (cx, cy) mit Radius rad
  function blobD(cx, cy, rad, rx, squash) {
    const n = 8, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = rad * (0.72 + 0.55 * rx());
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * (squash || 0.8) });
    }
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ` +
        `${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ` +
        `${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d + " Z";
  }

  // Plaque: typische Faerbe-Tabletten-Blau (Disclosing) am Zahnhals
  function drawPlaque(c, seg) {
    const { outer, inner } = befGroup(c, true);
    const cw = c.upper ? 1 : -1;
    const r = rng(c.fdi * 101 + 7);
    const ph1 = r() * 6, ph2 = r() * 6;
    const x0 = seg.x0 + 1, x1 = seg.x0 + seg.ys.length - 2;
    const edgeY = (x) =>
      cejYAt(seg, x) + cw * (8.5 + 3.2 * Math.sin(x * 0.21 + ph1) + 2.1 * Math.sin(x * 0.47 + ph2));
    let d = "", back = "";
    for (let x = x0; x <= x1; x += 3) {
      d += (d ? " L " : "M ") + x + " " + (cejYAt(seg, x) + cw * 0.8).toFixed(1);
    }
    for (let x = x1; x >= x0; x -= 3) back += ` L ${x} ${edgeY(x).toFixed(1)}`;
    inner.appendChild(mkPath(d + back + " Z", "bef-plaque"));
    let fr = "";
    for (let x = x0; x <= x1; x += 3) fr += (fr ? " L " : "M ") + x + " " + edgeY(x).toFixed(1);
    inner.appendChild(mkPath(fr, "bef-plaque-fringe"));
    for (let i = 0; i < 9; i++) {
      const px = x0 + (x1 - x0) * r();
      const py = cejYAt(seg, px) + cw * (2.5 + 5.5 * r());
      const dot = document.createElementNS(SVGNS, "circle");
      dot.setAttribute("cx", px.toFixed(1));
      dot.setAttribute("cy", py.toFixed(1));
      dot.setAttribute("r", (0.85 + 1.15 * r()).toFixed(2));
      dot.setAttribute("class", "bef-plaque-dot");
      inner.appendChild(dot);
    }
    return outer;
  }

  // Zahnstein: girlandenfoermige Kruste am Saum, einheitliches Gelb (OK = UK)
  function drawZahnstein(c, seg) {
    const { outer, inner } = befGroup(c, true);
    const cw = c.upper ? 1 : -1;
    const r = rng(c.fdi * 131 + 3);
    const x0 = seg.x0 + 1, x1 = seg.x0 + seg.ys.length - 2;
    const ZS_YELLOW = "#ffe24a";
    let d = "";
    for (let x = x0; x <= x1; x += 3) {
      d += (d ? " L " : "M ") + x + " " + (cejYAt(seg, x) - cw * 3.2).toFixed(1);
    }
    for (let x = x1; x >= x0; x -= 3) {
      const lump = Math.abs(Math.sin(x * 0.55 + r() * 0.9)) * (5.2 + 4.8 * r());
      d += ` L ${x} ${(cejYAt(seg, x) + cw * (3.4 + lump)).toFixed(1)}`;
    }
    inner.appendChild(mkPath(d + " Z", "bef-zs", ZS_YELLOW));
    [x0 + 3, x1 - 3].forEach((px) => {
      inner.appendChild(mkPath(
        blobD(px, cejYAt(seg, px) + cw * 3.0, 4.6 + 2.2 * r(), r, 0.7),
        "bef-zs", ZS_YELLOW));
    });
    return outer;
  }

  // Konkremente: schmale schwarze Girlanden-Linie UNTERHALB der CEJ
  // (wie Zahnstein, nur topographisch wurzelwaerts; Roetung in buildGumLayer)
  function drawKonkremente(c, seg) {
    const { outer, inner } = befGroup(c, false);
    const rootward = c.upper ? -1 : 1;
    const r = rng(c.fdi * 173 + 11);
    const x0 = seg.x0 + 1, x1 = seg.x0 + seg.ys.length - 2;
    const KONK = "#1c120a";
    let d = "";
    // Oberkante knapp apikal der Schmelz-Zement-Grenze
    for (let x = x0; x <= x1; x += 3) {
      d += (d ? " L " : "M ") + x + " " + (cejYAt(seg, x) + rootward * 1.4).toFixed(1);
    }
    // Girlanden-Linie unter CEJ, etwas laenger in der Hoehe
    for (let x = x1; x >= x0; x -= 3) {
      const lump = Math.abs(Math.sin(x * 0.6 + r() * 0.8)) * (2.4 + 2.4 * r());
      d += ` L ${x} ${(cejYAt(seg, x) + rootward * (5.8 + lump)).toFixed(1)}`;
    }
    inner.appendChild(mkPath(d + " Z", "bef-konk", KONK));
    [x0 + 3, x1 - 3].forEach((px) => {
      inner.appendChild(mkPath(
        blobD(px, cejYAt(seg, px) + rootward * 4.8, 2.8 + 1.4 * r(), r, 0.7),
        "bef-konk", KONK));
    });
    return outer;
  }

  // Verfaerbungen: starten in den Zahnzwischenraeumen, nach innen abnehmend,
  // viele funkelnde Punkte
  function drawVerf(c, seg) {
    const { outer, inner } = befGroup(c, true);
    const cw = c.upper ? 1 : -1;
    const r = rng(c.fdi * 211 + 5);
    const x0 = seg.x0 + 1, x1 = seg.x0 + seg.ys.length - 2;
    const mid = (x0 + x1) / 2;
    const half = Math.max(6, (x1 - x0) / 2);
    const sides = [
      { edge: x0, dir: 1 },
      { edge: x1, dir: -1 },
    ];
    sides.forEach(({ edge, dir }) => {
      const n = 22 + Math.floor(r() * 10);
      for (let i = 0; i < n; i++) {
        const t = Math.pow(r(), 1.55);          // 0 = Rand, 1 = Mitte
        const px = edge + dir * t * half * 0.92;
        const dist = Math.abs(px - mid) / half; // 1 am Rand, 0 in Mitte
        const dens = 0.25 + 0.75 * dist;
        if (r() > dens) continue;
        const py = cejYAt(seg, px) + cw * (3 + 16 * Math.pow(r(), 0.85));
        const spark = r() > 0.72;
        const rad = spark ? (0.45 + 0.7 * r()) : (0.7 + 1.5 * r() * dens);
        const circ = document.createElementNS(SVGNS, "circle");
        circ.setAttribute("cx", px.toFixed(1));
        circ.setAttribute("cy", py.toFixed(1));
        circ.setAttribute("r", rad.toFixed(2));
        circ.setAttribute("class", spark ? "bef-verf-spark" : "bef-verf");
        if (!spark) {
          const a = (0.28 + 0.4 * dens).toFixed(2);
          const tones = [
            `rgba(92,52,22,${a})`,
            `rgba(70,38,14,${a})`,
            `rgba(48,26,10,${(a * 1.1).toFixed(2)})`,
          ];
          circ.setAttribute("fill", tones[Math.floor(r() * 3)]);
        }
        inner.appendChild(circ);
      }
    });
    return outer;
  }

  // Chart zeigt gesetzte Befunde immer (struktur01-Runtime); Legende filtert nur die Tiles
  function vis(/* id */) {
    return true;
  }

  /** Schneide-/Kaukante und CEJ-Mitte fuer Porzellan-Zeichnungen. */
  function porcelainGeom(c) {
    const fdi = c.fdi;
    const silD = SIL[fdi];
    const seg = SOURCE_CEJ_ARR[fdi];
    if (!silD || !seg) return null;
    const [x0, x1] = toothSpanX(c);
    const sb = pathBounds(silD);
    const midX = (c.x0 + c.x1) / 2;
    const cej = cejYAt(seg, midX);
    const tipY = c.upper
      ? (sb ? Math.min(sb.y1, SPLIT - 4) : SPLIT - 20)
      : (sb ? Math.max(sb.y0, SPLIT + 4) : SPLIT + 20);
    return { fdi, silD, seg, x0, x1, midX, cej, tipY, w: Math.max(12, x1 - x0), sb };
  }

  /** Schneeweisse Porzellan-Gradienten (Krone / Pontic / Teilkrone). */
  function ensurePorcelainGrads(defs, g) {
    const { fdi, x0, x1, midX, tipY, cej, w } = g;
    ensureGrad(defs, "porc-g-" + fdi, "linearGradient",
      { x1: x0, y1: tipY, x2: x1, y2: cej },
      [[0, "#ffffff"], [0.35, "#ffffff"], [0.72, "#fbfcfa"], [1, "#f0f2f4"]]);
    // Specular-Zentrum leicht zervikal der Kaukante (in die Krone hinein)
    const shineCy = tipY + (tipY < cej ? 1 : -1) * w * 0.1;
    ensureGrad(defs, "porc-s-" + fdi, "radialGradient",
      { cx: midX - w * 0.16, cy: shineCy, r: Math.max(20, w * 0.55) },
      [[0, "#ffffff"], [0.4, "rgba(255,255,255,.95)"], [1, "rgba(255,255,255,0)"]]);
    ensureGrad(defs, "porc-v-" + fdi, "linearGradient",
      { x1: midX, y1: tipY, x2: midX, y2: cej },
      [[0, "rgba(255,255,255,.98)"], [0.5, "rgba(255,255,255,.28)"], [1, "rgba(230,222,210,.2)"]]);
  }

  /** Richtung von der Kaukante zur CEJ (in die Krone hinein). */
  function dirIntoCrown(tipY, cej) {
    return tipY < cej ? 1 : -1;
  }

  /**
   * Krone / Brueckenglied: plastisch schneeweisse Zahnkrone in echter Zahnform
   * (Silhouette + Kronenband-Clip). kind: "crown" | "pontic"
   * Pontic = dieselbe Krone, Wurzel ist bereits ausgeblendet (missMask).
   */
  function drawPorcelainUnit(c, defs, kind, opts) {
    const g = porcelainGeom(c);
    if (!g) return null;
    const { fdi, silD, midX, tipY, cej, w } = g;
    ensureClip(defs, "st-sil-" + fdi, silD);
    ensureClip(defs, "st-cr-" + fdi, bandD(c, true));
    ensurePorcelainGrads(defs, g);

    const outer = document.createElementNS(SVGNS, "g");
    outer.setAttribute("class",
      kind === "pontic" ? "bef-pontic-tooth"
        : kind === "teil" ? "bef-teilkrone"
          : kind === "prim" ? "bef-teleskop-prim"
            : kind === "sek" ? "bef-teleskop-sek"
              : "bef-crown");
    if (opts && opts.transform) outer.setAttribute("transform", opts.transform);
    if (opts && opts.opacity != null) outer.setAttribute("opacity", String(opts.opacity));
    outer.setAttribute("clip-path", "url(#st-sil-" + fdi + ")");
    const inner = document.createElementNS(SVGNS, "g");
    // Teilkrone: nur okklusale Haelfte; sonst volles Kronenband
    if (opts && opts.clipD) {
      const clipId = opts.clipId || ("st-half-" + fdi);
      ensureClip(defs, clipId, opts.clipD);
      inner.setAttribute("clip-path", "url(#" + clipId + ")");
    } else {
      inner.setAttribute("clip-path", "url(#st-cr-" + fdi + ")");
    }

    const body = document.createElementNS(SVGNS, "path");
    body.setAttribute("d", silD);
    body.setAttribute("fill", opts && opts.fill ? opts.fill : ("url(#porc-g-" + fdi + ")"));
    body.setAttribute("class", "porc-body");
    inner.appendChild(body);

    const glossBand = document.createElementNS(SVGNS, "path");
    glossBand.setAttribute("d", silD);
    glossBand.setAttribute("fill", "url(#porc-v-" + fdi + ")");
    glossBand.setAttribute("class", "porc-rim");
    inner.appendChild(glossBand);

    const edge = document.createElementNS(SVGNS, "path");
    edge.setAttribute("d", silD);
    edge.setAttribute("fill", "none");
    edge.setAttribute("stroke", opts && opts.stroke ? opts.stroke : "rgba(185, 205, 225, 0.95)");
    edge.setAttribute("stroke-width", opts && opts.strokeW != null ? String(opts.strokeW) : "1.7");
    edge.setAttribute("class", "porc-edge");
    inner.appendChild(edge);

    const din = dirIntoCrown(tipY, cej);
    const shine = document.createElementNS(SVGNS, "ellipse");
    shine.setAttribute("cx", (midX - w * 0.12).toFixed(1));
    shine.setAttribute("cy", (tipY + din * 8).toFixed(1));
    shine.setAttribute("rx", (w * 0.32).toFixed(1));
    shine.setAttribute("ry", Math.max(12, Math.abs(cej - tipY) * 0.28).toFixed(1));
    shine.setAttribute("fill", "url(#porc-s-" + fdi + ")");
    shine.setAttribute("class", "porc-shine");
    inner.appendChild(shine);

    const speck = document.createElementNS(SVGNS, "ellipse");
    speck.setAttribute("cx", (midX - w * 0.18).toFixed(1));
    speck.setAttribute("cy", (tipY + din * 14).toFixed(1));
    speck.setAttribute("rx", Math.max(3, w * 0.08).toFixed(1));
    speck.setAttribute("ry", Math.max(5, Math.abs(cej - tipY) * 0.1).toFixed(1));
    speck.setAttribute("fill", "rgba(255,255,255,.97)");
    speck.setAttribute("class", "porc-shine");
    inner.appendChild(speck);

    outer.appendChild(inner);
    return outer;
  }

  function drawCrown(c, defs) {
    return drawPorcelainUnit(c, defs, "crown");
  }

  function drawPonticTooth(c, defs) {
    // gleiche schneeweiße Krone wie drawCrown — ohne Wurzel (Miss-Cover)
    return drawPorcelainUnit(c, defs, "pontic");
  }

  /**
   * Veneer: vestibulaere weisse Schalenverblendung auf der Zahnkrone
   * (duenne Porzellanschale, zervikal weich auslaufend).
   */
  function drawVeneer(c, defs) {
    const g = porcelainGeom(c);
    if (!g) return null;
    const { fdi, silD, midX, tipY, cej, w } = g;
    ensureClip(defs, "st-sil-" + fdi, silD);
    ensureClip(defs, "st-cr-" + fdi, bandD(c, true));
    const din = dirIntoCrown(tipY, cej);
    const h = Math.abs(cej - tipY);
    ensureGrad(defs, "ve-g-" + fdi, "linearGradient",
      { x1: midX, y1: tipY, x2: midX, y2: cej },
      [[0, "rgba(255,255,255,.97)"], [0.55, "rgba(255,252,248,.88)"], [0.85, "rgba(245,240,232,.45)"], [1, "rgba(245,240,232,0)"]]);
    ensureGrad(defs, "ve-s-" + fdi, "radialGradient",
      { cx: midX - w * 0.14, cy: tipY + din * h * 0.22, r: w * 0.5 },
      [[0, "rgba(255,255,255,.95)"], [1, "rgba(255,255,255,0)"]]);

    const outer = document.createElementNS(SVGNS, "g");
    outer.setAttribute("class", "bef-veneer");
    outer.setAttribute("clip-path", "url(#st-sil-" + fdi + ")");
    const inner = document.createElementNS(SVGNS, "g");
    inner.setAttribute("clip-path", "url(#st-cr-" + fdi + ")");

    // Schale: leicht schmaler als die volle Krone, vestibulaer (sichtbare Flaeche)
    const shell = document.createElementNS(SVGNS, "ellipse");
    shell.setAttribute("cx", midX.toFixed(1));
    shell.setAttribute("cy", (tipY + din * h * 0.38).toFixed(1));
    shell.setAttribute("rx", (w * 0.42).toFixed(1));
    shell.setAttribute("ry", (h * 0.52).toFixed(1));
    shell.setAttribute("fill", "url(#ve-g-" + fdi + ")");
    shell.setAttribute("class", "ve-shell");
    inner.appendChild(shell);

    const face = document.createElementNS(SVGNS, "path");
    face.setAttribute("d", silD);
    face.setAttribute("fill", "url(#ve-g-" + fdi + ")");
    face.setAttribute("opacity", "0.78");
    face.setAttribute("class", "ve-face");
    inner.appendChild(face);

    const rim = document.createElementNS(SVGNS, "path");
    rim.setAttribute("d", silD);
    rim.setAttribute("fill", "none");
    rim.setAttribute("stroke", "rgba(210, 225, 240, 0.75)");
    rim.setAttribute("stroke-width", "1.2");
    rim.setAttribute("class", "ve-rim");
    inner.appendChild(rim);

    const gloss = document.createElementNS(SVGNS, "ellipse");
    gloss.setAttribute("cx", (midX - w * 0.12).toFixed(1));
    gloss.setAttribute("cy", (tipY + din * h * 0.2).toFixed(1));
    gloss.setAttribute("rx", (w * 0.22).toFixed(1));
    gloss.setAttribute("ry", (h * 0.18).toFixed(1));
    gloss.setAttribute("fill", "url(#ve-s-" + fdi + ")");
    gloss.setAttribute("class", "porc-shine");
    inner.appendChild(gloss);

    outer.appendChild(inner);
    return outer;
  }

  /**
   * Teilkrone: okklusale (obere) Haelfte von Praemolaren/Molaren schneeweiss.
   * Clip von der Kaukante bis zur Kronenmitte.
   */
  function drawTeilkrone(c, defs) {
    const n = (+c.fdi) % 10;
    if (n < 4) return null;
    const g = porcelainGeom(c);
    if (!g) return null;
    const { fdi, tipY, cej, x0, x1 } = g;
    const midY = (tipY + cej) / 2;
    const yA = Math.min(tipY, midY), yB = Math.max(tipY, midY);
    // okklusale Haelfte: von Spitze bis Mitte, seitlich etwas ueber die Zahnbreite
    const halfD = `M ${x0 - 4} ${yA.toFixed(1)} L ${x1 + 4} ${yA.toFixed(1)} L ${x1 + 4} ${yB.toFixed(1)} L ${x0 - 4} ${yB.toFixed(1)} Z`;
    // Schnittlinie an der Kronenmitte (Prep-Rand)
    const unit = drawPorcelainUnit(c, defs, "teil", { clipD: halfD, clipId: "st-half-" + fdi });
    if (!unit) return null;
    const wrap = document.createElementNS(SVGNS, "g");
    wrap.setAttribute("class", "bef-teilkrone-wrap");
    wrap.appendChild(unit);
    const cut = document.createElementNS(SVGNS, "line");
    cut.setAttribute("x1", (x0 + 2).toFixed(1));
    cut.setAttribute("x2", (x1 - 2).toFixed(1));
    cut.setAttribute("y1", midY.toFixed(1));
    cut.setAttribute("y2", midY.toFixed(1));
    cut.setAttribute("stroke", "rgba(170, 190, 210, 0.85)");
    cut.setAttribute("stroke-width", "1.4");
    cut.setAttribute("stroke-linecap", "round");
    cut.setAttribute("class", "tk-cut");
    wrap.appendChild(cut);
    return wrap;
  }

  /**
   * Teleskopkrone: Doppelkrone — kleinere innere Primaerkrone + halb
   * transluzente Sekundaerkrone darueber (Chef 19.07.2026).
   */
  function drawTeleskop(c, defs) {
    const g = porcelainGeom(c);
    if (!g) return null;
    const { fdi, midX, tipY, cej, w } = g;
    const din = dirIntoCrown(tipY, cej);
    // Pivot nahe CEJ, damit die innere Krone zervikal sitzt und koronal kleiner wirkt
    const pivY = cej - din * Math.abs(cej - tipY) * 0.12;
    const k = 0.78;
    const primTf = `translate(${midX} ${pivY}) scale(${k}) translate(${-midX} ${-pivY})`;

    ensureGrad(defs, "tel-prim-" + fdi, "linearGradient",
      { x1: midX - w * 0.3, y1: tipY, x2: midX + w * 0.3, y2: cej },
      [[0, "#f2ebe0"], [0.45, "#e8dfd0"], [1, "#d4c8b4"]]);

    const wrap = document.createElementNS(SVGNS, "g");
    wrap.setAttribute("class", "bef-teleskop");

    const prim = drawPorcelainUnit(c, defs, "prim", {
      transform: primTf,
      fill: "url(#tel-prim-" + fdi + ")",
      stroke: "rgba(150, 130, 95, 0.85)",
      strokeW: 1.4,
    });
    if (prim) wrap.appendChild(prim);

    const sek = drawPorcelainUnit(c, defs, "sek", {
      opacity: 0.55,
      stroke: "rgba(200, 215, 230, 0.7)",
      strokeW: 2.2,
    });
    if (sek) wrap.appendChild(sek);

    return wrap;
  }

  function crownBoxOf(c) {
    const sb = pathBounds(SIL[c.fdi] || "");
    const seg = SOURCE_CEJ_ARR[c.fdi];
    const midX = (c.x0 + c.x1) / 2;
    const cej = seg ? cejYAt(seg, midX) : null;
    return PerioChart.crownBox(c, sb, cej, SPLIT);
  }

  // Live-Knochenkante (inkl. Abbau) an der Zahnmitte — Anker fuer Implantate
  function liveCrestY(c) {
    const base = c.upper ? BONE_UP : BONE_LO;
    const loss = LOSS_PX[c.upper ? "up" : "lo"];
    const x = Math.max(0, Math.min(CW - 1, Math.round((c.x0 + c.x1) / 2)));
    const apical = c.upper ? -1 : 1;
    const h = base ? base[x] : SPLIT;
    return h + apical * ((loss && loss[x]) || 0);
  }

  function drawImplant(c, seg) {
    const s = st(c.fdi);
    const m = markOf(s);
    return PerioChart.drawImplantScrew(c, seg, cejYAt, {
      fracture: !!m.imp_fraktur,
      loosening: !!m.imp_lockerung,
      crestY: liveCrestY(c),
    });
  }

  /**
   * Suprakonstruktion auf Implantat (Krone-Befund am Implantat-Zahn):
   * Die Supra ERSETZT die Krone und sieht GENAU wie eine Zahnkrone aus
   * (Chef 19.07.2026) — also dieselbe Porzellan-Krone in echter Zahnform
   * wie drawCrown. Darunter ein Hals in Kronenfarbe, der von der
   * Zervikalkante buendig auf die Implantat-Plattform (38 px) zulaeuft —
   * Krone und Implantat schliessen in einer Form ab, nichts schwebt.
   */
  function drawImplantSupra(c, defs) {
    const fdi = c.fdi;
    const seg = SOURCE_CEJ_ARR[fdi];
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-supra");

    // Krone zuerst bauen: legt auch die porc-Gradienten an
    const crown = drawCrown(c, defs);

    const midX = (c.x0 + c.x1) / 2;
    const crest = liveCrestY(c);
    const cw = c.upper ? 1 : -1; // Richtung Okklusal/SPLIT
    const cejY = seg ? cejYAt(seg, midX) : crest - cw * 10;
    const pw = 19;               // Plattform-Halbbreite = drawImplantScrew
    const halfTop = Math.max(pw + 2, Math.min(27, (c.x1 - c.x0) * 0.33));
    const topY = cejY + cw * 6;  // in die Krone hinein -> Krone deckt die Naht
    const f = (v) => v.toFixed(1);

    // Abutment-Hals: Zervikalkante -> Plattform, in Kronen-Porzellan
    const neck = mkPath(
      `M ${f(midX - halfTop)} ${f(topY)} L ${f(midX + halfTop)} ${f(topY)} ` +
      `L ${f(midX + pw)} ${f(crest)} L ${f(midX - pw)} ${f(crest)} Z`,
      "bef-supra-neck",
      crown ? "url(#porc-g-" + fdi + ")" : "#f5f2ec");
    neck.setAttribute("stroke", "rgba(170,195,220,.9)");
    neck.setAttribute("stroke-width", "1.4");
    neck.setAttribute("stroke-linejoin", "round");
    g.appendChild(neck);

    // buendige Fuge: Ellipse in Plattform-Breite direkt auf dem Schraubenkopf
    const joint = document.createElementNS(SVGNS, "ellipse");
    joint.setAttribute("cx", f(midX));
    joint.setAttribute("cy", f(crest));
    joint.setAttribute("rx", String(pw));
    joint.setAttribute("ry", "3.4");
    joint.setAttribute("fill", "#f1f5f9");
    joint.setAttribute("stroke", "#64748b");
    joint.setAttribute("stroke-width", "1.3");
    g.appendChild(joint);

    if (crown) g.appendChild(crown);
    return g;
  }

  // Zahn zerstoert: deutliches rotes X ueber der Zahnkrone
  function drawDestroyedX(c, box) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-destroyed");
    const x0 = box.x0 + 2, x1 = box.x1 - 2;
    const y0 = box.y0 + 2, y1 = box.y1 - 2;
    [["M", x0, y0, x1, y1], ["M", x1, y0, x0, y1]].forEach(([, ax, ay, bx, by]) => {
      const halo = document.createElementNS(SVGNS, "line");
      halo.setAttribute("x1", ax); halo.setAttribute("y1", ay);
      halo.setAttribute("x2", bx); halo.setAttribute("y2", by);
      halo.setAttribute("stroke", "rgba(90,8,14,.75)");
      halo.setAttribute("stroke-width", "6.5");
      halo.setAttribute("stroke-linecap", "round");
      g.appendChild(halo);
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("x1", ax); l.setAttribute("y1", ay);
      l.setAttribute("x2", bx); l.setAttribute("y2", by);
      l.setAttribute("stroke", "#e11d2e");
      l.setAttribute("stroke-width", "4");
      l.setAttribute("stroke-linecap", "round");
      g.appendChild(l);
    });
    return g;
  }

  // Perkussionsempfindlichkeit: rotes Warndreieck in der Zahnkrone
  function drawPerkTriangle(c, box) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-perk");
    const cx = box.cx, cy = box.cy;
    const tri = document.createElementNS(SVGNS, "path");
    tri.setAttribute("d",
      `M ${cx.toFixed(1)} ${(cy - 10).toFixed(1)} ` +
      `L ${(cx + 10.5).toFixed(1)} ${(cy + 8).toFixed(1)} ` +
      `L ${(cx - 10.5).toFixed(1)} ${(cy + 8).toFixed(1)} Z`);
    tri.setAttribute("fill", "#d43a2f");
    tri.setAttribute("stroke", "#8f1d14");
    tri.setAttribute("stroke-width", "2");
    tri.setAttribute("stroke-linejoin", "round");
    g.appendChild(tri);
    const bar = document.createElementNS(SVGNS, "rect");
    bar.setAttribute("x", (cx - 1.2).toFixed(1));
    bar.setAttribute("y", (cy - 4.5).toFixed(1));
    bar.setAttribute("width", "2.4");
    bar.setAttribute("height", "7");
    bar.setAttribute("rx", "1.2");
    bar.setAttribute("fill", "#fff");
    g.appendChild(bar);
    const dot = document.createElementNS(SVGNS, "circle");
    dot.setAttribute("cx", cx.toFixed(1));
    dot.setAttribute("cy", (cy + 5.4).toFixed(1));
    dot.setAttribute("r", "1.5");
    dot.setAttribute("fill", "#fff");
    g.appendChild(dot);
    return g;
  }

  // Sensibilitaet: gruenes Plus ("+") bzw. rotes Minus ("âˆ’") okklusal der
  // Krone — UK: UEBER der Krone, OK: UNTER der Krone (jeweils Richtung SPLIT)
  function drawSensMark(c, value) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-sens");
    const sb = pathBounds(SIL[c.fdi] || "");
    const tipY = c.upper ? (sb ? sb.y1 : SPLIT - 12) : (sb ? sb.y0 : SPLIT + 12);
    const y = tipY + (c.upper ? 12 : -12);
    const x = silMidX(c);
    const neg = value === "âˆ’" || value === "-";
    const col = neg ? "#e2483d" : "#2eb85c";
    const mkLine = (x1, y1, x2, y2, w, color) => {
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("x1", x1.toFixed(1)); l.setAttribute("y1", y1.toFixed(1));
      l.setAttribute("x2", x2.toFixed(1)); l.setAttribute("y2", y2.toFixed(1));
      l.setAttribute("stroke", color);
      l.setAttribute("stroke-width", String(w));
      l.setAttribute("stroke-linecap", "round");
      return l;
    };
    // dunkler Halo fuer Lesbarkeit auf hellen Kronen
    g.appendChild(mkLine(x - 6.5, y, x + 6.5, y, 6.4, "rgba(10,22,16,.66)"));
    if (!neg) g.appendChild(mkLine(x, y - 6.5, x, y + 6.5, 6.4, "rgba(10,22,16,.66)"));
    g.appendChild(mkLine(x - 6.5, y, x + 6.5, y, 3.4, col));
    if (!neg) g.appendChild(mkLine(x, y - 6.5, x, y + 6.5, 3.4, col));
    return g;
  }

  function silMidX(c) {
    const sb = pathBounds(SIL[c.fdi] || "");
    return sb ? (sb.x0 + sb.x1) / 2 : (c.x0 + c.x1) / 2;
  }

  /**
   * Keilfoermiger Defekt (Chef 19.07.2026): IMMER eine bukkale OVALE Flaeche
   * direkt OBERHALB des Zahnfleischs, am Uebergang Schmelz/Zement (bzw. nur
   * im Schmelz) — also zervikal knapp koronal der CEJ, mittig auf dem Zahn.
   * Geclippt auf die Silhouette, damit das Oval den Zahn nicht verlaesst.
   */
  function drawKeilDefekt(c, seg) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-keil");
    g.setAttribute("clip-path", "url(#st-sil-" + c.fdi + ")");
    const cw = c.upper ? 1 : -1;              // koronal = Richtung SPLIT
    const x = silMidX(c);
    const y = cejYAt(seg, x) + cw * 5;        // knapp oberhalb der Gingiva
    const sb = pathBounds(SIL[c.fdi] || "");
    const rx = Math.min(10, Math.max(6.5, (sb ? sb.x1 - sb.x0 : c.x1 - c.x0) * 0.17));
    const el = document.createElementNS(SVGNS, "ellipse");
    el.setAttribute("cx", x.toFixed(1));
    el.setAttribute("cy", y.toFixed(1));
    el.setAttribute("rx", rx.toFixed(1));
    el.setAttribute("ry", "3.8");
    el.setAttribute("fill", "rgba(112,86,60,.9)");
    el.setAttribute("stroke", "#3f2f20");
    el.setAttribute("stroke-width", "1.2");
    g.appendChild(el);
    // dunkler Kerbschatten am koronalen Rand (Keil wirkt eingesunken)
    const sh = document.createElementNS(SVGNS, "path");
    sh.setAttribute("d",
      `M ${(x - rx * 0.8).toFixed(1)} ${(y + cw * 1.4).toFixed(1)} ` +
      `Q ${x.toFixed(1)} ${(y + cw * 3.4).toFixed(1)} ${(x + rx * 0.8).toFixed(1)} ${(y + cw * 1.4).toFixed(1)}`);
    sh.setAttribute("fill", "none");
    sh.setAttribute("stroke", "rgba(35,22,12,.75)");
    sh.setAttribute("stroke-width", "1.4");
    sh.setAttribute("stroke-linecap", "round");
    g.appendChild(sh);
    return g;
  }

  // Lueckenschluss: ")(" an Stelle der (entfernten) Krone
  function drawSpaceClosure(c, box) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-ls");
    const t = document.createElementNS(SVGNS, "text");
    t.setAttribute("x", box.cx.toFixed(1));
    t.setAttribute("y", (box.cy + box.h * 0.18).toFixed(1));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-family", "Georgia, 'Times New Roman', serif");
    t.setAttribute("font-size", Math.min(40, Math.max(24, box.h * 0.62)).toFixed(0));
    t.setAttribute("font-weight", "700");
    t.setAttribute("fill", "#c3cfdd");
    t.setAttribute("stroke", "#0d1822");
    t.setAttribute("stroke-width", "3");
    t.setAttribute("paint-order", "stroke");
    t.textContent = ")(";
    g.appendChild(t);
    return g;
  }

  // Kurz-Badge neben Zahnnummer / okklusal — NICHT auf dem Gingiva-Band
  // (alte Position SPLITÂ±22 lag optisch auf der Papille). slot stapelt.
  function drawMarkBadge(c, code, color, slot) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-badge");
    const x = APEXX[c.fdi] != null ? APEXX[c.fdi] : c.cx;
    const baseY = c.upper ? 46 : CH - 34;
    const y = baseY + (c.upper ? 1 : -1) * (slot || 0) * 15;
    const w = Math.max(24, 8 + String(code).length * 6.2);
    const bg = document.createElementNS(SVGNS, "rect");
    bg.setAttribute("x", (x - w / 2).toFixed(1));
    bg.setAttribute("y", y - 8);
    bg.setAttribute("width", w.toFixed(1));
    bg.setAttribute("height", 14);
    bg.setAttribute("rx", 3);
    bg.setAttribute("fill", color || "rgba(40,48,58,.82)");
    bg.setAttribute("stroke", "rgba(200,180,140,.45)");
    const t = document.createElementNS(SVGNS, "text");
    t.setAttribute("x", x); t.setAttribute("y", y + 2.5);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "bef-badge-txt");
    t.textContent = code;
    g.appendChild(bg); g.appendChild(t);
    return g;
  }

  const BADGE = {
    insuffizient: ["i", "#c26520"],
    keildefekt: ["Keil", "#a04838"], schmelzfraktur: ["Fr", "#a04838"],
    cap: ["CAP", "#b8860b"], wsr: ["WSR", "#5b6bb5"], wurzelrest: ["WR", "#8a6a48"],
    fraktur: ["Fr", "#a04838"], retiniert: ["rt", "#5b6bb5"], impaktiert: ["imp", "#5b6bb5"],
    verlagert: ["verl", "#5b6bb5"], luxation: ["Lux", "#b8860b"],
    gingivitis: ["Ging", "#a04838"], bop: ["BOP", "#a04838"], furkation: ["Fu", "#b8860b"],
    periimplantitis: ["Peri", "#a04838"], lockerung: ["Lo", "#b8860b"],
    veneer: ["Ve", "#c8b8a0"], teilkrone: ["TK", "#c8b8a0"],
    teleskop: ["Tel", "#b8a070"], ze_insuffizient: ["i", "#c26520"],
    prothesenzahn: ["P", "#a06070"], klammer: ["Kl", "#a06070"], geschiebe: ["Ges", "#5b6bb5"],
    steg: ["St", "#a06070"],
    verblockung: ["Vb", "#a06070"],
    abrasion: ["Abr", "#6a7078"], schienung: ["dSch", "#a06070"],
    brackets: ["Brk", "#a06070"], retainer: ["Ret", "#3a7a9a"], band: ["Bd", "#6a7078"],
    engstand: ["Eng", "#a06070"], lueckenstand: ["Lü", "#a06070"], rotation: ["Rot", "#5b6bb5"],
    distalbiss: ["db", "#b8860b"], mesialbiss: ["mb", "#b8860b"], kreuzbiss: ["kb", "#b8860b"],
    offener_biss: ["ob", "#b8860b"], tiefbiss: ["tb", "#b8860b"], deckbiss: ["Deckb", "#b8860b"],
    kieferrelation: ["KR", "#5b6bb5"], dysgnathie: ["Dys", "#5b6bb5"],
    milchzahn: ["mz", "#b8860b"], perk_plus: ["perk+", "#0d8a80"],
    sensibilitaet: ["Sens", "#3a7a9a"], zahn_zerstoert: ["X", "#a04838"], lueckenschluss: [")(", "#6a7078"],
    leukoplakie: ["Leu", "#c8b8a0"], erythroplakie: ["Ery", "#a04838"], ulcus: ["Ul", "#a04838"],
    aphthen: ["Aph", "#a06070"], hyperplasie: ["Hyp", "#a06070"], fibrom: ["Fib", "#a06070"],
    papillom: ["Pap", "#a06070"], abszess: ["Abz", "#a04838"], fistel: ["Fist", "#a04838"],
    tumorverdacht: ["!", "#b8860b"], kg_knacken: ["KG~", "#b8860b"], kg_schmerz: ["KG!", "#a04838"],
  };

  // Spezial-Overlays: kein zusaetzliches Badge noetig
  const NO_BADGE = new Set([
    "plaque", "zahnstein", "konkremente", "verfaerbung", "krone", "implantat", "zahn_fehlt",
    "brueckenglied", "imp_lockerung", "imp_fraktur",
    "veneer", "teilkrone", "teleskop",
    "fuellung", "karies", "goldinlay", "keramikinlay", "versiegelung", "insuffizient",
    "wurzelfuellung", "i_wurzelfuellung", "wurzelstift", "keildefekt",
    "zahn_zerstoert", "lueckenschluss", "milchzahn", "sensibilitaet", "perk_plus",
    "cap", "wsr", "wurzelrest", "fraktur", "retiniert", "impaktiert",
    "verlagert", "luxation",
  ]);

  // CAP: schwarzer Punkt (Aufhellung) rund um jede Wurzelspitze
  function drawApexLesion(c, pts) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-cap");
    pts.forEach((p) => {
      const halo = document.createElementNS(SVGNS, "circle");
      halo.setAttribute("cx", p.x.toFixed(1));
      halo.setAttribute("cy", p.y.toFixed(1));
      halo.setAttribute("r", "8");
      halo.setAttribute("fill", "rgba(10,7,5,.35)");
      g.appendChild(halo);
      const dot = document.createElementNS(SVGNS, "circle");
      dot.setAttribute("cx", p.x.toFixed(1));
      dot.setAttribute("cy", p.y.toFixed(1));
      dot.setAttribute("r", "4.6");
      dot.setAttribute("fill", "#0b0806");
      g.appendChild(dot);
    });
    return g;
  }

  // WSR: horizontaler Schnitt-Strich DURCH die Wurzelspitze(n)
  function drawWsrCut(c, pts) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-wsr");
    const dirAp = c.upper ? -1 : 1;
    pts.forEach((p) => {
      const y = p.y - dirAp * 5;
      const ln = document.createElementNS(SVGNS, "line");
      ln.setAttribute("x1", (p.x - 10).toFixed(1));
      ln.setAttribute("x2", (p.x + 10).toFixed(1));
      ln.setAttribute("y1", y.toFixed(1));
      ln.setAttribute("y2", y.toFixed(1));
      ln.setAttribute("stroke", "#3d4db8");
      ln.setAttribute("stroke-width", "2.6");
      ln.setAttribute("stroke-linecap", "round");
      g.appendChild(ln);
    });
    return g;
  }

  function mkLayer(id, cls) {
    const old = svgEl.querySelector("#" + id);
    if (old) old.remove();
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("id", id);
    if (cls) g.setAttribute("class", cls);
    return g;
  }

  function tfHost(layer, hostTf) {
    if (!hostTf) return layer;
    const host = document.createElementNS(SVGNS, "g");
    host.setAttribute("transform", hostTf);
    layer.appendChild(host);
    return host;
  }

  function buildBefundLayer(defs) {
    // Drei anatomische Ebenen (siehe Stack-Kommentar oben)
    const deep = mkLayer("befundDeep", "befund-deep");
    const apex = mkLayer("befundApex", "befund-apex");
    const layer = mkLayer("befundLayer", "befund-layer");
    const showSurfGuides = needsSurfacePick(armedFinding);
    COLS.cols.forEach((c) => {
      const s = st(c.fdi);
      if (!s) return;
      PerioChart.ensureChart(s);
      const m = markOf(s);
      // Milchzahn: Overlays auf der Quell-Geometrie zeichnen und mit dem
      // milkInfo-Transform auf den verkleinerten Zahn abbilden.
      // Chirurgische Lage (retiniert/impaktiert/verlagert/Luxation):
      // Overlays wandern mit derselben Verschiebung/Drehung mit.
      const milk = milkInfo(c);
      const geo = milk ? milk.src : c;
      const disp = chirDisplacement(c);
      const hostTf = [disp && disp.str, milk && milk.transform].filter(Boolean).join(" ");
      const seg = SOURCE_CEJ_ARR[geo.fdi];
      const box = crownBoxOf(geo);

      if (m.brueckenglied && vis("brueckenglied")) {
        const pt = drawPonticTooth(c, defs);
        if (pt) layer.appendChild(pt);
      }

      if (seg) {
        if (!s.missing && !m.brueckenglied) {
          // Deep: WF/Stift im Wurzelband — unter Knochen + Zahnfleisch
          const rootG = PerioChart.drawRootCanal(
            geo, s, seg, cejYAt, pathBounds, SIL[geo.fdi], EXTRA_ROOTS[geo.fdi], defs);
          if (rootG) tfHost(deep, hostTf).appendChild(rootG);

          // Apex: CAP/WSR an den Spitzen + Konkremente wurzelwaerts der CEJ
          // (nach Knochen/Echo, unter Gingiva)
          const apexHost = tfHost(apex, hostTf);
          if (m.konkremente && vis("konkremente")) {
            apexHost.appendChild(drawKonkremente(geo, seg));
          }
          if ((m.cap && vis("cap")) || (m.wsr && vis("wsr"))) {
            const ap = PerioChart.rootApexPoints(geo, SIL[geo.fdi], EXTRA_ROOTS[geo.fdi]);
            if (ap.length) {
              if (m.cap && vis("cap")) apexHost.appendChild(drawApexLesion(geo, ap));
              if (m.wsr && vis("wsr")) apexHost.appendChild(drawWsrCut(geo, ap));
            }
          }
          if (apexHost !== apex && !apexHost.childNodes.length) apex.removeChild(apexHost);

          // Crown: alles was zur Krone / ueber dem Saum gehoert
          const crownHost = tfHost(layer, hostTf);
          if (m.plaque && vis("plaque")) crownHost.appendChild(drawPlaque(geo, seg));
          if (m.verfaerbung && vis("verfaerbung")) crownHost.appendChild(drawVerf(geo, seg));
          if (m.zahnstein && vis("zahnstein")) crownHost.appendChild(drawZahnstein(geo, seg));
          // ZE-Restaurationen: Teleskop ersetzt volle Krone; Veneer/Teilkrone
          // koennen allein oder ergaenzend stehen
          if (m.teleskop && vis("teleskop")) {
            const tel = drawTeleskop(geo, defs);
            if (tel) crownHost.appendChild(tel);
          } else if (m.krone && vis("krone")) {
            const cr = drawCrown(geo, defs);
            if (cr) crownHost.appendChild(cr);
          }
          if (m.veneer && vis("veneer")) {
            const ve = drawVeneer(geo, defs);
            if (ve) crownHost.appendChild(ve);
          }
          if (m.teilkrone && vis("teilkrone")) {
            const tk = drawTeilkrone(geo, defs);
            if (tk) crownHost.appendChild(tk);
          }
          // Flaechen anatomisch an der Aussenlinie (Clips setzt drawSurfaces
          // selbst; das Rueckseiten-Oval steht ungeclippt ueber dem Zahn)
          const surfG = PerioChart.drawSurfaces(geo, s, box, showSurfGuides);
          if (surfG) crownHost.appendChild(surfG);
          // Keilfoermiger Defekt: bukkales Oval direkt oberhalb des
          // Zahnfleischs am Schmelz-/Zement-Uebergang
          if (m.keildefekt && vis("keildefekt")) {
            const kd = drawKeilDefekt(geo, seg);
            if (kd) crownHost.appendChild(kd);
          }
          // Kronen-verankerte Marker: rotes X (zerstoert), Warndreieck (perk),
          // Sensibilitaets-Plus/Minus okklusal
          if (m.zahn_zerstoert && vis("zahn_zerstoert")) crownHost.appendChild(drawDestroyedX(geo, box));
          if (m.perk_plus && vis("perk_plus")) crownHost.appendChild(drawPerkTriangle(geo, box));
          if (m.sensibilitaet && vis("sensibilitaet")) {
            crownHost.appendChild(drawSensMark(geo, m.sensibilitaet));
          }
          if (crownHost !== layer && !crownHost.childNodes.length) layer.removeChild(crownHost);
        }
        if (m.implantat && vis("implantat")) {
          // Schraube im Knochen unter dem Zahnfleisch; Supra UEBER dem Saum
          deep.appendChild(drawImplant(c, seg));
          if (m.krone && vis("krone")) layer.appendChild(drawImplantSupra(c, defs));
        }
      }
      // Lueckenschluss: ")(" an Stelle der entfernten Krone
      if (m.lueckenschluss && vis("lueckenschluss")) {
        layer.appendChild(drawSpaceClosure(c, crownBoxOf(c)));
      }

      let badgeSlot = 0;
      Object.keys(m).forEach((id) => {
        if (!m[id] || !vis(id) || NO_BADGE.has(id)) return;
        const b = BADGE[id];
        if (b) {
          layer.appendChild(drawMarkBadge(
            c, typeof m[id] === "string" ? m[id] : b[0], b[1], badgeSlot++));
        }
      });
    });

    // DOM-Order = z-order: deep vor Knochen, Apex vor Gingiva, Crown danach
    const boneLayer = svgEl.querySelector("#boneLayer");
    const gumLayer = svgEl.querySelector("#gumLayer");
    if (boneLayer) svgEl.insertBefore(deep, boneLayer);
    else svgEl.appendChild(deep);
    if (gumLayer) svgEl.insertBefore(apex, gumLayer);
    else svgEl.appendChild(apex);
    if (gumLayer && gumLayer.nextSibling) {
      svgEl.insertBefore(layer, gumLayer.nextSibling);
    } else {
      svgEl.appendChild(layer);
    }
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

  // Knochenkante "gesund": folgt der Krone/Wurzel-Grenzlinie um
  // CEJ_BONE_GAP_MM nach apikal versetzt; zwischen den Zaehnen interpoliert,
  // ausserhalb der Zahnreihe flach weitergefuehrt. Die Gingiva endet dort
  // nach kurzer Kappe (gumRangeX) — kein Verfolgen des steilen Ramus mehr,
  // dessen bone-edge-Daten je Quadrant lueckenhaft sind (Spikes/Schweben).
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

  // Taschentiefe → Knochenabbau in mm (gesund 1–3 mm: kein Abbau)
  function pocketToLoss(mm) {
    return Math.max(0, (+mm || 0) - 3);
  }

  // Q1/Q4: Mesial liegt im Bild rechts (Richtung Front); Q2/Q3: Mesial links
  function mesialIsRight(fdi) {
    const q = Math.floor((+fdi) / 10);
    return q === 1 || q === 4;
  }

  function effectiveLossSides(s, fdi) {
    // Par: bei pathologischen Taschen (>3 mm) mesial/distal getrennt;
    // sonst einheitlicher Slider-Wert (gesunde Tasche 1–3 mm = kein Abbau)
    let lossM = 0, lossD = 0;
    const pM = s.pocket ? pocketToLoss(s.pocket.m) : 0;
    const pD = s.pocket ? pocketToLoss(s.pocket.d) : 0;
    if (pM > 0 || pD > 0) {
      lossM = pM;
      lossD = pD;
    } else {
      lossM = lossD = s.loss || 0;
    }
    const mRight = mesialIsRight(fdi);
    return {
      lossL: (mRight ? lossD : lossM) * MM,
      lossR: (mRight ? lossM : lossD) * MM,
      loss: Math.max(lossM, lossD) * MM,
    };
  }

  // Vorhandene Zaehne einer Reihe mit Abbau-Ankern (Mitte = tiefste Stelle)
  function lossTeeth(cols) {
    const teeth = [];
    cols.forEach((c) => {
      const s = st(c.fdi);
      if (!s || s.missing) return;
      const seg = SOURCE_CEJ_ARR[c.fdi];
      const x0 = seg ? seg.x0 : Math.floor(c.x0);
      const x1 = seg ? seg.x0 + seg.ys.length - 1 : Math.ceil(c.x1);
      const sides = effectiveLossSides(s, c.fdi);
      teeth.push({
        fdi: c.fdi, x0, x1,
        mid: Math.round((x0 + x1) / 2),
        loss: sides.loss,
        lossL: sides.lossL,
        lossR: sides.lossR,
      });
    });
    teeth.sort((a, b) => a.x0 - b.x0);
    return teeth;
  }

  // Abbau-Profil: raised-cosine je Zahn (rund am Maximum, keine Dreiecksspitze).
  // Mesial/distal koennen unterschiedlich tief sein (Par-Taschen).
  function lossPxArr(cols) {
    const arr = new Array(CW).fill(0);
    const teeth = lossTeeth(cols);
    teeth.forEach((t, i) => {
      if (t.loss < 0.5) return;
      const half = Math.max(8, (t.x1 - t.x0) / 2);
      const gapL = i > 0 ? Math.max(0, t.x0 - teeth[i - 1].x1) : 20;
      const gapR = i + 1 < teeth.length ? Math.max(0, teeth[i + 1].x0 - t.x1) : 20;
      const reachL = half + Math.min(14, gapL * 0.28);
      const reachR = half + Math.min(14, gapR * 0.28);
      const xA = Math.max(0, Math.floor(t.mid - reachL));
      const xB = Math.min(CW - 1, Math.ceil(t.mid + reachR));
      for (let x = xA; x <= xB; x++) {
        const dist = x - t.mid;
        const R = dist < 0 ? reachL : reachR;
        if (R < 1 || Math.abs(dist) >= R) continue;
        const w = 0.5 * (1 + Math.cos((Math.PI * dist) / R));
        const amp = dist < 0 ? t.lossL : t.lossR;
        arr[x] = Math.max(arr[x], amp * w);
      }
    });
    return smoothArr(smoothArr(arr, 11), 9);
  }

  /** Extraktionsdefekt 2 mm: klare Mulde ueber der ehemaligen Zahnbreite. */
  function extractDropPxArr(cols) {
    const drop = EXTRACT_DROP_MM * MM;
    const arr = new Array(CW).fill(0);
    cols.forEach((c) => {
      const s = st(c.fdi);
      if (!s || !s.missing) return;
      if (markOf(s).implantat || markOf(s).brueckenglied) return;
      const seg = SOURCE_CEJ_ARR[c.fdi];
      const x0 = seg ? seg.x0 : Math.floor(c.x0);
      const x1 = seg ? seg.x0 + seg.ys.length - 1 : Math.ceil(c.x1);
      const mid = Math.round((x0 + x1) / 2);
      const half = Math.max(12, (x1 - x0) * 0.55);
      const flat = half * 0.55;
      const reach = half + 16;
      const xA = Math.max(0, Math.floor(mid - reach));
      const xB = Math.min(CW - 1, Math.ceil(mid + reach));
      for (let x = xA; x <= xB; x++) {
        const dist = Math.abs(x - mid);
        let w;
        if (dist <= flat) w = 1;
        else if (dist >= reach) continue;
        else w = 0.5 * (1 + Math.cos((Math.PI * (dist - flat)) / (reach - flat)));
        arr[x] = Math.max(arr[x], drop * w);
      }
    });
    return smoothArr(arr, 5);
  }

  function mergeLossArr(a, b) {
    const out = new Array(CW);
    for (let x = 0; x < CW; x++) out[x] = Math.max(a[x] || 0, b[x] || 0);
    return out;
  }

  function applyLossToCrest(healthyArr, lossArr, upper) {
    const apical = upper ? -1 : 1;
    const out = new Array(CW);
    for (let x = 0; x < CW; x++) {
      const h = healthyArr[Math.max(0, Math.min(CW - 1, x))];
      const l = lossArr[Math.max(0, Math.min(CW - 1, x))] || 0;
      out[x] = h + apical * l;
    }
    return smoothArr(out, 9);
  }

  function clipPathD(cols, liveArr, upper, full) {
    if (!cols.length) return "";
    const inFirst = cols[0].x0, inLast = cols[cols.length - 1].x1;
    const xS = full ? 0 : inFirst, xE = full ? CW : inLast;
    const outer = upper ? 0 : CH;
    // ausserhalb der Zahnreihe (retromolar) NICHT koronal beschneiden ->
    // kompletter Knochen sichtbar; innerhalb: Live-Kante inkl. Abbau
    const yAt = (x) => {
      if (x < inFirst || x > inLast) return SPLIT;
      const xi = Math.max(0, Math.min(CW - 1, Math.round(x)));
      return liveArr[xi];
    };
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

  function clippedImg(href, clipId, cls) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("clip-path", "url(#" + clipId + ")");
    if (cls) g.setAttribute("class", cls);
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
    // Live-Abbau: Peak an Zahnmitte, Papillen/Kontakte minimal mit
    LOSS_PX.up = mergeLossArr(lossPxArr(oc), extractDropPxArr(oc));
    LOSS_PX.lo = mergeLossArr(lossPxArr(lc), extractDropPxArr(lc));
    const liveUp = applyLossToCrest(BONE_UP, LOSS_PX.up, true);
    const liveLo = applyLossToCrest(BONE_LO, LOSS_PX.lo, false);
    ensureClip(defs, "cb-up", clipPathD(oc, liveUp, true, true));
    ensureClip(defs, "cb-lo", clipPathD(lc, liveLo, false, true));
    buildPlasticLayer(defs);

    const boneLayer = svgEl.querySelector("#boneLayer");
    boneLayer.textContent = "";
    boneLayer.setAttribute("opacity", boneOpacity.toFixed(2));
    boneLayer.appendChild(clippedImg("/m/lena-01/bone-k.png?v=7", "cb-up", "bone-part"));
    boneLayer.appendChild(clippedImg("/m/lena-01/bone-k.png?v=7", "cb-lo", "bone-part"));
    // Gingiva folgt Live-Knochenkante (inkl. Extraktionsmulde)
    buildGumLayer(defs, liveUp, liveLo);

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
      // Milchzahn: Echo der Original-Wurzeln wuerde ueber der Abdeckung stehen
      if (milkInfo(c)) return;
      const disp = chirDisplacement(c);
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("clip-path", "url(#st-rt-" + c.fdi + ")");
      // verschobene/gedrehte Zaehne: Echo wandert mit (Clip dreht sich mit)
      if (disp && disp.str) g.setAttribute("transform", disp.str);
      let hostG = g;
      if (disp && disp.impk) {
        // impaktiert: auch das Echo nur bis zur rudimentaeren Wurzelhaelfte
        hostG = document.createElementNS(SVGNS, "g");
        hostG.setAttribute("clip-path", "url(#st-impk-" + c.fdi + ")");
        g.appendChild(hostG);
      }
      EXTRA_ROOTS[c.fdi].forEach((d) => {
        const p = document.createElementNS(SVGNS, "path");
        p.setAttribute("d", d);
        hostG.appendChild(p);
      });
      echo.appendChild(g);
    });

    // Chirurgische Befunde: verschobene/gedrehte Zaehne, Wurzelrest-Stuempfe
    // und der Luxations-Spalt liegen im/unterm Knochen — eine Kontur UEBER
    // dem Knochen haelt sie bei hoher Knochen-Deckkraft lesbar (wie das
    // Wurzel-Echo). Luxation: dunkler Ring = deutlicher schwarzer Spalt.
    COLS.cols.forEach((c) => {
      const s2 = st(c.fdi);
      if (!s2 || s2.missing) return;
      const m2 = markOf(s2);
      const disp = chirDisplacement(c);
      if (!(disp && disp.str) && !m2.wurzelrest) return;
      const g = document.createElementNS(SVGNS, "g");
      if (disp && disp.str) g.setAttribute("transform", disp.str);
      let hostG = g;
      const nest = (clipId) => {
        const w = document.createElementNS(SVGNS, "g");
        w.setAttribute("clip-path", "url(#" + clipId + ")");
        hostG.appendChild(w);
        hostG = w;
      };
      if (m2.wurzelrest) { nest("st-rt-" + c.fdi); nest("st-wr-" + c.fdi); }
      if (disp && disp.lux) nest("st-rt-" + c.fdi);
      if (disp && disp.impk) nest("st-impk-" + c.fdi);
      const luxStyle = "fill:none;stroke:rgba(10,8,6,.62);stroke-width:6.5;stroke-linejoin:round";
      [SIL[c.fdi]].concat(EXTRA_ROOTS[c.fdi] || []).forEach((d) => {
        if (!d) return;
        const p = document.createElementNS(SVGNS, "path");
        p.setAttribute("d", d);
        if (disp && disp.lux) p.setAttribute("style", luxStyle);
        hostG.appendChild(p);
      });
      echo.appendChild(g);
    });
    svgEl.insertBefore(echo, boneLayer.nextSibling);

    // fehlende/ersetzte Zaehne: Original-Artwork per Maske ausblenden
    // (kein Uebermalen — das liess Aussenlinien stehen und toente den Knochen)
    rebuildTeethMask(defs);

    buildBefundLayer(defs);
    buildHits();
    updateZoom();
    updateLegendCounts();
    syncPanel();
    paintSchemaStage();
  }

  // Bounds des sichtbaren Zahns (Silhouette + Extra-Wurzeln), inkl.
  // Milch-/Chir-Transform — damit die Lupe den Zahn zentriert zeigt und
  // nicht an der Original-Position klebt (sonst "rutscht" er nach unten).
  function zoomToothBounds(fdi) {
    const col = COLS.cols.find((c) => c.fdi === fdi);
    if (!col) return pathBounds(SIL[fdi] || "");
    const milk = milkInfo(col);
    const geo = milk ? milk.src : col;
    let sb = pathBounds(SIL[geo.fdi] || "");
    if (!sb) return null;
    (EXTRA_ROOTS[geo.fdi] || []).forEach((d) => {
      const b = pathBounds(d);
      if (!b) return;
      sb = {
        x0: Math.min(sb.x0, b.x0), x1: Math.max(sb.x1, b.x1),
        y0: Math.min(sb.y0, b.y0), y1: Math.max(sb.y1, b.y1),
      };
    });
    // Milch: translate(tx,ty) scale(k) → Punkt (x,y) → (k·x+tx, k·y+ty)
    if (milk) {
      const k = milk.k;
      const cMid = (col.x0 + col.x1) / 2, sMid = (geo.x0 + geo.x1) / 2;
      const cSeg = SOURCE_CEJ_ARR[col.fdi], sSeg = SOURCE_CEJ_ARR[geo.fdi];
      const cCej = cSeg ? cejYAt(cSeg, cMid) : (col.upper ? SPLIT * 0.75 : SPLIT * 1.25);
      const sCej = sSeg ? cejYAt(sSeg, sMid) : cCej;
      const tx = cMid - k * sMid, ty = cCej - k * sCej;
      sb = {
        x0: k * sb.x0 + tx, x1: k * sb.x1 + tx,
        y0: k * sb.y0 + ty, y1: k * sb.y1 + ty,
      };
    }
    const disp = chirDisplacement(col);
    if (disp) {
      // dy aus translate(0 dy); Rotation: AABB der 4 Ecken um die Silhouettenmitte
      const mDy = /translate\(0\s+(-?[\d.]+)\)/.exec(disp.str || "");
      const dy = mDy ? +mDy[1] : 0;
      if (dy) { sb.y0 += dy; sb.y1 += dy; }
      const rot = +disp.rot || 0;
      if (rot) {
        const cx = (sb.x0 + sb.x1) / 2, cy = (sb.y0 + sb.y1) / 2;
        const rad = (-rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
        const corners = [
          [sb.x0, sb.y0], [sb.x1, sb.y0], [sb.x0, sb.y1], [sb.x1, sb.y1],
        ].map(([x, y]) => {
          const dx = x - cx, dy2 = y - cy;
          return [cx + dx * cos - dy2 * sin, cy + dx * sin + dy2 * cos];
        });
        sb = {
          x0: Math.min(...corners.map((p) => p[0])),
          x1: Math.max(...corners.map((p) => p[0])),
          y0: Math.min(...corners.map((p) => p[1])),
          y1: Math.max(...corners.map((p) => p[1])),
        };
      }
    }
    return sb;
  }

  // Lupen-Modul: Klon der Buehne, viewBox eng um den Zahn und an das
  // Seitenverhaeltnis der Lupe angepasst — Zahn bleibt mittig, kein Abrutschen.
  function updateZoom() {
    const host = document.getElementById("zoomStage");
    if (!host || !svgEl) return;
    const label = document.getElementById("zoomLabel");
    if (label) label.textContent = "Zahn " + selected;
    host.textContent = "";
    const sb = zoomToothBounds(selected);
    if (!sb) return;
    const clone = svgEl.cloneNode(true);
    clone.removeAttribute("class");
    clone.removeAttribute("id");
    clone.querySelectorAll(".hit, .flab, .flab-find, .flab-pocket, .selout").forEach((n) => n.remove());
    clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));

    const tw = Math.max(8, sb.x1 - sb.x0);
    const th = Math.max(8, sb.y1 - sb.y0);
    const cx = (sb.x0 + sb.x1) / 2;
    const cy = (sb.y0 + sb.y1) / 2;
    // knapper Rand: Zahn fuellt die Lupe, Nachbarn nur als Hauch
    const pad = Math.max(5, Math.min(tw, th) * 0.06);
    let vw = tw + 2 * pad;
    let vh = th + 2 * pad;
    const rect = host.getBoundingClientRect();
    const aspect = (rect.width > 8 && rect.height > 8)
      ? rect.width / rect.height
      : 240 / 640;
    if (vw / vh > aspect) {
      vh = vw / aspect;
    } else {
      vw = vh * aspect;
    }
    const vx = cx - vw / 2;
    const vy = cy - vh / 2;

    clone.setAttribute("viewBox",
      vx.toFixed(1) + " " + vy.toFixed(1) + " " + vw.toFixed(1) + " " + vh.toFixed(1));
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
    clone.setAttribute("class", "zoom-svg");
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

  const SHORT = {
    plaque: "Pl", zahnstein: "Zs", konkremente: "Kk", verfaerbung: "Vf",
    krone: "Kr", implantat: "Imp", fuellung: "F", karies: "K", insuffizient: "i",
    wurzelfuellung: "WF", i_wurzelfuellung: "iWF", wurzelstift: "WSt",
    keildefekt: "Keil", schmelzfraktur: "Fr", cap: "CAP", wsr: "WSR",
    wurzelrest: "WR", fraktur: "Fr", retiniert: "rt", impaktiert: "imp",
    verlagert: "verl", luxation: "Lux", gingivitis: "Ging", bop: "BOP",
    furkation: "Fu", periimplantitis: "Peri", lockerung: "Lo",
    brueckenglied: "BG", veneer: "Ve", teilkrone: "TK", teleskop: "Tel",
    ze_insuffizient: "i", prothesenzahn: "P", klammer: "Kl", geschiebe: "Ges",
    steg: "St", goldinlay: "GI", keramikinlay: "KI", verblockung: "Vb",
    imp_lockerung: "ImpLo", imp_fraktur: "ImpFr", abrasion: "Abr",
    schienung: "dSch", brackets: "Brk", retainer: "Ret", band: "Bd",
    engstand: "Eng", lueckenstand: "Lü", rotation: "Rot", milchzahn: "mz",
    versiegelung: "Vs", perk_plus: "perk+", sensibilitaet: "Sens",
    zahn_zerstoert: "X", lueckenschluss: ")(", leukoplakie: "Leu",
    erythroplakie: "Ery", ulcus: "Ul", aphthen: "Aph", abszess: "Abz",
    fistel: "Fist", tumorverdacht: "!",
  };

  function codesForTooth(s) {
    if (!s) return "";
    const parts = [];
    const m = markOf(s);
    if (s.missing && !m.brueckenglied && !m.implantat && !m.prothesenzahn) parts.push("fehlt");
    Object.keys(m).forEach((id) => {
      if (!m[id] || id === "zahn_fehlt") return;
      if (typeof m[id] === "string") parts.push(m[id]);
      else if (SHORT[id]) parts.push(SHORT[id]);
    });
    if (window.PerioChart) {
      PerioChart.ensureChart(s);
      PerioChart.SURFACE_KEYS.forEach((k) => {
        (s.surfaces[k] || []).forEach((id) => {
          if (SHORT[id] && !parts.includes(SHORT[id])) parts.push(SHORT[id]);
        });
      });
      (s.rootMarkers || []).forEach((id) => {
        if (SHORT[id] && !parts.includes(SHORT[id])) parts.push(SHORT[id]);
      });
    }
    // Taschen NICHT in den Befund-Code unter die Zahnzahl — das stoert
    // (Default 1/1 + Par-Tab = jede Krone voller Zahlen). Pathologische
    // Taschen kommen als eigene kleine Marke in buildHits.
    return parts.slice(0, 6).join("·");
  }

  function pocketLabel(s) {
    if (!s || !s.pocket) return "";
    const pm = +s.pocket.m || 0;
    const pd = +s.pocket.d || 0;
    if (pm <= 3 && pd <= 3) return "";
    return pm + "/" + pd;
  }

  function buildHits() {
    let front = svgEl.querySelector("#hitLayer");
    if (front) front.remove();
    front = document.createElementNS(SVGNS, "g");
    front.setAttribute("id", "hitLayer");

    // Auswahl-Kontur: bei Milchzahn/chirurgischer Lage (retiniert/impaktiert/
    // verlagert/Luxation) derselbe Transform wie der gezeichnete Zahn
    const selC = COLS.cols.find((cc) => cc.fdi === selected);
    const selMilk = selC ? milkInfo(selC) : null;
    const selD = SIL[selMilk ? selMilk.src.fdi : selected];
    if (selD) {
      const sp = document.createElementNS(SVGNS, "path");
      sp.setAttribute("d", selD);
      // fehlender Zahn: nur zarte gestrichelte Position, kein voller Umriss
      sp.setAttribute("class", "selout"
        + (st(selected) && st(selected).missing ? " selout-miss" : ""));
      const selDisp = selC ? chirDisplacement(selC) : null;
      const tf = [selDisp && selDisp.str, selMilk && selMilk.transform]
        .filter(Boolean).join(" ");
      if (tf) sp.setAttribute("transform", tf);
      front.appendChild(sp);
    }

    const surfArmed = needsSurfacePick(armedFinding);

    COLS.cols.forEach((c) => {
      const b = missCoverBounds(c);
      const hit = document.createElementNS(SVGNS, "rect");
      hit.setAttribute("x", b.x0);
      hit.setAttribute("width", Math.max(1, b.x1 - b.x0));
      hit.setAttribute("y", c.upper ? 0 : SPLIT);
      hit.setAttribute("height", c.upper ? SPLIT : CH - SPLIT);
      hit.setAttribute("class", "hit");
      const applyClick = (mode) => {
        selected = c.fdi;
        if (armedFinding && !surfArmed) applyFindingToTooth(c.fdi, armedFinding, mode);
        else if (armedFinding && surfArmed) {
          // Daneben geklickt: Okklusal als Default, Flaechen-Hits bleiben praezise.
          applySurfaceFinding(c.fdi, "okklusal", mode);
          return;
        }
        render();
      };
      hit.addEventListener("click", () => applyClick("toggle"));
      hit.addEventListener("contextmenu", (ev) => { ev.preventDefault(); applyClick("remove"); });
      front.appendChild(hit);

      const x = APEXX[c.fdi] != null ? APEXX[c.fdi] : c.cx;
      const t = document.createElementNS(SVGNS, "text");
      t.setAttribute("x", x);
      t.setAttribute("y", c.upper ? 18 : CH - 6);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", "flab" + (c.fdi === selected ? " on" : ""));
      t.textContent = c.fdi;
      front.appendChild(t);

      const codes = codesForTooth(st(c.fdi));
      if (codes) {
        const ft = document.createElementNS(SVGNS, "text");
        ft.setAttribute("x", x);
        ft.setAttribute("y", c.upper ? 32 : CH - 20);
        ft.setAttribute("text-anchor", "middle");
        ft.setAttribute("class", "flab-find");
        ft.textContent = codes;
        front.appendChild(ft);
      }
      const pk = pocketLabel(st(c.fdi));
      if (pk) {
        const pt = document.createElementNS(SVGNS, "text");
        pt.setAttribute("x", x);
        pt.setAttribute("y", c.upper ? (codes ? 42 : 32) : (codes ? CH - 30 : CH - 20));
        pt.setAttribute("text-anchor", "middle");
        pt.setAttribute("class", "flab-pocket");
        pt.textContent = pk;
        front.appendChild(pt);
      }
    });
    // Flaechen-Hits in einem ZWEITEN Durchlauf, damit sie ueber ALLEN
    // Spalten-Rechtecken liegen (sonst deckt der Spalten-Hit des
    // Nachbarzahns das schwebende Rueckseiten-Oval ab und frisst den Klick)
    if (surfArmed) {
      COLS.cols.forEach((c) => {
        if (st(c.fdi).missing) return;
        // Hits clippen sich selbst (anatomische Regionen); das schematische
        // Rueckseiten-Oval liegt bewusst UNGECLIPPT ueber dem Zahn
        front.appendChild(PerioChart.buildSurfaceHits(c, crownBoxOf(c), applySurfaceFinding));
      });
    }
    svgEl.appendChild(front);
  }

  function syncParPocketUI() {
    const box = document.getElementById("parPocketBox");
    if (!box) return;
    const show = activeTab === "Par";
    box.hidden = !show;
    box.style.display = show ? "" : "none";
    const s = st(selected);
    if (!s.pocket) s.pocket = { m: 1, d: 1 };
    const pm = document.getElementById("pocketM");
    const pd = document.getElementById("pocketD");
    if (pm) pm.value = s.pocket.m;
    if (pd) pd.value = s.pocket.d;
  }

  function syncLossFromPockets(s) {
    if (!s.pocket) return;
    s.loss = Math.max(pocketToLoss(s.pocket.m), pocketToLoss(s.pocket.d));
  }

  function syncPanel() {
    const s = st(selected);
    document.getElementById("selLabel").textContent = "Zahn " + selected;
    document.getElementById("miss").checked = s.missing;
    syncParPocketUI();
  }

  const LOCK_CYCLE = [true, "I", "II", "III"];

  // Flaechen-Befunde, die der Nutzer per Flaechen-Hit platziert.
  // Versiegelung NICHT: die gilt immer okklusal und wird direkt gesetzt.
  function needsSurfacePick(id) {
    return !!(id && window.PerioChart && PerioChart.isSurfacePaint(id) && id !== "versiegelung");
  }

  function applyArchFinding(id) {
    const wantOk = id.endsWith("_ok");
    const isMissing = id.startsWith("alle_fehlend");
    const targets = COLS.cols.filter((c) => !!c.upper === wantOk);
    if (isMissing) {
      const allMiss = targets.every((c) => st(c.fdi).missing);
      targets.forEach((c) => {
        const s = st(c.fdi);
        s.missing = !allMiss;
        if (s.missing) markOf(s).zahn_fehlt = true;
        else delete markOf(s).zahn_fehlt;
      });
    } else {
      const allProt = targets.every((c) => hasMark(st(c.fdi), "prothesenzahn"));
      targets.forEach((c) => {
        const s = st(c.fdi);
        const m = markOf(s);
        if (!allProt) { s.missing = true; m.prothesenzahn = true; m.zahn_fehlt = true; }
        else { s.missing = false; delete m.prothesenzahn; delete m.zahn_fehlt; }
      });
    }
  }

  function applyFindingToTooth(fdi, id, mode) {
    const s = st(fdi);
    if (!s) return;
    PerioChart.ensureChart(s);
    if (id.startsWith("alle_fehlend") || id.startsWith("alle_ersetzt")) {
      applyArchFinding(id); armedFinding = null; return;
    }

    if (id === "zahn_fehlt") {
      if (mode === "remove") { s.missing = false; delete markOf(s).zahn_fehlt; }
      else { s.missing = !s.missing; markOf(s).zahn_fehlt = s.missing; }
      return;
    }

    // Versiegelung: faerbt IMMER die Okklusalflaeche, nur Molaren/Praemolaren
    if (id === "versiegelung") {
      if (s.missing) return;
      if (((+fdi) % 10) < 4) return;
      PerioChart.toggleSurfaceMarker(s, "okklusal", "versiegelung",
        mode === "set" ? "set" : mode);
      return;
    }

    // Flaechen nur ueber Flaechen-Hit (applySurfaceFinding)
    if (PerioChart.isSurfacePaint(id)) return;
    if (PerioChart.isRootPaint(id)) {
      if (s.missing) return;
      PerioChart.toggleRootMarker(s, id, mode === "set" ? "toggle" : mode);
      return;
    }

    // Milchzahn: 6er/7er/8er haben keinen Milchzahn-Vorgaenger
    if (id === "milchzahn" && ((+fdi) % 10) >= 6) return;
    // Teilkrone nur an Praemolaren/Molaren (4–8)
    if (id === "teilkrone" && ((+fdi) % 10) < 4) return;

    // Lueckenschluss: Zahn entfernen (sofern er nicht schon fehlt) + ")("
    // an Stelle der Krone; Gingiva flacht ueber der Luecke ab (missing-Pfad).
    if (id === "lueckenschluss") {
      const mm = markOf(s);
      if (mode === "remove" || (mode === "toggle" && mm.lueckenschluss)) {
        delete mm.lueckenschluss;
        if (s.lsAuto) { s.missing = false; delete mm.zahn_fehlt; delete s.lsAuto; }
        return;
      }
      mm.lueckenschluss = true;
      if (!s.missing) { s.missing = true; mm.zahn_fehlt = true; s.lsAuto = true; }
      return;
    }

    if (s.missing && id !== "brueckenglied" && id !== "prothesenzahn" && id !== "implantat"
        && !(id === "krone" && markOf(s).implantat)) return;

    const m = markOf(s);
    if (mode === "remove") {
      delete m[id];
      if (id === "implantat") { s.missing = false; delete m.zahn_fehlt; }
      if (id === "brueckenglied") { s.missing = false; }
      return;
    }

    if (id === "lockerung") {
      if (mode === "set") { m.lockerung = "I"; return; }
      const cur = m.lockerung;
      const i = LOCK_CYCLE.indexOf(cur);
      if (i < 0) m.lockerung = "I";
      else if (i >= LOCK_CYCLE.length - 1) delete m.lockerung;
      else m.lockerung = LOCK_CYCLE[i + 1];
      return;
    }
    if (id === "verlagert") {
      // verlagert: der Zahn steht in einem anderen Winkel — jeder Klick
      // dreht ihn 60 Grad GEGEN den Uhrzeigersinn, nach 300 Grad ist er
      // wieder gerade (Befund weg). m.verlagert traegt den Winkel in Grad.
      if (mode === "remove") { delete m.verlagert; return; }
      const cur = +m.verlagert || 0;
      if (mode === "set") { m.verlagert = cur || 60; return; }
      const next = cur + 60;
      if (next >= 360) delete m.verlagert;
      else m.verlagert = next;
      return;
    }
    if (id === "sensibilitaet") {
      // 1. Klick: gruenes Plus (positiv), 2. Klick: rotes Minus (negativ),
      // 3. Klick: weg (Chef 19.07.2026)
      const cur = m.sensibilitaet;
      if (!cur) m.sensibilitaet = "+";
      else if (cur === "+" || cur === true) m.sensibilitaet = "âˆ’";
      else delete m.sensibilitaet;
      return;
    }
    if (id === "retiniert" || id === "impaktiert") {
      if (mode === "remove" || (mode === "toggle" && m[id])) delete m[id];
      else { delete m.retiniert; delete m.impaktiert; m[id] = true; }
      return;
    }
    if (id === "implantat") {
      if (mode === "toggle" && m.implantat) {
        delete m.implantat; s.missing = false; delete m.zahn_fehlt; return;
      }
      s.missing = true; m.zahn_fehlt = true; m.implantat = true; return;
    }
    if (id === "brueckenglied") {
      if (mode === "toggle" && m.brueckenglied) {
        delete m.brueckenglied; s.missing = false; return;
      }
      m.brueckenglied = true; s.missing = true; return;
    }
    if (mode === "set") { m[id] = true; return; }
    m[id] = !m[id];
    if (!m[id]) delete m[id];
  }

  function applySurfaceFinding(fdi, surfaceKey, mode) {
    if (!armedFinding || !PerioChart.isSurfacePaint(armedFinding)) return;
    const s = st(fdi);
    if (!s || s.missing) return;
    selected = fdi;
    PerioChart.toggleSurfaceMarker(s, surfaceKey, armedFinding, mode);
    render();
  }

  function preset(kind) {
    COLS.cols.forEach((c) => { state[c.fdi] = emptyTooth(); });
    if (kind === "demo") {
      const set = (f, l) => { if (state[f]) state[f].loss = l; };
      set(46, 7); set(36, 5); set(16, 4); set(11, 3); set(41, 5); set(31, 4); set(26, 6);
      if (state[46]) state[46].pocket = { m: 6, d: 8 };
      if (state[36]) state[36].pocket = { m: 5, d: 5 };
      if (state[16]) state[16].pocket = { m: 4, d: 5 };
      const mk = (f, k) => { if (state[f]) markOf(state[f])[k] = true; };
      mk(16, "zahnstein"); mk(26, "zahnstein");
      mk(31, "zahnstein"); mk(41, "zahnstein"); mk(32, "zahnstein"); mk(42, "zahnstein");
      mk(11, "plaque"); mk(21, "plaque"); mk(36, "plaque"); mk(46, "plaque");
      mk(46, "konkremente"); mk(36, "konkremente"); mk(16, "konkremente");
      mk(13, "verfaerbung"); mk(23, "verfaerbung"); mk(33, "verfaerbung"); mk(43, "verfaerbung");
      mk(14, "krone"); mk(24, "krone"); mk(36, "implantat");
      if (state[46]) {
        PerioChart.ensureChart(state[46]);
        state[46].surfaces.okklusal = ["fuellung"];
        state[46].surfaces.mesial = ["karies"];
        state[46].rootMarkers = ["wurzelfuellung"];
      }
      if (state[15]) { markOf(state[15]).brueckenglied = true; state[15].missing = true; }
      if (state[25]) { markOf(state[25]).brueckenglied = true; state[25].missing = true; }
    }
    if (kind === "gen") {
      COLS.cols.forEach((c) => {
        state[c.fdi].loss = 4;
        state[c.fdi].pocket = { m: 5, d: 5 };
      });
    }
    render();
  }

  function buildTabs() {
    const nav = document.getElementById("befundTabs");
    if (!nav || !window.PerioLegend) return;
    nav.textContent = "";
    PerioLegend.TABS.forEach((tab) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.tab = tab.id;
      b.textContent = tab.label;
      if (tab.id === activeTab) b.classList.add("on");
      b.addEventListener("click", () => {
        activeTab = tab.id;
        armedFinding = null;
        document.body.classList.remove("finding-armed", "surface-armed");
        nav.querySelectorAll("button").forEach((el) =>
          el.classList.toggle("on", el.dataset.tab === activeTab));
        buildLegend();
        render();
      });
      nav.appendChild(b);
    });
  }

  function buildLegend() {
    const host = document.getElementById("legendItems");
    const head = document.querySelector("#legendPro .legend-head h3");
    const sub = document.querySelector("#legendPro .legend-head p");
    if (!host || !window.PerioLegend) return;
    const tab = PerioLegend.TABS.find((t) => t.id === activeTab);
    if (head) head.textContent = tab ? tab.title : activeTab;
    if (sub) {
      sub.textContent = activeTab === "Par"
        ? "Par: Taschen mesial/distal im Panel → Knochenabbau. Weitere Befunde wählen und auf Zähne übertragen."
        : "Icon klicken = setzen. Füllung/Karies/Inlay: danach Fläche O·M·D·B·P/L anklicken. Versiegelung färbt direkt okklusal. Icon nochmal = abwählen. Rechtsklick = löschen.";
    }
    host.textContent = "";
    PerioLegend.itemsForTab(activeTab).forEach((it) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "legend-item" + (armedFinding === it.id ? " armed" : "");
      b.dataset.finding = it.id;
      b.innerHTML =
        `<span class="li-icon">${PerioLegend.iconSvg(it.icon)}</span>` +
        `<span class="li-text"><span class="li-label">${it.label}</span>` +
        `<span class="li-teeth" data-count="${it.id}">&ndash;</span></span>`;
      b.addEventListener("click", () => {
        if (it.arch) {
          applyArchFinding(it.id);
          armedFinding = null;
          document.body.classList.remove("finding-armed", "surface-armed");
          buildLegend();
          render();
          return;
        }
        // Icon nur armieren / abwaehlen — der Zahn-Klick setzt oder nimmt weg.
        // Sofort-Setzen auf den gerade selektierten Zahn war der unruhige Klick.
        if (armedFinding === it.id) {
          armedFinding = null;
          document.body.classList.remove("finding-armed", "surface-armed");
          host.querySelectorAll(".legend-item").forEach((el) => el.classList.remove("armed"));
          render();
          return;
        }
        armedFinding = it.id;
        host.querySelectorAll(".legend-item").forEach((el) =>
          el.classList.toggle("armed", el.dataset.finding === armedFinding));
        document.body.classList.toggle("finding-armed", !!armedFinding);
        document.body.classList.toggle("surface-armed", needsSurfacePick(armedFinding));
        render();
      });
      host.appendChild(b);
    });
    updateLegendCounts();
  }

  function updateLegendCounts() {
    if (!window.PerioLegend) return;
    PerioLegend.itemsForTab(activeTab).forEach((it) => {
      const el = document.querySelector(`[data-count="${it.id}"]`);
      if (!el) return;
      const teeth = COLS.cols
        .filter((c) => {
          const s = st(c.fdi);
          if (!s) return false;
          if (it.id === "zahn_fehlt") return s.missing;
          return hasMark(s, it.id);
        })
        .map((c) => c.fdi);
      el.textContent = teeth.length ? teeth.join(" ") : "\u2013";
      el.classList.toggle("has", !!teeth.length);
    });
  }

  const SCHEMA_OK = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const SCHEMA_UK = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  function paintSchemaStage() {
    const host = document.getElementById("schemaStage");
    if (!host) return;
    const lbl = findingLabelMap01();
    const cell = (fdi) => {
      const t = toothFindings01(fdi, lbl);
      const miss = !!(state[fdi] && state[fdi].missing);
      const marks = t ? t.parts.slice(0, 2).join(" · ") : "";
      const cls = "zs01-cell"
        + (selected === fdi ? " is-sel" : "")
        + (miss ? " is-miss" : "")
        + (t ? " has" : "");
      return '<button type="button" class="' + cls + '" data-fdi="' + fdi + '">'
        + '<span class="n">' + fdi + "</span>"
        + (marks ? '<span class="m">' + marks.replace(/</g, "") + "</span>" : "")
        + "</button>";
    };
    host.innerHTML =
      '<div class="zs01-lab">OK</div><div class="zs01-arch">' + SCHEMA_OK.map(cell).join("") + "</div>"
      + '<div class="zs01-lab">UK</div><div class="zs01-arch">' + SCHEMA_UK.map(cell).join("") + "</div>";
    if (!host.dataset.bound) {
      host.dataset.bound = "1";
      host.addEventListener("click", (e) => {
        const b = e.target.closest("[data-fdi]");
        if (!b) return;
        const fdi = Number(b.dataset.fdi);
        selected = fdi;
        if (armedFinding) {
          if (needsSurfacePick(armedFinding) && window.PerioChart && PerioChart.isSurfacePaint(armedFinding)) {
            PerioChart.ensureChart(st(fdi));
            PerioChart.toggleSurfaceMarker(st(fdi), "okklusal", armedFinding, "toggle");
          } else {
            applyFindingToTooth(fdi, armedFinding, "toggle");
          }
        }
        render();
      });
    }
  }

  function applyPageTitle() {
    const el = document.getElementById("pageTitle");
    if (!el) return;
    const q = new URLSearchParams(location.search);
    const name = (q.get("patient") || q.get("name") || "").trim();
    el.textContent = name ? ("01 - " + name) : "01-Modus";
    if (name) document.title = "Lena · 01 · " + name;
  }

  async function boot() {
    applyPageTitle();
    const host = document.getElementById("stage");
    const [svgTxt, cols, teethTxt, boneEdge] = await Promise.all([
      fetch("/m/lena-01/perio-layers.svg?v=14").then((r) => r.text()),
      fetch("/m/lena-01/perio-cols.json?v=12").then((r) => r.json()),
      fetch(TEETH_SRC).then((r) => r.text()),
      fetch("/m/lena-01/bone-edge.json?v=1").then((r) => r.json()).catch(() => null),
    ]);
    BONE_EDGE = boneEdge;
    COLS = cols; EDGES = cols.edges; SIL = cols.sil; MM = cols.mm || 6;
    CW = cols.cw; CH = cols.ch; SPLIT = cols.split;
    await rasterizeTeethSource();
    readExtraRoots(teethTxt);
    COLS.cols.forEach((c) => { SOURCE_CEJ_D[c.fdi] = cejFromRaster(c); });
    buildPalatalRoots();
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
    // Desktop-hell: der Navy-Ton sitzt IM SVG (Rect + teeth-source), nicht
    // in der CSS-Buehne — hier auf Weiss tauschen. iPad ohne theme-light
    // bleibt #122432.
    if (document.documentElement.classList.contains("theme-light")) {
      MISS_BG = "#ffffff";
      const bg = svgEl.querySelector("rect");
      if (bg) bg.setAttribute("fill", "#ffffff");
      const im = svgEl.querySelector("#teethImg");
      if (im && teethTxt) {
        const light = String(teethTxt).replace(/#122432/gi, "#ffffff");
        const url = URL.createObjectURL(new Blob([light], { type: "image/svg+xml" }));
        im.setAttribute("href", url);
        im.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
      }
    }

    if (!window.PerioChart) {
      console.error("perio-chart.js fehlt – Flaechen/Implantat/Bruecke nicht verfuegbar");
    }
    COLS.cols.forEach((c) => { state[c.fdi] = emptyTooth(); });
    try {
      const raw = JSON.parse(sessionStorage.getItem("lena01.teeth") || "null");
      if (raw && typeof raw === "object") loadTeeth01(raw, true);
    } catch (_) {}
    buildTabs();
    buildLegend();
    // Start gesund (kein Demo-Preset — Steuerpanel entfernt)
    render();
  }

  window.addEventListener("DOMContentLoaded", boot);

  const SURF_MAP = {
    m: "mesial", o: "okklusal", d: "distal",
    v: "vestibulaer", b: "vestibulaer",
    l: "lingual_palatinal", i: "lingual_palatinal",
    z: "vestibulaer",
  };

  function selectTooth(fdi) {
    fdi = Number(fdi);
    if (!COLS || !COLS.cols.some((c) => c.fdi === fdi)) return false;
    selected = fdi;
    render();
    return true;
  }

  function applyVoiceEvent(ev) {
    const fdi = Number(ev?.fdi || selected);
    if (!fdi || !state[fdi]) return false;
    selected = fdi;
    const codes = Array.isArray(ev?.codes) ? ev.codes : [];
    const surfaces = Array.isArray(ev?.surfaces) ? ev.surfaces : [];
    const map = (window.LenaZahnstatusKatalog && window.LenaZahnstatusKatalog.TO_PERIO) || {};
    const s = st(fdi);
    PerioChart.ensureChart(s);

    codes.forEach((code) => {
      if (code === "f") {
        s.missing = true;
        markOf(s).zahn_fehlt = true;
        return;
      }
      const id = map[code];
      if (!id) return;
      if (id === "fuellung" || (window.PerioChart && PerioChart.isSurfacePaint(id))) {
        const keys = surfaces.length
          ? surfaces.map((x) => SURF_MAP[x]).filter(Boolean)
          : ["okklusal"];
        keys.forEach((k) => PerioChart.toggleSurfaceMarker(s, k, id === "fuellung" ? "fuellung" : id, "set"));
        return;
      }
      if (id === "brueckenglied") {
        markOf(s).brueckenglied = true;
        s.missing = true;
        return;
      }
      if (id === "krone" || id === "implantat" || id === "teilkrone" || id === "teleskop" || id === "zahn_zerstoert") {
        applyFindingToTooth(fdi, id, "set");
      }
    });
    // Nur Flächen ohne Code → Füllung
    if (!codes.length && surfaces.length && !s.missing) {
      surfaces.forEach((x) => {
        const k = SURF_MAP[x];
        if (k) PerioChart.toggleSurfaceMarker(s, k, "fuellung", "set");
      });
    }
    render();
    return true;
  }

  // ── 01-Modus-Bruecke (Chef 15.08.2026) ──────────────────────────────────
  // Der 01-Flow (lena-01-flow.js) braucht den Befund als lesbaren Text (PVS)
  // und grobe Fach-Zaehler (Fuehrung/Luecken). Die Modell-Logik bleibt HIER —
  // der Flow greift nie direkt in state.
  const SURF_LABEL_01 = {
    okklusal: "okklusal", mesial: "mesial", distal: "distal",
    vestibulaer: "vestibul\u00e4r", lingual_palatinal: "lingual/palatinal",
  };
  function findingLabelMap01() {
    const m = {};
    if (window.PerioLegend && PerioLegend.LEGENDS) {
      Object.keys(PerioLegend.LEGENDS).forEach((tab) => {
        (PerioLegend.LEGENDS[tab] || []).forEach((it) => { m[it.id] = it.label; });
      });
    }
    return m;
  }
  function toothFindings01(fdi, lbl) {
    const s = state[fdi];
    if (!s) return null;
    const ids = [];
    const parts = [];
    const m = markOf(s);
    const replaced = !!(m.implantat || m.brueckenglied || m.prothesenzahn || m.lueckenschluss);
    if (s.missing && !replaced) { ids.push("zahn_fehlt"); parts.push("fehlt"); }
    Object.keys(m).forEach((key) => {
      const v = m[key];
      if (!v || key === "zahn_fehlt") return;
      let label = lbl[key] || key;
      if (key === "lockerung") label = "Lockerung " + v;
      else if (key === "sensibilitaet") label = "Sensibilit\u00e4t " + (v === "+" || v === true ? "positiv" : "negativ");
      ids.push(key);
      parts.push(label);
    });
    if (s.surfaces) {
      Object.keys(SURF_LABEL_01).forEach((sk) => {
        (s.surfaces[sk] || []).forEach((markerId) => {
          ids.push(markerId);
          parts.push((lbl[markerId] || markerId) + " " + SURF_LABEL_01[sk]);
        });
      });
    }
    (s.rootMarkers || []).forEach((markerId) => {
      ids.push(markerId);
      parts.push(lbl[markerId] || markerId);
    });
    const pm = s.pocket ? +s.pocket.m || 0 : 0;
    const pd = s.pocket ? +s.pocket.d || 0 : 0;
    if (pm > 3 || pd > 3) { ids.push("paro"); parts.push("Tasche " + pm + "/" + pd + " mm"); }
    if (!parts.length) return null;
    // Dubletten aus Labeltext raus (z. B. mehrere Flaechen gleicher Befund bleiben)
    const seen = new Set();
    const uniq = parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
    return { fdi: Number(fdi), ids, parts: uniq };
  }
  function snapshot01() {
    const lbl = findingLabelMap01();
    const teeth = [];
    (COLS ? COLS.cols : []).forEach((c) => {
      const t = toothFindings01(c.fdi, lbl);
      if (t) teeth.push(t);
    });
    teeth.sort((a, b) => a.fdi - b.fdi);
    return { teeth, count: teeth.length };
  }
  function fachCounts01() {
    const counts = {};
    const tabOf = (window.PerioLegend && PerioLegend.FINDING_TAB) || {};
    snapshot01().teeth.forEach((t) => {
      const tabs = new Set();
      t.ids.forEach((id) => {
        if (id === "paro") { tabs.add("Par"); return; }
        const tab = tabOf[id];
        if (tab) tabs.add(tab);
      });
      tabs.forEach((tab) => { counts[tab] = (counts[tab] || 0) + 1; });
    });
    return counts;
  }
  function toPvsText01(name) {
    const snap = snapshot01();
    const lines = ["01-BEFUND (Erstuntersuchung)"];
    if (name) lines.push("Patient: " + String(name).trim());
    lines.push("");
    if (!snap.count) {
      lines.push("Kein pathologischer Zahnbefund erfasst (klinisch unauff\u00e4llig).");
    } else {
      lines.push("Zahnbefund:");
      snap.teeth.forEach((t) => lines.push("  " + t.fdi + ": " + t.parts.join(", ")));
    }
    return lines.join("\n");
  }
  function loadTeeth01(raw, silent) {
    if (!raw || typeof raw !== "object") return false;
    Object.keys(raw).forEach((key) => {
      const fdi = Number(key);
      if (!fdi) return;
      if (!state[fdi]) state[fdi] = emptyTooth();
      const src = raw[key] || {};
      const s = state[fdi];
      s.missing = !!src.missing;
      s.mark = Object.assign({}, src.mark || {});
      s.surfaces = src.surfaces ? JSON.parse(JSON.stringify(src.surfaces)) : (window.PerioChart ? PerioChart.emptySurfaces() : {});
      s.rootMarkers = Array.isArray(src.rootMarkers) ? src.rootMarkers.slice() : [];
      s.pocket = src.pocket ? { m: +src.pocket.m || 1, d: +src.pocket.d || 1 } : { m: 1, d: 1 };
    });
    if (!silent && COLS && svgEl) render();
    return true;
  }
  function teethRaw01() {
    const out = {};
    Object.keys(state).forEach((fdi) => {
      const s = state[fdi];
      if (!s) return;
      out[fdi] = {
        missing: !!s.missing,
        mark: Object.assign({}, markOf(s)),
        surfaces: s.surfaces ? JSON.parse(JSON.stringify(s.surfaces)) : {},
        rootMarkers: (s.rootMarkers || []).slice(),
        pocket: s.pocket ? { m: +s.pocket.m || 0, d: +s.pocket.d || 0 } : { m: 1, d: 1 },
      };
    });
    return out;
  }
  function findingsById01(id) {
    return snapshot01().teeth.filter((t) => (t.ids || []).indexOf(id) >= 0);
  }
  function armFinding01(id) {
    armedFinding = id || null;
    document.body.classList.toggle("finding-armed", !!armedFinding);
    const surf = !!(armedFinding && window.PerioChart && PerioChart.isSurfacePaint(armedFinding));
    document.body.classList.toggle("surface-armed", surf);
    if (COLS && svgEl) render();
    return !!armedFinding;
  }
  function setTab01(tabId) {
    if (!window.PerioLegend || !PerioLegend.TABS.some((t) => t.id === tabId)) return false;
    activeTab = tabId;
    armedFinding = null;
    document.body.classList.remove("finding-armed", "surface-armed");
    const nav = document.getElementById("befundTabs");
    if (nav) nav.querySelectorAll("button").forEach((el) =>
      el.classList.toggle("on", el.dataset.tab === activeTab));
    // Vor Boot-Ende (COLS/svgEl noch nicht da): nur activeTab merken —
    // boot() rendert danach mit dieser Auswahl. Sonst wuerde render()/
    // updateLegendCounts() ueber leere COLS stolpern.
    if (!COLS || !svgEl) return true;
    buildLegend();
    render();
    return true;
  }

  window.Lena01 = {
    selectTooth,
    applyVoiceEvent,
    paintSchema: paintSchemaStage,
    getSelected: () => selected,
    setTab: setTab01,
    armFinding: armFinding01,
    snapshot: snapshot01,
    teethRaw: teethRaw01,
    loadTeeth: loadTeeth01,
    findingsById: findingsById01,
    fachCounts: fachCounts01,
    toPvsText: toPvsText01,
  };
})();
