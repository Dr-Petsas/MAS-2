import {
  getDayAppointments,
  computeDayBriefing,
  buildSpokenDayBriefing,
  todayBerlin,
} from "./daySchedule.js";
import { queryRecent } from "../brain/eventStore.js";
import { buildBriefing } from "../brain/briefing.js";
import { buildRedList, spokenRedList } from "../brain/redList.js";

// ============================================================================
// Tages-Lagebild ("Was läuft heute?" / "Tagesprotokoll").
//
// Chef-Wunsch 15.06.2026: bei vielen Einträgen NICHT jeden Termin/Patient
// einzeln vorlesen, sondern AUSZOOMEN — eine Kopfzeile mit Zahlen
// ("34 Termine von 8 bis 17 Uhr, 12 E-Mails, 34 Anrufe") und dann nur die
// WICHTIGSTEN Auffälligkeiten (Beschwerde, dringende Anwalts-/Kammer-/
// Steuerberater-Mail). Erst auf Nachfrage gehen wir ins Detail.
//
// Das ersetzt das frühere kleinteilige Vorlesen (das auch den Loop-Guard im
// Sprach-Worker fälschlich auslöste — "ich drehe mich im Kreis").
// ============================================================================

const TZ = "Europe/Berlin";

function berlinDay(ts) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ts));
}

function spokenClock(ts) {
  const d = new Date(ts);
  const h = Number(new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d));
  const m = Number(new Intl.DateTimeFormat("de-DE", { timeZone: TZ, minute: "2-digit" }).format(d));
  return m ? `${h} Uhr ${m}` : `${h} Uhr`;
}

/**
 * One spoken "Lagebild" for the day. Calendar headline always; comms counts +
 * highlights only for TODAY (gestern/morgen haben kein "heute eingetroffen").
 * Every brain source is best-effort — a failing section is silently skipped.
 *
 * @param {string} clientId
 * @param {{date?:string, calendarId?:string, operatorDoctorName?:string}} [opts]
 */
export async function buildSpokenDayOverview(clientId, { date, calendarId, operatorDoctorName = "" } = {}) {
  const today = todayBerlin();
  const day = (date || "").trim() || today;
  const isToday = day === today;

  const dayData = await getDayAppointments(clientId, { date: day, calendarId });
  if (!dayData.ok) {
    return {
      ok: false,
      message: dayData.reason === "no_location"
        ? "Es ist keine Praxis-Buchungskonfiguration hinterlegt."
        : `Tagesplan nicht verfügbar (${dayData.reason}).`,
    };
  }

  const briefing = computeDayBriefing(dayData.appointments, { calendars: dayData.calendars });
  const parts = [];

  // 1. Kalender-Kopf (Zoom-out: Gesamtzahl + Tagesspanne, keine Einzelzeilen).
  parts.push(buildSpokenDayBriefing(briefing, { date: dayData.date, operatorDoctorName, overview: true }));

  let hadComms = false;
  let hadHighlights = false;

  // 2.+3. nur für HEUTE: was ist über Telefon/E-Mail reingekommen + was fällt auf.
  if (isToday) {
    const since = Date.now() - 26 * 60 * 60 * 1000;
    const events = await queryRecent(clientId, since, 1000).catch(() => []);
    const todays = (events || []).filter((e) => e.ts && berlinDay(e.ts) === today);

    const calls = todays.filter((e) => /call/.test(e.channel || "") && (e.direction || "in") === "in").length;
    const mails = todays.filter((e) => /(mail|email)/.test(e.channel || "") && (e.direction || "in") === "in").length;

    const commsBits = [];
    if (mails) commsBits.push(mails === 1 ? "eine E-Mail" : `${mails} E-Mails`);
    if (calls) commsBits.push(calls === 1 ? "ein Anruf" : `${calls} Anrufe`);
    if (commsBits.length) {
      const verb = commsBits.length === 1 && (mails === 1 || calls === 1) ? "ist" : "sind";
      parts.push(`Heute ${verb} ${commsBits.join(" und ")} eingegangen.`);
      hadComms = true;
    }

    // Top-Auffälligkeiten: rote Liste (Anwalt/Kammer/Mahnung/Fristen) ZUERST,
    // dann die jüngste Beschwerde. Maximal drei Punkte — den Rest auf Nachfrage.
    const highlights = [];
    try {
      const redList = await buildRedList(clientId).catch(() => ({ critical: [], deadlines: [] }));
      const red = spokenRedList(redList, { max: 2, bare: true });
      if (red) highlights.push(red);
    } catch { /* rote Liste optional */ }
    try {
      const c = buildBriefing(todays).groups.complaints[0];
      if (c) highlights.push(`${c.who} hat sich um ${spokenClock(c.ts)} gemeldet${c.summary ? ` — ${c.summary}` : ""}`);
    } catch { /* Beschwerde optional */ }

    if (highlights.length) {
      parts.push(`Aufgefallen ist mir: ${highlights.slice(0, 3).join("; ")}.`);
      hadHighlights = true;
    }
  }

  // 4. Detail-Angebot — nennt nur die Dimensionen, die es heute auch gibt.
  const drill = ["die Termine"];
  if (hadComms) drill.push("E-Mails oder Anrufe");
  if (hadHighlights) drill.push("die Auffälligkeiten");
  parts.push(`Soll ich irgendwo ins Detail gehen — ${drill.join(", ")}?`);

  return {
    ok: true,
    date: dayData.date,
    message: parts.filter(Boolean).join(" "),
    counts: { total: briefing.total, newPatients: briefing.newPatients, unconfirmed: briefing.unconfirmed },
  };
}
