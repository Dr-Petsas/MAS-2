import "dotenv/config";
import { writeFileSync } from "node:fs";
import admin, { db } from "../src/firebase.js";

// Setzt ALLE ClonR-Videos eines Mandanten auf geloescht (Soft-Delete, wie der
// Papierkorb im Plattform-UI: isDeleted=true + deletedAt/deletedBy). Grund
// (Chef-Wunsch 05.07.2026): MedDent bekommt komplett neue Videos, die alten
// sollen aus der Liste verschwinden. Vor dem Loeschen wird die Sammlung als
// JSON-Backup neben dieses Skript geschrieben. Storage-Dateien bleiben liegen
// (macht das UI-Loeschen genauso).
//   Dry-Run:    node scripts/clear-clonr-videos.mjs [clientId]
//   Ausfuehren: node scripts/clear-clonr-videos.mjs [clientId] --apply
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const clientId = (args.find((a) => !a.startsWith("--")) || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();

const clientDoc = await db.collection("clients").doc(clientId).get();
if (!clientDoc.exists) {
  console.error(`Client ${clientId} existiert nicht — Abbruch.`);
  process.exit(1);
}
const clientName = clientDoc.data()?.name || "(ohne Namen)";
console.log(`Mandant: ${clientName} (${clientId})`);

const col = db.collection("clients").doc(clientId).collection("clonRVideos");
const snap = await col.where("isDeleted", "==", false).get();
if (snap.empty) {
  console.log("Keine aktiven ClonR-Videos vorhanden — nichts zu tun.");
  process.exit(0);
}

console.log(`Aktive ClonR-Videos: ${snap.size}`);
for (const d of snap.docs) {
  const v = d.data();
  const created = v.createdAt?.toDate ? v.createdAt.toDate().toISOString().slice(0, 10) : "?";
  console.log(`  - ${v.name || d.id} (${created}, Status ${v.status || "?"})`);
}

if (!apply) {
  console.log("\nDry-Run — nichts geloescht. Zum Ausfuehren --apply anhaengen.");
  process.exit(0);
}

const backup = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = new URL(`./removed-clonr-videos-${clientId}-${stamp}.json`, import.meta.url);
writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf-8");
console.log(`\nBackup (${backup.length} Videos): ${backupPath.pathname}`);

let updated = 0;
const docs = snap.docs;
for (let i = 0; i < docs.length; i += 400) {
  const batch = db.batch();
  for (const d of docs.slice(i, i + 400)) {
    batch.set(d.ref, {
      isDeleted: true,
      deletedAt: admin.firestore.Timestamp.now(),
      deletedBy: "clear-clonr-videos-script",
    }, { merge: true });
  }
  await batch.commit();
  updated += Math.min(400, docs.length - i);
}
console.log(`Soft-geloescht: ${updated} ClonR-Videos bei ${clientName}.`);
process.exit(0);
