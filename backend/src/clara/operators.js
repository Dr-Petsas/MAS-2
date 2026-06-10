import { randomUUID, createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";

// ============================================================================
// Operator registry — WHO is talking to Clara. Identity comes from the login /
// a personal PIN, never from the voice (voice biometrics = DSGVO special data,
// poor accuracy over car-Bluetooth, spoofable). Knowing the operator lets Clara
//   - scope the briefing to the role (a dentist shouldn't hear billing chatter),
//   - credit the real human in the case audit-trail ("Dr. Petsas" not "Clara").
//
// Stored per tenant at clients/{clientId}/mas_config/team. PINs are kept only as
// salted hashes; the plaintext PIN is never persisted or returned.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;

// Internal pepper. The PIN is a low-entropy team convenience code (not a
// password) scoped to one tenant + rate-limited at the endpoint; combined with
// the tenant id this keeps stored hashes non-trivial.
const PEPPER = "mas2.clara.operator.v1";

export const OPERATOR_ROLES = Object.freeze({
  DOCTOR: "doctor",
  FRONTDESK: "frontdesk",
  ADMIN: "admin",
});
const ROLE_SET = new Set(Object.values(OPERATOR_ROLES));

const ROLE_ALIASES = {
  doctor: OPERATOR_ROLES.DOCTOR, arzt: OPERATOR_ROLES.DOCTOR, "ärztin": OPERATOR_ROLES.DOCTOR,
  aerztin: OPERATOR_ROLES.DOCTOR, zahnarzt: OPERATOR_ROLES.DOCTOR, "zahnärztin": OPERATOR_ROLES.DOCTOR,
  frontdesk: OPERATOR_ROLES.FRONTDESK, rezeption: OPERATOR_ROLES.FRONTDESK, empfang: OPERATOR_ROLES.FRONTDESK,
  anmeldung: OPERATOR_ROLES.FRONTDESK,
  admin: OPERATOR_ROLES.ADMIN, praxisleitung: OPERATOR_ROLES.ADMIN, leitung: OPERATOR_ROLES.ADMIN,
  owner: OPERATOR_ROLES.ADMIN, inhaber: OPERATOR_ROLES.ADMIN,
};

export function normalizeRole(role) {
  const v = String(role || "").trim().toLowerCase();
  if (ROLE_ALIASES[v]) return ROLE_ALIASES[v];
  return ROLE_SET.has(v) ? v : OPERATOR_ROLES.FRONTDESK;
}

const ROLE_LABELS = { doctor: "Arzt/Ärztin", frontdesk: "Rezeption", admin: "Praxisleitung" };
export function roleLabel(role) { return ROLE_LABELS[role] || role; }

function teamDoc(clientId) {
  return masCollection(clientId, "mas_config").doc("team");
}

function hashPin(clientId, pin) {
  return createHash("sha256").update(`${PEPPER}:${clientId}:${String(pin).trim()}`).digest("hex");
}

/**
 * Replace the operator list for a tenant.
 * @param {string} clientId
 * @param {Array<{id?:string,name:string,role:string,pin:string|number,doctorName?:string}>} members
 */
export async function setOperators(clientId, members) {
  const list = (members || [])
    .filter((m) => m && String(m.name || "").trim() && String(m.pin ?? "").trim())
    .map((m) => ({
      id: m.id || `op_${randomUUID().slice(0, 8)}`,
      name: String(m.name).trim(),
      role: normalizeRole(m.role),
      doctorName: m.doctorName ? String(m.doctorName).trim() : null,
      pinHash: hashPin(clientId, m.pin),
    }));
  await teamDoc(clientId).set({ members: list, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, count: list.length };
}

/** Public operator list — hashes are stripped, `hasPin` flags a stored PIN. */
export async function listOperators(clientId) {
  const snap = await teamDoc(clientId).get();
  if (!snap.exists) return [];
  return (snap.data()?.members || []).map(({ pinHash, ...pub }) => ({ ...pub, hasPin: !!pinHash }));
}

/**
 * Upsert the operator list while PRESERVING existing PINs: a member is matched
 * by id; if no new `pin` is sent the stored hash is kept. Validates PIN format
 * (3–8 digits), requires every member to end up with a PIN, and rejects two
 * members sharing the same PIN. Throws Error with `.code` for the route to map.
 * @param {string} clientId
 * @param {Array<{id?:string,name:string,role?:string,doctorName?:string,pin?:string|number}>} members
 */
export async function saveOperators(clientId, members) {
  const snap = await teamDoc(clientId).get();
  const existing = snap.exists ? (snap.data()?.members || []) : [];
  const byId = new Map(existing.map((m) => [m.id, m]));
  const out = [];
  const seenHashes = new Map(); // pinHash -> member name, to catch collisions
  const fail = (code, who) => { const e = new Error(`${code}:${who}`); e.code = code; e.who = who; throw e; };

  for (const m of members || []) {
    const name = String(m?.name || "").trim();
    if (!name) continue; // ignore empty rows
    const id = m?.id && byId.has(m.id) ? m.id : `op_${randomUUID().slice(0, 8)}`;
    const prev = byId.get(id);
    const pinRaw = String(m?.pin ?? "").trim();
    let pinHash = prev?.pinHash || null;
    if (pinRaw) {
      if (!/^\d{3,8}$/.test(pinRaw)) fail("pin_invalid", name);
      pinHash = hashPin(clientId, pinRaw);
    }
    if (!pinHash) fail("pin_required", name);
    if (seenHashes.has(pinHash)) fail("pin_duplicate", name);
    seenHashes.set(pinHash, name);
    out.push({
      id,
      name,
      role: normalizeRole(m.role),
      doctorName: m.doctorName ? String(m.doctorName).trim() : null,
      pinHash,
    });
  }
  await teamDoc(clientId).set({ members: out, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, count: out.length };
}

/**
 * Resolve a PIN to an operator. Returns null on any miss (never reveals which
 * part was wrong). PIN must be 3–8 digits.
 * @returns {Promise<{id:string,name:string,role:string,doctorName:string|null}|null>}
 */
export async function identifyByPin(clientId, pin) {
  const p = String(pin || "").trim();
  if (!/^\d{3,8}$/.test(p)) return null;
  const snap = await teamDoc(clientId).get();
  if (!snap.exists) return null;
  const target = hashPin(clientId, p);
  const m = (snap.data()?.members || []).find((x) => x.pinHash === target);
  if (!m) return null;
  return { id: m.id, name: m.name, role: m.role, doctorName: m.doctorName || null };
}
