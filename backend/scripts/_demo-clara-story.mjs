import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const masEnv = path.join(here, "..", ".env");
const audioDir = "F:/pickadoc-live-base/demo-erleben/assets/clara";
const VOICE_ID = "cgSgspJ2msm6clMCkdW9";
const CLIPS = [
  {
    file: "briefing.mp3",
    text:
      "Schön, dass Sie da sind. Ich bin Clara. Das hier ist Ihr Kalender — eine kleine Bühne, kein leeres Raster. Paul Hartmann kommt heute um halb zwölf zur Kontrolle, Maria Vogel um drei zur PZR. Bleiben Sie einen Moment am Kalender: sobald jemand bucht, anruft oder eine E-Mail schickt, sage ich es Ihnen in einem Satz.",
  },
  {
    file: "s-01.mp3",
    force: true,
    text: "OP-Termin gebucht: Erik Braun, Implantat-OP, Freitag um halb elf bei Doktor Berg. Anamnestisch Bluthochdruck, eingestellt mit Ramipril, und Methotrexat wegen Rheuma. Die Implantat-Aufklärung ist noch nicht unterschrieben.",
  },
  {
    file: "s-02.mp3",
    text: "Frau Vogel hat angerufen. Sie wollte wissen, ob ihre PZR heute um fünfzehn Uhr stattfindet. Bianca hat bestätigt.",
  },
  {
    file: "s-03.mp3",
    force: true,
    text: "Herr Braun hat eine E-Mail geschickt. Er hat die Bestätigung für die Implantat-OP am Freitag um halb elf bekommen und fragt, ob er nüchtern kommen muss.",
  },
  {
    file: "s-04.mp3",
    force: true,
    text: "Frau Seidel hat angerufen. Sie wollte ihren Schienen-Termin vom Dienstag auf den Donnerstag um vierzehn Uhr legen. Bianca hat umgetragen.",
  },
  {
    file: "s-06.mp3",
    force: true,
    text: "Herr Hartmann hat sich selbst eingecheckt. Kontrolle um halb zwölf.",
  },
  {
    file: "s-07.mp3",
    force: true,
    text: "Lisa hat Herrn Braun angerufen, wegen der Implantat-OP am Freitag um halb elf. Er kommt.",
  },
  {
    file: "s-08.mp3",
    force: true,
    text: "Herr Krüger hat angerufen. Er hat seine Beratung morgen um halb zehn bestätigt.",
  },
  {
    file: "s-09.mp3",
    force: true,
    text: "Frau Vogel hat eine E-Mail geschickt. Sie kommt heute um fünfzehn Uhr zur PZR und bittet, die Unterlagen bereitzulegen.",
  },
  {
    file: "s-05.mp3",
    text: "Probieren Sie einfach alle Funktionen aus, die Sie hier in der Demo sehen. Im Live-Betrieb können Sie ein reales Gespräch mit mir führen, die Daten ändern und sehen, wie ich darauf eingehe, mit Bianca telefonieren oder sich von Lisa zum Beispiel zum Recall anrufen lassen. Diese kleine interaktive Demo zeigt nur einen Bruchteil dessen, was mit Pickadoc und dem neuen Multi-Agent-System — abgekürzt M A S — möglich ist.",
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

async function synth(key, clip) {
  const out = path.join(audioDir, clip.file);
  if (!clip.force && fs.existsSync(out) && fs.statSync(out).size > 800) {
    console.log("exists", clip.file);
    return;
  }
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": key, accept: "audio/mpeg" },
      body: JSON.stringify({
        text: clip.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
      }),
    }
  );
  if (!resp.ok) {
    console.log("fail", clip.file, resp.status, await resp.text());
    return;
  }
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(out, Buffer.from(await resp.arrayBuffer()));
  console.log("ok", clip.file, fs.statSync(out).size);
}

const e = { ...process.env };
loadEnv(masEnv, e);
const key = e.ELEVENLABS_API_KEY || "";
if (!key) {
  console.log("skip-no-key");
  process.exit(1);
}
for (const clip of CLIPS) await synth(key, clip);
