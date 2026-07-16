import { isWeekend, holidayName } from "../clara/holidays.js";

// ============================================================================
// Intelligente Terminierung von QM-Jobs (Julia).
//
// Ziel (Chef-Vorgabe): Jobs NICHT alle am selben Tag zur selben Uhrzeit; nach
// Möglichkeit an Tagen mit wenig Last und in patientenarmen Zeiten. Wochenenden
// und Feiertage werden gemieden (dort arbeitet niemand).
//
// PURE & deterministisch: alle Eingaben werden injiziert (Last je Tag, evtl.
// Patientendichte). Der Scheduler (schedules.js) füttert die echten Daten.
// ============================================================================

function iso(dateStr, hour, minute) {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${dateStr}T${hh}:${mm}:00`;
}
function dayStr(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function dayMs(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).getTime();
}

/** Arbeitstag? (kein Wochenende, kein NRW-Feiertag). */
export function isWorkday(dateStr) {
  if (!dateStr) return false;
  if (isWeekend(dateStr)) return false;
  if (holidayName(dateStr)) return false;
  return true;
}

/** Kleiner, stabiler Hash (für deterministisches Verteilen der Uhrzeiten). */
export function hashInt(str) {
  let h = 2166136261;
  const t = String(str || "");
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

// Patientenarme Standard-Slots (früh vor Sprechstunde / Mittag / nach Schluss).
const DEFAULT_SLOTS = [
  { hour: 7, minute: 30 },
  { hour: 12, minute: 30 },
  { hour: 13, minute: 0 },
  { hour: 17, minute: 30 },
];

/**
 * Einen konkreten Ausführungs-Slot (scheduledFor) im Vorlauf-Fenster wählen.
 *
 * @param {object} o
 *   dueAtIso   – Frist (Deadline) des Jobs
 *   leadDays   – Vorlauf in Tagen (Fenster = [dueAt-lead, dueAt])
 *   nowMs      – Jetzt (Fenster beginnt frühestens jetzt)
 *   loadByDay  – { "YYYY-MM-DD": number } geplante QM-Jobs je Tag
 *   densityByHour – optional { "YYYY-MM-DD": {hour:count} } Patiententermine
 *   jitterKey  – stabiler Schlüssel (z. B. schedule-Id) für die Uhrzeit-Streuung
 * @returns {string} ISO des gewählten Slots (Fallback: dueAtIso)
 */
export function pickSlot(o = {}) {
  const dueAtIso = o.dueAtIso;
  const dueMs = new Date(dueAtIso).getTime();
  if (!Number.isFinite(dueMs)) return dueAtIso;

  const leadDays = Math.max(0, Number(o.leadDays) || 0);
  const nowMs = Number(o.nowMs) || Date.now();
  const loadByDay = o.loadByDay || {};
  const densityByHour = o.densityByHour || {};

  const windowStartMs = Math.max(nowMs, dueMs - leadDays * 86400000);

  // Kandidaten-Arbeitstage im Fenster [windowStart, due] sammeln.
  const candidates = [];
  for (let ms = dayMs(dayStr(windowStartMs)); ms <= dueMs + 1; ms += 86400000) {
    const d = dayStr(ms);
    if (isWorkday(d)) candidates.push(d);
    if (candidates.length > 400) break; // Sicherung
  }

  let chosenDay;
  if (candidates.length === 0) {
    // Frist fällt auf Wochenende/Feiertag und kein Arbeitstag im Fenster:
    // den nächstgelegenen Arbeitstag VOR der Frist suchen (bis 7 Tage zurück).
    let back = dueMs;
    for (let i = 0; i < 7; i++) {
      const d = dayStr(back);
      if (isWorkday(d)) { chosenDay = d; break; }
      back -= 86400000;
    }
    if (!chosenDay) return dueAtIso; // keiner gefunden -> Deadline unverändert
  } else {
    // Tag mit der geringsten geplanten QM-Last (bei Gleichstand: früher).
    chosenDay = candidates[0];
    let best = Number(loadByDay[chosenDay] || 0);
    for (const d of candidates) {
      const load = Number(loadByDay[d] || 0);
      if (load < best) { best = load; chosenDay = d; }
    }
  }

  // Uhrzeit: patientenärmster Standard-Slot, deterministisch gestreut.
  const jitter = hashInt(o.jitterKey || dueAtIso);
  const dayDensity = densityByHour[chosenDay] || null;
  let slots = DEFAULT_SLOTS;
  if (dayDensity) {
    slots = [...DEFAULT_SLOTS].sort((a, b) => (Number(dayDensity[a.hour] || 0) - Number(dayDensity[b.hour] || 0)));
  }
  const slot = slots[jitter % slots.length];
  const minute = (slot.minute + (jitter % 4) * 5) % 60;
  return iso(chosenDay, slot.hour, minute);
}

/** Last je Tag (YYYY-MM-DD -> Anzahl) aus vorhandenen Jobs (nach scheduledFor). */
export function loadByDayFromJobs(jobs = []) {
  const map = {};
  for (const j of jobs) {
    const when = j.scheduledFor || j.dueAt;
    if (!when) continue;
    const d = String(when).slice(0, 10);
    map[d] = (map[d] || 0) + 1;
  }
  return map;
}
