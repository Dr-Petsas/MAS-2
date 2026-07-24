import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import { PRODUCT_PRESETS, TASK_TEMPLATES, defaultProductSelection, buildHygienePlans, setupHygienePlan } from "../src/qm/hygiene.js";
import { upsertStaff, addAbsence } from "../src/qm/staff.js";
import { listJobsForStaff, listCalendar, redistributeOpenJobs, getJob, JOB_STATUS } from "../src/qm/jobs.js";
import { getBook } from "../src/qm/books.js";

// Hygieneplan-Assistent: Produkt-Vorgaben, 1-Klick-Setup, Auto-Zuweisung,
// Neuverteilung bei Abwesenheit/Deaktivierung. Run:
//   node scripts/test-qm-hygiene.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const C = "zzz-mas2-qm-hygiene";
async function wipe(name) {
  const snap = await masCollection(C, name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
async function cleanup() {
  for (const n of ["mas_qm_jobs", "mas_qm_books", "mas_qm_documents", "mas_qm_schedules", "mas_staff", "mas_events"]) await wipe(n);
}

const todayYmd = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

async function run() {
  console.log("=== pure: Produkt-Presets + Pläne ===");
  check(PRODUCT_PRESETS.length >= 10, "Produkt-Presets vorhanden");
  const def = defaultProductSelection();
  check(def.haendedesinfektionHygienisch?.name === "Sterillium med", "Default Händedesinfektion vorausgefüllt");
  check(def.flaechenDesinfektion?.dosierung === "2 %", "Default Flächendesinfektion mit Dosierung");
  const plans = buildHygienePlans(def);
  check(plans.length === 9, "9 Hygienepläne erzeugt");
  const flaechenPlan = plans.find((p) => p.key === "flaechen");
  check(/Kohrsolin FF/.test(JSON.stringify(flaechenPlan)), "Plan enthält gewähltes Produkt (Kohrsolin FF)");
  check(/Einwirkzeit: 15 min/.test(JSON.stringify(flaechenPlan)), "Plan enthält Einwirkzeit");
  check(TASK_TEMPLATES.some((t) => t.cycle === "daily"), "tägliche Aufgaben definiert");

  await cleanup();

  console.log("\n=== Team mit Hygiene-Rolle + Vertretung ===");
  await upsertStaff(C, { id: "staff_hanna", name: "Hanna", roles: ["hygiene"], deputyStaffId: "staff_bea" });
  await upsertStaff(C, { id: "staff_bea", name: "Bea", roles: ["hygiene"], deputyStaffId: "staff_hanna" });
  await upsertStaff(C, { id: "staff_chef", name: "Dr. Chef", roles: ["leitung"] });

  console.log("\n=== 1-Klick-Setup ===");
  const setup = await setupHygienePlan(C, {});
  check(setup.ok, "Setup erfolgreich");
  check(setup.planCount === 9, "9 Pläne am Buch abgelegt");
  check(setup.scheduleCount === TASK_TEMPLATES.length, "je Aufgabe ein Schedule");
  check(setup.jobCount === TASK_TEMPLATES.length, "je Aufgabe ein sofort sichtbarer Job");

  const book = await getBook(C, "hygiene_plan");
  check(book?.active === true, "Hygienebuch aktiviert");
  check(Array.isArray(book?.generatedPlans) && book.generatedPlans.length === 9, "Pläne im Buch lesbar");

  console.log("\n=== Auto-Zuweisung an Hygiene-Rolle ===");
  const cal0 = await listCalendar(C, {});
  const primary = cal0[0].assignedTo; // deterministisch die erste Hygiene-Kraft
  check(["staff_hanna", "staff_bea"].includes(primary), `Jobs automatisch an Hygiene-Kraft (${primary})`);
  check(cal0.every((j) => j.assignedTo === primary), "alle Jobs an dieselbe zuständige Hygiene-Kraft");
  check(cal0.every((j) => j.status === JOB_STATUS.ASSIGNED), "Status assigned");
  check(cal0.some((j) => j.purpose), "mind. ein Job trägt Anweisung (Mittel/Dosis/EWZ)");
  const deputy = primary === "staff_hanna" ? "staff_bea" : "staff_hanna";

  console.log("\n=== Neuverteilung bei Abwesenheit -> Vertretung ===");
  const today = todayYmd();
  const inAWeek = todayYmd(new Date(Date.now() + 7 * 86400000));
  await addAbsence(C, primary, { from: today, to: inAWeek, type: "krank" });
  const redis = await redistributeOpenJobs(C, primary, { onlyDueBeforeMs: new Date(inAWeek + "T23:59:59Z").getTime(), reason: "Krank" });
  check(redis.ok && redis.reassigned >= 1, "offene, fällige Jobs neu verteilt");
  const deputyJobs = await listJobsForStaff(C, deputy);
  check(deputyJobs.length >= 1, "Vertretung hat Jobs übernommen");
  check(deputyJobs.every((j) => j.assignedTo === deputy), "Jobs auf Vertretung umgeschrieben");

  console.log("\n=== Neuverteilung wenn Vertretung ebenfalls fehlt -> Leitung ===");
  await addAbsence(C, deputy, { from: today, to: inAWeek, type: "urlaub" });
  const redis2 = await redistributeOpenJobs(C, deputy, { reason: "Urlaub" });
  check(redis2.ok && (redis2.reassigned + redis2.escalated) >= 1, "Jobs der Vertretung weiter verteilt/eskaliert");
  const deputyAfter = await listJobsForStaff(C, deputy);
  check(deputyAfter.length === 0, "Vertretung hat keine offenen Jobs mehr");
  const chefJobs = await listJobsForStaff(C, "staff_chef");
  check(chefJobs.length >= 1, "Leitung übernimmt, wenn keine Hygiene-Kraft verfügbar");

  console.log("\n=== Kalender zeigt die Jobs ===");
  const cal = await listCalendar(C, {});
  check(cal.length === TASK_TEMPLATES.length, "Kalender listet alle Hygiene-Jobs");

  await cleanup();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALLE CHECKS OK");
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error("test crashed:", e); process.exit(1); });
