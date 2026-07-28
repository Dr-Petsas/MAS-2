// Diagnose 28.07.2026: Warum zeigt das Bucket-Inventar weniger Patienten als
// der Chef erwartet ("Kons insgesamt ueber 1000, ueber alle Kalender")?
// Liest ALLE needsConfirmation-Termine und zeigt pro Filter, wo wie viele
// Kandidaten verloren gehen. Nur Lesen, keine Schreibzugriffe.
import "dotenv/config";
import admin from "../src/firebase.js";
import { loadBooking } from "../src/clara/booking.js";
import { fachbereichOf } from "../src/clara/gapFill.js";

const db = admin.firestore();
const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const booking = await loadBooking(clientId);
const locationId = booking.locationId;

// Voll-Scan wie loadRecallInventory (paginiert, projiziert).
const rows = [];
const base = db.collection("clients").doc(clientId)
  .collection("locations").doc(locationId)
  .collection("appointments")
  .where("status", "==", "needsConfirmation")
  .select("createdBy", "start", "patient.id", "patient.mobilePhoneNumber",
    "patient.phoneNumber", "visitMotive.name", "calendar.id", "calendar.name")
  .orderBy("__name__")
  .limit(500);
let cursor = null;
for (;;) {
  const snap = await (cursor ? base.startAfter(cursor) : base).get();
  if (snap.empty) break;
  for (const d of snap.docs) rows.push(d.data());
  cursor = snap.docs[snap.docs.length - 1];
  if (snap.size < 500) break;
}
console.log("needsConfirmation GESAMT:", rows.length);

const zaehl = (obj, k) => { obj[k] = (obj[k] || 0) + 1; };
const now = Date.now();
const startMsOf = (a) => a.start?.toMillis?.() ?? (a.start ? new Date(a.start).getTime() : 0);

// 1) createdBy-Verteilung
const byCreator = {};
for (const a of rows) zaehl(byCreator, String(a.createdBy || "(leer)"));
console.log("\n[1] createdBy:", JSON.stringify(byCreator, null, 0));

// 2) Tore einzeln (auf dem Gesamtbestand)
const tore = { creatorRaus: 0, keinStart: 0, aelter3J: 0, zukunft7d: 0, ohneTelefon: 0, ohnePatientId: 0, durch: 0 };
const CREATORS = new Set(["recaller", "campaign", "predecessor"]);
const drei = now - 1095 * 86400000;
const fbDurch = {}; const fbAlle = {}; const fbCreatorRaus = {}; const calDurch = {};
for (const a of rows) {
  const fb = fachbereichOf(a.visitMotive?.name);
  zaehl(fbAlle, fb);
  const startMs = startMsOf(a);
  const creatorOk = CREATORS.has(String(a.createdBy || ""));
  if (!creatorOk) { tore.creatorRaus++; zaehl(fbCreatorRaus, fb); continue; }
  if (!startMs) { tore.keinStart++; continue; }
  if (startMs < drei) { tore.aelter3J++; continue; }
  if (startMs > now + 7 * 86400000) { tore.zukunft7d++; continue; }
  const phone = String(a.patient?.mobilePhoneNumber || a.patient?.phoneNumber || "").trim();
  if (!phone) { tore.ohneTelefon++; continue; }
  if (!String(a.patient?.id || "").trim()) { tore.ohnePatientId++; continue; }
  tore.durch++;
  zaehl(fbDurch, fb);
  zaehl(calDurch, String(a.calendar?.name || a.calendar?.id || "(ohne Kalender)"));
}
console.log("\n[2] Tore (Reihenfolge wie im Code):", JSON.stringify(tore, null, 0));
console.log("\n[3] Fachbereich GESAMT (alle needsConfirmation):", JSON.stringify(fbAlle, null, 0));
console.log("[3b] Fachbereich der durch createdBy AUSGESCHLOSSENEN:", JSON.stringify(fbCreatorRaus, null, 0));
console.log("[3c] Fachbereich DURCHGEKOMMEN (= heutiges Inventar):", JSON.stringify(fbDurch, null, 0));
console.log("\n[4] Kalender der Durchgekommenen:", JSON.stringify(calDurch, null, 0));

// 5) Wie saehe es aus, wenn createdBy egal waere (Rest der Tore gleich)?
const fbOhneCreatorTor = {}; let ohneCreatorTor = 0;
for (const a of rows) {
  const startMs = startMsOf(a);
  if (!startMs || startMs < drei || startMs > now + 7 * 86400000) continue;
  const phone = String(a.patient?.mobilePhoneNumber || a.patient?.phoneNumber || "").trim();
  if (!phone || !String(a.patient?.id || "").trim()) continue;
  ohneCreatorTor++;
  zaehl(fbOhneCreatorTor, fachbereichOf(a.visitMotive?.name));
}
console.log("\n[5] OHNE createdBy-Tor waeren es:", ohneCreatorTor, JSON.stringify(fbOhneCreatorTor, null, 0));

// 6) Wie viele scheitern NUR am 3-Jahres-Lookback (creator egal)?
let nurZuAlt = 0; const fbZuAlt = {};
for (const a of rows) {
  const startMs = startMsOf(a);
  if (!startMs || startMs >= drei) continue;
  const phone = String(a.patient?.mobilePhoneNumber || a.patient?.phoneNumber || "").trim();
  if (!phone || !String(a.patient?.id || "").trim()) continue;
  nurZuAlt++;
  zaehl(fbZuAlt, fachbereichOf(a.visitMotive?.name));
}
console.log("[6] aelter als 3 Jahre (mit Telefon):", nurZuAlt, JSON.stringify(fbZuAlt, null, 0));
process.exit(0);
