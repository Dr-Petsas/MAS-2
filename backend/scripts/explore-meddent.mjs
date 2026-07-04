import "dotenv/config";
import admin from "../src/firebase.js";
import { loadBooking } from "../src/clara/booking.js";

// READ-ONLY: dumpt die echten Firestore-Shapes fuer den Demo-Seed.
const clientId = (process.argv[2] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
const db = admin.firestore();

function preview(o, max = 1500) {
  const seen = new WeakSet();
  const s = JSON.stringify(o, (k, v) => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[circular]";
      seen.add(v);
      if (typeof v.toDate === "function") return `TS(${v.toDate().toISOString()})`;
    }
    return v;
  }, 2);
  return s.length > max ? s.slice(0, max) + "\n...(gekuerzt)" : s;
}

const booking = await loadBooking(clientId);
const locationId = booking?.locationId;
console.log("=== BOOKING ===");
console.log("locationId:", locationId);
console.log("calendars:", JSON.stringify((booking?.calendars || []).map((c) => ({ id: c.id, name: c.name })), null, 2));
console.log("visitMotives:", JSON.stringify((booking?.visitMotives || []).map((v) => ({ id: v.id, name: v.name, duration: v.duration })), null, 2));

const apptCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("appointments");
console.log("\n=== SAMPLE APPOINTMENT (mit Patient) ===");
const snap = await apptCol.orderBy("start", "desc").limit(40).get();
let sampleAppt = null, samplePid = null;
for (const d of snap.docs) {
  const x = d.data();
  if (x?.patient?.id && x?.calendarItemType !== "absence") { sampleAppt = { __id: d.id, ...x }; samplePid = x.patient.id; break; }
}
console.log(sampleAppt ? preview(sampleAppt, 2200) : "kein Termin mit Patient gefunden");

console.log("\n=== SAMPLE ABSENCE ===");
let absence = snap.docs.map((d) => ({ __id: d.id, ...d.data() })).find((x) => x.calendarItemType === "absence");
console.log(absence ? preview(absence, 1200) : "keine Absence in den letzten 40 gefunden");

if (samplePid) {
  console.log("\n=== SAMPLE PATIENT ===", samplePid);
  const p = await db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("patients").doc(samplePid).get();
  console.log(p.exists ? preview(p.data(), 1500) : "patient doc fehlt");
  console.log("\n=== PDOCUMENTS dieses Patienten ===");
  const pdocs = await db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("patients").doc(samplePid).collection("pdocuments").limit(5).get();
  console.log("count:", pdocs.size);
  pdocs.docs.forEach((d, i) => { const x = d.data(); console.log(`-- pdoc[${i}] id=${d.id} name=${x.name} status=${x.status} hasFormRows=${Array.isArray(x.formRows)} pdfCreatedAt=${!!x.pdfCreatedAt}`); });
}

process.exit(0);
