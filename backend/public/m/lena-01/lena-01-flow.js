/**
 * Lena 01 · Fuehrungs-Flow (Chef 15.08.2026 — Paket 1 der 01-Definition).
 *
 * Zwei Fuehrungen auf DEMSELBEN Odontogramm (perio.js), umgeschaltet per
 * ?mode= aus der iPad-App:
 *   mode=ki    KI-gefuehrt  — Lena geht alle Fachbereiche der Reihe nach durch
 *                            (Schritt fuer Schritt, oeffnet den passenden Tab).
 *   mode=arzt  Arzt-gefuehrt — der Arzt diktiert frei, Lena zeigt nur die
 *                            noch nicht besprochenen Fachbereiche (Luecken).
 * Beide speichern denselben 01-Stand. Am Ende entscheidet der Arzt:
 *   Bedarf berechnen?  Ja  -> Absicht merken (Kaskade folgt, Paket 2)
 *                      Nein -> 01-Befund direkt in die Uebertragungsliste (PVS).
 *
 * KEIN Eingriff in perio.js/perio-voice.js/Clara — nur die exportierte
 * Bruecke window.Lena01 (setTab/snapshot/fachCounts/toPvsText) wird genutzt.
 */
(function () {
  "use strict";

  const qs = new URLSearchParams(location.search);
  // Gabelung KI- vs Arzt-gefuehrt erfolgt IN der 01-Seite, nach dem Klick auf
  // "01-Modus" am iPad (Chef 15.08.2026). Ein ?mode= im Link ist nur ein
  // optionaler Deep-Link/Rueckweg; ohne mode fragt die Seite selbst.
  let MODE = qs.get("mode") === "ki" ? "ki" : (qs.get("mode") === "arzt" ? "arzt" : null);

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

  // ── Gabelung: Wer fuehrt die 01? ──────────────────────────────────────────
  // Eigene Seite mit zwei Kacheln (start.html) — kein Modal (Chef 15.08.2026).
  // Ohne mode landet 01.html dort; die Wahl kommt als ?mode= zurueck.
  function toModePage() {
    const p = new URLSearchParams(location.search);
    p.delete("mode");
    const q = p.toString();
    location.replace("/m/lena-01/start.html" + (q ? "?" + q : ""));
  }

  function buildBar() {
    bar = document.createElement("div");
    bar.id = "lena01Bar";
    bar.className = "mode-" + MODE;
    bar.innerHTML =
      '<span class="l01-mode" id="l01Mode"></span>' +
      '<div class="l01-body" id="l01Body"></div>' +
      '<button type="button" class="l01-done" id="l01Done">Fertig \u00b7 Bedarf?</button>';
    document.body.appendChild(bar);
    elMode = document.getElementById("l01Mode");
    elBody = document.getElementById("l01Body");
    elMode.textContent = MODE === "ki" ? "KI-gef\u00fchrt" : "Arzt-gef\u00fchrt";
    document.getElementById("l01Done").addEventListener("click", openDecision);

    elToast = document.createElement("div");
    elToast.id = "l01Toast";
    elToast.hidden = true;
    document.body.appendChild(elToast);
  }

  function ready() {
    return !!(window.Lena01 && typeof Lena01.snapshot === "function");
  }

  // ── KI-gefuehrt: Schritt-fuer-Schritt ─────────────────────────────────────
  function renderKi() {
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

  // ── Ende-Frage: Bedarf berechnen? ─────────────────────────────────────────
  function openDecision() {
    if (document.getElementById("l01Modal")) return;
    const ov = document.createElement("div");
    ov.id = "l01Modal";
    ov.innerHTML =
      '<div class="l01-card" role="dialog" aria-modal="true">' +
      '<h2>01 abgeschlossen</h2>' +
      "<p>Behandlungsbedarf jetzt berechnen \u2014 oder den Befund nur in die Praxissoftware \u00fcbernehmen?</p>" +
      '<div class="l01-choices">' +
      '<button type="button" class="l01-choice yes" id="l01Yes"><b>Ja \u2014 Bedarf berechnen</b><span>Termine, Worksheet &amp; Pl\u00e4ne (folgt)</span></button>' +
      '<button type="button" class="l01-choice no" id="l01No"><b>Nein \u2014 nur ins PVS</b><span>01-Befund in die \u00dcbertragungsliste (Holen)</span></button>' +
      "</div>" +
      '<button type="button" class="l01-cancel" id="l01Cancel">Abbrechen</button>' +
      "</div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    document.getElementById("l01Cancel").addEventListener("click", () => ov.remove());
    document.getElementById("l01Yes").addEventListener("click", () => decide("bedarf", ov));
    document.getElementById("l01No").addEventListener("click", () => decide("pvs", ov));
  }

  async function decide(decision, ov) {
    const btnYes = document.getElementById("l01Yes");
    const btnNo = document.getElementById("l01No");
    if (btnYes) btnYes.disabled = true;
    if (btnNo) btnNo.disabled = true;
    const r = await save(decision);
    if (ov) ov.remove();
    if (!r || !r.ok) {
      toast(r && r.error === "no_content"
        ? "Kein Befund erfasst \u2014 bitte erst dokumentieren."
        : "Speichern fehlgeschlagen \u2014 bitte erneut versuchen.");
      return;
    }
    if (decision === "bedarf") {
      toast("Vorgemerkt: Bedarf berechnen. Die Kaskade folgt (Paket 2).");
    } else {
      const queued = r.pvs && r.pvs.queued;
      toast(queued
        ? "01-Befund in die \u00dcbertragungsliste gelegt \u2014 in DS-WIN mit \u201eHolen\u201c abrufen."
        : "01-Befund gespeichert. Kein Schreibweg aktiv \u2014 nur in Pickadoc abgelegt.");
      setTimeout(() => { location.href = "/m/ipad-app.html"; }, 2600);
    }
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
    buildBar();
    if (MODE === "ki") gotoStep(0); else renderBody();
    // Fach-Zaehler/Luecken laufen mit dem Voice-Poll mit (leichter Takt).
    setInterval(() => { if (!document.hidden) renderBody(); }, 2000);
    setInterval(() => { if (!document.hidden) autosave(); }, 15000);
    window.addEventListener("beforeunload", () => { try { autosave(); } catch (_) {} });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    if (MODE) start(MODE);      // mode gesetzt (aus start.html/Deep-Link) -> los
    else toModePage();          // ohne mode: zur Kachel-Auswahl (eigene Seite)
  }
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
