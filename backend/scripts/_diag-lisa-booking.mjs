// Diagnose 28.07. 16:35: Lisa konnte nicht buchen ("Slot angeblich weg").
import "dotenv/config";
import { masCollection } from "../src/tenant.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const taskId = "ronCIfHDdYYRElr2qB8g";

const t = await masCollection(clientId, "mas_lisa_tasks").doc(taskId).get();
if (!t.exists) { console.log("Task fehlt"); process.exit(0); }
const d = t.data();
console.log("--- Task-Felder:");
for (const k of Object.keys(d).sort()) {
  const v = d[k];
  const str = typeof v === "object" ? JSON.stringify(v) : String(v);
  console.log(`${k}: ${str.length > 500 ? str.slice(0, 500) + "…" : str}`);
}
process.exit(0);

