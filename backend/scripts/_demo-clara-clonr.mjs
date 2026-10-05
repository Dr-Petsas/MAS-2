import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const masEnv = path.join(here, "..", ".env");
const out = "F:/pickadoc-live-base/demo-erleben/assets/clara/k-clonR.mp3";
const VOICE_ID = "cgSgspJ2msm6clMCkdW9";
const TEXT =
  "Klohner ist kein Begrüßungsvideo. Mit Klohner wird der normale Termin zum medialen Erlebnis. Ihre Patienten erhalten mit der Terminbestätigung ein Kie-Video — Sie stehen im Rampenlicht und erklären den anstehenden Termin. Dieselben Videos nutzen Sie für Marketing oder Patientenaufklärung, ganz wie Sie es bevorzugen. Jedes Video hat eine Share-Funktion und bringt Ihnen kostenlose Handy-zu-Handy-Propaganda. Filmen müssen Sie nicht: ein Foto und zehn Sekunden Stimme reichen. Danach entstehen neue Videos per Texteingabe — in über vierzig Sprachen, damit Sie Patienten in ihrer Muttersprache ansprechen.";

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

const e = { ...process.env };
loadEnv(masEnv, e);
const key = e.ELEVENLABS_API_KEY || "";
if (!key) {
  console.log("skip-no-key");
  process.exit(1);
}

const resp = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": key, accept: "audio/mpeg" },
    body: JSON.stringify({
      text: TEXT,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  }
);
if (!resp.ok) {
  console.log("fail", resp.status);
  process.exit(1);
}
const buf = Buffer.from(await resp.arrayBuffer());
fs.writeFileSync(out, buf);
console.log("ok", buf.length);
