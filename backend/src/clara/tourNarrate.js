// Clara Fähigkeits-Tour (Audio-Menü): erzeugt zu einem Kapitel Claras
// gesprochenen Text über das LOKALE LLM (volle Prompt-Anpassung pro Kapitel)
// und optional das Audio in Claras Stimme über ElevenLabs Text-to-Speech.
//
// Kein Patientenbezug — reine Produkt-/Fähigkeits-Ansage. Robust: ist das LLM
// offline, fällt der Aufruf auf den vorgegebenen Kapiteltext zurück; ist
// ElevenLabs nicht konfiguriert, liefert der Endpunkt nur Text (das Frontend
// spricht ihn dann per Browser-Stimme). So bricht die Seite nie.

import { chat, strongLlm } from "../mail/llm.js";

function env(name) {
  const v = process.env[name];
  return v == null ? "" : String(v).trim();
}

// Claras Stimme (ElevenLabs). Standard = die in Clara-Voice hinterlegte Stimme
// "Anna"; per Env überschreibbar, falls die Praxis eine andere Stimme wählt.
const CLARA_VOICE_ID = () => env("CLARA_VOICE_ID") || "cgSgspJ2msm6clMCkdW9";

// Persona-Rahmen: Clara spricht als interne Kollegin, in ganzen, natürlichen
// Sätzen, ohne Markdown/Emojis, ohne "Als KI …", und erfindet NICHTS.
const SYSTEM = [
  "Du bist Clara, die interne Sprach-Assistentin einer Zahnarztpraxis.",
  "Du stellst dem Praxisteam auf einer Fähigkeits-Tour vor, was du kannst.",
  "Sprich in natürlichen, gesprochenen Sätzen — kein Markdown, keine Aufzählungszeichen,",
  "keine Emojis, kein 'Als KI'. Sei warm, kompetent und knapp: höchstens drei bis vier Sätze.",
  "Bleibe strikt beim vorgegebenen Kapitel-Thema und erfinde keine Funktionen dazu.",
].join(" ");

/**
 * Erzeugt Claras Ansage zu einem Kapitel.
 * @param {{title?:string, prompt?:string, fallbackText?:string}} chapter
 * @returns {Promise<{ok:boolean, text:string, model?:string, source:"llm"|"fallback"}>}
 */
export async function narrateChapter({ title = "", prompt = "", fallbackText = "" } = {}) {
  const instruction = (prompt || "").trim() || (fallbackText || "").trim();
  const fallback = (fallbackText || prompt || "").trim();
  if (!instruction) {
    return { ok: false, text: "", source: "fallback" };
  }
  const s = strongLlm(); // starker 5090-Server für flüssige Sprache
  const messages = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content:
        `Kapitel: ${title || "Fähigkeiten"}.\n` +
        `Aufgabe: ${instruction}\n` +
        `Antworte NUR mit Claras gesprochenem Text.`,
    },
  ];
  const r = await chat(messages, {
    temperature: 0.6,
    maxTokens: 260,
    timeoutMs: 20000,
    model: s.model,
    baseUrl: s.base,
  });
  const text = (r?.text || "").trim();
  if (r?.ok && text) return { ok: true, text, model: r.model, source: "llm" };
  // LLM offline/leer → ehrlicher Rückfall auf den hinterlegten Kapiteltext.
  return { ok: !!fallback, text: fallback, source: "fallback" };
}

/** ElevenLabs verfügbar? (API-Key gesetzt) */
export function ttsConfigured() {
  return !!env("ELEVENLABS_API_KEY");
}

/**
 * Text in Claras Stimme (ElevenLabs TTS) synthetisieren.
 * @returns {Promise<{ok:boolean, audioBase64?:string, mime?:string, reason?:string}>}
 */
export async function synthClaraVoice(text, { timeoutMs = 20000 } = {}) {
  const key = env("ELEVENLABS_API_KEY");
  const clean = String(text || "").trim();
  if (!key) return { ok: false, reason: "tts_not_configured" };
  if (!clean) return { ok: false, reason: "empty_text" };
  const voiceId = CLARA_VOICE_ID();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": key,
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: clean,
          model_id: env("CLARA_TTS_MODEL") || "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
        }),
        signal: ctrl.signal,
      }
    );
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return { ok: false, reason: `elevenlabs_http_${resp.status}`, detail: detail.slice(0, 200) };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) return { ok: false, reason: "empty_audio" };
    return { ok: true, audioBase64: buf.toString("base64"), mime: "audio/mpeg" };
  } catch (e) {
    return { ok: false, reason: e?.name === "AbortError" ? "tts_timeout" : "tts_unreachable" };
  } finally {
    clearTimeout(t);
  }
}
