import { listArtifacts, getArtifact } from "./catalog.js";
import { nextDue, listHistory, listCalendar, JOB_STATUS } from "./jobs.js";
import { getStaff } from "./staff.js";
import { cycleLabel } from "./recurrence.js";

// ============================================================================
// Clara-Lesemodell für den QM-Kalender (read-only).
//
// Beantwortet gesprochene Fragen wie "Wann ist die nächste OPG-Konstanzprüfung
// fällig?" oder "Wer hat zuletzt den Notfallkoffer geprüft?". Liefert sowohl
// strukturierte Daten (fürs Portal) als auch fertige deutsche Sätze (für Clara;
// die Sprech-Schicht in Clara-Voice wandelt Datum/Zahlen dann in Worte).
//
// WICHTIG: Nur lesen. Julia schreibt; Clara liest und gibt Auskunft.
// ============================================================================

// Sprach-Synonyme -> bookKey. Ergänzt die Katalog-Titel um Umgangssprache.
const SYNONYMS = {
  "konstanzprüfung": "constancy_book",
  "konstanzpruefung": "constancy_book",
  "röntgen": "constancy_book",
  "roentgen": "constancy_book",
  "opg": "constancy_book",
  "hygieneplan": "hygiene_plan",
  "hygiene": "hygiene_plan",
  "sterilisation": "sterilization_log",
  "sterilisationsbuch": "sterilization_log",
  "autoklav": "sterilization_log",
  "charge": "sterilization_log",
  "notfallkoffer": "emergency_checklist",
  "notfall": "emergency_checklist",
  "notfallplan": "emergency_plan",
  "temperatur": "temperature_log",
  "kühlschrank": "temperature_log",
  "kuehlschrank": "temperature_log",
  "medizinprodukt": "medical_device_book",
  "medizinproduktebuch": "medical_device_book",
  "gefahrstoff": "hazardous_substances_register",
  "biostoff": "biohazard_register",
  "unfallbuch": "accident_book",
  "verbandbuch": "accident_book",
  "qm-handbuch": "qm_handbook",
  "handbuch": "qm_handbook",
  "fortbildung": "training_register",
  "schulung": "training_register",
  "teambesprechung": "team_meeting_minutes",
  "fehler": "cirs_log",
  "cirs": "cirs_log",
  "strahlenschutz": "radiation_protection_training",
};

function s(v) {
  return String(v ?? "").trim();
}

