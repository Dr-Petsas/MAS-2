// Mandanten-Registry (W-MANDANT-0, 30.08.2026).
//
// EINE Quelle fuer "welche Praxen sind aktiv?": jede Praxis mit Kalender-
// Config (clients/{id}/mas_config/booking + locationId) plus der
// DEFAULT_CLIENT_ID (Pilot meddent). Solange nur meddent eine Kalender-Config
// traegt, liefert die Registry exakt [DEFAULT_CLIENT_ID] — Verhalten wie vor
// dem Umbau. Ein zweiter Mandant erscheint hier automatisch, sobald seine
// Booking-Config in Firestore liegt.
//
// Betrieb/Notfall:
// - MAS_MANDANTEN="id1,id2"        feste Liste, ueberstimmt die Registry
// - MAS_MULTI_TENANT_SCHEDULER=0   Scheduler laeuft wie frueher NUR fuer
//                                  DEFAULT_CLIENT_ID (Notaus, W-MANDANT-2)
// - Test-Mandanten (zzz-mas2-*) werden IMMER ausgefiltert — Testlaeufe
//   duerfen nie Hintergrundjobs einsammeln.
import { DEFAULT_CLIENT_ID } from "./routes/_shared.js";
import { tenantsWithCalendar } from "./clara/calendarWatch.js";
import { log } from "./log.js";

// Registry-Antwort kurz cachen: die Scheduler-Takte fragen im Sekunden-/
// Minutenrhythmus — eine collectionGroup-Query pro Takt und Job waere Geld
// ohne Erkenntnis. 5 Minuten Verzug beim Aufschalten einer neuen Praxis
// sind verschmerzbar.
const CACHE_TTL_MS = Math.max(30000, Number(process.env.MAS_MANDANTEN_CACHE_MS || 300000));
let cache = { ids: null, ts: 0 };

const istTestMandant = (id) => id.startsWith("zzz-mas2-");

/** Alle aktiven Mandanten, DEFAULT_CLIENT_ID immer zuerst (Pilot-Prioritaet). */
export async function aktiveMandanten() {
  const envList = (process.env.MAS_MANDANTEN || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (envList.length) return envList;

  const now = Date.now();
  if (cache.ids && now - cache.ts < CACHE_TTL_MS) return cache.ids;

  const ids = await tenantsWithCalendar().catch(() => []);
  const rest = [...new Set(ids.filter((id) => id && !istTestMandant(id) && id !== DEFAULT_CLIENT_ID))];
  const list = DEFAULT_CLIENT_ID ? [DEFAULT_CLIENT_ID, ...rest] : rest;
  cache = { ids: list, ts: now };
  return list;
}

/**
 * Mandanten fuer die Hintergrundjobs in server.js (W-MANDANT-2).
 * Notaus MAS_MULTI_TENANT_SCHEDULER=0 => exakt das Verhalten vor dem Umbau
 * (nur der Default-Mandant, keine Registry-Abfrage).
 */
export async function schedulerMandanten() {
  if (process.env.MAS_MULTI_TENANT_SCHEDULER === "0") {
    return DEFAULT_CLIENT_ID ? [DEFAULT_CLIENT_ID] : [];
  }
  return aktiveMandanten();
}

/** Nur fuer Tests: Cache verwerfen, damit Env-Aenderungen sofort greifen. */
export function mandantenCacheLeeren() {
  cache = { ids: null, ts: 0 };
}

// W-MANDANT-2: Ein Hintergrundjob laeuft fuer JEDEN aktiven Mandanten.
// Fehler-Isolation nach dem Muster aus mail/scheduler.js: Ein kaputter
// Mandant (fehlende Config, kaputte Daten) stoppt NIE die anderen — er wird
// geloggt und die Schleife laeuft weiter. Die Mandantenliste wird einmal beim
// Start und bei jeder Aenderung geloggt, nicht bei jedem Takt (Rauschen).
let letzteMandantenMeldung = "";
export async function fuerAlleMandanten(jobName, fn) {
  let mandanten = [];
  try {
    mandanten = await schedulerMandanten();
  } catch (e) {
    log.warn("scheduler.mandanten_error", { job: jobName, error: String(e?.message || e) });
    return;
  }
  const alsText = JSON.stringify(mandanten);
  if (alsText !== letzteMandantenMeldung) {
    letzteMandantenMeldung = alsText;
    log.info("scheduler.mandanten", { mandanten });
  }
  for (const cid of mandanten) {
    try {
      await fn(cid);
    } catch (e) {
      log.warn(`${jobName}.tenant_error`, { clientId: cid, error: String(e?.message || e) });
    }
  }
}
