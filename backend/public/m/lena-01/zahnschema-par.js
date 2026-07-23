/**
 * Lena 01 · Parodontologie-Odontogramm (gerade Reihen, kein Bogen).
 * Zahn (Krone + volle Wurzel) wird immer komplett gezeichnet.
 * Knochen und Zahnfleisch liegen als PARAMETRISCHE Schichten darüber und
 * lassen sich absenken → Knochenabbau (horizontal/vertikal) + Rezession,
 * die Wurzel wird dabei sichtbar. Werte je Zahn steuerbar (Klick + Slider).
 */
(function () {
  "use strict";

  const FDI_OK = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const FDI_UK = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  const COL = 76;
  const Y_OCC = 36;
  const Y_CEJ = 108;
  const Y_APEX_LIMIT = 250;
  const Y_BOTTOM = 246;
  const MM = 4; // Pixel pro Millimeter
  const CREST_HEALTHY = 8; // gesunder Knochenkamm 2 mm unter SZG (8 px)

  const state = {};
  [...FDI_OK, ...FDI_UK].forEach((fdi) => {
    state[fdi] = { loss: 0, rec: 0, missing: false };
  });
  let selected = 36;

  function typ(fdi) {
    const n = fdi % 10;
    const up = fdi < 30;
    if (n === 1 || n === 2) return { kind: "incisor", w: up && n === 1 ? 46 : 38, rc: 1, rl: 96 };
    if (n === 3) return { kind: "canine", w: 46, rc: 1, rl: 120 };
    if (n === 4) return { kind: "premolar", w: 44, rc: up ? 2 : 1, rl: 100 };
    if (n === 5) return { kind: "premolar", w: 44, rc: 1, rl: 104 };
    if (n === 6) return { kind: "molar", w: 64, rc: up ? 3 : 2, rl: 98 };
    if (n === 7) return { kind: "molar", w: 60, rc: up ? 3 : 2, rl: 92 };
    return { kind: "molar", w: 54, rc: up ? 3 : 2, rl: 80 };
  }

  function crownPath(cx, w, kind) {
    const l = cx - w / 2;
    const r = cx + w / 2;
    const top = Y_OCC;
    const cej = Y_CEJ;
    const eY = kind === "incisor" ? top + 7 : top + 11;
    const nl = cx - w * 0.34;
    const nr = cx + w * 0.34;
    let d = "M" + nl + " " + cej;
    d += " C" + (l - 2) + " " + (cej - 18) + " " + (l - 1) + " " + (eY + 16) + " " + l + " " + eY;
    if (kind === "incisor") {
      d += " Q" + cx + " " + top + " " + r + " " + eY;
    } else if (kind === "canine") {
      d += " Q" + cx + " " + (top - 5) + " " + r + " " + eY;
    } else if (kind === "premolar") {
      d += " Q" + (cx - w * 0.24) + " " + top + " " + cx + " " + (top + 5) +
        " Q" + (cx + w * 0.24) + " " + top + " " + r + " " + eY;
    } else {
      d += " Q" + (cx - w * 0.28) + " " + top + " " + (cx - w * 0.11) + " " + (top + 6) +
        " Q" + cx + " " + (top + 1) + " " + (cx + w * 0.11) + " " + (top + 6) +
        " Q" + (cx + w * 0.28) + " " + top + " " + r + " " + eY;
    }
    d += " C" + (r + 1) + " " + (eY + 16) + " " + (r + 2) + " " + (cej - 18) + " " + nr + " " + cej;
    d += " Q" + cx + " " + (cej + 5) + " " + nl + " " + cej + " Z";
    return d;
  }

  function taper(x, w, len, curve) {
    const xl = x - w / 2;
    const xr = x + w / 2;
    const ax = x + curve;
    const ay = Y_CEJ - 1 + len;
    return "M" + xl.toFixed(1) + " " + (Y_CEJ - 1) +
      " C" + xl.toFixed(1) + " " + (Y_CEJ - 1 + len * 0.5).toFixed(1) +
      " " + (ax - w * 0.3).toFixed(1) + " " + (ay - w * 0.5).toFixed(1) + " " + ax.toFixed(1) + " " + ay.toFixed(1) +
      " C" + (ax + w * 0.3).toFixed(1) + " " + (ay - w * 0.5).toFixed(1) +
      " " + xr.toFixed(1) + " " + (Y_CEJ - 1 + len * 0.5).toFixed(1) + " " + xr.toFixed(1) + " " + (Y_CEJ - 1) + " Z";
  }

  function rootPaths(cx, neckW, count, len) {
    if (count === 1) return [{ d: taper(cx, neckW * 0.5, len, 0) }];
    if (count === 2) return [
      { d: taper(cx - neckW * 0.24, neckW * 0.42, len, -3) },
      { d: taper(cx + neckW * 0.24, neckW * 0.42, len, 3) },
    ];
    return [
      { d: taper(cx, neckW * 0.32, len + 8, 0), behind: true },
      { d: taper(cx - neckW * 0.3, neckW * 0.34, len, -4) },
      { d: taper(cx + neckW * 0.3, neckW * 0.34, len, 4) },
    ];
  }

  function toothGroup(fdi, cx) {
    const t = typ(fdi);
    const s = state[fdi];
    if (s.missing) {
      return '<g class="tooth-missing" data-fdi="' + fdi + '"></g>';
    }
    const neckW = t.w * 0.7;
    const roots = rootPaths(cx, neckW, t.rc, t.rl);
    let g = '<g class="tooth" data-fdi="' + fdi + '">';
    roots.filter((r) => r.behind).forEach((r) => { g += '<path class="root behind" d="' + r.d + '"/>'; });
    roots.filter((r) => !r.behind).forEach((r) => { g += '<path class="root" d="' + r.d + '"/>'; });
    g += '<path class="crown" d="' + crownPath(cx, t.w, t.kind) + '"/>';
    g += "</g>";
    return g;
  }

  function crestY(fdi) {
    return Y_CEJ + CREST_HEALTHY + state[fdi].loss * MM;
  }
  function marginY(fdi) {
    return Y_CEJ - 2 + state[fdi].rec * MM;
  }

  function smooth(points) {
    // weiche Polylinie durch Punkte {x,y}
    if (!points.length) return "";
    let d = "M" + points[0].x.toFixed(1) + " " + points[0].y.toFixed(1);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const prev = points[i - 1];
      const mx = (prev.x + p.x) / 2;
      d += " Q" + prev.x.toFixed(1) + " " + prev.y.toFixed(1) + " " + mx.toFixed(1) + " " + ((prev.y + p.y) / 2).toFixed(1);
      d += " L" + p.x.toFixed(1) + " " + p.y.toFixed(1);
    }
    return d;
  }

  function boneLayer(list) {
    const width = list.length * COL;
    const crest = list.map((fdi, i) => ({ x: i * COL + COL / 2, y: state[fdi].missing ? Y_CEJ + 40 : crestY(fdi) }));
    let d = "M0 " + Y_BOTTOM + " L0 " + crest[0].y.toFixed(1) + " ";
    d += smooth(crest).slice(1); // ohne erneutes M
    d += " L" + width + " " + crest[crest.length - 1].y.toFixed(1);
    d += " L" + width + " " + Y_BOTTOM + " Z";
    return '<path class="bone" d="' + d + '"/>';
  }

  function gingivaLayer(list) {
    const width = list.length * COL;
    const margin = list.map((fdi, i) => ({ x: i * COL + COL / 2, y: state[fdi].missing ? Y_CEJ + 30 : marginY(fdi) }));
    const crest = list.map((fdi, i) => ({ x: i * COL + COL / 2, y: state[fdi].missing ? Y_CEJ + 40 : crestY(fdi) }));
    let d = "M0 " + margin[0].y.toFixed(1) + " ";
    d += smooth(margin).slice(1);
    d += " L" + width + " " + margin[margin.length - 1].y.toFixed(1);
    d += " L" + width + " " + crest[crest.length - 1].y.toFixed(1) + " ";
    const rev = crest.slice().reverse();
    d += smooth(rev).slice(1);
    d += " L0 " + crest[0].y.toFixed(1) + " Z";
    return '<path class="gingiva" d="' + d + '"/>';
  }

  function severityMarks(list) {
    let m = "";
    list.forEach((fdi, i) => {
      if (state[fdi].missing) return;
      const loss = state[fdi].loss;
      if (loss <= 0) return;
      const color = loss >= 6 ? "#d33" : loss >= 4 ? "#e6a417" : "#3fae5a";
      const cx = i * COL + COL / 2;
      m += '<line class="crestmark" x1="' + (cx - 18) + '" y1="' + crestY(fdi).toFixed(1) +
        '" x2="' + (cx + 18) + '" y2="' + crestY(fdi).toFixed(1) + '" stroke="' + color + '"/>';
    });
    return m;
  }

  function hitZones(list) {
    return list.map((fdi, i) => (
      '<rect class="hit' + (fdi === selected ? " is-sel" : "") + '" data-fdi="' + fdi + '"' +
      ' x="' + (i * COL) + '" y="0" width="' + COL + '" height="' + Y_APEX_LIMIT + '"/>'
    )).join("");
  }

  function labels(list, upper) {
    const y = upper ? Y_APEX_LIMIT - 6 : Y_APEX_LIMIT - 6;
    return list.map((fdi, i) => (
      '<text class="lab" x="' + (i * COL + COL / 2) + '" y="' + y + '" text-anchor="middle">' + fdi + "</text>"
    )).join("");
  }

  function renderArch(elId, list, upper) {
    const el = document.getElementById(elId);
    const width = list.length * COL;
    const teeth = list.map((fdi, i) => toothGroup(fdi, i * COL + COL / 2)).join("");
    const inner =
      teeth +
      boneLayer(list) +
      gingivaLayer(list) +
      severityMarks(list);
    const flip = upper ? ' transform="translate(0,' + Y_APEX_LIMIT + ') scale(1,-1)"' : "";
    el.innerHTML =
      '<svg viewBox="0 0 ' + width + " " + Y_APEX_LIMIT + '" class="arch-svg" preserveAspectRatio="xMidYMid meet">' +
      "<g" + flip + ">" + inner + "</g>" +
      labels(list, upper) +
      hitZones(list) +
      "</svg>";
  }

  function renderAll() {
    renderArch("arch-ok", FDI_OK, true);
    renderArch("arch-uk", FDI_UK, false);
    bindHits("arch-ok");
    bindHits("arch-uk");
    syncPanel();
  }

  function bindHits(elId) {
    document.getElementById(elId).querySelectorAll(".hit").forEach((rect) => {
      rect.addEventListener("click", () => {
        selected = Number(rect.getAttribute("data-fdi"));
        renderAll();
      });
    });
  }

  function syncPanel() {
    const s = state[selected];
    document.getElementById("selLabel").textContent = "Zahn " + selected;
    const loss = document.getElementById("loss");
    const rec = document.getElementById("rec");
    const miss = document.getElementById("miss");
    loss.value = s.loss;
    rec.value = s.rec;
    miss.checked = s.missing;
    document.getElementById("lossVal").textContent = s.loss + " mm";
    document.getElementById("recVal").textContent = s.rec + " mm";
    const cal = s.loss + s.rec;
    document.getElementById("calVal").textContent = "Knochenabbau " + s.loss + " mm · Rezession " + s.rec + " mm · CAL≈ " + cal + " mm";
  }

  function preset(kind) {
    Object.keys(state).forEach((fdi) => { state[fdi] = { loss: 0, rec: 0, missing: false }; });
    if (kind === "demo") {
      state[36] = { loss: 5, rec: 1, missing: false }; // horizontaler Abbau
      state[46] = { loss: 8, rec: 2, missing: false }; // tiefer/vertikaler Defekt
      state[16] = { loss: 3, rec: 4, missing: false }; // v.a. Rezession
      state[24] = { loss: 6, rec: 2, missing: false };
      state[31] = { loss: 4, rec: 3, missing: false };
      state[41] = { loss: 4, rec: 3, missing: false };
    }
    if (kind === "generalisiert") {
      Object.keys(state).forEach((fdi) => { state[fdi] = { loss: 4, rec: 2, missing: false }; });
    }
    renderAll();
  }

  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("loss").addEventListener("input", (e) => {
      state[selected].loss = Number(e.target.value); renderAll();
    });
    document.getElementById("rec").addEventListener("input", (e) => {
      state[selected].rec = Number(e.target.value); renderAll();
    });
    document.getElementById("miss").addEventListener("change", (e) => {
      state[selected].missing = e.target.checked; renderAll();
    });
    document.getElementById("presetDemo").addEventListener("click", () => preset("demo"));
    document.getElementById("presetGen").addEventListener("click", () => preset("generalisiert"));
    document.getElementById("presetReset").addEventListener("click", () => preset("reset"));
    preset("demo");
  });
})();
