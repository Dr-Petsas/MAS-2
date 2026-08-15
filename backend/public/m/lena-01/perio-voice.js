/**
 * 01-Modus: Stimme → Zahnauswahl / KZBV-Marks.
 * Pollt /treatment/heartbeat (gleiche Device-Creds wie iPad-App).
 */
(function () {
  "use strict";

  let known = new Set();
  let lastFdi = null;
  let timer = null;

  function creds() {
    try { return JSON.parse(localStorage.getItem("pickadoc.ipad.v1") || "null"); }
    catch (_) { return null; }
  }

  function treatmentCtx() {
    const c = creds();
    if (!c?.clientId || !c?.deviceKey) return null;
    // URL ?appointmentId=&locationId= optional; sonst last from sessionStorage
    const q = new URLSearchParams(location.search);
    let locationId = q.get("locationId") || sessionStorage.getItem("lena01.locationId") || "";
    let appointmentId = q.get("appointmentId") || sessionStorage.getItem("lena01.appointmentId") || "";
    return {
      clientId: c.clientId,
      deviceId: c.deviceId || "",
      deviceKey: c.deviceKey,
      locationId,
      appointmentId,
    };
  }

  async function pull() {
    if (!window.Lena01 || !window.LenaVoiceChart) return;
    const ctx = treatmentCtx();
    if (!ctx?.locationId || !ctx?.appointmentId) return;
    try {
      const resp = await fetch("/treatment/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          clientId: ctx.clientId,
          locationId: ctx.locationId,
          appointmentId: ctx.appointmentId,
          deviceLabel: "iPad-01",
          presence: false,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok || !Array.isArray(data.segments)) return;
      for (const s of data.segments) {
        if (!s || s.struck || !s.id) continue;
        // SOFORT reagieren wie bisher (Chef 24.07.: Speed). Die qwen-Korrektur
        // (textCorrected) wird OPPORTUNISTISCH genommen, wenn sie schon da ist —
        // aber NIE darauf gewartet. parseUtterance mappt gesprochene Zahlen
        // ohnehin ins FDI-Schema, also kostet Roh keine Genauigkeit.
        const corrected = typeof s.textCorrected === "string" ? s.textCorrected.trim() : "";
        const text = corrected || (typeof s.text === "string" ? s.text.trim() : "");
        if (!text) continue;
        if (known.has(s.id)) continue;
        known.add(s.id);
        if (window.Lena01Ask && Lena01Ask.isActive() && Lena01Ask.hear(text)) continue;
        const events = window.LenaVoiceChart.parseUtterance(text);
        events.forEach((ev) => {
          if (ev.fdi) {
            lastFdi = ev.fdi;
            window.Lena01.selectTooth(ev.fdi);
          }
          const payload = {
            fdi: ev.fdi || lastFdi,
            codes: ev.codes || [],
            surfaces: ev.surfaces || [],
          };
          if (payload.fdi && (payload.codes.length || payload.surfaces.length)) {
            window.Lena01.applyVoiceEvent(payload);
          }
        });
      }
    } catch (_) {}
  }

  function boot() {
    // Kontext von der iPad-App übernehmen, falls als Query gesetzt
    const q = new URLSearchParams(location.search);
    if (q.get("locationId")) sessionStorage.setItem("lena01.locationId", q.get("locationId"));
    if (q.get("appointmentId")) sessionStorage.setItem("lena01.appointmentId", q.get("appointmentId"));
    timer = setInterval(() => {
      if (document.hidden) return;
      pull();
    }, 1500);
    pull();
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
