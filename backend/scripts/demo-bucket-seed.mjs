import "dotenv/config";
import admin from "../src/firebase.js";

// ============================================================================
// DEMO-SEED: Testpatient "Michael Petsassss" in DREI Recall-Buckets
// (KFO, KB, Kons). Nur zum Prompt-Stresstest — ruft NIE bei Fremden an, weil
// alle Kontaktdaten auf die Chef-Testnummer zeigen.
//
// Nachname "Petsassss" (bewusst mit vielen s) -> spaeter leicht wiederzufinden
// und zu loeschen.
//
// Jeder Bucket traegt in cfg.phoneKi.prompt sein Hintergrundwissen + die
// VORSICHTIGE Ansprache (Patient weiss NICHT, welche Behandlung ansteht).
//
// Idempotent (feste Doc-IDs). Marker externalSource="demo-bucket-seed".
//   node scripts/demo-bucket-seed.mjs
// ============================================================================

const clientId = "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";
const PHONE_E164 = "+491776004600";
const PHONE_LOCAL = "01776004600";
const EMAIL = "dr.petsas@pickadoc.de";
const TAG = "demo-bucket-seed";

const PATIENT = { id: "demo_petsassss", first: "Michael", last: "Petsassss", gender: "m", birth: "1983-05-12" };

// Gemeinsamer, vorsichtiger Ansprache-Rahmen (gilt fuer JEDEN Bucket).
const CARE_FRAME =
  "WICHTIG zur Ansprache: Der Patient weiss NICHT, dass ein Termin ansteht oder welche Behandlung gemeint ist — ueberrasche ihn nicht mit einer angeblich faelligen Behandlung und tu nicht so, als sei ihm alles klar. " +
  "Eroeffne locker und unaufdringlich sinngemaess so: Bei uns sind Sie als Recall-Patient vorgemerkt, unter anderem fuer {WOFUER}. Jetzt ist bei uns kurzfristig ein Termin frei geworden, deshalb erlaube ich mir, Sie kurz anzurufen — vielleicht passt es ja zufaellig. " +
  "Bei Kostenfragen: nenne KEINE konkreten Preise; erklaere, dass die Kosten von der genauen Behandlung und der Krankenkasse abhaengen und die Praxis gerne einen unverbindlichen Kostenvoranschlag zusendet oder zurueckruft. " +
  "Name und unsere Rueckrufnummer liegen uns bereits vor — frage NICHT nach Name, Geburtsdatum oder Telefonnummer.";

function bucketPrompt(wofuer, hintergrund) {
  return CARE_FRAME.replace("{WOFUER}", wofuer) +
    " Hintergrund, den du auf Nachfrage einfach und ohne Fachlatein erklaeren darfst: " + hintergrund;
}

// Bucket-Definitionen. calendarId/visitMotive sind echte Werte dieser Praxis.
const BUCKETS = [
  {
    key: "kfo",
    campaignId: "demo_bucket_kfo",
    name: "DEMO Bucket KFO (Kieferorthopaedie)",
    calendarId: "zex5bmv5jfIHWVW6zHbg", calendarName: "Dr. Petsas",
    visitMotiveId: "eYBEmjfzEExWpzBFkR1q", visitMotiveName: "KFO Besprechung",
    overdueDays: 200,
    wofuer: "ein kieferorthopaedisches Beratungsgespraech",
    hintergrund:
      "Bei einem KFO-Beratungsgespraech schaut sich der Behandler die Stellung von Zaehnen und Kiefer an (zum Beispiel Zahn- oder Kieferfehlstellungen, Thema Zahnspange) und bespricht in Ruhe moegliche Optionen. Es ist ein unverbindliches Gespraech, es wird noch nichts behandelt.",
  },
  {
    key: "kb",
    campaignId: "demo_bucket_kb",
    name: "DEMO Bucket KB (Besprechung)",
    calendarId: "RHYdoQFD7oAhqIepLzC2", calendarName: "Dr. Patrikis",
    visitMotiveId: "RcgGY82C3sBIxsXY3kbv", visitMotiveName: "KB Besprechung",
    overdueDays: 160,
    wofuer: "einen Besprechungstermin",
    hintergrund:
      "Es ist ein Besprechungs- und Beratungstermin. Die genauen Inhalte klaert der Behandler im Termin persoenlich mit dem Patienten; es wird an diesem Termin noch nichts behandelt.",
  },
  {
    key: "kons",
    campaignId: "demo_bucket_kons",
    name: "DEMO Bucket Kons (Kontrolluntersuchung)",
    calendarId: "zex5bmv5jfIHWVW6zHbg", calendarName: "Dr. Petsas",
    visitMotiveId: "qOQCI4vV2EhQVmKmRqdu", visitMotiveName: "KCH Kontrolluntersuchung",
    overdueDays: 140,
    wofuer: "eine Kontrolluntersuchung",
    hintergrund:
      "Bei einer Kontrolluntersuchung prueft der Behandler in kurzer Zeit den aktuellen Zustand von Zaehnen und Zahnfleisch und erkennt moegliche Veraenderungen frueh. Ein kurzer Routine-Termin.",
  },
];

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const patCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("patients");
const campCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("campaigns");

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
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
}

