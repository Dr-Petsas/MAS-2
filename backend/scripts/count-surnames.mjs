import "dotenv/config";
import admin from "../src/firebase.js";
const clientId = "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";
const db = admin.firestore();
const patCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("patients");
const names = ["müller", "schneider", "wagner", "fischer", "weber", "becker", "hoffmann", "schäfer"];
for (const n of names) {
  const snap = await patCol.where("searchIndexes", "array-contains", n).limit(50).get();
  // demo-Eintraege rausrechnen
  const real = snap.docs.filter((d) => !String(d.id).startsWith("demo_"));
  console.log(`${n}: gesamt=${snap.size} (echte=${real.length}, demo=${snap.size - real.length})`);
}
process.exit(0);
