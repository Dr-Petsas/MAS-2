// ============================================================================
// W-OUTREACH-2 — Lisas Kalender-Werkzeuge am ElevenLabs-Agenten einrichten.
//
// Legt die Webhook-Tools offer_slots + book_slot im ElevenLabs-Workspace an
// (bzw. aktualisiert sie) und verdrahtet sie am Lisa-Agenten. Idempotent —
// beliebig oft ausführbar. Läuft zusätzlich bei jedem Backend-Boot
// (server.js -> syncLisaAgentTools), weil die Tunnel-URL wechselt.
//
//   node scripts/setup-lisa-agent-tools.mjs
//
// Benötigt in .env: ELEVENLABS_API_KEY, LISA_AGENT_ID, LISA_TOOL_SECRET,
// PUBLIC_BASE_URL (öffentliche https-URL dieses Backends).
// ============================================================================

import "dotenv/config";
import { syncLisaAgentTools, liveBookingConfigured } from "../src/lisa/agentTools.js";

const out = await syncLisaAgentTools({});
if (!out.ok) {
  console.error(`NICHT verdrahtet: ${out.reason}`);
  console.error("Benötigt: ELEVENLABS_API_KEY, LISA_AGENT_ID, LISA_TOOL_SECRET, PUBLIC_BASE_URL (https).");
  process.exit(1);
}
console.log(`Lisa-Agent-Tools synchronisiert auf ${out.baseUrl}`);
for (const a of out.actions) console.log(`  - ${a}`);
console.log(`Agent aktualisiert: ${out.agentUpdated ? "ja (tool_ids ergänzt)" : "nein (war schon verdrahtet)"}`);
console.log(`Live-Buchung aktiv (Instruktions-Gate): ${liveBookingConfigured() ? "JA" : "nein"}`);
process.exit(0);
