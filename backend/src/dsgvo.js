// DSGVO / GDPR data lifecycle for a single tenant (clientId).
//
//   - exportTenant()  → Art. 20 (portability): one JSON document with every
//                       MAS-owned Firestore record + a manifest of Storage
//                       objects (signed download URLs). Mail credentials are
//                       redacted unless explicitly requested.
//   - eraseTenant()   → Art. 17 (erasure): hard-delete all MAS-owned Firestore
//                       docs and Storage prefixes for the tenant. Supports a
//                       dry run so an operator can preview the blast radius.
//   - applyRetention() → purge transient data (trashed mail, ended sessions)
//                       older than a cutoff. Medical/case records are KEPT.
//
// Scope is strictly clients/{clientId}/mas_* (Firestore) and mas-*/{clientId}/
// (Storage). Platform-owned data (clients/{clientId} fields, settings/billing,
// patient/appointment records in the platform DB) is NOT touched here — that is
// the Pickadoc platform's responsibility.

import admin, { db } from "./firebase.js";
import { masCollection } from "./tenant.js";

// Every MAS-owned subcollection under clients/{clientId}. mas_config holds fixed
// config docs (letterhead, team, …) and is treated like any other collection.
export const MAS_COLLECTIONS = [
  "mas_cases",
  "mas_events",
  "mas_brain_outbox",
  "mas_tasks",
  "mas_sessions",
  "mas_mail_accounts",
  "mas_mail_messages",
  "mas_mail_attachments",
  "mas_contacts",
  "mas_letter_blocks",
  "mas_config",
];

// Cloud Storage prefixes that embed the tenant id. Erasure wipes these wholesale.
const STORAGE_PREFIXES = (clientId) => [
  `mas-mail/${clientId}/`,
  `mas-letterhead/${clientId}/`,
  `mas-letter-assets/${clientId}/`,
  `mas-letters/${clientId}/`,
];

// Fields that hold encrypted mail credentials — redacted from exports by default.
const SECRET_FIELDS = ["imapPasswordEnc", "smtpPasswordEnc"];

function requireClientId(clientId) {
  const id = (clientId || "").trim();
  if (!id) throw new Error("clientId required");
  return id;
}

// Recursively make a Firestore document JSON-safe: Timestamps → ISO strings,
// Buffers → base64, and optionally strip secret credential fields.
function serialize(value, { includeSecrets } = {}) {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map((v) => serialize(v, { includeSecrets }));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!includeSecrets && SECRET_FIELDS.includes(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = serialize(v, { includeSecrets });
    }
    return out;
  }
  return value;
}

function safeBucket() {
  try {
    const b = admin.storage().bucket();
    return b?.name ? b : null;
  } catch {
    return null;
  }
}

/**
 * Art. 20 export: aggregate every MAS-owned record for a tenant plus a manifest
 * of stored files (1h signed URLs). Returns a single serialisable object.
 */
export async function exportTenant(clientId, { includeSecrets = false } = {}) {
  const id = requireClientId(clientId);
  const firestore = {};
  const counts = {};
  for (const name of MAS_COLLECTIONS) {
    const snap = await masCollection(id, name).get();
    firestore[name] = snap.docs.map((d) => ({ id: d.id, ...serialize(d.data(), { includeSecrets }) }));
    counts[name] = snap.size;
  }

  const storage = [];
  const bucket = safeBucket();
  if (bucket) {
    for (const prefix of STORAGE_PREFIXES(id)) {
      let files = [];
      try {
        [files] = await bucket.getFiles({ prefix });
      } catch {
        files = [];
      }
      for (const f of files) {
        let url = null;
        try {
          [url] = await f.getSignedUrl({ action: "read", expires: Date.now() + 3600 * 1000 });
        } catch {
          url = null;
        }
        storage.push({
          path: f.name,
          size: Number(f.metadata?.size) || undefined,
          contentType: f.metadata?.contentType || undefined,
          url,
        });
      }
    }
  }

  return {
    ok: true,
    clientId: id,
    exportedAt: new Date().toISOString(),
    secretsIncluded: !!includeSecrets,
    counts: { ...counts, storageFiles: storage.length },
    firestore,
    storage,
  };
}

