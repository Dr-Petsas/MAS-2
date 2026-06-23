import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import {
  upsertStaff, getStaff, listStaff, setDeputy, addAbsence, removeAbsence,
  isAbsentAt, suggestAssignee, resolveEscalationTarget, QM_ROLES,
} from "../src/qm/staff.js";

// QM-Personal, Zuweisungsvorschlag, Abwesenheit/Vertretung, Eskalation. Run:
//   node scripts/test-qm-staff.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const C = "zzz-mas2-qm-staff";
async function cleanup() {
  const snap = await masCollection(C, "mas_staff").get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

function ymd(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function run() {
  await cleanup();

  console.log("=== Anlegen + Rollen/Bereiche ===");
  const saghi = (await upsertStaff(C, { id: "staff_saghi", name: "Saghi", roles: [QM_ROLES.STRAHLENSCHUTZ, QM_ROLES.ASSISTENZ], areas: ["patientensicherheit"], linkedOperatorId: "op_saghi" })).staff;
  const lena = (await upsertStaff(C, { id: "staff_lena", name: "Lena", roles: [QM_ROLES.HYGIENE] })).staff;
  const chef = (await upsertStaff(C, { id: "staff_chef", name: "Dr. Petsas", roles: [QM_ROLES.LEITUNG, QM_ROLES.QMB] })).staff;
  check((await listStaff(C)).length === 3, "drei Teammitglieder");
  check((await getStaff(C, "staff_saghi")).roles.includes("strahlenschutz"), "Rolle gespeichert");

  console.log("\n=== Upsert merged (Name bleibt, Rollen ersetzt) ===");
  await upsertStaff(C, { id: "staff_saghi", areas: ["patientensicherheit", "technik"] });
  const s2 = await getStaff(C, "staff_saghi");
  check(s2.name === "Saghi" && s2.areas.includes("technik"), "merge erhält Name, ergänzt Bereiche");

  console.log("\n=== Zuweisungsvorschlag nach Rolle/Bereich ===");
  const r1 = await suggestAssignee(C, { role: QM_ROLES.STRAHLENSCHUTZ, category: "patientensicherheit" });
  check(r1.ok && r1.staffId === "staff_saghi", "Strahlenschutz-Job -> Saghi");
  const r2 = await suggestAssignee(C, { category: "hygiene" });
  check(r2.ok && r2.staffId === "staff_lena", "Hygiene-Kategorie -> Lena (über Default-Rollenmapping)");
  const r3 = await suggestAssignee(C, { role: "gibtsnicht", category: "organisation" });
  check(r3.ok && r3.staffId === "staff_chef", "Organisation -> QMB/Chef");

  console.log("\n=== Abwesenheit lenkt Vorschlag um ===");
  const ab = await addAbsence(C, "staff_saghi", { from: ymd(-1), to: ymd(2), type: "urlaub" });
  check(ab.ok, "Urlaub eingetragen");
  check(isAbsentAt(await getStaff(C, "staff_saghi"), Date.now()) === true, "heute abwesend");
  const r4 = await suggestAssignee(C, { role: QM_ROLES.STRAHLENSCHUTZ, category: "patientensicherheit" });
  check(r4.staffId !== "staff_saghi", "abwesende Saghi wird nicht vorgeschlagen");
  await removeAbsence(C, "staff_saghi", ab.absence.id);
  check(isAbsentAt(await getStaff(C, "staff_saghi"), Date.now()) === false, "Urlaub entfernt -> wieder verfügbar");

  console.log("\n=== Eskalation: erst Vertretung, dann Leitung ===");
  await setDeputy(C, "staff_saghi", "staff_lena");
  const job = { assignedTo: "staff_saghi", escalation: { level: 0 } };
  const e1 = await resolveEscalationTarget(C, job);
  check(e1 && e1.staffId === "staff_lena" && e1.level === 1, "Stufe 1 -> Vertretung Lena");
  const job2 = { assignedTo: "staff_saghi", escalation: { level: 1 } };
  const e2 = await resolveEscalationTarget(C, job2);
  check(e2 && e2.staffId === "staff_chef" && e2.level >= 2, "Stufe 2 -> Praxisleitung");

  console.log("\n=== Eskalation überspringt abwesende Vertretung ===");
  await addAbsence(C, "staff_lena", { from: ymd(-1), to: ymd(1) });
  const e3 = await resolveEscalationTarget(C, { assignedTo: "staff_saghi", escalation: { level: 0 } });
  check(e3 && e3.staffId === "staff_chef", "abwesende Vertretung -> direkt Leitung");

  await cleanup();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALLE CHECKS OK");
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error("test crashed:", e); process.exit(1); });
