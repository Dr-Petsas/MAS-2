import { createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { getEvent, resolveItem } from "./eventStore.js";
import { applyHumanReview } from "./events.js";
import {
  buildCase,
  buildUpdate,
  assertStatus,
  deriveTopic,
  actorForChannel,
  isActiveStatus,
  compileCaseContext,
  buildEmailDraft,
  CASE_STATUS,
  UPDATE_KINDS,
} from "./cases.js";

// ============================================================================
// Persistence for Vorgänge (Cases). Storage:
//   clients/{clientId}/mas_cases/{caseId}
//
// The update log lives on the case doc as an append-only `updates` array (added
// atomically via arrayUnion). Each case stays small (one matter, a handful of
// contacts), so this is the right trade-off vs. a subcollection and keeps the
// whole thread readable in a single document read.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const COLLECTION = "mas_cases";

function col(clientId) {
  return masCollection(clientId, COLLECTION);
}

export async function createCase(clientId, input) {
  const c = buildCase({ ...input, clientId });
  await col(clientId).doc(c.id).set({ ...c, createdAt: FieldValue.serverTimestamp() });
  return c;
}

export async function getCase(clientId, caseId) {
  const snap = await col(clientId).doc((caseId || "").trim()).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Recent cases, newest activity first. Optional in-memory filters keep us free
 * of composite indexes. `activeOnly` hides resolved/closed.
 */
export async function listCases(clientId, { patientId, activeOnly, assignee, limit = 100 } = {}) {
  let cases;
  const pid = (patientId || "").trim();
  if (pid) {
    const snap = await col(clientId).where("subject.patientId", "==", pid).limit(200).get();
    cases = snap.docs.map((d) => d.data());
  } else {
    const snap = await col(clientId).orderBy("updatedAt", "desc").limit(Math.min(300, limit)).get();
    cases = snap.docs.map((d) => d.data());
  }
  if (activeOnly) cases = cases.filter((c) => isActiveStatus(c.status));
  const who = (assignee || "").trim().toLowerCase();
  if (who) cases = cases.filter((c) => String(c.assignee || "").toLowerCase() === who);
  cases.sort((a, b) => (b.updatedAt?.toMillis?.() ?? b.updatedAt ?? 0) - (a.updatedAt?.toMillis?.() ?? a.updatedAt ?? 0));
  return cases.slice(0, limit);
}

/**
 * Active cases for a SET of platform patients in few round trips (chunked
 * Firestore `in` queries). Returns Map<patientId, case[]> (newest first).
 * Powers cross-agent context: Clara's day list says "Herr X hat dazu gemailt"
 * because Nadine threaded that mail onto the patient's case.
 */
export async function listActiveCasesByPatientIds(clientId, patientIds = []) {
  const ids = [...new Set((patientIds || []).map((x) => String(x || "").trim()).filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const snap = await col(clientId).where("subject.patientId", "in", chunk).limit(200).get();
    for (const d of snap.docs) {
      const c = d.data();
      if (!isActiveStatus(c.status)) continue;
      const pid = c.subject?.patientId;
      if (!pid) continue;
      if (!out.has(pid)) out.set(pid, []);
      out.get(pid).push(c);
    }
  }
  const ms = (v) => v?.toMillis?.() ?? (typeof v === "number" ? v : 0);
  for (const list of out.values()) list.sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
  return out;
}

/**
 * Append one update-log entry (who/when/what) and bump updatedAt. Returns the
 * stored update.
 */
export async function addUpdate(clientId, caseId, input) {
  const id = (caseId || "").trim();
  if (!id) return { ok: false, reason: "missing_case_id" };
  const ref = col(clientId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };

  const update = buildUpdate(input);
  await ref.update({ updates: FieldValue.arrayUnion(update), updatedAt: FieldValue.serverTimestamp() });
  return { ok: true, update };
}

/**
 * Change the lifecycle status. Records the transition in the update log with
 * the author, so "how far is it solved" is always auditable.
 */
export async function setStatus(clientId, caseId, status, { by, note } = {}) {
  const id = (caseId || "").trim();
  if (!id) return { ok: false, reason: "missing_case_id" };
  assertStatus(status);

  const ref = col(clientId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };

  const current = snap.data();
  const update = buildUpdate({
    by: by || "Team",
    kind: UPDATE_KINDS.STATUS,
    text: note || "",
    statusFrom: current.status,
    statusTo: status,
  });
  await ref.update({ status, updates: FieldValue.arrayUnion(update), updatedAt: FieldValue.serverTimestamp() });

  // Lifecycle coupling: closing a case settles its open items so the SAME
  // matter never lingers in the event briefing after the ticket is done. Each
  // resolution is audited (resolveItem appends a resolution event). Best-effort
  // and idempotent — already-resolved items are skipped.
  const settling = status === CASE_STATUS.RESOLVED || status === CASE_STATUS.CLOSED;
  const wasActive = isActiveStatus(current.status);
  if (settling && wasActive) {
    const ids = Array.isArray(current.eventIds) ? current.eventIds : [];
    for (const eid of ids) {
      try {
        const ev = await getEvent(clientId, eid);
        if (ev && ev.status === "open") {
          await resolveItem(clientId, eid, { actor: by || "Team", note: `Vorgang ${status}` });
        }
      } catch { /* non-blocking: a stuck item must not block the status change */ }
    }
  }
  return { ok: true, status, update };
}

/**
 * Delegate a case to an assignee (Nadine for a letter, Lisa for a callback, a
 * human, …) with an instruction. Records the handoff in the log (who delegated,
 * to whom, what) and moves an open case to in_progress. The assignee then has
 * the full thread as context (see getCaseContext).
 *
 * @param {string} clientId
 * @param {string} caseId
 * @param {{assignee:string, instruction?:string, by?:string}} opts
 */
export async function assignCase(clientId, caseId, { assignee, instruction, by } = {}) {
  const id = (caseId || "").trim();
  if (!id) return { ok: false, reason: "missing_case_id" };
  const who = (assignee || "").trim();
  if (!who) return { ok: false, reason: "missing_assignee" };

  const ref = col(clientId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const current = snap.data();

  const actor = (by || "Team").trim();
  const update = buildUpdate({
    by: actor,
    kind: UPDATE_KINDS.NOTE,
    text: `Delegiert an ${who}${instruction ? `: ${instruction}` : ""}.`,
  });
  const patch = {
    assignee: who,
    handoff: { assignee: who, instruction: (instruction || "").trim(), by: actor, ts: Date.now() },
    updates: FieldValue.arrayUnion(update),
    updatedAt: FieldValue.serverTimestamp(),
  };
  // A fresh "open" matter becomes "in_progress" once someone is on it.
  if (current.status === CASE_STATUS.OPEN) patch.status = CASE_STATUS.IN_PROGRESS;
  await ref.update(patch);
  return { ok: true, assignee: who, update };
}

/**
 * The complete context bundle for a case: the case itself, its fully-resolved
 * linked events (with payloadRef to raw transcripts), a compiled plain-text
 * briefing the assignee can act on directly, plus a suggested ready-to-edit
 * draft (so Nadine starts from a written draft, not a blank page).
 */
export async function getCaseContext(clientId, caseId) {
  const c = await getCase(clientId, caseId);
  if (!c) return null;
  const ids = Array.isArray(c.eventIds) ? c.eventIds : [];
  // Merge any human corrections so the assignee acts on the CORRECTED facts
  // (a verified summary/subject), not the raw AI extraction.
  const events = (await Promise.all(ids.map((id) => getEvent(clientId, id))))
    .filter(Boolean)
    .map(applyHumanReview);
  return { case: c, events, contextText: compileCaseContext(c, events), suggestedDraft: buildEmailDraft(c) };
}

/**
 * Save a prepared email/letter draft on the case (Nadine's work product) and log
 * it in the audit trail. A draft with content moves an open/in-progress matter to
 * "waiting_approval" (approval-first), so a human signs off before anything is sent.
 */
export async function saveCaseDraft(clientId, caseId, draft = {}, { by } = {}) {
  const id = (caseId || "").trim();
  if (!id) return { ok: false, reason: "missing_case_id" };
  const ref = col(clientId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const current = snap.data();

  const t = (v) => (v == null ? "" : String(v).trim());
  const author = t(by) || "Nadine";
  const stored = {
    channel: draft.channel === "letter" ? "letter" : "email",
    to: t(draft.to),
    subject: t(draft.subject),
    body: t(draft.body),
    by: author,
    ts: Date.now(),
  };
  // A prepared draft with content awaits a human's go-ahead (approval-first):
  // move an open/in-progress matter to "waiting_approval" so it surfaces in the
  // approval queue and the briefing — but never override a resolved/waiting case.
  const hasContent = !!(stored.subject || stored.body);
  const update = buildUpdate({
    by: author,
    kind: UPDATE_KINDS.NOTE,
    text: `Entwurf (${stored.channel === "letter" ? "Brief" : "E-Mail"}) vorbereitet${stored.subject ? `: ${stored.subject}` : ""}${hasContent ? " — wartet auf Freigabe." : "."}`,
  });
  const patch = { draft: stored, updates: FieldValue.arrayUnion(update), updatedAt: FieldValue.serverTimestamp() };
  if (hasContent && (current.status === CASE_STATUS.OPEN || current.status === CASE_STATUS.IN_PROGRESS)) {
    patch.status = CASE_STATUS.WAITING_APPROVAL;
  }
  await ref.update(patch);
  return { ok: true, draft: stored, status: patch.status || current.status };
}

/**
 * Attach an already-appended event's id to a case (e.g. an outbound send logged
 * separately), keeping the thread's eventIds complete without re-threading.
 * Best-effort; no-op if the case is gone.
 */
export async function attachEventId(clientId, caseId, eventId, { contactText, by } = {}) {
  const id = (caseId || "").trim();
  const eid = (eventId || "").trim();
  if (!id || !eid) return { ok: false, reason: "missing_id" };
  const ref = col(clientId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const patch = {
    eventIds: FieldValue.arrayUnion(eid),
    lastContactAt: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (contactText) {
    patch.updates = FieldValue.arrayUnion(buildUpdate({ by: by || "System", kind: UPDATE_KINDS.CONTACT, text: contactText, eventId: eid }));
    patch.contactCount = FieldValue.increment(1);
  }
  await ref.update(patch);
  return { ok: true };
}

/**
 * Deterministic thread id so concurrent contacts about the SAME matter converge
 * on exactly ONE case document. The id is derived from the strongest identity we
 * have (a matched patientId, else a normalized name key) plus the topic. With no
 * identity at all (anonymous) we cannot thread and return null.
 */
function threadCaseId(event, topic) {
  const pid = (event.subject?.patientId || "").trim();
  const nameKey = (event.subject?.nameKey || "").trim();
  // Last resort for an unidentified contact: a stable counterparty reference
  // (e-mail address / phone number). This lets repeat anonymous senders thread
  // onto ONE case instead of spawning a new ticket per message, while never
  // mixing them with an identified patient (those keys never collide).
  const ref = (event.counterparty?.ref || "").trim().toLowerCase();
  const key = pid ? `p:${pid}` : nameKey ? `n:${nameKey}` : ref ? `c:${ref}` : "";
  if (!key) return null;
  const h = createHash("sha256").update(`${key}|${topic}`).digest("hex").slice(0, 24);
  return `case_${h}`;
}

/**
 * The heart of consistent follow-up: attach an event to the right thread.
 *
 * Threading converges on a DETERMINISTIC case id per (identity, topic) and runs
 * inside a Firestore transaction, so two contacts arriving at the same instant
 * can never create duplicate cases — the loser retries, sees the doc, and
 * appends instead. Re-delivered events (same event.id) are idempotent.
 *
 * - Existing + still active  -> append a CONTACT update, bump contactCount.
 * - Existing but RESOLVED/CLOSED -> REOPEN it and append.
 * - None yet (or anonymous)  -> open a fresh case.
 *
 * @returns {Promise<{caseId:string, created:boolean, reopened:boolean}>}
 */
export async function linkEventToCase(clientId, event, { by } = {}) {
  const topic = deriveTopic(event.signals);
  const actor = by || actorForChannel(event.channel);
  const contactText = `${event.summary || "Kontakt"}`;
  const tid = threadCaseId(event, topic);

  const seedNewCase = (id) => ({
    id,
    subject: event.subject,
    topic,
    createdBy: actor,
    contactCount: 1,
    lastContactAt: event.ts || Date.now(),
    eventIds: [event.id],
    updates: [buildUpdate({ by: actor, kind: UPDATE_KINDS.CONTACT, text: contactText, eventId: event.id })],
  });

  // Anonymous contact: no stable identity -> cannot thread, open a fresh case.
  // Each is independent, so there is no duplicate-create race to guard against.
  if (!tid) {
    const created = await createCase(clientId, seedNewCase(undefined));
    return { caseId: created.id, created: true, reopened: false };
  }

  const db = admin.firestore();
  const ref = col(clientId).doc(tid);
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists) {
      const c = buildCase({ ...seedNewCase(tid), clientId });
      tx.set(ref, { ...c, createdAt: FieldValue.serverTimestamp() });
      return { caseId: tid, created: true, reopened: false };
    }

    const target = snap.data();
    // Idempotency: a re-delivered event must not double-count or duplicate logs.
    if (Array.isArray(target.eventIds) && target.eventIds.includes(event.id)) {
      return { caseId: tid, created: false, reopened: false };
    }

    const reopened = !isActiveStatus(target.status);
    const updates = [buildUpdate({ by: actor, kind: UPDATE_KINDS.CONTACT, text: contactText, eventId: event.id })];
    if (reopened) {
      updates.push(
        buildUpdate({
          by: actor,
          kind: UPDATE_KINDS.STATUS,
          text: "Erneuter Kontakt zu einem bereits abgeschlossenen Vorgang — wieder geöffnet.",
          statusFrom: target.status,
          statusTo: CASE_STATUS.OPEN,
        })
      );
    }
    const patch = {
      updates: FieldValue.arrayUnion(...updates),
      contactCount: FieldValue.increment(1),
      lastContactAt: event.ts || Date.now(),
      eventIds: FieldValue.arrayUnion(event.id),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (reopened) patch.status = CASE_STATUS.OPEN;
    tx.update(ref, patch);
    return { caseId: tid, created: false, reopened };
  });
}
