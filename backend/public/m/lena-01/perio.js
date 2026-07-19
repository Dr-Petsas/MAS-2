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
  let boneOpacity = 0.75;   // Knochen-Deckkraft, live per Regler einstellbar
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

  // Abdeckung beim Loeschen: Spaltenrechteck allein reicht nicht — Distalwurzeln
  // (v. a. UK-Molaren) ragen ueber die Kronen-Trennlinie hinaus und bleiben sonst stehen.
  // Farbe = Hintergrund der Basisebene teeth-source.svg (#122432), NICHT der
  // SVG-Rect-Ton #241a15 — sonst steht ein sichtbar braunes Band in der Luecke.
  const MISS_BG = "#122432";

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
    absorb(pathBounds(SIL[c.fdi] || ""), 5);
    (EXTRA_ROOTS[c.fdi] || []).forEach((d) => absorb(pathBounds(d), 5));
    const n = (+c.fdi) % 10, q = ((+c.fdi) / 10) | 0;
    if (n >= 6) {
      // Sicherheitspuffer distal (Watershed-SIL schneidet dort oft zu eng)
      const flare = n >= 8 ? 22 : n === 7 ? 16 : 12;
      if (q === 1 || q === 4) x0 -= flare;
      if (q === 2 || q === 3) x1 += flare;
    }
    y0 = Math.max(0, y0);
    y1 = Math.min(CH, y1);
    x0 = Math.max(0, x0);
    x1 = Math.min(CW, x1);
    return { x0, x1, y0, y1 };
  }

  function appendMissCover(host, c, defs) {
    // Brueckenglied: nur Wurzel abdecken, Krone bleibt fuer Porzellan-Zahnform frei
    const pontic = !!(st(c.fdi) && markOf(st(c.fdi)).brueckenglied);
    if (pontic && defs && SOURCE_CEJ_ARR[c.fdi] && SIL[c.fdi]) {
      ensureClip(defs, "st-sil-" + c.fdi, SIL[c.fdi]);
      ensureClip(defs, "st-rt-" + c.fdi, bandD(c, false));
      const wrap = document.createElementNS(SVGNS, "g");
      wrap.setAttribute("clip-path", "url(#st-sil-" + c.fdi + ")");
      const root = document.createElementNS(SVGNS, "g");
      root.setAttribute("clip-path", "url(#st-rt-" + c.fdi + ")");
      const paint = (d, sw) => {
        if (!d) return;
        const p = document.createElementNS(SVGNS, "path");
        p.setAttribute("d", d);
        p.setAttribute("fill", MISS_BG);
        p.setAttribute("stroke", MISS_BG);
        p.setAttribute("stroke-width", String(sw));
        p.setAttribute("stroke-linejoin", "round");
        root.appendChild(p);
      };
      paint(SIL[c.fdi], 10);
      (EXTRA_ROOTS[c.fdi] || []).forEach((d) => paint(d, 8));
      wrap.appendChild(root);
      host.appendChild(wrap);
      return;
    }
    // 1) Silhouette + Extra-Wurzeln (mit Stroke etwas aufgeweitet)
    const paint = (d, sw) => {
      if (!d) return;
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", MISS_BG);
      p.setAttribute("stroke", MISS_BG);
      p.setAttribute("stroke-width", String(sw));
      p.setAttribute("stroke-linejoin", "round");
      host.appendChild(p);
    };
    paint(SIL[c.fdi], 10);
    (EXTRA_ROOTS[c.fdi] || []).forEach((d) => paint(d, 8));
    if (!c.upper) {
      // 2a) UK: Trapez mit mesial gekippten Schnitt-Kanten. Die UK-Molaren
      //     sind mesial geneigt gezeichnet (Krone mesial, Wurzeln distal
      //     ausladend). Das senkrechte Bounds-Rechteck uebertrug die
      //     Wurzelbreite auf Kronenhoehe und schnitt die Nachbarzaehne
      //     senkrecht an ("Reste", Chef 19.07.2026). Kanten folgen jetzt den
      //     Watershed-Barrieren aus build-perio-layers.py: Kontaktpunkt
      //     (Krone) -> 28/20 px distal versetzt (Apex).
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", lowerCoverPolyD(c));
      p.setAttribute("fill", MISS_BG);
      host.appendChild(p);
      return;
    }
    // 2b) OK: Bounding-Box inkl. Distal-Flare (faengt Reste ausserhalb der Watershed-SIL)
    const b = missCoverBounds(c);
    const r = document.createElementNS(SVGNS, "rect");
    r.setAttribute("x", b.x0);
    r.setAttribute("y", b.y0);
    r.setAttribute("width", Math.max(1, b.x1 - b.x0));
    r.setAttribute("height", Math.max(1, b.y1 - b.y0));
    r.setAttribute("fill", MISS_BG);
    host.appendChild(r);
  }

  // UK-Abdeckflaeche: Kante je Kontakt nur kippen, wenn ein Molar beteiligt
  // ist (Front bleibt senkrecht). Kipp-Betrag wie die Watershed-Barrieren
  // (28 bei 7er/8er-Kontakt, 20 am 6er), Richtung distal (von der Kiefer-
  // mitte weg). Basis sind die reinen Spaltgrenzen — die Zahnkontur selbst
  // deckt schon das SIL-Polygon (+Stroke 10) ab; SIL-Bounds hier NICHT mehr
  // absorbieren (ausgelaufene Zellen, z. B. 34, rissen sonst das Rechteck
  // weit in die Nachbarn).
  function lowerCoverPolyD(c) {
    const row = lowerCols().slice().sort((a, b) => a.x0 - b.x0);
    const i = row.findIndex((cc) => cc.fdi === c.fdi);
    const n = (+c.fdi) % 10;
    const flareTo = (nb) => {
      const nn = nb ? (+nb.fdi) % 10 : n;
      if (n < 6 && (!nb || nn < 6)) return 0;
      return Math.max(n, nn) >= 7 ? 28 : 20;
    };
    const fL = flareTo(i > 0 ? row[i - 1] : null);
    const fR = flareTo(i + 1 < row.length ? row[i + 1] : null);
    const xL = c.x0 - (fL ? 3 : 0);
    const xR = c.x1 + (fR ? 3 : 0);
    const shL = xL < CW / 2 ? -fL : fL;
    const shR = xR < CW / 2 ? -fR : fR;
    return `M ${xL} ${SPLIT} L ${xR} ${SPLIT} L ${xR + shR} ${CH} L ${xL + shL} ${CH} Z`;
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
  function smoothPathD(d, samples) {
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
        const pts = [];
        for (let i = 0; i < m; i++) {
          const q = p.getPointAtLength((L * i) / m);
          pts.push({ x: q.x, y: q.y });
        }
        const sm = pts.map((_, i) => {
          const a = pts[(i - 1 + m) % m], b = pts[i], c = pts[(i + 1) % m];
          return { x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4 };
        });
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
      // groesste -- Konturen dabei glaetten (weiche Linie statt Zacken)
      EXTRA_ROOTS[fdi] = hits.slice(0, 3).map((p) => smoothPathD(p.d, 44));
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
      silG.appendChild(root);

      const crown = document.createElementNS(SVGNS, "g");
      crown.setAttribute("clip-path", "url(#st-cr-" + fdi + ")");
      crown.appendChild(bandRect(gc, "st-cg-" + fdi, "studio-crown-fill"));
      crown.appendChild(mkImg("studio-crown-anat"));
      crown.appendChild(bandRect(gc, "st-cs-" + fdi, "studio-crown-shine"));
      silG.appendChild(crown);

      if (milk) {
        // Original-Zahn (voller Groesse) unter dem Milchzahn wegdecken
        appendMissCover(layer, c, defs);
        tooth.setAttribute("transform", milk.transform);
      }
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

  /**
   * Gingiva-Margin. liveCrest = Knochenkante inkl. Abbau/Extraktion.
   * extractMask[x]=1: Margin liegt bereits auf dem Live-Kamm (kein zweites LOSS).
   */
  function gumMarginArr(cols, base, upper, liveCrest, extractMask) {
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
        for (let i = 0; i < seg.ys.length; i++) {
          const x = seg.x0 + i;
          if (x < 0 || x >= CW) continue;
          arr[x] = ridgeAt(x);
          if (extractMask) extractMask[x] = 1;
        }
        return;
      }
      if (s && s.missing) return; // Implantat: kein CEJ-Saum
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
      const amp = Math.min(2.8, gap * 0.18);
      for (let x = L.x1 + 1; x < R.x0; x++) {
        if (Number.isFinite(arr[x])) continue;
        const t = (x - L.x1) / gap;
        arr[x] = yL + (yR - yL) * t + crownward * amp * Math.sin(Math.PI * t);
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
    // gesenkt statt als Spitze neben der Luecke stehen zu bleiben.
    if (extractMask) {
      const FLAT = 26;                       // Einflusszone im Nachbarzahn (px)
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
            const w = easeT(1 - k / FLAT);
            arr[x] = arr[x] * (1 - w) + ridgeAt(x) * w;
          }
        });
      });
    }
    const FADE = 40;
    const ease = (t) => t * t * (3 - 2 * t);
    for (let x = gx0; x < first; x++) {
      const t = ease(Math.min(1, (first - x) / FADE));
      arr[x] = (1 - t) * arr[first] + t * target(x);
    }
    for (let x = last + 1; x <= gx1; x++) {
      const t = ease(Math.min(1, (x - last) / FADE));
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
      const raw = gumMarginArr(cols, base, upper, live, extractMask);
      // Par-Abbau nur an vorhandenen Zaehnen; Extraktionskamm ist schon live
      const lossArr = LOSS_PX[key] || new Array(CW).fill(0);
      for (let x = 0; x < CW; x++) {
        if (!Number.isFinite(raw[x]) || extractMask[x]) continue;
        raw[x] += apicalDir * (lossArr[x] || 0);
      }
      // ausserhalb des Bandes mit Randwerten fuellen, damit die Glaettung sauber laeuft
      for (let x = 0; x < gx0; x++) raw[x] = raw[gx0];
      for (let x = gx1 + 1; x < CW; x++) raw[x] = raw[gx1];
      // Bogen durch tiefste Stellen spannen (Papillen verschwinden mit Abbau),
      // Bandhoehe GUM_H bleibt danach ueberall konstant
      // weich glaetten (keine Spitzen); Bandhoehe GUM_H bleibt konstant
      const margin = smoothArr(smoothArr(raw, 9), 7);

      // Apikale Kante = kongruente Girlande: reiner Vertikal-Versatz
      // derselben Mutterkurve um GUM_H. Kein Steigungs-Ausgleich
      // (der wuerde Taeler vertiefen). Nur distal runde Endkappen.
      const apical = new Array(CW);
      const CAP = 14;
      for (let x = 0; x < CW; x++) {
        const edge = Math.max(0, Math.min(x - gx0, gx1 - x));
        let h = GUM_H;
        if (edge < CAP) {
          const t = edge / CAP;
          h *= Math.max(0.2, Math.sqrt(t * (2 - t)));
        }
        const y = margin[x] - crownward * h;
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
  // gezeichnet. Reihenfolge: ueber Knochen + Zahnfleisch, unter den Hits.
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

  /**
   * Krone / Brueckenglied: plastisch strahlendes Porzellanweiss in echter Zahnform
   * (Silhouette + Kronenband-Clip). kind: "crown" | "pontic"
   */
  function drawPorcelainUnit(c, defs, kind) {
    const fdi = c.fdi;
    const silD = SIL[fdi];
    const seg = SOURCE_CEJ_ARR[fdi];
    if (!silD || !seg) return null;
    ensureClip(defs, "st-sil-" + fdi, silD);
    ensureClip(defs, "st-cr-" + fdi, bandD(c, true));

    const [x0, x1] = toothSpanX(c);
    const sb = pathBounds(silD);
    const midX = (c.x0 + c.x1) / 2;
    const cej = cejYAt(seg, midX);
    const tipY = c.upper
      ? (sb ? Math.min(sb.y1, SPLIT - 4) : SPLIT - 20)
      : (sb ? Math.max(sb.y0, SPLIT + 4) : SPLIT + 20);
    const w = Math.max(12, x1 - x0);

    ensureGrad(defs, "porc-g-" + fdi, "linearGradient",
      { x1: x0, y1: tipY, x2: x1, y2: cej },
      [[0, "#ffffff"], [0.35, "#fffcf8"], [0.7, "#f5f0e8"], [1, "#e8e2d6"]]);
    ensureGrad(defs, "porc-s-" + fdi, "radialGradient",
      {
        cx: midX - w * 0.16,
        cy: c.upper ? tipY - w * 0.1 : tipY + w * 0.1,
        r: Math.max(20, w * 0.55),
      },
      [[0, "#ffffff"], [0.35, "rgba(255,255,255,.92)"], [1, "rgba(255,255,255,0)"]]);
    ensureGrad(defs, "porc-v-" + fdi, "linearGradient",
      { x1: midX, y1: tipY, x2: midX, y2: cej },
      [[0, "rgba(255,255,255,.95)"], [0.55, "rgba(255,255,255,.2)"], [1, "rgba(220,210,195,.25)"]]);

    const outer = document.createElementNS(SVGNS, "g");
    outer.setAttribute("class", kind === "pontic" ? "bef-pontic-tooth" : "bef-crown");
    outer.setAttribute("clip-path", "url(#st-sil-" + fdi + ")");
    const inner = document.createElementNS(SVGNS, "g");
    inner.setAttribute("clip-path", "url(#st-cr-" + fdi + ")");

    const body = document.createElementNS(SVGNS, "path");
    body.setAttribute("d", silD);
    body.setAttribute("fill", "url(#porc-g-" + fdi + ")");
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
    edge.setAttribute("stroke", "rgba(200, 215, 230, 0.9)");
    edge.setAttribute("stroke-width", kind === "pontic" ? "2" : "1.6");
    edge.setAttribute("class", "porc-edge");
    inner.appendChild(edge);

    const shine = document.createElementNS(SVGNS, "ellipse");
    shine.setAttribute("cx", (midX - w * 0.12).toFixed(1));
    shine.setAttribute("cy", (c.upper ? tipY - 8 : tipY + 8).toFixed(1));
    shine.setAttribute("rx", (w * 0.32).toFixed(1));
    shine.setAttribute("ry", Math.max(12, Math.abs(cej - tipY) * 0.28).toFixed(1));
    shine.setAttribute("fill", "url(#porc-s-" + fdi + ")");
    shine.setAttribute("class", "porc-shine");
    inner.appendChild(shine);

    // zweiter Specular-Punkt (Strahlglanz)
    const speck = document.createElementNS(SVGNS, "ellipse");
    speck.setAttribute("cx", (midX - w * 0.18).toFixed(1));
    speck.setAttribute("cy", (c.upper ? tipY - 14 : tipY + 14).toFixed(1));
    speck.setAttribute("rx", Math.max(3, w * 0.08).toFixed(1));
    speck.setAttribute("ry", Math.max(5, Math.abs(cej - tipY) * 0.1).toFixed(1));
    speck.setAttribute("fill", "rgba(255,255,255,.95)");
    speck.setAttribute("class", "porc-shine");
    inner.appendChild(speck);

    if (kind === "pontic") {
      const lab = document.createElementNS(SVGNS, "text");
      lab.setAttribute("x", midX.toFixed(1));
      lab.setAttribute("y", ((tipY + cej) / 2 + 4).toFixed(1));
      lab.setAttribute("text-anchor", "middle");
      lab.setAttribute("class", "porc-pontic-lab");
      lab.textContent = "B";
      inner.appendChild(lab);
    }

    outer.appendChild(inner);
    return outer;
  }

  function drawCrown(c, defs) {
    return drawPorcelainUnit(c, defs, "crown");
  }

  function drawPonticTooth(c, defs) {
    return drawPorcelainUnit(c, defs, "pontic");
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

  // Sensibilitaet: gruenes Plus ("+") bzw. rotes Minus ("−") okklusal der
  // Krone — UK: UEBER der Krone, OK: UNTER der Krone (jeweils Richtung SPLIT)
  function drawSensMark(c, value) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-sens");
    const sb = pathBounds(SIL[c.fdi] || "");
    const tipY = c.upper ? (sb ? sb.y1 : SPLIT - 12) : (sb ? sb.y0 : SPLIT + 12);
    const y = tipY + (c.upper ? 12 : -12);
    const x = silMidX(c);
    const neg = value === "−" || value === "-";
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

  // generischer Marker (Kurz-Badge) fuer Befunde ohne Spezial-Overlay
  function drawMarkBadge(c, code, color) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "bef-badge");
    const x = APEXX[c.fdi] != null ? APEXX[c.fdi] : c.cx;
    const y = c.upper ? SPLIT - 22 : SPLIT + 22;
    const bg = document.createElementNS(SVGNS, "rect");
    bg.setAttribute("x", x - 12); bg.setAttribute("y", y - 8);
    bg.setAttribute("width", 24); bg.setAttribute("height", 14);
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
    "fuellung", "karies", "goldinlay", "keramikinlay", "versiegelung", "insuffizient",
    "wurzelfuellung", "i_wurzelfuellung", "wurzelstift", "keildefekt",
    "zahn_zerstoert", "lueckenschluss", "milchzahn", "sensibilitaet", "perk_plus",
  ]);

  function buildBefundLayer(defs) {
    const old = svgEl.querySelector("#befundLayer");
    if (old) old.remove();
    const layer = document.createElementNS(SVGNS, "g");
    layer.setAttribute("id", "befundLayer");
    layer.setAttribute("class", "befund-layer");
    const showSurfGuides = needsSurfacePick(armedFinding);
    COLS.cols.forEach((c) => {
      const s = st(c.fdi);
      if (!s) return;
      PerioChart.ensureChart(s);
      const m = markOf(s);
      // Milchzahn: Overlays auf der Quell-Geometrie zeichnen und mit dem
      // milkInfo-Transform auf den verkleinerten Zahn abbilden
      const milk = milkInfo(c);
      const geo = milk ? milk.src : c;
      let host = layer;
      if (milk) {
        host = document.createElementNS(SVGNS, "g");
        host.setAttribute("transform", milk.transform);
      }
      const seg = SOURCE_CEJ_ARR[geo.fdi];
      const box = crownBoxOf(geo);

      if (m.brueckenglied && vis("brueckenglied")) {
        const pt = drawPonticTooth(c, defs);
        if (pt) layer.appendChild(pt);
      }

      if (seg) {
        if (!s.missing && !m.brueckenglied) {
          if (m.plaque && vis("plaque")) host.appendChild(drawPlaque(geo, seg));
          if (m.verfaerbung && vis("verfaerbung")) host.appendChild(drawVerf(geo, seg));
          if (m.zahnstein && vis("zahnstein")) host.appendChild(drawZahnstein(geo, seg));
          if (m.konkremente && vis("konkremente")) host.appendChild(drawKonkremente(geo, seg));
          if (m.krone && vis("krone")) {
            const cr = drawCrown(geo, defs);
            if (cr) host.appendChild(cr);
          }
          // Flaechen anatomisch an der Aussenlinie (Clips setzt drawSurfaces
          // selbst; das Rueckseiten-Oval steht ungeclippt ueber dem Zahn)
          const surfG = PerioChart.drawSurfaces(geo, s, box, showSurfGuides);
          if (surfG) host.appendChild(surfG);
          // Wurzelfuellung anatomisch in der Wurzelform; Stift bis in die
          // Krone (drawRootCanal clippt selbst: Fuellung Wurzelband, Stift Sil)
          const rootG = PerioChart.drawRootCanal(
            geo, s, seg, cejYAt, pathBounds, SIL[geo.fdi], EXTRA_ROOTS[geo.fdi], defs);
          if (rootG) host.appendChild(rootG);
          // Keilfoermiger Defekt: bukkales Oval direkt oberhalb des
          // Zahnfleischs am Schmelz-/Zement-Uebergang
          if (m.keildefekt && vis("keildefekt")) {
            const kd = drawKeilDefekt(geo, seg);
            if (kd) host.appendChild(kd);
          }
          // Kronen-verankerte Marker: rotes X (zerstoert), Warndreieck (perk),
          // Sensibilitaets-Plus/Minus okklusal
          if (m.zahn_zerstoert && vis("zahn_zerstoert")) host.appendChild(drawDestroyedX(geo, box));
          if (m.perk_plus && vis("perk_plus")) host.appendChild(drawPerkTriangle(geo, box));
          if (m.sensibilitaet && vis("sensibilitaet")) {
            host.appendChild(drawSensMark(geo, m.sensibilitaet));
          }
        }
        if (m.implantat && vis("implantat")) {
          layer.appendChild(drawImplant(c, seg));
          // Suprakonstruktion (Krone auf Implantat): EINE buendige Form
          if (m.krone && vis("krone")) layer.appendChild(drawImplantSupra(c, defs));
        }
      }
      // Lueckenschluss: ")(" an Stelle der entfernten Krone
      if (m.lueckenschluss && vis("lueckenschluss")) {
        layer.appendChild(drawSpaceClosure(c, crownBoxOf(c)));
      }
      if (milk && host.childNodes.length) layer.appendChild(host);

      Object.keys(m).forEach((id) => {
        if (!m[id] || !vis(id) || NO_BADGE.has(id)) return;
        const b = BADGE[id];
        if (b) layer.appendChild(drawMarkBadge(c, typeof m[id] === "string" ? m[id] : b[0], b[1]));
      });
    });
    svgEl.appendChild(layer);
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
      if (markOf(s).implantat) return;
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

    // fehlende Zaehne: Silhouette + Extra-Wurzeln + Distal-Flare abdecken
    // (enges Spaltenrechteck liess Distalwurzel-Reste stehen). Knochen/Gum darueber bleiben.
    let miss = svgEl.querySelector("#missLayer");
    if (miss) miss.remove();
    miss = document.createElementNS(SVGNS, "g");
    miss.setAttribute("id", "missLayer");
    COLS.cols.forEach((c) => {
      if (!st(c.fdi).missing) return;
      appendMissCover(miss, c, defs);
    });
    svgEl.insertBefore(miss, boneLayer);

    buildBefundLayer(defs);
    buildHits();
    updateZoom();
    updateLegendCounts();
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
    clone.querySelectorAll(".hit, .flab, .flab-find, .selout").forEach((n) => n.remove());
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
    if (s.pocket && ((s.pocket.m || 0) > 0 || (s.pocket.d || 0) > 0)) {
      const pm = s.pocket.m || 0, pd = s.pocket.d || 0;
      if (pm > 3 || pd > 3 || activeTab === "Par") parts.push(pm + "/" + pd);
    }
    return parts.slice(0, 6).join("·");
  }

  function buildHits() {
    let front = svgEl.querySelector("#hitLayer");
    if (front) front.remove();
    front = document.createElementNS(SVGNS, "g");
    front.setAttribute("id", "hitLayer");

    const selD = SIL[selected];
    if (selD) {
      const sp = document.createElementNS(SVGNS, "path");
      sp.setAttribute("d", selD);
      sp.setAttribute("class", "selout");
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
        // Flaechen-Befunde nur ueber Flaechen-Hits, nicht ganze Zahnspalte
        if (armedFinding && !surfArmed) applyFindingToTooth(c.fdi, armedFinding, mode);
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
    document.getElementById("loss").value = s.loss;
    document.getElementById("miss").checked = s.missing;
    document.getElementById("lossVal").textContent = s.loss + " mm";
    document.getElementById("calVal").textContent = "Knochenabbau " + s.loss + " mm";
    const bo = document.getElementById("boneOp");
    if (bo) {
      bo.value = Math.round(boneOpacity * 100);
      document.getElementById("boneOpVal").textContent = Math.round(boneOpacity * 100) + " %";
    }
    syncParPocketUI();
  }

  const LOCK_CYCLE = [true, "I", "II", "III"];
  const VERL_CYCLE = ["nach distal", "koronal", "mesial", "apikal"];

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
      if (mode === "set") { m.verlagert = VERL_CYCLE[0]; return; }
      const cur = m.verlagert;
      const i = VERL_CYCLE.indexOf(cur);
      if (i < 0) m.verlagert = VERL_CYCLE[0];
      else if (i >= VERL_CYCLE.length - 1) delete m.verlagert;
      else m.verlagert = VERL_CYCLE[i + 1];
      return;
    }
    if (id === "sensibilitaet") {
      // 1. Klick: gruenes Plus (positiv), 2. Klick: rotes Minus (negativ),
      // 3. Klick: weg (Chef 19.07.2026)
      const cur = m.sensibilitaet;
      if (!cur) m.sensibilitaet = "+";
      else if (cur === "+" || cur === true) m.sensibilitaet = "−";
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
        // Nochmal auf dasselbe Icon: nur abschalten (kein zweites Toggle am Zahn)
        if (armedFinding === it.id) {
          armedFinding = null;
          document.body.classList.remove("finding-armed", "surface-armed");
          host.querySelectorAll(".legend-item").forEach((el) => el.classList.remove("armed"));
          render();
          return;
        }
        armedFinding = it.id;
        // Flaechen-Befunde nur armieren (Flaeche waehlen); sonst sofort setzen
        // (Versiegelung setzt direkt okklusal, ohne Flaechenwahl)
        if (!needsSurfacePick(it.id)) {
          applyFindingToTooth(selected, it.id, "set");
        }
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
    readExtraRoots(teethTxt);
    COLS.cols.forEach((c) => { SOURCE_CEJ_D[c.fdi] = cejFromRaster(c); });
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

    if (!window.PerioChart) {
      console.error("perio-chart.js fehlt – Flaechen/Implantat/Bruecke nicht verfuegbar");
    }
    COLS.cols.forEach((c) => { state[c.fdi] = emptyTooth(); });
    buildTabs();
    buildLegend();
    document.getElementById("loss").addEventListener("input", (e) => { st(selected).loss = +e.target.value; render(); });
    document.getElementById("miss").addEventListener("change", (e) => {
      const s = st(selected);
      s.missing = e.target.checked;
      if (s.missing) markOf(s).zahn_fehlt = true; else delete markOf(s).zahn_fehlt;
      render();
    });
    const onPocket = () => {
      const s = st(selected);
      if (!s.pocket) s.pocket = { m: 1, d: 1 };
      s.pocket.m = +document.getElementById("pocketM").value || 0;
      s.pocket.d = +document.getElementById("pocketD").value || 0;
      syncLossFromPockets(s);
      render();
    };
    const pm = document.getElementById("pocketM");
    const pd = document.getElementById("pocketD");
    if (pm) pm.addEventListener("input", onPocket);
    if (pd) pd.addEventListener("input", onPocket);
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
