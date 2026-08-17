import {
  getDayAppointments,
  getPatientAppointments,
  computeDayBriefing,
  buildSpokenDayBriefing,
  todayBerlin,
} from "./daySchedule.js";
import { queryRecent } from "../brain/eventStore.js";
import { buildBriefing } from "../brain/briefing.js";
import { buildRedList, spokenRedList } from "../brain/redList.js";
import { karteTag } from "./karten.js";
import { vary } from "./speech.js";
import { listActiveCasesByPatientIds } from "../brain/caseStore.js";
import { sammleAuffaelligkeiten, sprecheAuffaelligkeiten } from "./dayNotables.js";

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

  // Eine gemeinsame "jetzt"-Uhr fuer Zaehlung und Sprechtext, damit der
  // Mittags-Blickwinkel (was steht NOCH an) konsistent ist.
  const nowMs = Date.now();
  const briefing = computeDayBriefing(dayData.appointments, { calendars: dayData.calendars, nowMs });
  const parts = [];

  // 1. Kalender-Kopf (Zoom-out: Gesamtzahl + Tagesspanne, keine Einzelzeilen).
  parts.push(buildSpokenDayBriefing(briefing, { date: dayData.date, operatorDoctorName, overview: true, nowMs }));

  let hadComms = false;
  let hadHighlights = false;
  let mails = 0;
  let calls = 0;
  const highlights = [];

  // 2. Auffaelligkeiten der HEUTIGEN Patienten — nicht die Chronologie.
  // Unterlagen, Notizen, Mails, Mehrfach-Anrufe, versaeumter letzter Termin.
  const echte = (dayData.appointments || []).filter((a) => !a.isAbsence && a.patientId);

  // Alles, was nur die Patienten-IDs von oben braucht, laeuft NEBENEINANDER
  // (17.08.2026): Vorgaenge, Tages-Ereignisse, Patienten-Historien und rote
  // Liste hingen bisher hintereinander an je einer Firestore-Runde. Live kostete
  // das Tages-Lagebild dadurch mehrere Sekunden, bevor ueberhaupt jemand sprach.
  const [casesByPatient, todays, lastByPatient, redList] = await Promise.all([
    listActiveCasesByPatientIds(clientId, echte.map((a) => a.patientId))
      .catch(() => new Map()),
    isToday
      ? queryRecent(clientId, Date.now() - 26 * 60 * 60 * 1000, 1000)
        .then((ev) => (ev || []).filter((e) => e.ts && berlinDay(e.ts) === today))
        .catch(() => [])
      : Promise.resolve([]),
    Promise.all(echte.slice(0, 6).map(async (a) => {
      const hist = await getPatientAppointments(clientId, {
        patientId: a.patientId, lastName: a.patientLastName,
      }).catch(() => null);
      return hist?.ok && hist.last ? [String(a.patientId), hist.last] : null;
    })).then((paare) => new Map(paare.filter(Boolean))).catch(() => new Map()),
    isToday
      ? buildRedList(clientId).catch(() => ({ critical: [], deadlines: [] }))
      : Promise.resolve({ critical: [], deadlines: [] }),
  ]);

  if (isToday) {
    calls = todays.filter((e) => /call/.test(e.channel || "") && (e.direction || "in") === "in").length;
    mails = todays.filter((e) => /(mail|email)/.test(e.channel || "") && (e.direction || "in") === "in").length;
    if (mails || calls) hadComms = true;
  }

  const attention = (briefing.attention || []).map((a) => ({
    ...a,
    time: a.startMs ? spokenClock(a.startMs) : "",
  }));
  const notables = sammleAuffaelligkeiten({
    appointments: echte.map((a) => ({ ...a, time: a.startMs ? spokenClock(a.startMs) : "" })),
    briefing: { ...briefing, attention },
    casesByPatient,
    events: todays,
    lastByPatient,
  });
  const notableText = sprecheAuffaelligkeiten(notables);
  if (notableText) {
    parts.push(notableText);
    hadHighlights = true;
  } else if (isToday && (mails || calls)) {
    const bits = [];
    if (mails) bits.push(mails === 1 ? "eine E-Mail" : `${mails} E-Mails`);
    if (calls) bits.push(calls === 1 ? "ein Anruf" : `${calls} Anrufe`);
    parts.push(`Heute ${bits.length === 1 && (mails === 1 || calls === 1) ? "ist" : "sind"} ${bits.join(" und ")} eingegangen.`);
  }

  // 3. Praxis-weit (nicht an einen Tagespatienten gebunden): rote Liste.
  if (isToday) {
    try {
      const red = spokenRedList(redList, { max: 2, bare: true });
      if (red) highlights.push(red);
    } catch { /* rote Liste optional */ }
    try {
      const c = buildBriefing(todays).groups.complaints[0];
      if (c) highlights.push(`${c.who} hat sich um ${spokenClock(c.ts)} gemeldet${c.summary ? ` — ${c.summary}` : ""}`);
    } catch { /* Beschwerde optional */ }
    if (highlights.length) {
      parts.push(`Dazu kommt: ${highlights.slice(0, 2).join(", und ")}.`);
      hadHighlights = true;
    }
  }

  // 4. Detail-Angebot — den Rest gibt es auf Zuruf, nicht in der Ansage.
  const drill = ["einzelne Termine"];
  if (hadComms) drill.push("Mails oder Anrufe");
  if (hadHighlights) drill.push("eine der Auffälligkeiten");
  parts.push(vary("brief.drill", [
    `Soll ich irgendwo ins Detail gehen — ${drill.join(", ")}?`,
    `Wenn Sie wollen, gehe ich ${drill.join(" oder ")} einzeln durch.`,
    `Den Rest habe ich, sagen Sie einfach, wo ich tiefer einsteige.`,
  ]));

  // Übersichts-Karte für die Handy-App: dieselben Fakten strukturiert
  // (Termine, Spanne, Lücken, Neupatienten, Ampeln, Kommunikation).
  const gaps = (briefing.byCalendar || []).flatMap((c) => c.gaps || [])
    .sort((a, b) => a.startMs - b.startMs);
  const dateLabel = isToday ? "Heute" : new Date(`${dayData.date}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long", day: "2-digit", month: "2-digit", timeZone: TZ,
  });
  const card = karteTag({
    dateLabel,
    total: briefing.total,
    firstMs: briefing.firstMs,
    lastMs: briefing.lastMs,
    newPatients: briefing.newPatients,
    unconfirmed: briefing.unconfirmed,
    docsRed: briefing.docsRed,
    docsYellow: briefing.docsYellow,
    gaps,
    attention: briefing.attention,
    mails,
    calls,
    highlights,
  });

  return {
    ok: true,
    date: dayData.date,
    message: parts.filter(Boolean).join(" "),
    counts: { total: briefing.total, newPatients: briefing.newPatients, unconfirmed: briefing.unconfirmed },
    card,
  };
}
