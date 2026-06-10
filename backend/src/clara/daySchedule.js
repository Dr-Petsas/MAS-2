import admin from "../firebase.js";
import { loadBooking, ensureBerlinTz } from "./booking.js";
import { TOPIC_LABELS } from "../brain/cases.js";

// Clara's day-schedule read model: a spoken "what's on the calendar today" that
// reads the ACTUAL booked appointments (not just free slots, not tickets).
//
// Source of truth is the platform calendar:
//   clients/{clientId}/locations/{locationId}/appointments
// (same Firestore project; MAS-2 reads it via the admin SDK, read-only). We
// mirror the platform's own filtering: skip temporary holds (no patient, not an
// absence block) and multi-day items. Pure compute (computeDayBriefing /
// buildSpokenDayBriefing) is separated from I/O so it is unit-testable.

const TZ = "Europe/Berlin";
const GAP_MIN_MINUTES = 20; // ignore tiny gaps between back-to-back appointments

// --- time helpers (all Berlin-local for spoken output) ---------------------

export function todayBerlin() {
  // en-CA renders YYYY-MM-DD, which is exactly the ISO date we want.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function hhmm(ms) {
  if (!ms) return "";
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

function dateLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
}

function tsToMs(v) {
  if (v == null) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// --- normalisation ---------------------------------------------------------

function normalizeAppointment(id, o) {
  if (!o) return null;
  return {
    id,
    startMs: tsToMs(o.start),
    endMs: tsToMs(o.end),
    calendarId: o.calendar?.id || o.resourceId || "",
    calendarName: o.calendar?.name || "",
    visitMotive: o.visitMotive?.name || "",
    patientId: o.patient?.id || "",
    patientName: `${o.patient?.firstName || ""} ${o.patient?.lastName || ""}`.trim(),
    patientLastName: (o.patient?.lastName || "").trim(),
    patientGender: (o.patient?.gender || "").trim().toLowerCase(),
    comments: String(o.comments || "").trim(),
    docsStatus: String(o.patientDocsStatus || "").trim().toLowerCase(),
    newPatient: o.patient?.newPatient === true,
    isAbsence: o.calendarItemType === "absence",
    isMultiDay: o.isMultiDay === true,
    isVideoCall: o.isVideoCall === true,
    status: o.status || "",
  };
}

// --- I/O: read one day's appointments --------------------------------------

/**
 * Read the booked appointments for one Berlin day from the platform calendar.
 * @param {string} clientId
 * @param {{date?:string, calendarId?:string}} [opts] date = "YYYY-MM-DD" (default: today Berlin)
 */
export async function getDayAppointments(clientId, { date, calendarId } = {}) {
  const day = (date || "").trim() || todayBerlin();
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return { ok: false, reason: "no_location", date: day };

  const dayStart = new Date(ensureBerlinTz(`${day}T00:00:00`));
  const dayEnd = new Date(ensureBerlinTz(`${day}T23:59:59`));
  if (isNaN(dayStart.getTime()) || isNaN(dayEnd.getTime())) return { ok: false, reason: "bad_date", date: day };

  const snap = await admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments")
    .where("start", ">=", dayStart)
    .where("start", "<=", dayEnd)
    .orderBy("start")
    .get();

  let appts = snap.docs.map((d) => normalizeAppointment(d.id, d.data())).filter(Boolean);
  // Mirror the platform calendar: drop temporary holds (no patient & not an
  // absence block) and multi-day items, so counts match what the team sees.
  appts = appts.filter((a) => (a.patientId || a.isAbsence) && !a.isMultiDay);
  if (calendarId) appts = appts.filter((a) => a.calendarId === calendarId);

  return { ok: true, date: day, locationId, calendars: booking.calendars || [], appointments: appts };
}

// --- pure: build the structured briefing ------------------------------------

/**
 * Compute the day's structured overview: per-calendar counts + first/last +
 * free gaps, plus practice-wide highlights (new patients, unconfirmed, video,
 * absence blocks). Pure — feed it normalized appointments.
 */
export function computeDayBriefing(appointments = [], { calendars = [] } = {}) {
  const nameById = new Map((calendars || []).map((c) => [c.id, c.name]));
  const real = appointments.filter((a) => !a.isAbsence);
  const absences = appointments.filter((a) => a.isAbsence);

  const groups = new Map();
  for (const a of real) {
    const key = a.calendarId || "_";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  const byCalendar = [];
  for (const [calId, list] of groups) {
    list.sort((x, y) => x.startMs - y.startMs);
    const gaps = [];
    for (let i = 0; i < list.length - 1; i++) {
      const endMs = list[i].endMs || list[i].startMs;
      const nextStart = list[i + 1].startMs;
      const minutes = Math.round((nextStart - endMs) / 60000);
      if (minutes >= GAP_MIN_MINUTES) gaps.push({ startMs: endMs, endMs: nextStart, minutes });
    }
    byCalendar.push({
      calendarId: calId,
      calendarName: list[0].calendarName || nameById.get(calId) || "",
      count: list.length,
      firstMs: list[0].startMs,
      lastMs: list[list.length - 1].endMs || list[list.length - 1].startMs,
      gaps,
    });
  }
  byCalendar.sort((a, b) => (b.count - a.count) || (a.firstMs - b.firstMs));

  // Behandler-Hinweise: Terminnotizen aus dem Popup + Dokumenten-Ampel
  // (gelb = verschickt, aber noch nicht unterschrieben; rot = noch gar nicht
  // verschickt). Genau das, was man VOR dem Termin wissen muss.
  const attention = real
    .filter((a) => a.comments || a.docsStatus === "yellow" || a.docsStatus === "red")
    .sort((x, y) => x.startMs - y.startMs)
    .map((a) => ({
      startMs: a.startMs,
      patientName: a.patientName,
      patientLastName: a.patientLastName,
      patientGender: a.patientGender,
      calendarName: a.calendarName,
      comments: a.comments,
      docsStatus: a.docsStatus,
    }));

  return {
    total: real.length,
    byCalendar,
    newPatients: real.filter((a) => a.newPatient).length,
    unconfirmed: real.filter((a) => a.status === "needsConfirmation").length,
    videoCalls: real.filter((a) => a.isVideoCall).length,
    docsYellow: real.filter((a) => a.docsStatus === "yellow").length,
    docsRed: real.filter((a) => a.docsStatus === "red").length,
    attention,
    absences: absences.map((a) => ({ calendarName: a.calendarName, startMs: a.startMs, endMs: a.endMs })),
    firstMs: real.length ? Math.min(...real.map((a) => a.startMs)) : 0,
    lastMs: real.length ? Math.max(...real.map((a) => a.endMs || a.startMs)) : 0,
  };
}

// --- pure: spoken German text ----------------------------------------------

export function buildSpokenDayBriefing(briefing, { date, operatorName } = {}) {
  const label = dateLabel(date || todayBerlin());
  const hi = operatorName ? `${operatorName}, ` : "";
  if (!briefing || briefing.total === 0) {
    const blocks = briefing?.absences?.length
      ? ` Es sind nur ${briefing.absences.length} Sperrzeit(en) eingetragen.`
      : "";
    return `${hi ? hi.charAt(0).toUpperCase() + hi.slice(1) : ""}für ${label} sind keine Termine gebucht.${blocks}`.trim();
  }

  const parts = [];
  parts.push(`${hi ? hi.charAt(0).toUpperCase() + hi.slice(1) : ""}Tagesplan für ${label}: ${briefing.total} ${briefing.total === 1 ? "Termin" : "Termine"}.`);

  for (const c of briefing.byCalendar) {
    const who = c.calendarName || "Kalender";
    let line = `${who}: ${c.count} ${c.count === 1 ? "Termin" : "Termine"} von ${hhmm(c.firstMs)} bis ${hhmm(c.lastMs)}.`;
    if (c.gaps.length) {
      const g = c.gaps.slice(0, 3).map((x) => `${hhmm(x.startMs)}–${hhmm(x.endMs)}`).join(", ");
      line += ` Freie Lücke: ${g}.`;
    }
    parts.push(line);
  }

  const highlights = [];
  if (briefing.newPatients) highlights.push(`${briefing.newPatients} ${briefing.newPatients === 1 ? "Neupatient" : "Neupatienten"}`);
  if (briefing.unconfirmed) highlights.push(`${briefing.unconfirmed} unbestätigt`);
  if (briefing.videoCalls) highlights.push(`${briefing.videoCalls} Video-Termin(e)`);
  if (briefing.absences.length) highlights.push(`${briefing.absences.length} Sperrzeit(en)`);
  if (highlights.length) parts.push(`Hinweise: ${highlights.join(", ")}.`);

  // Terminnotizen + Dokumentenstatus — die Behandler-Pflichtinfos. Mehr als
  // ein paar gesprochene Hinweise verträgt ein Briefing nicht; der Rest steht
  // im Kalender und kommt über die Terminliste.
  const SPOKEN_ATTENTION_MAX = 6;
  const att = briefing.attention || [];
  if (att.length) {
    const lines = att.slice(0, SPOKEN_ATTENTION_MAX).map((a) => {
      const bits = [];
      if (a.docsStatus === "yellow") bits.push("Unterlagen sind noch nicht unterschrieben");
      else if (a.docsStatus === "red") bits.push("Unterlagen wurden noch nicht verschickt");
      if (a.comments) bits.push(`Notiz: ${a.comments.length > 100 ? `${a.comments.slice(0, 97)}...` : a.comments}`);
      return `um ${spokenTime(a.startMs)} ${spokenPatient(a)} — ${bits.join("; ")}`;
    });
    const rest = att.length - SPOKEN_ATTENTION_MAX;
    const more = rest > 0 ? ` Plus ${rest === 1 ? "ein weiterer Hinweis" : `${rest} weitere Hinweise`} im Kalender.` : "";
    parts.push(`Bitte beachten: ${lines.join(". ")}.${more}`);
  }

  return parts.join(" ");
}

// Voice is linear: more than this and the listener has lost the thread anyway.
const SPOKEN_LIST_MAX = 25;

// "morgen"/"heute" beats "am Mittwoch, den 10. Juni" — a receptionist says it
// that way too. Beyond übermorgen we fall back to the full weekday + date.
function relativeDayLabel(dateStr) {
  const today = todayBerlin();
  const diff = Math.round((Date.parse(`${dateStr}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  if (diff === 2) return "übermorgen";
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (isNaN(d.getTime())) return `am ${dateStr}`;
  const wd = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(d);
  const dm = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric", month: "long" }).format(d);
  return `am ${wd}, den ${dm}`;
}

function spokenTime(ms) {
  const parts = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return m === 0 ? `${h} Uhr` : `${h} Uhr ${m}`;
}

// Accusative salutation ("Sie haben ... Herrn X / Frau Y"). Without a gender
// we use the full name rather than guessing.
function spokenPatient(a) {
  const last = a.patientLastName || a.patientName;
  if (!last) return "einen Patienten ohne Namen";
  if (a.patientGender === "f") return `Frau ${last}`;
  if (a.patientGender === "m") return `Herrn ${last}`;
  return a.patientName || last;
}

// Turn clinic visit-motive labels into a natural reason phrase. Heuristic on
// purpose — unknown labels stay intact behind "für".
function spokenMotive(name) {
  const n = (name || "").toLowerCase();
  if (!n) return "";
  if (n.includes("notfall") || n.includes("akut")) return "mit akuten Beschwerden";
  if (n.includes("kontroll")) return "zur Kontrolle";
  if (n.includes("erstuntersuchung") || n.includes("neupatient")) return "zur Erstuntersuchung";
  if (n.includes("zahnreinigung")) return "zur professionellen Zahnreinigung";
  if (n.includes("zahnaufhellung")) return "zur Zahnaufhellung";
  if (n.includes("besprechung")) return `zur ${name.replace(/\s+Besprechung/i, "-Besprechung")}`;
  return `für ${name}`;
}

function joinSpoken(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`;
}

/**
 * Spoken list of the day's CONCRETE appointments, phrased like a colleague:
 * "Sie haben morgen um 14 Uhr Frau Thrandorf mit akuten Beschwerden und um
 * 14 Uhr 45 Herrn Diedershagen zur SLM-Besprechung." Pure — feed it
 * normalized appointments (already scoped to one calendar if doctorName was
 * resolved upstream). ``operatorDoctorName`` switches to "Sie haben" when the
 * asking operator IS the doctor whose calendar is read.
 */
export function buildSpokenDayList(appointments = [], { date, calendars = [], operatorDoctorName = "" } = {}) {
  const day = date || todayBerlin();
  const rel = relativeDayLabel(day);
  const real = appointments.filter((a) => !a.isAbsence).sort((x, y) => x.startMs - y.startMs);
  if (!real.length) return `Für ${rel === "heute" || rel === "morgen" || rel === "übermorgen" ? rel : dateLabel(day)} sind keine Termine gebucht.`;

  const nameById = new Map((calendars || []).map((c) => [c.id, c.name]));
  const groups = new Map();
  for (const a of real) {
    const key = a.calendarId || "_";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  const entry = (a) => {
    const motive = spokenMotive(a.visitMotive);
    const flag = a.newPatient && !/Erstuntersuchung/.test(motive) ? ", ein Neupatient" : "";
    let e = `um ${spokenTime(a.startMs)} ${spokenPatient(a)}${motive ? ` ${motive}` : ""}${flag}`;
    // Terminnotiz aus dem Kalender ("bringt vielleicht seine Frau mit ...").
    if (a.comments) e += `, Notiz: ${a.comments.length > 120 ? `${a.comments.slice(0, 117)}...` : a.comments}`;
    // Ampel der Patientenunterlagen — gelb/rot ist genau das, was das Team
    // VOR dem Termin wissen will (green stays silent). Plattform-Semantik:
    // gelb = verschickt, aber noch nicht unterschrieben; rot = noch nicht raus.
    if (a.docsStatus === "yellow") e += ", Achtung: die Unterlagen sind noch nicht unterschrieben";
    else if (a.docsStatus === "red") e += ", Achtung: die Unterlagen wurden noch nicht verschickt";
    return e;
  };

  const opDoc = (operatorDoctorName || "").trim().toLowerCase();
  const isOwn = (calName) => {
    const c = (calName || "").trim().toLowerCase();
    return !!opDoc && !!c && (c === opDoc || c.includes(opDoc) || opDoc.includes(c));
  };

  const truncated = real.length > SPOKEN_LIST_MAX;
  let remaining = SPOKEN_LIST_MAX;
  const parts = [];
  let first = true;
  for (const [calId, list] of groups) {
    if (remaining <= 0) break;
    const who = list[0].calendarName || nameById.get(calId) || "das Team";
    const entries = list.slice(0, remaining).map(entry);
    remaining -= entries.length;
    // "hat" governs the accusative, which spokenPatient produces ("Herrn X").
    const lead = isOwn(who) ? `Sie haben ${first ? rel : "außerdem"}` : `${who} hat ${first ? rel : ""}`.replace(/\s+$/, "");
    parts.push(`${lead} ${joinSpoken(entries)}.`);
    first = false;
  }
  if (groups.size > 1) parts.unshift(`Das sind ${real.length} Termine insgesamt.`);
  if (truncated) parts.push(`Das waren die ersten ${SPOKEN_LIST_MAX} — der Rest steht im Kalender.`);
  return parts.join(" ");
}

// More hints than this and the schedule reading turns into a monologue.
const MEMORY_HINT_MAX = 5;

function relativeAgo(ms) {
  if (!ms) return "";
  const dayOf = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  const diff = Math.round((Date.parse(`${dayOf(Date.now())}T12:00:00Z`) - Date.parse(`${dayOf(ms)}T12:00:00Z`)) / 86400000);
  if (diff <= 0) return "heute";
  if (diff === 1) return "gestern";
  if (diff === 2) return "vorgestern";
  return `vor ${diff} Tagen`;
}

/**
 * Cross-agent memory for the day list: for every patient on the schedule who
 * has an ACTIVE case in the shared brain (e.g. Nadine threaded their e-mail),
 * speak one hint — "Zu Herrn Diedershagen gibt es einen offenen Vorgang,
 * Thema Termin, letzter Kontakt gestern: <snippet>". Pure — feed it the
 * normalized appointments plus the Map from listActiveCasesByPatientIds.
 */
export function buildSpokenMemoryHints(appointments = [], casesByPatientId = new Map()) {
  const real = appointments.filter((a) => !a.isAbsence && a.patientId).sort((x, y) => x.startMs - y.startMs);
  const seen = new Set();
  const hints = [];
  for (const a of real) {
    if (seen.has(a.patientId)) continue;
    seen.add(a.patientId);
    const cases = casesByPatientId.get(a.patientId) || [];
    if (!cases.length) continue;
    const c = cases[0];
    const updates = Array.isArray(c.updates) ? c.updates : [];
    const last = [...updates].reverse().find((u) => u.kind === "contact") || updates[updates.length - 1];
    const lastMs = c.lastContactAt?.toMillis?.() ?? (typeof c.lastContactAt === "number" ? c.lastContactAt : 0);

    let line = `Zu ${spokenPatient(a)} gibt es einen offenen Vorgang, Thema ${TOPIC_LABELS[c.topic] || c.topic || "Allgemein"}`;
    const when = relativeAgo(lastMs || last?.ts);
    if (when) line += `, letzter Kontakt ${when}`;
    if (c.assignee) line += `, liegt bei ${c.assignee}`;
    // Spoken text: raw e-mail addresses read terribly — speak the name instead.
    const snippet = String(last?.text || "")
      .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, a.patientName || spokenPatient(a))
      .replace(/\s+/g, " ").trim();
    if (snippet) line += `: ${snippet.length > 160 ? `${snippet.slice(0, 157)}...` : snippet}`;
    hints.push(`${line}.`);
    if (hints.length >= MEMORY_HINT_MAX) break;
  }
  if (!hints.length) return "";
  return `Aus dem Praxisgedächtnis: ${hints.join(" ")}`;
}
