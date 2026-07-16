import { randomUUID, createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { getArtifact } from "./catalog.js";
import { incrementDocumentCount } from "./books.js";

// ============================================================================
// QM-Nachweise (Doku-Dateien je Buch): clients/{clientId}/mas_qm_documents/{id}
//
// APPEND-ONLY. Ein Nachweis wird nie gelöscht oder verändert; eine Korrektur
// ist ein NEUER Eintrag mit `correctsDocId`. Jeder Eintrag trägt einen Hash über
// seinen Inhalt (Manipulations-/Integritätsnachweis für die Begehung) und das
// Wer/Wann. Das ist die Quelle für "wer hat was wann gemacht".
// ============================================================================

const FieldValue = admin.firestore.FieldValue;

function col(clientId) {
  return masCollection(clientId, "mas_qm_documents");
}
function s(v) {
  return String(v ?? "").trim();
}

function contentHash(parts) {
  return "sha256:" + createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/**
 * Validate provided field values against the artifact's requiredFields.
 * @returns {{ok:boolean, missing?:string[], cleaned?:object}}
 */
export function validateFields(bookKey, fields = {}) {
  const artifact = getArtifact(bookKey);
  if (!artifact) return { ok: false, missing: ["__unknown_artifact__"] };
  const defs = Array.isArray(artifact.requiredFields) ? artifact.requiredFields : [];
  const cleaned = {};
  const missing = [];
  for (const def of defs) {
    const v = fields ? fields[def.key] : undefined;
    const present = v !== undefined && v !== null && String(v).trim() !== "";
    if (def.required && !present) {
      missing.push(def.key);
      continue;
    }
    if (!present) continue;
    if (def.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) { missing.push(def.key); continue; }
      cleaned[def.key] = n;
    } else if (def.type === "enum") {
      const val = s(v);
      if (Array.isArray(def.options) && def.options.length && !def.options.includes(val)) { missing.push(def.key); continue; }
      cleaned[def.key] = val;
    } else {
      cleaned[def.key] = s(v);
    }
  }
  // also carry through any extra (non-required) fields the caller sent
  for (const [k, v] of Object.entries(fields || {})) {
    if (!(k in cleaned)) cleaned[k] = typeof v === "number" ? v : s(v);
  }
  return missing.length ? { ok: false, missing } : { ok: true, cleaned };
}

/**
 * Append ONE immutable proof entry to a book. Validates required fields first.
 * @returns {{ok:boolean, reason?:string, missing?:string[], doc?:object}}
 */
export async function appendDocument(clientId, bookKey, {
  jobId = "", deviceRef = "", performedBy = "", performedByName = "",
  fields = {}, attachments = [], planVersion = null, correctsDocId = "", note = "",
} = {}) {
  const key = s(bookKey);
  if (!getArtifact(key)) return { ok: false, reason: "unknown_artifact" };

  const v = validateFields(key, fields);
  if (!v.ok) return { ok: false, reason: "missing_required_fields", missing: v.missing };

  const id = randomUUID();
  const performedAt = new Date().toISOString();
  const cleanFields = v.cleaned;
  const cleanAttachments = (Array.isArray(attachments) ? attachments : []).map((a) => s(a)).filter(Boolean).slice(0, 20);

  const hash = contentHash({ key, jobId: s(jobId), deviceRef: s(deviceRef), performedBy: s(performedBy), performedAt, fields: cleanFields, attachments: cleanAttachments });

  const doc = {
    id,
    clientId,
    bookKey: key,
    jobId: s(jobId) || null,
    deviceRef: s(deviceRef) || null,
    performedBy: s(performedBy) || null,
    performedByName: s(performedByName) || null,
    performedAt,
    performedAtMs: Date.now(),
    fields: cleanFields,
    attachments: cleanAttachments,
    planVersion: planVersion == null ? null : Number(planVersion) || null,
    correctsDocId: s(correctsDocId) || null,
    note: s(note).slice(0, 1000) || null,
    hash,
    createdAt: FieldValue.serverTimestamp(),
  };

  await col(clientId).doc(id).set(doc);
  await incrementDocumentCount(clientId, key);
  return { ok: true, doc };
}

/** Read one document by id (or null). */
export async function getDocument(clientId, docId) {
  const snap = await col(clientId).doc(s(docId)).get();
  return snap.exists ? snap.data() : null;
}

/**
 * List proofs of a book, newest first. Equality-only query + in-memory sort to
 * avoid composite indexes (same pattern as eventStore.queryByPatient).
 */
export async function listDocuments(clientId, bookKey, { deviceRef = "", limit = 100 } = {}) {
  const key = s(bookKey);
  let q = col(clientId).where("bookKey", "==", key);
  const snap = await q.limit(1000).get();
  let docs = snap.docs.map((d) => d.data());
  if (s(deviceRef)) docs = docs.filter((d) => d.deviceRef === s(deviceRef));
  docs.sort((a, b) => (b.performedAtMs || 0) - (a.performedAtMs || 0));
  return docs.slice(0, Math.max(1, Math.min(1000, limit)));
}

/**
 * Das EINE QM-Kontrollbuch: alle Nachweise der Praxis über alle Bücher hinweg,
 * neueste zuerst, angereichert um Buchtitel + QM-Thema (category) für Suche und
 * Gliederung. Append-only Quelle für "wer hat was wann erledigt".
 */
export async function listAllDocuments(clientId, { limit = 1000 } = {}) {
  const snap = await col(clientId).limit(3000).get();
  let docs = snap.docs.map((d) => d.data());
  docs.sort((a, b) => (b.performedAtMs || 0) - (a.performedAtMs || 0));
  docs = docs.slice(0, Math.max(1, Math.min(3000, limit)));
  return docs.map((d) => {
    const a = getArtifact(d.bookKey) || {};
    return { ...d, bookTitle: a.title || d.bookKey, category: a.category || "organisation" };
  });
}

/** The most recent proof for a book (optionally a specific device). */
export async function latestDocument(clientId, bookKey, { deviceRef = "" } = {}) {
  const docs = await listDocuments(clientId, bookKey, { deviceRef, limit: 1 });
  return docs[0] || null;
}

/** Build export rows (CSV/PDF source) for a book in a time range. */
export async function exportRows(clientId, bookKey, { from = 0, to = Date.now() } = {}) {
  const docs = await listDocuments(clientId, bookKey, { limit: 1000 });
  return docs
    .filter((d) => (d.performedAtMs || 0) >= Number(from) && (d.performedAtMs || 0) <= Number(to))
    .map((d) => ({
      datum: d.performedAt,
      durch: d.performedByName || d.performedBy || "",
      geraet: d.deviceRef || "",
      felder: d.fields || {},
      nachweis: d.hash,
    }));
}
