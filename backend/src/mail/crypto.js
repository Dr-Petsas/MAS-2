import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Credential encryption for mail accounts. Passwords are NEVER stored in clear:
// we keep host/user/email readable but encrypt the secret with AES-256-GCM
// (authenticated, so tampering is detected on decrypt). The 32-byte key comes
// from MAIL_CRYPTO_KEY (64 hex chars or base64). A practice's mail password is
// sensitive PII-adjacent data; this keeps it safe at rest in Firestore.

const PREFIX = "v1:gcm";

let cachedKey = null;

function loadKey() {
  if (cachedKey) return cachedKey;
  const raw = (process.env.MAIL_CRYPTO_KEY || "").trim();
  if (!raw) {
    throw new Error("MAIL_CRYPTO_KEY missing — set a 32-byte key (64 hex chars or base64) to use the mail client.");
  }
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    const b = Buffer.from(raw, "base64");
    // Exactly 32 bytes -> use directly; otherwise derive deterministically.
    key = b.length === 32 ? b : scryptSync(raw, "mas2-mail-kdf", 32);
  }
  if (key.length !== 32) throw new Error("MAIL_CRYPTO_KEY must resolve to 32 bytes.");
  cachedKey = key;
  return key;
}

/** Encrypt a secret string. Returns a self-describing token (safe to store). */
export function encryptSecret(plain) {
  const text = plain == null ? "" : String(plain);
  if (!text) return "";
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

/** Decrypt a token produced by encryptSecret. Throws if tampered/wrong key. */
export function decryptSecret(blob) {
  const token = (blob || "").toString();
  if (!token) return "";
  const parts = token.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== PREFIX) {
    throw new Error("Unrecognised secret format.");
  }
  const [, , ivB64, tagB64, ctB64] = parts;
  const key = loadKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/** True if a value looks like one of our encrypted tokens. */
export function isEncrypted(blob) {
  const t = (blob || "").toString();
  return t.startsWith(PREFIX + ":") && t.split(":").length === 5;
}

/** Masked form for display/logs: keep nothing of the secret, just signal presence. */
export function maskSecret(plain) {
  return plain ? "••••••••" : "";
}
