// ============================================================================
// Gesetzliche Feiertage (NRW) + Wochenend-Erkennung für gesprochene Ausgaben.
//
// Clara hat im Testlauf 12.06.2026 ein Wochenende wie einen Arbeitstag
// behandelt — und Feiertage kannte sie gar nicht. Dieses Modul ist die EINE
// Quelle für "ist dieser Tag besonders?": daySchedule, callLog und Briefings
// holen sich hier Wochenend-/Feiertagslabels, statt es jeweils selbst zu
// erraten. Praxis ist in Düsseldorf -> NRW-Feiertagskalender.
// ============================================================================

const TZ = "Europe/Berlin";

/** Ostersonntag (gregorianisch, Gauß/Anonymous-Algorithmus) als UTC-Date. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=März, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function plusDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

// Feiertage eines Jahres als Map "YYYY-MM-DD" -> Name (gesetzlich in NRW).
const cache = new Map();
export function holidaysNRW(year) {
  if (cache.has(year)) return cache.get(year);
  const easter = easterSunday(year);
  const map = new Map([
    [`${year}-01-01`, "Neujahr"],
    [iso(plusDays(easter, -2)), "Karfreitag"],
    [iso(plusDays(easter, 1)), "Ostermontag"],
    [`${year}-05-01`, "Tag der Arbeit"],
    [iso(plusDays(easter, 39)), "Christi Himmelfahrt"],
    [iso(plusDays(easter, 50)), "Pfingstmontag"],
    [iso(plusDays(easter, 60)), "Fronleichnam"],
    [`${year}-10-03`, "Tag der Deutschen Einheit"],
    [`${year}-11-01`, "Allerheiligen"],
    [`${year}-12-25`, "Erster Weihnachtstag"],
    [`${year}-12-26`, "Zweiter Weihnachtstag"],
  ]);
  cache.set(year, map);
  return map;
}

/** Feiertagsname für "YYYY-MM-DD" (NRW), sonst "". */
export function holidayName(dateStr) {
  const year = Number(String(dateStr || "").slice(0, 4));
  if (!Number.isFinite(year) || year < 1970) return "";
  return holidaysNRW(year).get(dateStr) || "";
}

/** Samstag/Sonntag? (Datum ist ein Berlin-Kalendertag, daher reicht UTC-noon.) */
export function isWeekend(dateStr) {
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

function weekdayName(dateStr) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" })
    .format(new Date(`${dateStr}T12:00:00Z`));
}

/**
 * Kurzlabel, wenn der Tag KEIN normaler Arbeitstag ist:
 *   "Samstag" / "Sonntag" / "Fronleichnam, ein Feiertag" — sonst "".
 * Für gesprochene Einschübe ("morgen, Samstag, ...") und Begründungen
 * ("keine Termine — Wochenende").
 */
export function daySpecialLabel(dateStr) {
  const holiday = holidayName(dateStr);
  if (holiday) return `${holiday}, ein Feiertag`;
  if (isWeekend(dateStr)) return weekdayName(dateStr);
  return "";
}
