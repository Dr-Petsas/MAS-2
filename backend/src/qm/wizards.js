import { getWizard, getArtifact, getProfileWizard, getOptionLists } from "./catalog.js";
import { activateBook, setBookPlans } from "./books.js";
import { createSchedule } from "./schedules.js";
import { createJob } from "./jobs.js";
import { nextDueFrom, isRecurring } from "./recurrence.js";
import { log } from "../log.js";

// ============================================================================
// Deterministische QM-Wizards (Julia).
//
// Ein Wizard (qm-wizards.json) ist ein Fragebogen: pro Frage bevorzugt Ja/Nein,
// sonst Dropdown. Jede Antwort erzeugt DETERMINISTISCH Plan-Zeilen, Schedules
// (Wiederholungen), Pflichtfelder und Buch-Aktivierungen — kein KI-Raten.
//
//   planFromAnswers()  – PURE: Antworten -> { planRows, schedules,
//                        requiredFields, activateBooks, flags, meta }.
//   applyWizard()      – wendet das Ergebnis an: Buch aktivieren, Pläne ablegen,
//                        Schedules + erste Jobs erzeugen (Julia verteilt sie).
// ============================================================================

function s(v) {
  return String(v ?? "").trim();
}
function asBool(v) {
  return v === true || v === 1 || v === "1" || v === "true" || v === "ja";
}

/** Alle Fragen eines Wizards nach id indizieren (für Default-/Condition-Lookup). */
function indexQuestions(wizard) {
  const byId = new Map();
  for (const sec of wizard.sections || []) {
    for (const q of sec.questions || []) byId.set(q.id, q);
  }
  return byId;
}

function coerce(q, raw) {
  if (!q) return raw;
  if (q.type === "boolean") return asBool(raw);
  return raw;
}

/** Antwort einer Frage auflösen (gegebene Antwort, sonst Default). */
function resolveAnswer(q, answers, byId) {
  const raw = Object.prototype.hasOwnProperty.call(answers || {}, q.id) ? answers[q.id] : q.default;
  return coerce(q, raw);
}
function resolveById(id, answers, byId) {
  const q = byId.get(id);
  if (!q) return (answers || {})[id];
  return resolveAnswer(q, answers, byId);
}

function questionVisible(q, answers, byId) {
  const c = q.condition;
  if (!c || typeof c !== "object") return true;
  if (c.q) {
    const val = resolveById(c.q, answers, byId);
    return val === c.eq;
  }
  return true;
}

function sectionVisible(sec, ctx) {
  const c = sec.condition;
  if (!c || typeof c !== "object") return true;
  if (typeof c.capability === "string") {
    const want = c.eq === undefined ? true : c.eq;
    return asBool((ctx.capabilities || {})[c.capability]) === want;
  }
  return true;
}

/**
 * PURE: Fragebogen-Antworten in ein deterministisches Bau-Ergebnis übersetzen.
 * @param {object} wizard  – Wizard-Definition (aus catalog.getWizard)
 * @param {object} answers – { [questionId]: value }
 * @param {object} ctx     – { capabilities } für Abschnitts-Bedingungen
 */
export function planFromAnswers(wizard, answers = {}, ctx = {}) {
  const result = {
    planRows: [],
    schedules: [],
    requiredFields: [],
    activateBooks: [],
    flags: [],
    meta: {},
  };
  if (!wizard) return result;

  const byId = indexQuestions(wizard);
  const bookSet = new Set();
  const flagSet = new Set();
  const reqByKey = new Map();
  const schedSeen = new Set();
  let lastRow = null;

  const defaultBook = wizard.artifactKey || null;

  const addRequiredFields = (rf) => {
    const arr = Array.isArray(rf) ? rf : [rf];
    for (const f of arr) {
      if (f && f.key && !reqByKey.has(f.key)) reqByKey.set(f.key, f);
    }
  };

  const applyProduce = (produce, value) => {
    if (!produce || typeof produce !== "object") return;

    if (produce.planRow) {
      const row = { ...produce.planRow };
      if (row.setWomitFromAnswer) { row.womit = value; delete row.setWomitFromAnswer; }
      result.planRows.push(row);
      lastRow = row;
    }
    if (produce.setPlanField && lastRow) {
      lastRow[produce.setPlanField] = value;
    }
    if (produce.schedule) {
      const sc = produce.schedule;
      const cycle = sc.cycleFromAnswer ? s(value) : s(sc.cycle);
      const sched = {
        title: s(sc.title) || wizard.title,
        cycle,
        recurrenceMode: s(sc.recurrenceMode) || "fixed",
        assignedRole: s(sc.role) || null,
        leadDays: Math.max(0, Number(sc.leadDays) || 0),
        bookKey: s(sc.bookKey) || defaultBook,
      };
      const dedupe = `${sched.bookKey}|${sched.title}|${sched.cycle}`;
      if (!schedSeen.has(dedupe)) { schedSeen.add(dedupe); result.schedules.push(sched); }
      if (sc.requiredField) addRequiredFields(sc.requiredField);
    }
    if (produce.requiredField) addRequiredFields(produce.requiredField);
    if (produce.activateBook) bookSet.add(s(produce.activateBook));

    for (const metaKey of ["setCapability", "setActivity", "setSector", "setStaffRole", "setDeviceRef", "setScheduleRole"]) {
      if (produce[metaKey] !== undefined) {
        result.meta[metaKey] = result.meta[metaKey] || [];
        result.meta[metaKey].push(produce[metaKey]);
      }
    }
    if (produce.flag) flagSet.add(s(produce.flag));
  };

  for (const sec of wizard.sections || []) {
    if (!sectionVisible(sec, ctx)) continue;
    for (const q of sec.questions || []) {
      if (!questionVisible(q, answers, byId)) continue;
      const value = resolveAnswer(q, answers, byId);

      if (q.type === "boolean") {
        if (value === true && q.producesOnYes) applyProduce(q.producesOnYes, value);
        if (value === false && q.producesOnNo) applyProduce(q.producesOnNo, value);
        if (q.produces) applyProduce(q.produces, value);
      } else {
        if (value !== undefined && value !== null && value !== "" && q.produces) applyProduce(q.produces, value);
      }
    }
  }

  result.activateBooks = [...bookSet];
  result.flags = [...flagSet];
  result.requiredFields = [...reqByKey.values()];
  return result;
}

