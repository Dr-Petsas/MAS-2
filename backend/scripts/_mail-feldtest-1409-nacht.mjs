import "dotenv/config";
import fs from "fs";
import nodemailer from "nodemailer";

const HTML = "C:/Users/Anmeldung2/.cursor/projects/f-pickadoc-live-base/agent-tools/feldtest-mail/bianca-feldtest-1409-nacht.html";
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
  "schonungslos zuerst: Alle neun Punkte von gestern Abend sind gebaut, getestet und seit 02:10 Uhr auf pickadoc1 live.",
  "Live-Abnahme gegen den deployten Container: 68/68 gruen, inkl. echter Audio-Strecke (Parakeet + Qwen). Anrufe/Sitzungen/Notizen auf 0.",
  "",
  "Schaetzung fuer morgen: ~80 % der Anrufer kommen bei den Kernaufgaben direkt ans Ziel, ~10 % enden in einer echten Rueckruf-Notiz, ~10 % scheitern hoerbar.",
  "Laufen alle drei Praxen gleichzeitig unter Volllast: eher 70 % (Risiko A).",
  "",
  "GEBAUT UND DEPLOYT",
  "1) Nikolaou raus aus der Buchung, ehrliche Ansage auch beim Verbinden (M2/M3).",
  "2+9) Verbinden nur MedDent Petsas/Patrikis; kein Rezeption/Mitarbeiter-Transfer; Thaler/Blessing verbinden nie (M4/M5/T2/B5).",
  "9) Fehlgeschlagenes Verbinden faellt nicht mehr auf 0 – dieselbe Sitzung geht weiter (Bruecke + Bianca).",
  "3) Oeffnungszeiten Thaler/Blessing aus den Standort-Einstellungen im Portal (T1/B1).",
  "5) Qwen-Ohr erreichbar (.173/.167), asynchroner Korrektor; Anrufliste zeigt je Zug Parakeet oder Qwen (Audio-Zug live: Parakeet gewinnt, Qwen 1,49 s spaeter wortgleich).",
  "6) Zahnpraxen: kein 116 117 (T3).",
  "7) MAS-Gedaechtnis fuer alle drei Mandanten geprueft (45/14/5 Reports) – kein Code noetig.",
  "8) Blessing: kein Zahn-Inhalt, Wache am Eingang und am Ausgang (B3/B6).",
  "+) Zusatzfund, kritisch, behoben: Thaler-Zahnreinigung waere in Eva Thalers Kalender gelandet (CF nennt den Prophylaxe-Kalender 'Franziska Schmidt'). Firestore-Name 'Prophylaxe' gewinnt jetzt.",
  "Suite 1606 gruen / 0 rot, prod_smoke gruen, Feldprobe 68/68 gegen den frisch gebauten Container.",
  "",
  "WAS MORGEN TROTZDEM DRAMATISCH SCHIEFGEHEN KANN",
  "A) Eine Grafikkarte fuer alles, nicht unter Last getestet: 35B-LLM + TTS + STT auf der 5090 (31,4/32,6 GB). Der TTS-Container hat EINEN Lock – drei parallele Anrufe warten aufeinander: Stille, Aussetzer, Auflegen. Keine Clara-Demos, kein Lena parallel; Praxen nicht zeitgleich starten.",
  "B) Verhoerer bei Namen am Telefon: Parakeet hoert zuerst, Qwen korrigiert nur den NAECHSTEN Zug. Buchstabier-Weg faengt es, kostet Zuege. Dev-Rechner muss an bleiben.",
  "C) Acht neue Waechter im enforce-Modus ohne Live-Stunde (Einwand, Eingehen, Frage-Gate, Anrede, Auto-Resume, Fach-Wache, Behandler-Sperre, Notdienst). Falsch-Positive moeglich. Rueckweg: .env-Schalter + Recreate (<5 min) oder Produktionsstand V2.3.",
  "D) Thaler-PZR -> Prophylaxe nur lesend bewiesen: erste echte PZR-Buchung im Kalender gegenpruefen.",
  "E) Thaler/Blessing verbinden nie (keine Weiterleitungen in der DB, gewollt). Aenderung im Portal beim Agenten, kein Deploy.",
  "F) Rueckruf-Notizen sind das Sicherheitsnetz – nur wenn pro Praxis jemand CallR/Notizen liest. Nach acht Stupsen legt Bianca freundlich auf und sichert das Anliegen als Notiz.",
  "",
  "DRINGEND VOR DEM ERSTEN ANRUF",
  "1. Dev-Rechner an (Qwen-Zweit-Ohr).",
  "2. Keine Clara-Demos / kein Lena parallel.",
  "3. Oeffnungszeiten der drei Standorte im Portal kontrollieren.",
  "4. Erste Zahnreinigungs-Buchung bei Thaler im Kalender gegenpruefen.",
  "5. Eine Person je Praxis fuer CallR und Notizen.",
  "6. Bei Stille/Aussetzern/Schleifen sofort melden (Uhrzeit + Praxis) – ich drossle oder rolle in fuenf Minuten auf V2.3 zurueck.",
  "",
  "Stand 14.09.2026 02:30, Deploy 02:10, Commit 8c96ca8, Rueckrollpunkt telefonki-produktionsstand-v2.3-2026-09-13",
  "",
  "Viele Gruesse",
  "Nadine / Pickadoc",
].join("\n");

const info = await transporter.sendMail({
  from: `"Nadine" <${user}>`,
  to: "development@pickadoc.de",
  cc: "dr.petsas@pickadoc.de",
  replyTo: user,
  subject: "Bianca Feldtest 14.09.: alles deployt, 68/68 live gruen – und was morgen trotzdem schiefgehen kann",
  text,
  html,
});
console.log("gesendet", info.messageId, "an development@pickadoc.de, cc dr.petsas@pickadoc.de, von", user);
