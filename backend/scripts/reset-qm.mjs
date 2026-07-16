import "dotenv/config";
import { masCollection } from "../src/tenant.js";

// QM zurücksetzen: löscht die QM-Jobs (Julias Kalender) und die wiederkehrenden
// Schedules eines Mandanten, damit man "von vorne" anfangen kann. Bücher und
// Nachweise bleiben erhalten (sonst --books / --documents mitgeben).
//
//   node scripts/reset-qm.mjs [clientId] [--books] [--documents] [--dry]
//
// Ohne clientId: DEFAULT_CLIENT_ID aus der .env (kanonische Praxis).

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const clientId = (args.find((a) => !a.startsWith("--")) || process.env.DEFAULT_CLIENT_ID || "").trim();
const dry = flags.has("--dry");

if (!clientId) {
  console.error("Kein clientId und kein DEFAULT_CLIENT_ID gesetzt. Abbruch.");
  process.exit(1);
}

async function purge(name) {
  const snap = await masCollection(clientId, name).get();
  const n = snap.size;
  if (!dry && n) {
    // in Blöcken löschen (Firestore-Limit pro Batch: 500)
    for (let i = 0; i < snap.docs.length; i += 400) {
      await Promise.all(snap.docs.slice(i, i + 400).map((d) => d.ref.delete()));
    }
  }
  return n;
}

const targets = ["mas_qm_jobs", "mas_qm_schedules"];
if (flags.has("--books")) targets.push("mas_qm_books");
if (flags.has("--documents")) targets.push("mas_qm_documents");

console.log(`QM-Reset für Mandant: ${clientId}${dry ? "  (DRY-RUN, nichts wird gelöscht)" : ""}`);
const counts = {};
for (const t of targets) counts[t] = await purge(t);

for (const t of targets) console.log(`  ${dry ? "vorhanden" : "gelöscht"}: ${counts[t]}  (${t})`);
console.log(dry ? "\nDRY-RUN fertig — mit gleichem Aufruf ohne --dry ausführen." : "\nFertig. QM-Kalender ist leer, du kannst neu einrichten.");
process.exit(0);
