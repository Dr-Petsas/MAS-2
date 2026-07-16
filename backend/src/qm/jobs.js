import { randomUUID } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { getArtifact } from "./catalog.js";
import { appendDocument } from "./documents.js";
import { getBook } from "./books.js";
import { nextDueFrom, isRecurring, cycleLabel } from "./recurrence.js";
import { suggestAssignee, getStaff, isAbsentAt, resolveEscalationTarget } from "./staff.js";
import { guideForJob } from "./jobGuides.js";
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

  // Auto-Zuweisung: ist nur eine Rolle genannt, sucht Julia die passende,
  // verfügbare (nicht abwesende) Helferin — so wird jeder Schedule-/Wizard-Job
  // automatisch verteilt. Manuell ohne Rolle angelegte Jobs bleiben "planned".
  let assignedTo = s(input.assignedTo);
  let assignedToName = s(input.assignedToName);
  const wantRole = s(input.assignedRole);
  if (!assignedTo && wantRole && input.autoAssign !== false) {
    const sug = await suggestAssignee(clientId, { role: wantRole, category: artifact.category, atMs: new Date(dueAt).getTime() || Date.now() }).catch(() => null);
    if (sug && sug.ok) { assignedTo = sug.staffId; assignedToName = sug.staffName; }
  }
  const status = assignedTo ? JOB_STATUS.ASSIGNED : JOB_STATUS.PLANNED;

  // Anleitung + Abschlusskriterium: was ist zu tun, woran ist der Job erledigt.
  // Explizit uebergebene Werte haben Vorrang, sonst zentrale Guide-Zuordnung.
  const title = s(input.title) || artifact.title;
  const guide = guideForJob({ title, typ: s(input.typ) });
  const instructions = Array.isArray(input.instructions) && input.instructions.length
    ? input.instructions.map((x) => s(x)).filter(Boolean)
    : guide.instructions;
  const completionCriteria = s(input.completionCriteria) || guide.completionCriteria;

  const job = {
    id,
    clientId,
    bookKey,
    title,
    purpose: s(input.purpose) || null,
    instructions,
    completionCriteria,
    deviceRef: s(input.deviceRef) || null,
    category: artifact.category,

    scheduledFor,
    dueAt,
    dueAtMs: new Date(dueAt).getTime() || now.getTime(),
    leadDays: Math.max(0, Number(input.leadDays) || 0),

    assignedRole: wantRole || null,
    assignedTo: assignedTo || null,
    assignedToName: assignedToName || null,

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

export async function updateJob(clientId, jobId, input = {}) {
  const job = await getJob(clientId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  if (job.status === JOB_STATUS.DONE) return { ok: false, reason: "already_done" };

  const patch = {};
  const dueAt = s(input.dueAt);
  if (dueAt) {
    const dueAtMs = new Date(dueAt).getTime();
    if (!Number.isFinite(dueAtMs)) return { ok: false, reason: "invalid_due_at" };
    patch.dueAt = dueAt;
    patch.scheduledFor = s(input.scheduledFor) || dueAt;
    patch.dueAtMs = dueAtMs;
  }

  if (Object.prototype.hasOwnProperty.call(input, "assignedTo")) {
    const assignedTo = s(input.assignedTo);
    patch.assignedTo = assignedTo || null;
    patch.assignedToName = assignedTo ? s(input.assignedToName) || null : null;
    if ([JOB_STATUS.PLANNED, JOB_STATUS.ASSIGNED, JOB_STATUS.SEEN].includes(job.status)) {
      patch.status = assignedTo ? JOB_STATUS.ASSIGNED : JOB_STATUS.PLANNED;
      if (job.status !== patch.status) patch.ackAt = null;
    }
  }
  if (dueAt && [JOB_STATUS.PLANNED, JOB_STATUS.ASSIGNED, JOB_STATUS.OVERDUE].includes(patch.status || job.status)) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const assignedTo = Object.prototype.hasOwnProperty.call(patch, "assignedTo") ? patch.assignedTo : job.assignedTo;
    patch.status = patch.dueAtMs < startOfToday.getTime()
      ? JOB_STATUS.OVERDUE
      : (assignedTo ? JOB_STATUS.ASSIGNED : JOB_STATUS.PLANNED);
  }

  if (Object.keys(patch).length === 0) return { ok: true, job };
  const out = await patchJob(clientId, jobId, patch, "updated", input.by || "julia", input.note || "Kalender-Update");
  if (out.ok) await logAudit(clientId, `Job aktualisiert: ${job.title}`);
  return out;
}

export async function deleteJob(clientId, jobId, { by = "julia", reason = "" } = {}) {
  const ref = col(clientId).doc(s(jobId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const job = snap.data();
  await ref.delete();
  await logAudit(clientId, `Job gelöscht: ${job.title}${s(reason) ? ` (${s(reason)})` : ""}`, {
    metadata: { jobId: job.id, bookKey: job.bookKey, deletedBy: s(by) || "julia" },
  });
  return { ok: true, jobId: job.id };
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
    assignedAt: new Date().toISOString(),
    status: JOB_STATUS.ASSIGNED,
    ackAt: null,
  };
  const out = await patchJob(clientId, jobId, patch, "assigned", by, reason);
  if (out.ok) await logAudit(clientId, `Job zugewiesen an ${s(staffName) || s(staffId)}: ${job.title}`);
  return out;
}

/**
 * Neuverteilung: offene, zugewiesene Jobs einer Helferin umlenken — z. B. wenn
 * sie krank/abwesend wird oder aus dem Dienstplan fliegt. Kette pro Job:
 *   1) hinterlegte Vertretung (deputyStaffId), falls aktiv & nicht abwesend
 *   2) sonst eine andere passende Helferin der QM-Rolle (suggestAssignee)
 *   3) sonst Eskalation an die Praxisleitung (resolveEscalationTarget)
 * @param {object} opts onlyDueBeforeMs: nur Jobs bis zu diesem Fälligkeitspunkt
 *   (z. B. Ende der Abwesenheit). atMs: Bezugszeitpunkt für "verfügbar?".
 * @returns {{ok:true, reassigned:number, escalated:number, skipped:number, total:number}}
 */
export async function redistributeOpenJobs(clientId, staffId, { onlyDueBeforeMs = 0, atMs = Date.now(), reason = "Neuverteilung" } = {}) {
  const sid = s(staffId);
  if (!sid) return { ok: false, reason: "staff_required" };
  let jobs = await listJobsForStaff(clientId, sid, { openOnly: true });
  if (Number(onlyDueBeforeMs) > 0) jobs = jobs.filter((j) => (j.dueAtMs || 0) <= Number(onlyDueBeforeMs));

  const leaving = await getStaff(clientId, sid);
  let reassigned = 0, escalated = 0, skipped = 0;

  for (const job of jobs) {
    // 1) Vertretung
    let target = null;
    const deputyId = leaving?.deputyStaffId;
    if (deputyId && deputyId !== sid) {
      const deputy = await getStaff(clientId, deputyId);
      if (deputy && deputy.active !== false && !isAbsentAt(deputy, atMs)) {
        target = { staffId: deputy.id, staffName: deputy.name, reason: "Vertretung" };
      }
    }
    // 2) andere passende Helferin der Rolle/Kategorie
    if (!target) {
      const sug = await suggestAssignee(clientId, { role: job.assignedRole || "", category: job.category || "", atMs, excludeStaffId: sid }).catch(() => null);
      if (sug && sug.ok) target = { staffId: sug.staffId, staffName: sug.staffName, reason: sug.reason };
    }
    if (target) {
      const out = await assignJob(clientId, job.id, { staffId: target.staffId, staffName: target.staffName, role: job.assignedRole || "", by: "julia", reason: `${reason}: ${target.reason}` });
      if (out.ok) { reassigned++; continue; }
    }
    // 3) Eskalation an die Leitung
    const esc = await resolveEscalationTarget(clientId, job, { atMs }).catch(() => null);
    if (esc) {
      // Status muss eskalierbar sein; sonst zuerst auf overdue heben.
      if (!canTransition(job.status, JOB_STATUS.ESCALATED)) {
        await markOverdue(clientId, job.id, { by: "julia" }).catch(() => {});
      }
      const out = await escalateJob(clientId, job.id, { to: esc.staffId, toName: esc.staffName, level: esc.level, by: "julia" });
      if (out.ok) { escalated++; continue; }
    }
    skipped++;
  }

  if (reassigned || escalated) {
    await logAudit(clientId, `Neuverteilung für ${leaving?.name || sid}: ${reassigned} umverteilt, ${escalated} eskaliert (${reason}).`);
  }
  return { ok: true, reassigned, escalated, skipped, total: jobs.length };
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
