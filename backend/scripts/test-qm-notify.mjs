import "dotenv/config";
import { isQuietNow } from "../src/qm/notify.js";
import { resolveBookKeyFromText, buildSpokenNextDue, buildSpokenHistory, getNextDue, buildSpokenCalendar, buildSpokenOverdue } from "../src/qm/calendarRead.js";
import { masCollection } from "../src/tenant.js";
import { activateBook } from "../src/qm/books.js";
import { createJob, completeJob, assignJob, startJob } from "../src/qm/jobs.js";
import { upsertStaff } from "../src/qm/staff.js";

// QM-Benachrichtigung (Ruhezeiten, pure) + Clara-Lesemodell. Run:
//   node scripts/test-qm-notify.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const C = "zzz-mas2-qm-notify";
async function wipe(name) {
  const snap = await masCollection(C, name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
async function cleanup() {
  for (const n of ["mas_qm_jobs", "mas_qm_books", "mas_qm_documents", "mas_staff", "mas_events"]) await wipe(n);
}

function quietAt(berlinHour) {
  // Find the UTC instant on a fixed winter day whose Europe/Berlin hour equals
  // the target — robust against the UTC offset instead of hard-coding it.
  for (let u = 0; u < 24; u++) {
    const d = new Date(Date.UTC(2026, 0, 15, u, 30, 0));
    const h = Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).format(d));
    if (h === berlinHour) return d;
  }
  return new Date(Date.UTC(2026, 0, 15, berlinHour, 30, 0));
}

async function run() {
  console.log("=== Ruhezeiten (pure) ===");
  check(isQuietNow(quietAt(22)) === true, "22 Uhr -> Ruhezeit");
  check(isQuietNow(quietAt(3)) === true, "3 Uhr -> Ruhezeit");
  check(isQuietNow(quietAt(10)) === false, "10 Uhr -> keine Ruhezeit");

  console.log("\n=== Sprach-Synonyme -> bookKey ===");
  check(resolveBookKeyFromText("Wann ist die nächste OPG Konstanzprüfung fällig?") === "constancy_book", "OPG/Konstanzprüfung -> constancy_book");
  check(resolveBookKeyFromText("Wurde der Notfallkoffer geprüft?") === "emergency_checklist", "Notfallkoffer -> emergency_checklist");
  check(resolveBookKeyFromText("Hygieneplan aktuell?") === "hygiene_plan", "Hygieneplan -> hygiene_plan");
  check(resolveBookKeyFromText("völlig unklar") === null, "unbekannt -> null");

  await cleanup();
  await upsertStaff(C, { id: "staff_saghi", name: "Saghi", roles: ["strahlenschutz"] });
  await activateBook(C, "constancy_book", {});

  console.log("\n=== Clara: next-due Auskunft ===");
  const due = new Date(Date.now() + 14 * 86400000).toISOString();
  const c1 = await createJob(C, { bookKey: "constancy_book", title: "Konstanzprüfung OPG", deviceRef: "opg-1", dueAt: due, assignedTo: "staff_saghi", assignedToName: "Saghi", cycle: "yearly", recurrenceMode: "anchor_on_completion" });
  const spokenDue = await buildSpokenNextDue(C, { bookKey: "constancy_book", deviceRef: "opg-1" });
  check(/fällig/.test(spokenDue) && /Saghi/.test(spokenDue), "next-due nennt Datum + Zuständige");
  const nd = await getNextDue(C, { bookKey: "constancy_book", deviceRef: "opg-1" });
  check(nd && nd.assignedToName === "Saghi", "strukturierte next-due-Daten");

  console.log("\n=== Clara: Historie 'wer hat erledigt' ===");
  const noHist = await buildSpokenHistory(C, { bookKey: "constancy_book", deviceRef: "opg-1" });
  check(/noch keine Erledigung/.test(noHist), "ohne Erledigung -> ehrliche Auskunft");
  await assignJob(C, c1.job.id, { staffId: "staff_saghi", staffName: "Saghi" });
  await startJob(C, c1.job.id, { by: "staff_saghi" });
  await completeJob(C, c1.job.id, { by: "staff_saghi", byName: "Saghi", fields: { geraet: "OPG-1", ergebnis: "bestanden" } });
  const hist = await buildSpokenHistory(C, { bookKey: "constancy_book", deviceRef: "opg-1" });
  check(/von Saghi/.test(hist), "Historie nennt 'von Saghi'");

  console.log("\n=== Clara liest den KOMPLETTEN Kalender (alle Jobs) ===");
  // mehrere Bücher + Jobs anlegen: überfällig + anstehend, verschiedene Bücher
  await activateBook(C, "emergency_checklist", {});
  await activateBook(C, "hygiene_plan", {});
  await createJob(C, { bookKey: "emergency_checklist", title: "Notfallkoffer prüfen", deviceRef: "koffer-1", assignedTo: "staff_saghi", assignedToName: "Saghi", dueAt: new Date(Date.now() - 2 * 86400000).toISOString() });
  await createJob(C, { bookKey: "hygiene_plan", title: "Hygieneplan-Review", assignedTo: "staff_saghi", assignedToName: "Saghi", dueAt: new Date(Date.now() + 5 * 86400000).toISOString() });

  const cal = await buildSpokenCalendar(C, { days: 30 });
  check(/Notfallkoffer/.test(cal) && /Hygieneplan/.test(cal), "kompletter Kalender nennt Jobs aus MEHREREN Büchern");
  check(/überfällig/i.test(cal) && /Anstehend/i.test(cal), "Kalender trennt überfällig und anstehend");
  check(/Saghi/.test(cal), "Kalender nennt Zuständige");

  const overdue = await buildSpokenOverdue(C);
  check(/Notfallkoffer/.test(overdue) && /überfällig/i.test(overdue), "Überfällig-Liste enthält den überfälligen Notfallkoffer");

  await cleanup();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALLE CHECKS OK");
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error("test crashed:", e); process.exit(1); });
