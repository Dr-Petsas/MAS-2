import "dotenv/config";
import fs from "fs";
import nodemailer from "nodemailer";

const HTML = "C:/Users/Anmeldung2/.cursor/projects/f-pickadoc-live-base/agent-tools/feldtest-mail/bianca-feldtest-fable51.html";
const html = fs.readFileSync(HTML, "utf8");
const user = process.env.NADINE_MAIL_USER || "Nadine@pickadoc.de";
const host = process.env.NADINE_SMTP_HOST || "smtp.strato.de";
const passes = [];
for (const p of [
  process.env.NADINE_SMTP_PASS,
  process.env.NADINE_IMAP_PASS,
  ...String(process.env.MAIL_WATCH_PASSWORDS || "").split(";"),
]) {
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

const text = [
  "Hallo Kiriakos,",
  "",
  "Schonungslose Antwort zuerst: Nein, fuer 100 Prozent Abschluesse bei den Aufgaben 1 bis 4 ist Bianca heute Abend nicht aufgestellt.",
  "",
  "Annahme: MedDent (4101/4110), Blessing (4120), Thaler (4105).",
  "",
  "KRITISCH",
  "1) Blessing-Dokumentvortrag laeuft in allen Praxen. Rezept/Ueberweisung/Befund/Roentgen stoppen die Buchung und hinterlassen keine Notiz.",
  "2) Intent: Ueberweisung gilt als Rueckruf und schlaegt den Terminwunsch.",
  "3) Blessing: 'dringend' ohne Symptom wird zum Notfall und toetet die Buchung.",
  "",
  "HOCH",
  "4) Ein TTS-Lock fuer alle Stimmen — Feldtests staffeln, keine Clara-Demos.",
  "5) Durchstellen haengt an DB-Weiterleitungen. Blessing/Thaler lokal leer.",
  "6) Thaler PZR-Kalender: Name in der DB pruefen (Franziska Schmidt vs. Prophylaxe).",
  "",
  "MITTEL",
  "7) EINWAND=shadow fuer den Testtag empfohlen.",
  "8) Notleine nach 6 Stupsen — ggf. auf 10 heben.",
  "9) EINGEHEN-Praefixe nicht vorgewaermt.",
  "10) Zahnpraxen: kein deterministischer Notdienst ausserhalb der Sprechzeit.",
  "11) Pro Praxis eine Person, die Notizen/CallR liest.",
  "",
  "Reihenfolge: 1+2 fixen, dann 3, dann 7/8 entscheiden, dann Deploy V2.3, dann Portal-Checks.",
  "",
  "Viele Gruesse",
  "Nadine / Pickadoc",
].join("\n");

const info = await transporter.sendMail({
  from: `"Nadine" <${user}>`,
  to: "dr.petsas@pickadoc.de",
  replyTo: user,
  subject: "Bianca Feldtest morgen: noch nicht auf 100 Prozent — drei Codefehler vor den Praxen",
  text,
  html,
});
console.log("gesendet", info.messageId, "an dr.petsas@pickadoc.de von", user);
