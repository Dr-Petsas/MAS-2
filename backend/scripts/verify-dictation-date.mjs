import "dotenv/config";
import admin from "../src/firebase.js";
import { loadBooking } from "../src/clara/booking.js";

// READ-ONLY: prueft, unter welchem Termin (Datum!) ein Diktat gelandet ist.
const clientId = "MEe4ZQHEzOPzLcexyhdT";
const apptId = process.argv[2];
const dictId = process.argv[3];
if (!apptId) { console.error("usage: node verify-dictation-date.mjs <appointmentId> [dictationId]"); process.exit(1); }

const booking = await loadBooking(clientId);
const db = admin.firestore();
const ref = db.collection("clients").doc(clientId)
  .collection("locations").doc(booking.locationId)
  .collection("appointments").doc(apptId);
const snap = await ref.get();
const a = snap.data() || {};
const start = a.start?.toDate ? a.start.toDate() : null;
console.log("Termin:", apptId);
console.log("  start:", start ? start.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "?");
console.log("  patient:", `${a.patient?.firstName || ""} ${a.patient?.lastName || ""}`.trim());
console.log("  visitMotive:", a.visitMotive?.name || "");
if (dictId) {
  const d = await ref.collection("dictations").doc(dictId).get();
  const x = d.data() || {};
  const created = x.createdAt?.toDate ? x.createdAt.toDate() : null;
  console.log("Diktat:", dictId);
  console.log("  text:", String(x.text || "").slice(0, 90));
  console.log("  createdAt:", created ? created.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "?");
}
process.exit(0);
