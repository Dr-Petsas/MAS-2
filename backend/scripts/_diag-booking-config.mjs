// Diagnose 28.07.: Welche Felder traegt mas_config/booking (Adresse fuer Lisa?)
import "dotenv/config";
import { masCollection } from "../src/tenant.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const snap = await masCollection(clientId, "mas_config").doc("booking").get();
const d = snap.exists ? snap.data() : {};
for (const k of Object.keys(d).sort()) {
  const v = d[k];
  const str = typeof v === "object" ? JSON.stringify(v) : String(v);
  console.log(`${k}: ${str.length > 220 ? str.slice(0, 220) + "…" : str}`);
}
process.exit(0);
