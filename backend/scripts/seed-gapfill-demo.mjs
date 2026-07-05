import "dotenv/config";
import admin from "../src/firebase.js";
import { DEMO_GAPFILL_CAMPAIGN_ID } from "../src/clara/gapFill.js";

// ============================================================================
// DEMO-SEED: Lückenfüller-Testfall mit Phantasiepatienten (MedDent).
// Legt an:
//   - 5 Recall-Kandidaten in einer gestarteten Demo-Kampagne (alle mit Chef-
//     Telefon + Chef-Mail — Anrufe/SMS landen NIE bei Fremden)
//   - 2 Termine am Testtag im Kalender Dr. Petsas → dazwischen/danach Lücken
//
// Idempotent (feste Doc-IDs). Marker externalSource="demo-gapfill-seed".
//   node scripts/seed-gapfill-demo.mjs
//   node scripts/seed-gapfill-demo.mjs --date 2026-07-14
// ============================================================================

const clientId = "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";
const CAL = { id: "zex5bmv5jfIHWVW6zHbg", name: "Dr. Petsas" };
const PHONE_E164 = "+491776004600";
const PHONE_LOCAL = "01776004600";
const EMAIL = "dr.petsas@pickadoc.de";
const TAG = "demo-gapfill-seed";
const CAMPAIGN_ID = DEMO_GAPFILL_CAMPAIGN_ID;

const PZR = {
  id: "ltzsbKhy03hLvuF4yOWX",
  name: "PRO professionelle Zahnreinigung",
  specialityId: "LyUQVzJs6fetJ07fpw8x",
  color: "#f4e862",
  duration: 30,
};

function defaultDemoDay() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const DAY = process.argv.includes("--date")
  ? process.argv[process.argv.indexOf("--date") + 1]
  : defaultDemoDay();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const patCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("patients");
const apptCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("appointments");
const campCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("campaigns");

