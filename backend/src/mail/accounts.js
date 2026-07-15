import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { encryptSecret, decryptSecret, maskSecret } from "./crypto.js";

// Mail accounts per practice, stored under clients/{clientId}/mas_mail_accounts.
// Host/port/user/email are readable; the IMAP and SMTP passwords are encrypted
// at rest (see crypto.js). The public/list shape NEVER contains secrets — only
// a boolean "has password" — so the UI can show config status without exposure.

const { FieldValue } = admin.firestore;
const COL = "mas_mail_accounts";
const SIG_HTML_MAX = 200000; // gleiche Obergrenze wie die globale HTML-Signatur

function col(clientId) {
  return masCollection(clientId, COL);
}

const s = (v) => (v == null ? "" : String(v).trim());
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v, d = true) => (v == null ? d : Boolean(v) && v !== 0 && v !== "0" && v !== "false");

/**
 * Sichtbarkeitsklasse eines Kontos: "private" (nur der Inhaber sieht und
 * bearbeitet es — auch Admins nicht) oder "praxis" (Team-Postfach).
 * Alt-Konten ohne explizites Feld: Besitzer gesetzt ⇒ privat, sonst Praxis.
 */
export function accountVisibility(doc) {
  const v = s(doc?.visibility).toLowerCase();
  if (v === "private" || v === "praxis") return v;
  return s(doc?.ownerUserId) ? "private" : "praxis";
}

/** Public shape: safe to send to the browser (no secrets). */
export function toPublic(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    label: doc.label || doc.email || doc.id,
    email: doc.email || "",
    active: doc.active !== false,
    ownerUserId: doc.ownerUserId || "",
    visibility: accountVisibility(doc),
    imap: { host: doc.imap?.host || "", port: doc.imap?.port || 993, secure: doc.imap?.secure !== false, user: doc.imap?.user || "" },
    smtp: { host: doc.smtp?.host || "", port: doc.smtp?.port || 587, secure: doc.smtp?.secure === true, user: doc.smtp?.user || "" },
    hasImapPassword: !!doc.imapPasswordEnc,
    hasSmtpPassword: !!doc.smtpPasswordEnc,
    lastSyncAt: doc.lastSyncAt || null,
    lastError: doc.lastError || null,
    passwordMask: maskSecret(doc.imapPasswordEnc),
    // Konto-eigene E-Mail-Signatur (verhindert, dass ein Konto die falsche
    // Signatur sendet). Leer = die globale Praxis-Signatur greift.
    emailSignature: doc.emailSignature || "",
    emailSignatureHtml: doc.emailSignatureHtml || "",
  };
}

export async function listAccounts(clientId) {
  const snap = await col(clientId).orderBy("createdAt", "asc").get().catch(async () => col(clientId).get());
  return snap.docs.map((d) => toPublic({ id: d.id, ...d.data() }));
}

