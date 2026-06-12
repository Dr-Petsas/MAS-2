import admin from "../firebase.js";
import { masCollection } from "../tenant.js";

// Read models for the mailbox UI: message lists (newest first), a single
// message, read-state toggles, and a light address-book lookup. Bodies are
// trimmed out of list responses to keep them small; the detail call returns the
// full message.

const { FieldValue } = admin.firestore;
const MSG_COL = "mas_mail_messages";
const CONTACT_COL = "mas_contacts";
const ATT_COL = "mas_mail_attachments";

function msgs(clientId) {
  return masCollection(clientId, MSG_COL);
}

function listShape(id, d) {
  return {
    id,
    accountId: d.accountId,
    folder: d.folder,
    direction: d.direction,
    threadId: d.threadId,
    from: d.from,
    to: d.to,
    subject: d.subject,
    date: d.date,
    seen: d.seen,
    preview: d.preview,
    hasAttachments: !!d.hasAttachments,
    caseId: d.caseId || null,
    category: d.category || null,
    relevant: d.relevant == null ? null : !!d.relevant,
    relevanceReason: d.relevanceReason || null,
    aiClassifiedAt: d.aiClassifiedAt || null,
  };
}

export async function listMessages(clientId, { accountId, accountIds, folder = "INBOX", limit = 50 } = {}) {
  let q = msgs(clientId).where("folder", "==", folder);
  if (accountId) q = q.where("accountId", "==", accountId);
  // Avoid composite-index requirements: filter in query, sort in memory.
  const snap = await q.limit(Math.min(300, limit * 3)).get();
  let rows = snap.docs.map((doc) => listShape(doc.id, doc.data()));
  // Per-user mailbox scoping: when a set of accessible accounts is given, keep
  // only messages from those mailboxes (admins pass no set and see everything).
  if (!accountId && Array.isArray(accountIds)) {
    const set = new Set(accountIds);
    rows = rows.filter((r) => set.has(r.accountId));
  }
  rows.sort((a, b) => (b.date || 0) - (a.date || 0));
  return rows.slice(0, limit);
}

/** All messages attached to a case (inbound replies + sent copies). */
export async function listMessagesForCase(clientId, caseId) {
  if (!caseId) return [];
  const snap = await msgs(clientId).where("caseId", "==", caseId).limit(50).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (a.date || 0) - (b.date || 0));
  return rows;
}

