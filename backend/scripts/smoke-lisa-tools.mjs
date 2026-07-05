// ============================================================================
// W-OUTREACH-2 Smoke — Lisas Kalender-Webhooks gegen das LAUFENDE Backend.
// Liest nur (offer-slots via getFreeTimeSlots); book-slot wird bewusst NICHT
// ausgelöst (würde echt buchen). Legt einen Wegwerf-Task an und räumt ihn weg.
//   node scripts/smoke-lisa-tools.mjs
// ============================================================================

import "dotenv/config";
import admin from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import { loadBooking, findSlots } from "../src/clara/booking.js";

const BASE = `http://127.0.0.1:${process.env.PORT || 4000}`;
const CLIENT = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
const SECRET = (process.env.LISA_TOOL_SECRET || "").trim();

async function post(path, body, secret) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Lisa-Tool-Secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

let fails = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? ` — ${detail}` : ""}`);
  if (!cond) fails++;
};

// 1) Ohne Secret -> 401
const noSecret = await post("/lisa/tools/offer-slots", { task_id: "x", client_id: CLIENT });
ok("ohne Secret abgewiesen (401)", noSecret.status === 401, `status=${noSecret.status}`);

// 2) Mit Secret, unbekannter Task -> höfliche No-Context-Ansage, KEINE Buchung
const badTask = await post("/lisa/tools/offer-slots", { task_id: "gibt_es_nicht", client_id: CLIENT }, SECRET);
ok("unbekannter Task -> keine Kalenderauskunft", badTask.status === 200 && badTask.data.ok === false && /keinen Kalenderzugriff|Rückruf|zurückruft/i.test(badTask.data.spoken || ""), JSON.stringify(badTask.data).slice(0, 160));

// 3) Echter Kontext: Wegwerf-Task mit bookingContext -> echte freie Slots.
// Kalender wählen, der wirklich freie Slots hat (sonst testet man nur den
// Leer-Fall — der ehrliche Leer-Text ist Check 3b unten trotzdem wert).
const booking = await loadBooking(CLIENT);
const vm = (booking.visitMotives || []).find((v) => /kontroll/i.test(v.name || "")) || (booking.visitMotives || [])[0];
let cal = (booking.calendars || [])[0];
for (const c of booking.calendars || []) {
  const probe = await findSlots(CLIENT, { calendarId: c.id, visitMotiveId: vm?.id }).catch(() => null);
  if (probe?.ok && (probe.slots || []).length) { cal = c; break; }
}
console.log(`      Testkalender: ${cal?.name || "?"} / Motiv: ${vm?.name || "?"}`);
const taskRef = masCollection(CLIENT, "mas_lisa_tasks").doc();
await taskRef.set({
  id: taskRef.id, kind: "call", status: "calling", phone: "+491700000000",
  contactName: "Smoke Test", prompt: "smoke", conversationId: "smoke", assignedBy: "Smoke",
  outcome: null, resultSummary: null, transcriptText: null,
  bookingContext: {
    kind: "smoke", patientId: "smoke-patient", patientName: "Smoke Test",
    visitMotiveId: vm?.id, visitMotiveName: vm?.name || null,
    calendarId: cal?.id, calendarName: cal?.name || null, slotIso: null,
  },
  ts: Date.now(),
});

try {
  const offer = await post("/lisa/tools/offer-slots", { task_id: taskRef.id, client_id: CLIENT, wish: "nächste Woche vormittags" }, SECRET);
  const slots = Array.isArray(offer.data.slots) ? offer.data.slots : [];
  ok("offer-slots liefert Ansage", offer.status === 200 && !!offer.data.spoken, JSON.stringify(offer.data).slice(0, 200));
  ok("offer-slots: echte Slots gefunden", offer.data.ok === true && slots.length > 0 && slots.every((x) => x.iso && x.spoken), JSON.stringify(offer.data).slice(0, 200));
  console.log(`      Ansage: ${String(offer.data.spoken || "").slice(0, 220)}`);
  for (const sl of slots) console.log(`      Slot: ${sl.iso}  ->  ${sl.spoken}`);

  // 4) book-slot MIT ausgedachter Uhrzeit -> Halluzinations-Wache muss greifen
  //    (bucht nichts, bietet Alternativen an). 03:13 Uhr nachts ist nie frei.
  const fake = await post("/lisa/tools/book-slot", { task_id: taskRef.id, client_id: CLIENT, slot_iso: "2026-07-14T03:13:00+02:00" }, SECRET);
  ok("book-slot: erfundene Nachtzeit wird NICHT gebucht", fake.status === 200 && fake.data.booked !== true && /nicht mehr frei|vergeben/i.test(fake.data.spoken || ""), JSON.stringify(fake.data).slice(0, 200));
} finally {
  await taskRef.delete().catch(() => {});
}

console.log(fails ? `\n${fails} Smoke-Checks FEHLGESCHLAGEN` : "\nAlle Smoke-Checks bestanden.");
process.exit(fails ? 1 : 0);
