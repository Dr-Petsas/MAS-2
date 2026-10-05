import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const masEnv = path.join(here, "..", ".env");
const audioDir = "F:/pickadoc-live-base/demo-erleben/assets/clara";
const VOICE_ID = "cgSgspJ2msm6clMCkdW9";
const CLIPS = [
  { file: "e-01.mp3", text: "Da schaut jemand auf Ihre Praxis-Landingpage. Soll ich sie Ihnen zeigen?" },
  { file: "e-02.mp3", text: "Anna Berger hat die Implantat-Besprechung geöffnet. Soll ich mitgehen?" },
  { file: "e-03.mp3", text: "Anna hat den Anamnesebogen in Sainer ausgefüllt. Soll ich das Dokument öffnen?" },
  { file: "e-04.mp3", text: "Die Aufklärung zur KI-Telefonie ist durch. Soll ich nachsehen, was noch fehlt?" },
  { file: "e-05.mp3", text: "Datenschutz ist unterschrieben." },
  { file: "e-06.mp3", text: "CareCapital ist auch ausgefüllt. Soll ich die Mappe zeigen?" },
  { file: "e-07.mp3", text: "Tom Keller hat eine Kontrolle am Dienstag gebucht. Soll ich den Termin aufschlagen?" },
  { file: "e-08.mp3", text: "SMS an Tom Keller: die Terminbestätigung. Soll ich sie vorlesen?" },
  { file: "e-09.mp3", text: "E-Mail vom Scan-Service Hauspost eingegangen. Soll ich sie vorlesen?" },
  { file: "e-10.mp3", text: "Paul Hartmann hat sich selbst eingecheckt. Soll ich ihn aufrufen?" },
  { file: "e-11.mp3", text: "Anruf von Maria Vogel eingegangen. Soll ich Ihnen sagen, worum es geht?" },
  { file: "e-12.mp3", text: "Julia Seidel schaut sich die Seite zur Schiene an." },
  { file: "e-13.mp3", text: "Julia hat eine KB-Besprechung für den ersten September gebucht. Soll ich sie aufschlagen?" },
  { file: "e-14.mp3", text: "SMS an Julia Seidel: Bestätigung. Soll ich sie vorlesen?" },
  { file: "e-15.mp3", text: "Lisa hat Herrn Braun angerufen, wegen der Implantat-OP. Soll ich das Gespräch zeigen?" },
  { file: "e-16.mp3", text: "Maria Vogel ist da — Selbst-Check-in. Soll ich sie aufrufen?" },
  { file: "e-17.mp3", text: "Julia legt ihren Termin auf den zwanzigsten August. Soll ich die Verschiebung zeigen?" },
  { file: "e-18.mp3", text: "Neue Bestätigung an Julia ist raus. Soll ich die SMS vorlesen?" },
  { file: "e-19.mp3", text: "Anruf von Jan Krüger eingegangen: er sagt morgen ab. Soll ich Ihnen sagen, worum es geht?" },
  { file: "e-20.mp3", text: "Lena hat das Tagesbriefing abgelegt. Soll ich es vorlesen?" },
  { file: "e-21.mp3", text: "Nadine hat Erik Braun eine Bewertungsanfrage geschickt. Soll ich die Mail zeigen?" },
  { file: "e-22.mp3", text: "Lea Sommer hat eine Implantat-Besprechung für nächsten Montag gebucht. Soll ich den Termin zeigen?" },
  { file: "e-23.mp3", text: "Und die Bestätigung liegt auf dem Handy von Lea Sommer. Soll ich die SMS vorlesen?" },
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
  if (fs.existsSync(out) && fs.statSync(out).size > 800) {
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
    console.log("fail", clip.file, resp.status);
    return;
  }
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(out, Buffer.from(await resp.arrayBuffer()));
  console.log("ok", clip.file);
}

const e = { ...process.env };
loadEnv(masEnv, e);
const key = e.ELEVENLABS_API_KEY || "";
if (!key) {
  console.log("skip-no-key");
  process.exit(0);
}
for (const clip of CLIPS) await synth(key, clip);
