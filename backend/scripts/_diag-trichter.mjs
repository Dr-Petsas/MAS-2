import "dotenv/config";
import admin from "../src/firebase.js";
import { loadBooking } from "../src/clara/booking.js";
import { rankCandidatesForGap, gapFillCalendarBoundary } from "../src/clara/gapFill.js";
import { queryRecent } from "../src/brain/eventStore.js";
import { normalizePhone } from "../src/clara/callerLookup.js";
import { loadStatsMap, contactsInWindow, isBookedSuppressed, isSpamRisk } from "../src/clara/outreachStats.js";

const db = admin.firestore();
const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const booking = await loadBooking(clientId);
const locationId = booking.locationId;
const boundary = await gapFillCalendarBoundary(clientId);
console.log("Kalender-Grenze:", boundary, "| Location:", locationId);

console.log("\n=== 1) Kampagnen (Plattform) ===");
const campSnap = await db.collection("clients").doc(clientId).collection("locations").doc(locationId)
  .collection("campaigns").limit(100).get();
console.log("Kampagnen gesamt (max 100 gelesen):", campSnap.size);
const statusCount = {};
for (const d of campSnap.docs) {
  const c = d.data();
  statusCount[c.status] = (statusCount[c.status] || 0) + 1;
}
console.log("nach status (1 = gestartet, nur die zaehlen):", JSON.stringify(statusCount));
for (const d of campSnap.docs) {
  const c = d.data();
  let total = "?";
  try {
    const agg = await db.collection("clients").doc(clientId).collection("locations").doc(locationId)
      .collection("campaigns").doc(d.id).collection("patients").count().get();
    total = agg.data().count;
  } catch { /* count nicht verfuegbar */ }
  console.log(`  [status ${c.status}] ${c.name || d.id} | calendarId=${c.calendarId || "-"} | Patienten: ${total}`);
}

console.log("\n=== 2) Virtuelle Recalls (needsConfirmation) ===");
let recallTotal = "?";
try {
  const agg = await db.collection("clients").doc(clientId).collection("locations").doc(locationId)
    .collection("appointments").where("status", "==", "needsConfirmation").count().get();
  recallTotal = agg.data().count;
} catch { /* egal */ }
console.log("needsConfirmation gesamt:", recallTotal, "(Code liest max. 300 ohne Sortierung!)");
const recSnap = await db.collection("clients").doc(clientId).collection("locations").doc(locationId)
  .collection("appointments").where("status", "==", "needsConfirmation").limit(300).get();
const byCreator = {}; const byWindow = { faellig: 0, zukunft: 0, zuAlt: 0 }; const byCal = {};
const now = Date.now(); const oldest = now - 365 * 86400000;
let phoneMissing = 0;
for (const d of recSnap.docs) {
  const a = d.data();
  const cb = String(a.createdBy || "?");
  byCreator[cb] = (byCreator[cb] || 0) + 1;
  const startMs = a.start?.toMillis?.() ?? (a.start ? new Date(a.start).getTime() : 0);
  if (!startMs || startMs < oldest) byWindow.zuAlt++;
  else if (startMs > now + 7 * 86400000) byWindow.zukunft++;
  else byWindow.faellig++;
  const cal = a.calendar?.id || "-";
  byCal[cal] = (byCal[cal] || 0) + 1;
  const phone = String(a.patient?.mobilePhoneNumber || a.patient?.phoneNumber || "");
  if (!phone) phoneMissing++;
}
console.log("createdBy:", JSON.stringify(byCreator));
console.log("Faelligkeit (der 300 gelesenen): ", JSON.stringify(byWindow), "| ohne Telefon:", phoneMissing);
console.log("calendarId-Verteilung:", JSON.stringify(byCal));

console.log("\n=== 3) Trichter fuer die Luecke heute 13:00-15:00 (120 min, Petsas) ===");
// Kandidaten exakt wie runGapFill bauen (Import der internen Loader geht nicht — nachgebaut):
const { runGapFill } = await import("../src/clara/gapFill.js");
// Drossel-Schluessel wie im Code:
const since = Date.now() - 14 * 86400000;
const events = await queryRecent(clientId, since, 1000).catch(() => []);
const throttled = new Set();
for (const e of events) {
  if (e.channel !== "lisa_call" && e.channel !== "lisa_sms") continue;
  if (e.subject?.patientId) throttled.add(`p:${e.subject.patientId}`);
  const ref = normalizePhone(e.counterparty?.ref || "");
  if (ref) throttled.add(`t:${ref}`);
}
console.log("Drossel-Eintraege (14 Tage Lisa-Kontakte):", throttled.size);