// Delete every document in a collection in batches. Uses listDocuments() so we
// don't read doc data we're about to throw away. Returns the number deleted.
async function deleteCollection(collRef, { dryRun }) {
  const refs = await collRef.listDocuments();
  if (dryRun || refs.length === 0) return refs.length;
  let deleted = 0;
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    const slice = refs.slice(i, i + 400);
    slice.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += slice.length;
  }
  return deleted;
}

/**
 * Art. 17 erasure: hard-delete all MAS-owned Firestore docs and Storage objects
 * for a tenant. With dryRun=true nothing is deleted — the returned counts are
 * the blast radius. The platform tenant root (clients/{clientId}) is preserved.
 */
export async function eraseTenant(clientId, { dryRun = false } = {}) {
  const id = requireClientId(clientId);
  const firestore = {};
  let totalDocs = 0;
  for (const name of MAS_COLLECTIONS) {
    const n = await deleteCollection(masCollection(id, name), { dryRun });
    firestore[name] = n;
    totalDocs += n;
  }

  const storage = {};
  let totalFiles = 0;
  const bucket = safeBucket();
  if (bucket) {
    for (const prefix of STORAGE_PREFIXES(id)) {
      let n = 0;
      try {
        const [files] = await bucket.getFiles({ prefix });
        n = files.length;
        if (!dryRun && n > 0) await bucket.deleteFiles({ prefix, force: true });
      } catch {
        n = 0;
      }
      storage[prefix] = n;
      totalFiles += n;
    }
  }

  return { ok: true, dryRun, clientId: id, firestore, storage, totalDocs, totalFiles };
}

// Resolve a stored Firestore timestamp/number/ISO string to epoch millis.
function toMillis(v) {
  if (!v) return 0;
  if (v instanceof admin.firestore.Timestamp) return v.toMillis();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof v?._seconds === "number") return v._seconds * 1000;
  return 0;
}

/**
 * Retention purge of transient data older than the given cutoffs:
 *   - trashed mail (folder === "Trash") older than trashDays, including its
 *     inline + Cloud Storage attachments;
 *   - ended sessions (status === "ended") older than sessionDays.
 * Active cases/events and non-trashed mail (the medical record) are KEPT.
 */
export async function applyRetention(clientId, { trashDays = 30, sessionDays = 90, dryRun = false } = {}) {
  const id = requireClientId(clientId);
  const now = Date.now();
  const result = { ok: true, dryRun, clientId: id, trashedMail: 0, storageFiles: 0, sessions: 0 };

  // Trashed mail past the cutoff.
  const trashCutoff = now - trashDays * 86400 * 1000;
  const bucket = safeBucket();
  const trashSnap = await masCollection(id, "mas_mail_messages").where("folder", "==", "Trash").get();
  for (const doc of trashSnap.docs) {
    const d = doc.data();
    const when = toMillis(d.updatedAt) || toMillis(d.date) || 0;
    if (when && when > trashCutoff) continue; // still within retention window
    result.trashedMail += 1;
    if (dryRun) continue;
    // Storage attachments referenced by this message.
    for (const att of d.attachments || []) {
      if (att?.storagePath && bucket) {
        try {
          await bucket.file(att.storagePath).delete({ ignoreNotFound: true });
          result.storageFiles += 1;
        } catch {
          /* best effort */
        }
      }
    }
    // Inline attachment docs + the message itself.
    try {
      const atts = await masCollection(id, "mas_mail_attachments").where("messageId", "==", doc.id).get();
      const batch = db.batch();
      atts.forEach((a) => batch.delete(a.ref));
      batch.delete(doc.ref);
      await batch.commit();
    } catch {
      await doc.ref.delete().catch(() => {});
    }
  }

  // Ended sessions past the cutoff.
  const sessionCutoff = now - sessionDays * 86400 * 1000;
  const sessSnap = await masCollection(id, "mas_sessions").where("status", "==", "ended").get();
  const stale = sessSnap.docs.filter((doc) => {
    const d = doc.data();
    const when = toMillis(d.endedAt) || toMillis(d.updatedAt) || toMillis(d.createdAt) || 0;
    return !when || when <= sessionCutoff;
  });
  result.sessions = stale.length;
  if (!dryRun && stale.length) {
    for (let i = 0; i < stale.length; i += 400) {
      const batch = db.batch();
      stale.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  return result;
}
