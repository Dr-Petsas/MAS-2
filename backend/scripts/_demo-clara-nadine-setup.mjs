// Einmal-Hilfe: Clara-Tour-Audios (ElevenLabs, Claras Stimme) + zwei Demo-Mails
// an Nadine@pickadoc.de. Liest Secrets nur aus backend/.env bzw. Clara-Voice/.env.
// Nie Passwoerter loggen.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

const here = path.dirname(fileURLToPath(import.meta.url));
const masEnv = path.join(here, "..", ".env");
const claraEnv = "F:/Clara-Voice/.env";
const audioDir = "F:/pickadoc-live-base/demo-erleben/assets/clara";
const maikPng = "F:/pickadoc-live-base/demo-erleben/assets/nadine/maik.png";
const VOICE_ID = "cgSgspJ2msm6clMCkdW9";

const CLIPS = [
  {
    file: "tour-willkommen.mp3",
    text:
      "Ich bin Clara, Ihre interne Sprach-Assistentin. Ich fange mit dem an, was Ihnen im Alltag am meisten Zeit spart: das Briefing zum nächsten Patienten, das Füllen von Terminlücken und die papierlose Post.",
  },
  {
    file: "tour-live-demo.mp3",
    text: "Im Live-Demo-Modus können Sie ein echtes Gespräch mit mir führen.",
  },
];

function loadEnvFile(p, into) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (into[k] == null || into[k] === "") into[k] = v;
  }
}

function env() {
  const e = { ...process.env };
  loadEnvFile(masEnv, e);
  loadEnvFile(claraEnv, e);
  return e;
}

async function synthClip(key, clip) {
  const out = path.join(audioDir, clip.file);
  if (fs.existsSync(out) && fs.statSync(out).size > 800) {
    console.log("audio-exists", clip.file);
    return true;
  }
  if (!key) {
    console.log("audio-skip-no-key", clip.file);
    return false;
  }
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": key,
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: clip.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
      }),
    }
  );
  if (!resp.ok) {
    console.log("audio-fail", clip.file, resp.status);
    return false;
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (!buf.length) return false;
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(out, buf);
  console.log("audio-ok", clip.file, buf.length);
  return true;
}

async function sendMails(e) {
  const user = e.NADINE_MAIL_USER || "Nadine@pickadoc.de";
  const host = e.NADINE_SMTP_HOST || "smtp.strato.de";
  const passes = [];
  const addPass = (p) => {
    const s = String(p || "").trim();
    if (s && !passes.includes(s)) passes.push(s);
  };
  addPass(e.NADINE_SMTP_PASS);
  addPass(e.NADINE_IMAP_PASS);
  String(e.MAIL_WATCH_PASSWORDS || "").split(";").forEach(addPass);
  if (!passes.length) {
    console.log("mail-skip-no-pass");
    return false;
  }
  const attempts = [];
  for (const pass of passes) {
    attempts.push({ host, port: 465, secure: true, auth: { user, pass } });
    attempts.push({ host, port: 587, secure: false, requireTLS: true, auth: { user, pass } });
  }
  let transporter = null;
  for (const opt of attempts) {
    const t = nodemailer.createTransport(opt);
    try {
      await t.verify();
      transporter = t;
      console.log("smtp-ok", opt.port, opt.secure ? "ssl" : "starttls");
      break;
    } catch (err) {
      console.log("smtp-try-fail", opt.port, String(err && err.responseCode ? err.responseCode : err && err.code ? err.code : "err"));
    }
  }
  if (!transporter) {
    console.log("mail-skip-smtp-auth");
    return false;
  }
  const mail1 = {
    from: `"Scan-Service Hauspost" <${user}>`,
    to: user,
    subject: "Keine Hauspost mehr — Digitalisierung des physischen Posteingangs",
    text: [
      "Guten Tag,",
      "",
      "in der Praxis kommen keine echten Briefe mehr an.",
      "",
      "Über einen Scanservice — zum Beispiel den der Post — landen frühere Papierbriefe als Scan direkt bei Nadine. Antworten sind blitzschnell geschrieben.",
      "",
      "*separat zu buchen",
      "",
      "Mit freundlichen Grüßen",
    ].join("\n"),
  };
  const mail2 = {
    from: `"Praxis-Team" <${user}>`,
    to: user,
    subject: "MISSING: Postbote vermisst",
    text: [
      "Guten Tag,",
      "",
      "keine Briefe, kein Postbote.",
      "",
      "Wir vermissen Maik, unseren jahrelangen Postboten, seit wir keine Briefe mehr postalisch empfangen.",
      "",
      "Ein Bild von Maik liegt bei.",
      "",
      "Herzliche Grüße",
    ].join("\n"),
    attachments: fs.existsSync(maikPng)
      ? [{ filename: "maik.png", content: fs.readFileSync(maikPng), contentType: "image/png" }]
      : [],
  };
  try {
    await transporter.sendMail(mail1);
    console.log("mail1-ok");
  } catch (err) {
    console.log("mail1-fail", String(err && err.message ? err.message : err));
    return false;
  }
  try {
    await transporter.sendMail(mail2);
    console.log("mail2-ok");
  } catch (err) {
    console.log("mail2-fail", String(err && err.message ? err.message : err));
    return false;
  }
  return true;
}

const e = env();
const key = e.ELEVENLABS_API_KEY || "";
for (const clip of CLIPS) {
  await synthClip(key, clip);
}
await sendMails(e);
