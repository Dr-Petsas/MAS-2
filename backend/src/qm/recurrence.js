// ============================================================================
// Wiederholungs-Logik (PURE, kein I/O).
//
// Bewusst KEINE volle RRULE-Engine als Abhängigkeit: das QM braucht ein kleines,
// auditierbares Zyklus-Vokabular. Zwei Modi (s. JULIA_QM.md):
//   - fixed:                nächste Fälligkeit steht fest (z. B. täglich), egal
//                           wann erledigt wurde.
//   - anchor_on_completion: nächste Fälligkeit zählt AB der letzten Erledigung
//                           (z. B. Konstanzprüfung 1 Jahr nach letzter).
// ============================================================================

export const CYCLES = Object.freeze({
  WORKDAY: "workday",       // jeder Arbeitstag (Sa/So übersprungen)
  DAILY: "daily",
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",     // alle 14 Tage
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  HALF_YEARLY: "halfYearly", // halbjährlich (Unterweisung Jugendliche etc.)
  YEARLY: "yearly",
  TWO_YEARLY: "twoYearly",  // alle 2 Jahre (STK, Sachkunde, Ersthelfer, GBU-Review)
  FIVE_YEARLY: "fiveYearly",
  PER_CHARGE: "perCharge",  // bei jedem Sterilisationszyklus -> kein Zeit-Zyklus
  PER_USE: "perUse",        // pro Nutzung/Eingriff -> kein Zeit-Zyklus
  ON_EVENT: "onEvent",      // anlassbezogen -> kein Zeit-Zyklus
});

const CYCLE_LABELS = {
  workday: "arbeitstäglich",
  daily: "täglich",
  weekly: "wöchentlich",
  biweekly: "14-tägig",
  monthly: "monatlich",
  quarterly: "vierteljährlich",
  halfYearly: "halbjährlich",
  yearly: "jährlich",
  twoYearly: "alle 2 Jahre",
  fiveYearly: "alle 5 Jahre",
  perCharge: "pro Charge",
  perUse: "pro Nutzung",
  onEvent: "anlassbezogen",
};

export function cycleLabel(cycle) {
  return CYCLE_LABELS[String(cycle || "").trim()] || String(cycle || "");
}

/** A cycle that produces scheduled, time-based due dates. */
export function isRecurring(cycle) {
  const c = String(cycle || "").trim();
  return [
    CYCLES.WORKDAY, CYCLES.DAILY, CYCLES.WEEKLY, CYCLES.BIWEEKLY, CYCLES.MONTHLY,
    CYCLES.QUARTERLY, CYCLES.HALF_YEARLY, CYCLES.YEARLY, CYCLES.TWO_YEARLY, CYCLES.FIVE_YEARLY,
  ].includes(c);
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
/** Add n business days (skip Sat/Sun). Holidays are handled at distribution time. */
function addBusinessDays(d, n) {
  let x = new Date(d.getTime());
  let left = Math.max(1, n);
  while (left > 0) {
    x = addDays(x, 1);
    const dow = x.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return x;
}
function addMonths(d, n) {
  const x = new Date(d.getTime());
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  // clamp to month end (e.g. 31 Jan + 1 month -> 28/29 Feb)
  const lastDay = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, lastDay));
  return x;
}

/**
 * Next due date as ISO string, computed from a base date + cycle.
 * @param {string} cycle
 * @param {string|number|Date} fromIso base instant (defaults to now)
 * @returns {string|null} ISO of next due, or null for non-recurring cycles
 */
export function nextDueFrom(cycle, fromIso = Date.now()) {
  const c = String(cycle || "").trim();
  if (!isRecurring(c)) return null;
  const base = new Date(fromIso);
  if (isNaN(base.getTime())) return null;

  let next;
  switch (c) {
    case CYCLES.WORKDAY: next = addBusinessDays(base, 1); break;
    case CYCLES.DAILY: next = addDays(base, 1); break;
    case CYCLES.WEEKLY: next = addDays(base, 7); break;
    case CYCLES.BIWEEKLY: next = addDays(base, 14); break;
    case CYCLES.MONTHLY: next = addMonths(base, 1); break;
    case CYCLES.QUARTERLY: next = addMonths(base, 3); break;
    case CYCLES.HALF_YEARLY: next = addMonths(base, 6); break;
    case CYCLES.YEARLY: next = addMonths(base, 12); break;
    case CYCLES.TWO_YEARLY: next = addMonths(base, 24); break;
    case CYCLES.FIVE_YEARLY: next = addMonths(base, 60); break;
    default: return null;
  }
  return next.toISOString();
}

/**
 * The instant at which a reminder/push should first go out, i.e. dueAt minus
 * the configured lead time (Vorlauf). Never before "now" would be wrong — we
 * just compute the calendar instant; the scheduler decides when to act.
 */
export function leadStartFrom(dueIso, leadDays = 0) {
  const due = new Date(dueIso);
  if (isNaN(due.getTime())) return null;
  return addDays(due, -Math.max(0, Number(leadDays) || 0)).toISOString();
}
