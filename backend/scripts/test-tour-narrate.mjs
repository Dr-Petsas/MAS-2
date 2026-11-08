// Schnelltest fuer die Faehigkeits-Tour-Narration (ohne Server/Netz).
// Prueft: LLM-Rueckfall liefert Kapiteltext; TTS-Guard bei abgeschalteter Stimme sauber.
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

// TTS abgeschaltet -> klarer Grund, kein Absturz. Die Tour spricht ueber den
// lokalen Qwen-Container (kein ElevenLabs-Key mehr); der Schalter ist CLARA_TOUR_TTS.
const savedTts = process.env.CLARA_TOUR_TTS;
process.env.CLARA_TOUR_TTS = "0";
check("ttsConfigured false bei CLARA_TOUR_TTS=0", ttsConfigured() === false);
const t = await synthClaraVoice("Hallo");
check("TTS-Guard bei abgeschalteter Tour-Stimme", t.ok === false && t.reason === "tts_not_configured");
if (savedTts === undefined) delete process.env.CLARA_TOUR_TTS;
else process.env.CLARA_TOUR_TTS = savedTts;

console.log(fails === 0 ? "\nALLE GRUEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
