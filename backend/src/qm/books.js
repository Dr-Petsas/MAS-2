import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { getArtifact } from "./catalog.js";
import { resolveRequirements } from "./requirements.js";
import { reviewIntervalMonthsFor } from "./reviewPolicy.js";
import { resolveActivePraxisId } from "./praxis.js";

// ============================================================================
// QM-Bücher pro Praxis: clients/{clientId}/mas_qm_books/{bookKey}
//
// Ein "Buch" ist die aktivierte Instanz eines Katalog-Artefakts in EINER Praxis
// (Hygieneplan, Sterilisationsbuch, Konstanzprüfung ...). Es trägt Status,
// Verantwortliche, Version und einen Zähler der Doku-Einträge. Die eigentlichen
// Nachweise liegen append-only in mas_qm_documents (documents.js).
//
// bookKey == artifactKey (1:1). Das Dokument-Id IST der bookKey, damit
// Aktivierung idempotent ist und Reads ohne Query gehen.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;

function col(clientId) {
  return masCollection(clientId, "mas_qm_books");
}
function s(v) {
  return String(v ?? "").trim();
}

function profileRef(clientId) {
  return masCollection(clientId, "mas_qm_profile").doc("current");
}

/** Praxisprofil speichern (Merkmale für die Anforderungs-Engine). */
export async function saveProfile(clientId, profile = {}) {
  const clean = {
    fachrichtung: s(profile.fachrichtung) || null,
    sector: s(profile.sector).toLowerCase() || null,
    activities: profile.activities && typeof profile.activities === "object" ? profile.activities : {},
    capabilities: profile.capabilities && typeof profile.capabilities === "object" ? profile.capabilities : {},
    updatedAt: FieldValue.serverTimestamp(),
  };
  await profileRef(clientId).set(clean, { merge: true });
  // Fachrichtung an den Mandanten spiegeln (Chef 24.07.): Lena/lena_stt lesen
  // clients/{id}.fachrichtung, um die passende Fachwissens-Nachkorrektur zu
  // waehlen. So koppelt das QM-Onboarding die Fachrichtung automatisch an Lena.
  if (clean.fachrichtung) {
    try {
      await admin.firestore().collection("clients").doc(clientId)
        .set({ fachrichtung: clean.fachrichtung }, { merge: true });
    } catch { /* Spiegeln ist Bonus, nie kritisch */ }
  }
  return { ok: true, profile: clean };
}

