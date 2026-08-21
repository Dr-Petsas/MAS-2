// Kanonische Konfig-Momentaufnahme: Tunnel und Schema-Muell sind kein Drift.
//
// Der Morgenlauf wurde taeglich ROT, weil trycloudflare/ngrok-Hosts und neue
// ElevenLabs-Defaultfelder den Snapshot kippten. Dieser Test braucht kein Netz.
//
//   node scripts/test-konfig-snapshot.mjs
import {
  normalizeEphemeralUrl, normalizeEphemeral,
  canonicalElevenAgent, canonicalFirestoreDoc,
} from "../src/clara/konfigSnapshot.js";

let ok = 0;
let fehl = 0;
function pruef(name, bedingung, gefunden) {
  if (bedingung) { ok += 1; console.log(`  ok   ${name}`); }
  else { fehl += 1; console.log(`  FEHL ${name}${gefunden === undefined ? "" : ` -> ${JSON.stringify(gefunden)}`}`); }
}

console.log("1) Ephemere Tunnel-Hosts werden normalisiert, Pfad bleibt");
pruef("trycloudflare",
  normalizeEphemeralUrl("wss://laptops-suite-xbox-usually.trycloudflare.com/stt")
    === "wss://[ephemeral-tunnel]/stt");
pruef("ngrok-free.dev",
  normalizeEphemeralUrl("https://faceable-darnell-nondiastatic.ngrok-free.dev/api/tasks/{id}")
    === "https://[ephemeral-tunnel]/api/tasks/{id}");
pruef("stabiler Host bleibt",
  normalizeEphemeralUrl("https://ca.pickadoc.de/api/tasks") === "https://ca.pickadoc.de/api/tasks");
pruef("kein URL-Text bleibt", normalizeEphemeralUrl("nur-ein-name") === "nur-ein-name");

console.log("2) Firestore: Tunnel-URL raus, Katalog unangetastet");
const lena = canonicalFirestoreDoc({
  wsUrl: "wss://architecture-revisions-hook-jewish.trycloudflare.com/stt",
  updatedAt: { seconds: 1 },
});
pruef("lenaStt ohne Zeitstempel", lena.updatedAt === undefined);
pruef("lenaStt Tunnel normalisiert", lena.wsUrl === "wss://[ephemeral-tunnel]/stt");
pruef("rekursiv in Objekten",
  normalizeEphemeral({ a: { u: "https://abc.loca.lt/x" } }).a.u === "https://[ephemeral-tunnel]/x");

console.log("3) ElevenLabs: Schema-Zuwachs ist kein Drift, Prompt-Aenderung ist einer");
const basis = {
  agent_id: "agent_x",
  name: "LISA",
  conversation_config: {
    agent: {
      language: "de",
      first_message: "",
      prompt: {
        prompt: "Du bist Lisa.",
        llm: "gpt-4o",
        temperature: 0.61,
        tools: [
          { type: "webhook", name: "update_task", api_schema: { url: "https://abc.ngrok-free.dev/api/tasks/{id}" } },
        ],
      },
    },
    tts: { voice_id: "voice1", model_id: "eleven_multilingual_v2" },
    asr: { keywords: [] },
    language_presets: {
      en: {
        overrides: { agent: { first_message: null } },
        first_message_translation: {
          source_hash: "{\"firstMessage\":\"Hello\"}",
          text: "Hello",
        },
      },
    },
  },
};
const a = canonicalElevenAgent(basis);
const b = canonicalElevenAgent({
  ...basis,
  conversation_config: {
    ...basis.conversation_config,
    turn: { merge_with_default_ignore_terms: false, disable_until_first_user_message: false },
    realtime_model: null,
    agent: {
      ...basis.conversation_config.agent,
      prompt: {
        ...basis.conversation_config.agent.prompt,
        tools: [
          {
            ...basis.conversation_config.agent.prompt.tools[0],
            api_schema: {
              url: "https://ganz-neuer-host.ngrok-free.dev/api/tasks/{id}",
              kind: "webhook",
            },
          },
        ],
      },
    },
    language_presets: {
      en: {
        overrides: { agent: { first_message: null } },
        first_message_translation: {
          source_hash: "{\"firstMessage\":\"Hi there\"}",
          text: "Hi there",
        },
      },
    },
  },
});
pruef("Schema + neuer Tunnel-Host gleicher Snapshot", JSON.stringify(a) === JSON.stringify(b), { a, b });
pruef("Tool-Pfad bleibt erkennbar", a.tools[0].url === "https://[ephemeral-tunnel]/api/tasks/{id}");

const c = canonicalElevenAgent({
  ...basis,
  conversation_config: {
    ...basis.conversation_config,
    agent: {
      ...basis.conversation_config.agent,
      prompt: { ...basis.conversation_config.agent.prompt, prompt: "Du bist Lisa von einer anderen Praxis." },
    },
  },
});
pruef("Prompt-Aenderung faellt auf", c.prompt !== a.prompt);

const d = canonicalElevenAgent({
  ...basis,
  conversation_config: {
    ...basis.conversation_config,
    language_presets: {
      zh: { overrides: { agent: { first_message: "你好，Praxis" } } },
    },
  },
});
pruef("echte Sprach-Ansage bleibt im Snapshot", d.language_presets.zh === "你好，Praxis");
pruef("auto-Uebersetzung ohne Override ist raus", Object.keys(a.language_presets).length === 0);

console.log(fehl ? `\nROT: ${fehl} Pruefung(en) fehlgeschlagen, ${ok} ok.` : `\nAlles gruen (${ok}).`);
process.exit(fehl ? 1 : 0);
