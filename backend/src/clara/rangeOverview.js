import { getRangeAppointments, todayBerlin } from "./daySchedule.js";

// Gesprochene Ausgabe fuer einen DATUMSBEREICH (Woche/Monat/Quartal/...).
// day_briefing-Bereich  -> buildSpokenRangeOverview (Summe + Auffaelligster Tag)
// list_day_appointments -> buildSpokenRangeList (Tages-Aufschluesselung)
//
// Beide lesen den Bereich EINMAL ueber getRangeAppointments (gleiche Filter wie
// der Einzeltag) und zaehlen NUR — keine Euro-/Umsatzzahlen (Vorgabe), keine
// erfundenen Namen. Zahlen bleiben Ziffern; die Sprech-Schicht in Clara-Voice
// (response_guard) spricht sie als Woerter aus.

const TZ = "Europe/Berlin";

function berlinDayOf(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ms));
}

function germanDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  const wd = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(d);
  const day = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric" }).format(d);
  const mon = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, month: "long" }).format(d);
  return `${wd}, den ${day}. ${mon}`;
}

function germanWeekday(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  const wd = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(d);
  const day = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric" }).format(d);
  const mon = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, month: "long" }).format(d);
  return `${wd}, der ${day}. ${mon}`;
}

// Termine (ohne Absenzen) je Berlin-Tag zaehlen; Neupatienten mit erfassen.
function perDayStats(appointments) {
  const map = new Map(); // day -> { total, newPatients }
  let total = 0;
  let newPatients = 0;
  for (const a of appointments) {
    if (a.isAbsence) continue;
    const day = berlinDayOf(a.startMs);
    if (!map.has(day)) map.set(day, { total: 0, newPatients: 0 });
    const s = map.get(day);
    s.total += 1;
    total += 1;
    if (a.newPatient) { s.newPatients += 1; newPatients += 1; }
  }
  const days = [...map.entries()]
    .map(([day, s]) => ({ day, ...s }))
    .sort((x, y) => (x.day < y.day ? -1 : 1));
  return { days, total, newPatients };
}

// Vergangenheit (Bereichsende vor heute) -> "hatten Sie"; sonst "haben Sie".
function haveVerb(to) {
  return (to && to < todayBerlin()) ? "hatten Sie" : "haben Sie";
}

/**
 * Bereichs-Lagebild fuer day_briefing: Gesamtzahl + Neupatienten + der
 * vollste/ruhigste Tag. Kompakt (2-3 Saetze), kein Termin einzeln.
 */
export async function buildSpokenRangeOverview(clientId, { from, to, calendarId, rangeLabel = "" } = {}) {
  const data = await getRangeAppointments(clientId, { from, to, calendarId });
  if (!data.ok) {
    return {
      ok: false,
      message: data.reason === "no_location"
        ? "Es ist keine Praxis-Buchungskonfiguration hinterlegt."
        : `Zeitraum nicht verfügbar (${data.reason}).`,
    };
  }
  const { days, total, newPatients } = perDayStats(data.appointments);
  const spanLabel = rangeLabel
    ? `${rangeLabel}, also von ${germanDate(data.from)} bis ${germanDate(data.to)},`
    : `von ${germanDate(data.from)} bis ${germanDate(data.to)}`;
  const verb = haveVerb(data.to);

  if (total === 0) {
    return {
      ok: true, from: data.from, to: data.to, days: days.length,
      message: `Im Zeitraum ${spanLabel} sind keine Termine gebucht.`,
      counts: { total: 0, newPatients: 0 },
    };
  }

  const parts = [];
  const newBit = newPatients > 0
    ? `, davon ${newPatients} ${newPatients === 1 ? "neuer Patient" : "neue Patienten"}`
    : "";
  parts.push(`Im Zeitraum ${spanLabel} ${verb} insgesamt ${total} ${total === 1 ? "Termin" : "Termine"}${newBit}.`);

  if (days.length > 1) {
    const busiest = days.reduce((a, b) => (b.total > a.total ? b : a));
    const quietest = days.reduce((a, b) => (b.total < a.total ? b : a));
    const wasIst = (data.to < todayBerlin()) ? "war" : "ist";
    if (busiest.day !== quietest.day && busiest.total !== quietest.total) {
      parts.push(
        `Am vollsten ${wasIst} ${germanWeekday(busiest.day)} mit ${busiest.total} ` +
        `${busiest.total === 1 ? "Termin" : "Terminen"}, am ruhigsten ${germanWeekday(quietest.day)} ` +
        `mit ${quietest.total} ${quietest.total === 1 ? "Termin" : "Terminen"}.`,
      );
    } else {
      parts.push(
        `Verteilt auf ${days.length} ${days.length === 1 ? "Tag" : "Tage"} mit Terminen.`,
      );
    }
  }

  return {
    ok: true, from: data.from, to: data.to, days: days.length,
    clamped: data.clamped === true,
    message: parts.join(" "),
    counts: { total, newPatients },
  };
}

/**
 * Bereichs-Terminliste fuer list_day_appointments: Aufschluesselung je Tag mit
 * Termin ("Montag ... zehn Termine, Dienstag ... zwoelf ..."). Bei sehr vielen
 * Termin-Tagen (>12) wird auf das kompakte Lagebild zurueckgefallen, damit das
 * Vorlesen nicht ausufert.
 */
export async function buildSpokenRangeList(clientId, { from, to, calendarId, rangeLabel = "" } = {}) {
  const data = await getRangeAppointments(clientId, { from, to, calendarId });
  if (!data.ok) {
    return {
      ok: false,
      message: data.reason === "no_location"
        ? "Es ist keine Praxis-Buchungskonfiguration hinterlegt."
        : `Zeitraum nicht verfügbar (${data.reason}).`,
    };
  }
  const { days, total } = perDayStats(data.appointments);
  const spanLabel = rangeLabel
    ? `${rangeLabel}, von ${germanDate(data.from)} bis ${germanDate(data.to)}`
    : `von ${germanDate(data.from)} bis ${germanDate(data.to)}`;

  if (total === 0) {
    return { ok: true, from: data.from, to: data.to, count: 0,
      message: `Im Zeitraum ${spanLabel} sind keine Termine gebucht.` };
  }

  // Zu viele Termin-Tage -> kompaktes Lagebild statt endloser Aufzaehlung.
  if (days.length > 12) {
    const overview = await buildSpokenRangeOverview(clientId, { from, to, calendarId, rangeLabel });
    return { ok: true, from: data.from, to: data.to, count: total, message: overview.message };
  }

  const verb = haveVerb(data.to);
  const dayBits = days.map(
    (d) => `${germanWeekday(d.day)} ${d.total} ${d.total === 1 ? "Termin" : "Termine"}`,
  );
  const message = `Im Zeitraum ${spanLabel} ${verb}: ${dayBits.join("; ")}. `
    + `Insgesamt ${total} ${total === 1 ? "Termin" : "Termine"}.`;

  return { ok: true, from: data.from, to: data.to, count: total, message };
}
