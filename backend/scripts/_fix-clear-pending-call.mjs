// Einmal-Fix 14.08.: alten Anruf-Vormerker (Chef-Nummer) aus voice_state loeschen.
import "dotenv/config";
import { clearPendingLisaCall } from "../src/clara/sessions.js";
import { masCollection } from "../src/tenant.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
await clearPendingLisaCall(clientId);
const vs = await masCollection(clientId, "mas_config").doc("voice_state").get();
console.log("pendingLisaCall jetzt:", JSON.stringify(vs.data()?.pendingLisaCall ?? null));
process.exit(0);
