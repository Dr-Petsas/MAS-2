// Online-Zusage-Strecke (Chef 28.07.2026) — Firestore-Pins OHNE echte Buchung.
// Getestet wird alles bis zur Buchungskante: Ticket-Anlage, Erste-gewinnt-
// Reservierung (via vorbelegtem Fremd-Claim), "vergeben", "abgelaufen",
// Absage inkl. Kandidaten-Fortschreibung, Doppelklick-Idempotenz. Die
// Happy-Path-Buchung selbst laeuft im begleiteten Livetest (Demo-Kampagne
// bzw. Testpatient) — hier wuerde sie einen ECHTEN Termin eintragen.
//
// Aufraeumen: Test-Case + Claims werden am Ende geloescht.

import "dotenv/config";
import admin from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import { createSlotClaim, loadClaim, acceptClaim, declineClaim, claimUrlFor } from "../src/clara/slotClaim.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const CASE_ID = `gapfill_testclaim_${Date.now().toString(36)}`;

let fehler = 0;
function check(was, ok) {
  console.log(`${ok ? "  OK  " : "  FAIL"} ${was}`);
  if (!ok) fehler++;
}

const morgen = new Date(Date.now() + 86400000);
const datum = morgen.toISOString().slice(0, 10);
const slotIso = `${datum}T13:00:00+02:00`;

const claimBasis = {
  caseId: CASE_ID,
  patientName: "Testfall Ackermann",
  phone: "+491700000001",
  visitMotiveId: "vm_test",
  visitMotiveName: "Professionelle Zahnreinigung",
  topicLabel: "Professionelle Zahnreinigung",
  calendarId: "cal_test",
  calendarName: "Dr. Test",
  date: datum,
  timeLabel: "13:00",
  slotIso,
  practiceName: "MED:DENT Testpraxis",
  practicePhone: "0234 555555",
  source: "campaign",
  campaignId: "camp_test",
  locationId: "loc_test",
};

const aufraeumen = [];

