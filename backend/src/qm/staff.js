import { randomUUID } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";

// ============================================================================
// QM-Personal & Rollen: clients/{clientId}/mas_staff/{id}
//
// Das GANZE Team (auch Personal ohne Behandler-Kalender). Trägt QM-Rollen,
// Aufgabenbereiche, Vertretung und Abwesenheiten — damit Julia Jobs gezielt
// zuweist, bei Urlaub auf die Vertretung umlenkt und sinnvoll eskaliert.
//
// linkedOperatorId verbindet ein Teammitglied mit den gekoppelten Handys
// (mas_devices.operatorId) — darüber laufen die Push-Nachrichten (notify.js).
// ============================================================================

const FieldValue = admin.firestore.FieldValue;

// QM-Rollen (lose; mehrere pro Person möglich).
export const QM_ROLES = Object.freeze({
  LEITUNG: "leitung",
  QMB: "qmb",
  HYGIENE: "hygiene",
  STRAHLENSCHUTZ: "strahlenschutz",
  MEDIZINPRODUKTE: "medizinprodukte",
  ERSTHELFER: "ersthelfer",
  SICHERHEIT: "sicherheitsbeauftragte",
  ASSISTENZ: "assistenz",
  VERWALTUNG: "verwaltung",
});

// Welche Rolle bedient welche Buch-Kategorie (Default-Zuordnung, überschreibbar
// durch Buch.responsibleRole/responsibleStaffId).
const CATEGORY_ROLE = {
  hygiene: QM_ROLES.HYGIENE,
  patientensicherheit: QM_ROLES.STRAHLENSCHUTZ,
  technik: QM_ROLES.MEDIZINPRODUKTE,
  notfall: QM_ROLES.ERSTHELFER,
  arbeitsschutz: QM_ROLES.SICHERHEIT,
  organisation: QM_ROLES.QMB,
};

function col(clientId) {
  return masCollection(clientId, "mas_staff");
}
function s(v) {
  return String(v ?? "").trim();
}
function arr(v) {
  return Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : [];
}

export async function upsertStaff(clientId, input = {}) {
  const id = s(input.id) || `staff_${randomUUID().slice(0, 10)}`;
  const ref = col(clientId).doc(id);
  const snap = await ref.get();
  const doc = {
    id,
    name: s(input.name) || (snap.exists ? snap.data().name : "") || id,
    roles: input.roles !== undefined ? arr(input.roles) : (snap.exists ? snap.data().roles : []),
    areas: input.areas !== undefined ? arr(input.areas) : (snap.exists ? snap.data().areas : []),
    deputyStaffId: input.deputyStaffId !== undefined ? (s(input.deputyStaffId) || null) : (snap.exists ? snap.data().deputyStaffId : null),
    linkedOperatorId: input.linkedOperatorId !== undefined ? (s(input.linkedOperatorId) || null) : (snap.exists ? snap.data().linkedOperatorId : null),
    phone: input.phone !== undefined ? (s(input.phone) || null) : (snap.exists ? snap.data().phone : null),
    active: input.active !== undefined ? input.active !== false : (snap.exists ? snap.data().active !== false : true),
    absences: snap.exists ? (snap.data().absences || []) : [],
    updatedAt: FieldValue.serverTimestamp(),
    ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  };
  await ref.set(doc, { merge: true });
  return { ok: true, staff: doc };
}

export async function getStaff(clientId, staffId) {
  const snap = await col(clientId).doc(s(staffId)).get();
  return snap.exists ? snap.data() : null;
}

