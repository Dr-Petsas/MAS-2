import "dotenv/config";
import admin from "../src/firebase.js";

// ============================================================================
// DEMO-SEED fuer CampaignR (Recall-Campaigner) — MedDent.
//
// Legt einen EIGENEN Bucket "DEMO" an (eigene Fachgruppe + eigener recall-
// faehiger Besuchsgrund), damit im CampaignR-Dashboard eine Card "DEMO" mit
// N Patienten erscheint — getrennt von den echten Fachgruppen.
//
// Angelegt wird:
//   - Fachgruppe (speciality) "DEMO"          -> Dashboard-Card heisst "DEMO"
//   - Besuchsgrund (visitMotive) "DEMO Recall"-> recall-faehig, NICHT online buchbar
//   - N (Default 10) Phantasie-Patienten, ALLE mit Chef-Nummer + Chef-Mail
//     (SMS/Anrufe/Mails landen NIE bei Fremden), jeweils mit einem laengst
//     ueberfaelligen, bestaetigten "DEMO Recall"-Termin -> landen im DEMO-Bucket.
//   - patient.recallBuckets + recallNextDueAt werden direkt gesetzt, damit der
//     Delta-Recompute die Patienten sicher aufgreift.
//
// Kompletter Durchspiel-Flow:
//   1) node scripts/seed-campaignr-demo.mjs
//   2) Frontend (med dent) neu laden (damit die neue Fachgruppe geladen wird)
//   3) CampaignR -> Button "Aktualisieren" (Buckets neu berechnen)
//   4) Card "DEMO" (+N) anklicken -> "Alle hinzufuegen"
//   5) "Weiter zur Kampagnen-Planung" -> konfigurieren -> starten
//   Alle SMS/Mails/Anrufe gehen an dr.petsas@pickadoc.de / 01776004600.
//
// Idempotent (feste Doc-IDs, merge). Aufraeumen: cleanup-campaignr-demo.mjs
//
// Optionen:
//   --count N      Anzahl Demo-Patienten (Default 10, max 12)
//   --overdue D    Tage seit letztem Termin (Default 300 -> sicher ueberfaellig)
// ============================================================================

const clientId = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";
const PHONE_E164 = "+491776004600";
const PHONE_LOCAL = "01776004600";
const EMAIL = "dr.petsas@pickadoc.de";
const TAG = "demo-campaignr-seed";

// Feste IDs des DEMO-Buckets (idempotent).
const DEMO_SPEC_ID = "demo_cr_speciality";
const DEMO_MOTIVE_ID = "demo_cr_motive";
const DEMO_COLOR = "#7c3aed"; // Violett — hebt den DEMO-Bucket klar ab.

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OVERDUE_DAYS = Math.max(1, parseInt(argVal("--overdue", "300"), 10) || 300);

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const root = db.collection("clients").doc(clientId).collection("locations").doc(locationId);
const patCol = root.collection("patients");
const apptCol = root.collection("appointments");
const specCol = root.collection("specialities");
const motCol = root.collection("visitMotives");
const calCol = root.collection("calendars");

// --- Helfer -----------------------------------------------------------------
function daysAgo(n, hhmm = "10:00") {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}
function namePrefixes(str) {
  const s = String(str || "").toLowerCase().trim();
  const out = [];
  for (let i = s.length; i >= 2; i--) out.push(s.slice(0, i));
  return out;
}
function phonePrefixes(p) {
  const out = [];
  for (let i = p.length; i >= 5; i--) out.push(p.slice(0, i));
  return out;
}
function searchIndexes(first, last) {
  return [...new Set([
    ...namePrefixes(first), ...namePrefixes(last),
    ...phonePrefixes(PHONE_E164), ...phonePrefixes(PHONE_LOCAL),
  ])];
}