/** Internal: full doc incl. decrypted passwords, for IMAP/SMTP use only. */
export async function getAccountWithSecrets(clientId, id) {
  const ref = col(clientId).doc(s(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const doc = { id: snap.id, ...snap.data() };
  return {
    ...doc,
    imapPassword: doc.imapPasswordEnc ? decryptSecret(doc.imapPasswordEnc) : "",
    smtpPassword: doc.smtpPasswordEnc ? decryptSecret(doc.smtpPasswordEnc) : "",
  };
}

export async function getAccountPublic(clientId, id) {
  const snap = await col(clientId).doc(s(id)).get();
  return snap.exists ? toPublic({ id: snap.id, ...snap.data() }) : null;
}

export async function createAccount(clientId, input = {}) {
  const email = s(input.email);
  if (!email) return { ok: false, reason: "email_required" };
  // Privat ohne Inhaber gibt es nicht — sonst wäre das Konto für niemanden
  // sichtbar (oder schlimmer: für alle).
  const visibility = s(input.visibility).toLowerCase() === "private" ? "private" : "praxis";
  if (visibility === "private" && !s(input.ownerUserId)) return { ok: false, reason: "owner_required_for_private" };
  const ref = col(clientId).doc();
  const doc = {
    label: s(input.label) || email,
    email,
    active: bool(input.active, true),
    visibility,
    ownerUserId: s(input.ownerUserId),
    imap: {
      host: s(input.imap?.host),
      port: num(input.imap?.port, 993),
      secure: bool(input.imap?.secure, true),
      user: s(input.imap?.user) || email,
    },
    smtp: {
      host: s(input.smtp?.host),
      port: num(input.smtp?.port, 587),
      secure: bool(input.smtp?.secure, false),
      user: s(input.smtp?.user) || email,
    },
    imapPasswordEnc: input.imap?.password ? encryptSecret(input.imap.password) : "",
    smtpPasswordEnc: input.smtp?.password ? encryptSecret(input.smtp.password) : "",
    emailSignature: s(input.emailSignature),
    emailSignatureHtml: String(input.emailSignatureHtml || "").trim().slice(0, SIG_HTML_MAX),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastSyncAt: null,
    lastError: null,
  };
  await ref.set(doc);
  return { ok: true, account: toPublic({ id: ref.id, ...doc }) };
}

export async function updateAccount(clientId, id, input = {}) {
  const ref = col(clientId).doc(s(id));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const cur = snap.data();
  const patch = { updatedAt: FieldValue.serverTimestamp() };
  if (input.label != null) patch.label = s(input.label);
  if (input.email != null) patch.email = s(input.email);
  if (input.active != null) patch.active = bool(input.active, true);
  if (input.ownerUserId != null) patch.ownerUserId = s(input.ownerUserId);
  if (input.emailSignature != null) patch.emailSignature = s(input.emailSignature);
  if (input.emailSignatureHtml != null) patch.emailSignatureHtml = String(input.emailSignatureHtml).trim().slice(0, SIG_HTML_MAX);
  if (input.visibility != null) {
    patch.visibility = s(input.visibility).toLowerCase() === "private" ? "private" : "praxis";
    const owner = input.ownerUserId != null ? s(input.ownerUserId) : s(cur.ownerUserId);
    if (patch.visibility === "private" && !owner) return { ok: false, reason: "owner_required_for_private" };
  }
  if (input.imap) {
    patch.imap = {
      host: input.imap.host != null ? s(input.imap.host) : cur.imap?.host || "",
      port: input.imap.port != null ? num(input.imap.port, 993) : cur.imap?.port || 993,
      secure: input.imap.secure != null ? bool(input.imap.secure, true) : cur.imap?.secure !== false,
      user: input.imap.user != null ? s(input.imap.user) : cur.imap?.user || "",
    };
    if (input.imap.password) patch.imapPasswordEnc = encryptSecret(input.imap.password);
  }
  if (input.smtp) {
    patch.smtp = {
      host: input.smtp.host != null ? s(input.smtp.host) : cur.smtp?.host || "",
      port: input.smtp.port != null ? num(input.smtp.port, 587) : cur.smtp?.port || 587,
      secure: input.smtp.secure != null ? bool(input.smtp.secure, false) : cur.smtp?.secure === true,
      user: input.smtp.user != null ? s(input.smtp.user) : cur.smtp?.user || "",
    };
    if (input.smtp.password) patch.smtpPasswordEnc = encryptSecret(input.smtp.password);
  }
  await ref.update(patch);
  const after = await ref.get();
  return { ok: true, account: toPublic({ id: after.id, ...after.data() }) };
}

export async function deleteAccount(clientId, id) {
  await col(clientId).doc(s(id)).delete();
  return { ok: true };
}

export async function markSync(clientId, id, { error } = {}) {
  await col(clientId).doc(s(id)).update({
    lastSyncAt: Date.now(),
    lastError: error ? String(error) : null,
  }).catch(() => {});
}

/**
 * Persist the per-folder IMAP sync cursor: the server's UIDVALIDITY plus the
 * highest UID we have already stored. The next sync uses this to fetch ONLY
 * genuinely new mail (UID > lastUid) instead of re-downloading a whole window
 * every tick — the difference between "reloads everything from zero" and a
 * real mail client that only tops up. Changes UIDVALIDITY ⇒ the caller re-seeds.
 * Best-effort: a failed write just means the next tick re-seeds that folder
 * (idempotent via Message-ID, so no duplicates).
 */
export async function saveSyncState(clientId, id, folder, { uidValidity, lastUid } = {}) {
  // Firestore map keys must not contain . $ / [ ] # — the folder labels we use
  // ("INBOX", "Sent") are safe, but sanitise defensively for server sub-paths.
  const key = (s(folder) || "INBOX").replace(/[.$/[\]#]/g, "_");
  await col(clientId).doc(s(id)).set({
    syncState: { [key]: { uidValidity: uidValidity == null ? null : String(uidValidity), lastUid: Number(lastUid) || 0, at: Date.now() } },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }).catch(() => {});
}
