/**
 * Lena 01 · Worksheet + Antraege (Stub, Chef 16.08.2026).
 * Eine Plan-Liste, daraus nur die passenden Antraege.
 * PAR zieht API + SBI mit. OSAS ist eigener Kassenantrag (UKPS).
 */
(function (w) {
  "use strict";
  var KEY = "lena01.plan";

  var ANTRAEGE = {
    hkp: {
      id: "hkp", badge: "HKP", title: "Heil- und Kostenplan",
      hint: "Kasse · ZE / Prothetik / größerer Zahnersatz.",
    },
    par: {
      id: "par", badge: "PAR", title: "PAR-Antrag",
      hint: "Kasse · Parodontitis-Strecke (AIT / CPT / UPT-Start).",
      zieht: ["api", "sbi"],
    },
    api: {
      id: "api", badge: "API", title: "API · Approximalraum-Plaque-Index",
      hint: "Pflicht-Beilage zum PAR-Antrag — Plaque an den Approximalflächen.",
      beilageVon: "par",
    },
    sbi: {
      id: "sbi", badge: "SBI", title: "SBI · Sulcus-Blutungs-Index",
      hint: "Pflicht-Beilage zum PAR-Antrag — Blutung nach Sondierung.",
      beilageVon: "par",
    },
    kva: {
      id: "kva", badge: "KVA", title: "Kostenvoranschlag",
      hint: "Privat / Implantat / außervertraglich.",
    },
    mkv: {
      id: "mkv", badge: "MKV", title: "Mehrkostenvereinbarung",
      hint: "Füllung oder Leistung über BEMA hinaus.",
    },
    funktion: {
      id: "funktion", badge: "Funktion", title: "Funktionsanalyse / -plan",
      hint: "CMD, Schiene, Funktionstherapie.",
    },
    osas: {
      id: "osas", badge: "OSAS", title: "OSAS / Protrusionsschiene",
      hint: "Kasse · UKPS-Antrag, oft mit Schlaflabor / HNO.",
    },
    kfo: {
      id: "kfo", badge: "KFO", title: "KFO-Antrag / HKP Kieferorthopädie",
      hint: "Kasse · kieferorthopädische Behandlung.",
    },
  };

  var FACH_ANTRAEGE = {
    ZE: ["hkp"],
    IMP: ["hkp", "kva"],
    Par: ["par"],
    PAR: ["par"],
    Kons: ["mkv"],
    KB: ["funktion"],
    OSAS: ["osas"],
    KFO: ["kfo"],
  };

  function idsForItem(it) {
    if (it && it.antraege && it.antraege.length) return it.antraege.slice();
    return (FACH_ANTRAEGE[it && it.fach] || []).slice();
  }

  function expandIds(ids) {
    var seen = {};
    var out = [];
    function add(id) {
      if (!id || seen[id] || !ANTRAEGE[id]) return;
      seen[id] = true;
      out.push(id);
      (ANTRAEGE[id].zieht || []).forEach(add);
    }
    (ids || []).forEach(add);
    return out;
  }

  function save(payload) {
    try { sessionStorage.setItem(KEY, JSON.stringify(payload || {})); } catch (_) {}
  }
  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || "null") || {}; } catch (_) { return {}; }
  }
  function antraegeFor(items) {
    var raw = [];
    (items || []).forEach(function (it) {
      idsForItem(it).forEach(function (id) { raw.push(id); });
    });
    return expandIds(raw).map(function (id) {
      var row = Object.assign({ from: [] }, ANTRAEGE[id]);
      row.from = (items || []).filter(function (it) {
        var ids = expandIds(idsForItem(it));
        return ids.indexOf(id) >= 0;
      }).map(function (it) { return it.title; });
      return row;
    });
  }

  w.Lena01Plan = {
    KEY: KEY, ANTRAEGE: ANTRAEGE, FACH_ANTRAEGE: FACH_ANTRAEGE,
    save: save, load: load, antraegeFor: antraegeFor, idsForItem: idsForItem,
  };
})(window);
