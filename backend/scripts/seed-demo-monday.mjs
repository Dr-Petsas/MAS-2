import "dotenv/config";
import admin from "../src/firebase.js";
import { buildCase } from "../src/brain/cases.js";

// ============================================================================
// DEMO-SEED: 8 Phantasiepatienten fuer Montag im Kalender Dr. Petsas (MedDent).
// Idempotent (feste Doc-IDs, set ueberschreibt). Alle Patienten tragen die
// Demo-Nummer + Demo-Mail des Chefs, damit SMS/Anrufe NIE bei Fremden landen.
// Marker createdBy="demo-seed-2026-06-29" fuer spaeteres manuelles Aufraeumen.
// KEINE Euro-Betraege (Vorgabe + AGENTS-Regel 6).
//   node scripts/seed-demo-monday.mjs
// ============================================================================

const clientId = "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";
const CAL = { id: "zex5bmv5jfIHWVW6zHbg", name: "Dr. Petsas" };
const PHONE_E164 = "+491776004600";
const PHONE_LOCAL = "01776004600";
const EMAIL = "dr.petsas@pickadoc.de";
const DAY = "2026-06-29"; // Montag
const TAG = "demo-seed-2026-06-29";

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const patCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("patients");
const apptCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("appointments");
const caseCol = db.collection("clients").doc(clientId).collection("mas_cases");

// --- Zeit-/Index-Helfer -----------------------------------------------------
function at(hhmm) { return new Date(`${DAY}T${hhmm}:00+02:00`); } // CEST = +02:00
function daysAgo(n, hhmm = "10:00") { const d = new Date(); d.setDate(d.getDate() - n); const [h, m] = hhmm.split(":").map(Number); d.setHours(h, m, 0, 0); return d; }
function namePrefixes(str) { const s = String(str || "").toLowerCase().trim(); const out = []; for (let i = s.length; i >= 2; i--) out.push(s.slice(0, i)); return out; }
function phonePrefixes(p) { const out = []; for (let i = p.length; i >= 5; i--) out.push(p.slice(0, i)); return out; }
function birthVariants(ms) { const d = new Date(ms); const dd = String(d.getDate()).padStart(2, "0"); const mm = String(d.getMonth() + 1).padStart(2, "0"); const yy = d.getFullYear(); return [`${dd}.${mm}.${yy}`, `${dd}${mm}${yy}`]; }
function searchIndexes(first, last, birthMs) {
  return [...new Set([...namePrefixes(first), ...namePrefixes(last), ...phonePrefixes(PHONE_E164), ...phonePrefixes(PHONE_LOCAL), ...birthVariants(birthMs)])];
}

// Anamnese-Item (Radio "ja" + optionaler Freitext) — exakt das, was
// clara/anamnese.js (walkFindings) als auffaelligen Befund einsammelt.
function radioFinding(question, detail) {
  return {
    type: 8,
    labels: [{ key: "de", value: question }],
    value: "ja",
    answers: [{
      checked: true,
      labels: [{ key: "de", value: "Ja" }],
      formRows: detail ? [{ columns: [{ type: 5, labels: [{ key: "de", value: "Wenn ja, welche?" }], value: detail }] }] : [],
    }],
  };
}
const anamneseRows = (findings) => findings.map((f) => ({ columns: [radioFinding(f.q, f.detail || "")] }));

