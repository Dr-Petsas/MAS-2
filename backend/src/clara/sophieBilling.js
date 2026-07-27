// Sophie-Abrechnung als Clara-Tool (ADDITIV)
// ===========================================================================
// Clara nimmt eine Behandlungsbeschreibung entgegen und ruft die Cloud Function
// `masSophieBilling` auf. Daraus wird ENTWEDER die naechste Gegenfrage (damit
// Clara sie dem Chef stellt) ODER der fertige Abrechnungsvorschlag mit den
// Endsummen (GOZ 2,3 / GOZ 3,5 / BEMA / BEMA+), die Clara ansagt.
//
// Vertragstreue: rein additiv. Aendert keinen bestehenden Endpunkt. Die
// eigentliche Rechen-Wahrheit liegt in der CF (geteilte Sophie-Engine); hier
// passiert nur HTTP-Aufruf + sprechbare Formulierung + bester-Aufwand-Eintrag
// ins geteilte Gedaechtnis (Cockpit-/Patienten-Timeline).

import { appendEvent } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";
import { loadBooking } from "./booking.js";

const REAL_CF_BASE = (
  process.env.PICKADOC_REAL_CF_BASE_URL || "https://europe-west3-docgenda.cloudfunctions.net"
).replace(/\/+$/, "");

/** Ganze Euro, sprechbar (keine Nachkommastellen am Telefon). */
function euroWhole(n) {
  const v = Math.round(Number(n) || 0);
  return `${v.toLocaleString("de-DE")} Euro`;
}

/** Endsummen-Satz fuer die Ansage am Telefon. */
function spokenSummen(r) {
  const s = r.summen || {};
  const label = r.label || "die Behandlung";
  const goz23 = s.goz23?.gesamt || 0;
  const goz35 = s.goz35?.gesamt || 0;
  const bema = s.bema?.gesamt || 0;
  const bemaplus = s.bemaplus?.gesamt || 0;

  const teile = [
    `Abrechnungsvorschlag fuer ${label}:`,
    `privat nach GOZ zum 2,3-fachen Satz rund ${euroWhole(goz23)}, zum 3,5-fachen Satz rund ${euroWhole(goz35)}.`,
  ];
  if (bema > 0) {
    teile.push(`Gesetzlich nach BEMA rund ${euroWhole(bema)}; im Mischfall BEMA plus rund ${euroWhole(bemaplus)}.`);
  } else {
    teile.push(`Nach BEMA keine Kassenleistung; im Mischfall BEMA plus rund ${euroWhole(bemaplus)}.`);
  }
  teile.push("Unverbindlicher Vorschlag, bitte fachlich pruefen.");
  return teile.join(" ");
}

