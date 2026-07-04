import "dotenv/config";
import admin from "../src/firebase.js";

// Loescht ALLE Demo-Daten (Patienten, Termine, pdocuments, Cases) sauber weg.
// Idempotent + deckt alte (haeufige Namen) und neue (eindeutige Namen) IDs ab.
const clientId = "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";
const TAG = "demo-seed-2026-06-29";
const db = admin.firestore();
const loc = db.collection("clients").doc(clientId).collection("locations").doc(locationId);
const patCol = loc.collection("patients");
const apptCol = loc.collection("appointments");
const caseCol = db.collection("clients").doc(clientId).collection("mas_cases");

const IDS = [
  "demo_mueller", "demo_schneider", "demo_wagner", "demo_fischer", "demo_weber", "demo_becker", "demo_hoffmann", "demo_schaefer",
  "demo_morgenroth", "demo_lindenthal", "demo_steinkamp", "demo_achterberg", "demo_rosenbusch", "demo_wiesinger", "demo_brennecke", "demo_sonnberg",
];

let delAppt = 0, delCase = 0, delPat = 0, delDoc = 0;

// 1) Alle Demo-Termine ueber den createdBy-Marker
{
  const snap = await apptCol.where("createdBy", "==", TAG).get();
  for (const d of snap.docs) { await d.ref.delete(); delAppt++; }
}
// 2) Pro Demo-Patient: Cases, pdocuments, Patientendoc
for (const pid of IDS) {
  // Cases (meine demo_case_* + automatische Clara-Vorgaenge zu diesem Patienten)
  const cs = await caseCol.where("subject.patientId", "==", pid).get();
  for (const d of cs.docs) { await d.ref.delete(); delCase++; }
  // pdocuments
  const pdocs = await patCol.doc(pid).collection("pdocuments").get();
  for (const d of pdocs.docs) { await d.ref.delete(); delDoc++; }
  // Patientendoc
  const p = await patCol.doc(pid).get();
  if (p.exists) { await p.ref.delete(); delPat++; }
}
console.log(`Cleanup fertig: Termine=${delAppt}, Cases=${delCase}, Patienten=${delPat}, pdocuments=${delDoc}`);
process.exit(0);