function patientEmbed(p) {
  return {
    id: p.id, gender: p.gender, firstName: p.first, lastName: p.last, newPatient: !!p.newPatient,
    privateInsurance: false, mobilePhoneNumber: PHONE_E164, phoneNumber: "",
    city: "", postalCode: "", street: "", location: { _latitude: 0, _longitude: 0 },
  };
}
function apptDoc(p, startD, endD, motive, comments, { status = 0, docs = "green" } = {}) {
  return {
    id: "", clientId, locationId, importId: "", campaignId: "",
    start: startD, end: endD, isMultiDay: false,
    calendar: { ...CAL }, resourceId: CAL.id,
    visitMotive: { id: motive.id, name: motive.name, color: motive.color || "", specialityId: motive.specialityId || "" },
    patient: patientEmbed(p),
    patientStatus: status, patientCheckedInAt: null, patientInTreatmentAt: null,
    patientCheckedOutAt: null, patientAbsentExcusedAt: null,
    createdBy: TAG, createdAt: FieldValue.serverTimestamp(),
    roomId: "", roomName: "", deviceId: "", deviceName: "", isVideoCall: false,
    calendarItemType: "appointment", recurrenceCount: 1, status: "confirmed",
    remindLaterCount: 0, parentRecallId: "", recallId: "", predecessorId: "", successorId: "",
    autoSelectDocuments: false, comments: comments || "", patientDocsStatus: docs, documentsSent: false,
  };
}

// --- Motive (echte IDs + specialityId/color aus dem Bestand) ----------------
// WICHTIG: specialityId MUSS gesetzt sein, sonst blendet der Kalender-Filter
// den Termin aus (calendarCtrl.tsx: Termine ohne speciality sind in keiner
// Fachbereich-Auswahl enthalten -> nicht sichtbar).
const M = {
  fuellung: { id: "qOQCI4vV2EhQVmKmRqdu", name: "KCH Kontrolluntersuchung", specialityId: "IN9yebPhhgzSrKQA895v", color: "#58aef9" },
  imp: { id: "F4EAa6O5qPo4n01AWD4Z", name: "IMP Besprechung", specialityId: "i1lFyIhTjKYKKSgvS4Wr", color: "#f00a19" },
  pzr: { id: "ltzsbKhy03hLvuF4yOWX", name: "PRO professionelle Zahnreinigung", specialityId: "LyUQVzJs6fetJ07fpw8x", color: "#f4e862" },
  wkb: { id: "6QHfsWALBRSyzBBbVCto", name: "KCH akute Beschwerden/Notfall", specialityId: "IN9yebPhhgzSrKQA895v", color: "#58aef9" },
  neu: { id: "Cyy90WyFR1TcUzp8W7ED", name: "KCH Erstuntersuchung/Neupatient", specialityId: "IN9yebPhhgzSrKQA895v", color: "#58aef9" },
  ze: { id: "8QCwEyR3Jyao63PmJ7vo", name: "ZE Besprechung", specialityId: "ljWiOmzaUHMZhA3FhKQQ", color: "#00a803" },
  bleaching: { id: "iZvtXtkhlt4llWZiv7T1", name: "PRO Zahnaufhellung", specialityId: "LyUQVzJs6fetJ07fpw8x", color: "#f4e862" },
  par: { id: "bFOA3k5EEGoMNMNvsflz", name: "PAR 1 Besprechung, Planerstellung", specialityId: "3v8NsxExze9UC508ugn9", color: "#6c0404" },
};

