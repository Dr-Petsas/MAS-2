import admin from "../firebase.js";
import { masCollection } from "../tenant.js";

// ============================================================================
// Brain dead-letter / repair queue. When a brain write (append event or thread
// it onto a case) fails AFTER a communication already happened (mail sent, call
// logged), the work is NOT lost: it is queued here and retried with exponential
// backoff by the scheduler. Anything that exhausts its attempts is marked "dead"
// and surfaced in /health/ready so a human notices. Tenant-isolated (mas_*).
//
// Job kinds:
//   { kind: "record", eventInput, by, link }   re-append the event + (re)thread
//   { kind: "link",   eventId,   by }           re-thread an already-stored event
// ============================================================================

const COLLECTION = "mas_brain_outbox";
const FieldValue = admin.firestore.FieldValue;
const MAX_ATTEMPTS = 8;

function col(clientId) {
  return masCollection(clientId, COLLECTION);
}

/** Queue a failed brain write for retry. Never throws (best-effort safety net). */
export async function enqueueBrainWrite(clientId, job) {
  try {
    await col(clientId).add({
      ...job,
      attempts: 0,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      nextAt: Date.now(),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** How many jobs are still pending / dead — for health checks and dashboards. */
export async function outboxHealth(clientId) {
  try {
    const [pending, dead] = await Promise.all([
      col(clientId).where("status", "==", "pending").limit(100).get(),
      col(clientId).where("status", "==", "dead").limit(100).get(),
    ]);
    return { pending: pending.size, dead: dead.size };
  } catch {
    return { pending: 0, dead: 0, error: true };
  }
}

/**
 * Process due jobs once. Imports the brain stores lazily so this module has no
 * static dependency cycle. Re-appends/re-links; on failure applies exponential
 * backoff; dead-letters after MAX_ATTEMPTS.
 */
export async function processBrainOutbox(clientId, { limit = 25 } = {}) {
  const { appendEvent, getEvent } = await import("./eventStore.js");
  const { linkEventToCase } = await import("./caseStore.js");
  const now = Date.now();

  let snap;
  try {
    snap = await col(clientId).where("status", "==", "pending").limit(limit).get();
  } catch {
    return { processed: 0, repaired: 0, failed: 0, dead: 0 };
  }

  let processed = 0, repaired = 0, failed = 0, dead = 0;
  for (const d of snap.docs) {
    const job = d.data();
    if (Number(job.nextAt || 0) > now) continue; // not due yet
    processed++;
    try {
      if (job.kind === "link") {
        const ev = await getEvent(clientId, job.eventId);
        if (!ev) { await d.ref.update({ status: "done", note: "event_gone", doneAt: FieldValue.serverTimestamp() }); repaired++; continue; }
        await linkEventToCase(clientId, ev, { by: job.by });
      } else if (job.kind === "record") {
        const { event } = await appendEvent(clientId, job.eventInput);
        if (job.link !== false) await linkEventToCase(clientId, event, { by: job.by });
      } else {
        await d.ref.update({ status: "dead", lastError: "unknown_kind" });
        dead++; continue;
      }
      await d.ref.update({ status: "done", doneAt: FieldValue.serverTimestamp() });
      repaired++;
    } catch (err) {
      const attempts = Number(job.attempts || 0) + 1;
      const isDead = attempts >= MAX_ATTEMPTS;
      await d.ref.update({
        attempts,
        status: isDead ? "dead" : "pending",
        lastError: String(err?.message || err),
        // Exponential backoff, capped at 1h.
        nextAt: now + Math.min(60 * 60 * 1000, 1000 * 2 ** attempts),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (isDead) dead++; else failed++;
    }
  }
  return { processed, repaired, failed, dead };
}

/** All tenants with a brain outbox — used by the scheduler sweep. */
export async function tenantsWithOutbox({ limit = 500 } = {}) {
  try {
    const snap = await admin.firestore().collectionGroup(COLLECTION).where("status", "==", "pending").limit(limit).get();
    const ids = new Set();
    for (const d of snap.docs) {
      const clientId = d.ref.parent.parent?.id;
      if (clientId) ids.add(clientId);
    }
    return [...ids];
  } catch {
    return [];
  }
}