// Eindeutige Phantasie-Namen (0 Kollision mit Bestand + bestehenden Demo-Seeds).
const POOL = [
  { first: "Katrin", last: "Sattler", gender: "f", birth: "1979-02-14" },
  { first: "Bernd", last: "Vogt", gender: "m", birth: "1968-08-22" },
  { first: "Lena", last: "Emmerich", gender: "f", birth: "1990-11-05" },
  { first: "Timo", last: "Kranz", gender: "m", birth: "1985-04-30" },
  { first: "Susanne", last: "Freytag", gender: "f", birth: "1973-07-18" },
  { first: "Ralf", last: "Ostheim", gender: "m", birth: "1962-01-09" },
  { first: "Miriam", last: "Waldner", gender: "f", birth: "1994-09-27" },
  { first: "Andreas", last: "Kienzle", gender: "m", birth: "1976-12-03" },
  { first: "Petra", last: "Radke", gender: "f", birth: "1981-05-16" },
  { first: "Jochen", last: "Pflug", gender: "m", birth: "1959-10-11" },
  { first: "Nadja", last: "Brenner", gender: "f", birth: "1988-03-21" },
  { first: "Uwe", last: "Hellmann", gender: "m", birth: "1971-06-07" },
];
const COUNT = Math.min(POOL.length, Math.max(1, parseInt(argVal("--count", "10"), 10) || 10));

