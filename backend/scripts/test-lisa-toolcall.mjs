// Sanity check for the demo: does the LOCAL LLM (same model the voice worker
// uses) map the two demo sentences to the correct Lisa tool with correct args?
// This tests the model+tool definitions, not the full voice pipeline.

const BASE = process.env.MAS_LLM_BASE_URL || "http://127.0.0.1:11434/v1";
const MODEL = process.env.LIVEAVATAR_LLM_MODEL || "qwen3:4b-instruct";

const tools = [
  {
    type: "function",
    function: {
      name: "send_sms",
      description:
        "Lisa verschickt eine SMS im Auftrag des Teams. Nutze dies, wenn das Team sagt 'Schick eine SMS an ... mit dem Inhalt ...'. Uebernimm den Inhalt woertlich.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Zieltelefonnummer als Ziffernfolge, z.B. 01776004600" },
          message: { type: "string", description: "Der SMS-Text, woertlich wie vom Team gesagt" },
          recipientName: { type: "string", description: "Name des Empfaengers, falls genannt" },
        },
        required: ["phone", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delegate_call",
      description:
        "Lisa (Outbound-Telefonistin) ruft jemanden an und richtet etwas aus. Nutze dies, wenn das Team sagt 'Lass ... anrufen und mitteilen, dass ...'.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Zieltelefonnummer als Ziffernfolge, z.B. 01776004600" },
          instruction: { type: "string", description: "Was Lisa am Telefon ausrichten soll, woertlich" },
          contactName: { type: "string", description: "Name der angerufenen Person, falls genannt" },
        },
        required: ["phone", "instruction"],
      },
    },
  },
];

const system =
  "Du bist Clara, die interne Sprach-Assistentin des Praxisteams. " +
  "Lisa ist die Outbound-Telefonistin: sie verschickt SMS (send_sms) und fuehrt Anrufe (delegate_call). " +
  "Sind Nummer UND Inhalt klar, rufe SOFORT das passende Tool auf.";

async function ask(utterance) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: utterance },
      ],
      tools,
    }),
  });
  const data = await r.json();
  const msg = data?.choices?.[0]?.message;
  const tc = msg?.tool_calls?.[0];
  return tc ? { tool: tc.function?.name, args: JSON.parse(tc.function?.arguments || "{}") } : { content: msg?.content };
}

const cases = [
  {
    say: "Schick eine SMS an Dr. Petsas unter 01776004600 mit dem Inhalt: der Termin musste leider abgesagt werden.",
    expectTool: "send_sms",
  },
  {
    say: "Clara, lass Dr. Petsas unter 01776004600 anrufen und ihm mitteilen, dass er 20 Minuten später drankommt heute.",
    expectTool: "delegate_call",
  },
];

let failed = 0;
for (const c of cases) {
  const out = await ask(c.say);
  const ok = out.tool === c.expectTool && /01776004600|\+491776004600/.test(String(out.args?.phone || ""));
  if (!ok) failed += 1;
  console.log(ok ? "PASS" : "FAIL", "->", c.expectTool);
  console.log("   utterance:", c.say);
  console.log("   result:", JSON.stringify(out));
}
process.exit(failed ? 1 : 0);