// --- Die 8 Patienten --------------------------------------------------------
// Eindeutige, aber realistisch klingende Nachnamen (0 echte Treffer im Bestand,
// 26.06. geprueft) - damit Anruf/SMS/Kontakt NIE versehentlich einen echten
// Patienten treffen und die Suche eindeutig aufloest.
const PATIENTS = [
  {
    id: "demo_morgenroth", first: "Thomas", last: "Morgenroth", gender: "m", birth: "1975-03-12",
    start: "09:00", end: "09:30", motive: M.fuellung,
    comments: "Füllung Zahn 26. Hat zweimal angerufen wegen seiner Rechnung, um eine Teilzahlung zu vereinbaren.",
    hist: { daysAgo: 40, motive: M.pzr, note: "PZR durchgeführt, leichte Zahnfleischblutung, Mundhygiene besprochen." },
    anamnese: [{ q: "Bestehen bei Ihnen Allergien?", detail: "Penicillin" }, { q: "Nehmen Sie regelmäßig Medikamente ein?", detail: "ASS 100" }],
  },
  {
    id: "demo_lindenthal", first: "Anja", last: "Lindenthal", gender: "f", birth: "1968-07-03",
    start: "09:30", end: "10:00", motive: M.imp, docs: "red",
    comments: "Implantat-OP Regio 36. OP-Aufklärung muss vor dem Eingriff unterschrieben werden.",
    hist: { daysAgo: 21, motive: M.imp, note: "Implantatplanung, Knochenangebot und Ablauf der OP besprochen." },
    anamnese: [{ q: "Nehmen Sie regelmäßig Medikamente ein?", detail: "Marcumar (Blutverdünner)" }, { q: "Bestehen Vorerkrankungen?", detail: "Diabetes mellitus Typ 2" }],
    opConsent: true,
    caseUpdate: "Frau Lindenthal hat per E-Mail die Bewilligung der Krankenkasse geschickt; Nadine hat bereits geantwortet. Alle Behandlungspläne sind genehmigt, und die Kostenübernahme ist über das Factoring abgesichert und steht auf Grün. Wichtig: Die OP-Aufklärung ist noch nicht unterschrieben und muss am Montag vor dem Eingriff erfolgen.",
  },
  {
    id: "demo_steinkamp", first: "Petra", last: "Steinkamp", gender: "f", birth: "1982-11-21",
    start: "10:00", end: "10:30", motive: M.pzr,
    comments: "Halbjährliche professionelle Zahnreinigung, Recall.",
    hist: { daysAgo: 182, motive: M.pzr, note: "PZR ohne besonderen Befund, Recall in 6 Monaten." },
    anamnese: [],
  },
  {
    id: "demo_achterberg", first: "Michael", last: "Achterberg", gender: "m", birth: "1959-01-30",
    start: "10:30", end: "11:00", motive: M.wkb,
    comments: "Wurzelkanalbehandlung Zahn 36, seit einer Woche Schmerzen.",
    hist: { daysAgo: 8, motive: M.wkb, note: "Akute Schmerzen Zahn 36, Röntgen, Trepanation und medikamentöse Einlage." },
    anamnese: [{ q: "Bestehen Vorerkrankungen?", detail: "Bluthochdruck" }],
  },
  {
    id: "demo_rosenbusch", first: "Sophie", last: "Rosenbusch", gender: "f", birth: "1994-05-17", newPatient: true,
    start: "11:00", end: "11:30", motive: M.neu,
    comments: "Neupatientin, Empfehlung von Frau Steinkamp. Erstuntersuchung.",
    hist: null,
    anamnese: [{ q: "Sind Sie schwanger?", detail: "" }],
  },
  {
    id: "demo_wiesinger", first: "Klaus", last: "Wiesinger", gender: "m", birth: "1963-09-08",
    start: "11:30", end: "11:50", motive: M.ze,
    comments: "Kronenversorgung Zahn 16, Abformung.",
    hist: { daysAgo: 60, motive: M.fuellung, note: "Kontrolle, Krone Zahn 16 empfohlen, Patient möchte überlegen." },
    anamnese: [],
  },
  {
    id: "demo_brennecke", first: "Laura", last: "Brennecke", gender: "f", birth: "1990-12-02",
    start: "11:50", end: "12:10", motive: M.bleaching,
    comments: "Bleaching-Beratung, Wunschtermin vor der Hochzeit.",
    hist: { daysAgo: 95, motive: M.pzr, note: "PZR, Aufhellung gewünscht, Beratung vereinbart." },
    anamnese: [],
  },
  {
    id: "demo_sonnberg", first: "Daniel", last: "Sonnberg", gender: "m", birth: "1971-04-25",
    start: "12:10", end: "12:30", motive: M.par,
    comments: "Parodontitis-Therapie, Planerstellung.",
    hist: { daysAgo: 30, motive: M.par, note: "Parodontale Befundung, Taschentiefen erhoben, Therapie geplant." },
    anamnese: [{ q: "Rauchen Sie?", detail: "" }, { q: "Bestehen Vorerkrankungen?", detail: "Diabetes mellitus Typ 2" }],
  },
];

