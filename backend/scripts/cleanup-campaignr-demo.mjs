import "dotenv/config";
import admin from "../src/firebase.js";

// ============================================================================
// Entfernt ALLE Daten von seed-campaignr-demo.mjs sauber wieder:
//   - Demo-Patienten (externalSource="demo-campaignr-seed")
//   - deren ueberfaellige DEMO-Recall-Termine (createdBy="demo-campaignr-seed")
//   - deren pdocuments (falls vorhanden)
//   - die DEMO-Fachgruppe (speciality) + den DEMO-Besuchsgrund (visitMotive)
//   - die DEMO-Bucket-Member-Snapshots (recallBucketMembers) fuer die DEMO-Keys
//
// NICHT automatisch geloescht: eine im Durchspiel erstellte Kampagne — die
// loeschst du bewusst im CampaignR-Dashboard (gibt den Recall-State frei).
//
//   node scripts/cleanup-campaignr-demo.mjs
// ============================================================================

const clientId = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";
const TAG = "demo-campaignr-seed";
const DEMO_SPEC_ID = "demo_cr_speciality";
const DEMO_MOTIVE_ID = "demo_cr_motive";

const db = admin.firestore();
const root = db.collection("clients").doc(clientId).collection("locations").doc(locationId);
const patCol = root.collection("patients");
const apptCol = root.collection("appointments");
const membersCol = root.collection("recallBucketMembers");

let delAppt = 0, delPat = 0, delDoc = 0, delMembers = 0;

// 1) Alle Demo-Termine ueber den createdBy-Marker.
{
  const snap = await apptCol.where("createdBy", "==", TAG).get();
  for (const d of snap.docs) { await d.ref.delete(); delAppt++; }
}

// 2) Alle Demo-Patienten ueber den externalSource-Marker (inkl. pdocuments).
{
  const snap = await patCol.where("externalSource", "==", TAG).get();
  for (const d of snap.docs) {
    const pdocs = await d.ref.collection("pdocuments").get();
    for (const pd of pdocs.docs) { await pd.ref.delete(); delDoc++; }
    await d.ref.delete();
    delPat++;
  }
}

// 3) DEMO-Bucket-Member-Snapshots (falls schon ein Recompute lief).
for (const key of [`mot:${DEMO_MOTIVE_ID}`, `spec:${DEMO_SPEC_ID}`]) {
  const bucketRef = membersCol.doc(key);
  const members = await bucketRef.collection("patients").get();
  for (const d of members.docs) { await d.ref.delete(); delMembers++; }
  const bd = await bucketRef.get();
  if (bd.exists) await bucketRef.delete();
}

// 4) DEMO-Fachgruppe + DEMO-Besuchsgrund.
await root.collection("visitMotives").doc(DEMO_MOTIVE_ID).delete().catch(() => {});
await root.collection("specialities").doc(DEMO_SPEC_ID).delete().catch(() => {});

console.log(`Cleanup fertig: Termine=${delAppt}, Patienten=${delPat}, pdocuments=${delDoc}, Bucket-Member=${delMembers}`);
console.log("DEMO-Fachgruppe + DEMO-Besuchsgrund entfernt.");
console.log("Hinweis: Danach im CampaignR-Dashboard 'Aktualisieren' klicken und die Seite");
console.log("neu laden, damit die DEMO-Card verschwindet. Ggf. Demo-Kampagne dort loeschen.");
process.exit(0);
