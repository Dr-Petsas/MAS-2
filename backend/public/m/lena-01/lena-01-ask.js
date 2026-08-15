/**
 * Lena 01 · schnelle Abfrage (Chef 16.08.2026).
 *
 * Geht die Legende durch, fragt NUR was noch fehlt.
 * Erste fertige Version: KONS (+ CAP, weil Endo dazu gehoert).
 * Schon markierte Befunde: kurze Gegenfrage „noch weitere?“, sonst weiter.
 */
(function (g) {
  "use strict";

  var KONS = [
    { id: "fuellung", tab: "Kons", ask: "Wo sind Füllungen?", more: "Noch weitere Füllungen — oder weiter?", none: "Keine Füllungen. Weiter." },
    { id: "insuffizient", tab: "Kons", ask: "Wo sind insuffiziente Füllungen?", more: "Noch insuffiziente Füllungen — oder weiter?", none: "Keine insuffizienten Füllungen. Weiter." },
    { id: "karies", tab: "Kons", ask: "Wo ist Karies?", more: "Noch Karies — oder weiter?", none: "Keine Karies. Weiter." },
    { id: "wurzelfuellung", tab: "Kons", ask: "Wo sind Wurzelfüllungen?", more: "Noch Wurzelfüllungen — oder weiter?", none: "Keine Wurzelfüllungen. Weiter." },
    { id: "i_wurzelfuellung", tab: "Kons", ask: "Wo sind insuffiziente Wurzelfüllungen?", more: "Noch insuffiziente Wurzelfüllungen — oder weiter?", none: "Keine insuffizienten Wurzelfüllungen. Weiter." },
    { id: "wurzelstift", tab: "Kons", ask: "Wo sind Wurzelstifte?", more: "Noch Wurzelstifte — oder weiter?", none: "Keine Wurzelstifte. Weiter." },
    { id: "keildefekt", tab: "Kons", ask: "Wo sind keilförmige Defekte?", more: "Noch keilförmige Defekte — oder weiter?", none: "Keine Keildefekte. Weiter." },
    { id: "schmelzfraktur", tab: "Kons", ask: "Wo sind Schmelzfrakturen?", more: "Noch Schmelzfrakturen — oder weiter?", none: "Keine Schmelzfrakturen. Weiter." },
    { id: "cap", tab: "Chir", ask: "Wo ist eine apikale Aufhellung, CAP?", more: "Noch eine CAP — oder weiter?", none: "Keine CAP. Kons ist durch." },
  ];

  var SKIP = /^(keine|keiner|keins|kein|nichts|nein|weiter|fertig|passt|ok|okay|nächste|naechste|skip)$/i;
  var idx = -1;
  var active = false;
  var onDone = null;
  var lastSpoken = "";

  function hits(id) {
    if (!g.Lena01 || !Lena01.findingsById) return [];
    return Lena01.findingsById(id) || [];
  }
  function recap(id) {
    var list = hits(id);
    if (!list.length) return "";
    return list.map(function (t) { return String(t.fdi); }).join(", ");
  }
  function current() {
    return idx >= 0 && idx < KONS.length ? KONS[idx] : null;
  }
  function questionText(q) {
    if (!q) return "";
    var where = recap(q.id);
    if (where) return "Schon da: " + where + ". " + q.more;
    return q.ask + " Zahn und Fläche — oder keine.";
  }
  function speak(text) {
    lastSpoken = text;
    try {
      if (!g.speechSynthesis) return;
      g.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "de-DE";
      u.rate = 1.08;
      g.speechSynthesis.speak(u);
    } catch (_) {}
  }
  function applyQuestion() {
    var q = current();
    if (!q) return;
    if (g.Lena01 && Lena01.setTab) Lena01.setTab(q.tab);
    if (g.Lena01 && Lena01.armFinding) Lena01.armFinding(q.id);
    speak(questionText(q));
    if (typeof g.Lena01Ask.onPaint === "function") g.Lena01Ask.onPaint();
  }
  function next() {
    idx += 1;
    while (idx < KONS.length) {
      applyQuestion();
      return true;
    }
    stop();
    if (typeof onDone === "function") onDone();
    return false;
  }
  function start(cb) {
    active = true;
    onDone = cb || null;
    idx = -1;
    next();
  }
  function stop() {
    active = false;
    idx = -1;
    try { if (g.speechSynthesis) g.speechSynthesis.cancel(); } catch (_) {}
    if (g.Lena01 && Lena01.armFinding) Lena01.armFinding(null);
  }
  function hear(text) {
    if (!active) return false;
    var t = String(text || "").trim();
    if (!t) return false;
    if (SKIP.test(t) || /^(keine|nichts).{0,20}$/i.test(t)) {
      next();
      return true;
    }
    return false;
  }
  function paint(host) {
    if (!host) return false;
    var q = current();
    if (!active || !q) return false;
    var where = recap(q.id);
    host.innerHTML =
      '<div class="l01-ask">' +
      '<div class="l01-step-title">Kons · ' + (idx + 1) + "/" + KONS.length + " · " + q.id + "</div>" +
      '<div class="l01-step-hint">' + questionText(q) + "</div>" +
      (where ? '<div class="l01-ask-have">schon da: ' + where + "</div>" : "") +
      '<div class="l01-ask-btns">' +
      '<button type="button" class="l01-ask-btn" id="l01AskNone">Keine</button>' +
      '<button type="button" class="l01-ask-btn" id="l01AskNext">Weiter</button>' +
      "</div></div>";
    var none = host.querySelector("#l01AskNone");
    var nxt = host.querySelector("#l01AskNext");
    if (none) none.addEventListener("click", next);
    if (nxt) nxt.addEventListener("click", next);
    return true;
  }

  g.Lena01Ask = {
    start: start, stop: stop, next: next, hear: hear, paint: paint,
    isActive: function () { return active; },
    current: current, questionText: questionText,
    onPaint: null,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
