// Einmal-Versand: CLIP/DTMF-Plan an Kiriakos (development@pickadoc.de).
// Gleicher SMTP-Weg wie _mail-zaluma-plan.mjs. Nie Passwoerter loggen.
import "dotenv/config";
import fs from "fs";
import nodemailer from "nodemailer";

const PLAN = "F:/Bianca&Lisa TelefonKI/CLIP-DTMF-PLAN.md";
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
  "naechstes Stueck fuer deinen Cursor (Fable 5), auf dem Zaluma-Anschlussplan",
  "aufsetzend — nur Bianca eingehend (8096). Weiterleiten/Transfer bleibt",
  "ausdruecklich draussen.",
  "",
  "Problem: Bianca versteht gesprochene Handynummern oft nicht und fragt bis",
  "zu 6x nach. Loesung: zuerst die Anrufernummer aus dem SIP-From (CLIP),",
  "einmal fragen ob die SMS dahin soll; sonst die Nummer per DTMF ins Telefon",
  "tippen (# = fertig, * = von vorn). Diktat nur noch Notnagel.",
  "",
  "Der vollstaendige Auftrag mit Vertrag, Dateien, Reihenfolge und Abnahme",
  "steht unten und versioniert im Repo:",
  "  F:\\Bianca&Lisa TelefonKI\\CLIP-DTMF-PLAN.md",
  "",
  "Bitte kurze Rueckmail, ob der Vertrag so passt (callerPhone am /api/start",
  "+ POST /api/dtmf). Zugangsdaten bitte NICHT per Mail.",
  "",
  "Viele Gruesse",
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
  subject: "Bianca: CLIP zuerst, sonst DTMF — Auftrag fuer Fable 5 (kein Transfer)",
  text,
});
console.log("gesendet:", info.messageId, "->", AN);
