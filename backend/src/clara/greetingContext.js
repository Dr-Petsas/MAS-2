import { queryLatest } from "../brain/eventStore.js";
import { applyHumanReview } from "../brain/events.js";
import { vary } from "./speech.js";

// ============================================================================
// Begruessungs-Kontext (W-HUMAN Stufe 2, Chef 10.07.2026): "Starts sollten
// interessant sein - z.B. das letzte auffaellige Ereignis, wenn es unmittelbar
// mit der Kontaktaufnahme zeitlich passt."
//
// Beim Verbinden holt der Voice-Worker EINEN frischen, auffaelligen Vorfall
// (<= 45 min alt) aus dem geteilten Gedaechtnis und spricht ihn direkt nach
// dem Hallo: "Uebrigens, vor zwoelf Minuten reingekommen: Anruf von Frau
// Meier - hat weiterhin Schmerzen." Der Inhalt ist die ECHTE, attribuierte
// Ereignis-Zusammenfassung aus mas_events - hier wird nichts formuliert, was
// nicht im Gedaechtnis steht (Fakten aus Daten, Rahmen aus Code).
//
// Bewusst NICHT auffaellig: Kalender-Automatik (channel "system", appt-watch)
// - genau das Echo, das der Chef am 09.07. aus dem Briefing verbannt hat -
// sowie Claras eigene Sitzungen und Lena-Doku (interne Ablage).
// ============================================================================

export const GREETING_FRESH_MS = 45 * 60 * 1000;

// Kanaele, deren frische Ereignisse eine Begruessung wert sind: echte
// Kommunikation von aussen. system/clara_voice/lena_doc sind interne Ablage.
const SPEAKABLE_CHANNELS = new Set([
  "bianca_call", "lisa_call", "lisa_sms", "nadine_email", "nadine_letter", "frontdesk",
]);

function noteworthy(e) {
  const s = e?.signals || {};
  return Boolean(
    s.critical || s.complaintStated || s.painPersists || s.needsHuman
    || s.callbackRequested || s.unresolvedByAI || e?.status === "open",
  );
}

/**
 * Juengstes auffaelliges Ereignis im Frische-Fenster - oder null. Pure.
 * @param {object[]} events rohe mas_events (beliebige Reihenfolge)
 * @param {number} [nowMs]
 * @param {number} [freshMs]
 * @returns {object|null}
 */
export function pickFreshNotable(events, nowMs = Date.now(), freshMs = GREETING_FRESH_MS) {
  const list = (Array.isArray(events) ? events : [])
    .filter((e) => e && Number(e.ts) > 0)
    .map(applyHumanReview)
    .filter((e) => nowMs - e.ts <= freshMs && e.ts <= nowMs + 60_000)
    .filter((e) => SPEAKABLE_CHANNELS.has(e.channel))
    .filter((e) => e.direction === "in" || e?.signals?.critical === true)
    .filter((e) => noteworthy(e))
    .filter((e) => String(e.summary || "").trim().length > 0)
    .sort((a, b) => b.ts - a.ts);
  return list[0] || null;
}

function relAgo(ts, nowMs) {
  const m = Math.round((nowMs - ts) / 60000);
  if (m < 3) return "gerade eben";
  if (m < 60) return `vor ${m} Minuten`;
  return "vor einer knappen Stunde";
}

/**
 * Gesprochener Hinweis auf das frische Ereignis. Rahmen rotiert (vary),
 * der Inhalt ist die woertliche Ereignis-Zusammenfassung (gekappt).
 * @param {object} e Ereignis aus pickFreshNotable
 * @param {number} [nowMs]
 * @returns {string}
 */
export function spokenFreshEvent(e, nowMs = Date.now()) {
  if (!e) return "";
  const lead = vary("gruss.frisch", [
    "Übrigens",
    "Kurz vorweg",
    "Eine Sache noch",
    "Bevor Sie loslegen",
  ]);
  let summary = String(e.summary || "").replace(/\s+/g, " ").trim();
  if (summary.length > 200) summary = `${summary.slice(0, 197)}...`;
  return `${lead}, ${relAgo(e.ts, nowMs)} reingekommen: ${summary}`;
}

/**
 * I/O-Huelle fuer die Route: liest die letzten Ereignisse und liefert
 * { spoken, eventId, ts } oder null. Best-effort - Fehler = kein Kontext.
 * @param {string} clientId
 * @returns {Promise<{spoken:string, eventId:string, ts:number}|null>}
 */
export async function getGreetingContext(clientId) {
  const now = Date.now();
  const events = await queryLatest(clientId, now - GREETING_FRESH_MS, 50);
  const e = pickFreshNotable(events, now);
  if (!e) return null;
  return { spoken: spokenFreshEvent(e, now), eventId: e.id, ts: e.ts };
}
