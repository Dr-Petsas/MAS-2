import { notifyOperator } from "../clara/devices.js";
import { lisaSendSms, smsConfigured } from "../lisa/outbound.js";
import { getStaff, resolveEscalationTarget } from "./staff.js";
import { getJob, recordPush, markOverdue, escalateJob, listDueOpenJobs, JOB_STATUS } from "./jobs.js";
import { portalToken } from "./portal.js";
import { log } from "../log.js";

// ============================================================================
// QM-Benachrichtigung: gezielter Push an die zuständige Helferin — und Re-Push
// bis erledigt. Nutzt die bestehende Geräte-Registry (clara/devices.js,
// Web-Push) und Lisas SMS als Fallback. Respektiert Ruhezeiten.
//
// Re-Push-/Eskalations-Politik (runEscalationSweep):
//   1. fällig + offen      -> Status overdue
//   2. erneut pushen        -> aber frühestens REPUSH_INTERVAL nach letztem Push
//   3. nach MAX_PUSHES_BEFORE_ESCALATION ohne Reaktion -> eskalieren
//      (Vertretung, dann Praxisleitung) und an die neue Person pushen.
// ============================================================================

const REPUSH_INTERVAL_MS = 4 * 60 * 60 * 1000; // höchstens alle 4h erneut stupsen
const MAX_PUSHES_BEFORE_ESCALATION = 3;

// Ruhezeiten (Europe/Berlin): kein Push außerhalb 07:00–20:00.
const QUIET_START_HOUR = 20;
const QUIET_END_HOUR = 7;

function berlinHour(now = new Date()) {
  // en-GB keeps the hour numeric (de-DE appends " Uhr" -> NaN). parseInt is a
  // belt-and-suspenders guard against any locale suffix.
  const txt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).format(now);
  const h = parseInt(txt, 10);
  return h === 24 ? 0 : h; // some ICU builds render midnight as "24"
}

/** True if the current time is inside the configured quiet hours. */
export function isQuietNow(now = new Date()) {
  const h = berlinHour(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

function portalUrl(publicBaseUrl, clientId, jobId) {
  const base = String(publicBaseUrl || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const k = portalToken(clientId, jobId);
  return `${base}/m/qm.html?c=${encodeURIComponent(clientId)}&job=${encodeURIComponent(jobId)}&k=${k}`;
}

/**
 * Push ONE job to its assignee. Tries Web-Push to the staff member's paired
 * phones (via linkedOperatorId); if that yields nothing and SMS is configured
 * and the staff has a phone, falls back to an SMS. Records the push.
 * @returns {{ok:boolean, channel?:string, reason?:string}}
 */
export async function pushJob(clientId, jobId, { publicBaseUrl = "", force = false } = {}) {
  const job = await getJob(clientId, jobId);
  if (!job) return { ok: false, reason: "not_found" };
  if (job.status === JOB_STATUS.DONE) return { ok: false, reason: "already_done" };
  if (!job.assignedTo) return { ok: false, reason: "unassigned" };
  if (!force && isQuietNow()) return { ok: false, reason: "quiet_hours" };

  const staff = await getStaff(clientId, job.assignedTo);
  if (!staff) return { ok: false, reason: "staff_not_found" };

  const title = `QM-Aufgabe: ${job.title}${job.deviceRef ? ` (${job.deviceRef})` : ""}`;
  // Kurz-Anleitung in die Push: erste 1-2 Schritte + Abschlusskriterium, damit
  // die Zuständige sofort weiß, WAS zu tun ist und WORAN der Job erledigt ist.
  const steps = Array.isArray(job.instructions) ? job.instructions.filter(Boolean) : [];
  const stepLine = steps.length ? steps.slice(0, 2).map((x, i) => `${i + 1}. ${x}`).join(" ") : "";
  const doneLine = job.completionCriteria ? ` Fertig, wenn: ${job.completionCriteria}` : "";
  const body = `${stepLine || "Bitte erledigen und dokumentieren."}${doneLine} → antippen zum Abhaken.`;
  const url = portalUrl(publicBaseUrl, clientId, job.id);

  // 1) Web-Push to paired phones
  if (staff.linkedOperatorId) {
    const r = await notifyOperator(clientId, staff.linkedOperatorId, { title, body, url });
    if (r.ok && r.sent > 0) {
      await recordPush(clientId, jobId, { channel: "push" });
      return { ok: true, channel: "push", sent: r.sent };
    }
  }

  // 2) SMS fallback
  if (smsConfigured() && staff.phone) {
    const sms = await lisaSendSms(clientId, { phone: staff.phone, message: `${body} ${url}`, recipientName: staff.name, by: "Julia (QM)" });
    if (sms.ok) {
      await recordPush(clientId, jobId, { channel: "sms" });
      return { ok: true, channel: "sms" };
    }
  }

  return { ok: false, reason: "no_channel" };
}

/**
 * One escalation/re-push sweep over all due, open jobs of a tenant. Designed to
 * run on an interval. Idempotent & cheap when nothing is due.
 * @returns {{overdue:number, pushed:number, escalated:number, skippedQuiet:number}}
 */
export async function runEscalationSweep(clientId, { publicBaseUrl = "", nowMs = Date.now() } = {}) {
  const jobs = await listDueOpenJobs(clientId, { nowMs });
  let overdue = 0;
  let pushed = 0;
  let escalated = 0;
  let skippedQuiet = 0;
  const quiet = isQuietNow(new Date(nowMs));

  for (const job of jobs) {
    // 1) flip to overdue once past due
    if (job.status !== JOB_STATUS.OVERDUE && job.status !== JOB_STATUS.ESCALATED && job.status !== JOB_STATUS.IN_PROGRESS) {
      const r = await markOverdue(clientId, job.id, {});
      if (r.ok) { overdue++; job.status = JOB_STATUS.OVERDUE; }
    }

    if (!job.assignedTo) continue;

    const sentCount = Number(job.pushState?.sentCount || 0);
    const lastSentMs = job.pushState?.lastSentAt ? new Date(job.pushState.lastSentAt).getTime() : 0;
    const dueForRepush = (nowMs - lastSentMs) >= REPUSH_INTERVAL_MS;

    // 3) escalate if pushed enough times without resolution
    if (sentCount >= MAX_PUSHES_BEFORE_ESCALATION && job.status !== JOB_STATUS.ESCALATED) {
      const target = await resolveEscalationTarget(clientId, job, { atMs: nowMs });
      if (target) {
        const e = await escalateJob(clientId, job.id, { to: target.staffId, toName: target.staffName, level: target.level });
        if (e.ok) {
          escalated++;
          if (!quiet) {
            const p = await pushJob(clientId, job.id, { publicBaseUrl });
            if (p.ok) pushed++;
          }
          continue;
        }
      }
    }

    // 2) re-push within cadence (skip during quiet hours)
    if (dueForRepush) {
      if (quiet) { skippedQuiet++; continue; }
      const p = await pushJob(clientId, job.id, { publicBaseUrl });
      if (p.ok) pushed++;
    }
  }

  if (overdue || pushed || escalated) log.info("qm.escalation_sweep", { clientId, overdue, pushed, escalated, skippedQuiet });
  return { overdue, pushed, escalated, skippedQuiet };
}