async function run() {
  console.log(`\n=== CampaignR DEMO-Bucket-Seed (Client ${clientId}) ===\n`);

  // Kalender waehlen: bevorzugt "Dr. Petsas", sonst erster nicht-interner.
  const calSnap = await calCol.get();
  const cals = calSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const cal =
    cals.find((c) => /petsas/i.test(c.name || "")) ||
    cals.find((c) => c.name && !c.internal) ||
    cals[0];
  if (!cal) {
    console.error("FEHLER: Kein Kalender gefunden — falscher Client/Location?");
    process.exit(1);
  }
  const CAL = { id: cal.id, name: cal.name || "Kalender" };

  // 1) DEMO-Fachgruppe (speciality) -> Dashboard-Card "DEMO" ---------------
  await specCol.doc(DEMO_SPEC_ID).set({
    id: DEMO_SPEC_ID,
    name: "DEMO",
    shortName: "DEMO",
    color: DEMO_COLOR,
    cardinality: 999, // sortiert ans Ende
    isVideoCall: false,
  }, { merge: true });

  // 2) DEMO-Besuchsgrund (recall-faehig, NICHT online buchbar) -------------
  await motCol.doc(DEMO_MOTIVE_ID).set({
    id: DEMO_MOTIVE_ID,
    clientId,
    name: "DEMO Recall",
    nameForPatient: "DEMO Recall",
    allowOnlineBooking: false, // taucht NICHT in der Online-Terminbuchung auf
    specialityId: DEMO_SPEC_ID,
    overrideSpecialityColor: true,
    color: DEMO_COLOR,
    cardinality: 1,
    icon: "tooth",
    duration: 30,
    calendarIds: [],
    successorEnabled: false,
    successorId: "",
    successorInterval: "6-m",
    successorSmsText: "",
    recurrenceInterval: "6-m",
    recurrenceCount: -1, // != 0 -> recall-faehig (unendlich)
    patientInfo: "",
    videoLink: "",
    recallId: DEMO_MOTIVE_ID, // Recall-Ziel = dieser Besuchsgrund selbst
    recallSmsText: "DEMO Recall — Zeit fuer Ihren Kontrolltermin. (Testnachricht)",
    reminderSmsCustomTextEnabled: false,
    reminderSmsText: "",
    documentIds: [],
    maxAdvanceBookingMinutes: 129600,
    minAdvanceBookingMinutes: 30,
    minAdvanceCancellationMinutes: 240,
  }, { merge: true });

  // Bucket-Keys (identisch zu recallBucketsService.buildBucketKeys) --------
  const bucketKeys = [
    `mot:${DEMO_MOTIVE_ID}`,
    `spec:${DEMO_SPEC_ID}`,
    `calmot:${CAL.id}_${DEMO_MOTIVE_ID}`,
    `calspec:${CAL.id}_${DEMO_SPEC_ID}`,
  ];

  console.log(`Fachgruppe:   DEMO (${DEMO_SPEC_ID})`);
  console.log(`Besuchsgrund: DEMO Recall (${DEMO_MOTIVE_ID}, recall-faehig, nicht online buchbar)`);
  console.log(`Kalender:     ${CAL.name} (${CAL.id})`);
  console.log(`Bucket-Keys:  ${bucketKeys.join(", ")}`);
  console.log(`Anzahl:       ${COUNT} Patienten, letzter Termin vor ${OVERDUE_DAYS} Tagen\n`);

  const lastAppt = daysAgo(OVERDUE_DAYS);
  const dueInPast = daysAgo(Math.max(1, OVERDUE_DAYS - 180));
  const people = POOL.slice(0, COUNT);

  // 3) Patienten + ueberfaelliger DEMO-Recall-Termin -----------------------
  let n = 0;
  for (const p of people) {
    const id = `demo_cr_${p.last.toLowerCase()}`;
    const birthMs = new Date(`${p.birth}T00:00:00Z`).getTime();

    await patCol.doc(id).set({
      importId: "", importSource: TAG, title: "", firstName: p.first, lastName: p.last, birthName: "",
      gender: p.gender, city: "", postalCode: "", street: "", appointments: [],
      phoneNumber: "", mobilePhoneNumber: PHONE_E164, email: EMAIL,
      smsAllowed: true, emailAllowed: true, reminderAllowed: true, marketingAllowed: true,
      privateInsurance: false, clientIds: [clientId], profession: "",
      searchIndexes: searchIndexes(p.first, p.last), score: 5, tags: ["DEMO"],
      location: { _latitude: 0, _longitude: 0 }, createdAt: FieldValue.serverTimestamp(),
      id, documentsSent: false, birthDate: birthMs, uid: PHONE_E164,
      newPatient: false, externalSource: TAG,
      lastAppointmentDate: lastAppt,
      recallBuckets: bucketKeys,
      recallBucketsUpdatedAt: FieldValue.serverTimestamp(),
      recallNextDueAt: dueInPast,
    }, { merge: true });

    const start = lastAppt;
    const end = new Date(start.getTime() + 30 * 60000);
    await apptCol.doc(`demo_cr_appt_${id}`).set({
      id: "", clientId, locationId, importId: "", campaignId: "",
      start, end, isMultiDay: false,
      calendar: { ...CAL }, resourceId: CAL.id,
      visitMotive: { id: DEMO_MOTIVE_ID, name: "DEMO Recall", color: DEMO_COLOR, specialityId: DEMO_SPEC_ID },
      patient: {
        id, gender: p.gender, firstName: p.first, lastName: p.last, newPatient: false,
        privateInsurance: false, mobilePhoneNumber: PHONE_E164, phoneNumber: "",
        city: "", postalCode: "", street: "", location: { _latitude: 0, _longitude: 0 },
      },
      patientStatus: 2, createdBy: TAG,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      calendarItemType: "appointment", recurrenceCount: 1, status: "confirmed",
      remindLaterCount: 0, comments: "Demo-Recall-Termin (CampaignR DEMO-Bucket).",
      patientDocsStatus: "green", documentsSent: false,
    }, { merge: true });

    n++;
    console.log(`  [${String(n).padStart(2, " ")}] ${p.first} ${p.last} (${id})`);
  }

  console.log(`\nFertig: DEMO-Bucket mit ${n} Patienten angelegt. Marker externalSource="${TAG}".`);
  console.log(`Telefon: ${PHONE_E164} / ${PHONE_LOCAL}   E-Mail: ${EMAIL}\n`);
  console.log("Naechster Schritt im Frontend (med dent):");
  console.log("  1) Seite neu laden (damit die neue Fachgruppe 'DEMO' geladen wird)");
  console.log("  2) CampaignR oeffnen -> Button 'Aktualisieren' (Buckets neu berechnen)");
  console.log(`  3) Card 'DEMO' (+${n}) anklicken -> 'Alle hinzufuegen'`);
  console.log("  4) 'Weiter zur Kampagnen-Planung' -> konfigurieren -> starten");
  console.log("  (Alle Nachrichten/Anrufe gehen an den Chef-Kontakt oben.)\n");
  process.exit(0);
}

run().catch((e) => {
  console.error("SEED FEHLER:", e);
  process.exit(1);
});
