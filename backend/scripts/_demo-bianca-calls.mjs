// Bianca-Demo-Audios: Dialoge als eine Datei (Bianca + Patient), Secrets nur aus .env.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const masEnv = path.join(here, "..", ".env");
const outDir = "F:/pickadoc-live-base/demo-erleben/assets/bianca";
const BIANCA_VOICE = "cgSgspJ2msm6clMCkdW9";
const PATIENT_W = { f: "EXAVITQu4vr4xnSDxMaL", m: "CwhRBWXzGAHq8TQ4Fs17" };

const CALLS = [
  {
    id: "maria",
    sex: "f",
    turns: [
      ["b", "Musterpraxis, hier ist Bianca. Wie kann ich Ihnen helfen?"],
      ["p", "Hallo, hier ist Maria Vogel. Findet meine PZR heute um fünfzehn Uhr statt?"],
      ["b", "Ja, Frau Vogel, Ihre professionelle Zahnreinigung ist heute um fünfzehn Uhr bei Dr. Berg."],
      ["p", "Super, dann komme ich pünktlich. Danke!"],
      ["b", "Gerne. Bis nachher."],
    ],
  },
  {
    id: "erik",
    sex: "m",
    force: true,
    turns: [
      ["b", "Musterpraxis, Bianca am Apparat."],
      ["p", "Guten Tag, Erik Braun. Ich habe am Freitag die Implantat-Operation. Muss ich nüchtern kommen?"],
      ["b", "Guten Tag, Herr Braun. Bitte frühstücken Sie leicht. Die Behandlung läuft in örtlicher Betäubung. Um halb elf bei Dr. Berg."],
      ["p", "Alles klar, danke."],
      ["b", "Gern. Wir freuen uns auf Sie."],
    ],
  },
  {
    id: "julia",
    sex: "f",
    force: true,
    turns: [
      ["b", "Musterpraxis, hier ist Bianca."],
      ["p", "Julia Seidel. Kann ich meinen Schienen-Termin vom Dienstag auf den Donnerstag legen?"],
      ["b", "Einen Moment. Ja, am Donnerstag um vierzehn Uhr ist frei. Ich trage das um."],
      ["p", "Perfekt, vielen Dank."],
      ["b", "Gern geschehen, Frau Seidel."],
    ],
  },
  {
    id: "paul",
    sex: "m",
    turns: [
      ["b", "Musterpraxis, Bianca."],
      ["p", "Paul Hartmann. Ich sitze im Wartezimmer. Kann ich mich für die Kontrolle um halb zwölf einchecken?"],
      ["b", "Ja, Herr Hartmann, ich habe Sie gesehen. Bitte bleiben Sie sitzen, wir holen Sie gleich."],
      ["p", "Danke."],
      ["b", "Bitte."],
    ],
  },
  {
    id: "jan",
    sex: "m",
    turns: [
      ["b", "Musterpraxis, hier ist Bianca. Wie kann ich helfen?"],
      ["p", "Jan Krüger. Ich wollte meinen Beratungstermin morgen um halb zehn bestätigen."],
      ["b", "Ist notiert, Herr Krüger. Morgen früh um halb zehn bei Dr. Berg."],
      ["p", "Sehr gut. Bis morgen."],
      ["b", "Bis morgen."],
    ],
  },
];

function loadEnv(p, into) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (into[k] == null || into[k] === "") into[k] = v;
  }
}

async function tts(key, voice, text) {
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": key, accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.45, similarity_boost: 0.75 },
      }),
    }
  );
  if (!resp.ok) throw new Error("tts " + resp.status);
  return Buffer.from(await resp.arrayBuffer());
}

const e = { ...process.env };
loadEnv(masEnv, e);
const key = e.ELEVENLABS_API_KEY || "";
if (!key) {
  console.log("skip-no-key");
  process.exit(0);
}
fs.mkdirSync(outDir, { recursive: true });
for (const call of CALLS) {
  const dest = path.join(outDir, call.id + ".mp3");
  if (!call.force && fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
    console.log("exists", call.id);
    continue;
  }
  const chunks = [];
  let sec = 0;
  const times = [];
  for (const [wer, text] of call.turns) {
    times.push(Math.round(sec));
    const voice = wer === "b" ? BIANCA_VOICE : PATIENT_W[call.sex];
    const buf = await tts(key, voice, text);
    chunks.push(buf);
    sec += buf.length / 16000;
  }
  fs.writeFileSync(dest, Buffer.concat(chunks));
  console.log("ok", call.id, fs.statSync(dest).size, times.join(","));
}

const lisaDir = "F:/pickadoc-live-base/demo-erleben/assets/lisa";
const LISA = [
  {
    id: "erik",
    sex: "m",
    force: true,
    turns: [
      ["b", "Guten Tag, Herr Braun, hier ist Lisa von der Musterpraxis."],
      ["p", "Ja, hallo?"],
      ["b", "Ich rufe an wegen Ihrer Implantat-Operation am Freitag um halb elf bei Dr. Berg. Passt der Termin noch?"],
      ["p", "Ja, der steht. Ich komme."],
      ["b", "Sehr gut. Bitte frühstücken Sie leicht, die Betäubung ist örtlich. Bis Freitag."],
    ],
  },
  {
    id: "jan",
    sex: "m",
    turns: [
      ["b", "Guten Tag, Herr Krüger, hier ist Lisa von der Musterpraxis."],
      ["p", "Hallo, Lisa."],
      ["b", "Ich rufe kurz durch: Ihre Beratung ist morgen früh um halb zehn bei Dr. Berg. Kommen Sie?"],
      ["p", "Ja, ich bin da."],
      ["b", "Wunderbar. Bis morgen."],
    ],
  },
  {
    id: "julia",
    sex: "f",
    force: true,
    turns: [
      ["b", "Guten Tag, Frau Seidel, hier ist Lisa von der Musterpraxis."],
      ["p", "Ja, guten Tag."],
      ["b", "Ihr Schienen-Termin liegt jetzt am Donnerstag um vierzehn Uhr. Passt Ihnen das?"],
      ["p", "Ja, danke, das habe ich so im Kalender."],
      ["b", "Perfekt. Bis dahin."],
    ],
  },
  {
    id: "maria",
    sex: "f",
    turns: [
      ["b", "Guten Tag, Frau Vogel, hier ist Lisa von der Musterpraxis."],
      ["p", "Hallo."],
      ["b", "Nur eine kurze Erinnerung: Ihre professionelle Zahnreinigung ist heute um fünfzehn Uhr."],
      ["p", "Danke, ich komme pünktlich."],
      ["b", "Schön. Bis nachher."],
    ],
  },
];
fs.mkdirSync(lisaDir, { recursive: true });
for (const call of LISA) {
  const dest = path.join(lisaDir, call.id + ".mp3");
  if (!call.force && fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
    console.log("lisa-exists", call.id);
    continue;
  }
  const chunks = [];
  let sec = 0;
  const times = [];
  for (const [wer, text] of call.turns) {
    times.push(Math.round(sec));
    const voice = wer === "b" ? BIANCA_VOICE : PATIENT_W[call.sex];
    const buf = await tts(key, voice, text);
    chunks.push(buf);
    sec += buf.length / 16000;
  }
  fs.writeFileSync(dest, Buffer.concat(chunks));
  console.log("lisa-ok", call.id, fs.statSync(dest).size, times.join(","));
}
