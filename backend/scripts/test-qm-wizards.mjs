import { listWizards, getWizard, getProfileWizard, getOptionList, getArtifact } from "../src/qm/catalog.js";
import { planFromAnswers, previewWizard } from "../src/qm/wizards.js";
import { resolveRequirements } from "../src/qm/requirements.js";
import { nextDueFrom, isRecurring, cycleLabel } from "../src/qm/recurrence.js";
import { pickSlot, isWorkday, loadByDayFromJobs } from "../src/qm/distribution.js";

// QM-Wizards + neue Zyklen + intelligente Verteilung: rein, ohne Firestore. Run:
//   node scripts/test-qm-wizards.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}
function statusOf(items, key) {
  return items.find((i) => i.key === key)?.status || null;
}

console.log("=== Neue Wiederhol-Zyklen (recurrence.js) ===");
for (const c of ["workday", "biweekly", "halfYearly", "twoYearly"]) {
  check(isRecurring(c), `${c} ist wiederkehrend`);
  const n = nextDueFrom(c, "2026-07-10T08:00:00Z");
  check(typeof n === "string" && !isNaN(Date.parse(n)), `${c} liefert gültiges nächstes Datum (${n})`);
}
check(nextDueFrom("workday", "2026-07-10T08:00:00Z").slice(0, 10) === "2026-07-13", "workday springt über das Wochenende (Fr->Mo)");
check(nextDueFrom("biweekly", "2026-07-10T08:00:00Z").slice(0, 10) === "2026-07-24", "biweekly = +14 Tage");
check(isRecurring("perUse") === false, "perUse ist NICHT wiederkehrend");
check(nextDueFrom("perUse") === null, "perUse liefert kein Datum");
check(cycleLabel("twoYearly") === "alle 2 Jahre", "cycleLabel twoYearly");

console.log("\n=== Neue Artefakte im Katalog ===");
for (const k of ["op_checklist", "sedation_log", "op_hygiene_plan", "praxislabor_mdr", "radiation_expert_inspection", "device_stk_log"]) {
  check(!!getArtifact(k), `Artefakt vorhanden: ${k}`);
}

console.log("\n=== Neue Anforderungsregeln (Multi-Fach) ===");
const op = resolveRequirements({ sector: "zahnarzt", capabilities: { ambulant_operieren: true } }).items;
check(statusOf(op, "op_checklist") === "required", "ambulantes OP -> OP-Checkliste Pflicht");
check(statusOf(op, "op_hygiene_plan") === "required", "ambulantes OP -> OP-Hygieneplan Pflicht");
const sed = resolveRequirements({ sector: "zahnarzt", capabilities: { narkose_sedierung: true } }).items;
check(statusOf(sed, "sedation_log") === "required", "Sedierung -> Sedierungsprotokoll Pflicht");
const stk = resolveRequirements({ sector: "zahnarzt", capabilities: { mp_anlage1: true } }).items;
check(statusOf(stk, "device_stk_log") === "required", "Anlage-1-Gerät -> STK Pflicht");
const rtg = resolveRequirements({ sector: "zahnarzt", capabilities: { roentgen: true } }).items;
check(statusOf(rtg, "radiation_expert_inspection") === "required", "Röntgen -> Sachverständigenprüfung Pflicht");
const lab = resolveRequirements({ sector: "zahnarzt", capabilities: { labor_eigen: true } }).items;
check(statusOf(lab, "praxislabor_mdr") === "required", "Eigenlabor -> MDR-Praxislabor Pflicht");

console.log("\n=== Wizard-Katalog-Integrität ===");
const wizards = listWizards();
check(wizards.length >= 13, `mindestens 13 Wizards (${wizards.length})`);
check(getProfileWizard()?.questions?.length > 0, "Praxisprofil-Wizard hat Fragen");
check(Array.isArray(getOptionList("FREQ")) && getOptionList("FREQ").length > 0, "optionList FREQ vorhanden");
check(Array.isArray(getOptionList("ROLE")) && getOptionList("ROLE").length > 0, "optionList ROLE vorhanden");
check(getOptionList("FACHRICHTUNGEN")?.length > 0, "optionList FACHRICHTUNGEN dynamisch aufgelöst");