async function callCf(body, timeoutMs = 35000) {
  // Timeout-Pflicht (04.07.2026): Die Cloud Function hat selbst 30 s Limit.
  // Ohne AbortController hing dieser fetch bei Netz-/CF-Problemen unendlich —
  // Clara wartete ewig auf die Abrechnung ("System haengt"). 35 s = CF-Limit
  // plus Puffer, danach kommt eine ehrliche Fehlermeldung statt Stille.
  // Stille Sonden (Doku-Memo-Check) duerfen ein kuerzeres Limit setzen.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${REAL_CF_BASE}/masSophieBilling`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    return { status: resp.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort: Abrechnungsvorschlag ins geteilte Gedaechtnis (Cockpit-Timeline). */
async function rememberSophie(clientId, r, { patientId, lastName } = {}) {
  try {
    const s = r.summen || {};
    const kurz =
      `Abrechnungsvorschlag (Sophie): ${r.label || r.streckeId || "Fall"} — ` +
      `GOZ 2,3 ${euroWhole(s.goz23?.gesamt)}, GOZ 3,5 ${euroWhole(s.goz35?.gesamt)}, ` +
      `BEMA ${euroWhole(s.bema?.gesamt)}, BEMA+ ${euroWhole(s.bemaplus?.gesamt)}.`;
    const pid = String(patientId || "").trim();
    const name = String(lastName || "").trim();
    await appendEvent(clientId, {
      channel: CHANNELS.LENA_DOC,
      type: EVENT_TYPES.NOTE,
      direction: DIRECTIONS.INTERNAL,
      counterparty: { kind: "system", name: "Sophie", ref: null },
      subject: pid
        ? { patientId: pid, name, matchStatus: "matched", matchMethod: "name" }
        : { name, matchStatus: name ? "unmatched" : "n/a" },
      status: "none",
      summary: kurz,
      extractor: "sophie@billing",
      tags: ["sophie", "abrechnung", "behandlung"],
    });
  } catch (memErr) {
    console.warn("sophieBilling: brain-event failed:", memErr?.message || memErr);
  }
}

/**
 * Berechnet/erfragt den Abrechnungsvorschlag.
 *
 * @param {string} clientId
 * @param {object} args { text, streckeId, streckeIds, slots, faktor, bemaPunktwert, appointmentId, patientId, lastName }
 * @param {object} opts { quiet, timeoutMs } — quiet = stille Sonde (Doku-Memo-
 *   Check): KEINE Persistenz am Termin, KEIN Gedaechtnis-Eintrag; nur Status
 *   und ggf. Gegenfrage zurueckgeben.
 * @returns {Promise<object>} { ok, status, message, ... }  (message = sprechbar)
 */
export async function sophieBill(clientId, args = {}, opts = {}) {
  const quiet = opts.quiet === true;
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 35000;
  const text = String(args.text || "").trim();
  const streckeId = String(args.streckeId || "").trim();
  const streckeIds = Array.isArray(args.streckeIds) ? args.streckeIds.filter((s) => typeof s === "string") : undefined;
  if (!text && !streckeId && !(streckeIds && streckeIds.length)) {
    return { ok: false, message: "Bitte beschreibe kurz die Behandlung, die ich abrechnen soll." };
  }

  // locationId fuer die optionale CF-Persistenz (nur wenn ein Termin mitkommt).
  let locationId = "";
  try {
    const booking = await loadBooking(clientId);
    locationId = booking?.locationId || booking?.location_id || "";
  } catch {
    /* Persistenz ist optional */
  }

  const appointmentId = quiet ? "" : String(args.appointmentId || "").trim();
  const body = {
    text: text || undefined,
    streckeId: streckeId || undefined,
    streckeIds,
    slots: args.slots && typeof args.slots === "object" ? args.slots : undefined,
    faktor: typeof args.faktor === "number" ? args.faktor : undefined,
    bemaPunktwert: typeof args.bemaPunktwert === "number" ? args.bemaPunktwert : undefined,
    // Persistenz in der CF nur, wenn ein Termin eindeutig benannt ist.
    clientId: appointmentId ? clientId : undefined,
    locationId: appointmentId ? locationId : undefined,
    appointmentId: appointmentId || undefined,
  };

  let out;
  try {
    out = await callCf(body, timeoutMs);
  } catch (e) {
    return { ok: false, message: `Die Abrechnung konnte ich gerade nicht berechnen (${String(e?.message || e)}).` };
  }

  const data = out.data || {};
  if (out.status !== 200) {
    return { ok: false, message: `Die Abrechnung ist fehlgeschlagen (${data.message || `HTTP ${out.status}`}).` };
  }

  if (data.status === "needs_input") {
    const frage = data.frage?.frage || "Mir fehlt noch eine Angabe zur Behandlung.";
    return {
      ok: true,
      status: "needs_input",
      slot: data.frage?.slot || "",
      streckeId: data.streckeId || "",
      // Komplette Frage-Definition (slot, typ, optionen) fuer die MAS-seitige
      // Slot-Extraktion: Freitext-Antworten ("zweiflaechig", "Infiltration")
      // versteht die CF-Engine selbst NICHT — das loest dokuAbrechnung.js.
      frageDetail: data.frage || null,
      message: frage,
    };
  }

  if (data.status === "no_match") {
    return {
      ok: true,
      status: "no_match",
      message: "Ich konnte die Behandlung nicht eindeutig zuordnen. Mögen Sie sie etwas genauer beschreiben?",
    };
  }

  if (data.status === "complete") {
    const message = spokenSummen(data);
    // Stille Sonden schreiben NICHT ins geteilte Gedaechtnis — erst der
    // ausdrueckliche "rechne ab"-Lauf hinterlaesst den Vorschlag dort.
    if (!quiet) rememberSophie(clientId, data, { patientId: args.patientId, lastName: args.lastName }).catch(() => {});
    return {
      ok: true,
      status: "complete",
      streckeId: data.streckeId || "",
      label: data.label || "",
      summen: data.summen || null,
      persisted: data.persisted || null,
      message,
    };
  }

  return { ok: false, message: "Die Abrechnung lieferte kein verwertbares Ergebnis." };
}
