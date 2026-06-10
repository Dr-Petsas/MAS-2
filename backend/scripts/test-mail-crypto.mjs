import "dotenv/config";
import { encryptSecret, decryptSecret, isEncrypted, maskSecret } from "../src/mail/crypto.js";
import { normalizeThreadToken } from "../src/mail/mailbox.js";

let failed = 0;
const check = (c, m) => { console.log((c ? "  ok: " : "  FAIL: ") + m); if (!c) failed++; };

console.log("=== Mail-Crypto & Threading ===");

const secret = "S3hr-Geh3im!ßä#";
const enc = encryptSecret(secret);
check(enc && enc.startsWith("v1:gcm:"), "Token hat erwartetes Format");
check(enc !== secret && !enc.includes(secret), "Klartext nicht im Token enthalten");
check(isEncrypted(enc), "isEncrypted erkennt Token");
check(decryptSecret(enc) === secret, "Round-Trip stellt Klartext wieder her");
check(encryptSecret("") === "", "Leerer Wert bleibt leer");
check(maskSecret(secret) === "••••••••" && maskSecret("") === "", "Maskierung korrekt");

// Two encryptions of the same secret differ (random IV) but both decrypt back.
const enc2 = encryptSecret(secret);
check(enc2 !== enc, "Zwei Verschlüsselungen unterscheiden sich (IV)");
check(decryptSecret(enc2) === secret, "Zweiter Token entschlüsselt ebenfalls");

// Tamper detection: flip a char in the ciphertext.
const parts = enc.split(":");
parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith("A") ? "BB" : "AA");
let tampered = false;
try { decryptSecret(parts.join(":")); } catch { tampered = true; }
check(tampered, "Manipulation wird erkannt (GCM-Tag)");

// Threading token normalization.
check(normalizeThreadToken("  <abc@x>  ") === "<abc@x>", "Thread-Token getrimmt");
check(normalizeThreadToken("Re: <id@host> text") === "<id@host>", "Message-ID aus Text extrahiert");
check(normalizeThreadToken("") === "", "Leerer Token bleibt leer");

console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
