import "dotenv/config";
import admin from "../src/firebase.js";
import { getDayAppointments } from "../src/clara/daySchedule.js";
import { getPatientAnamnese } from "../src/clara/anamnese.js";

// Wegwerf-Probe: Welche Patienten eines Tages haben unsignierte Anamnese-
// Boegen (formRows lesbar) und was wuerden die Flags melden?

const CLIENT = "MEe4ZQHEzOPzLcexyhdT";
const date = process.argv[2] || "2026-07-06";
const db = admin.firestore();
const loc = (await db.collection("clients").doc(CLIENT).collection("locations").limit(1).get()).docs[0];

const day = await getDayAppointments(CLIENT, { date });
console.log(date, "termine:", (day.appointments || []).length);
const seen = new Set();
for (const a of (day.appointments || []).filter((x) => x.patientId)) {
  if (seen.has(a.patientId)) continue;
  seen.add(a.patientId);
  const pd = await db.collection("clients").doc(CLIENT).collection("locations").doc(loc.id)
    .collection("patients").doc(a.patientId).collection("pdocuments").get();
  const ana = pd.docs.map((d) => d.data()).filter((o) => /anamnese/i.test(String(o.name || "")));
  const st = ana.map((o) => `${o.status}/rows:${(o.formRows || []).length}`).join(",");
  const r = await getPatientAnamnese(CLIENT, { patientId: a.patientId });
  console.log(
    a.patientName.padEnd(30),
    (st || "KEINE").padEnd(22),
    `signedOnly=${r.signedOnly}`,
    `findings=${r.findings.length}`,
    r.findings.slice(0, 4).map((f) => `${f.category}:${f.text}`).join(" | ")
  );
}
process.exit(0);
