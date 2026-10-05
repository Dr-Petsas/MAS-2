// Einmal-Versand: Wartelisten-Auftrag an Kiriakos, Kopie an Dr. Petsas.
// Gleicher SMTP-Weg wie _mail-kernel-fix-plan.mjs. Nie Passwoerter loggen.
import "dotenv/config";
import fs from "fs";
import nodemailer from "nodemailer";

const HTML = "F:/Bianca&Lisa TelefonKI/docs/mails/warteliste-auftrag-kiriakos-2026-09-25.html";
const TEXT = "F:/Bianca&Lisa TelefonKI/docs/mails/warteliste-auftrag-kiriakos-2026-09-25.md";
const AN = "development@pickadoc.de";
const CC = "dr.petsas@pickadoc.de";

const user = process.env.NADINE_MAIL_USER || "Nadine@pickadoc.de";
const host = process.env.NADINE_SMTP_HOST || "smtp.strato.de";
const passes = [];
for (const p of [process.env.NADINE_SMTP_PASS, process.env.NADINE_IMAP_PASS,
  ...String(process.env.MAIL_WATCH_PASSWORDS || "").split(";")]) {
  const s = String(p || "").trim();
  if (s && !passes.includes(s)) passes.push(s);
}
if (!passes.length) {
  console.error("kein SMTP-Passwort in .env");
  process.exit(1);
}

let transporter = null;
for (const pass of passes) {
  for (const opt of [
    { host, port: 465, secure: true, auth: { user, pass } },
    { host, port: 587, secure: false, requireTLS: true, auth: { user, pass } },
  ]) {
    const t = nodemailer.createTransport(opt);
    try {
      await t.verify();
      transporter = t;
      console.log("smtp-ok", opt.port);
      break;
    } catch (err) {
      console.log("smtp-try-fail", opt.port, String(err?.responseCode || err?.code || "err"));
    }
  }
  if (transporter) break;
}
if (!transporter) {
  console.error("SMTP-Anmeldung fehlgeschlagen");
  process.exit(1);
}

const html = fs.readFileSync(HTML, "utf8");
const plan = fs.readFileSync(TEXT, "utf8");
const subject = "Blessing: Warteliste fuer ferne Termine — Auftrag, nur E-Mail, Bianca noch nicht";
const text = [
  "Hallo Kiriakos,",
  "",
  "bei Doktor Blessing legen fast 80 Prozent waehrend der Terminbuchung auf,",
  "weil der frueheste Termin oft erst in vier Monaten liegt. Der Kunde verliert",
  "Neupatienten. Das ist fuer Pickadoc gerade ein Kuendigungsgrund.",
  "",
  "Bitte die Warteliste in Pickadoc bauen (F:\\pickadoc-live-base).",
  "Bianca in diesem Auftrag nicht anfassen. Nur E-Mail, keine SMS.",
  "Die vollstaendige Bauanleitung fuer Cursor/Grok steht unten und als HTML.",
  "",
  "Ich brauche danach eine Rueckmail mit den genauen Anschlussdaten,",
  "damit wir Bianca darauf ausrichten koennen.",
  "",
  "Viele Gruesse",
  "Dr. Petsas",
  "Pickadoc",
  "",
  "=".repeat(72),
  "",
  plan,
].join("\n");

const info = await transporter.sendMail({
  from: `"Pickadoc" <${user}>`,
  to: AN,
  cc: CC,
  replyTo: "dr.petsas@pickadoc.de",
  subject,
  text,
  html,
});
console.log("gesendet", info.messageId, "an", AN, "cc", CC);
