// Einmal-Werkzeug (24.08.2026): Die Erlebnis-Demo (demo-mas) scheitert beim
// SMTP-Login mit den kopierten .env-Zugangsdaten. Hier holen wir die
// FUNKTIONIERENDEN SMTP-Daten aus dem verschluesselten Nadine-Mailkonto
// (Firestore, MAIL_CRYPTO_KEY) und zeigen Host/Port/User + Passwort-Laenge,
// damit die demo-mas-.env korrigiert werden kann. Passwort selbst wird nur
// auf Wunsch (--zeig) ausgegeben.
import "dotenv/config";
import "../src/firebase.js";
import { listAccounts, getAccountWithSecrets } from "../src/mail/accounts.js";

const clientId = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const konten = await listAccounts(clientId);
for (const k of konten || []) {
  const voll = await getAccountWithSecrets(clientId, k.id);
  console.log(JSON.stringify({
    id: k.id,
    email: voll.email || "",
    smtpHost: voll.smtp?.host || "",
    smtpPort: voll.smtp?.port || 0,
    smtpSecure: voll.smtp?.secure === true,
    smtpUser: voll.smtp?.user || "",
    passLaenge: (voll.smtpPassword || "").length,
    pass: process.argv.includes("--zeig") ? voll.smtpPassword : "(verdeckt)",
  }));
}
process.exit(0);
