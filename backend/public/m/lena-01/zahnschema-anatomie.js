/**
 * Lena 01 · Anatomie-Merge (Handnachzeichnung nach DENSvisuell-Vorlage).
 * Jeder Zahntyp hat eine eigene, von Hand getunte Form:
 *  - Kronen: typgerechte Schneidekante / Höcker + Randleisten
 *  - Wurzeln: kräftig, Wurzelstamm, typgerechte Zahl/Länge/Spreizung/Krümmung
 *    (OK-Molar: 2 gespreizte Bukkalwurzeln + lange Palatinalwurzel dahinter;
 *     UK-Molar: 2 breite, nahezu parallele Wurzeln; Eckzahn: längste Wurzel)
 * Farbwelt: Warm Studio. Quadranten-Spiegelung + OK-Kippung per Transform.
 */
(function () {
  "use strict";

  const FDI_OK = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const FDI_UK = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  const VB = 120; // Breite
  const VH = 248; // Höhe
  const CX = 60;
  const Y_INC = 28; // Höhe der Schneidekante / Höckerspitzen
  const Y_CEJ = 91; // kürzere klinische Krone wie in der Vektorvorlage
  const Y_ROOT = Y_CEJ - 3;

  // ── Zahntyp-Spezifikation (Rechtsquadrant-Basis, wird gespiegelt) ──────
  function typeSpec(fdi) {
    const n = fdi % 10;
    const upper = fdi < 30;
    if (upper) {
      if (n === 1) return { crown: { iH: 23, cH: 17, edge: "flat" }, roots: [{ cx: 60, w: 30, len: 108, curve: 0 }] };
      if (n === 2) return { crown: { iH: 17, cH: 13, edge: "flat" }, roots: [{ cx: 60, w: 25, len: 102, curve: 3 }] };
      if (n === 3) return { crown: { iH: 19, cH: 15, edge: "point" }, roots: [{ cx: 60, w: 30, len: 126, curve: 4 }] };
      if (n === 4) return { crown: { iH: 20, cH: 16, edge: "point" }, roots: [{ cx: 51, w: 17, len: 98, curve: -2 }, { cx: 69, w: 17, len: 98, curve: 2 }] };
      if (n === 5) return { crown: { iH: 19, cH: 16, edge: "point" }, roots: [{ cx: 60, w: 28, len: 106, curve: 0 }] };
      if (n === 6) return { crown: { iH: 31, cH: 26, edge: "cusps", humps: 2 }, roots: [{ cx: 60, w: 25, len: 106, curve: 0, behind: true }, { cx: 46, w: 21, len: 91, curve: -5 }, { cx: 74, w: 21, len: 91, curve: 5 }] };
      if (n === 7) return { crown: { iH: 29, cH: 25, edge: "cusps", humps: 2 }, roots: [{ cx: 60, w: 23, len: 98, curve: 0, behind: true }, { cx: 48, w: 20, len: 87, curve: -3 }, { cx: 72, w: 20, len: 87, curve: 3 }] };
      return { crown: { iH: 25, cH: 22, edge: "cusps", humps: 2 }, roots: [{ cx: 60, w: 21, len: 84, curve: 0, behind: true }, { cx: 51, w: 18, len: 76, curve: -1 }, { cx: 69, w: 18, len: 76, curve: 1 }] };
    }
    if (n === 1) return { crown: { iH: 15, cH: 11, edge: "flat" }, roots: [{ cx: 60, w: 22, len: 98, curve: 0 }] };
    if (n === 2) return { crown: { iH: 17, cH: 12, edge: "flat" }, roots: [{ cx: 60, w: 24, len: 102, curve: 2 }] };
    if (n === 3) return { crown: { iH: 18, cH: 14, edge: "point" }, roots: [{ cx: 60, w: 28, len: 125, curve: 4 }] };
    if (n === 4) return { crown: { iH: 19, cH: 15, edge: "point" }, roots: [{ cx: 60, w: 27, len: 105, curve: 2 }] };
    if (n === 5) return { crown: { iH: 20, cH: 17, edge: "point" }, roots: [{ cx: 60, w: 29, len: 108, curve: 0 }] };
    if (n === 6) return { crown: { iH: 31, cH: 27, edge: "cusps", humps: 3 }, roots: [{ cx: 49, w: 26, len: 101, curve: -2 }, { cx: 71, w: 26, len: 101, curve: 4 }] };
    if (n === 7) return { crown: { iH: 29, cH: 25, edge: "cusps", humps: 2 }, roots: [{ cx: 50, w: 25, len: 96, curve: -1 }, { cx: 70, w: 25, len: 96, curve: 3 }] };
    return { crown: { iH: 25, cH: 22, edge: "cusps", humps: 2 }, roots: [{ cx: 51, w: 23, len: 84, curve: -1 }, { cx: 69, w: 23, len: 84, curve: 2 }] };
  }

  // ── Krone ─────────────────────────────────────────────────────────────
  function crownPath(c) {
    const iH = c.iH;
    const cH = c.cH;
    const xIL = CX - iH;
    const xIR = CX + iH;
    const xCL = CX - cH;
    const xCR = CX + cH;
    const cornerY = c.edge === "point" ? Y_INC + 17 : c.edge === "cusps" ? Y_INC + 8 : Y_INC + 2;
    let d = "M " + xCL + " " + Y_CEJ;
    d += " C " + (xCL - 2) + " " + (Y_CEJ - 30) + " " + (xIL - 1) + " " + (cornerY + 20) + " " + xIL + " " + cornerY;
    if (c.edge === "flat") {
      const s = (xIR - xIL) / 3;
      d += " Q " + (xIL + s * 0.5).toFixed(1) + " " + Y_INC + " " + (xIL + s).toFixed(1) + " " + (cornerY - 1);
      d += " Q " + (xIL + s * 1.5).toFixed(1) + " " + Y_INC + " " + (xIL + s * 2).toFixed(1) + " " + (cornerY - 1);
      d += " Q " + (xIL + s * 2.5).toFixed(1) + " " + Y_INC + " " + xIR + " " + cornerY;
    } else if (c.edge === "point") {
      d += " L " + CX + " " + Y_INC + " L " + xIR + " " + cornerY;
    } else {
      const seg = (xIR - xIL) / c.humps;
      for (let i = 0; i < c.humps; i++) {
        const sx = xIL + seg * i;
        const px = sx + seg / 2;
        const ex = sx + seg;
        d += " Q " + (sx + seg * 0.28).toFixed(1) + " " + Y_INC + " " + px.toFixed(1) + " " + Y_INC;
        d += " Q " + (px + seg * 0.28).toFixed(1) + " " + Y_INC + " " + ex.toFixed(1) + " " + cornerY;
      }
    }
    d += " C " + (xIR + 1) + " " + (cornerY + 20) + " " + (xCR + 2) + " " + (Y_CEJ - 30) + " " + xCR + " " + Y_CEJ;
    d += " Q " + CX + " " + (Y_CEJ + 5) + " " + xCL + " " + Y_CEJ + " Z";
    return d;
  }

  function crownDetail(c) {
    const iH = c.iH;
    let d = "";
    const topY = c.edge === "point" ? Y_INC + 6 : Y_INC + 6;
    if (c.edge === "cusps") {
      const seg = (2 * iH) / c.humps;
      for (let i = 1; i < c.humps; i++) {
        const x = (CX - iH + seg * i).toFixed(1);
        d += "M " + x + " " + (Y_INC + 8) + " L " + x + " " + (Y_CEJ - 26) + " ";
      }
      // Randleisten
      d += "M " + (CX - iH + iH * 0.4).toFixed(1) + " " + (Y_INC + 10) + " L " + (CX - iH + iH * 0.4).toFixed(1) + " " + (Y_CEJ - 30) + " ";
      d += "M " + (CX + iH - iH * 0.4).toFixed(1) + " " + (Y_INC + 10) + " L " + (CX + iH - iH * 0.4).toFixed(1) + " " + (Y_CEJ - 30) + " ";
    } else if (c.edge === "point") {
      d += "M " + CX + " " + (Y_INC + 6) + " L " + CX + " " + (Y_CEJ - 26) + " ";
      d += "M " + (CX - iH * 0.5).toFixed(1) + " " + (Y_INC + 20) + " L " + (CX - iH * 0.5).toFixed(1) + " " + (Y_CEJ - 30) + " ";
      d += "M " + (CX + iH * 0.5).toFixed(1) + " " + (Y_INC + 20) + " L " + (CX + iH * 0.5).toFixed(1) + " " + (Y_CEJ - 30) + " ";
    } else {
      // Schneidezahn: Mamelon-Andeutung + zwei Randleisten
      d += "M " + (CX - iH * 0.45).toFixed(1) + " " + (Y_INC + 2) + " L " + (CX - iH * 0.45).toFixed(1) + " " + (Y_CEJ - 34) + " ";
      d += "M " + (CX + iH * 0.45).toFixed(1) + " " + (Y_INC + 2) + " L " + (CX + iH * 0.45).toFixed(1) + " " + (Y_CEJ - 34) + " ";
    }
    // Zahnhalslinie
    d += "M " + (CX - c.cH + 3) + " " + (Y_CEJ - 5) + " Q " + CX + " " + (Y_CEJ) + " " + (CX + c.cH - 3) + " " + (Y_CEJ - 5);
    return d;
  }

  function crownShine(c) {
    const x = (CX - c.iH * 0.55).toFixed(1);
    return "M " + x + " " + (Y_INC + 16) +
      " C " + (CX - c.iH * 0.7).toFixed(1) + " " + (Y_INC + 40) +
      " " + (CX - c.iH * 0.6).toFixed(1) + " " + (Y_CEJ - 34) +
      " " + (CX - c.iH * 0.5).toFixed(1) + " " + (Y_CEJ - 22);
  }

  // ── Wurzel: kräftig, runder Apex, leichte Krümmung ────────────────────
  function rootPath(r) {
    const xL = r.cx - r.w / 2;
    const xR = r.cx + r.w / 2;
    const apexX = r.cx + r.curve;
    const apexY = Y_ROOT + r.len;
    const c1y = Y_ROOT + r.len * 0.55;
    const tip = r.w * 0.32;
    return (
      "M " + xL.toFixed(1) + " " + Y_ROOT +
      " C " + (xL + r.curve * 0.3).toFixed(1) + " " + c1y.toFixed(1) +
      " " + (apexX - tip).toFixed(1) + " " + (apexY - r.w * 0.5).toFixed(1) +
      " " + apexX.toFixed(1) + " " + apexY.toFixed(1) +
      " C " + (apexX + tip).toFixed(1) + " " + (apexY - r.w * 0.5).toFixed(1) +
      " " + (xR + r.curve * 0.3).toFixed(1) + " " + c1y.toFixed(1) +
      " " + xR.toFixed(1) + " " + Y_ROOT + " Z"
    );
  }

  function rootConcavity(r) {
    const apexY = Y_ROOT + r.len * 0.62;
    return "M " + (r.cx + r.curve * 0.4).toFixed(1) + " " + (Y_ROOT + 6) +
      " L " + (r.cx + r.curve * 0.7).toFixed(1) + " " + apexY.toFixed(1);
  }

  function toothSvg(fdi) {
    const spec = typeSpec(fdi);
    const upper = fdi < 30;
    const q = Math.floor(fdi / 10);
    const isLeft = q === 2 || q === 3;

    let inner = "";
    spec.roots.filter((r) => r.behind).forEach((r) => {
      inner += '<path class="tk-root tk-root-behind" d="' + rootPath(r) + '"/>';
    });
    spec.roots.filter((r) => !r.behind).forEach((r) => {
      inner += '<path class="tk-root" d="' + rootPath(r) + '"/>';
    });
    inner += '<path class="tk-crown" d="' + crownPath(spec.crown) + '"/>';
    spec.roots.forEach((r) => { inner += '<path class="tk-concav" d="' + rootConcavity(r) + '"/>'; });
    inner += '<path class="tk-groove" d="' + crownDetail(spec.crown) + '"/>';
    inner += '<path class="tk-shine" d="' + crownShine(spec.crown) + '"/>';

    let open = "";
    let close = "";
    if (upper) { open += '<g transform="translate(0,' + VH + ') scale(1,-1)">'; close = "</g>" + close; }
    if (isLeft) { open += '<g transform="translate(' + VB + ',0) scale(-1,1)">'; close = "</g>" + close; }

    const labelY = upper ? 15 : VH - 8;
    return (
      '<svg class="tk" viewBox="0 0 ' + VB + " " + VH + '" role="img" aria-label="Zahn ' + fdi + '">' +
      open + inner + close +
      '<text x="' + CX + '" y="' + labelY + '" text-anchor="middle">' + fdi + "</text>" +
      "</svg>"
    );
  }

  function archHtml(list) {
    return '<div class="arch">' + list.map(toothSvg).join("") + "</div>";
  }

  const root = document.getElementById("chart");
  root.innerHTML =
    '<div class="jaw">Oberkiefer · 18 → 28</div>' + archHtml(FDI_OK) +
    '<div class="jaw">Unterkiefer · 48 → 38</div>' + archHtml(FDI_UK);
})();