async function run() {
  let n = 0;
  for (const p of PATIENTS) {
    const birthMs = new Date(`${p.birth}T00:00:00Z`).getTime();
    // 1) Patientendatensatz
    await patCol.doc(p.id).set({
      importId: "", importSource: "demo-seed", title: "", firstName: p.first, lastName: p.last, birthName: "",
      gender: p.gender, city: "", postalCode: "", street: "", appointments: [],
      phoneNumber: "", mobilePhoneNumber: PHONE_E164, email: EMAIL, comments: "",
      smsAllowed: true, emailAllowed: true, reminderAllowed: false, marketingAllowed: false,
      privateInsurance: false, clientIds: [clientId], profession: "", familyDoctorName: "", familyDoctorNameCity: "",
      searchIndexes: searchIndexes(p.first, p.last, birthMs), score: 5, tags: [],
      location: { _latitude: 0, _longitude: 0 }, createdAt: FieldValue.serverTimestamp(),
      id: p.id, documentsSent: false, birthDate: birthMs, uid: PHONE_E164,
      newPatient: !!p.newPatient, externalSource: "demo-seed",
    }, { merge: true });

    // 2) Montagstermin
    await apptCol.doc(`demo_appt_${p.id}`).set(apptDoc(p, at(p.start), at(p.end), p.motive, p.comments, { status: 0, docs: p.docs || "green" }));

    // 3) Vorgeschichte (letzter Termin, behandelt)
    if (p.hist) {
      const hs = daysAgo(p.hist.daysAgo, "10:00");
      const he = new Date(hs.getTime() + 30 * 60000);
      await apptCol.doc(`demo_hist_${p.id}`).set(apptDoc(p, hs, he, p.hist.motive, p.hist.note, { status: 2, docs: "green" }));
    }

    // 4) Anamnese (unsigniert, formRows lesbar) — treibt NICHT die Unterlagen-Ampel
    if (p.anamnese && p.anamnese.length) {
      await patCol.doc(p.id).collection("pdocuments").doc("demo_anamnese").set({
        name: "Anamnesebogen", status: "filled", formRows: anamneseRows(p.anamnese),
        createdAt: FieldValue.serverTimestamp(), createdBy: TAG,
      });
    }
    // 4b) OP-Aufklaerung unsigniert (status none -> rote Unterlagen-Ampel)
    if (p.opConsent) {
      await patCol.doc(p.id).collection("pdocuments").doc("demo_opaufklaerung").set({
        name: "OP-Aufklärung Implantation", status: "none", formRows: [],
        documentsSent: false, createdAt: FieldValue.serverTimestamp(), createdBy: TAG,
      });
    }

    // 5) Offener Vorgang (Brain-Case) — der Jaw-Dropper im Heads-up
    if (p.caseUpdate) {
      const c = buildCase({
        clientId, topic: "billing", assignee: "Nadine", status: "in_progress", createdBy: TAG,
        subject: { patientId: p.id, name: `${p.first} ${p.last}` },
        title: `Rechnung/Kosten – ${p.first} ${p.last}`,
        contactCount: 1,
        updates: [{ kind: "contact", by: "Nadine", ts: Date.now() - 3600_000, text: p.caseUpdate }],
      });
      await caseCol.doc(`demo_case_${p.id}`).set({ ...c, id: `demo_case_${p.id}`, createdAt: FieldValue.serverTimestamp() });
    }
    n++;
    console.log(`  [${n}] ${p.first} ${p.last} (${p.last.toLowerCase()}) ${p.start}-${p.end} · ${p.motive.name}${p.anamnese?.length ? " · Anamnese" : ""}${p.opConsent ? " · OP-Aufkl. ROT" : ""}${p.caseUpdate ? " · Vorgang" : ""}`);
  }
  console.log(`\nFertig: ${n} Demo-Patienten fuer ${DAY} (Kalender ${CAL.name}) angelegt. Marker createdBy="${TAG}".`);
  process.exit(0);
}
run().catch((e) => { console.error("SEED FEHLER:", e); process.exit(1); });
