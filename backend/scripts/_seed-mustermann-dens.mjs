// Helmut Mustermann (DENS Pat. 2) in Pickadoc + Termin Mo 18:00 Dr. Petsas.
import "dotenv/config";
import admin from "../src/firebase.js";

const clientId = "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";
const CAL_ID = "zex5bmv5jfIHWVW6zHbg";
const PAT_ID = "dens_mustermann_2";
const APPT_ID = "dens_mustermann_2_20260817_1800";

const db = admin.firestore();
const loc = db.collection("clients").doc(clientId).collection("locations").doc(locationId);

function prefixes(str, min) {
  const s = String(str || "").toLowerCase().trim();
  const out = [];
  for (let i = s.length; i >= min; i--) out.push(s.slice(0, i));
  return out;
}

function berlin(y, m, d, hh, mm) {
  // Europe/Berlin CEST = UTC+2 im August
  return new Date(Date.UTC(y, m - 1, d, hh - 2, mm, 0));
}

const phone = "03012345602";
const mobile = "01700000002";

async function run() {
  const calSnap = await loc.collection("calendars").doc(CAL_ID).get();
  const cal = calSnap.exists ? calSnap.data() : {};
  const calendarName = cal.name || "Dr. Petsas";

  const motives = await loc.collection("visitMotives").get();
  let motive = null;
  for (const d of motives.docs) {
    const n = String(d.data().name || "");
    if (/implantation|imp\b/i.test(n) && /klein|op/i.test(n)) { motive = { id: d.id, ...d.data() }; break; }
  }
  if (!motive) {
    for (const d of motives.docs) {
      const n = String(d.data().name || "");
      if (/kontrolle/i.test(n)) { motive = { id: d.id, ...d.data() }; break; }
    }
  }
  if (!motive && motives.docs[0]) motive = { id: motives.docs[0].id, ...motives.docs[0].data() };
  if (!motive) throw new Error("kein visitMotive");

  const existing = await loc.collection("patients").where("lastName", "==", "Mustermann").get();
  console.log("bestehende Mustermann:", existing.docs.map((d) => `${d.id} ${d.data().firstName} ext=${d.data().externalId || ""}`).join(" | ") || "(keine)");

  const start = berlin(2026, 8, 17, 18, 0);
  const end = berlin(2026, 8, 17, 19, 0);

  const clash = await loc.collection("appointments")
    .where("calendar.id", "==", CAL_ID)
    .where("start", ">=", start)
    .where("start", "<", end)
    .get();
  console.log("kollisionen 18:00:", clash.docs.map((d) => d.id).join(",") || "(keine)");

  const searchIndexes = [...new Set([
    ...prefixes("Helmut", 2),
    ...prefixes("Helmuth", 2),
    ...prefixes("Mustermann", 2),
    ...prefixes(phone, 5),
    ...prefixes(mobile, 5),
    "13051952",
    "2",
  ])];

  const patient = {
    id: PAT_ID,
    uid: "",
    importId: "2",
    importSource: "dens",
    externalId: "2",
    externalSource: "dens",
    title: "",
    firstName: "Helmut",
    lastName: "Mustermann",
    birthName: "",
    gender: "m",
    newPatient: true,
    city: "Berlin",
    postalCode: "12353",
    street: "Testweg 33",
    appointments: [APPT_ID],
    phoneNumber: phone,
    mobilePhoneNumber: mobile,
    email: "helmut.mustermann@example.test",
    comments: "DENS-Demo Pat.-Nr. 2. Kasse: AOK Nordost. Pseudo für Lena→DENS.",
    birthDate: new Date(Date.UTC(1952, 4, 13)),
    smsAllowed: false,
    emailAllowed: false,
    reminderAllowed: false,
    marketingAllowed: false,
    privateInsurance: false,
    clientIds: [clientId],
    profession: "Rentner",
    familyDoctorName: "",
    familyDoctorNameCity: "",
    searchIndexes,
    score: 3,
    tags: ["dens-demo", "mustermann"],
    location: { _latitude: 52.45, _longitude: 13.45 },
    lastAppointmentDate: start,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await loc.collection("patients").doc(PAT_ID).set(patient, { merge: true });

  const appt = {
    id: APPT_ID,
    clientId,
    locationId,
    importId: "",
    campaignId: "",
    start,
    end,
    isMultiDay: false,
    calendar: { id: CAL_ID, name: calendarName },
    resourceId: CAL_ID,
    visitMotive: {
      id: motive.id,
      name: motive.name || "Kontrolle",
      color: motive.color || "",
      specialityId: motive.specialityId || "",
    },
    patient: {
      id: PAT_ID,
      gender: "m",
      firstName: "Helmut",
      lastName: "Mustermann",
      newPatient: true,
      privateInsurance: false,
      mobilePhoneNumber: mobile,
      phoneNumber: phone,
      city: "Berlin",
      postalCode: "12353",
      street: "Testweg 33",
    },
    patientStatus: 0,
    comments: "DENS Pat.-Nr. 2 · Pseudo · Lena-Übertrag",
    title: "Mustermann Helmut",
    createdBy: "mas-dens-seed",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    roomId: "",
    roomName: "",
    deviceId: "",
    deviceName: "",
    isVideoCall: false,
    calendarItemType: "appointment",
    recurrenceCount: 0,
    status: "confirmed",
    remindLaterCount: 0,
    parentRecallId: "",
    recallId: "",
    predecessorId: "",
    successorId: "",
    documentsSent: false,
    patientDocsStatus: "none",
    autoSelectDocuments: false,
  };

  await loc.collection("appointments").doc(APPT_ID).set(appt, { merge: true });

  console.log("ok patient", PAT_ID, "externalId=2");
  console.log("ok termin", APPT_ID, start.toISOString(), "→", end.toISOString());
  console.log("kalender", calendarName, CAL_ID);
  console.log("grund", motive.name, motive.id);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
