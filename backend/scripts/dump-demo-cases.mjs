import "dotenv/config";
import admin from "../src/firebase.js";
const clientId = "MEe4ZQHEzOPzLcexyhdT";
const db = admin.firestore();
for (const pid of ["demo_schneider", "demo_mueller"]) {
  const snap = await db.collection("clients").doc(clientId).collection("mas_cases").where("subject.patientId", "==", pid).get();
  console.log(`\n=== cases fuer ${pid} (${snap.size}) ===`);
  for (const d of snap.docs) {
    const c = d.data();
    const last = (c.updates || [])[(c.updates || []).length - 1];
    console.log(`id=${d.id} topic=${c.topic} status=${c.status} createdBy=${c.createdBy} title="${c.title}"`);
    console.log(`   lastUpdate.kind=${last?.kind} text="${String(last?.text || "").slice(0, 90)}"`);
  }
}
process.exit(0);
