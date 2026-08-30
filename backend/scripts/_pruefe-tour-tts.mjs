// Einmal-Probe (30.08.2026): Tour-TTS nach dem Umbau auf den Qwen3-Container.
// Erwartet: ok=true, mime=audio/wav, hoerbare Laenge. Aufruf:
//   node scripts/_pruefe-tour-tts.mjs
import { synthClaraVoice, ttsConfigured } from "../src/clara/tourNarrate.js";

const r = await synthClaraVoice(
  "Willkommen zur Tour. Ich bin Clara und zeige Ihnen jetzt, was ich alles kann.",
);
console.log("ttsConfigured:", ttsConfigured());
console.log("ok:", r.ok, "| mime:", r.mime || "-", "| reason:", r.reason || "-");
if (r.ok) {
  const bytes = Buffer.from(r.audioBase64, "base64").length;
  const sekunden = ((bytes - 44) / 2 / 24000).toFixed(2);
  console.log(`audio: ${bytes} Bytes (~${sekunden} s bei 24 kHz)`);
}
process.exit(r.ok ? 0 : 1);
