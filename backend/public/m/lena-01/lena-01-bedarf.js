/**
 * Lena 01 · Bedarf aus dem Befund (Chef 16.08.2026).
 *
 * Eine Therapie = Bedingung am 01-Status. Trifft die Bedingung zu,
 * erscheint der Vorschlag. Varianten (Implantat UND Bruecke) stehen
 * nebeneinander — der Arzt waehlt, nicht die KI.
 *
 * Pfeilerregel (Chef): pro fehlendem Zahn 2 Pfeiler. Freiend im
 * Seitenzahnbereich: die Pfeiler liegen mesial der Luecke.
 * Zahn 8 allein fehlend = kein Bedarf. Vorhandener ZE (Brueckenglied /
 * Implantat / Prothesenzahn / Lueckenschluss) gilt als versorgt.
 *
 * Quellen der Bedingungen: G-BA ZE-Richtlinie / Festzuschussklassen
 * (zahnbegrenzte Luecke vs Freiend), klinische Standardindikationen
 * Krone nach grosser Restauration / nach WF posterior, Endo-RL B III
 * (Revision bei insuffizienter WF, WK bei CAP ohne WF).
 */
(function (g) {
  "use strict";

  var OK = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  var UK = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  var POST = { 14: 1, 15: 1, 16: 1, 17: 1, 24: 1, 25: 1, 26: 1, 27: 1, 34: 1, 35: 1, 36: 1, 37: 1, 44: 1, 45: 1, 46: 1, 47: 1 };
  var FRONT = { 11: 1, 12: 1, 13: 1, 21: 1, 22: 1, 23: 1, 31: 1, 32: 1, 33: 1, 41: 1, 42: 1, 43: 1 };

  function tooth(teeth, fdi) {
    return (teeth && teeth[fdi]) || (teeth && teeth[String(fdi)]) || null;
  }
  function mark(t, id) {
    return !!(t && t.mark && t.mark[id]);
  }
  function roots(t, id) {
    return !!(t && t.rootMarkers && t.rootMarkers.indexOf(id) >= 0);
  }
  function surfacesOf(t, id) {
    var out = [];
    if (!t || !t.surfaces) return out;
    Object.keys(t.surfaces).forEach(function (k) {
      if ((t.surfaces[k] || []).indexOf(id) >= 0) out.push(k);
    });
    return out;
  }
  function surfaceCount(t) {
    var n = 0;
    if (!t || !t.surfaces) return 0;
    Object.keys(t.surfaces).forEach(function (k) {
      var arr = t.surfaces[k] || [];
      if (arr.indexOf("fuellung") >= 0 || arr.indexOf("insuffizient") >= 0 || arr.indexOf("karies") >= 0) n += 1;
    });
    return n;
  }
  function replaced(t) {
    return !!(t && (mark(t, "implantat") || mark(t, "brueckenglied") || mark(t, "prothesenzahn") || mark(t, "lueckenschluss")));
  }
  function isMissing(t) {
    return !!(t && t.missing && !replaced(t));
  }
  function isUsable(t) {
    if (!t) return false;
    if (mark(t, "zahn_zerstoert") || mark(t, "wurzelrest") || mark(t, "fraktur")) return false;
    if (mark(t, "brueckenglied") || mark(t, "prothesenzahn")) return false;
    if (t.missing && !mark(t, "implantat")) return false;
    return true;
  }
  function present(teeth, fdi) {
    var t = tooth(teeth, fdi);
    if (!t) return true;
    return isUsable(t);
  }

  function gapRuns(row, teeth) {
    var runs = [];
    var cur = [];
    row.forEach(function (fdi) {
      var t = tooth(teeth, fdi);
      if (isMissing(t) && fdi % 10 !== 8) {
        cur.push(fdi);
      } else {
        if (cur.length) runs.push(cur);
        cur = [];
      }
    });
    if (cur.length) runs.push(cur);
    return runs;
  }

  function sideOf(fdi, row) {
    var i = row.indexOf(fdi);
    return i < 0 ? null : { row: row, i: i };
  }
  function collectPfeiler(row, startIdx, endIdx, need, teeth) {
    var out = [];
    var left = startIdx - 1;
    var right = endIdx + 1;
    while (out.length < need && (left >= 0 || right < row.length)) {
      if (left >= 0) {
        var L = row[left];
        if (present(teeth, L) && out.indexOf(L) < 0) out.push(L);
        left -= 1;
      }
      if (out.length >= need) break;
      if (right < row.length) {
        var R = row[right];
        if (present(teeth, R) && out.indexOf(R) < 0) out.push(R);
        right += 1;
      }
    }
    return out;
  }

  function zeFromGaps(teeth) {
    var items = [];
    [OK, UK].forEach(function (row) {
      gapRuns(row, teeth).forEach(function (run) {
        var n = run.length;
        var need = n * 2;
        var a = sideOf(run[0], row);
        var b = sideOf(run[run.length - 1], row);
        var pfeiler = collectPfeiler(row, a.i, b.i, need, teeth);
        var freiend = (a.i === 0 || !present(teeth, row[a.i - 1])) ||
          (b.i === row.length - 1 || !present(teeth, row[b.i + 1]));
        var runKey = run.slice().sort(function (x, y) { return x - y; }).join("-");
        var gapId = "luecke-" + runKey;
        run.forEach(function (fdi) {
          items.push({
            id: "imp-" + fdi,
            fach: "IMP",
            title: "Implantat " + fdi,
            hint: "Zahn fehlt · Alternative zur Brücke",
            antraege: ["kva", "hkp"],
            group: gapId,
          });
        });
        var title = (n === 1 ? "Brücke " : (n + "-gliedrige Brücke ")) +
          (pfeiler.length ? pfeiler.slice().sort(function (x, y) { return x - y; })[0] + "–" +
            pfeiler.slice().sort(function (x, y) { return x - y; })[pfeiler.length - 1] : run.join("/"));
        if (n === 1 && pfeiler.length >= 2) {
          var sortedP = pfeiler.slice().sort(function (x, y) { return x - y; });
          title = "Brücke " + sortedP[0] + "–" + run[0] + "–" + sortedP[sortedP.length - 1];
        } else if (n >= 1 && pfeiler.length) {
          title = (n + 2 <= 9 ? (n + pfeiler.length) + "-gliedrige " : "") +
            "Brücke " + run[0] + "–" + run[run.length - 1] +
            " (Pfeiler " + pfeiler.join(", ") + ")";
        }
        items.push({
          id: "br-" + runKey,
          fach: "ZE",
          title: title,
          hint: (freiend ? "Freiend · " : "") + "2 Pfeiler je fehlendem Zahn" +
            (pfeiler.length < need ? " · Pfeiler knapp (" + pfeiler.length + "/" + need + ")" : ""),
          antraege: ["hkp"],
          group: gapId,
        });
      });
    });
    return items;
  }

  function konsFromTeeth(teeth) {
    var items = [];
    var fdis = Object.keys(teeth || {}).map(Number).filter(Boolean).sort(function (a, b) { return a - b; });
    fdis.forEach(function (fdi) {
      var t = tooth(teeth, fdi);
      if (!t || isMissing(t) || replaced(t)) return;

      var kar = surfacesOf(t, "karies");
      var ins = surfacesOf(t, "insuffizient");
      var keil = mark(t, "keildefekt");
      var frac = mark(t, "schmelzfraktur");
      var wf = roots(t, "wurzelfuellung");
      var iwf = roots(t, "i_wurzelfuellung");
      var cap = mark(t, "cap");
      var dest = mark(t, "zahn_zerstoert");
      var rest = mark(t, "wurzelrest") || mark(t, "fraktur");
      var nSurf = surfaceCount(t);
      var crownNow = mark(t, "krone") || mark(t, "teilkrone") || mark(t, "teleskop");
      var zeBad = mark(t, "ze_insuffizient");

      if (dest || rest) {
        items.push({
          id: "ext-" + fdi, fach: "Chir",
          title: "Extraktion " + fdi,
          hint: dest ? "Zahn zerstört" : "Wurzelrest / Fraktur",
          antraege: [],
        });
      }

      if (iwf || (cap && wf)) {
        var endoGrp = "endo-" + fdi;
        var why = iwf ? "insuffiziente WF" : "CAP bei vorhandener WF";
        items.push({
          id: "rev-" + fdi, fach: "Kons", group: endoGrp,
          title: "Revision Wurzelfüllung " + fdi,
          hint: why + " · Variante 1",
          antraege: [],
        });
        items.push({
          id: "rev-wsr-" + fdi, fach: "Chir", group: endoGrp,
          title: "Revision + WSR " + fdi,
          hint: why + " · Variante 2",
          antraege: [],
        });
        items.push({
          id: "ext-endo-" + fdi, fach: "Chir", group: endoGrp,
          title: "Extraktion " + fdi,
          hint: why + " · Variante 3",
          antraege: [],
        });
      } else if (cap && !wf) {
        items.push({
          id: "wk-" + fdi, fach: "Kons",
          title: "Wurzelkanalbehandlung " + fdi,
          hint: "CAP ohne Wurzelfüllung",
          antraege: [],
        });
      }

      var wantCrown = zeBad || dest || nSurf >= 3 || (wf && POST[fdi] && !crownNow);
      if (wantCrown && !crownNow) {
        items.push({
          id: "kr-" + fdi, fach: "ZE", group: "rest-" + fdi,
          title: (zeBad ? "Krone erneuern " : "Krone ") + fdi,
          hint: zeBad ? "ZE insuffizient" : (nSurf >= 3 ? "große Restauration (≥3 Flächen) · 1. Vorschlag" : "WF Seitenzahn · 1. Vorschlag"),
          antraege: ["hkp"],
        });
        items.push({
          id: "fu-alt-" + fdi, fach: "Kons", group: "rest-" + fdi,
          title: "Füllung " + fdi,
          hint: "2. Vorschlag statt Krone",
          antraege: ["mkv"],
        });
      } else if (ins.length) {
        items.push({
          id: "fu-ern-" + fdi, fach: "Kons",
          title: "Füllung erneuern " + fdi + " " + ins.join("/"),
          hint: "insuffiziente Füllung",
          antraege: ["mkv"],
        });
      } else if (wf && FRONT[fdi] && !iwf && !cap) {
        items.push({
          id: "fu-wf-" + fdi, fach: "Kons",
          title: "Füllung " + fdi + " (nach WF)",
          hint: "Wurzelfüllung Frontzahn → Restauration, keine Krone",
          antraege: [],
        });
      } else if (kar.length || keil || frac) {
        var where = kar.length ? kar.join("/") : (keil ? "zervikal" : "Schmelz");
        items.push({
          id: "fu-" + fdi, fach: "Kons",
          title: "Füllung " + fdi + " " + where,
          hint: kar.length ? "Karies" : (keil ? "Keildefekt" : "Schmelzfraktur"),
          antraege: kar.length >= 2 ? ["mkv"] : [],
        });
      }
    });
    return items;
  }

  function moreFromTeeth(teeth) {
    var items = [];
    var fdis = Object.keys(teeth || {}).map(Number).filter(Boolean);
    var paro = 0;
    var pro = 0;
    var kb = 0;
    var mucosa = [];
    fdis.forEach(function (fdi) {
      var t = tooth(teeth, fdi);
      if (!t) return;
      var pm = t.pocket ? +t.pocket.m || 0 : 0;
      var pd = t.pocket ? +t.pocket.d || 0 : 0;
      if (pm > 3 || pd > 3 || mark(t, "bop") || mark(t, "gingivitis") || mark(t, "furkation") || mark(t, "periimplantitis")) paro += 1;
      if (mark(t, "plaque") || mark(t, "zahnstein") || mark(t, "konkremente") || mark(t, "verfaerbung")) pro += 1;
      if (mark(t, "abrasion") || mark(t, "kg_knacken") || mark(t, "kg_schmerz")) kb += 1;
      if (mark(t, "retiniert") || mark(t, "impaktiert")) {
        items.push({
          id: "ost-" + fdi, fach: "Chir",
          title: "Osteotomie / Freilegung " + fdi,
          hint: mark(t, "impaktiert") ? "impaktiert" : "retiniert",
          antraege: [],
        });
      }
      ["leukoplakie", "erythroplakie", "ulcus", "tumorverdacht"].forEach(function (id) {
        if (mark(t, id)) mucosa.push(id + " " + fdi);
      });
    });
    if (paro) {
      items.push({
        id: "par-strecke", fach: "Par",
        title: "PAR-Therapie (AIT / CPT)",
        hint: paro + " Zähne mit Tasche >3 mm oder Entzündung · API/SBI mit Antrag",
        antraege: ["par"],
      });
    }
    if (pro) {
      items.push({
        id: "pzr", fach: "Pro",
        title: "PZR / Professionelle Reinigung",
        hint: "Plaque / Zahnstein / Verfärbung",
        antraege: [],
      });
    }
    if (kb) {
      items.push({
        id: "kb-fa", fach: "KB",
        title: "Funktionsanalyse / Schiene",
        hint: "Abrasion oder Kiefergelenk",
        antraege: ["funktion"],
      });
    }
    if (mucosa.length) {
      items.push({
        id: "muko", fach: "Schleimhaeute",
        title: "Schleimhaut abklären",
        hint: mucosa.join(" · "),
        antraege: [],
      });
    }
    return items;
  }

  function propose(teeth) {
    var items = [];
    items = items.concat(konsFromTeeth(teeth));
    items = items.concat(zeFromGaps(teeth));
    items = items.concat(moreFromTeeth(teeth));
    var seen = {};
    return items.filter(function (it) {
      if (seen[it.id]) return false;
      seen[it.id] = true;
      return true;
    });
  }

  g.Lena01Bedarf = {
    propose: propose,
    gaps: function (teeth) {
      return [].concat(gapRuns(OK, teeth), gapRuns(UK, teeth));
    },
    konsFromTeeth: konsFromTeeth,
    zeFromGaps: zeFromGaps,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
