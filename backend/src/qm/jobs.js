import { randomUUID } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { getArtifact } from "./catalog.js";
import { appendDocument } from "./documents.js";
import { getBook } from "./books.js";
import { nextDueFrom, isRecurring, cycleLabel } from "./recurrence.js";
import { appendEvent } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";
import { log } from "../log.js";

// ============================================================================
// QM-Jobs (Julias Kalender): clients/{clientId}/mas_qm_jobs/{id}
//
// Jeder Job ist ein Kalendereintrag mit einem Statusmodell:
//   planned -> assigned -> seen -> in_progress -> done
//                 \--------------------------------> overdue -> escalated -> done
//
// Erledigung erfordert die Pflichtfelder des Buchs und erzeugt automatisch
// einen append-only Nachweis (mas_qm_documents) plus ein Audit-Event im Shared
// Memory (mas_events). Bei recurrenceMode=anchor_on_completion wird der nächste
// Job direkt aus dem Erledigungszeitpunkt erzeugt.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;

export const JOB_STATUS = Object.freeze({
  PLANNED: "planned",
  ASSIGNED: "assigned",
  SEEN: "seen",
  IN_PROGRESS: "in_progress",
  OVERDUE: "overdue",
  ESCALATED: "escalated",
  DONE: "done",
});

// Allowed transitions (the rest are rejected -> protects re-push logic).
const TRANSITIONS = {
  planned: ["assigned", "overdue", "done"],
  assigned: ["seen", "in_progress", "overdue", "done"],
  seen: ["in_progress", "overdue", "done"],
  in_progress: ["done", "overdue"],
  overdue: ["seen", "in_progress", "escalated", "done"],
  escalated: ["seen", "in_progress", "done"],
  done: [],
};

function col(clientId) {
  return masCollection(clientId, "mas_qm_jobs");
}
function s(v) {
  return String(v ?? "").trim();
}
function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

async function logAudit(clientId, summary, extra = {}) {
  try {
    await appendEvent(clientId, {
      channel: CHANNELS.SYSTEM,
      type: EVENT_TYPES.OBSERVATION,
      direction: DIRECTIONS.INTERNAL,
      summary: `QM: ${summary}`,
      ...extra,
    });
  } catch (e) {
    log.warn("qm.audit_event_failed", { error: String(e?.message || e) });
  }
}

function historyEntry(action, by, note = "") {
  return { action: s(action), by: s(by) || "julia", note: s(note), ts: Date.now() };
}

/**
 * Create a QM job (calendar entry). bookKey must be a known artifact; the job
 * inherits requiredFields + recurrenceMode from the catalog unless overridden.
 */