function fold(str) {
  return s(str).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

/** Map a spoken phrase to a bookKey (title or synonym match). Null if unsure. */
export function resolveBookKeyFromText(text) {
  const t = s(text).toLowerCase();
  if (!t) return null;
  const tf = fold(t);

  for (const [word, key] of Object.entries(SYNONYMS)) {
    if (t.includes(word) || tf.includes(fold(word))) return key;
  }
  for (const a of listArtifacts()) {
    if (tf.includes(fold(a.title))) return a.key;
  }
  return null;
}

function dateDe(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

async function staffName(clientId, staffId, fallback = "") {
  if (!staffId) return fallback;
  const st = await getStaff(clientId, staffId);
  return st?.name || fallback || staffId;
}

/** Structured next-due for a book/device (or null). */
export async function getNextDue(clientId, { bookKey = "", deviceRef = "" } = {}) {
  const job = await nextDue(clientId, { bookKey, deviceRef });
  if (!job) return null;
  return {
    bookKey: job.bookKey,
    title: job.title,
    deviceRef: job.deviceRef,
    dueAt: job.dueAt,
    status: job.status,
    assignedTo: job.assignedTo,
    assignedToName: job.assignedToName,
    cycle: job.cycle,
  };
}

/** Spoken answer: "Die nächste Konstanzprüfung (OPG) ist am 13.07.2026 fällig …". */
export async function buildSpokenNextDue(clientId, { bookKey = "", deviceRef = "" } = {}) {
  const artifact = getArtifact(bookKey);
  const label = artifact?.title || bookKey;
  const job = await nextDue(clientId, { bookKey, deviceRef });
  if (!job) {
    return `Für ${label}${deviceRef ? ` (${deviceRef})` : ""} ist aktuell kein Termin im QM-Kalender eingetragen.`;
  }
  const who = await staffName(clientId, job.assignedTo, job.assignedToName || "");
  const overdue = job.status === JOB_STATUS.OVERDUE || (job.dueAtMs && job.dueAtMs < Date.now());
  const when = overdue ? `war am ${dateDe(job.dueAt)} fällig und ist überfällig` : `ist am ${dateDe(job.dueAt)} fällig`;
  const dev = job.deviceRef ? ` für ${job.deviceRef}` : "";
  const whoTxt = who ? ` Zuständig ist ${who}.` : "";
  return `${label}${dev} ${when}.${whoTxt}`;
}

/** Spoken answer: "Zuletzt wurde … am 12.06.2026 von Saghi erledigt." */
export async function buildSpokenHistory(clientId, { bookKey = "", deviceRef = "", limit = 1 } = {}) {
  const artifact = getArtifact(bookKey);
  const label = artifact?.title || bookKey;
  const hist = await listHistory(clientId, { bookKey, deviceRef, limit });
  if (!hist.length) {
    return `Zu ${label}${deviceRef ? ` (${deviceRef})` : ""} ist noch keine Erledigung dokumentiert.`;
  }
  const last = hist[0];
  const who = await staffName(clientId, last.completedBy, last.completedByName || "");
  const dev = last.deviceRef ? ` für ${last.deviceRef}` : "";
  return `${label}${dev} wurde zuletzt am ${dateDe(last.completedAt)}${who ? ` von ${who}` : ""} erledigt.`;
}

/** Structured QM calendar for a window (UI + spoken overview). */
export async function getCalendar(clientId, { fromMs = 0, toMs = Number.MAX_SAFE_INTEGER, bookKey = "", deviceRef = "" } = {}) {
  const jobs = await listCalendar(clientId, { fromMs, toMs, bookKey, deviceRef });
  return jobs.map((j) => ({
    id: j.id,
    title: j.title,
    bookKey: j.bookKey,
    deviceRef: j.deviceRef,
    dueAt: j.dueAt,
    dueAtMs: j.dueAtMs,
    status: j.status,
    assignedTo: j.assignedTo,
    assignedToName: j.assignedToName,
    purpose: j.purpose,
    cycle: j.cycle,
    cycleLabel: cycleLabel(j.cycle),
    requiredFields: Array.isArray(j.requiredFields) ? j.requiredFields : [],
  }));
}

// One spoken line for a job: Titel (Gerät) am Datum (überfällig), Zuständige.
function jobLine(j, now = Date.now()) {
  const dev = j.deviceRef ? ` (${j.deviceRef})` : "";
  const overdue = (j.status === JOB_STATUS.OVERDUE || j.status === JOB_STATUS.ESCALATED) || (j.dueAtMs && j.dueAtMs < now);
  const who = j.assignedToName ? `, ${j.assignedToName}` : "";
  return `${j.title}${dev} am ${dateDe(j.dueAt)}${overdue ? " (überfällig)" : ""}${who}`;
}

function isOpen(j) {
  return j.status !== JOB_STATUS.DONE;
}

/** Spoken list of overdue/open-past-due QM jobs (or an all-clear). */
export async function buildSpokenOverdue(clientId) {
  const now = Date.now();
  const jobs = await listCalendar(clientId, {});
  const overdue = jobs.filter((j) => isOpen(j) && ((j.dueAtMs && j.dueAtMs < now) || j.status === JOB_STATUS.OVERDUE || j.status === JOB_STATUS.ESCALATED));
  if (!overdue.length) return "Es gibt aktuell keine überfälligen QM-Aufgaben.";
  const parts = overdue.slice(0, 15).map((j) => jobLine(j, now));
  const more = overdue.length > 15 ? ` und ${overdue.length - 15} weitere` : "";
  return `Überfällig sind ${overdue.length} QM-Aufgaben: ${parts.join("; ")}${more}.`;
}

/**
 * The COMPLETE QM calendar read for Clara: overdue first, then everything that
 * is open within the window. This is what answers "lies mir den QM-Kalender
 * vor" / "welche QM-Aufgaben stehen an" — not limited to a single book.
 */
export async function buildSpokenCalendar(clientId, { days = 30 } = {}) {
  const now = Date.now();
  const jobs = await listCalendar(clientId, { fromMs: 0, toMs: now + days * 86400000 });
  const open = jobs.filter(isOpen).sort((a, b) => (a.dueAtMs || 0) - (b.dueAtMs || 0));
  if (!open.length) return `In den nächsten ${days} Tagen stehen keine QM-Aufgaben an, und es ist nichts überfällig.`;

  const overdue = open.filter((j) => (j.dueAtMs && j.dueAtMs < now) || j.status === JOB_STATUS.OVERDUE || j.status === JOB_STATUS.ESCALATED);
  const upcoming = open.filter((j) => !overdue.includes(j));

  const segs = [];
  if (overdue.length) {
    segs.push(`Überfällig (${overdue.length}): ${overdue.slice(0, 10).map((j) => jobLine(j, now)).join("; ")}${overdue.length > 10 ? `, und ${overdue.length - 10} weitere` : ""}`);
  }
  if (upcoming.length) {
    segs.push(`Anstehend in den nächsten ${days} Tagen (${upcoming.length}): ${upcoming.slice(0, 12).map((j) => jobLine(j, now)).join("; ")}${upcoming.length > 12 ? `, und ${upcoming.length - 12} weitere` : ""}`);
  }
  return segs.join(". ") + ".";
}

/** Back-compat alias: a spoken overview (now the complete calendar read). */
export async function buildSpokenUpcoming(clientId, { days = 30 } = {}) {
  return buildSpokenCalendar(clientId, { days });
}
