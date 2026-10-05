// Einmal-Versand: Kernel-Fix-Plan (Waechter/Ohr/Talk) an Kiriakos.
// Gleicher SMTP-Weg wie _mail-clip-dtmf-plan.mjs. Nie Passwoerter loggen.
import "dotenv/config";
import fs from "fs";
import nodemailer from "nodemailer";

const PLAN = "F:/Bianca&Lisa TelefonKI/FABLE5-KERNEL-FIX.md";
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
  "naechstes Stueck fuer deinen Cursor (Fable 5) — getrennt vom CLIP/DTMF-",
  "Auftrag und getrennt vom Zaluma-Transfer. Wieder nur Bianca eingehend",
  "(8096). Nichts pullen, nichts pushen: Chef-Baum und dein Baum sind",
  "getrennt. Diesen Plan von Hand nachziehen.",
  "",
  "Was vorher passiert ist: alle Funktionen aus dem Dock-Overlay",
  "\"Das kann ich\" gegen Code + letzten Live-Anruf (12c0c66e, 17:53)",
  "geprueft. Buchen, Absage, Verschieben, Akte, Versicherung, Readback,",
  "Kartei, Gedaechtnis: gesund, wenn STT sauber ist. Krank waren drei",
  "Dinge, die Bianca \"komisch\" haben wirken lassen:",
  "",
  "  1) Wiederholungs-Waechter nur wortgleich → bis 6x Handynummer.",
  "  2) Parakeet ohne Ziffern → telefonOk bleibt false → Schleife.",
  "  3) Talk erfindet Schicht / noch im Haus / Mo-Fr; Datum als",
  "     \"dreissigsten\"; Termin-Bruecke nach jedem Smalltalk.",
  "",
  "Kernel ist beim Chef lokal gefixt. Offline-Tests: 558 gruen, 0 rot",
  "(tests\\\\lauf_alle.py). Kein meddent-oeffnung erfunden. CLIP/DTMF und",
  "Weiterleiten bewusst nicht angefasst — das bleibt bei dir.",
  "",
  "Der vollstaendige Auftrag (Audit, Datei fuer Datei, Fallstricke,",
  "Tests, Live-Abnahme A-G) steht unten und versioniert im Chef-Repo:",
  "  F:\\Bianca&Lisa TelefonKI\\FABLE5-KERNEL-FIX.md",
  "",
  "Bitte kurze Rueckmail: Testzahl, welche Dateien du angefasst hast,",
  "welche Live-Faelle A-G du gehoert hast. Zugangsdaten nicht per Mail.",
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
  subject: "Bianca: Kernel-Fixes nach Funktions-Audit — Auftrag fuer Fable 5 (kein Push, kein Transfer)",
  text,
});
console.log("gesendet:", info.messageId, "->", AN);
