import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { getLetterSettings, setLetterSettings } from "./letterSettings.js";

// A practice can keep SEVERAL branded letterhead files (PDF or image). Each one
// is one document under clients/{clientId}/mas_letterheads (auto id) with its
// bytes either in Cloud Storage (preferred) or inline base64 (local dev). The
// "active" letterhead is referenced by settings.activeLetterheadId and is the
// one overlaid on generated letters.
//
// Backwards compatibility: an older single-file layout stored the letterhead at
// mas_config/letterhead_asset. On first list we lazily migrate it into the
// collection so nothing is lost.

const COL = "mas_letterheads";
const LEGACY_DOC = "letterhead_asset";
const INLINE_MAX = 900 * 1024; // Firestore doc safety cap (~1MB hard limit)

function col(clientId) {
  return masCollection(clientId, COL);
}
function legacyRef(clientId) {
  return masCollection(clientId, "mas_config").doc(LEGACY_DOC);
}

function kindFor(filename = "", contentType = "") {
  const ct = String(contentType).toLowerCase();
  const fn = String(filename).toLowerCase();
  if (ct.includes("pdf") || fn.endsWith(".pdf")) return "pdf";
  if (ct.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(fn)) return "image";
  return null;
}

function bucketOrNull() {
  try {
    const b = admin.storage().bucket();
    return b?.name ? b : null;
  } catch {
    return null;
  }
}

function publicMeta(id, d) {
  return { id, kind: d.kind, name: d.name, contentType: d.contentType, size: d.size, uploadedAt: d.uploadedAt, storage: d.storage };
}

// A small preview the browser can render directly: inline images become a data
// URL; bucket images get a short-lived signed URL. PDFs have no raster preview
// here (the frontend shows a PDF icon + the real letter preview via /mail/letter).
async function previewFor(d) {
  if (d.kind !== "image") return null;
  if (d.storage === "inline" && d.inline) return `data:${d.contentType || "image/png"};base64,${d.inline}`;
  if (d.storage === "bucket" && d.path) {
    const bucket = bucketOrNull();
    if (!bucket) return null;
    try {
      const [url] = await bucket.file(d.path).getSignedUrl({ action: "read", expires: Date.now() + 24 * 3600 * 1000 });
      return url;
    } catch {
      return null;
    }
  }
  return null;
}

// Move the legacy single-file letterhead into the collection once, if present.
async function migrateLegacy(clientId) {
  const snap = await legacyRef(clientId).get();
  if (!snap.exists) return;
  const d = snap.data();
  await col(clientId).add({
    kind: d.kind || "pdf",
    name: d.name || "briefkopf",
    contentType: d.contentType || "application/pdf",
    size: d.size || 0,
    storage: d.storage || "inline",
    path: d.path || null,
    inline: d.inline || null,
    uploadedAt: d.uploadedAt || Date.now(),
  });
  await legacyRef(clientId).delete().catch(() => {});
}

/**
 * Save (ADD) an uploaded letterhead. Returns its id; also makes it the active
 * letterhead and switches the practice to "asset" mode.
 * @param {string} clientId
 * @param {{ base64:string, filename?:string, contentType?:string }} input
 */
export async function saveLetterheadAsset(clientId, { base64, filename, contentType } = {}) {
  if (!base64) return { ok: false, error: "no_file" };
  const kind = kindFor(filename, contentType);
  if (!kind) return { ok: false, error: "unsupported_type", note: "Nur PDF, PNG oder JPG." };

  const buffer = Buffer.from(String(base64).replace(/^data:[^,]+,/, ""), "base64");
  const ct = contentType || (kind === "pdf" ? "application/pdf" : "image/png");
  const base = { kind, name: filename || (kind === "pdf" ? "briefkopf.pdf" : "briefkopf.png"), contentType: ct, size: buffer.length, uploadedAt: Date.now() };

  const bucket = bucketOrNull();
  let doc;
  if (bucket) {
    const path = `mas-letterhead/${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${kind === "pdf" ? "pdf" : "img"}`;
    await bucket.file(path).save(buffer, { contentType: ct, resumable: false });
    doc = await col(clientId).add({ ...base, storage: "bucket", path, inline: null });
  } else {
    if (buffer.length > INLINE_MAX) {
      return { ok: false, error: "too_large", note: `Datei ist ${Math.round(buffer.length / 1024)} KB. Ohne Cloud-Storage sind max. ${Math.round(INLINE_MAX / 1024)} KB möglich — bitte kleiner exportieren.` };
    }
    doc = await col(clientId).add({ ...base, storage: "inline", path: null, inline: buffer.toString("base64") });
  }

  await setLetterSettings(clientId, { activeLetterheadId: doc.id, letterheadMode: "asset" });
  return { ok: true, asset: { id: doc.id, ...base } };
}

