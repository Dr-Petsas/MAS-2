import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { buildEvent, EVENT_TYPES, ITEM_STATUS, CHANNELS, normalizeSignals, normalizeSubject } from "./events.js";

// ============================================================================
// Persistence for the shared brain. The ONLY module here that does I/O.
//
// Storage: clients/{clientId}/mas_events/{eventId} — MAS-owned, tenant-isolated
// (mas_* prefix), additive. We never touch platform collections.
//
// Append-only: events are written with create() so a retried write is an
// idempotent no-op (pass a stable `id` to dedupe). Operational state changes
// (open -> resolved) are applied to the item AND recorded as a separate
// resolution event, so the audit trail stays complete.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const COLLECTION = "mas_events";

function col(clientId) {
  return masCollection(clientId, COLLECTION);
}

/**
 * Append one event to the timeline. Idempotent: a duplicate `id` is treated as
 * success (the existing event is returned), so callers/webhooks can retry.
 *
 * @param {string} clientId
 * @param {object} input raw event input (see events.buildEvent)
 * @returns {Promise<{event: object, created: boolean}>}
 */
export async function appendEvent(clientId, input) {
  const event = buildEvent({ ...input, clientId });
  const ref = col(clientId).doc(event.id);
  const toStore = { ...event, createdAt: FieldValue.serverTimestamp() };
  try {
    await ref.create(toStore);
    return { event, created: true };
  } catch (err) {
    if (err?.code === 6 /* ALREADY_EXISTS */) {
      const snap = await ref.get();
      return { event: snap.exists ? snap.data() : event, created: false };
    }
    throw err;
  }
}

/** Fetch a single event by id, or null. */
export async function getEvent(clientId, eventId) {
  const snap = await col(clientId).doc((eventId || "").trim()).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Events since a timestamp (ms), ascending by time. Single-field range+order →
 * no composite index required.
 *
 * @param {string} clientId
 * @param {number} sinceTs epoch ms (inclusive)
 * @param {number} [limit=500]
 * @returns {Promise<object[]>}
 */
export async function queryRecent(clientId, sinceTs, limit = 500) {
  const snap = await col(clientId)
    .where("ts", ">=", Number(sinceTs) || 0)
    .orderBy("ts", "asc")
    .limit(Math.max(1, Math.min(2000, limit)))
    .get();
  return snap.docs.map((d) => d.data());
}

/**
 * Events about one patient (most recent first). Equality-only query (single
 * field index) + in-memory sort to avoid a composite index.
 */
export async function queryByPatient(clientId, patientId, limit = 100) {
  const pid = (patientId || "").trim();
  if (!pid) return [];
  const snap = await col(clientId)
    .where("subject.patientId", "==", pid)
    .limit(500)
    .get();
  const events = snap.docs.map((d) => d.data());
  events.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return events.slice(0, Math.max(1, limit));
}

/**
 * Resolve an open item. Records WHO/WHAT closed it (an AI like "bianca"/"lisa",
 * a userId, or "system") and appends a resolution event for the audit trail.
 * This is how an executing AI marks a matter as handled so it stops surfacing
 * in the briefing and no further outreach is triggered.
 *
 * @param {string} clientId
 * @param {string} eventId the open item being resolved
 * @param {{actor:string, note?:string, ts?:number}} resolvedBy
 * @returns {Promise<{ok:boolean, reason?:string, resolutionEventId?:string}>}
 */
export async function resolveItem(clientId, eventId, resolvedBy = {}) {
  const id = (eventId || "").trim();
  if (!id) return { ok: false, reason: "missing_event_id" };

  const ref = col(clientId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };

  const target = snap.data();
  const resolution = {
    actor: (resolvedBy.actor || "system").trim(),
    note: (resolvedBy.note || "").trim(),
    ts: Number.isFinite(Number(resolvedBy.ts)) ? Number(resolvedBy.ts) : Date.now(),
  };

  // 1) flip operational state on the item (derived state, not the fact itself)
  await ref.set(
    { status: ITEM_STATUS.RESOLVED, resolvedBy: resolution, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  // 2) append an immutable resolution event (audit trail)
  const { event } = await appendEvent(clientId, {
    channel: CHANNELS.SYSTEM,
    type: EVENT_TYPES.NOTE,
    direction: "internal",
    subject: target.subject,
    summary: `Erledigt durch ${resolution.actor}${resolution.note ? `: ${resolution.note}` : ""}.`,
    resolvesEventId: id,
    status: ITEM_STATUS.NONE,
    extractor: null,
  });

  return { ok: true, resolutionEventId: event.id };
}

/**
 * Human correction overlay (pre/post-call edit). Stores a `humanReview` block
 * with the corrected summary/signals/subject — the original extraction stays
 * intact for audit; reads merge the review via events.applyHumanReview.
 *
 * @param {string} clientId
 * @param {string} eventId
 * @param {{summary?:string, signals?:object, subject?:object, by?:string, note?:string}} review
 */
export async function annotateEvent(clientId, eventId, review = {}) {
  const id = (eventId || "").trim();
  if (!id) return { ok: false, reason: "missing_event_id" };

  const ref = col(clientId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };

  const humanReview = {
    by: (review.by || "frontdesk").trim(),
    note: (review.note || "").trim(),
    ts: Date.now(),
  };
  if (typeof review.summary === "string") humanReview.summary = review.summary.trim();
  if (review.signals && typeof review.signals === "object") humanReview.signals = normalizeSignals(review.signals);
  if (review.subject && typeof review.subject === "object") humanReview.subject = normalizeSubject(review.subject);

  await ref.set({ humanReview, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const updated = (await ref.get()).data();
  return { ok: true, event: updated };
}
