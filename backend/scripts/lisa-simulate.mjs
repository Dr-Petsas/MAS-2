// Lisas Agenten OHNE echten Anruf gegentesten (27.07.2026).
//
// Prueft, was Lisa als ERSTES sagt, wenn sie einen termin-freien Auftrag
// bekommt ("Es ist gleich 20 Uhr."). Vor dem Fix sagte sie wortgleich das
// Termin-Beispiel aus ihrem Prompt. Niemandes Telefon klingelt dabei.
//
//   node scripts/lisa-simulate.mjs "Es ist gleich 20 Uhr."
import "dotenv/config";
import { rahmeAuftrag } from "../src/lisa/outbound.js";

const auftrag = process.argv[2] || "Es ist gleich 20 Uhr.";
const KEY = process.env.ELEVENLABS_API_KEY;
const ID = process.env.LISA_AGENT_ID;

const body = {
  simulation_specification: {
    simulated_user_config: {
      first_message: "Hallo?",
      language: "de",
      prompt: {
        prompt: "Du bist Dr. Petsas und nimmst das Telefon ab. Du antwortest "
          + "kurz und wartest ab, was die Anruferin will. Sage nach ihrer "
          + "Eroeffnung nur 'Aha, verstanden. Danke.' und beende das Gespraech.",
      },
    },
    dynamic_variables: {
      task_id: "sim",
      client_id: process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT",
      assigned_by: "Dr. Michael Petsas",
      delegated_to: "Lisa",
      contact_name: "Dr. Petsas",
      phone_number: "+490000000000",
      task_prompt: rahmeAuftrag(auftrag),
      patient_name: "Dr. Petsas",
      doctor: "Dr. Michael Petsas",
      scheduled_for: "",
      created_at: new Date().toISOString(),
      call_language: "de",
    },
  },
  new_turns_limit: 4,
};

const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${ID}/simulate-conversation`, {
  method: "POST",
  headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const data = await r.json().catch(() => ({}));
if (!r.ok) {
  console.error("Simulation fehlgeschlagen:", r.status);
  console.error(JSON.stringify(data).slice(0, 1200));
  process.exitCode = 1;
} else {
  console.log("Auftrag an Lisa:", JSON.stringify(auftrag));
  console.log("-".repeat(70));
  for (const t of data.simulated_conversation || []) {
    const wer = t.role === "agent" ? "Lisa " : "Chef ";
    console.log(`${wer}: ${String(t.message || "").replace(/\s+/g, " ")}`);
  }
  const analyse = data.analysis?.transcript_summary;
  if (analyse) console.log("\nZusammenfassung:", analyse);
}
