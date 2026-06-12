import "dotenv/config";
import { writeFileSync } from "node:fs";
import { masCollection } from "../src/tenant.js";

// Entfernt EIN Event aus dem Praxisgedächtnis — für Test-Müll, der über
// /brain/ingest/transcript reingekommen ist (z. B. der erfundene Testanruf
// "Manfred Krause" aus der Nacht-Session 11./12.06.2026). Vor dem Löschen
// wird das Dokument als JSON-Backup neben dieses Skript geschrieben.
//   node scripts/remove-test-event.mjs <eventId> [clientId]
const eventId = (process.argv[2] || "").trim();
const clientId = (process.argv[3] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
if (!eventId) {
  console.error("Usage: node scripts/remove-test-event.mjs <eventId> [clientId]");
  process.exit(1);
}

const ref = masCollection(clientId, "mas_events").doc(eventId);
const snap = await ref.get();
if (!snap.exists) {
  console.error(`Event ${eventId} existiert nicht (clients/${clientId}/mas_events).`);
  process.exit(1);
}

const backupPath = new URL(`./removed-${eventId}.json`, import.meta.url);
writeFileSync(backupPath, JSON.stringify(snap.data(), null, 2), "utf-8");
console.log(`Backup: ${backupPath.pathname}`);

await ref.delete();
console.log(`Gelöscht: clients/${clientId}/mas_events/${eventId}`);
process.exit(0);
