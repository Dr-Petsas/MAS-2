/**
 * Lena 01-Odontogramm — schichtbasiertes SVG.
 * Base (Zahnform+Wurzeln) + Overlays (Karies, Füllung, Krone, WF, Belag, …)
 * + Arch-Layer (Gingiva-Linie, Brückenband).
 */
(function (global) {
  "use strict";

  const FDI_OK = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const FDI_UK = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  let svgSerial = 0;

  function toothKind(fdi) {
    const n = fdi % 10;
    if (n === 1 || n === 2) return "incisor";
    if (n === 3) return "canine";
    if (n === 4 || n === 5) return "premolar";
    return "molar";
  }

  function rootCount(fdi) {
    // Wie struktur01 / Anatomie: OK-1. Prämolar (14/24) = 2 Wurzeln;
    // OK-Molaren 16–18/26–28 = 3; UK-Molaren = 2; sonst 1.
    const id = String(fdi);
    if (id === "14" || id === "24") return 2;
    const n = fdi % 10;
    const upper = fdi < 30;
    if (n <= 5) return 1;
    if (n >= 6) return upper ? 3 : 2;
    return 1;
  }

  function isUpper(fdi) {
    return fdi < 30;
  }

  /** Leerer Zahnstatus */
  function emptyTooth() {
    return {
      missing: false,
      surfaces: {}, // m,o,d,b,l → caries|fill|belag|facette
      crown: null, // 'ok' | 'bad' | null
      endo: null, // 'ok' | 'bad' | null
      implant: false,
      bridge: null, // 'pillar' | 'pontic' | null
      note: "",
      bedarf: "",
    };
  }

  function demoState() {
    const teeth = {};
    [...FDI_OK, ...FDI_UK].forEach((n) => { teeth[n] = emptyTooth(); });
    teeth[18].missing = true;
    teeth[28].missing = true;
    teeth[14].surfaces = { o: "facette" };
    teeth[14].note = "Schlifffacette occlusal";
    teeth[16].crown = "bad";
    teeth[16].note = "VMK-Krone insuffizient, Randundicht";
    teeth[16].bedarf = "ZE Krone 16 erneuern";
    teeth[24].surfaces = { d: "caries" };
    teeth[24].bedarf = "KCH Füllung 24";
    teeth[26].implant = true;
    teeth[26].crown = "ok";
    teeth[26].note = "Implantat + Krone intakt";
    teeth[44].surfaces = { l: "belag", b: "belag", o: "fill" };
    teeth[44].note = "Zahnstein stark; Füllung O intakt";
    teeth[44].bedarf = "PRO PZR";
    teeth[46].endo = "bad";
    teeth[46].note = "Wurzelfüllung insuffizient";
    teeth[46].bedarf = "KCH Revision Endo 46";
    teeth[34].crown = "ok";
    teeth[34].bridge = "pillar";
    teeth[34].note = "Pfeiler Brücke 34–36, Geschiebe distal";
    teeth[35].missing = true;
    teeth[35].bridge = "pontic";
    teeth[35].note = "Brückenglied";
    teeth[36].crown = "ok";
    teeth[36].bridge = "pillar";
    teeth[37].surfaces = { m: "caries", o: "caries", d: "caries" };
    teeth[37].bedarf = "KCH Komposit 37 MOD";
    return teeth;
  }

  // ── Geometrie (viewBox 0 0 100 160) ───────────────────────────────────
  // Vier anatomische Kronenfamilien statt austauschbarer Rechtecke.

  function crownBox(fdi) {
    const n = fdi % 10;
    // 11/21 dominieren; 12/22 liegen zwischen ihnen und der schmalen UK-Front.
    if (fdi === 11 || fdi === 21) return { x: 26, y: 26, w: 48, h: 62 };
    if (fdi === 12 || fdi === 22) return { x: 30, y: 30, w: 40, h: 57 };
    if (n === 1 || n === 2) return { x: 34, y: 34, w: 32, h: 52 };
    if (n === 3) return { x: 23, y: 21, w: 54, h: 67 };
    if (n === 4 || n === 5) return { x: 24, y: 27, w: 52, h: 61 };
    return { x: 17, y: 27, w: 66, h: 63 };
  }

  function crownOutline(fdi) {
    const n = fdi % 10;
    if (fdi === 11 || fdi === 21) {
      return "M27 29 Q50 24 73 29 L72 43 Q71 60 66 76 Q63 85 59 88 H41 Q37 85 34 76 Q29 60 28 43 Z";
    }
    if (fdi === 12 || fdi === 22) {
      return "M31 33 Q50 28 69 33 L68 45 Q67 61 63 75 Q60 84 57 87 H43 Q40 84 37 75 Q33 60 32 45 Z";
    }
    if (n === 1 || n === 2) {
      // Breite Schneidekante, konvexe Flanken, deutliche Einziehung am Zahnhals.
      return "M35 37 Q50 32 65 37 L64 47 Q63 62 59 75 Q57 83 55 86 H45 Q43 83 41 75 Q37 62 36 47 Z";
    }
    if (n === 3) {
      // Eine dominante Höckerspitze mit mesialer und distaler Schulter.
      return "M24 43 Q30 34 39 33 Q45 24 50 19 Q55 24 61 33 Q70 35 76 43 Q74 61 68 77 Q64 86 59 88 H41 Q36 86 32 77 Q26 61 24 43 Z";
    }
    if (n === 4 || n === 5) {
      // Zwei Höcker mit zentraler Kerbe; zum Zahnhals schmaler.
      return "M24 43 Q27 34 37 32 Q44 24 50 32 Q56 25 64 32 Q73 34 76 43 Q75 61 69 77 Q65 86 60 88 H40 Q35 86 31 77 Q25 61 24 43 Z";
    }
    // Molar: breite, kompakte klinische Krone mit natürlicher Höckerkante.
    return "M18 45 C19 37 24 32 31 32 C35 25 41 24 46 31 C51 24 57 24 62 31 C69 28 77 33 81 41 C83 50 80 63 75 75 C71 84 66 89 61 90 H39 C34 89 29 84 25 75 C20 63 17 52 18 45 Z";
  }

  function crownAnatomy(fdi) {
    const n = fdi % 10;
    if (n === 1 || n === 2) {
      return "M39 39 Q43 48 42 63 M61 39 Q57 48 58 63 M42 71 Q50 76 58 71";
    }
    if (n === 3) {
      return "M50 28 V69 M35 43 Q43 47 50 58 Q57 47 66 43 M40 72 Q50 77 60 72";
    }
    if (n === 4 || n === 5) {
      return "M36 36 Q43 45 49 56 Q56 45 65 36 M49 36 V72 M36 67 Q49 75 64 67";
    }
    return "M28 40 Q38 45 49 55 Q61 45 73 40 M49 31 V73 M26 62 Q38 57 49 55 Q61 57 75 62 M35 34 Q42 41 49 46 Q57 40 66 34 M34 72 Q49 79 67 72";
  }

  /** Prothetische Krone folgt der vollständigen anatomischen Außenkontur. */
  function crownCapPath(fdi) {
    return crownOutline(fdi);
  }

  /** Wurzeln als abgerundete Rechtecke (struktur01-Stil) */
  function rootPaths(fdi, kind) {
    const n = rootCount(fdi);
    const upper = isUpper(fdi);
    const cej = crownBox(fdi).y + crownBox(fdi).h; // Unterkante Krone
    const y0 = cej - 2;
    if (n === 1) {
      const w = kind === "incisor" ? 16 : 20;
      return [{ key: "single", x: 50 - w / 2, y: y0, w, h: upper ? 52 : 56 }];
    }
    if (n === 2) {
      const w = 15;
      const h = upper ? 50 : 54;
      return [
        { key: "mesial", x: 28, y: y0, w, h },
        { key: "distal", x: 57, y: y0, w, h },
      ];
    }
    // Molar OK: 3 Wurzeln — schlank, parallel, klare Spitzen (rx unten)
    const hSide = upper ? 46 : 50;
    const hMid = upper ? 54 : 58;
    return [
      { key: "mesial", x: 22, y: y0, w: 14, h: hSide },
      { key: "zentral", x: 43, y: y0, w: 14, h: hMid },
      { key: "distal", x: 64, y: y0, w: 14, h: hSide },
    ];
  }

  function rootRectSvg(r, fill, stroke, sw) {
    // Unten leicht spitz: trapezoid via path, aber ruhig
    const tip = 3;
    const x1 = r.x;
    const x2 = r.x + r.w;
    const xm1 = r.x + tip;
    const xm2 = r.x + r.w - tip;
    const y1 = r.y;
    const y2 = r.y + r.h;
    const d =
      "M" + x1 + " " + y1 +
      " H" + x2 +
      " L" + xm2 + " " + y2 +
      " L" + xm1 + " " + y2 + " Z";
    return (
      '<path class="base-root" data-root="' + r.key + '" d="' + d + '"' +
      ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linejoin="round"/>'
    );
  }

  /** Surface hit zones innerhalb der Kronen-Box */
  function surfaceRegions(fdi) {
    const b = crownBox(fdi);
    const ix = 5;
    const iy = 4;
    const x = b.x + ix;
    const y = b.y + iy;
    const w = b.w - ix * 2;
    const h = b.h - iy * 2;
    const midX = x + w * 0.33;
    const midW = w * 0.34;
    return {
      b: { x: x + w * 0.15, y: y, w: w * 0.7, h: h * 0.28 },
      m: { x: x, y: y + h * 0.28, w: w * 0.33, h: h * 0.44 },
      o: { x: midX, y: y + h * 0.28, w: midW, h: h * 0.44 },
      d: { x: x + w * 0.67, y: y + h * 0.28, w: w * 0.33, h: h * 0.44 },
      l: { x: x + w * 0.15, y: y + h * 0.72, w: w * 0.7, h: h * 0.28 },
    };
  }

  const SURFACE_COLOR = {
    caries: "#c62828",
    fill: "#1565c0",
    belag: "#6d4c41",
    facette: "#ffb74d",
  };

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Overlay-Bausteine (je Overlay eigene SVG-Gruppe) ─────────────────

  function overlaySurfaces(surfaces, fdi) {
    if (!surfaces || !Object.keys(surfaces).length) return "";
    const reg = surfaceRegions(fdi);
    return Object.entries(surfaces).map(([key, kind]) => {
      const r = reg[key];
      if (!r || !SURFACE_COLOR[kind]) return "";
      return (
        '<rect class="ov-surface ov-' + kind + '" data-overlay="surface-' + key + '"' +
        ' x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"' +
        ' rx="3" fill="' + SURFACE_COLOR[kind] + '" opacity="0.88"/>'
      );
    }).join("");
  }

  function overlayCrown(fdi, status, uid) {
    if (!status) return "";
    const bad = status === "bad";
    const stroke = bad ? "#be123c" : "#db2777";
    const b = crownBox(fdi);
    const seamY = b.y + b.h - 1;
    const shineX = b.x + b.w * 0.32;
    return (
      '<g class="ov-crown-shell" data-overlay="crown" filter="url(#toothShadow-' + uid + ')">' +
      '<path class="ov-crown" d="' + crownCapPath(fdi) + '"' +
      ' fill="url(#crownShell-' + uid + ')" stroke="' + stroke + '" stroke-width="2.2"/>' +
      '<path class="ov-crown-anatomy" d="' + crownAnatomy(fdi) + '"' +
      ' fill="none" stroke="var(--crown-detail,#9d4771)" stroke-width="1.1" opacity=".58"/>' +
      '<path class="ov-crown-shine" d="M' + shineX + " " + (b.y + 4) +
      " C" + (shineX - 5) + " " + (b.y + 16) + "," + (shineX - 3) + " " + (b.y + 31) + "," + shineX + " " + (b.y + 39) + '"' +
      ' fill="none" stroke="rgba(255,255,255,.72)" stroke-width="3.2" stroke-linecap="round"/>' +
      (bad
        ? '<path class="ov-crown-defect" d="M' + (b.x - 1) + " " + seamY +
          " H" + (b.x + b.w + 1) + '" fill="none" stroke="#be123c" stroke-width="2.8" stroke-dasharray="5 2"/>' +
          '<path class="ov-crown-crack" d="M' + (b.x + b.w * .68) + " " + (b.y + 2) +
          " l-5 10 6 8 -5 10" + '" fill="none" stroke="#9f1239" stroke-width="1.8"/>'
        : "") +
      "</g>"
    );
  }

  function overlayEndo(roots, status) {
    if (!status) return "";
    const fill = status === "bad" ? "#c62828" : "#6a1b9a";
    const op = status === "bad" ? "0.55" : "0.45";
    return roots.map((r) => {
      // Kanalstreifen in der Wurzelmitte
      const cw = Math.max(4, r.w * 0.4);
      const cx = r.x + (r.w - cw) / 2;
      return (
        '<rect class="ov-endo" data-overlay="endo-' + r.key + '"' +
        ' x="' + cx + '" y="' + (r.y + 2) + '" width="' + cw + '" height="' + (r.h - 6) + '"' +
        ' rx="2" fill="' + fill + '" fill-opacity="' + op + '"/>'
      );
    }).join("");
  }

  function overlayImplant(uid) {
    return (
      '<g class="ov-implant" data-overlay="implant" filter="url(#toothShadow-' + uid + ')">' +
      '<rect x="44" y="90" width="12" height="52" rx="2" fill="url(#implantMetal-' + uid + ')" stroke="#1565c0" stroke-width="1.5"/>' +
      '<path d="M40 90 H60" stroke="#1565c0" stroke-width="2"/>' +
      '<path d="M42 102 H58 M42 114 H58 M42 126 H58" stroke="#1565c0" stroke-width="1.2"/>' +
      "</g>"
    );
  }

  function overlayMissing() {
    return (
      '<g class="ov-missing" data-overlay="missing" opacity="0.55">' +
      '<line x1="28" y1="40" x2="72" y2="130" stroke="#78909c" stroke-width="3"/>' +
      '<line x1="72" y1="40" x2="28" y2="130" stroke="#78909c" stroke-width="3"/>' +
      "</g>"
    );
  }

  function overlayPontic(fdi) {
    return (
      '<g class="ov-pontic" data-overlay="pontic">' +
      '<path d="' + crownOutline(fdi) + '" fill="#e1bee7" stroke="#8e24aa" stroke-width="2" stroke-dasharray="5 3"/>' +
      "</g>"
    );
  }

  function baseToothSvg(fdi, kind, roots, opts) {
    // Basisgeometrie: Krone oben, Wurzeln unten (= UK).
    // OK spiegeln → Wurzeln oberhalb der Krone (Richtung Vestibulum/oben).
    const flip = isUpper(fdi);
    const transform = flip ? 'transform="translate(0,160) scale(1,-1)"' : "";
    const bodyFill = opts.ghost ? "#eceff1" : "url(#crownBody-" + opts.uid + ")";
    const rootFill = opts.ghost ? "#e0e0e0" : "url(#rootBody-" + opts.uid + ")";
    const stroke = opts.selected ? "#0d9488" : "#5c6570";
    const sw = opts.selected ? 2.6 : 1.8;
    const reg = surfaceRegions(fdi);
    const b = crownBox(fdi);

    const rootSvg = roots.map((r) => rootRectSvg(r, rootFill, stroke, sw)).join("");
    const guides = ["b", "m", "o", "d", "l"].map((k) => {
      const r = reg[k];
      return '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="2"/>';
    }).join("");

    return (
      "<g " + transform + ">" +
      rootSvg +
      '<path class="base-crown" d="' + crownOutline(fdi) + '"' +
      ' fill="' + bodyFill + '" stroke="' + stroke + '" stroke-width="' + sw + '" filter="url(#toothShadow-' + opts.uid + ')"/>' +
      '<path class="crown-anatomy" d="' + crownAnatomy(fdi) + '"' +
      ' fill="none" stroke="var(--tooth-detail,#81786c)" stroke-width="1.15" stroke-linecap="round" opacity=".46"/>' +
      '<path class="tooth-depth" d="M' + (b.x + b.w - 4) + " " + (b.y + 7) +
      " V" + (b.y + b.h - 8) + '" fill="none" stroke="var(--tooth-depth,#9aa5ab)" stroke-width="3" stroke-linecap="round" opacity=".38"/>' +
      '<path class="tooth-highlight" d="M' + (b.x + 9) + " " + (b.y + 8) +
      " C" + (b.x + 5) + " " + (b.y + 22) + "," + (b.x + 7) + " " + (b.y + 37) + "," + (b.x + 10) + " " + (b.y + 45) + '"' +
      ' fill="none" stroke="var(--tooth-shine,#fff)" stroke-width="3.4" stroke-linecap="round" opacity=".72"/>' +
      '<g class="base-guides" opacity="0.22" fill="none" stroke="' + stroke + '" stroke-width="0.8">' +
      guides +
      "</g>" +
      "</g>"
    );
  }

  function renderToothSvg(fdi, state, selected) {
    const t = state || emptyTooth();
    const kind = toothKind(fdi);
    const roots = rootPaths(fdi, kind);
    const sel = selected === fdi;
    const uid = fdi + "-" + (++svgSerial);

    let overlays = "";
    if (t.missing && t.bridge === "pontic") {
      overlays += overlayPontic(fdi);
    } else if (t.missing) {
      overlays += baseToothSvg(fdi, kind, roots, { ghost: true, selected: sel, uid });
      overlays += overlayMissing();
    } else {
      overlays += baseToothSvg(fdi, kind, roots, { selected: sel, uid });
      const flipT = isUpper(fdi) ? 'transform="translate(0,160) scale(1,-1)"' : "";
      if (t.implant) overlays += "<g " + flipT + ">" + overlayImplant(uid) + "</g>";
      else overlays += "<g " + flipT + ">" + overlayEndo(roots, t.endo) + "</g>";
      overlays += "<g " + flipT + ">" + overlaySurfaces(t.surfaces, fdi) + "</g>";
      overlays += "<g " + flipT + ">" + overlayCrown(fdi, t.crown, uid) + "</g>";
    }

    // Nummer außen am Bogen: OK oben, UK unten (nicht mitspiegeln)
    const labelY = isUpper(fdi) ? 12 : 152;

    return (
      '<svg class="tooth-svg' + (sel ? " is-sel" : "") + (t.bridge ? " is-bridge" : "") + '"' +
      ' viewBox="0 0 100 160" data-fdi="' + fdi + '" role="img" aria-label="Zahn ' + fdi + '">' +
      '<defs>' +
      '<linearGradient id="crownBody-' + uid + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="var(--tooth-hi,#ffffff)"/>' +
      '<stop offset=".48" stop-color="var(--tooth-mid,#f7f1e5)"/>' +
      '<stop offset="1" stop-color="var(--tooth-lo,#c9c1b2)"/></linearGradient>' +
      '<linearGradient id="rootBody-' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="var(--root-lo,#c9c1b2)"/>' +
      '<stop offset=".42" stop-color="var(--root-hi,#f3eee4)"/>' +
      '<stop offset="1" stop-color="var(--root-lo,#c9c1b2)"/></linearGradient>' +
      '<linearGradient id="crownShell-' + uid + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="var(--crown-hi,#fff4fb)"/>' +
      '<stop offset=".45" stop-color="var(--crown-mid,#f6a8cf)"/>' +
      '<stop offset="1" stop-color="var(--crown-lo,#bd3f80)"/></linearGradient>' +
      '<linearGradient id="implantMetal-' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#607d8b"/><stop offset=".42" stop-color="#e9f4f8"/>' +
      '<stop offset=".62" stop-color="#90a4ae"/><stop offset="1" stop-color="#455a64"/></linearGradient>' +
      '<filter id="toothShadow-' + uid + '" x="-30%" y="-25%" width="170%" height="170%">' +
      '<feDropShadow dx="1.5" dy="2.5" stdDeviation="1.8" flood-color="var(--tooth-shadow,#263238)" flood-opacity=".28"/></filter>' +
      '</defs>' +
      overlays +
      '<text class="tooth-num" x="50" y="' + labelY + '" text-anchor="middle" font-size="11" font-weight="800" fill="#1a1f2a">' +
      fdi + "</text>" +
      "</svg>"
    );
  }

  /** Gingiva: rote Linie entlang CEJ der Reihe */
  function gingivaPolyline(upper) {
    // relative positions across 16 teeth — horizontal line with slight arch
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const x = (i + 0.5) / 16 * 100;
      const bulge = Math.sin((i / 15) * Math.PI) * 2.2;
      const y = upper ? 58 + bulge : 42 - bulge;
      pts.push(x.toFixed(2) + "," + y.toFixed(2));
    }
    return pts.join(" ");
  }

  function renderArch(container, fdis, teeth, selected, upper) {
    const cells = fdis.map((n) => (
      '<button type="button" class="tooth-cell" data-fdi="' + n + '" title="Zahn ' + n + '">' +
      renderToothSvg(n, teeth[n], selected) +
      "</button>"
    )).join("");

    // Brückenband 34–36 nur UK
    let bridge = "";
    if (!upper) {
      const i34 = fdis.indexOf(34);
      const i36 = fdis.indexOf(36);
      if (i34 >= 0 && i36 >= 0) {
        const left = (i34 / 16) * 100;
        const width = ((i36 - i34 + 1) / 16) * 100;
        bridge =
          '<div class="bridge-band" style="left:' + left + "%;width:" + width + '%" title="Brücke 34–36"></div>';
      }
    }

    container.innerHTML =
      '<div class="arch-wrap">' +
      '<div class="gingiva-layer" aria-hidden="true">' +
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<polyline class="gingiva-line" points="' + gingivaPolyline(upper) + '"' +
      ' fill="none" stroke="#e53935" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg></div>" +
      bridge +
      '<div class="arch-teeth">' + cells + "</div>" +
      "</div>";
  }

  function summarize(fdi, t) {
    if (!t) return { lines: ["—"], bedarf: "" };
    const lines = [];
    if (t.missing && t.bridge === "pontic") lines.push("Brückenglied");
    else if (t.missing) lines.push("Zahn fehlt");
    const fl = { m: "M", o: "O", d: "D", b: "B", l: "L" };
    const names = { caries: "Karies", fill: "Füllung", belag: "Belag", facette: "Schlifffacette" };
    Object.entries(t.surfaces || {}).forEach(([k, v]) => {
      lines.push((names[v] || v) + " " + (fl[k] || k));
    });
    if (t.crown === "bad") lines.push("Krone insuffizient");
    else if (t.crown === "ok") lines.push("Krone");
    if (t.endo === "bad") lines.push("Wurzelfüllung insuffizient");
    else if (t.endo === "ok") lines.push("Wurzelfüllung");
    if (t.implant) lines.push("Implantat");
    if (t.bridge === "pillar") lines.push("Brückenpfeiler");
    if (t.note) lines.push(t.note);
    if (!lines.length) lines.push("unauffällig");
    return { lines, bedarf: t.bedarf || "" };
  }

  function render(rootEl, state) {
    if (!rootEl) return;
    const teeth = state.teeth || demoState();
    const selected = state.selected || 16;
    const ok = rootEl.querySelector("[data-arch=ok]");
    const uk = rootEl.querySelector("[data-arch=uk]");
    if (ok) renderArch(ok, FDI_OK, teeth, selected, true);
    if (uk) renderArch(uk, FDI_UK, teeth, selected, false);

    const detail = rootEl.querySelector("[data-detail]");
    if (detail) {
      const sum = summarize(selected, teeth[selected]);
      detail.innerHTML =
        '<div class="d-hero">' +
        '<div class="d-big">' + renderToothSvg(selected, teeth[selected], selected) + "</div>" +
        "<div><h3>Zahn " + selected + "</h3>" +
        '<p class="d-sub">SVG-Schichten · Base + Overlays</p></div></div>' +
        "<ul class=\"d-list\">" + sum.lines.map((l) => "<li>" + esc(l) + "</li>").join("") + "</ul>" +
        (sum.bedarf
          ? '<div class="d-bedarf">' + esc(sum.bedarf) + "<small>→ Termin / Aufklärung / Behandlung</small></div>"
          : '<div class="d-bedarf none">Kein akuter Bedarf</div>') +
        '<div class="d-layers">' +
        "<span>base</span><span>surfaces</span><span>crown</span><span>endo</span><span>gingiva</span>" +
        "</div>";
    }
  }

  function bind(rootEl, state, onChange) {
    rootEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-fdi]");
      if (!btn) return;
      state.selected = Number(btn.getAttribute("data-fdi"));
      render(rootEl, state);
      if (typeof onChange === "function") onChange(state);
    });
  }

  global.Lena01Odontogram = {
    FDI_OK,
    FDI_UK,
    emptyTooth,
    demoState,
    render,
    bind,
    summarize,
    renderToothSvg,
  };
})(typeof window !== "undefined" ? window : globalThis);
