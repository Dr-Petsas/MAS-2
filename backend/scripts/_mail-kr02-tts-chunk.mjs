// Einmal-Versand: Auftrag "TTS auf Kr02 — erster Ton frueher" an Kiriakos.
// Gleicher SMTP-Weg wie _mail-kernel-fix-plan.mjs. Nie Passwoerter loggen.
import "dotenv/config";
import fs from "fs";
import nodemailer from "nodemailer";

const PLAN = "F:/Clara-Mini/docs/AUFTRAG-KR02-TTS.md";
const AN = "development@pickadoc.de";

const user = process.env.NADINE_MAIL_USER || "Nadine@pickadoc.de";
const host = process.env.NADINE_SMTP_HOST || "smtp.strato.de";
const passes = [];
for (const p of [process.env.NADINE_SMTP_PASS, process.env.NADINE_IMAP_PASS,
  ...String(process.env.MAIL_WATCH_PASSWORDS || "").split(";")]) {
  const s = String(p || "").trim();
  if (s && !passes.includes(s)) passes.push(s);
}
if (!passes.length) { console.error("kein SMTP-Passwort in .env"); process.exit(1); }

let transporter = null;
for (const pass of passes) {
  for (const opt of [
    { host, port: 465, secure: true, auth: { user, pass } },
    { host, port: 587, secure: false, requireTLS: true, auth: { user, pass } },
  ]) {
    const t = nodemailer.createTransport(opt);
    try { await t.verify(); transporter = t; console.log("smtp-ok", opt.port); break; }
    catch (err) { console.log("smtp-try-fail", opt.port, String(err?.responseCode || err?.code || "err")); }
  }
  if (transporter) break;
}
if (!transporter) { console.error("SMTP-Anmeldung fehlgeschlagen"); process.exit(1); }

const plan = fs.readFileSync(PLAN, "utf8");

const text = [
  "Hallo Kiriakos,",
  "",
  "ein kleiner Auftrag für deinen KI-Agenten, Prio 1 beim Chef: die neue Clara",
  "(Mini-Clara) soll schneller antworten, und der größte Posten ist der erste Ton",
  "des TTS-Dienstes auf Kr02 (0,43 s, nach Leerlauf bis 0,77 s).",
  "",
  "Zwei Dinge auf Kr02, an das ich nur über den TTS-Port herankomme:",
  "",
  "  1) /speak-stream bekommt ein optionales Feld chunk (vier Stellen in",
  "     tts_serve/qwen3/server.py, Diff unten). Ohne das Feld ändert sich nichts,",
  "     also auch nichts für Bianca, Lisa und die Live-Clara.",
  "  2) Energiemodus der 4070 so stellen, dass sie im Leerlauf nicht heruntertaktet.",
  "",
  "Erwartung: erstes Audio nach etwa 0,12 s statt 0,43 s. Das ist hochgerechnet,",
  "nicht gemessen — deshalb bitte messen und gegenhören, ob kleine Stücke sauber",
  "klingen (Abnahme unten).",
  "",
  "Der Text unter der Linie ist der vollständige Auftrag zum Weitergeben an den",
  "Agenten. Am Ende steht außerdem, was heute sonst auf pickadoc1 und",
  "asterisk-live geändert wurde.",
  "",
  "Viele Grüße",
  "Dr. Petsas / PickaDoc-Entwicklung",
  "",
  "=".repeat(72),
  "",
  plan,
].join("\n");

const info = await transporter.sendMail({
  from: `"PickaDoc Entwicklung" <${user}>`,
  to: AN,
  replyTo: user,
  subject: "TTS auf Kr02: erster Ton früher (chunk in /speak-stream + Energiemodus) — Auftrag für deinen Agenten",
  text,
});
console.log("gesendet:", info.messageId, "->", AN);
