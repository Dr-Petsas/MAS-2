import { randomUUID } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";

// ============================================================================
// Praxen innerhalb EINES Logins (Praxisgemeinschaft): z. B. Meddent Duesseldorf
// mit Dr. Petsas / Dr. Petrikis / Dr. Nikolaou. Ein Standort, aber jede/r fuehrt
// offiziell eigene QM-Buecher. Diese Datei verwaltet nur die LISTE der Praxen +
// die aktuell gewaehlte. Das Zuordnen der einzelnen Buecher/Jobs zu einer Praxis
// (praxisId-Scoping) ist der naechste Schritt und baut hierauf auf.
//
// Ablage: clients/{clientId}/mas_qm_praxen/{praxisId}
//         clients/{clientId}/mas_qm_praxen/_meta  -> { activePraxisId }
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const META_ID = "_meta";

function col(clientId) {
  return masCollection(clientId, "mas_qm_praxen");
}
function s(v) {
  return String(v ?? "").trim();
}

/**
 * Alle Praxen + aktuell gewaehlte. Existiert noch keine, wird EINE Standard-
 * praxis ("Praxis 1") angelegt, damit die Oberflaeche immer eine Auswahl hat.
 */
export async function listPraxen(clientId) {
  const snap = await col(clientId).get();
  let praxen = snap.docs
    .filter((d) => d.id !== META_ID)
    .map((d) => ({ id: d.id, name: s(d.data().name) || "Praxis", createdAt: d.data().createdAt || null }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  if (praxen.length === 0) {
    const seeded = await createPraxis(clientId, { name: "Praxis 1" });
    return { praxen: [{ id: seeded.praxis.id, name: seeded.praxis.name, createdAt: null }], activePraxisId: seeded.praxis.id };
  }

  const metaSnap = await col(clientId).doc(META_ID).get();
  let activePraxisId = metaSnap.exists ? s(metaSnap.data().activePraxisId) : "";
  if (!activePraxisId || !praxen.some((p) => p.id === activePraxisId)) {
    activePraxisId = praxen[0].id;
    await col(clientId).doc(META_ID).set({ activePraxisId }, { merge: true });
  }
  return { praxen, activePraxisId };
}

/** Neue Praxis anlegen. Wird sie die erste, ist sie sofort aktiv. */
export async function createPraxis(clientId, { name = "" } = {}) {
  const nm = s(name) || "Neue Praxis";
  const id = randomUUID();
  await col(clientId).doc(id).set({ name: nm, createdAt: FieldValue.serverTimestamp() });
  const snap = await col(clientId).get();
  const count = snap.docs.filter((d) => d.id !== META_ID).length;
  if (count === 1) await col(clientId).doc(META_ID).set({ activePraxisId: id }, { merge: true });
  return { ok: true, praxis: { id, name: nm } };
}

/** Praxis umbenennen. */
export async function renamePraxis(clientId, praxisId, { name = "" } = {}) {
  const id = s(praxisId);
  const nm = s(name);
  if (!id || !nm) return { ok: false, reason: "bad_input" };
  const ref = col(clientId).doc(id);
  if (!(await ref.get()).exists) return { ok: false, reason: "not_found" };
  await ref.set({ name: nm }, { merge: true });
  return { ok: true };
}

/** Praxis loeschen. Die LETZTE Praxis bleibt erhalten (es muss immer eine geben). */
export async function deletePraxis(clientId, praxisId) {
  const id = s(praxisId);
  if (!id) return { ok: false, reason: "bad_input" };
  const snap = await col(clientId).get();
  const others = snap.docs.filter((d) => d.id !== META_ID && d.id !== id);
  if (others.length === 0) return { ok: false, reason: "last_praxis" };
  await col(clientId).doc(id).delete();
  const metaSnap = await col(clientId).doc(META_ID).get();
  if (metaSnap.exists && s(metaSnap.data().activePraxisId) === id) {
    await col(clientId).doc(META_ID).set({ activePraxisId: others[0].id }, { merge: true });
  }
  return { ok: true };
}

/** Aktuelle Praxis waehlen. */
export async function setActivePraxis(clientId, praxisId) {
  const id = s(praxisId);
  if (!id) return { ok: false, reason: "bad_input" };
  if (!(await col(clientId).doc(id).get()).exists) return { ok: false, reason: "not_found" };
  await col(clientId).doc(META_ID).set({ activePraxisId: id }, { merge: true });
  return { ok: true, activePraxisId: id };
}