async function run() {
  const birthMs = new Date(`${PATIENT.birth}T00:00:00Z`).getTime();

  // 1) Patient anlegen (findbar/loeschbar ueber Nachname "Petsassss").
  await patCol.doc(PATIENT.id).set({
    importId: "", importSource: TAG, title: "", firstName: PATIENT.first, lastName: PATIENT.last, birthName: "",
    gender: PATIENT.gender, city: "", postalCode: "", street: "", appointments: [],
    phoneNumber: "", mobilePhoneNumber: PHONE_E164, email: EMAIL,
    smsAllowed: true, emailAllowed: true, reminderAllowed: true, marketingAllowed: false,
    privateInsurance: false, clientIds: [clientId], profession: "",
    searchIndexes: searchIndexes(PATIENT.first, PATIENT.last), score: 5, tags: [],
    location: { _latitude: 0, _longitude: 0 }, createdAt: FieldValue.serverTimestamp(),
    id: PATIENT.id, documentsSent: false, birthDate: birthMs, uid: PHONE_E164,
    newPatient: false, externalSource: TAG,
  }, { merge: true });

  // 2) Drei Bucket-Kampagnen + Patient in jedem Bucket.
  for (const b of BUCKETS) {
    await campCol.doc(b.campaignId).set({
      id: b.campaignId,
      name: b.name,
      type: 2,
      status: 1,
      createdAt: FieldValue.serverTimestamp(),
      startDate: daysAgo(30),
      endDate: null,
      patientsSelected: 1,
      patientsReached: 0,
      conversions: 0,
      visitMotiveId: b.visitMotiveId,
      visitMotiveName: b.visitMotiveName,
      calendarId: b.calendarId,
      calendarName: b.calendarName,
      doctorName: b.calendarName,
      checkForNearbyAppointments: true,
      hidden: false,
      externalSource: TAG,
      cfg: {
        phoneKi: {
          enabled: true,
          kiName: "Lisa",
          prompt: bucketPrompt(b.wofuer, b.hintergrund),
        },
      },
    }, { merge: true });

    await campCol.doc(b.campaignId).collection("patients").doc(PATIENT.id).set({
      id: PATIENT.id, firstName: PATIENT.first, lastName: PATIENT.last, gender: PATIENT.gender,
      mobilePhoneNumber: PHONE_E164, phoneNumber: "", email: EMAIL,
      smsAllowed: true, emailAllowed: true, reminderAllowed: true,
      birthDate: birthMs, clientIds: [clientId],
      lastAppointmentDate: daysAgo(b.overdueDays),
      called: false, calledAt: null,
      smsSend: false, emailSend: false, notificationSendAt: null,
      appointmentMade: false, appointmentMadeAt: null, appointmentMadeFor: null,
      visitedLandingPage: false, visitedLandingPageAt: null,
      conversionStep: "", landingPageSource: "",
      externalSource: TAG,
    }, { merge: true });
  }

  console.log(`\n=== Bucket-Demo-Seed (Client ${clientId}) ===\n`);
  console.log(`Patient:   ${PATIENT.first} ${PATIENT.last} (id ${PATIENT.id})`);
  console.log(`Telefon:   ${PHONE_E164} / ${PHONE_LOCAL}`);
  console.log(`Buckets:`);
  for (const b of BUCKETS) {
    console.log(`  - ${b.key.toUpperCase().padEnd(4)} ${b.campaignId}  ->  ${b.visitMotiveName} @ ${b.calendarName}`);
  }
  console.log(`\nAnruf ausloesen:  node scripts/demo-bucket-call.mjs kfo|kb|kons\n`);
}

run().catch((e) => { console.error(e); process.exit(1); });