try {
  // Test-Case mit zwei SMS-Kandidaten anlegen.
  console.log("[0] Aufbau: Test-Case");
  const c1 = await createSlotClaim(clientId, { ...claimBasis, patientId: "testpat_a" });
  const c2 = await createSlotClaim(clientId, { ...claimBasis, patientId: "testpat_b", patientName: "Testfall Kaya" });
  aufraeumen.push(c1.token, c2.token);
  await masCollection(clientId, "mas_cases").doc(CASE_ID).set({
    id: CASE_ID,
    title: "TESTFALL Online-Zusage (automatisch, wird geloescht)",
    status: "in_progress",
    assignee: "Lisa",
    updates: [],
    callList: {
      kind: "gap_fill",
      date: datum,
      calendarId: "cal_test",
      calendarName: "Dr. Test",
      slot: { startMin: 13 * 60, endMin: 15 * 60, minutes: 120, label: "13:00–15:00" },
      approvedBy: "Test",
      candidates: [
        { patientId: "testpat_a", name: "Testfall Ackermann", phone: "+491700000001", contact: { via: "sms", taskId: "t1", ok: true, at: Date.now(), claimToken: c1.token } },
        { patientId: "testpat_b", name: "Testfall Kaya", phone: "+491700000002", contact: { via: "sms", taskId: "t2", ok: true, at: Date.now(), claimToken: c2.token } },
      ],
    },
  });

  console.log("[1] Ticket-Anlage + Laden");
  const geladen = await loadClaim(clientId, c1.token);
  check("Claim traegt Slot + Praxis + Herkunft", geladen?.slotIso === slotIso && geladen?.practiceName === "MED:DENT Testpraxis" && geladen?.campaignId === "camp_test");
  check("Status beginnt offen", geladen?.status === "open");
  check("URL zeigt auf /z/<clientId>/<token>", claimUrlFor(clientId, c1.token).includes(`/z/${clientId}/${c1.token}`));
  check("Unbekannter Token -> null", (await loadClaim(clientId, "gibtsnicht123")) === null);

  console.log("[2] Absage: protokolliert + Kandidat fortgeschrieben");
  const abgesagt = await declineClaim(clientId, c2.token);
  check("declineClaim -> declined", abgesagt.state === "declined");
  const nachAbsage = await masCollection(clientId, "mas_cases").doc(CASE_ID).get();
  const kandB = nachAbsage.data().callList.candidates.find((x) => x.patientId === "testpat_b");
  check("Kandidat B traegt outcome=declined", kandB?.contact?.outcome === "declined");

  console.log("[3] Erste gewinnt: fremde Reservierung -> vergeben");
  // Fremd-Claim simuliert den schnelleren Klicker: Reservierung liegt am Case.
  await masCollection(clientId, "mas_cases").doc(CASE_ID).update({
    "callList.slotClaim": { token: "fremder_token", at: Date.now(), name: "Jemand Schnelleres" },
  });
  const zuSpaet = await acceptClaim(clientId, c1.token);
  check("acceptClaim -> gone (kein Buchungsversuch)", zuSpaet.state === "gone");
  check("Claim-Status persistiert gone", (await loadClaim(clientId, c1.token))?.status === "gone");
  const nochmalGone = await acceptClaim(clientId, c1.token);
  check("erneuter Klick bleibt gone", nochmalGone.state === "gone");

  console.log("[4] Vergeben ueber gebuchten Kandidaten (Telefon-Weg)");
  await masCollection(clientId, "mas_cases").doc(CASE_ID).update({
    "callList.slotClaim": admin.firestore.FieldValue.delete(),
    "callList.candidates": nachAbsage.data().callList.candidates.map((x) =>
      x.patientId === "testpat_b"
        ? { ...x, contact: { ...x.contact, outcome: "booked", bookedSlotIso: slotIso } }
        : x),
  });
  const c3 = await createSlotClaim(clientId, { ...claimBasis, patientId: "testpat_c", patientName: "Testfall Weber" });
  aufraeumen.push(c3.token);
  const telefonWeg = await acceptClaim(clientId, c3.token);
  check("Slot per Telefon gebucht -> Online-Zusage sieht vergeben", telefonWeg.state === "gone");

  console.log("[5] Abgelaufenes Angebot");
  const c4 = await createSlotClaim(clientId, {
    ...claimBasis,
    patientId: "testpat_d",
    slotIso: new Date(Date.now() - 3600000).toISOString(),
    date: new Date(Date.now() - 3600000).toISOString().slice(0, 10),
  });
  aufraeumen.push(c4.token);
  const abgelaufen = await acceptClaim(clientId, c4.token);
  check("Zusage nach Slot-Beginn -> expired", abgelaufen.state === "expired");

  console.log("[6] Doppelklick derselben Person waehrend Buchung");
  const c5 = await createSlotClaim(clientId, { ...claimBasis, patientId: "testpat_e" });
  aufraeumen.push(c5.token);
  await masCollection(clientId, "mas_slot_claims").doc(c5.token).update({ status: "booking" });
  const doppelt = await acceptClaim(clientId, c5.token);
  check("Status booking -> Seite zeigt gebucht (kein zweiter Buchungslauf)", doppelt.state === "booked");
} finally {
  console.log("[7] Aufraeumen");
  await masCollection(clientId, "mas_cases").doc(CASE_ID).delete().catch(() => {});
  for (const t of aufraeumen) {
    await masCollection(clientId, "mas_slot_claims").doc(t).delete().catch(() => {});
  }
  console.log(`  Test-Case ${CASE_ID} + ${aufraeumen.length} Claims geloescht.`);
}

console.log();
if (fehler) {
  console.log(`FAZIT: ${fehler} Pin(s) verletzt.`);
  process.exit(1);
}
console.log("FAZIT: Zusage-Strecke haelt — erste Zusage gewinnt, Rest sieht vergeben/abgelaufen.");
process.exit(0);
