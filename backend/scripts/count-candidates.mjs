import "dotenv/config";
import admin from "../src/firebase.js";
const clientId = "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";
const db = admin.firestore();
const patCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("patients");
const cands = ["falkenrath", "morgenroth", "lindenthal", "steinkamp", "achterberg", "rosenbusch", "wiesinger", "brennecke", "sonnberg", "eichendorff", "vossberg", "kettenbach", "hagedorn", "reinholt", "thalbach", "wenningstedt"];
for (const n of cands) {
  const snap = await patCol.where("searchIndexes", "array-contains", n).limit(10).get();
  const real = snap.docs.filter((d) => !String(d.id).startsWith("demo_")).length;
  console.log(`${n}: echte=${real}`);
}
process.exit(0);
