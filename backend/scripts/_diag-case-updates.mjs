import "dotenv/config";
import { masCollection } from "../src/tenant.js";
const C = "MEe4ZQHEzOPzLcexyhdT";
const d = await masCollection(C, "mas_cases").doc("gapfill_fa66c704606a071056b6").get();
const c = d.data();
console.log("status =", c.status);
const cands = c.callList?.candidates || [];
const removed = cands.filter((k) => k.removed);
console.log("Kandidaten gesamt:", cands.length, "| removed:", removed.length);
for (const k of removed) console.log("  removed:", k.name);
const ups = (c.updates || []).slice(-6);
for (const u of ups) {
  const t = u.atMs ? new Date(u.atMs).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin" }) : "?";
  console.log("  update", t, "|", String(u.text || u.note || "").slice(0, 90));
}
process.exit(0);
