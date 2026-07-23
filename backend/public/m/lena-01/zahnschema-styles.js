/**
 * Lena 01 · Zeichenstil-Studie.
 * EIN anatomischer Renderer (Bukkalprofil mit korrekter Höckerzahl + Wurzeln),
 * 15 unterschiedliche Zeichenstile per CSS/SVG-Filter darübergelegt.
 * Farbwelt: Warm Studio.
 */
(function () {
  "use strict";

  const FDI_OK = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const FDI_UK = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  const STYLES = [
    ["ink", "Feine Tuschelinie", "reine Konturzeichnung, kein Füllton"],
    ["bold", "Kräftige Kontur", "dicke Outline, heller Schmelz"],
    ["flat", "Flache Füllung", "ruhige Vollflächen ohne Verlauf"],
    ["shaded", "Warm Studio 3D", "plastischer Verlauf und Schlagschatten"],
    ["hatch", "Schraffur", "diagonale Federstriche als Fläche"],
    ["stipple", "Punktraster", "Dotwork-Schattierung"],
    ["cross", "Kreuzschraffur", "gestochene Gravur-Optik"],
    ["water", "Aquarell", "weiche, leicht verlaufende Waschung"],
    ["chalk", "Kreide auf Tafel", "helle Kreidelinien auf Dunkel"],
    ["tech", "Sepia-Technik", "technische Zeichnung auf Millimeterraster"],
    ["cel", "Comic / Cel", "dicke Outline, zwei Farbtöne"],
    ["duo", "Duoton-Poster", "reduziert auf zwei Warmtöne"],
    ["pencil", "Bleistift-Skizze", "raue, handgezeichnete Linien"],
    ["emboss", "Relief / Prägung", "geprägte, erhabene Form"],
    ["woodcut", "Holzschnitt", "harter Kontrast, geschnitzte Kante"],
  ];

  function rootCount(fdi) {
    const id = String(fdi);
    if (id === "14" || id === "24") return 2;
    const n = fdi % 10;
    const upper = fdi < 30;
    if (n <= 5) return 1;
    if (n >= 6) return upper ? 3 : 2;
    return 1;
  }

  function crownW(fdi) {
    const n = fdi % 10;
    if (n >= 6) return 62; // Molaren
    if (n === 4 || n === 5) return 42; // Prämolaren
    if (n === 3) return 46; // Eckzahn
    if (fdi === 11 || fdi === 21) return 54; // obere mittlere Schneidezähne
    if (fdi === 12 || fdi === 22) return 42; // obere seitliche
    if (n === 1) return 30; // untere mittlere
    return 34; // untere seitliche
  }

  // Bukkalprofil: sichtbare Höckerzahl je Zahn
  function cuspProfile(fdi) {
    const n = fdi % 10;
    const upper = fdi < 30;
    if (n === 1 || n === 2) return { humps: 3, cusp: "round", vD: 3 }; // Mamelon-Kante
    if (n === 3) return { humps: 1, cusp: "point", vD: 0 }; // eine Spitze
    if (n === 4 || n === 5) return { humps: 1, cusp: "point", vD: 2 }; // Bukkalhöcker
    if (upper) return { humps: 2, cusp: "round", vD: 8 }; // OK-Molar: MB+DB
    if (n === 6) return { humps: 3, cusp: "round", vD: 8 }; // UK-1.Molar: MB+DB+distal
    return { humps: 2, cusp: "round", vD: 8 }; // UK-2.Molar
  }

  function geom(fdi) {
    const w = crownW(fdi);
    const cx = 50;
    const neckW = w * 0.62;
    const cp = cuspProfile(fdi);
    return Object.assign({
      w,
      neckW,
      xCrownL: cx - w / 2,
      xCrownR: cx + w / 2,
      xNeckL: cx - neckW / 2,
      xNeckR: cx + neckW / 2,
      yInc: 30,
      yCerv: 98,
    }, cp);
  }

  function crownSilhouette(g) {
    const { xCrownL, xCrownR, xNeckL, xNeckR, yInc, yCerv, humps, cusp, vD } = g;
    const seg = (xCrownR - xCrownL) / humps;
    let d = "M " + xNeckL + " " + yCerv;
    d += " C " + (xCrownL - 1) + " " + (yCerv - 26) + ", " + xCrownL + " " + (yInc + vD + 10) + ", " + xCrownL + " " + (yInc + vD);
    for (let i = 0; i < humps; i++) {
      const sx = xCrownL + seg * i;
      const px = sx + seg / 2;
      const ex = sx + seg;
      if (cusp === "point") {
        d += " L " + px.toFixed(1) + " " + yInc + " L " + ex.toFixed(1) + " " + (yInc + vD);
      } else {
        d += " Q " + (sx + seg * 0.28).toFixed(1) + " " + yInc + " " + px.toFixed(1) + " " + yInc;
        d += " Q " + (px + seg * 0.28).toFixed(1) + " " + yInc + " " + ex.toFixed(1) + " " + (yInc + vD);
      }
    }
    d += " C " + xCrownR + " " + (yInc + vD + 10) + ", " + (xCrownR + 1) + " " + (yCerv - 26) + ", " + xNeckR + " " + yCerv;
    d += " Q 50 " + (yCerv + 5) + " " + xNeckL + " " + yCerv + " Z";
    return d;
  }

  function anatomyLines(g) {
    const seg = (g.xCrownR - g.xCrownL) / g.humps;
    let d = "";
    for (let i = 1; i < g.humps; i++) {
      const x = (g.xCrownL + seg * i).toFixed(1);
      d += "M " + x + " " + (g.yInc + g.vD) + " L " + x + " " + (g.yCerv - 22) + " ";
    }
    if (g.cusp === "point") {
      d += "M 50 " + (g.yInc + 4) + " L 50 " + (g.yCerv - 22) + " ";
    }
    d += "M " + (g.xNeckL + 2) + " " + (g.yCerv - 6) + " Q 50 " + (g.yCerv - 1) + " " + (g.xNeckR - 2) + " " + (g.yCerv - 6);
    return d;
  }

  function taperPath(x, y, w, len, curve) {
    const ax = x + w / 2 + curve;
    const ay = y + len;
    return "M " + x.toFixed(1) + " " + y + " C " + (x - 1).toFixed(1) + " " + (y + len * 0.42).toFixed(1) +
      " " + (ax - 3).toFixed(1) + " " + (ay - 9).toFixed(1) + " " + ax.toFixed(1) + " " + ay.toFixed(1) +
      " C " + (ax + 3).toFixed(1) + " " + (ay - 9).toFixed(1) + " " + (x + w + 1).toFixed(1) + " " + (y + len * 0.42).toFixed(1) +
      " " + (x + w).toFixed(1) + " " + y + " Z";
  }

  function rootShapes(fdi, g) {
    const n = rootCount(fdi);
    const yTop = g.yCerv - 2;
    if (n === 1) {
      const len = fdi % 10 === 3 ? 72 : 62; // Eckzahn längste Wurzel
      const w = g.neckW * 0.5;
      return [{ d: taperPath(50 - w / 2, yTop, w, len, 0) }];
    }
    if (n === 2) {
      const len = 56;
      const w = g.neckW * 0.36;
      return [
        { d: taperPath(g.xNeckL + 1, yTop, w, len, -6) },
        { d: taperPath(g.xNeckR - 1 - w, yTop, w, len, 6) },
      ];
    }
    const len = 52; // OK-Molar: 2 bukkale + 1 palatinale (hinten) Wurzel
    const w = g.neckW * 0.3;
    return [
      { d: taperPath(50 - w * 0.55, yTop - 1, w * 1.1, len + 5, 0), behind: true },
      { d: taperPath(g.xNeckL, yTop, w, len, -8) },
      { d: taperPath(g.xNeckR - w, yTop, w, len, 8) },
    ];
  }

  function toothSvg(fdi) {
    const g = geom(fdi);
    const upper = fdi < 30;
    const roots = rootShapes(fdi, g)
      .map((r) => '<path class="tk-root' + (r.behind ? " tk-root-behind" : "") + '" d="' + r.d + '"/>')
      .join("");
    const crown = '<path class="tk-crown" d="' + crownSilhouette(g) + '"/>';
    const anat = '<path class="tk-anat" d="' + anatomyLines(g) + '"/>';
    const flip = upper ? ' transform="translate(0,178) scale(1,-1)"' : "";
    const labelY = upper ? 14 : 172;
    return (
      '<svg class="tk" viewBox="0 0 100 178" role="img" aria-label="Zahn ' + fdi + '">' +
      "<g" + flip + ">" + roots + crown + anat + "</g>" +
      '<text x="50" y="' + labelY + '" text-anchor="middle">' + fdi + "</text>" +
      "</svg>"
    );
  }

  function archHtml(list) {
    return '<div class="chart-teeth">' + list.map(toothSvg).join("") + "</div>";
  }

  const gallery = document.getElementById("gallery");
  STYLES.forEach(([key, title, desc], index) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML =
      '<div class="card-head"><div class="card-title"><b>' + String(index + 1).padStart(2, "0") +
      " · " + title + "</b><span>" + desc + "</span></div>" +
      '<button type="button" class="pick">Diesen Stil wählen</button></div>' +
      '<div class="chart st-' + key + '">' +
      '<div class="jaw">Oberkiefer · 18 → 28</div>' + archHtml(FDI_OK) +
      '<div class="jaw">Unterkiefer · 48 → 38</div>' + archHtml(FDI_UK) +
      "</div>";
    gallery.appendChild(card);
    card.querySelector(".pick").addEventListener("click", () => {
      document.querySelectorAll(".card.is-picked").forEach((el) => el.classList.remove("is-picked"));
      card.classList.add("is-picked");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
})();
