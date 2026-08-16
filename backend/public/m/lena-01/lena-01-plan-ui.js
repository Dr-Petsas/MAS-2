/**
 * Planungsspalte neben dem Odontogramm + Wizard-Navigation (Chef 16.08.2026).
 */
(function (g) {
  "use strict";

  var view = "01";
  var taken = {};
  var extra = [];
  var lastItems = [];

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
    document.body.classList.toggle("plan-wide", view !== "01");
    document.querySelectorAll("#l01WizNav [data-view]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-view") === view);
    });
    paint();
  }

  function paint() {
    var host = document.getElementById("planPane");
    if (!host) return;
    lastItems = proposals();
    var html = "";
    if (view === "antraege") {
      var rows = antraege();
      html += '<div class="plan-kicker">Anträge zum Plan</div>';
      if (!rows.length) html += '<p class="plan-empty">Keine Anträge — PZR und reine Füllungen brauchen oft keines.</p>';
      rows.forEach(function (it) {
        html += '<article class="plan-card" data-kind="antrag" data-id="' + it.id + '">' +
          '<span class="fach">' + it.badge + "</span><h3>" + it.title + "</h3><p>" + it.hint + "</p></article>";
      });
    } else {
      html += '<div class="plan-kicker">Bedarf · Worksheet</div>';
      html += '<p class="plan-lead">KI-Vorschläge aus der 01. Übernehmen oder selbst ergänzen.</p>';
      if (!lastItems.length) html += '<p class="plan-empty">Noch kein Bedarf — 01 ist unauffällig oder leer.</p>';
      lastItems.forEach(function (it) {
        var on = taken[it.id];
        html += '<article class="plan-card' + (on ? " is-on" : "") + '" data-id="' + it.id + '">' +
          '<span class="fach">' + it.fach + "</span><h3>" + it.title + "</h3><p>" + it.hint + "</p>" +
          "<button type=\"button\">" + (on ? "Im Plan" : "Übernehmen") + "</button></article>";
      });
      extra.forEach(function (it, i) {
        html += '<article class="plan-card is-on is-extra" data-extra="' + i + '">' +
          '<span class="fach">' + it.fach + "</span><h3>" + it.title + "</h3><p>manuell</p>" +
          "<button type=\"button\">Entfernen</button></article>";
      });
      html += '<div class="plan-add">' +
        '<input id="planAddTitle" type="text" placeholder="eigene Position (z. B. Schiene 47)" />' +
        '<select id="planAddFach"><option>Kons</option><option>ZE</option><option>IMP</option>' +
        "<option>Chir</option><option>Par</option><option>Pro</option><option>KB</option></select>" +
        '<button type="button" id="planAddBtn">Hinzufügen</button></div>';
    }
    var takenN = lastItems.filter(function (it) { return taken[it.id]; }).length + extra.length;
    html += '<div class="plan-foot">Im Plan: ' + takenN +
      ' · <button type="button" id="planMax">' + (view === "01" ? "Plan größer" : "01 größer") + "</button></div>";
    host.innerHTML = html;

    host.querySelectorAll(".plan-card[data-id]").forEach(function (card) {
      if (card.getAttribute("data-kind") === "antrag") return;
      card.addEventListener("click", function () {
        taken[card.getAttribute("data-id")] = !taken[card.getAttribute("data-id")];
        persistPlan();
        paint();
      });
    });
    host.querySelectorAll(".plan-card[data-extra]").forEach(function (card) {
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
    var max = document.getElementById("planMax");
    if (max) max.addEventListener("click", function () {
      setView(view === "01" ? "bedarf" : "01");
    });
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
    if (document.hidden || view === "antraege") return;
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
