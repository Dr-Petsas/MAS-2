import "dotenv/config";
import admin from "../src/firebase.js";
import { createAccount, listAccounts, updateAccount, getAccountWithSecrets, deleteAccount } from "../src/mail/accounts.js";

// Account CRUD with encryption-at-rest, isolated test tenant, cleaned up. Proves
// the public/list shape never leaks secrets and that stored passwords decrypt.

const TEST = "zzz-mas2-mail";
const db = admin.firestore();
let failed = 0;
const check = (c, m) => { console.log((c ? "  ok: " : "  FAIL: ") + m); if (!c) failed++; };

async function cleanup() {
  const snap = await db.collection("clients").doc(TEST).collection("mas_mail_accounts").get();
  const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref));
  if (snap.size) await b.commit();
}
await cleanup();

console.log("=== Mail-Konten (verschlüsselt) ===");

const created = await createAccount(TEST, {
  label: "Praxis Haupt",
  email: "praxis@example.de",
  imap: { host: "imap.example.de", port: 993, secure: true, user: "praxis@example.de", password: "imapGeheim1" },
  smtp: { host: "smtp.example.de", port: 587, secure: false, user: "praxis@example.de", password: "smtpGeheim2" },
});
check(created.ok, "Konto angelegt");
const id = created.account.id;
check(created.account.hasImapPassword && created.account.hasSmtpPassword, "Passwort-Status sichtbar");
check(!("imapPasswordEnc" in created.account) && !("password" in (created.account.imap || {})), "Public-Shape ohne Secrets");

// Raw Firestore doc: passwords must be encrypted, never clear.
const raw = (await db.collection("clients").doc(TEST).collection("mas_mail_accounts").doc(id).get()).data();
check(raw.imapPasswordEnc?.startsWith("v1:gcm:"), "IMAP-Passwort verschlüsselt gespeichert");
check(!JSON.stringify(raw).includes("imapGeheim1"), "Klartext-Passwort NICHT in Firestore");

const list = await listAccounts(TEST);
check(list.length === 1 && list[0].email === "praxis@example.de", "Liste enthält Konto");
check(!JSON.stringify(list).includes("Geheim"), "Liste leakt keine Secrets");

// Decrypt for internal IMAP/SMTP use.
const secrets = await getAccountWithSecrets(TEST, id);
check(secrets.imapPassword === "imapGeheim1" && secrets.smtpPassword === "smtpGeheim2", "Secrets entschlüsseln korrekt");

// Update only the SMTP password; IMAP password must stay intact.
await updateAccount(TEST, id, { smtp: { password: "smtpNeu3" } });
const after = await getAccountWithSecrets(TEST, id);
check(after.smtpPassword === "smtpNeu3", "SMTP-Passwort aktualisiert");
check(after.imapPassword === "imapGeheim1", "IMAP-Passwort unverändert");

await deleteAccount(TEST, id);
check((await listAccounts(TEST)).length === 0, "Konto gelöscht");

await cleanup();
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
