import admin from "../firebase.js";
import { searchPatient } from "../clara/agentBooking.js";
import { loadBooking } from "../clara/booking.js";
import { nameKeyOf } from "./events.js";

// ============================================================================
// Patient identity resolution for the shared brain. Turns a spoken name into a
// subject the rest of the brain can thread on — WITHOUT ever guessing:
//   - exact e-mail hit     -> matched, method "email"  (strongest identity)
//   - one CONSISTENT name  -> matched, method "name"   (last name must match)
//   - one INCONSISTENT hit -> ambiguous (the single hit doesn't match the name)
//   - several hits / none  -> ambiguous / unmatched (candidates kept, never guess)
// Reuses the proven masSearchPatients search (same index logic as the booking
// flow), so matching behaves consistently across the system.
//
// Mismatch safety: a name search can return a SINGLE row that isn't actually the
// person asked for (the index matched a first name, a substring, …). Auto-
// trusting count===1 there would thread one patient's contact onto ANOTHER's
// record — a confidentiality breach in a medical context. So a single hit is
// only accepted when its last name is present in the queried name; otherwise it
// is downgraded to "ambiguous" and a human confirms.
// ============================================================================

function fullName(p, fallback = "") {
  return `${p?.firstName || ""} ${p?.lastName || ""}`.trim() || fallback;
}

/**
 * Does a single DB hit actually correspond to the queried name? We anchor on the
 * LAST NAME: every token of the patient's last name must appear in the query's
 * folded tokens (umlaut/honorific-normalised via nameKeyOf). A last-name-only
 * query ("Meier") matches "Anna Meier"; a first-name-only or wrong-name hit does
 * not. Conservative by design — when unsure we prefer "ambiguous" over a guess.
 *
 * @param {string} query the name we searched for
 * @param {{firstName?:string, lastName?:string}} patient the single DB hit
 * @returns {boolean}
 */
export function nameLooksConsistent(query, patient) {
  const qToks = new Set(nameKeyOf(query).split(" ").filter(Boolean));
  if (!qToks.size) return false;
  const lastToks = nameKeyOf(patient?.lastName || "").split(" ").filter(Boolean);
  if (lastToks.length === 0) {
    // No structured last name to anchor on — fall back to the full name folded.
    const fullToks = nameKeyOf(fullName(patient)).split(" ").filter(Boolean);
    return fullToks.length > 0 && fullToks.every((t) => qToks.has(t));
  }
  return lastToks.every((t) => qToks.has(t));
}

/**
 * Resolve an e-mail sender to a patient by EXACT e-mail match — the most
 * reliable identity for written contact (a display name can be anything). Uses
 * the same masSearchPatients index (which covers e-mail) and only accepts an
 * unambiguous, exact address hit. Returns null when nothing matches cleanly.
 *
 * @param {string} clientId
 * @param {string} email
 * @returns {Promise<{patientId:string, name:string, matchStatus:"matched", candidates:object[]}|null>}
 */
export async function resolvePatientByEmail(clientId, email) {
  const mail = (email || "").trim().toLowerCase();
  if (!mail || !mail.includes("@")) return null;

  // 1) Direct platform lookup — the patient-search cloud function does NOT
  //    index e-mail addresses, so an exact Firestore query on the bound
  //    location is the reliable path ("Herr Diedershagen hat gemailt" must
  //    resolve even though searchPatient("…@gmx.de") finds nothing).
  try {
    const booking = await loadBooking(clientId);
    if (booking?.locationId) {
      const snap = await admin.firestore()
        .collection("clients").doc(clientId)
        .collection("locations").doc(booking.locationId)
        .collection("patients").where("email", "==", mail).limit(2).get();
      if (snap.size === 1) {
        const d = snap.docs[0];
        const p = d.data();
        return { patientId: d.id, name: fullName(p, mail), matchStatus: "matched", matchMethod: "email", confidence: "high", candidates: [{ id: d.id, ...p }] };
      }
      if (snap.size > 1) return null; // shared family address — never guess
    }
  } catch { /* fall through to the search index */ }

  // 2) Legacy fallback: the search index (in case it learns e-mail one day).
  let result;
  try {
    result = await searchPatient(clientId, mail);
  } catch {
    return null;
  }
  if (!result?.ok) return null;
  const exact = (result.patients || []).filter((p) => String(p.email || "").trim().toLowerCase() === mail);
  if (exact.length === 1) {
    const p = exact[0];
    return { patientId: p.id, name: fullName(p, mail), matchStatus: "matched", matchMethod: "email", confidence: "high", candidates: exact };
  }
  return null;
}

/**
 * Turn a caller/sender into a brain subject — WITHOUT ever guessing. Accepts
 * either a bare name (spoken caller) or an options object `{ name, email }`
 * (written contact). When an e-mail is given it is tried FIRST (exact match,
 * strongest identity), then we fall back to the proven name search:
 *   - exactly one DB hit  -> matched (patientId set)
 *   - several hits        -> ambiguous (candidates kept for a human check)
 *   - none / no name      -> unmatched
 *
 * @param {string} clientId
 * @param {string|{name?:string, email?:string}} nameOrOpts
 * @returns {Promise<{patientId:string|null, name:string, matchStatus:string, candidates?:object[]}>}
 */
export async function resolvePatientSubject(clientId, nameOrOpts) {
  const opts = typeof nameOrOpts === "string" ? { name: nameOrOpts } : (nameOrOpts || {});
  const nm = (opts.name || "").trim();
  const email = (opts.email || "").trim();

  // 1) E-mail first — an exact address hit is the most trustworthy match.
  if (email) {
    const byEmail = await resolvePatientByEmail(clientId, email).catch(() => null);
    if (byEmail) return byEmail;
  }

  if (!nm) return { patientId: null, name: "", matchStatus: "unmatched", matchMethod: null };

  // 2) Fall back to the name search.
  let result;
  try {
    result = await searchPatient(clientId, nm);
  } catch {
    return { patientId: null, name: nm, matchStatus: "unmatched", matchMethod: null };
  }
  if (!result?.ok) return { patientId: null, name: nm, matchStatus: "unmatched", matchMethod: null };

  const patients = result.patients || [];
  if (patients.length === 1) {
    const p = patients[0];
    // A single hit is only trustworthy if it actually matches the queried name;
    // otherwise we surface it as a candidate for a human to confirm (never guess).
    if (nameLooksConsistent(nm, p)) {
      return { patientId: p.id, name: fullName(p, nm), matchStatus: "matched", matchMethod: "name", confidence: "medium", candidates: patients };
    }
    return { patientId: null, name: nm, matchStatus: "ambiguous", matchMethod: null, candidates: patients };
  }
  if (patients.length > 1) {
    return { patientId: null, name: nm, matchStatus: "ambiguous", matchMethod: null, candidates: patients };
  }
  return { patientId: null, name: nm, matchStatus: "unmatched", matchMethod: null };
}