export async function createJob(clientId, input = {}) {
  const bookKey = s(input.bookKey);
  const artifact = getArtifact(bookKey);
  if (!artifact) return { ok: false, reason: "unknown_artifact" };

  const id = randomUUID();
  const now = new Date();
  const scheduledFor = s(input.scheduledFor) || now.toISOString();
  const dueAt = s(input.dueAt) || scheduledFor;
  const assignedTo = s(input.assignedTo);
  const status = assignedTo ? JOB_STATUS.ASSIGNED : JOB_STATUS.PLANNED;

  const job = {
    id,
    clientId,
    bookKey,
    title: s(input.title) || artifact.title,
    purpose: s(input.purpose) || null,
    deviceRef: s(input.deviceRef) || null,
    category: artifact.category,

    scheduledFor,
    dueAt,
    dueAtMs: new Date(dueAt).getTime() || now.getTime(),
    leadDays: Math.max(0, Number(input.leadDays) || 0),

    assignedRole: s(input.assignedRole) || null,
    assignedTo: assignedTo || null,
    assignedToName: s(input.assignedToName) || null,

    status,
    ackAt: null,
    startedAt: null,
    completedAt: null,
    completedBy: null,
    completedByName: null,

    recurrenceId: s(input.recurrenceId) || null,
    recurrenceMode: s(input.recurrenceMode) || artifact.recurrenceMode || "fixed",
    cycle: s(input.cycle) || artifact.defaultCycle || null,
    requiredFields: Array.isArray(input.requiredFields) ? input.requiredFields : (artifact.requiredFields || []),

    pushState: { sentCount: 0, lastSentAt: null, channel: null },
    escalation: { level: 0, escalatedTo: null, escalatedAt: null },

    history: [historyEntry("created", input.createdBy || "julia")],
    createdBy: s(input.createdBy) || "julia",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await col(clientId).doc(id).set(job);
  await logAudit(clientId, `Job angelegt: ${job.title}${assignedTo ? ` (zugewiesen an ${job.assignedToName || assignedTo})` : ""}`);
  return { ok: true, job };
}

export async function getJob(clientId, jobId) {
  const snap = await col(clientId).doc(s(jobId)).get();
  return snap.exists ? snap.data() : null;
}

async function patchJob(clientId, jobId, patch, historyAction, by, note) {
  const ref = col(clientId).doc(s(jobId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const job = snap.data();
  const full = {
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
    history: FieldValue.arrayUnion(historyEntry(historyAction, by, note)),
  };
  await ref.set(full, { merge: true });
  return { ok: true, job: { ...job, ...patch } };
}

/** Assign (or reassign) a job to a staff member. Resets status to assigned. */
export async function assignJob(clientId, jobId, { staffId, staffName = "", role = "", by = "julia", reason = "" } = {}) {
  const job = await getJob(clientId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  if (job.status === JOB_STATUS.DONE) return { ok: false, reason: "already_done" };
  const patch = {
    assignedTo: s(staffId) || null,
    assignedToName: s(staffName) || null,
    assignedRole: s(role) || job.assignedRole || null,
    status: JOB_STATUS.ASSIGNED,
    ackAt: null,
  };
  const out = await patchJob(clientId, jobId, patch, "assigned", by, reason);
  if (out.ok) await logAudit(clientId, `Job zugewiesen an ${s(staffName) || s(staffId)}: ${job.title}`);
  return out;
}

/** Mitarbeiter quittiert (gesehen/angenommen). assigned/overdue -> seen. */
export async function ackJob(clientId, jobId, { by = "" } = {}) {
  const job = await getJob(clientId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  if (!canTransition(job.status, JOB_STATUS.SEEN)) return { ok: false, reason: `bad_transition_${job.status}` };
  return patchJob(clientId, jobId, { status: JOB_STATUS.SEEN, ackAt: new Date().toISOString() }, "seen", by || job.assignedTo || "");
}

/** Job geöffnet / in Arbeit. */
export async function startJob(clientId, jobId, { by = "" } = {}) {
  const job = await getJob(clientId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  if (!canTransition(job.status, JOB_STATUS.IN_PROGRESS)) return { ok: false, reason: `bad_transition_${job.status}` };
  return patchJob(clientId, jobId, { status: JOB_STATUS.IN_PROGRESS, startedAt: new Date().toISOString() }, "started", by || job.assignedTo || "");
}

/**
 * Complete a job: validates required fields, writes an append-only proof, flips
 * status to done, logs an audit event, and (anchor_on_completion) spawns the
 * next occurrence from the completion instant.
 */
export async function completeJob(clientId, jobId, { by = "", byName = "", fields = {}, attachments = [], note = "" } = {}) {
  const job = await getJob(clientId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  if (job.status === JOB_STATUS.DONE) return { ok: false, reason: "already_done" };
  if (!canTransition(job.status, JOB_STATUS.DONE)) return { ok: false, reason: `bad_transition_${job.status}` };

  // append-only proof in the book (validates required fields)
  const doc = await appendDocument(clientId, job.bookKey, {
    jobId: job.id,
    deviceRef: job.deviceRef || "",
    performedBy: by || job.assignedTo || "",
    performedByName: byName || job.assignedToName || "",
    fields,
    attachments,
    note,
  });
  if (!doc.ok) return doc; // missing_required_fields surfaces to the caller

  const completedAt = new Date().toISOString();
  await patchJob(clientId, jobId, {
    status: JOB_STATUS.DONE,
    completedAt,
    completedBy: s(by) || job.assignedTo || null,
    completedByName: s(byName) || job.assignedToName || null,
    resultDocId: doc.doc.id,
  }, "done", by || job.assignedTo || "", note);

  await logAudit(clientId, `${job.title} erledigt von ${s(byName) || s(by) || "Team"}${job.deviceRef ? ` (${job.deviceRef})` : ""}.`);

  // anchor_on_completion: next due counts from the completion instant.
  let nextJob = null;
  if (job.recurrenceMode === "anchor_on_completion" && isRecurring(job.cycle)) {
    const nextDue = nextDueFrom(job.cycle, completedAt);
    if (nextDue) {
      const created = await createJob(clientId, {
        bookKey: job.bookKey,
        title: job.title,
        purpose: job.purpose || "",
        deviceRef: job.deviceRef || "",
        scheduledFor: nextDue,
        dueAt: nextDue,
        leadDays: job.leadDays,
        assignedRole: job.assignedRole || "",
        recurrenceId: job.recurrenceId || "",
        recurrenceMode: job.recurrenceMode,
        cycle: job.cycle,
        createdBy: "julia",
      });
      if (created.ok) nextJob = created.job;
    }
  }

  return { ok: true, jobId, status: JOB_STATUS.DONE, docId: doc.doc.id, nextJob };
}

/** Mark a job overdue (scheduler-driven). assigned/seen/planned -> overdue. */
export async function markOverdue(clientId, jobId, { by = "system" } = {}) {
  const job = await getJob(clientId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  if (!canTransition(job.status, JOB_STATUS.OVERDUE)) return { ok: false, reason: `bad_transition_${job.status}` };
  return patchJob(clientId, jobId, { status: JOB_STATUS.OVERDUE }, "overdue", by);
}

/** Escalate a job (deputy / lead). Records the escalation target + level. */
export async function escalateJob(clientId, jobId, { to = "", toName = "", level = 1, by = "julia" } = {}) {
  const job = await getJob(clientId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  if (!canTransition(job.status, JOB_STATUS.ESCALATED)) return { ok: false, reason: `bad_transition_${job.status}` };
  const patch = {
    status: JOB_STATUS.ESCALATED,
    escalation: { level: Number(level) || 1, escalatedTo: s(to) || null, escalatedToName: s(toName) || null, escalatedAt: new Date().toISOString() },
    assignedTo: s(to) || job.assignedTo || null,
    assignedToName: s(toName) || job.assignedToName || null,
  };
  const out = await patchJob(clientId, jobId, patch, "escalated", by, `Stufe ${level} an ${s(toName) || s(to)}`);
  if (out.ok) await logAudit(clientId, `Job eskaliert (Stufe ${level}) an ${s(toName) || s(to)}: ${job.title}`);
  return out;
}

/** Record that a push went out (for re-push cadence + escalation thresholds). */
export async function recordPush(clientId, jobId, { channel = "push" } = {}) {
  const job = await getJob(clientId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const sentCount = Number(job.pushState?.sentCount || 0) + 1;
  await col(clientId).doc(s(jobId)).set(
    { pushState: { sentCount, lastSentAt: new Date().toISOString(), channel: s(channel) }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true, sentCount };
}

// ── Read models ─────────────────────────────────────────────────────────────

const OPEN_STATES = new Set([JOB_STATUS.PLANNED, JOB_STATUS.ASSIGNED, JOB_STATUS.SEEN, JOB_STATUS.IN_PROGRESS, JOB_STATUS.OVERDUE, JOB_STATUS.ESCALATED]);

/** All jobs in a time window (the QM calendar). Equality-free range on dueAtMs. */
export async function listCalendar(clientId, { fromMs = 0, toMs = Number.MAX_SAFE_INTEGER, bookKey = "", deviceRef = "" } = {}) {
  const snap = await col(clientId).get();
  let jobs = snap.docs.map((d) => d.data());
  jobs = jobs.filter((j) => (j.dueAtMs || 0) >= Number(fromMs) && (j.dueAtMs || 0) <= Number(toMs));
  if (s(bookKey)) jobs = jobs.filter((j) => j.bookKey === s(bookKey));
  if (s(deviceRef)) jobs = jobs.filter((j) => j.deviceRef === s(deviceRef));
  jobs.sort((a, b) => (a.dueAtMs || 0) - (b.dueAtMs || 0));
  return jobs;
}

/** Open jobs assigned to one staff member ("Meine Aufgaben"), soonest first. */
export async function listJobsForStaff(clientId, staffId, { openOnly = true } = {}) {
  const snap = await col(clientId).where("assignedTo", "==", s(staffId)).get();
  let jobs = snap.docs.map((d) => d.data());
  if (openOnly) jobs = jobs.filter((j) => OPEN_STATES.has(j.status));
  jobs.sort((a, b) => (a.dueAtMs || 0) - (b.dueAtMs || 0));
  return jobs;
}

/** The next still-open job for a book (optionally a device) — "wann ist X fällig?". */
export async function nextDue(clientId, { bookKey = "", deviceRef = "" } = {}) {
  const snap = await col(clientId).where("bookKey", "==", s(bookKey)).get();
  let jobs = snap.docs.map((d) => d.data()).filter((j) => OPEN_STATES.has(j.status));
  if (s(deviceRef)) jobs = jobs.filter((j) => j.deviceRef === s(deviceRef));
  jobs.sort((a, b) => (a.dueAtMs || 0) - (b.dueAtMs || 0));
  return jobs[0] || null;
}

/** Completed jobs for a book (history) — "wer hat zuletzt X gemacht?". */
export async function listHistory(clientId, { bookKey = "", deviceRef = "", limit = 20 } = {}) {
  const snap = await col(clientId).where("bookKey", "==", s(bookKey)).get();
  let jobs = snap.docs.map((d) => d.data()).filter((j) => j.status === JOB_STATUS.DONE);
  if (s(deviceRef)) jobs = jobs.filter((j) => j.deviceRef === s(deviceRef));
  jobs.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  return jobs.slice(0, Math.max(1, limit));
}

/** Jobs that are due/overdue and still open (scheduler input). */
export async function listDueOpenJobs(clientId, { nowMs = Date.now() } = {}) {
  const snap = await col(clientId).get();
  return snap.docs.map((d) => d.data())
    .filter((j) => OPEN_STATES.has(j.status))
    .filter((j) => (j.dueAtMs || 0) <= Number(nowMs));
}

export { cycleLabel };