export async function listStaff(clientId, { activeOnly = false } = {}) {
  const snap = await col(clientId).get();
  let list = snap.docs.map((d) => d.data());
  if (activeOnly) list = list.filter((x) => x.active !== false);
  return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export async function setDeputy(clientId, staffId, deputyStaffId) {
  const ref = col(clientId).doc(s(staffId));
  if (!(await ref.get()).exists) return { ok: false, reason: "not_found" };
  await ref.set({ deputyStaffId: s(deputyStaffId) || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
}

/** Add an absence window (vacation/sick/training). Stored as ISO date strings. */
export async function addAbsence(clientId, staffId, { from, to, type = "urlaub" } = {}) {
  const ref = col(clientId).doc(s(staffId));
  if (!(await ref.get()).exists) return { ok: false, reason: "not_found" };
  const entry = { id: randomUUID().slice(0, 8), from: s(from), to: s(to) || s(from), type: s(type) || "urlaub" };
  if (!entry.from) return { ok: false, reason: "from_required" };
  await ref.set({ absences: FieldValue.arrayUnion(entry), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, absence: entry };
}

export async function removeAbsence(clientId, staffId, absenceId) {
  const staff = await getStaff(clientId, staffId);
  if (!staff) return { ok: false, reason: "not_found" };
  const kept = (staff.absences || []).filter((a) => a.id !== s(absenceId));
  await col(clientId).doc(s(staffId)).set({ absences: kept, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
}

/** Is the staff member absent at a given instant? (inclusive day ranges) */
export function isAbsentAt(staff, atMs = Date.now()) {
  if (!staff || !Array.isArray(staff.absences)) return false;
  const day = new Date(atMs);
  const ymd = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
  return staff.absences.some((a) => a.from && a.from <= ymd && (a.to || a.from) >= ymd);
}

function staffMatchesJob(staff, { role, category }) {
  const roles = staff.roles || [];
  const areas = staff.areas || [];
  if (role && roles.includes(role)) return true;
  if (category) {
    if (areas.includes(category)) return true;
    const mapped = CATEGORY_ROLE[category];
    if (mapped && roles.includes(mapped)) return true;
  }
  return false;
}

/**
 * Suggest who should do a job: active staff matching role/category, not absent,
 * preferring an exact role match. Returns the candidate + a human reason. Falls
 * back to a 'qmb' or any active member so a job is never unassignable.
 */
export async function suggestAssignee(clientId, { role = "", category = "", atMs = Date.now(), excludeStaffId = "" } = {}) {
  const staff = (await listStaff(clientId, { activeOnly: true })).filter((x) => x.id !== s(excludeStaffId));
  const available = staff.filter((x) => !isAbsentAt(x, atMs));

  const exact = available.find((x) => role && (x.roles || []).includes(role));
  if (exact) return { ok: true, staffId: exact.id, staffName: exact.name, reason: `Rolle ${role}` };

  const byArea = available.find((x) => staffMatchesJob(x, { role, category }));
  if (byArea) return { ok: true, staffId: byArea.id, staffName: byArea.name, reason: category ? `Aufgabenbereich ${category}` : "passende Rolle" };

  const qmb = available.find((x) => (x.roles || []).includes(QM_ROLES.QMB));
  if (qmb) return { ok: true, staffId: qmb.id, staffName: qmb.name, reason: "QM-Beauftragte (Fallback)" };

  if (available[0]) return { ok: true, staffId: available[0].id, staffName: available[0].name, reason: "verfügbares Teammitglied" };
  return { ok: false, reason: "no_available_staff" };
}

/**
 * Escalation target for an overdue/unhandled job:
 *   level 1 -> the assignee's deputy (if present & available)
 *   level 2 -> practice lead (role 'leitung')
 * Returns { staffId, staffName, level } or null when nothing fits.
 */
export async function resolveEscalationTarget(clientId, job, { atMs = Date.now() } = {}) {
  const currentLevel = Number(job?.escalation?.level || 0);

  if (currentLevel < 1 && job?.assignedTo) {
    const assignee = await getStaff(clientId, job.assignedTo);
    const deputyId = assignee?.deputyStaffId;
    if (deputyId) {
      const deputy = await getStaff(clientId, deputyId);
      if (deputy && deputy.active !== false && !isAbsentAt(deputy, atMs)) {
        return { staffId: deputy.id, staffName: deputy.name, level: 1, reason: "Vertretung" };
      }
    }
  }

  const leads = (await listStaff(clientId, { activeOnly: true })).filter((x) => (x.roles || []).includes(QM_ROLES.LEITUNG));
  const lead = leads.find((x) => !isAbsentAt(x, atMs)) || leads[0];
  if (lead) return { staffId: lead.id, staffName: lead.name, level: Math.max(2, currentLevel + 1), reason: "Praxisleitung" };

  return null;
}

export { CATEGORY_ROLE };
