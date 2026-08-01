// Schnelltest fuer die Faehigkeits-Tour-Narration (ohne Server/Netz).
// Prueft: LLM-Rueckfall liefert Kapiteltext; TTS-Guard ohne Key sauber.
import { narrateChapter, synthClaraVoice, ttsConfigured } from "../src/clara/tourNarrate.js";

let fails = 0;
function check(name, cond) {
  console.log(`${cond ? "OK  " : "FAIL"}  ${name}`);
  if (!cond) fails++;
}

// LLM-Basis bewusst auf toten Port -> Rueckfall auf fallbackText erzwingen.
process.env.MAS_LETTER_BASE_URL = "http://127.0.0.1:1/v1";

const fb = "Ich bin Clara, deine Leitstelle fuer Sprache und Telefon.";
const r = await narrateChapter({ title: "Willkommen", prompt: "Stell dich vor.", fallbackText: fb });
check("Rueckfall liefert Text", r.text === fb);
check("Rueckfall-Quelle korrekt", r.source === "fallback");

const empty = await narrateChapter({});
check("Leere Eingabe -> ok:false", empty.ok === false);

// TTS ohne Key -> klarer Grund, kein Absturz.
const savedKey = process.env.ELEVENLABS_API_KEY;
delete process.env.ELEVENLABS_API_KEY;
check("ttsConfigured false ohne Key", ttsConfigured() === false);
const t = await synthClaraVoice("Hallo");
check("TTS-Guard ohne Key", t.ok === false && t.reason === "tts_not_configured");
if (savedKey) process.env.ELEVENLABS_API_KEY = savedKey;

console.log(fails === 0 ? "\nALLE GRUEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
