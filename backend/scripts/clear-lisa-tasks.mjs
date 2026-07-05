import "dotenv/config";
import { writeFileSync } from "node:fs";
import { masCollection } from "../src/tenant.js";

// Leert Lisas Anrufliste (mas_lisa_tasks) eines Mandanten — für Test-Müll aus
// der Aufbauphase (Chef-Wunsch 05.07.2026: alte Juni-Testanrufe raus). Vor dem
// Löschen wird die komplette Sammlung als JSON-Backup neben dieses Skript
// geschrieben, damit nichts unwiederbringlich verschwindet.
//   node scripts/clear-lisa-tasks.mjs [clientId]
const clientId = (process.argv[2] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();

const col = masCollection(clientId, "mas_lisa_tasks");
const snap = await col.get();
if (snap.empty) {
  console.log(`Nichts zu löschen — clients/${clientId}/mas_lisa_tasks ist leer.`);
  process.exit(0);
}

const backup = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = new URL(`./removed-lisa-tasks-${clientId}-${stamp}.json`, import.meta.url);
writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf-8");
console.log(`Backup (${backup.length} Tasks): ${backupPath.pathname}`);

// Firestore-Batch kann bis 500 Writes — reicht hier; sonst in Scheiben.
let deleted = 0;
const docs = snap.docs;
for (let i = 0; i < docs.length; i += 400) {
  const batch = col.firestore.batch();
  for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
  await batch.commit();
  deleted += Math.min(400, docs.length - i);
}
console.log(`Gelöscht: ${deleted} Dokumente aus clients/${clientId}/mas_lisa_tasks`);
process.exit(0);
