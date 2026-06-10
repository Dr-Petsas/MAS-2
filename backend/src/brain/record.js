import { appendEvent } from "./eventStore.js";
import { linkEventToCase } from "./caseStore.js";
import { enqueueBrainWrite } from "./outbox.js";
import { log } from "../log.js";

// ============================================================================
// The SINGLE reliable path to put a communication into the shared brain:
// append the immutable event AND thread it onto a case — so Clara and Nadine
// always see the same picture. A communication is NEVER silently lost: if the
// append or the case-threading fails (e.g. transient Firestore error) after the
// mail was already sent / the call already happened, the work is queued in the
// dead-letter outbox and retried. Callers get a truthful {ok, queued} result.
//
// Idempotency: pass a STABLE `id` on eventInput (e.g. "mail-in:<docId>",
// "mail-out:<docId>") so a retry/re-sync is a no-op instead of a duplicate.
// ============================================================================

/**
 * @param {string} clientId
 * @param {object} eventInput buildEvent-shaped input (pass a stable id!)
 * @param {{by?:string, link?:boolean}} [opts]
 * @returns {Promise<{ok:boolean, eventId?:string, caseId?:string|null, queued?:boolean, error?:string}>}
 */
export async function recordCommunication(clientId, eventInput, { by, link = true } = {}) {
  let event;
  try {
    ({ event } = await appendEvent(clientId, eventInput));
  } catch (err) {
    await enqueueBrainWrite(clientId, { kind: "record", eventInput, by: by || null, link });
    log.error("brain append failed — queued for retry", { clientId, err });
    return { ok: false, queued: true, error: String(err?.message || err) };
  }

  if (!link) return { ok: true, eventId: event.id, caseId: null };

  try {
    const caseLink = await linkEventToCase(clientId, event, { by });
    return { ok: true, eventId: event.id, caseId: caseLink?.caseId || null };
  } catch (err) {
    // The fact is safe; only the threading failed. Queue a link-repair so the
    // ticket is created/updated on the next sweep — keyed by the event id.
    await enqueueBrainWrite(clientId, { kind: "link", eventId: event.id, by: by || null });
    log.error("case threading failed — queued for retry", { clientId, eventId: event.id, err });
    return { ok: true, eventId: event.id, caseId: null, queued: true, error: String(err?.message || err) };
  }
}
