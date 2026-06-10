import "dotenv/config";
import { queryRecent } from "../src/brain/eventStore.js";
import { buildBriefing, buildSpokenBriefing } from "../src/brain/briefing.js";

// Read-only Firestore round-trip check: proves the brain store + briefing work
// end-to-end against the real database WITHOUT writing anything.
//   node scripts/check-brain-read.mjs [clientId]
const clientId = (process.argv[2] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
const since = Date.now() - 7 * 24 * 60 * 60 * 1000;

const events = await queryRecent(clientId, since);
console.log(`read ${events.length} events from clients/${clientId}/mas_events (last 7d)`);
const briefing = buildBriefing(events, { windowStart: since });
console.log("counts:", JSON.stringify(briefing.counts));
console.log("spoken:", buildSpokenBriefing(briefing) || "(leer)");
process.exit(0);