/** List all letterheads (metadata + a browser-renderable preview for images). */
export async function listLetterheads(clientId) {
  if ((await col(clientId).limit(1).get()).empty) await migrateLegacy(clientId).catch(() => {});
  const snap = await col(clientId).orderBy("uploadedAt", "desc").get();
  const settings = await getLetterSettings(clientId).catch(() => ({}));
  const items = [];
  for (const docSnap of snap.docs) {
    const d = docSnap.data();
    items.push({ ...publicMeta(docSnap.id, d), preview: await previewFor(d) });
  }
  return { items, activeId: settings.activeLetterheadId || (items[0]?.id || "") };
}

/** Public metadata for the ACTIVE letterhead (kept for backwards compatibility). */
export async function getLetterheadMeta(clientId) {
  const buf = await activeDoc(clientId);
  return buf ? publicMeta(buf.id, buf.data) : null;
}

async function activeDoc(clientId) {
  const settings = await getLetterSettings(clientId).catch(() => ({}));
  const wantId = (settings.activeLetterheadId || "").trim();
  if (wantId) {
    const s = await col(clientId).doc(wantId).get();
    if (s.exists) return { id: s.id, data: s.data() };
  }
  // No explicit active id — fall back to the most recent one (and migrate legacy).
  if ((await col(clientId).limit(1).get()).empty) await migrateLegacy(clientId).catch(() => {});
  const snap = await col(clientId).orderBy("uploadedAt", "desc").limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

/** Bytes for the active (or a specific) letterhead, for overlay/rendering. */
export async function getLetterheadBuffer(clientId, id = "") {
  let entry;
  if (id) {
    const s = await col(clientId).doc(id).get();
    entry = s.exists ? { id: s.id, data: s.data() } : null;
  } else {
    entry = await activeDoc(clientId);
  }
  if (!entry) return null;
  const d = entry.data;
  if (d.storage === "inline" && d.inline) return { kind: d.kind, buffer: Buffer.from(d.inline, "base64") };
  if (d.storage === "bucket" && d.path) {
    const bucket = bucketOrNull();
    if (!bucket) return null;
    try {
      const [buf] = await bucket.file(d.path).download();
      return { kind: d.kind, buffer: buf };
    } catch {
      return null;
    }
  }
  return null;
}

/** Make a letterhead the active one. */
export async function setActiveLetterhead(clientId, id) {
  const s = await col(clientId).doc(id).get();
  if (!s.exists) return { ok: false, error: "not_found" };
  await setLetterSettings(clientId, { activeLetterheadId: id, letterheadMode: "asset" });
  return { ok: true, activeId: id };
}

/** Delete one letterhead (by id). If it was active, the next newest becomes active. */
export async function deleteLetterhead(clientId, id) {
  const ref = col(clientId).doc(id);
  const s = await ref.get();
  if (s.exists) {
    const d = s.data();
    if (d.storage === "bucket" && d.path) {
      const bucket = bucketOrNull();
      if (bucket) await bucket.file(d.path).delete().catch(() => {});
    }
    await ref.delete();
  }
  const settings = await getLetterSettings(clientId).catch(() => ({}));
  if ((settings.activeLetterheadId || "") === id) {
    const rest = await col(clientId).orderBy("uploadedAt", "desc").limit(1).get();
    if (rest.empty) await setLetterSettings(clientId, { activeLetterheadId: "", letterheadMode: "text" });
    else await setLetterSettings(clientId, { activeLetterheadId: rest.docs[0].id });
  }
  return { ok: true };
}

// Back-compat alias for the old single-file delete route (clears all? No — kept
// for callers that deleted "the" letterhead). Now: delete active, fall back.
export async function deleteLetterheadAsset(clientId) {
  const entry = await activeDoc(clientId);
  if (!entry) { await setLetterSettings(clientId, { letterheadMode: "text" }); return { ok: true }; }
  return deleteLetterhead(clientId, entry.id);
}
