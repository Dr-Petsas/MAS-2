/**
 * Planungsspalte neben dem Odontogramm + Wizard-Navigation (Chef 16.08.2026).
 */
(function (g) {
  "use strict";

  var view = "01";
  var planTab = "vorschlag";
  var taken = {};
  var extra = [];
  var lastItems = [];
  var hkpMode = "kasse";

  try {
    var saved = g.Lena01Plan && Lena01Plan.load();
    if (saved && saved.hkpMode === "privat") hkpMode = "privat";
  } catch (_) {}

  function qs() { return new URLSearchParams(location.search); }
  function teeth() {
    try {
      if (g.Lena01 && Lena01.teethRaw) return Lena01.teethRaw();
      return JSON.parse(sessionStorage.getItem("lena01.teeth") || "{}") || {};
    } catch (_) { return {}; }
  }
  function persist01() {
    if (g.Lena01 && Lena01.teethRaw) {
      try {
        sessionStorage.setItem("lena01.teeth", JSON.stringify(Lena01.teethRaw()));
        sessionStorage.setItem("lena01.snap", JSON.stringify(Lena01.snapshot()));
      } catch (_) {}
    }
    if (g.Lena01Flow && typeof Lena01Flow.saveNow === "function") Lena01Flow.saveNow("draft");
  }
  function persistPlan() {
    var chosen = lastItems.filter(function (it) { return taken[it.id]; }).concat(extra);
    if (g.Lena01Plan) {
      Lena01Plan.save({
        appointmentId: qs().get("appointmentId") || "",
        patient: qs().get("patient") || qs().get("name") || "",
        items: chosen,
        hkpMode: hkpMode,
      });
    }
  }
  function proposals() {
    if (!g.Lena01Bedarf) return [];
    return Lena01Bedarf.propose(teeth());
  }
  function antraege() {
    var chosen = lastItems.filter(function (it) { return taken[it.id]; }).concat(extra);
    return g.Lena01Plan ? Lena01Plan.antraegeFor(chosen) : [];
  }

  function setView(next) {
    if (next === "bedarf" || next === "antraege") persist01();
    view = next === "antraege" ? "antraege" : (next === "bedarf" ? "bedarf" : "01");
    if (next === "antraege") planTab = "antraege";
    else if (next === "bedarf") planTab = "plan";
    else planTab = "vorschlag";
    document.querySelectorAll("#l01WizNav [data-view]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-view") === view);
    });
    paint();
  }

  function paint() {
    var host = document.getElementById("planPane");
    if (!host) return;
    lastItems = proposals();
    var open = lastItems.filter(function (it) { return !taken[it.id]; });
    var kept = lastItems.filter(function (it) { return taken[it.id]; });
    var takenN = kept.length + extra.length;
    var rows = antraege();
    var html = '<div class="plan-tabs">' +
      '<button type="button" data-tab="vorschlag"' + (planTab === "vorschlag" ? ' class="on"' : "") + ">Vorschläge</button>" +
      '<button type="button" data-tab="plan"' + (planTab === "plan" ? ' class="on"' : "") + ">Plan" +
      '<span class="plan-count"' + (takenN ? "" : ' hidden') + ">" + (takenN || 0) + "</span></button>" +
      '<button type="button" data-tab="antraege"' + (planTab === "antraege" ? ' class="on"' : "") + ">Anträge" +
      '<span class="plan-count"' + (rows.length ? "" : " hidden") + ">" + (rows.length || 0) + "</span></button></div>";
    html += '<div class="plan-list">';
    if (planTab === "antraege") {
      if (!rows.length) html += '<p class="plan-empty">Keine Anträge — PZR und reine Füllungen brauchen oft keines.</p>';
      rows.forEach(function (it) {
        var isHkp = it.id === "hkp";
        var privat = isHkp && hkpMode === "privat";
        var badge = privat ? "Privat" : it.badge;
        var title = privat ? "Private Planung" : it.title;
        var hint = privat ? "Kostenvoranschlag · außervertraglich / GOZ." : it.hint;
        html += '<article class="plan-card plan-antrag" data-kind="antrag" data-id="' + it.id + '">' +
          '<span class="fach">' + badge + "</span><h3>" + title + "</h3><p>" + hint + "</p>";
        if (isHkp) {
          html += '<div class="antrag-switch" role="group" aria-label="HKP Variante">' +
            '<button type="button" data-hkp="kasse"' + (privat ? "" : ' class="on"') + ">Kasse</button>" +
            '<button type="button" data-hkp="privat"' + (privat ? ' class="on"' : "") + ">Privat</button></div>";
        }
        html += '<ul class="antrag-from">';
        (it.from || []).forEach(function (src) {
          html += '<li><span>' + src.title + "</span>" +
            '<button type="button" class="antrag-del" data-item="' + src.id + '" title="entfernen" aria-label="entfernen">' +
            '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M6 2h4l.5 1H14v1H2V3h3.5L6 2zm1 4v6H6V6h1zm3 0v6H9V6h1zM3 5h10l-.7 9.1A1 1 0 0 1 11.3 15H4.7a1 1 0 0 1-1-.9L3 5z"/></svg>' +
            "</button></li>";
        });
        html += "</ul></article>";
      });
    } else if (planTab === "plan") {
      if (!kept.length && !extra.length) html += '<p class="plan-empty">Noch nichts übernommen.</p>';
      kept.forEach(function (it) {
        html += '<article class="plan-taken" data-id="' + it.id + '">' +
          '<span class="fach">' + it.fach + "</span><h3>" + it.title + "</h3>" +
          (it.hint ? "<p>" + it.hint + "</p>" : "") +
          '<button type="button" class="plan-x" title="zurück">×</button></article>';
      });
      extra.forEach(function (it, i) {
        html += '<article class="plan-taken is-extra" data-extra="' + i + '">' +
          '<span class="fach">' + it.fach + "</span><h3>" + it.title + "</h3><p>manuell</p>" +
          '<button type="button" class="plan-x" title="entfernen">×</button></article>';
      });
      html += '<div class="plan-add">' +
        '<input id="planAddTitle" type="text" placeholder="eigene Position" />' +
        '<select id="planAddFach"><option>Kons</option><option>ZE</option><option>IMP</option>' +
        "<option>Chir</option><option>Par</option><option>Pro</option><option>KB</option></select>" +
        '<button type="button" id="planAddBtn">Hinzufügen</button></div>';
    } else {
      if (!open.length) html += '<p class="plan-empty">Keine offenen Vorschläge.</p>';
      open.forEach(function (it) {
        html += '<article class="plan-suggest" data-id="' + it.id + '">' +
          '<span class="fach">' + it.fach + "</span><h3>" + it.title + "</h3>" +
          (it.hint ? "<p>" + it.hint + "</p>" : "") +
          '<button type="button" class="plan-take">In den Plan</button></article>';
      });
    }
    html += "</div>";
    host.innerHTML = html;

    host.querySelectorAll(".plan-tabs [data-tab]").forEach(function (b) {
      b.addEventListener("click", function () {
        planTab = b.getAttribute("data-tab");
        view = planTab === "antraege" ? "antraege" : (planTab === "plan" ? "bedarf" : "01");
        document.querySelectorAll("#l01WizNav [data-view]").forEach(function (nav) {
          nav.classList.toggle("on", nav.getAttribute("data-view") === view);
        });
        paint();
      });
    });
    host.querySelectorAll(".plan-suggest[data-id] .plan-take").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".plan-suggest");
        if (!card) return;
        taken[card.getAttribute("data-id")] = true;
        persistPlan();
        paint();
      });
    });
    host.querySelectorAll("[data-hkp]").forEach(function (b) {
      b.addEventListener("click", function () {
        hkpMode = b.getAttribute("data-hkp") === "privat" ? "privat" : "kasse";
        persistPlan();
        paint();
      });
    });
    host.querySelectorAll(".antrag-del[data-item]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        dropItem(btn.getAttribute("data-item"));
      });
    });
    host.querySelectorAll(".plan-taken[data-id]").forEach(function (card) {
      if (card.getAttribute("data-kind") === "antrag") return;
      card.addEventListener("click", function () {
        taken[card.getAttribute("data-id")] = false;
        persistPlan();
        paint();
      });
    });
    host.querySelectorAll(".plan-taken[data-extra]").forEach(function (card) {
      card.addEventListener("click", function () {
        extra.splice(Number(card.getAttribute("data-extra")), 1);
        persistPlan();
        paint();
      });
    });
    var addBtn = document.getElementById("planAddBtn");
    if (addBtn) addBtn.addEventListener("click", function () {
      var title = (document.getElementById("planAddTitle").value || "").trim();
      var fach = document.getElementById("planAddFach").value || "Kons";
      if (!title) return;
      extra.push({
        id: "man-" + Date.now(), fach: fach, title: title, hint: "manuell",
        antraege: fach === "ZE" || fach === "IMP" ? ["hkp"] : (fach === "Par" ? ["par"] : []),
      });
      persistPlan();
      paint();
    });
  }

  function dropItem(id) {
    if (!id) return;
    if (taken[id]) taken[id] = false;
    extra = extra.filter(function (it) { return it.id !== id; });
    persistPlan();
    paint();
  }

  function bindNav() {
    document.querySelectorAll("#l01WizNav [data-view]").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
    });
  }

  g.Lena01PlanUi = {
    show: setView,
    refresh: paint,
    persist01: persist01,
    view: function () { return view; },
  };

  var lastSig = "";
  setInterval(function () {
    if (document.hidden || planTab === "antraege") return;
    var sig = proposals().map(function (x) { return x.id; }).join(",");
    if (sig !== lastSig) { lastSig = sig; paint(); }
  }, 2000);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { bindNav(); paint(); });
  } else {
    bindNav();
    paint();
  }
})(window);
