import "dotenv/config";
import admin from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import { ensureBerlinTz } from "../src/clara/booking.js";
import { getDayAppointments, computeDayBriefing, buildSpokenDayBriefing, buildSpokenDayList, buildSpokenMemoryHints, buildSpokenPatientPrep, todayBerlin } from "../src/clara/daySchedule.js";
import { dayLoadReaction } from "../src/clara/speech.js";

// Clara day-schedule briefing: pure compute (counts/gaps/highlights/spoken) plus
// a Firestore integration run that seeds a throwaway tenant's calendar and reads
// it back. Run: node scripts/test-day-schedule.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const C = "zzz-mas2-daysched";
const LOC = "locTest";
const db = admin.firestore();
const DATE = todayBerlin();
const at = (h, m) => new Date(ensureBerlinTz(`${DATE}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`));

async function cleanup() {
  const appts = await db.collection("clients").doc(C).collection("locations").doc(LOC).collection("appointments").get();
  await Promise.all(appts.docs.map((d) => d.ref.delete()));
  await db.collection("clients").doc(C).collection("locations").doc(LOC).delete().catch(() => {});
  const cfg = await masCollection(C, "mas_config").get();
  await Promise.all(cfg.docs.map((d) => d.ref.delete()));
}

async function run() {
  console.log("=== pure compute ===");
  const calendars = [{ id: "cal1", name: "Dr. Test" }, { id: "cal2", name: "Dr. Zwei" }];
  const appts = [
    { startMs: at(9, 0).getTime(), endMs: at(9, 15).getTime(), calendarId: "cal1", calendarName: "Dr. Test", patientId: "p1", patientName: "Anna A", newPatient: true, status: "confirmed", isAbsence: false, isVideoCall: false },
    { startMs: at(10, 0).getTime(), endMs: at(10, 30).getTime(), calendarId: "cal1", calendarName: "Dr. Test", patientId: "p2", patientName: "Bert B", newPatient: false, status: "needsConfirmation", isAbsence: false, isVideoCall: false },
    { startMs: at(11, 0).getTime(), endMs: at(11, 30).getTime(), calendarId: "cal2", calendarName: "Dr. Zwei", patientId: "p3", patientName: "Cara C", newPatient: false, status: "confirmed", isAbsence: false, isVideoCall: true },
    { startMs: at(14, 0).getTime(), endMs: at(15, 0).getTime(), calendarId: "cal1", calendarName: "Dr. Test", patientId: "", patientName: "", isAbsence: true, isVideoCall: false, status: "" },
  ];
  const b = computeDayBriefing(appts, { calendars });
  check(b.total === 3, `3 echte Termine (war ${b.total})`);
  check(b.newPatients === 1, "1 Neupatient gezählt");
  check(b.unconfirmed === 1, "1 unbestätigt gezählt");
  check(b.videoCalls === 1, "1 Video-Termin gezählt");
  check(b.absences.length === 1, "1 Sperrzeit erkannt");
  const cal1 = b.byCalendar.find((c) => c.calendarId === "cal1");
  check(cal1 && cal1.count === 2, "cal1 hat 2 Termine");
  check(cal1 && cal1.gaps.length === 1 && cal1.gaps[0].minutes === 45, `Lücke 45 min erkannt (war ${cal1?.gaps?.[0]?.minutes})`);

  const spoken = buildSpokenDayBriefing(b, { date: DATE, operatorName: "Frau Klein" });
  // Gewollter Stil seit dem Natürlichkeits-Rework: ganze Sätze, Zeitangabe
  // vorn, keine Stichwort-Labels. Seit Lockerheit 1 (10.07.2026) rotiert der
  // Rahmen-Satz — die ZAHL muss aber in jeder Variante wörtlich drinstehen.
  check(/insgesamt 3 Termine/.test(spoken) && /Dr\. Test/.test(spoken), "Sprechtext nennt Terminzahl + Behandler");
  check(/Frei ist (dort|dazwischen) noch/.test(spoken), "Sprechtext nennt freie Lücke");
  check(/Neupatient/.test(spoken), "Sprechtext nennt Hinweise (Neupatient)");
  console.log("  spoken: " + spoken);

  const empty = buildSpokenDayBriefing(computeDayBriefing([], { calendars }), { date: DATE });
  check(/keine Termine gebucht|Kalender leer|steht nichts im Kalender/.test(empty), "Leerer Tag -> ehrliche Meldung");

  console.log("\n=== Sprechliste mit Patientennamen (list_day_appointments) ===");
  const list = buildSpokenDayList(appts.map((a) => ({ ...a, visitMotive: a.isAbsence ? "" : "Kontrolle" })), { date: DATE, calendars });
  check(/3 Termine insgesamt/.test(list), `Liste zählt 3 echte Termine`);
  check(/Anna A/.test(list) && /Bert B/.test(list) && /Cara C/.test(list), "Liste nennt alle Patientennamen");
  check(/zur Kontrolle/.test(list), "Behandlungsart natürlich formuliert");
  check(/ein Neupatient/.test(list), "Liste markiert Neupatienten");
  // "Heute hat Dr. Test um 9 Uhr …" bzw. rotiert "Dr. Test hat heute um …".
  check(/(hat Dr\. Test um|Dr\. Test hat \S+ um)/.test(list) && /Dr\. Zwei hat um/.test(list), "Liste gruppiert nach Behandler");
  console.log("  spoken: " + list);

  console.log("\n=== Natürliche Ansage (reales Beispiel) ===");
  const petsasCal = [{ id: "calP", name: "Dr. Petsas" }];
  const day1 = [
    { startMs: at(14, 0).getTime(), endMs: at(14, 15).getTime(), calendarId: "calP", calendarName: "Dr. Petsas", patientId: "pT", patientName: "Nicole Thrandorf", patientLastName: "Thrandorf", patientGender: "f", visitMotive: "KCH akute Beschwerden/Notfall", comments: "", docsStatus: "yellow", newPatient: false, status: "confirmed", isAbsence: false },
    { startMs: at(14, 45).getTime(), endMs: at(15, 0).getTime(), calendarId: "calP", calendarName: "Dr. Petsas", patientId: "pD", patientName: "Michael Diedershagen", patientLastName: "Diedershagen", patientGender: "m", visitMotive: "SLM Besprechung", comments: "bringt vielleicht seine Frau mit zur Kontrolle", docsStatus: "green", newPatient: false, status: "confirmed", isAbsence: false },
  ];
  const own = buildSpokenDayList(day1, { date: DATE, calendars: petsasCal, operatorDoctorName: "Dr. Petsas" });
  // Rahmen rotiert seit Lockerheit 1: "Heute haben Sie ..." ODER "Sie haben heute ...".
  check(/^(Heute haben Sie|Sie haben heute) um 14 Uhr Frau Thrandorf mit akuten Beschwerden/.test(own), "Eigener Kalender -> 'haben Sie ... Frau Thrandorf mit akuten Beschwerden'");
  check(/und um 14 Uhr 45 Herrn Diedershagen zur SLM-Besprechung/.test(own), "'um 14 Uhr 45 Herrn Diedershagen zur SLM-Besprechung'");
  check(/Unterlagen sind noch nicht unterschrieben/.test(own), "Gelbe Unterlagen-Ampel wird angesagt");
  check(/Notiz: bringt vielleicht seine Frau mit/.test(own), "Terminnotiz wird vorgelesen");
  console.log("  spoken: " + own);
  const foreign = buildSpokenDayList(day1, { date: DATE, calendars: petsasCal, operatorDoctorName: "Dr. Nikolaou" });
  check(/^(Heute hat Dr\. Petsas|Dr\. Petsas hat heute)/.test(foreign), "Fremder Kalender -> 'hat Dr. Petsas ...'");

  console.log("\n=== Praxisgedächtnis-Hinweise (Shared Memory) ===");
  const caseMap = new Map([["pD", [{
    topic: "appointment", status: "open", assignee: "Nadine",
    lastContactAt: Date.now() - 86400000, updatedAt: Date.now() - 86400000,
    updates: [{ kind: "contact", by: "Nadine", ts: Date.now() - 86400000, text: "E-Mail von Herrn Diedershagen: fragt wegen seiner Schlafschiene zum Termin; Antwort ist vorbereitet." }],
  }]]]);
  const hints = buildSpokenMemoryHints(day1, caseMap);
  check(/Praxisgedächtnis/.test(hints), "Hinweise beginnen mit 'Aus dem Praxisgedächtnis'");
  check(/Herrn Diedershagen/.test(hints) && /Thema Termin/.test(hints), "Hinweis nennt Patient + Thema");
  check(/gestern/.test(hints), "Letzter Kontakt relativ ('gestern')");
  check(/liegt bei Nadine/.test(hints), "Zuständigkeit (Nadine) wird genannt");
  check(/Schlafschiene/.test(hints), "E-Mail-Inhalt (Snippet) wird vorgelesen");
  console.log("  hints: " + hints);
  check(buildSpokenMemoryHints(day1, new Map()) === "", "Ohne Vorgänge -> keine Hinweise");

  console.log("\n=== Dedup: Docs-Ampel + 'Dokumente'-Vorgang nicht doppelt (09.07.2026) ===");
  // day1: Thrandorf (pT) hat docsStatus 'yellow' -> die Termin-Zeile meldet die
  // Unterlagen schon. Diedershagen (pD) hat 'green'.
  const dedupMap = new Map([
    ["pT", [{ topic: "document", status: "open", assignee: "Nadine",
      lastContactAt: Date.now() - 86400000,
      updates: [{ kind: "contact", ts: Date.now() - 86400000, text: "Unterlagen noch nicht zurück." }] }]],
    ["pD", [{ topic: "appointment", status: "open", assignee: "Nadine",
      lastContactAt: Date.now() - 86400000,
      updates: [{ kind: "contact", ts: Date.now() - 86400000, text: "Frage zur Schlafschiene." }] }]],
  ]);
  const dedup = buildSpokenMemoryHints(day1, dedupMap);
  check(!/Thrandorf/.test(dedup), "Docs-Ampel gelb: 'Dokumente'-Vorgang wird NICHT zusätzlich genannt");
  check(/Herrn Diedershagen/.test(dedup) && /Thema Termin/.test(dedup), "Anderer Vorgang (Docs grün) bleibt erhalten");
  console.log("  dedup: " + dedup);
  const onlyDoc = buildSpokenMemoryHints(day1, new Map([["pT", [{ topic: "document", status: "open", updates: [] }]]]));
  check(onlyDoc === "", "Nur 'Dokumente'-Vorgang bei gelber Ampel -> gar kein Hinweis (keine Dopplung)");

  console.log("\n=== Kalender-Echo raus: nur echte Kommunikation/Behandlung (09.07.2026) ===");
  // Vorgang, der NUR aus Kalender-Automatik besteht (Event-ID appt-watch:...) ->
  // reines Kalender-Echo, darf NICHT ins Briefing.
  const echoOnly = new Map([["pD", [{
    topic: "appointment", status: "open", assignee: "Nadine", lastContactAt: Date.now() - 3600000,
    updates: [
      { kind: "contact", by: "Clara", ts: Date.now() - 7200000, eventId: "appt-watch:abc:created", text: "Neuer Termin: Herr Diedershagen am Montag, 09:00 Uhr, angelegt durch das Team." },
      { kind: "contact", by: "Clara", ts: Date.now() - 3600000, eventId: "appt-watch:abc:moved:123", text: "Termin verschoben: Herr Diedershagen." },
    ],
  }]]]);
  check(buildSpokenMemoryHints(day1, echoOnly) === "", "Reines Kalender-Echo (nur appt-watch) -> kein Hinweis");

  // Mischung: Kalender-Automatik PLUS echter Anruf -> der echte Anruf wird genannt.
  const mixed = new Map([["pD", [{
    topic: "complaint", status: "open", assignee: "Lisa", lastContactAt: Date.now() - 3600000,
    updates: [
      { kind: "contact", by: "Bianca", ts: Date.now() - 7200000, eventId: "bianca-call:xyz", text: "Anruf von Herrn Diedershagen: hat noch Schmerzen seit gestern." },
      { kind: "contact", by: "Clara", ts: Date.now() - 3600000, eventId: "appt-watch:def:moved:9", text: "Termin verschoben: Herr Diedershagen." },
    ],
  }]]]);
  const mixedHints = buildSpokenMemoryHints(day1, mixed);
  check(/Schmerzen seit gestern/.test(mixedHints), "Mischung: echter Anruf (Schmerzen) wird genannt");
  check(!/verschoben/.test(mixedHints), "Mischung: Kalender-Echo (verschoben) wird NICHT genannt");
  console.log("  mixed: " + mixedHints);

  console.log("\n=== Vorbereitung: Anamnese-Flags + letzte Behandlung (09.07.2026) ===");
  const dayAgo = Date.now() - 200 * 86400000; // >6 Monate zurueck -> Jahr wird genannt, wenn nicht aktuelles
  const prepMap = new Map([
    ["pT", {
      findings: [{ category: "Allergie", text: "Penicillin" }, { category: "Medikamente", text: "Marcumar" }],
      lastAppt: { startMs: Date.now() - 30 * 86400000, visitMotive: "PZR" },
    }],
    // Diedershagen: keine Befunde, aber eine Vorbehandlung.
    ["pD", { findings: [], lastAppt: { startMs: Date.now() - 10 * 86400000, visitMotive: "Kontrolle" } }],
  ]);
  const prep = buildSpokenPatientPrep(day1, prepMap);
  check(/^Zur Vorbereitung:/.test(prep), "Vorbereitung beginnt mit 'Zur Vorbereitung:'");
  check(/Frau Thrandorf/.test(prep) && /Allergie: Penicillin/.test(prep) && /Medikamente: Marcumar/.test(prep), "Anamnese-Flags pro Patient genannt");
  check(/zuletzt .*Kontrolle/.test(prep) || /zuletzt zur Kontrolle/.test(prep), "Letzte Behandlung (Kontrolle) genannt");
  console.log("  prep: " + prep);
  // Patient ganz ohne Befund UND ohne Vorbehandlung -> nicht erwaehnt.
  const prepNone = buildSpokenPatientPrep(day1, new Map([["pT", { findings: [], lastAppt: null }]]));
  check(prepNone === "", "Ohne Befund und ohne Vorbehandlung -> keine Vorbereitung");
  check(buildSpokenPatientPrep(day1, new Map()) === "", "Leere Map -> keine Vorbereitung");

  const emptyList = buildSpokenDayList([], { date: DATE, calendars });
  check(/keine Termine gebucht|Kalender leer|steht nichts im Kalender/.test(emptyList), "Leere Liste -> ehrliche Meldung");

  console.log("\n=== Lockerheit 2: Zahl-Reaktion deterministisch (10.07.2026) ===");
  check(dayLoadReaction(0) === "", "0 Termine -> keine Einordnung");
  check(dayLoadReaction(10) === "", "10 Termine (Mitte) -> keine Einordnung");
  check(dayLoadReaction(2).length > 0, "2 Termine -> ruhige Einordnung");
  check(dayLoadReaction(22).length > 0, "22 Termine -> volle Einordnung");
  check(dayLoadReaction(35).length > 0, "35 Termine -> sehr volle Einordnung");
  // Fakten-Schutz: die Einordnung enthaelt NIE Ziffern (nichts erfunden).
  const moods = [dayLoadReaction(2), dayLoadReaction(22), dayLoadReaction(35)];
  check(moods.every((m) => !/\d/.test(m)), "Einordnung enthaelt keine Ziffern");

  const many = Array.from({ length: 30 }, (_, i) => ({
    startMs: at(8, 0).getTime() + i * 900000, endMs: at(8, 0).getTime() + i * 900000 + 900000,
    calendarId: "cal1", calendarName: "Dr. Test", patientId: `p${i}`, patientName: `Patient ${i}`,
    newPatient: false, status: "confirmed", isAbsence: false, isVideoCall: false, visitMotive: "",
  }));
  const longList = buildSpokenDayList(many, { date: DATE, calendars });
  check(/ersten 25/.test(longList), "Lange Liste wird bei 25 gekappt");
  check(!/Patient 27/.test(longList), "Gekappte Einträge werden nicht vorgelesen");

  console.log("\n=== Firestore-Integration (isolierter Test-Mandant) ===");
  await cleanup();
  await masCollection(C, "mas_config").doc("booking").set({ clientId: C, locationId: LOC, calendars, visitMotives: [{ id: "vm1", name: "Kontrolle", duration: 15 }] });
  // a2 traegt Status "needsConfirmation" — der wird wie im Plattform-Kalender
  // ausgeblendet, WENN die Location virtuelle Termine versteckt. Der Test will
  // aber Temp-Hold-/Multi-Day-Filter pruefen, nicht den Virtual-Filter — also
  // explizit einschalten statt sich auf Altbestand im Test-Mandanten zu
  // verlassen (bis 10.07. stand das Flag zufaellig noch aus frueheren Laeufen).
  await db.collection("clients").doc(C).collection("locations").doc(LOC).set({ showVirtualAppointments: true });

  const apptCol = db.collection("clients").doc(C).collection("locations").doc(LOC).collection("appointments");
  const mk = (id, o) => apptCol.doc(id).set(o);
  await mk("a1", { start: at(9, 0), end: at(9, 15), calendar: { id: "cal1", name: "Dr. Test" }, visitMotive: { id: "vm1", name: "Kontrolle" }, patient: { id: "p1", firstName: "Anna", lastName: "A", newPatient: true }, status: "confirmed", isMultiDay: false });
  await mk("a2", { start: at(10, 0), end: at(10, 30), calendar: { id: "cal1", name: "Dr. Test" }, visitMotive: { id: "vm1", name: "Kontrolle" }, patient: { id: "p2", firstName: "Bert", lastName: "B" }, status: "needsConfirmation", isMultiDay: false });
  await mk("temp", { start: at(10, 45), end: at(11, 0), calendar: { id: "cal1", name: "Dr. Test" }, patient: { id: "" }, status: "needsConfirmation", isMultiDay: false }); // temporary hold -> excluded
  await mk("absence", { start: at(14, 0), end: at(15, 0), calendar: { id: "cal1", name: "Dr. Test" }, calendarItemType: "absence", patient: { id: "" }, isMultiDay: false }); // block -> kept as absence
  await mk("multi", { start: at(8, 0), end: at(18, 0), calendar: { id: "cal1", name: "Dr. Test" }, patient: { id: "p9", firstName: "Multi", lastName: "Tag" }, isMultiDay: true }); // multi-day -> excluded

  const day = await getDayAppointments(C, { date: DATE });
  check(day.ok, "getDayAppointments ok");
  const ids = (day.appointments || []).map((a) => a.id).sort();
  check(JSON.stringify(ids) === JSON.stringify(["a1", "a2", "absence"]), `Temp + Multi-Day gefiltert (gelesen: ${ids.join(",")})`);

  const b2 = computeDayBriefing(day.appointments, { calendars: day.calendars });
  check(b2.total === 2 && b2.absences.length === 1, "Integration: 2 echte Termine + 1 Sperrzeit");
  console.log("  spoken: " + buildSpokenDayBriefing(b2, { date: DATE }));

  await cleanup();
  console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : "ALL CHECKS PASSED"}`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
