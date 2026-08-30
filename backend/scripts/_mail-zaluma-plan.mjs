// Einmal-Versand (30.08.2026): Zaluma-Anschlussplan an Kiriakos
// (development@pickadoc.de). Liest den Plan aus dem Telefon-KI-Repo und
// verschickt ihn ueber das Nadine-Postfach (Strato). Nie Passwoerter loggen.
import "dotenv/config";
import fs from "fs";
import nodemailer from "nodemailer";

const PLAN = "F:/Bianca&Lisa TelefonKI/ZALUMA-ANSCHLUSSPLAN.md";
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
  "wir haben heute ElevenLabs komplett abgeloest: Alle Agenten (Clara, Lena,",
  "Bianca, Lisa) sprechen ab sofort ueber unsere eigene TTS-Strecke",
  "(Qwen3-Container auf der 5090). Offen ist nur noch die Telefonie - und da",
  "kommst du ins Spiel: die Zaluma-Anbindung an unseren eigenen Telefon-Stack.",
  "",
  "Unten findest du den vollstaendigen Anschlussplan mit ausnahmslos allen",
  "Stellen (Datei + Zeile), damit dein Cursor die Zaluma-Verbindungen nahtlos",
  "herstellen kann. Das Dokument liegt zusaetzlich versioniert im Repo:",
  "  F:\\Bianca&Lisa TelefonKI\\ZALUMA-ANSCHLUSSPLAN.md",
  "",
  "Eine Bitte: Melde dich kurz per Rueckmail, ob der Plan fuer dich so passt",
  "und wann du loslegst - wir halten dann hier das Zeitfenster frei und",
  "testen jede Stufe sofort gegen (Abnahme-Reihenfolge steht in Abschnitt 8).",
  "Zugangsdaten bitte wie besprochen NICHT per Mail schicken.",
  "",
  "Danke dir und viele Gruesse aus der Praxis",
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
  subject: "Zaluma-Anbindung Telefon-KI: Anschlussplan mit allen Stellen - bitte kurze Rueckmeldung",
  text,
});
console.log("gesendet:", info.messageId, "->", AN);
