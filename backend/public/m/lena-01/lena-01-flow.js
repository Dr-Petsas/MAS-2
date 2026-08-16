/**
 * Lena 01 · Trichter (Chef 16.08.2026).
 *
 * Immer zuerst Arzt-01 (start.html). Fertig fragt:
 *   1) KI vervollstaendigen?  Ja = offene Faecher nachtragen (visuell, Dialog folgt)
 *   2) Bedarf planen?         Ja = bedarf.html (Liste/Worksheet-Stub)
 *                             Nein = Dokumentation (iPad-Doku / Desktop-Spalte)
 *
 * KEIN Eingriff in perio.js/perio-voice.js/Clara — nur window.Lena01.
 */
(function () {
  "use strict";

  const qs = new URLSearchParams(location.search);
  let MODE = qs.get("mode") === "ki" ? "ki" : "arzt";
  let phase = "arzt"; // arzt | ki | done

  // ── Fachbereichs-Fuehrung: geordnet, jeder Schritt oeffnet einen Befund-Tab.
  const STEPS = [
    { tab: "general", title: "Zahnstatus", hint: "Fehlende / zerst\u00f6rte Z\u00e4hne, L\u00fcckenschluss." },
    { tab: "Kons", title: "Kons", hint: "Karies, F\u00fcllungen, Wurzelf\u00fcllungen." },
    { tab: "ZE", title: "Zahnersatz", hint: "Kronen, Br\u00fccken, Prothetik." },
    { tab: "IMP", title: "Implantate", hint: "Implantate und Zustand." },
    { tab: "Chir", title: "Chirurgie", hint: "Retiniert / impaktiert, Weisheitsz\u00e4hne, apikale Befunde." },
    { tab: "Par", title: "Paro", hint: "PSI / Sondierung, Blutung, Lockerung." },
    { tab: "KB", title: "Kiefer / Funktion", hint: "Kiefergelenk, Abrasion, Funktion." },
    { tab: "Pro", title: "Prophylaxe", hint: "Plaque, Zahnstein, Verf\u00e4rbungen." },
    { tab: "Schleimhaeute", title: "Schleimh\u00e4ute", hint: "Schleimhaut, Weichgewebe." },
  ];
  // Fuer Arzt-gefuehrte Luecken: die klinisch wichtigen Faecher (nicht alle).
  const GAP_TABS = ["general", "Kons", "ZE", "Chir", "Par", "Pro"];
  const GAP_TITLE = {};
  STEPS.forEach((s) => { GAP_TITLE[s.tab] = s.title; });

  // ── Kontext (identisch zu perio-voice.js) ────────────────────────────────
  function creds() {
    try { return JSON.parse(localStorage.getItem("pickadoc.ipad.v1") || "null"); } catch (_) { return null; }
  }
  function ctx() {
    const c = creds() || {};
    const clientId = String(c.clientId || qs.get("c") || sessionStorage.getItem("lena01.clientId") || "").trim();
    const locationId = String(qs.get("locationId") || sessionStorage.getItem("lena01.locationId") || "").trim();
    const appointmentId = String(qs.get("appointmentId") || sessionStorage.getItem("lena01.appointmentId") || "").trim();
    const patientName = String(qs.get("patient") || qs.get("name") || "").trim();
    return {
      clientId, locationId, appointmentId, patientName,
      deviceId: String(c.deviceId || "").trim(),
      deviceKey: String(c.deviceKey || "").trim(),
    };
  }
  function hasContext() {
    const k = ctx();
    return !!(k.locationId && k.appointmentId && k.deviceId && k.deviceKey);
  }

  // ── DOM ──────────────────────────────────────────────────────────────────
  let stepIndex = 0;
  let bar, elMode, elBody, elToast;

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function buildBar() {
    bar = document.createElement("div");
    bar.id = "lena01Bar";
    bar.className = "mode-" + MODE;
    bar.innerHTML =
      '<span class="l01-mode" id="l01Mode"></span>' +
      '<div class="l01-body" id="l01Body"></div>' +
      '<button type="button" class="l01-done" id="l01Done">Fertig</button>';
    document.body.appendChild(bar);
    elMode = document.getElementById("l01Mode");
    elBody = document.getElementById("l01Body");
    elMode.textContent = "01 \u00b7 Arzt";
    document.getElementById("l01Done").addEventListener("click", onFertig);

    elToast = document.createElement("div");
    elToast.id = "l01Toast";
    elToast.hidden = true;
    document.body.appendChild(elToast);
  }

  function ready() {
    return !!(window.Lena01 && typeof Lena01.snapshot === "function");
  }

  // ── KI-gefuehrt: Schritt-fuer-Schritt ─────────────────────────────────────
  window.Lena01Flow = {
    persistLocal: function () { persistLocal(); },
    saveNow: function (decision) {
      persistLocal();
      return save(decision || "draft");
    },
  };

  function persistLocal() {
    if (!ready()) return;
    try {
      sessionStorage.setItem("lena01.snap", JSON.stringify(Lena01.snapshot()));
      if (Lena01.teethRaw) sessionStorage.setItem("lena01.teeth", JSON.stringify(Lena01.teethRaw()));
    } catch (_) {}
  }

  function renderKi() {
    if (window.Lena01Ask && Lena01Ask.isActive() && Lena01Ask.paint(elBody)) return;
    const s = STEPS[stepIndex];
    const counts = ready() ? Lena01.fachCounts() : {};
    const done = counts[s.tab] || 0;
    elBody.innerHTML =
      '<div class="l01-step">' +
      '<button type="button" class="l01-nav" id="l01Prev"' + (stepIndex === 0 ? " disabled" : "") + ">\u2039</button>" +
      '<div class="l01-step-mid">' +
      '<div class="l01-step-title">Schritt ' + (stepIndex + 1) + "/" + STEPS.length +
      " \u00b7 " + esc(s.title) + (done ? ' <span class="l01-badge">' + done + "</span>" : "") + "</div>" +
      '<div class="l01-step-hint">' + esc(s.hint) + "</div>" +
      "</div>" +
      '<button type="button" class="l01-nav" id="l01Next"' + (stepIndex === STEPS.length - 1 ? " disabled" : "") + ">\u203a</button>" +
      "</div>";
    const prev = document.getElementById("l01Prev");
    const next = document.getElementById("l01Next");
    if (prev) prev.addEventListener("click", () => gotoStep(stepIndex - 1));
    if (next) next.addEventListener("click", () => gotoStep(stepIndex + 1));
  }
  function gotoStep(i) {
    stepIndex = Math.max(0, Math.min(STEPS.length - 1, i));
    if (ready()) Lena01.setTab(STEPS[stepIndex].tab);
    if (phase === "ki" && STEPS[stepIndex].tab === "Kons" && window.Lena01Ask && !Lena01Ask.isActive()) {
      Lena01Ask.onPaint = function () { renderKi(); };
      Lena01Ask.start(function () {
        toast("Kons durch. Weiter im n\u00e4chsten Fach oder Fertig.");
        renderKi();
      });
      return;
    }
    renderKi();
  }

  // ── Arzt-gefuehrt: Luecken zeigen ─────────────────────────────────────────
  function renderArzt() {
    const counts = ready() ? Lena01.fachCounts() : {};
    const gaps = GAP_TABS.filter((t) => !counts[t]);
    if (!gaps.length) {
      elBody.innerHTML = '<div class="l01-gaps l01-clear">Alle Fachbereiche besprochen \u2713</div>';
      return;
    }
    elBody.innerHTML =
      '<div class="l01-gaps"><span class="l01-gaps-lead">Noch offen:</span>' +
      gaps.map((t) => '<button type="button" class="l01-gap" data-tab="' + t + '">' + esc(GAP_TITLE[t] || t) + "</button>").join("") +
      "</div>";
    elBody.querySelectorAll(".l01-gap").forEach((b) => {
      b.addEventListener("click", () => { if (ready()) Lena01.setTab(b.dataset.tab); });
    });
  }

  function renderBody() {
    if (!elBody) return;
    if (MODE === "ki") renderKi(); else renderArzt();
  }

  function onFertig() {
    persistLocal();
    if (phase === "arzt") openAsk("ki");
    else openAsk("bedarf");
  }

  function openAsk(kind) {
    if (document.getElementById("l01Modal")) return;
    const ov = document.createElement("div");
    ov.id = "l01Modal";
    const ki = kind === "ki";
    ov.innerHTML =
      '<div class="l01-card" role="dialog" aria-modal="true">' +
      (ki
        ? "<h2>KI vervollst\u00e4ndigen?</h2><p>Lena tr\u00e4gt offene Themenbl\u00f6cke nach \u2014 nur das, was in der 01 noch fehlt.</p>"
        : "<h2>Bedarf planen?</h2><p>Aus der 01 eine Liste bauen \u2014 das wird das Worksheet (Termine, Pl\u00e4ne, Unterlagen).</p>") +
      '<div class="l01-choices">' +
      '<button type="button" class="l01-choice yes" id="l01Yes"><b>Ja</b><span>' +
      (ki ? "Offene F\u00e4cher nachtragen" : "Liste / Worksheet \u00f6ffnen") +
      "</span></button>" +
      '<button type="button" class="l01-choice no" id="l01No"><b>Nein</b><span>' +
      (ki ? "01 so lassen, weiter" : "Weiter zur Dokumentation") +
      "</span></button>" +
      "</div>" +
      '<button type="button" class="l01-cancel" id="l01Cancel">Abbrechen</button>' +
      "</div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    document.getElementById("l01Cancel").addEventListener("click", () => ov.remove());
    document.getElementById("l01Yes").addEventListener("click", () => {
      ov.remove();
      if (ki) startKiNachtrag();
      else finish("bedarf");
    });
    document.getElementById("l01No").addEventListener("click", () => {
      ov.remove();
      if (ki) openAsk("bedarf");
      else finish("doku");
    });
  }

  function startKiNachtrag() {
    phase = "ki";
    MODE = "ki";
    if (bar) bar.className = "mode-ki";
    if (elMode) elMode.textContent = "01 \u00b7 Lena-Nachtrag";
    const done = document.getElementById("l01Done");
    if (done) done.textContent = "Fertig \u00b7 Bedarf?";
    const konsIdx = STEPS.findIndex((s) => s.tab === "Kons");
    gotoStep(konsIdx >= 0 ? konsIdx : 0);
    toast("Lena fragt Kons \u2014 nur was noch fehlt, Legende der Reihe nach.");
  }

  function goToDoku() {
    const appt = ctx().appointmentId || qs.get("appointmentId") || "";
    if (appt) try { sessionStorage.setItem("lena01.funnelDone", appt); } catch (_) {}
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "lena-go-doku" }, "*");
      return;
    }
    const p = new URLSearchParams(location.search);
    p.set("doku", "1");
    p.delete("mode");
    p.delete("theme");
    p.delete("v");
    location.href = "/m/ipad-app.html?" + p.toString();
  }

  function goToBedarf() {
    persistLocal();
    save("bedarf").catch(function () {});
    if (window.Lena01PlanUi) Lena01PlanUi.show("bedarf");
  }

  async function finish(decision) {
    const r = await save(decision);
    if (r && r.ok === false && r.error === "no_content") {
      toast("Kein Befund erfasst \u2014 bitte erst dokumentieren.");
      return;
    }
    if (decision === "bedarf") goToBedarf();
    else goToDoku();
  }

  // ── Persistenz ─────────────────────────────────────────────────────────────
  let lastSavedText = "";
  async function save(decision) {
    if (!ready()) return { ok: false, error: "not_ready" };
    const k = ctx();
    if (!hasContext()) return { ok: false, error: "no_context" };
    const snap = Lena01.snapshot();
    const text = Lena01.toPvsText(k.patientName);
    const body = {
      clientId: k.clientId, locationId: k.locationId, appointmentId: k.appointmentId,
      deviceId: k.deviceId, deviceKey: k.deviceKey,
      mode: MODE, decision,
      teeth: snap, text, patientName: k.patientName,
    };
    try {
      const resp = await fetch("/treatment/lena-01-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const j = await resp.json().catch(() => ({}));
      if (resp.ok && j.ok) lastSavedText = text;
      return resp.ok ? j : { ok: false, error: (j && j.error) || String(resp.status) };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }
  // Zwischenstand sichern, wenn sich der Befund geaendert hat (leise).
  function autosave() {
    if (!ready() || !hasContext()) return;
    const text = Lena01.toPvsText(ctx().patientName);
    if (text === lastSavedText) return;
    if (Lena01.snapshot().count === 0) return;
    save("draft").catch(() => {});
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  let toastTimer = 0;
  function toast(msg) {
    if (!elToast) return;
    elToast.textContent = msg;
    elToast.hidden = false;
    elToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elToast.classList.remove("show");
      setTimeout(() => { elToast.hidden = true; }, 300);
    }, 4200);
  }

  // ── Start (nach Modus-Wahl) ────────────────────────────────────────────────
  let started = false;
  function start(mode) {
    if (started) return;
    started = true;
    MODE = mode === "ki" ? "ki" : "arzt";
    phase = MODE === "ki" ? "ki" : "arzt";
    buildBar();
    if (MODE === "ki") gotoStep(0); else renderBody();
    // Fach-Zaehler/Luecken laufen mit dem Voice-Poll mit (leichter Takt).
    setInterval(() => { if (!document.hidden) renderBody(); }, 2000);
    setInterval(() => { if (!document.hidden) autosave(); }, 15000);
    window.addEventListener("beforeunload", () => { try { autosave(); } catch (_) {} });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    start(MODE || "arzt");
  }
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
