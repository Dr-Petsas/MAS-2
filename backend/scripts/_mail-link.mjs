// Schickt eine kurze Text-Mail (z. B. einen Link) ueber die Nadine-Postfaecher.
//
// Schwester von _tour-video-mailen.mjs, das einen Anhang VERLANGT. Fuer
// "hier ist der Link" braucht man keinen Anhang, und ein 22-MB-Video als
// Traeger fuer eine URL waere albern.
//
//   Konten anzeigen:  node scripts/_mail-link.mjs
//   Senden:           node scripts/_mail-link.mjs --send --betreff "..." --text "..."
//                       [--an dr.petsas@pickadoc.de] [--konto <accountId>]
//                       [--text-datei <notiz.txt>]
//
// MUSS als erstes stehen: firebase.js liest GOOGLE_APPLICATION_CREDENTIALS
// beim Import, und mailbox.js braucht MAIL_CRYPTO_KEY.
import "dotenv/config";
import admin from "../src/firebase.js";
import { listAccounts } from "../src/mail/accounts.js";
import { sendMail } from "../src/mail/mailbox.js";
import { readFileSync } from "node:fs";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (n) => process.argv.includes(`--${n}`);

const clientId = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const konten = await listAccounts(clientId);

if (!has("send")) {
  console.log("Client:", clientId);
  console.log("Mail-Konten:");
  (konten || []).forEach((a) =>
    console.log(`  id=${a.id}  ${a.email || "(keine Adresse)"}  ${a.label || ""}  smtp=${a.smtp?.host || "-"}`),
  );
  console.log('\nZum Senden: --send --betreff "..." --text "..." [--an ...] [--konto <id>]');
  process.exit(0);
}

const kontoId = arg("konto") || (konten && konten[0] && konten[0].id);
if (!kontoId) {
  console.error("Kein Mail-Konto gefunden.");
  process.exit(4);
}

const an = arg("an", "dr.petsas@pickadoc.de");
const betreff = arg("betreff");
if (!betreff) {
  console.error("Bitte --betreff angeben.");
  process.exit(2);
}
const textDatei = arg("text-datei");
const text = textDatei ? readFileSync(textDatei, "utf8") : arg("text");
if (!text) {
  console.error("Bitte --text oder --text-datei angeben.");
  process.exit(2);
}

const res = await sendMail(clientId, kontoId, { to: [an], subject: betreff, text });
console.log("Ergebnis:", JSON.stringify(res));
process.exit(res && res.ok ? 0 : 1);
