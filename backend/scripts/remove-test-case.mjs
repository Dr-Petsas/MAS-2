import "dotenv/config";
import { writeFileSync } from "node:fs";
import { masCollection } from "../src/tenant.js";

// Entfernt Test-Vorgänge aus mas_cases — Gegenstück zu remove-test-event.mjs.
// Ohne --delete werden nur Treffer gelistet (Dry-Run). Vor jedem Löschen
// wird das Dokument als JSON-Backup neben dieses Skript geschrieben.
//   node scripts/remove-test-case.mjs "<suchbegriff>" [clientId] [--delete]
const needle = (process.argv[2] || "").trim().toLowerCase();
const rest = process.argv.slice(3).filter((a) => a !== "--delete");
const doDelete = process.argv.includes("--delete");
const clientId = (rest[0] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
if (!needle) {
  console.error('Usage: node scripts/remove-test-case.mjs "<suchbegriff>" [clientId] [--delete]');
  process.exit(1);
}

const snap = await masCollection(clientId, "mas_cases").get();
const hits = [];
for (const doc of snap.docs) {
  const data = doc.data();
  if (JSON.stringify(data).toLowerCase().includes(needle)) hits.push({ id: doc.id, data });
}

if (!hits.length) {
  console.log(`Keine Vorgänge mit "${needle}" in clients/${clientId}/mas_cases.`);
  process.exit(0);
}

for (const { id, data } of hits) {
  console.log(`- ${id}: ${data.title || data.subject || "(ohne Titel)"} | status=${data.status} | patient=${data.patientName || data.contactName || "?"}`);
  if (doDelete) {
    const backupPath = new URL(`./removed-case-${id}.json`, import.meta.url);
    writeFileSync(backupPath, JSON.stringify(data, null, 2), "utf-8");
    await masCollection(clientId, "mas_cases").doc(id).delete();
    console.log(`  -> gelöscht (Backup: ${backupPath.pathname})`);
  }
}
if (!doDelete) console.log("Dry-Run. Zum Löschen --delete anhängen.");
process.exit(0);