export async function getMessage(clientId, id) {
  const snap = await msgs(clientId).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

export async function markRead(clientId, id, seen = true) {
  await msgs(clientId).doc(id).update({ seen: !!seen, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

/**
 * Delete a message. From a normal folder this is a soft delete (moved to Trash,
 * remembering the previous folder so it could be restored). From Trash — or with
 * permanent=true — the doc and its inline attachments are removed for good.
 */
export async function deleteMessage(clientId, id, permanent = false) {
  const ref = msgs(clientId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const d = snap.data();
  if (!permanent && d.folder !== "Trash") {
    await ref.update({ prevFolder: d.folder || "INBOX", folder: "Trash", updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, trashed: true };
  }
  try {
    const atts = await masCollection(clientId, ATT_COL).where("messageId", "==", id).get();
    const batch = admin.firestore().batch();
    atts.forEach((a) => batch.delete(a.ref));
    batch.delete(ref);
    await batch.commit();
  } catch {
    await ref.delete();
  }
  return { ok: true, deleted: true };
}

/** Persist an LLM (or manual) relevance/category classification on a message. */
export async function setMessageClassification(clientId, id, { category, relevant, relevanceReason } = {}) {
  await msgs(clientId).doc(id).update({
    category: category || "Sonstiges",
    relevant: relevant !== false,
    relevanceReason: relevanceReason || "",
    aiClassifiedAt: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

/** Attach a message to a case (so inbound replies show up on the thread). */
export async function linkMessageToCase(clientId, id, caseId) {
  await msgs(clientId).doc(id).update({ caseId: caseId || null, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

/** A short-lived signed URL for a stored attachment, or null if not in Storage. */
export async function getAttachmentUrl(clientId, id, idx) {
  const m = await getMessage(clientId, id);
  if (!m) return { ok: false, reason: "not_found" };
  const att = (m.attachments || [])[Number(idx)];
  if (!att) return { ok: false, reason: "no_attachment" };
  if (!att.stored || !att.storagePath) return { ok: false, reason: "not_stored" };
  try {
    const bucket = admin.storage().bucket();
    const [url] = await bucket.file(att.storagePath).getSignedUrl({ action: "read", expires: Date.now() + 3600 * 1000 });
    return { ok: true, url, filename: att.filename, contentType: att.contentType };
  } catch (e) {
    return { ok: false, reason: "storage_error", error: String(e?.message || e) };
  }
}

/** Raw attachment bytes for inline preview/download, or a signed URL to redirect to. */
export async function getAttachmentData(clientId, id, idx) {
  const m = await getMessage(clientId, id);
  if (!m) return { ok: false, reason: "not_found" };
  const att = (m.attachments || [])[Number(idx)];
  if (!att) return { ok: false, reason: "no_attachment" };
  if (att.inline) {
    const snap = await masCollection(clientId, ATT_COL).doc(`${id}_${idx}`).get();
    if (!snap.exists) return { ok: false, reason: "not_stored" };
    const d = snap.data();
    return { ok: true, buffer: Buffer.from(d.data || "", "base64"), contentType: d.contentType || att.contentType, filename: d.filename || att.filename };
  }
  if (att.stored && att.storagePath) {
    try {
      const bucket = admin.storage().bucket();
      const [url] = await bucket.file(att.storagePath).getSignedUrl({ action: "read", expires: Date.now() + 3600 * 1000 });
      return { ok: true, redirect: url, filename: att.filename, contentType: att.contentType };
    } catch (e) {
      return { ok: false, reason: "storage_error", error: String(e?.message || e) };
    }
  }
  return { ok: false, reason: "not_stored" };
}

// Bulk/no-reply senders that pollute an address book. Used only to clean up
// LEGACY rows (stored before relevance-gating); contacts explicitly flagged
// relevant:true are always kept.
const BULK_SENDER_RE = /no-?reply|do-?not-?reply|newsletter|mailing|marketing|notification|campaign|mailer|update@|news@|info@\S*(newsletter|mail)/i;

function keepContact(c, needle) {
  // Address book = practice-relevant contacts only. New non-relevant senders are
  // never stored; legacy rows (no flag) are kept unless they look like bulk mail.
  if (c.relevant === false) return false;
  if (c.relevant !== true && BULK_SENDER_RE.test(c.address || "")) return false;
  const phones = Array.isArray(c.phones) ? c.phones.join(" ") : "";
  if (needle && !`${c.name || ""} ${c.address || ""} ${c.lastSubject || ""} ${phones}`.toLowerCase().includes(needle)) return false;
  return true;
}

/**
 * Paginated address-book read. Scans in bounded windows ordered by lastSeenAt
 * (newest first) using a serialisable cursor, so memory per request stays
 * bounded no matter how large the contact list grows — no full-collection load,
 * no composite index. Every relevant contact carries lastSeenAt (set on upsert),
 * so the ordering never drops a real contact.
 *
 * @returns {Promise<{items: object[], nextCursor: string|null}>}
 */
export async function listContacts(clientId, { q = "", limit = 20, cursor = null } = {}) {
  const needle = q.toLowerCase().trim();
  const pageSize = Math.max(1, Math.min(200, Number(limit) || 20));
  const WINDOW = 200;
  const SCAN_CAP = 5000; // hard safety bound on docs examined per request
  const base = masCollection(clientId, CONTACT_COL).orderBy("lastSeenAt", "desc");

  const items = [];
  let scanAfter = cursor != null && cursor !== "" ? Number(cursor) : null; // windows within this call
  let returnedCursor = null; // lastSeenAt of the last item we actually returned
  let scanned = 0;
  let moreDocs = true;

  while (items.length < pageSize && scanned < SCAN_CAP && moreDocs) {
    let qref = base.limit(WINDOW);
    if (scanAfter != null && Number.isFinite(scanAfter)) qref = qref.startAfter(scanAfter);
    const snap = await qref.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const c = { id: d.id, ...d.data() };
      scanAfter = c.lastSeenAt ?? scanAfter; // advance window cursor past this doc
      scanned += 1;
      if (keepContact(c, needle)) {
        items.push(c);
        returnedCursor = c.lastSeenAt ?? returnedCursor;
        if (items.length >= pageSize) break;
      }
    }
    if (snap.size < WINDOW) moreDocs = false; // reached the end of the collection
  }

  // A full page means there may be more — resume after the last RETURNED item.
  const nextCursor = items.length >= pageSize && returnedCursor != null ? String(returnedCursor) : null;
  return { items, nextCursor };
}