for (const w of wizards) {
  const full = getWizard(w.wizardKey);
  if (w.artifactKey) check(!!getArtifact(w.artifactKey), `Wizard ${w.wizardKey}: artifactKey ${w.artifactKey} existiert`);
  // Alle referenzierten Bücher (activateBook / schedule.bookKey) müssen existieren.
  const plan = planFromAnswers(full, {}, { capabilities: { ambulant_operieren: true } });
  for (const bk of plan.activateBooks) check(!!getArtifact(bk), `Wizard ${w.wizardKey}: activateBook ${bk} existiert`);
  for (const sch of plan.schedules) {
    const bk = sch.bookKey || w.artifactKey;
    check(!!getArtifact(bk), `Wizard ${w.wizardKey}: schedule-bookKey ${bk} existiert`);
    check(!sch.cycle || /^[a-zA-Z]+$/.test(sch.cycle), `Wizard ${w.wizardKey}: schedule-cycle aufgelöst (${sch.cycle})`);
  }
}

console.log("\n=== planFromAnswers (Hygieneplan) ===");
const hy = planFromAnswers(getWizard("hygiene_plan"), {});
check(hy.planRows.length > 0, `Hygieneplan erzeugt Plan-Zeilen (${hy.planRows.length})`);
check(hy.schedules.length > 0, `Hygieneplan erzeugt Schedules (${hy.schedules.length})`);
check(hy.schedules.every((s) => s.cycle && !("cycleFromAnswer" in s)), "cycleFromAnswer ist zu echtem cycle aufgelöst");
const boeden = hy.schedules.find((s) => /Bodenreinigung/i.test(s.title));
check(boeden && boeden.cycle === "daily", "Bodenreinigung default-Zyklus = daily (aus FREQ-Default)");

console.log("\n=== Ja/Nein-Verzweigung ===");
const hyNo = planFromAnswers(getWizard("hygiene_plan"), { flaechen_patientennah: false });
check(!hyNo.planRows.some((r) => r.was === "Patientennahe Flächen"), "Nein bei patientennahen Flächen -> keine Zeile");
const hyYes = planFromAnswers(getWizard("hygiene_plan"), { flaechen_patientennah: true });
check(hyYes.planRows.some((r) => r.was === "Patientennahe Flächen"), "Ja -> Zeile vorhanden");

console.log("\n=== Pflichtfelder (OP-Checkliste) ===");
const opc = planFromAnswers(getWizard("op_checklist"), {});
check(opc.requiredFields.length >= 3, `OP-Checkliste sammelt Pflichtfelder (${opc.requiredFields.length})`);
check(opc.requiredFields.every((f) => f.key), "Pflichtfelder haben Keys");

console.log("\n=== previewWizard ===");
const pv = previewWizard("sterilization_log", {});
check(pv.ok && pv.plan, "previewWizard liefert Plan");
check(previewWizard("gibtsnicht", {}).ok === false, "unbekannter Wizard -> ok:false");

console.log("\n=== Intelligente Verteilung (pickSlot, PURE) ===");
const NOW = Date.parse("2026-07-06T06:00:00Z");
check(isWorkday("2026-07-10") === true, "Freitag ist Arbeitstag");
check(isWorkday("2026-07-11") === false, "Samstag ist kein Arbeitstag");

// Wochenende meiden: Frist Samstag -> Slot auf Freitag davor.
const wknd = pickSlot({ dueAtIso: "2026-07-11T20:00:00Z", leadDays: 0, nowMs: NOW });
check(wknd.slice(0, 10) === "2026-07-10" && isWorkday(wknd.slice(0, 10)), `Wochenend-Frist -> Arbeitstag (${wknd})`);

// Lastarm: 08.07. ist voll -> nächster freier Arbeitstag 09.07.
const spread = pickSlot({ dueAtIso: "2026-07-13T20:00:00Z", leadDays: 5, nowMs: NOW, loadByDay: { "2026-07-08": 3 } });
check(spread.slice(0, 10) === "2026-07-09", `lastarmer Tag gewählt (${spread})`);

// Deterministisch: gleiche Eingabe -> gleiches Ergebnis.
const a = pickSlot({ dueAtIso: "2026-07-13T20:00:00Z", leadDays: 5, nowMs: NOW, jitterKey: "abc" });
const b = pickSlot({ dueAtIso: "2026-07-13T20:00:00Z", leadDays: 5, nowMs: NOW, jitterKey: "abc" });
check(a === b, "pickSlot ist deterministisch");

check(loadByDayFromJobs([{ scheduledFor: "2026-07-09T08:00:00Z" }, { scheduledFor: "2026-07-09T12:00:00Z" }])["2026-07-09"] === 2, "loadByDayFromJobs zählt je Tag");

console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALLE CHECKS OK");
process.exit(failed ? 1 : 0);
