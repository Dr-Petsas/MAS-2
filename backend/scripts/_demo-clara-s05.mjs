import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const masEnv = path.join(here, "..", ".env");
const out = "F:/pickadoc-live-base/demo-erleben/assets/clara/s-05.mp3";
const VOICE_ID = "cgSgspJ2msm6clMCkdW9";
const TEXT =
  "Probieren Sie einfach alle Funktionen aus, die Sie hier in der Demo sehen. Klicken Sie sich einmal durch alle Punkte durch — dann bekommen Sie ein Gefühl dafür, wie ich die Praxis im Griff habe. Im Live-Betrieb können Sie ein reales Gespräch mit mir führen, die Daten ändern und sehen, wie ich darauf eingehe, mit Bianca telefonieren oder sich von Lisa zum Beispiel zum Recall anrufen lassen. Diese kleine interaktive Demo zeigt nur einen Bruchteil dessen, was mit Pickadoc und dem neuen Multi-Agent-System — abgekürzt M A S — möglich ist.";

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
