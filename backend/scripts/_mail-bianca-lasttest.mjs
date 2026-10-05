import "dotenv/config";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

const DIR = "C:/Users/Anmeldung2/.cursor/projects/f-pickadoc-live-base/agent-tools/lasttest-mail";
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

const html = fs.readFileSync(path.join(DIR, "bianca-lasttest.html"), "utf8");
const subject = "Bianca Lasttest: 12 parallel sind zu viel — Empfehlung 2–3, Zielsetup 8";
const to = ["development@pickadoc.de", "dr.petsas@pickadoc.de"];
const images = [
  ["linien-antwort.png", "linien-antwort"],
  ["stroeme-p95.png", "stroeme-p95"],
  ["kurve-n.png", "kurve-n"],
  ["kapazitaet.png", "kapazitaet"],
];

const info = await transporter.sendMail({
  from: `"Pickadoc Entwicklung" <${user}>`,
  to,
  replyTo: user,
  subject,
  html,
  attachments: images.map(([file, cid]) => ({
    filename: file,
    path: path.join(DIR, file),
    cid,
    contentType: "image/png",
  })),
});
console.log("gesendet", info.messageId, "an", to.join(", "));