/** Vorschau (PURE, kein I/O): "So wird gebaut." Für das Frontend. */
export function previewWizard(wizardKey, answers = {}, ctx = {}) {
  const wizard = getWizard(wizardKey);
  if (!wizard) return { ok: false, reason: "unknown_wizard" };
  return { ok: true, wizardKey, title: wizard.title, artifactKey: wizard.artifactKey || null, plan: planFromAnswers(wizard, answers, ctx) };
}

/**
 * Wizard anwenden: Buch(er) aktivieren, Pläne ablegen, wiederkehrende Schedules
 * + sofort sichtbare erste Jobs anlegen (Julia weist automatisch der Rolle zu).
 * @returns {{ok:true, wizardKey, bookKey, activated:string[], scheduleCount, jobCount, planRowCount, requiredFieldCount, plan}}
 */
export async function applyWizard(clientId, wizardKey, answers = {}, opts = {}) {
  const wizard = getWizard(wizardKey);
  if (!wizard) return { ok: false, reason: "unknown_wizard" };

  const plan = planFromAnswers(wizard, answers, { capabilities: opts.capabilities || {} });
  const activated = [];
  const mainBook = wizard.artifactKey && getArtifact(wizard.artifactKey) ? wizard.artifactKey : null;

  if (mainBook) {
    const act = await activateBook(clientId, mainBook, {
      responsibleRole: s(opts.responsibleRole) || "",
      responsibleStaffId: s(opts.responsibleStaffId) || "",
      deputyStaffId: s(opts.deputyStaffId) || "",
    });
    if (act.ok) activated.push(mainBook);
  }
  for (const bk of plan.activateBooks) {
    if (bk === mainBook || !getArtifact(bk)) continue;
    const act = await activateBook(clientId, bk, {});
    if (act.ok) activated.push(bk);
  }

  if (mainBook && plan.planRows.length) {
    await setBookPlans(clientId, mainBook, plan.planRows);
  }

  const nowIso = new Date().toISOString();
  let scheduleCount = 0;
  let jobCount = 0;

  for (const sched of plan.schedules) {
    if (!isRecurring(sched.cycle)) continue; // perUse/onEvent: Checkliste am Buch, kein Zyklus
    const bookKey = getArtifact(sched.bookKey) ? sched.bookKey : mainBook;
    if (!bookKey) continue;

    const created = await createSchedule(clientId, {
      bookKey,
      title: sched.title,
      cycle: sched.cycle,
      mode: sched.recurrenceMode,
      leadDays: sched.leadDays,
      assignedRole: sched.assignedRole || "",
      firstDueAt: nextDueFrom(sched.cycle, nowIso),
    });
    if (created.ok) scheduleCount++;

    if (opts.createFirstJobs !== false) {
      const job = await createJob(clientId, {
        bookKey,
        title: sched.title,
        scheduledFor: nowIso,
        dueAt: nowIso,
        leadDays: sched.leadDays,
        assignedRole: sched.assignedRole || "",
        recurrenceId: created.ok ? created.schedule.id : "",
        recurrenceMode: sched.recurrenceMode,
        cycle: sched.cycle,
        createdBy: "julia",
      });
      if (job.ok) jobCount++;
    }
  }

  log.info("qm.wizard_applied", { clientId, wizardKey, activated: activated.length, scheduleCount, jobCount });
  return {
    ok: true,
    wizardKey,
    bookKey: mainBook,
    activated,
    scheduleCount,
    jobCount,
    planRowCount: plan.planRows.length,
    requiredFieldCount: plan.requiredFields.length,
    plan,
  };
}

export { getWizard, getProfileWizard, getOptionLists };
