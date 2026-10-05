// Schickt das Screenvideo der Onboarding-Tour per Nadine-Mail.
//
//   Konten anzeigen:  node scripts/_tour-video-mailen.mjs
//   Senden:           node scripts/_tour-video-mailen.mjs --send --datei <pfad.mp4>
//                       [--an dr.petsas@pickadoc.de] [--konto <accountId>]
//                       [--betreff "..."] [--text-datei <notiz.txt>]
// MUSS als erstes stehen: firebase.js liest GOOGLE_APPLICATION_CREDENTIALS
// beim Import, und mailbox.js braucht MAIL_CRYPTO_KEY.
import "dotenv/config";
import admin from "../src/firebase.js";
import { listAccounts } from "../src/mail/accounts.js";
import { sendMail } from "../src/mail/mailbox.js";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

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
  console.log("\nZum Senden: --send --datei <pfad.mp4> [--konto <id>]");
  process.exit(0);
}

const datei = arg("datei");
if (!datei) {
  console.error("Bitte --datei <pfad.mp4> angeben.");
  process.exit(2);
}
const groesse = statSync(datei).size;
const mb = (groesse / 1048576).toFixed(1);
console.log(`Anhang: ${path.basename(datei)} (${mb} MB)`);
if (groesse > 22 * 1048576) {
  console.error("Der Anhang ist ueber 22 MB — bitte staerker komprimieren, sonst lehnen Mailserver ab.");
  process.exit(3);
}

const kontoId = arg("konto") || (konten && konten[0] && konten[0].id);
if (!kontoId) {
  console.error("Kein Mail-Konto gefunden.");
  process.exit(4);
}
const an = arg("an", "dr.petsas@pickadoc.de");
const betreff = arg("betreff", "Pickadoc Onboarding-Tour — Screenvideo der gefuehrten Kette");
const textDatei = arg("text-datei");
const text = textDatei
  ? readFileSync(textDatei, "utf8")
  : "Im Anhang das Screenvideo der gefuehrten Onboarding-Kette.";

const res = await sendMail(clientId, kontoId, {
  to: [an],
  subject: betreff,
  text,
  attachments: [
    {
      filename: path.basename(datei),
      contentType: "video/mp4",
      content: readFileSync(datei).toString("base64"),
    },
  ],
});
console.log("Ergebnis:", JSON.stringify(res));
process.exit(res && res.ok ? 0 : 1);
