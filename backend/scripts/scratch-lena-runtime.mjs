// Kurzdiagnose: settings/masRuntime + settings/lenaStt aus Firestore lesen.
import admin from "../src/firebase.js";

const db = admin.firestore();
for (const id of ["masRuntime", "lenaStt"]) {
  const snap = await db.collection("settings").doc(id).get();
  const d = snap.data() || {};
  if (d.updatedAt?.toDate) d.updatedAt = d.updatedAt.toDate().toISOString();
  console.log(id, JSON.stringify(d));
}
process.exit(0);
