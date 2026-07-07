// Aufraeumen der AERA-Flut vom 06.07.2026: 458 Bestellbestaetigungen von
// no-reply@aera-gmbh.de (12:21-12:42 Uhr) verschieben den Posteingang in den
// Papierkorb-Ordner (reversibel: prevFolder=INBOX bleibt gespeichert; der
// Sync holt Trash-Mails nie zurueck in den Posteingang).
// Aufruf: node scripts/aufraeumen-aera-flut.mjs [--dry]
import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT";
const dry = process.argv.includes("--dry");
const msgsCol = db.collection("clients").doc(cid).collection("mas_mail_messages");

const snap = await msgsCol
  .where("from.address", "==", "no-reply@aera-gmbh.de")
  .where("folder", "==", "INBOX")
  .get();
console.log(`AERA-Mails im Posteingang: ${snap.size}${dry ? " (Probelauf, nichts wird geaendert)" : ""}`);
if (!dry && snap.size) {
  const { FieldValue } = admin.firestore;
  let moved = 0;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 400)) {
      batch.update(d.ref, { prevFolder: "INBOX", folder: "Trash", seen: true, updatedAt: FieldValue.serverTimestamp() });
      moved++;
    }
    await batch.commit();
    console.log(`  ${moved}/${docs.length} verschoben ...`);
  }
  console.log(`Fertig: ${moved} AERA-Mails in den Papierkorb verschoben.`);
}
process.exit(0);
