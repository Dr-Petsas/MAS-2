import "dotenv/config";
import admin from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import { ensureBerlinTz } from "../src/clara/booking.js";
import { todayBerlin } from "../src/clara/daySchedule.js";
import { appendEvent } from "../src/brain/eventStore.js";
import {
  parseTimeToMinutes, parseSpan, workingDayOf, computeGapWindows, weekdayIndexOf,
  rankCandidatesForGap, gapCaseId, buildVoicemailScript, runGapFill,
  gapFillOverview, approveCallList, buildSpokenGapBriefing,
} from "../src/clara/gapFill.js";
import { normalizePhone, phonesMatch, lookupCaller } from "../src/clara/callerLookup.js";

// Lückenfüller (Umsatz-Coach Stufe 1) + Caller-ID-Lookup: pure gap/ranking
// math, consent + throttle gates, idempotent Gesprächsauftrag cases with
// individual approval, and the inbound caller context. Run:
//   node scripts/test-gap-fill.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const C = "zzz-mas2-gapfill";
const LOC = "locGap";
const db = admin.firestore();
const DATE = todayBerlin();
const at = (h, m) => new Date(ensureBerlinTz(`${DATE}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`));

const locRef = () => db.collection("clients").doc(C).collection("locations").doc(LOC);

async function wipe(colRef) {
  const snap = await colRef.get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function cleanup() {
  await wipe(locRef().collection("appointments"));
  await wipe(locRef().collection("calendars"));
  const camps = await locRef().collection("campaigns").get();
  for (const c of camps.docs) {
    await wipe(c.ref.collection("patients"));
    await c.ref.delete();
  }
  await wipe(db.collection("clients").doc(C).collection("users"));
  await wipe(masCollection(C, "mas_cases"));
  await wipe(masCollection(C, "mas_events"));
  await wipe(masCollection(C, "mas_config"));
  await wipe(masCollection(C, "mas_prompt_versions"));
}

async function run() {
  console.log("=== pure: Zeit-Parser (Objekt + String) ===");
  check(parseTimeToMinutes({ hour: 8, minute: 30 }) === 510, "{hour,minute} -> Minuten");
  check(parseTimeToMinutes("08:30") === 510, '"HH:mm" -> Minuten');
  check(parseTimeToMinutes("kaputt") === null, "Müll -> null");
  check(parseSpan({ start: { hour: 8, minute: 0 }, end: { hour: 12, minute: 0 } })?.end === 720, "Span aus Objekten");
  check(parseSpan("08:00-12:00")?.start === 480, "Span aus String");
  check(parseSpan("12:00-08:00") === null, "Ende vor Start -> null");

  console.log("\n=== pure: Öffnungszeiten + Lückenfenster ===");
  const oh = {
    enabled: true,
    monday: { hasOpen: true, hasPause: true, open: { start: { hour: 8, minute: 0 }, end: { hour: 18, minute: 0 } }, pause: { start: { hour: 12, minute: 0 }, end: { hour: 13, minute: 0 } } },
    sunday: { hasOpen: false, open: { start: { hour: 8, minute: 0 }, end: { hour: 12, minute: 0 } } },
  };
  const wdMon = workingDayOf(oh, 1);
  check(wdMon && wdMon.open.start === 480 && wdMon.pause?.start === 720, "Montag: offen 08-18, Pause 12-13");
  check(workingDayOf(oh, 0) === null, "Sonntag geschlossen -> null");
  check(workingDayOf(null, 1) === null, "fehlende Öffnungszeiten -> null");

  // 08-18 mit Pause 12-13; belegt 09:00-10:30 und 15:00-16:00.
  const gaps = computeGapWindows(wdMon, [
    { startMin: 540, endMin: 630 },
    { startMin: 900, endMin: 960 },
  ]);
  const labels = gaps.map((g) => g.label);
  check(labels.join("|") === "08:00–09:00|10:30–12:00|13:00–15:00|16:00–18:00", `Lücken korrekt (war ${labels.join("|")})`);
  check(gaps[1].minutes === 90, "Lückendauer korrekt berechnet");
  const tiny = computeGapWindows({ open: { start: 480, end: 510 } }, []);
  check(tiny.length === 1 && computeGapWindows({ open: { start: 480, end: 500 } }, []).length === 0, "Mini-Lücken unter Schwelle werden ignoriert");
  // Termin ragt über die Öffnungszeit hinaus -> sauber gekappt, kein Crash.
  const clipped = computeGapWindows({ open: { start: 480, end: 720 } }, [{ startMin: 400, endMin: 540 }]);
  check(clipped.length === 1 && clipped[0].startMin === 540, "überlappender Termin wird auf Öffnungszeit gekappt");
  check(weekdayIndexOf("2026-06-08") === 1, "2026-06-08 ist ein Montag");

  console.log("\n=== pure: Ranking + Gates ===");
  const cand = (o) => ({ patientId: o.id, name: o.id, phone: "0170", phoneNorm: `+49170${o.id}`, durationMin: 30, calendarId: null, overdueDays: 0, alreadyCalled: false, consent: { sms: true }, ...o });
  const gap60 = { minutes: 60 };
  const ranked = rankCandidatesForGap([
    cand({ id: "langsam", overdueDays: 10 }),
    cand({ id: "dringend", overdueDays: 200 }),
    cand({ id: "zulang", durationMin: 90, overdueDays: 500 }),
    cand({ id: "fremdkalender", calendarId: "calX", overdueDays: 300 }),
    cand({ id: "schongerufen", alreadyCalled: true, overdueDays: 300 }),
    cand({ id: "gedrosselt", overdueDays: 400 }),
  ], gap60, { calendarId: "cal1", throttled: new Set(["p:gedrosselt"]) });
  check(ranked.map((c) => c.patientId).join(",") === "dringend,langsam", `Gates + Ranking (war ${ranked.map((c) => c.patientId).join(",")})`);
  const dedup = rankCandidatesForGap([cand({ id: "x", source: "campaign" }), cand({ id: "x", source: "recall" })], gap60, {});
  check(dedup.length === 1, "ein Patient erscheint nur einmal pro Liste");

  console.log("\n=== pure: Telefonnummern + IDs + AB-Skript ===");
  check(normalizePhone("0171 123 45 67") === "+491711234567", "0171 -> +49171");
  check(normalizePhone("0049 171 1234567") === "+491711234567", "0049 -> +49");
  check(normalizePhone("+49 (171) 1234567") === "+491711234567", "Klammern/Leerzeichen entfernt");
  check(normalizePhone("123") === "", "zu kurz -> leer");
  check(phonesMatch("0171/1234567", "+49 171 1234567"), "Formate matchen über Normalisierung");
  check(!phonesMatch("01711234567", "01719999999"), "verschiedene Nummern matchen nicht");
  check(gapCaseId(C, "cal1", DATE, 480) === gapCaseId(C, "cal1", DATE, 480), "Case-ID deterministisch");
  check(gapCaseId(C, "cal1", DATE, 480) !== gapCaseId(C, "cal1", DATE, 510), "andere Lücke -> andere Case-ID");
  const vm = buildVoicemailScript({ practiceName: "Praxis Dr. Test", practicePhone: "030 123456" });
  check(/Praxis Dr\. Test/.test(vm) && /030 123456/.test(vm) && !/Zahnreinigung|Recall|Behandlung/.test(vm), "AB-Skript neutral, ohne medizinische Details");

  console.log("\n=== Firestore: Coach-Lauf (isolierter Test-Mandant) ===");
  await cleanup();

  // Praxis-Setup: 1 Behandler, Öffnungszeiten 08-12 an ALLEN Tagen (testtag-unabhängig).
  const allDay = { hasOpen: true, hasPause: false, open: { start: { hour: 8, minute: 0 }, end: { hour: 12, minute: 0 } }, pause: { start: { hour: 12, minute: 0 }, end: { hour: 13, minute: 0 } } };
  const week = {};
  for (const d of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]) week[d] = allDay;
  await db.collection("clients").doc(C).collection("users").doc("u1").set({ openingHours: { enabled: true, ...week } });
  await locRef().collection("calendars").doc("cal1").set({ userId: "u1", name: "Dr. Gap" });
  await masCollection(C, "mas_config").doc("booking").set({
    clientId: C, locationId: LOC,
    practiceName: "Praxis Dr. Gap", practicePhone: "030 555 123",
    calendars: [{ id: "cal1", name: "Dr. Gap" }],
    visitMotives: [{ id: "vmPzr", name: "Professionelle Zahnreinigung", duration: 60 }, { id: "vmK", name: "Kontrolle", duration: 30 }],
  });

  // Kalender heute: 1 echter Termin 09:00-09:30 -> Lücken 08-09 (60) und 09:30-12 (150).
  await locRef().collection("appointments").doc("a1").set({
    start: at(9, 0), end: at(9, 30), calendar: { id: "cal1", name: "Dr. Gap" },
    visitMotive: { id: "vmK", name: "Kontrolle" }, patient: { id: "p0", firstName: "Belegt", lastName: "B" },
    status: "confirmed", isMultiDay: false,
  });

  // Kampagnen-Bucket: p1 (überfällig 200 Tage, Einwilligung), p3 (konvertiert), p4 (keine Nummer), p5 (gedrosselt).
  const campRef = locRef().collection("campaigns").doc("camp1");
  await campRef.set({ name: "PZR Recall", status: 1, type: 1, visitMotiveId: "vmPzr", visitMotiveName: "Professionelle Zahnreinigung", calendarId: "" });
  const days = (n) => new Date(Date.now() - n * 86400000);
  await campRef.collection("patients").doc("p1").set({ firstName: "Anna", lastName: "Ackermann", mobilePhoneNumber: "0170 1111111", smsAllowed: true, reminderAllowed: true, appointmentMade: false, called: false, lastAppointmentDate: days(200) });
  await campRef.collection("patients").doc("p3").set({ firstName: "Carl", lastName: "Convertiert", mobilePhoneNumber: "0170 3333333", smsAllowed: true, appointmentMade: true, called: false, lastAppointmentDate: days(300) });
  await campRef.collection("patients").doc("p4").set({ firstName: "Doris", lastName: "OhneNummer", smsAllowed: true, appointmentMade: false, called: false });
  await campRef.collection("patients").doc("p5").set({ firstName: "Emil", lastName: "Gedrosselt", mobilePhoneNumber: "0170 5555555", smsAllowed: true, appointmentMade: false, called: false, lastAppointmentDate: days(400) });

  // Fälliger virtueller Recall (30 Tage überfällig) -> zweite Kandidatenquelle.
  await locRef().collection("appointments").doc("vrec").set({
    start: days(30), end: new Date(days(30).getTime() + 30 * 60000),
    calendar: { id: "cal1", name: "Dr. Gap" }, visitMotive: { id: "vmK", name: "Kontrolle" },
    patient: { id: "p2", firstName: "Bernd", lastName: "Recall", mobilePhoneNumber: "0171 2222222" },
    status: "needsConfirmation", createdBy: "recaller", isMultiDay: false,
  });

  // Drossel: Lisa hat p5 vor 3 Tagen schon per SMS kontaktiert (steht im Gehirn).
  await appendEvent(C, {
    clientId: C, channel: "lisa_sms", direction: "out", type: "interaction",
    counterparty: { kind: "patient", name: "Emil Gedrosselt", ref: "+491705555555" },
    subject: { patientId: "p5", name: "Emil Gedrosselt" },
    summary: "Recall-SMS gesendet.", ts: Date.now() - 3 * 86400000,
  });

  const run1 = await runGapFill(C, { date: DATE, horizonDays: 1 });
  check(run1.ok, "Coach-Lauf ok");
  check(run1.gaps.length === 2, `2 echte Lücken erkannt (war ${run1.gaps.length}: ${run1.gaps.map((g) => g.label).join(", ")})`);
  const g1 = run1.gaps.find((g) => g.label === "08:00–09:00");
  check(!!g1 && g1.minutes === 60, "Lücke 08:00–09:00 (60 min) gegen Öffnungszeiten berechnet");
  check(run1.callLists.length === 2, `2 Anruflisten erzeugt (war ${run1.callLists.length})`);

  const overview1 = await gapFillOverview(C);
  check(overview1.pending.length === 2 && overview1.approved.length === 0, "beide Listen warten auf Freigabe");
  const list1 = overview1.pending.find((l) => l.slot.label === "08:00–09:00");
  const names = list1.candidates.map((c) => c.patientId);
  check(names[0] === "p1", `dringendster Kandidat zuerst (war ${names.join(",")})`);
  check(names.includes("p2"), "fälliger virtueller Recall ist Kandidat");
  check(!names.includes("p3"), "konvertierter Kampagnen-Patient ausgeschlossen");
  check(!names.includes("p4"), "Patient ohne Telefonnummer ausgeschlossen");
  check(!names.includes("p5"), "kürzlich kontaktierter Patient gedrosselt");
  check(/Praxis Dr\. Gap/.test(list1.voicemailScript), "AB-Skript trägt Praxisnamen");
  check(/^pv:lisa:\d+$/.test(list1.promptVersionTag), `Anrufliste trägt Lisa-Prompt-Version (${list1.promptVersionTag})`);
  const p1cand = list1.candidates.find((c) => c.patientId === "p1");
  check(p1cand.consent.sms === true && /Kampagne/.test(p1cand.reason), "Kandidat trägt Einwilligung + Grund");

  console.log("\n=== Firestore: Idempotenz + Freigabe ===");
  const run2 = await runGapFill(C, { date: DATE, horizonDays: 1 });
  const overview2 = await gapFillOverview(C);
  check(overview2.pending.length === 2, "zweiter Lauf erzeugt KEINE Duplikate (idempotente Case-IDs)");
  check(run2.callLists.every((l) => l.created === false), "bestehende Listen wurden nur aufgefrischt");

  const appr = await approveCallList(C, list1.caseId, { by: "Dr. Gap" });
  check(appr.ok && appr.approvedBy === "Dr. Gap", "Anrufliste einzeln freigegeben");
  const apprAgain = await approveCallList(C, list1.caseId, { by: "Dr. Gap" });
  check(apprAgain.reason === "not_pending", "Doppelfreigabe abgelehnt");
  const overview3 = await gapFillOverview(C);
  check(overview3.pending.length === 1 && overview3.approved.length === 1, "Freigabe-Status korrekt getrennt");
  const approvedCase = await masCollection(C, "mas_cases").doc(list1.caseId).get();
  const auditTexts = (approvedCase.data().updates || []).map((u) => u.text).join(" | ");
  check(/freigegeben/.test(auditTexts) && /pv:lisa:/.test(auditTexts), "Freigabe ist im Vorgang auditiert (inkl. Prompt-Version)");

  const run3 = await runGapFill(C, { date: DATE, horizonDays: 1 });
  const afterApprove = await masCollection(C, "mas_cases").doc(list1.caseId).get();
  check(afterApprove.data().status === "in_progress", "freigegebene Liste wird vom nächsten Lauf NICHT überschrieben");
  check(run3.ok, "Folgelauf ok");

  const spoken = buildSpokenGapBriefing(run1, { operatorName: "Frau Klein" });
  check(/Frau Klein/.test(spoken) && /Lücke/.test(spoken) && /Freigabe/.test(spoken), "Sprechtext nennt Lücken + Freigabe");
  console.log("  spoken: " + spoken);

  console.log("\n=== Firestore: Caller-ID-Lookup ===");
  const hit = await lookupCaller(C, { phone: "0170 111 11 11" });
  check(hit.found === true, "Anrufliste-Kandidatin über Rufnummer gefunden");
  check(/Anna Ackermann/.test(hit.message), "Kontextblock nennt den Namen");
  check(hit.matches.some((m) => m.kind === "call_list"), "Match-Quelle: Gesprächsauftrag");

  const hitEvent = await lookupCaller(C, { phone: "0170/5555555" });
  check(hitEvent.found === true && hitEvent.matches.some((m) => m.kind === "event"), "kürzlicher Lisa-Kontakt über Ereignis gefunden");

  const miss = await lookupCaller(C, { phone: "0999 8887766" });
  check(miss.found === false && /regulär/.test(miss.message), "unbekannte Nummer -> ehrliche Anweisung");
  const bad = await lookupCaller(C, { phone: "12" });
  check(bad.found === false && /Keine verwertbare Rufnummer/.test(bad.message), "Müll-Nummer sauber behandelt");

  await cleanup();
  console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : "ALL CHECKS PASSED"}`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
