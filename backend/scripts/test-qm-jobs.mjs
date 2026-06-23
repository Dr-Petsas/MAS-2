import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import { nextDueFrom, isRecurring, leadStartFrom, CYCLES } from "../src/qm/recurrence.js";
import { activateBook } from "../src/qm/books.js";
import {
  createJob, getJob, assignJob, ackJob, startJob, completeJob, markOverdue, escalateJob,
  recordPush, listCalendar, listJobsForStaff, nextDue, listHistory, listDueOpenJobs, JOB_STATUS,
} from "../src/qm/jobs.js";
import { createSchedule, listSchedules, updateSchedule, materializeDueJobs } from "../src/qm/schedules.js";

// QM-Jobs (Statusmodell), Wiederholung und Schedules. Run:
//   node scripts/test-qm-jobs.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const C = "zzz-mas2-qm-jobs";
async function wipe(name) {
  const snap = await masCollection(C, name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
async function cleanup() {
  await wipe("mas_qm_jobs");
  await wipe("mas_qm_books");
  await wipe("mas_qm_documents");
  await wipe("mas_qm_schedules");
  await wipe("mas_events");
}

async function run() {
  console.log("=== pure: Wiederholung ===");
  check(isRecurring(CYCLES.YEARLY) === true, "yearly ist wiederkehrend");
  check(isRecurring(CYCLES.ON_EVENT) === false, "onEvent ist nicht wiederkehrend");
  check(nextDueFrom(CYCLES.ON_EVENT, Date.now()) === null, "onEvent -> kein nächster Termin");
  const base = "2026-01-31T08:00:00.000Z";
  check(nextDueFrom(CYCLES.DAILY, base) === "2026-02-01T08:00:00.000Z", "daily +1 Tag");
  check(nextDueFrom(CYCLES.MONTHLY, base) === "2026-02-28T08:00:00.000Z", "monthly clamped auf Februar-Ende");
  check(nextDueFrom(CYCLES.YEARLY, base).startsWith("2027-01-31"), "yearly +12 Monate");
  check(new Date(leadStartFrom("2026-07-08T00:00:00.000Z", 7)).getUTCDate() === 1, "Vorlauf 7 Tage -> 1. Juli");

  await cleanup();
  await activateBook(C, "constancy_book", {});
  await activateBook(C, "emergency_checklist", {});

  console.log("\n=== Statusmodell: gültige Übergänge ===");
  const c1 = await createJob(C, { bookKey: "constancy_book", title: "Konstanzprüfung OPG", deviceRef: "opg-1", cycle: "yearly", recurrenceMode: "anchor_on_completion" });
  check(c1.ok && c1.job.status === JOB_STATUS.PLANNED, "Job ohne Zuweisung -> planned");
  const asg = await assignJob(C, c1.job.id, { staffId: "staff_saghi", staffName: "Saghi" });
  check(asg.ok && (await getJob(C, c1.job.id)).status === JOB_STATUS.ASSIGNED, "zugewiesen -> assigned");
  const ack = await ackJob(C, c1.job.id, { by: "staff_saghi" });
  check(ack.ok && (await getJob(C, c1.job.id)).status === JOB_STATUS.SEEN, "quittiert -> seen (≠ done)");
  await startJob(C, c1.job.id, { by: "staff_saghi" });
  check((await getJob(C, c1.job.id)).status === JOB_STATUS.IN_PROGRESS, "geöffnet -> in_progress");

  console.log("\n=== Erledigen erzwingt Pflichtfelder + erzeugt Nachweis ===");
  const bad = await completeJob(C, c1.job.id, { by: "staff_saghi", byName: "Saghi", fields: { geraet: "OPG-1" } });
  check(bad.ok === false && bad.reason === "missing_required_fields", "Erledigen ohne 'ergebnis' -> abgelehnt");
  check((await getJob(C, c1.job.id)).status === JOB_STATUS.IN_PROGRESS, "Status bleibt (kein vorschnelles done)");
  const good = await completeJob(C, c1.job.id, { by: "staff_saghi", byName: "Saghi", fields: { geraet: "OPG-1", ergebnis: "bestanden", pruefwert: 1.4 } });
  check(good.ok && good.docId, "Erledigt -> Nachweis erzeugt");
  check((await getJob(C, c1.job.id)).status === JOB_STATUS.DONE, "Status done");

  console.log("\n=== anchor_on_completion erzeugt Folge-Job ===");
  check(!!good.nextJob, "Folge-Job aus Erledigungszeitpunkt angelegt");
  check(good.nextJob.bookKey === "constancy_book" && good.nextJob.deviceRef === "opg-1", "Folge-Job erbt Buch + Gerät");
  const reDone = await completeJob(C, c1.job.id, { by: "x", fields: { geraet: "OPG-1", ergebnis: "bestanden" } });
  check(reDone.ok === false && reDone.reason === "already_done", "erledigter Job nicht erneut erledigbar");

  console.log("\n=== Überfällig + Eskalation + Vertretung ===");
  const c2 = await createJob(C, { bookKey: "emergency_checklist", title: "Notfallkoffer prüfen", assignedTo: "staff_saghi", assignedToName: "Saghi", dueAt: new Date(Date.now() - 1000).toISOString() });
  const ov = await markOverdue(C, c2.job.id, {});
  check(ov.ok && (await getJob(C, c2.job.id)).status === JOB_STATUS.OVERDUE, "fällig + offen -> overdue");
  const esc = await escalateJob(C, c2.job.id, { to: "staff_lena", toName: "Lena", level: 2 });
  check(esc.ok && (await getJob(C, c2.job.id)).status === JOB_STATUS.ESCALATED, "eskaliert");
  check((await getJob(C, c2.job.id)).assignedTo === "staff_lena", "Eskalation übergibt an Vertretung");
  const rp = await recordPush(C, c2.job.id, { channel: "push" });
  check(rp.ok && rp.sentCount === 1, "Push-Zähler erhöht (Re-Push-Steuerung)");

  console.log("\n=== Lesemodelle: Kalender / next-due / Historie / meine Aufgaben ===");
  const nd = await nextDue(C, { bookKey: "constancy_book", deviceRef: "opg-1" });
  check(!!nd && nd.status !== JOB_STATUS.DONE, "next-due liefert offenen Folge-Job, nicht den erledigten");
  const hist = await listHistory(C, { bookKey: "constancy_book", deviceRef: "opg-1" });
  check(hist.length === 1 && hist[0].completedByName === "Saghi", "Historie zeigt 'erledigt von Saghi'");
  const mine = await listJobsForStaff(C, "staff_lena");
  check(mine.length === 1, "Lena sieht ihren eskalierten Job in 'Meine Aufgaben'");
  const cal = await listCalendar(C, {});
  check(cal.length >= 2, "Kalender listet Jobs");

  console.log("\n=== Schedules: fixed materialisiert fälligen Job mit Vorlauf ===");
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const sc = await createSchedule(C, { bookKey: "emergency_checklist", title: "Notfallkoffer monatlich", cycle: "monthly", mode: "fixed", leadDays: 7, assignedRole: "ersthelfer", firstDueAt: yesterday });
  check(sc.ok, "Schedule angelegt");
  const mat = await materializeDueJobs(C, {});
  check(mat.created >= 1, "fälliger Schedule erzeugt einen Job");
  const list2 = await listSchedules(C, { bookKey: "emergency_checklist" });
  check(new Date(list2[0].nextDueAt).getTime() > Date.now(), "Schedule nextDueAt in die Zukunft fortgeschrieben");
  const badCycle = await createSchedule(C, { bookKey: "accident_book", cycle: "onEvent" });
  check(badCycle.ok === false && badCycle.reason === "cycle_not_recurring", "onEvent-Schedule abgelehnt");

  console.log("\n=== Audit-Events landen im Shared Memory ===");
  const evSnap = await masCollection(C, "mas_events").get();
  const summaries = evSnap.docs.map((d) => d.data().summary || "");
  check(summaries.some((x) => x.includes("erledigt von Saghi")), "Erledigung als QM-Event im Gedächtnis");

  await cleanup();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALLE CHECKS OK");
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error("test crashed:", e); process.exit(1); });
