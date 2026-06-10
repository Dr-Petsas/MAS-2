import admin from "../firebase.js";
import { masCollection } from "../tenant.js";

// Stores a practice's signature and stamp IMAGES so generated letters can show a
// scanned handwritten signature ("Unterschrift") and/or a practice stamp
// ("Stempel"). Same storage strategy as the letterhead asset: prefer Cloud
// Storage, fall back to inline base64 in Firestore (capped) for local dev.
// Metadata + (inline) bytes live at clients/{clientId}/mas_config/letter_{kind}.

const KINDS = new Set(["signature", "stamp"]);
const INLINE_MAX = 700 * 1024; // Firestore doc safety cap

function docFor(kind) {
  return `letter_${kind}`; // -> mas_config/letter_signature | letter_stamp
}

function metaRef(clientId, kind) {
  return masCollection(clientId, "mas_config").doc(docFor(kind));
}

function isImage(filename = "", contentType = "") {
  const ct = String(contentType).toLowerCase();
  const fn = String(filename).toLowerCase();
  return ct.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(fn);
}

function bucketOrNull() {
  try {
    const b = admin.storage().bucket();
    return b?.name ? b : null;
  } catch {
    return null;
  }
}

/**
 * Save an uploaded signature/stamp image.
 * @param {string} clientId
 * @param {"signature"|"stamp"} kind
 * @param {{ base64:string, filename?:string, contentType?:string }} input
 */
export async function saveLetterAsset(clientId, kind, { base64, filename, contentType } = {}) {
  if (!KINDS.has(kind)) return { ok: false, error: "bad_kind" };
  if (!base64) return { ok: false, error: "no_file" };
  if (!isImage(filename, contentType)) return { ok: false, error: "unsupported_type", note: "Nur PNG, JPG oder WEBP. Für Unterschrift/Stempel am besten PNG mit transparentem Hintergrund." };

  const buffer = Buffer.from(String(base64).replace(/^data:[^,]+,/, ""), "base64");
  const ct = contentType || "image/png";
  const meta = { kind, name: filename || `${kind}.png`, contentType: ct, size: buffer.length, uploadedAt: Date.now() };

  const bucket = bucketOrNull();
  if (bucket) {
    const path = `mas-letter-assets/${clientId}/${kind}-${Date.now()}.img`;
    await bucket.file(path).save(buffer, { contentType: ct, resumable: false });
    await metaRef(clientId, kind).set({ ...meta, storage: "bucket", path, inline: null }, { merge: false });
    return { ok: true, asset: meta };
  }

  if (buffer.length > INLINE_MAX) {
    return { ok: false, error: "too_large", note: `Datei ist ${Math.round(buffer.length / 1024)} KB. Ohne Cloud-Storage sind max. ${Math.round(INLINE_MAX / 1024)} KB möglich — bitte kleiner exportieren.` };
  }
  await metaRef(clientId, kind).set({ ...meta, storage: "inline", path: null, inline: buffer.toString("base64") }, { merge: false });
  return { ok: true, asset: meta };
}

/** Public metadata (no binary payload). */
export async function getLetterAssetMeta(clientId, kind) {
  if (!KINDS.has(kind)) return null;
  const snap = await metaRef(clientId, kind).get();
  if (!snap.exists) return null;
  const d = snap.data();
  return { kind: d.kind, name: d.name, contentType: d.contentType, size: d.size, uploadedAt: d.uploadedAt, storage: d.storage };
}

/** The actual bytes for rendering, or null if none. */
export async function getLetterAssetBuffer(clientId, kind) {
  if (!KINDS.has(kind)) return null;
  const snap = await metaRef(clientId, kind).get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (d.storage === "inline" && d.inline) return Buffer.from(d.inline, "base64");
  if (d.storage === "bucket" && d.path) {
    const bucket = bucketOrNull();
    if (!bucket) return null;
    try {
      const [buf] = await bucket.file(d.path).download();
      return buf;
    } catch {
      return null;
    }
  }
  return null;
}

export async function deleteLetterAsset(clientId, kind) {
  if (!KINDS.has(kind)) return { ok: false, error: "bad_kind" };
  const snap = await metaRef(clientId, kind).get();
  if (snap.exists) {
    const d = snap.data();
    if (d.storage === "bucket" && d.path) {
      const bucket = bucketOrNull();
      if (bucket) await bucket.file(d.path).delete().catch(() => {});
    }
    await metaRef(clientId, kind).delete();
  }
  return { ok: true };
}