/** Gespeichertes Praxisprofil lesen (oder null). */
export async function getProfile(clientId) {
  const snap = await profileRef(clientId).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Empfohlene Bücher aus dem gespeicherten Profil berechnen (Engine).
 * Reiner Read: ändert nichts. Liefert die Liste mit Status/Begründung.
 */
export async function computeRequirements(clientId) {
  const profile = (await getProfile(clientId)) || {};
  return resolveRequirements(profile);
}

/**
 * Ein Buch aktivieren (idempotent). Übernimmt Metadaten aus dem Katalog und
 * setzt Verantwortliche/Beauftragte. Re-Aktivierung merged nur die Felder.
 */
export async function activateBook(clientId, bookKey, { responsibleStaffId = "", deputyStaffId = "", responsibleRole = "", cycle = "", praxisId = "" } = {}) {
  const key = s(bookKey);
  const artifact = getArtifact(key);
  if (!artifact) return { ok: false, reason: "unknown_artifact" };

  const ref = col(clientId).doc(key);
  const snap = await ref.get();
  const firstActivation = !snap.exists;
  const reviewIntervalMonths = reviewIntervalMonthsFor(artifact);
  const base = firstActivation ? {
    key,
    title: artifact.title,
    type: artifact.type,
    category: artifact.category,
    version: 1,
    documentCount: 0,
    createdAt: FieldValue.serverTimestamp(),
  } : {};
  const patch = {
    ...base,
    active: true,
    responsibleStaffId: s(responsibleStaffId) || null,
    deputyStaffId: s(deputyStaffId) || null,
    responsibleRole: s(responsibleRole) || null,
    cycle: s(cycle) || artifact.defaultCycle || null,
    recurrenceMode: artifact.recurrenceMode || "fixed",
    reviewIntervalMonths,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // Praxis-Zugehoerigkeit: dieses Buch gilt (auch) fuer die aktive Praxis.
  // Mehrere Praxen einer Gemeinschaft koennen denselben Plan fuehren.
  const pid = s(praxisId) || (await resolveActivePraxisId(clientId));
  if (pid) patch.praxisIds = FieldValue.arrayUnion(pid);
  // reviewedAt (Gültigkeits-Anker) nur bei Erst-Aktivierung setzen, damit eine
  // Re-Aktivierung die Frist nicht heimlich zurücksetzt.
  if (firstActivation && reviewIntervalMonths > 0) patch.reviewedAt = new Date().toISOString();
  await ref.set(patch, { merge: true });

  return { ok: true, key };
}

/**
 * Ein Buch fuer die aktive Praxis deaktivieren. Die Praxis wird aus praxisIds
 * entfernt; ist danach keine Praxis mehr zugeordnet, gilt das Buch als inaktiv.
 * Daten bleiben erhalten.
 */
export async function deactivateBook(clientId, bookKey, { praxisId = "" } = {}) {
  const key = s(bookKey);
  const ref = col(clientId).doc(key);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const pid = s(praxisId) || (await resolveActivePraxisId(clientId));
  const cur = Array.isArray(snap.data().praxisIds) ? snap.data().praxisIds : [];
  const next = pid ? cur.filter((x) => x !== pid) : [];
  await ref.set({ praxisIds: next, active: next.length > 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, key };
}

/** Verantwortliche(n)/Vertretung/Rolle eines Buchs setzen. */
export async function setBookResponsible(clientId, bookKey, { responsibleStaffId, deputyStaffId, responsibleRole } = {}) {
  const ref = col(clientId).doc(s(bookKey));
  if (!(await ref.get()).exists) return { ok: false, reason: "not_found" };
  const patch = { updatedAt: FieldValue.serverTimestamp() };
  if (responsibleStaffId !== undefined) patch.responsibleStaffId = s(responsibleStaffId) || null;
  if (deputyStaffId !== undefined) patch.deputyStaffId = s(deputyStaffId) || null;
  if (responsibleRole !== undefined) patch.responsibleRole = s(responsibleRole) || null;
  await ref.set(patch, { merge: true });
  return { ok: true, key: s(bookKey) };
}

/**
 * Plan als überprüft markieren: setzt den Gültigkeits-Anker (reviewedAt) auf
 * jetzt und erhöht die Version. Damit verschwindet das "abgelaufen"-Badge und
 * die Frist läuft neu. Gibt die neue Version + reviewedAt zurück.
 */
export async function markReviewed(clientId, bookKey, { by = "julia" } = {}) {
  const ref = col(clientId).doc(s(bookKey));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const reviewedAt = new Date().toISOString();
  const next = Number(snap.data()?.version || 1) + 1;
  await ref.set({ reviewedAt, reviewedBy: s(by) || "julia", version: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, key: s(bookKey), version: next, reviewedAt };
}

/** Plan-Version erhöhen (z. B. nach Hygieneplan-Update) — gibt neue Version zurück. */
export async function bumpBookVersion(clientId, bookKey) {
  const ref = col(clientId).doc(s(bookKey));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const next = Number(snap.data()?.version || 1) + 1;
  await ref.set({ version: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, key: s(bookKey), version: next };
}

/**
 * Generierte Plan-Inhalte am Buch ablegen (z. B. die 9 Hygienepläne mit
 * Mittel/Dosierung/Einwirkzeit). Auf einen Blick lesbar, ohne Query.
 */
export async function setBookPlans(clientId, bookKey, plans = [], { products = null } = {}) {
  const ref = col(clientId).doc(s(bookKey));
  if (!(await ref.get()).exists) return { ok: false, reason: "not_found" };
  // Frisch erstellte/aktualisierte Pläne verlängern die Gültigkeit ab jetzt.
  const patch = { generatedPlans: Array.isArray(plans) ? plans : [], generatedAt: FieldValue.serverTimestamp(), reviewedAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() };
  if (products && typeof products === "object") patch.products = products;
  await ref.set(patch, { merge: true });
  return { ok: true, key: s(bookKey), planCount: patch.generatedPlans.length };
}

/** Doku-Zähler erhöhen (von documents.appendDocument aufgerufen). */
export async function incrementDocumentCount(clientId, bookKey) {
  await col(clientId).doc(s(bookKey)).set(
    { documentCount: FieldValue.increment(1), lastDocumentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  ).catch(() => {});
}

/** Ein Buch lesen (oder null). */
export async function getBook(clientId, bookKey) {
  const snap = await col(clientId).doc(s(bookKey)).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Buecher. Mit praxisId werden nur die Buecher DIESER Praxis geliefert
 * (Zugehoerigkeit ueber praxisIds; Altbestand ohne Feld erscheint ueberall).
 */
export async function listBooks(clientId, { activeOnly = false, praxisId = "" } = {}) {
  const snap = await col(clientId).get();
  let books = snap.docs.map((d) => d.data());
  const pid = s(praxisId);
  if (pid) books = books.filter((b) => !Array.isArray(b.praxisIds) || b.praxisIds.length === 0 || b.praxisIds.includes(pid));
  if (activeOnly) books = books.filter((b) => b.active === true);
  return books.sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.title || "").localeCompare(b.title || ""));
}
