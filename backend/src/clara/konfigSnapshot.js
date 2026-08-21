// Kanonische Konfig-Momentaufnahme (W-STABIL-7).
//
// Der Morgenlauf wurde taeglich ROT, weil der Exporter den ROHEN ElevenLabs-
// und Firestore-Zustand verglichen hat. Darin stehen Dinge, die sich ohne
// unser Zutun aendern:
//   - Cloudflare-Quick-Tunnel / ngrok-Hosts (neuer Hostname nach jedem Start)
//   - neue Default-Felder in der ElevenLabs-API (null/false, leere Tool-Slots)
//   - auto-generierte language_presets.source_hash Uebersetzungen
// Die Wache soll Prompt, Stimme, Sprache, Tools und Katalog fangen — nicht
// den Tunnel von heute Nacht.

const EPHEMERAL_HOST_RE =
  /(^|\.)((trycloudflare\.com)|(ngrok-free\.(dev|app))|(ngrok\.(io|app|dev))|(loca\.lt))$/i;

/** Ersetzt nur den Host ephemerer Tunnel, Pfad bleibt (damit /api/tasks vs /api/foo auffaellt). */
export function normalizeEphemeralUrl(value) {
  if (typeof value !== "string") return value;
  const m = /^(wss?:\/\/|https?:\/\/)([^/?#:]+)(:\d+)?(\/[^#]*)?/i.exec(value.trim());
  if (!m) return value;
  if (!EPHEMERAL_HOST_RE.test(m[2])) return value;
  return `${m[1]}[ephemeral-tunnel]${m[4] || ""}`;
}

export function normalizeEphemeral(value) {
  if (typeof value === "string") return normalizeEphemeralUrl(value);
  if (Array.isArray(value)) return value.map(normalizeEphemeral);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeEphemeral(v);
    return out;
  }
  return value;
}

function canonicalPresets(presets) {
  const out = {};
  if (!presets || typeof presets !== "object") return out;
  for (const [lang, pack] of Object.entries(presets)) {
    const fm = pack?.overrides?.agent?.first_message;
    if (typeof fm === "string" && fm.trim()) out[lang] = fm;
  }
  return out;
}

function toolSummaries(tools) {
  if (!Array.isArray(tools)) return [];
  return tools
    .map((t) => ({
      name: String(t?.name || ""),
      type: String(t?.type || ""),
      url: normalizeEphemeralUrl(String(t?.api_schema?.url || "")),
    }))
    .filter((t) => t.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Nur Verhaltens-Felder: Prompt, Ansage, Sprache, Stimme, LLM, Tool-Namen,
 * ASR-Schlagwoerter, echte Sprach-Ansagen. Schema-Muell und Tunnel-Hosts raus.
 */
export function canonicalElevenAgent(raw) {
  const cc = raw?.conversation_config || {};
  const agent = cc.agent || {};
  const tts = cc.tts || {};
  const prompt = agent.prompt || {};
  const asr = cc.asr || {};
  return {
    agent_id: raw?.agent_id || null,
    name: raw?.name || null,
    language: agent.language || null,
    first_message: agent.first_message || "",
    prompt: prompt.prompt || "",
    llm: prompt.llm || null,
    temperature: prompt.temperature ?? null,
    voice_id: tts.voice_id || null,
    tts_model: tts.model_id || null,
    asr_keywords: Array.isArray(asr.keywords) ? [...asr.keywords] : [],
    language_presets: canonicalPresets(cc.language_presets),
    tools: toolSummaries(prompt.tools),
  };
}

/** Firestore-Docs: Zeitstempel weg, Tunnel-URL normalisieren. */
export function canonicalFirestoreDoc(data) {
  if (!data || typeof data !== "object") return data;
  const out = { ...data };
  delete out.updatedAt;
  return normalizeEphemeral(out);
}