function at(hhmm) {
  return new Date(`${DAY}T${hhmm}:00+02:00`);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
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

function searchIndexes(first, last, birthMs) {
  return [...new Set([
    ...namePrefixes(first), ...namePrefixes(last),
    ...phonePrefixes(PHONE_E164), ...phonePrefixes(PHONE_LOCAL),
  ])];
}

function patientEmbed(p) {
  return {
    id: p.id, gender: p.gender, firstName: p.first, lastName: p.last, newPatient: false,
    privateInsurance: false, mobilePhoneNumber: PHONE_E164, phoneNumber: "",
    city: "", postalCode: "", street: "", location: { _latitude: 0, _longitude: 0 },
  };
}

function apptDoc(p, startD, endD) {
  return {
    id: "", clientId, locationId, importId: "", campaignId: "",
    start: startD, end: endD, isMultiDay: false,
    calendar: { ...CAL }, resourceId: CAL.id,
    visitMotive: { id: PZR.id, name: PZR.name, color: PZR.color, specialityId: PZR.specialityId },
    patient: patientEmbed(p),
    patientStatus: 0, createdBy: TAG, createdAt: FieldValue.serverTimestamp(),
    calendarItemType: "appointment", recurrenceCount: 1, status: "confirmed",
    remindLaterCount: 0, comments: "Demo-Termin fuer Lueckenfueller-Test.",
    patientDocsStatus: "green", documentsSent: false,
  };
}

// Phantasie-Nachnamen — 0 echte Treffer im Bestand.
const RECALLS = [
  { id: "gapfill_brandt", first: "Helena", last: "Brandt", gender: "f", birth: "1980-04-11", overdueDays: 210 },
  { id: "gapfill_kupper", first: "Jonas", last: "Kupper", gender: "m", birth: "1972-09-03", overdueDays: 185 },
  { id: "gapfill_noll", first: "Sabine", last: "Noll", gender: "f", birth: "1965-12-28", overdueDays: 160 },
  { id: "gapfill_reiss", first: "Markus", last: "Reiss", gender: "m", birth: "1991-06-17", overdueDays: 140 },
  { id: "gapfill_berken", first: "Claudia", last: "Berken", gender: "f", birth: "1978-01-09", overdueDays: 120 },
];

async function run() {
  console.log(`\n=== Gapfill-Demo-Seed fuer ${DAY} (Client ${clientId}) ===\n`);

  // 1) Demo-Kampagne (gestartet)
  await campCol.doc(CAMPAIGN_ID).set({
    id: CAMPAIGN_ID,
    name: "DEMO Lückenfüller Recall",
    type: 2,
    status: 1,
    createdAt: FieldValue.serverTimestamp(),
    startDate: daysAgo(30),
    endDate: null,
    patientsSelected: RECALLS.length,
    patientsReached: 0,
    conversions: 0,
    visitMotiveId: PZR.id,
    visitMotiveName: PZR.name,
    calendarId: CAL.id,
    calendarName: CAL.name,
    doctorName: CAL.name,
    checkForNearbyAppointments: true,
    hidden: false,
    externalSource: TAG,
    cfg: { phoneKi: { enabled: true, kiName: "Lisa" } },
  }, { merge: true });

  // 2) Patienten + Kampagnen-Bucket
  for (const p of RECALLS) {
    const birthMs = new Date(`${p.birth}T00:00:00Z`).getTime();
    const lastAppt = daysAgo(p.overdueDays);

    await patCol.doc(p.id).set({
      importId: "", importSource: TAG, title: "", firstName: p.first, lastName: p.last, birthName: "",
      gender: p.gender, city: "", postalCode: "", street: "", appointments: [],
      phoneNumber: "", mobilePhoneNumber: PHONE_E164, email: EMAIL,
      smsAllowed: true, emailAllowed: true, reminderAllowed: true, marketingAllowed: false,
      privateInsurance: false, clientIds: [clientId], profession: "",
      searchIndexes: searchIndexes(p.first, p.last, birthMs), score: 5, tags: [],
      location: { _latitude: 0, _longitude: 0 }, createdAt: FieldValue.serverTimestamp(),
      id: p.id, documentsSent: false, birthDate: birthMs, uid: PHONE_E164,
      newPatient: false, externalSource: TAG,
    }, { merge: true });

    await campCol.doc(CAMPAIGN_ID).collection("patients").doc(p.id).set({
      id: p.id, firstName: p.first, lastName: p.last, gender: p.gender,
      mobilePhoneNumber: PHONE_E164, phoneNumber: "", email: EMAIL,
      smsAllowed: true, emailAllowed: true, reminderAllowed: true,
      birthDate: birthMs, clientIds: [clientId],
      lastAppointmentDate: lastAppt,
      called: false, calledAt: null,
      smsSend: false, emailSend: false, notificationSendAt: null,
      appointmentMade: false, appointmentMadeAt: null, appointmentMadeFor: null,
      visitedLandingPage: false, visitedLandingPageAt: null,
      conversionStep: "", landingPageSource: "",
      externalSource: TAG,
    }, { merge: true });
  }

  // 3) Zwei Termine am Testtag → Luecken davor/dazwischen/danach
  const blockers = [
    { id: "gapfill_block_am", start: "09:00", end: "09:30", who: RECALLS[0] },
    { id: "gapfill_block_pm", start: "14:00", end: "14:30", who: RECALLS[1] },
  ];
  for (const b of blockers) {
    await apptCol.doc(b.id).set(apptDoc(b.who, at(b.start), at(b.end)));
  }

  console.log(`Kampagne:  ${CAMPAIGN_ID} (${RECALLS.length} Demo-Kandidaten)`);
  console.log(`Telefon:   ${PHONE_E164} / ${PHONE_LOCAL}`);
  console.log(`E-Mail:    ${EMAIL}`);
  console.log(`Termine:   ${blockers.map((b) => `${b.start}-${b.end}`).join(", ")} am ${DAY}`);
  console.log("\nNaechster Schritt:");
  console.log(`  node scripts/play-gapfill-demo.mjs --date ${DAY}`);
  console.log("\nMit Clara (Voice, Schritt 1+2 sicher):");
  console.log(`  "Wo ist am ${DAY} Luft im Kalender?"`);
  console.log(`  "Wer sind die Kandidaten?"`);
  console.log("  NICHT 'Recall freigeben' sagen, solange nicht demoOnly aktiv ist!");
  console.log("\nGezieltes Einbestellen (Voice, sicher — ruft nur Chef-Nummer an):");
  console.log(`  "Suche Patientin Helena Brandt" → "Ruf sie an fuer ${DAY} um 10:30, PZR faellig"`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
