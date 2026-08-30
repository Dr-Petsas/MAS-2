// W-MANDANT-7 (30.08.2026): End-to-End-Smoke fuer den Testmandanten praxis2.
//
// Beweist die Mandantenfaehigkeit an ECHTEN Modulen (kein Mock):
//   1. Registry:      aktiveMandanten() enthaelt meddent UND praxis2.
//   2. Scheduler:     fuerAlleMandanten() laeuft ueber beide, Fehler in einem
//                     Mandanten stoppt den anderen nicht.
//   3. Buchung:       Termin im praxis2-Kalender -> watchCalendarOnce("praxis2")
//                     sieht ihn im richtigen Mandanten.
//   4. Brain-Event:   appendEvent("praxis2") landet unter clients/praxis2/...
//                     und ist unter meddent NICHT sichtbar.
//   5. Gedaechtnis:   queryByPatient findet das Event nur im praxis2-Mandanten.
//
// Aufruf:  node scripts/smoke-praxis2.mjs   (braucht .env mit Firestore-Key)
// Der Testmandant bleibt bestehen (stehender Beweis); der Smoke ist mit
// zeitgestempelten IDs beliebig wiederholbar. meddent wird NUR gelesen.
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const MEDDENT = "MEe4ZQHEzOPzLcexyhdT";
const PRAXIS2 = "praxis2";
const LAUF = Date.now();

const { db } = await import("../src/firebase.js");
const adminMod = await import("../src/firebase.js");
const admin = adminMod.default;
const { aktiveMandanten, fuerAlleMandanten, mandantenCacheLeeren } = await import("../src/tenants.js");
const { watchCalendarOnce } = await import("../src/clara/calendarWatch.js");
const { appendEvent, getEvent, queryByPatient } = await import("../src/brain/eventStore.js");

let fehler = 0;
function pruefe(name, ok, detail = "") {
  const status = ok ? "PASS" : "FAIL";
  if (!ok) fehler += 1;
  console.log(`${status}  ${name}${detail ? " — " + detail : ""}`);
}

// --- 1) Registry -------------------------------------------------------------
mandantenCacheLeeren();
delete process.env.MAS_MANDANTEN; // echter Firestore-Stand, kein Override
const mandanten = await aktiveMandanten();
pruefe("Registry enthaelt meddent", mandanten.includes(MEDDENT), mandanten.join(", "));
pruefe("Registry enthaelt praxis2", mandanten.includes(PRAXIS2));
pruefe("meddent bleibt erster Mandant", mandanten[0] === MEDDENT);

// --- 2) Scheduler-Schleife mit Fehler-Isolation --------------------------------
const gelaufen = [];
await fuerAlleMandanten("w7.smoke", async (cid) => {
  if (cid === PRAXIS2) throw new Error("absichtlicher Testfehler praxis2");
  gelaufen.push(cid);
});
pruefe("Scheduler: meddent lief trotz praxis2-Fehler", gelaufen.includes(MEDDENT));

// --- 3) Buchung im praxis2-Kalender -------------------------------------------
// Sweep 1 = Grundlinie (Erst-Snapshot), dann Termin anlegen, Sweep 2 = der
// Kalender-Waechter erkennt die Buchung als Aenderung im RICHTIGEN Mandanten.
const grundlinie = await watchCalendarOnce(PRAXIS2);
pruefe("Buchung: praxis2-Kalenderwache laeuft (locationId gefunden)", grundlinie?.ok === true, JSON.stringify(grundlinie));

const morgen = new Date(Date.now() + 24 * 3600 * 1000);
morgen.setHours(10, 0, 0, 0);
const terminEnde = new Date(morgen.getTime() + 15 * 60000);
const terminRef = db
  .collection("clients").doc(PRAXIS2)
  .collection("locations").doc("praxis2loc")
  .collection("appointments").doc(`w7-smoke-${LAUF}`);
await terminRef.set({
  start: admin.firestore.Timestamp.fromDate(morgen),
  end: admin.firestore.Timestamp.fromDate(terminEnde),
  calendar: { id: "praxis2cal1", name: "Dr. Vlachos" },
  patient: { id: `w7-testpatient-${LAUF}`, firstName: "Tessa", lastName: "Testpatientin" },
  visitMotive: { id: "praxis2-kontrolle", name: "Kontrolluntersuchung" },
  status: "confirmed",
  createdBy: "w7-smoke",
});
const beobachtung = await watchCalendarOnce(PRAXIS2);
const snapDoc = await db.doc(`clients/${PRAXIS2}/mas_config/calendar_watch`).get().catch(() => null);
const snapItems = snapDoc?.exists ? Object.keys(snapDoc.get("items") || {}) : [];
pruefe(
  "Buchung: praxis2-Snapshot enthaelt den Termin",
  snapItems.includes(`w7-smoke-${LAUF}`),
  `tracked=${beobachtung?.tracked} changes=${beobachtung?.changes} recorded=${beobachtung?.recorded}`
);

// --- 4) Brain-Event nur im richtigen Mandanten ---------------------------------
const eventId = `w7-smoke-${LAUF}`;
await appendEvent(PRAXIS2, {
  id: eventId,
  summary: "W7-Smoke: Testereignis des Mandantenfaehigkeits-Beweises.",
  subject: { patientId: `w7-testpatient-${LAUF}`, name: "Tessa Testpatientin" },
  counterparty: { kind: "patient", name: "Tessa Testpatientin" },
});
const inPraxis2 = await getEvent(PRAXIS2, eventId);
const inMeddent = await getEvent(MEDDENT, eventId);
pruefe("Brain-Event liegt unter clients/praxis2", !!inPraxis2);
pruefe("Brain-Event ist bei meddent NICHT sichtbar", !inMeddent);

// --- 5) Gedaechtnis-Abfrage mandanten-scharf -----------------------------------
const trefferP2 = await queryByPatient(PRAXIS2, `w7-testpatient-${LAUF}`);
const trefferMd = await queryByPatient(MEDDENT, `w7-testpatient-${LAUF}`);
pruefe("Gedaechtnis: praxis2 findet den Testpatienten", trefferP2.length >= 1);
pruefe("Gedaechtnis: meddent findet ihn NICHT", trefferMd.length === 0);

console.log(fehler === 0 ? "\nW7-SMOKE GRUEN — praxis2 lebt im eigenen Mandanten." : `\nW7-SMOKE ROT — ${fehler} Pruefung(en) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
