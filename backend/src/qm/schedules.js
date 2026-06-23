import { randomUUID } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { getArtifact } from "./catalog.js";
import { nextDueFrom, isRecurring, leadStartFrom, cycleLabel } from "./recurrence.js";
import { createJob, nextDue } from "./jobs.js";
import { log } from "../log.js";

// ============================================================================
// QM-Schedules (wiederkehrende Erinnerungen): clients/{c}/mas_qm_schedules/{id}
//
// Eine Erinnerung pro Buch (z. B. "Notfallkoffer monatlich"). Der Scheduler-Tick
// (materializeDueJobs) erzeugt daraus zum richtigen Zeitpunkt — mit Vorlauf
// (leadDays) — konkrete mas_qm_jobs. Modus:
//   - fixed:                Tick erzeugt den nächsten Job, sobald der Vorlauf
//                           erreicht ist (zeitgesteuert).
//   - anchor_on_completion: KEIN Tick — der Folge-Job entsteht in jobs.completeJob
//                           beim Erledigen. Solche Schedules sind nur "Vorlage".
// ============================================================================

const FieldValue = admin.firestore.FieldValue;

function col(clientId) {
  return masCollection(clientId, "mas_qm_schedules");
}
function s(v) {
  return String(v ?? "").trim();
}

export async function createSchedule(clientId, input = {}) {
  const bookKey = s(input.bookKey);
  const artifact = getArtifact(bookKey);
  if (!artifact) return { ok: false, reason: "unknown_artifact" };
  const cycle = s(input.cycle) || artifact.defaultCycle || "";
  if (!isRecurring(cycle)) return { ok: false, reason: "cycle_not_recurring" };

  const id = randomUUID();
  const mode = s(input.mode) || artifact.recurrenceMode || "fixed";
  const firstDue = s(input.firstDueAt) || nextDueFrom(cycle, Date.now());
  const sched = {
    id,
    clientId,
    bookKey,
    title: s(input.title) || artifact.title,
    cycle,
    mode,
    leadDays: Math.max(0, Number(input.leadDays) || 0),
    assignedRole: s(input.assignedRole) || null,
    assignedTo: s(input.assignedTo) || null,
    assignedToName: s(input.assignedToName) || null,
    deviceRef: s(input.deviceRef) || null,
    nextDueAt: firstDue,
    active: input.active !== false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await col(clientId).doc(id).set(sched);
  return { ok: true, schedule: sched };
}

export async function listSchedules(clientId, { bookKey = "", activeOnly = false } = {}) {
  const snap = await col(clientId).get();
  let list = snap.docs.map((d) => d.data());
  if (s(bookKey)) list = list.filter((x) => x.bookKey === s(bookKey));
  if (activeOnly) list = list.filter((x) => x.active === true);
  return list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
}

export async function updateSchedule(clientId, scheduleId, patch = {}) {
  const ref = col(clientId).doc(s(scheduleId));
  if (!(await ref.get()).exists) return { ok: false, reason: "not_found" };
  const allowed = {};
  for (const k of ["title", "cycle", "mode", "leadDays", "assignedRole", "assignedTo", "assignedToName", "deviceRef", "nextDueAt", "active"]) {
    if (patch[k] !== undefined) allowed[k] = patch[k];
  }
  if (allowed.cycle !== undefined && !isRecurring(s(allowed.cycle))) return { ok: false, reason: "cycle_not_recurring" };
  allowed.updatedAt = FieldValue.serverTimestamp();
  await ref.set(allowed, { merge: true });
  return { ok: true, id: s(scheduleId) };
}

export async function deleteSchedule(clientId, scheduleId) {
  await col(clientId).doc(s(scheduleId)).delete();
  return { ok: true };
}

/**
 * Scheduler tick: turn due `fixed` schedules into concrete jobs (with lead
 * time), then advance the schedule's nextDueAt. Idempotent: skips a schedule if
 * an open job for it (same recurrenceId + dueAt) already exists.
 * @returns {{created:number, advanced:number}}
 */
export async function materializeDueJobs(clientId, { nowMs = Date.now() } = {}) {
  const schedules = await listSchedules(clientId, { activeOnly: true });
  let created = 0;
  let advanced = 0;

  for (const sched of schedules) {
    if (sched.mode === "anchor_on_completion") continue; // self-scheduling on completion
    if (!isRecurring(sched.cycle)) continue;

    // Guard against runaway loops; advance at most a handful of periods per tick.
    let guard = 0;
    while (guard++ < 24) {
      const dueAt = s(sched.nextDueAt);
      if (!dueAt) break;
      const leadStart = leadStartFrom(dueAt, sched.leadDays);
      const leadStartMs = new Date(leadStart || dueAt).getTime();
      if (leadStartMs > Number(nowMs)) break; // not yet within the lead window

      // already materialised?
      const existing = await nextDue(clientId, { bookKey: sched.bookKey, deviceRef: sched.deviceRef || "" });
      const alreadyForThis = existing && existing.recurrenceId === sched.id && s(existing.dueAt) === dueAt;
      if (!alreadyForThis) {
        const r = await createJob(clientId, {
          bookKey: sched.bookKey,
          title: sched.title,
          deviceRef: sched.deviceRef || "",
          scheduledFor: dueAt,
          dueAt,
          leadDays: sched.leadDays,
          assignedRole: sched.assignedRole || "",
          assignedTo: sched.assignedTo || "",
          assignedToName: sched.assignedToName || "",
          recurrenceId: sched.id,
          recurrenceMode: "fixed",
          cycle: sched.cycle,
          createdBy: "julia",
        });
        if (r.ok) created++;
      }

      // advance to the next period
      const next = nextDueFrom(sched.cycle, dueAt);
      if (!next || next === dueAt) break;
      await col(clientId).doc(sched.id).set({ nextDueAt: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      sched.nextDueAt = next;
      advanced++;
    }
  }

  if (created || advanced) log.info("qm.schedule_tick", { clientId, created, advanced });
  return { created, advanced };
}

export { cycleLabel };
