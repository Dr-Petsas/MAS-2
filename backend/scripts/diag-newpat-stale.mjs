import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT", loc = "VjdvbRQHH8oTId4f0GiX";
const apc = db.collection("clients").doc(cid).collection("locations").doc(loc).collection("appointments");

// Nimm die juengsten ~400 Termine, finde die mit patient.newPatient===true und
// pruefe, wie viele dieser "neuen" Patienten in Wirklichkeit Vortermine haben.
const snap = await apc.orderBy("start", "desc").limit(400).get();
let flagged = 0, stale = 0;
const beispiele = [];
for (const d of snap.docs) {
  const a = d.data();
  if (a.patient?.newPatient !== true || !a.patient?.id) continue;
  flagged++;
  const startMs = a.start?.toDate ? a.start.toDate().getTime() : 0;
  const prior = await apc.where("patient.id", "==", a.patient.id).where("start", "<", new Date(startMs)).get();
  if (prior.size > 0) {
    stale++;
    if (beispiele.length < 8) beispiele.push(`${(a.patient.firstName || "")} ${(a.patient.lastName || "")}`.trim() + ` (Vortermine: ${prior.size})`);
  }
}
console.log(`Von ${flagged} als "Neupatient" geflaggten Terminen haben ${stale} in Wahrheit schon Vortermine (Flag veraltet).`);
console.log("Beispiele Rueckkehrer faelschlich als neu:", beispiele.join("; ") || "(keine)");
process.exit(0);
