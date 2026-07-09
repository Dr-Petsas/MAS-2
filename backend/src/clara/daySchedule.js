import admin from "../firebase.js";
import { loadBooking, ensureBerlinTz } from "./booking.js";
import { TOPIC_LABELS } from "../brain/cases.js";
import { holidayName, isWeekend, daySpecialLabel } from "./holidays.js";
import { redDocsQuip } from "./humor.js";
import { pick, vary } from "./speech.js";

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

// Praxis-Kuerzel wie "KCH", "PRO", "IMP", "PA" vor dem Besuchsgrund nerven beim
// Vorlesen (Wunsch 27.06.). Entfernt einen vorangestellten Grossbuchstaben-Code
// (2-6 Buchstaben) samt Trenner (Leerzeichen/Bindestrich/Doppelpunkt), SOFERN
// danach eine echte Wort-Beschreibung folgt. Steht der Besuchsgrund nur aus dem
// Code ("PZR") oder beginnt er normal ("Kontrolle"), bleibt er unveraendert.
// Reiner Sprech-Filter fuer das normalisierte (gesprochene) Feld — die
// Kalenderdaten in Firestore und die Matching-Logik (Rohobjekt o.visitMotive)
// bleiben unberuehrt.
function stripMotiveCode(name) {
  const t = String(name || "").trim();
  const m = t.match(/^[A-ZÄÖÜ]{2,6}(?:\s*[-:.]\s*|\s+)([A-Za-zÄÖÜäöüß].*)$/);
  return m ? m[1].trim() : t;
}

function normalizeAppointment(id, o) {
  if (!o) return null;
  return {
    id,
    startMs: tsToMs(o.start),
    endMs: tsToMs(o.end),
    calendarId: o.calendar?.id || o.resourceId || "",
    calendarName: o.calendar?.name || "",
    visitMotive: stripMotiveCode(o.visitMotive?.name || ""),
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
    // PatientStatus-Enum der Plattform: 2 = "treated" (Behandlung erfolgt).
    patientStatus: typeof o.patientStatus === "number" ? o.patientStatus : null,
  };
}

// --- live docs light (SignR ground truth) -----------------------------------
// Das auf den Termin gestempelte ``patientDocsStatus`` ist NICHT verlaesslich:
// die Plattform-Funktion stempelt nur, wenn beim Patienten documentsExpireAt
// gesetzt ist — sonst bleibt das Feld leer oder veraltet (Sablon stand "gruen",
// obwohl 4 Pflichtdokumente unsigniert waren). Darum rechnen wir die Ampel
// live aus den SignR-Dokumenten, mit EXAKT der SignR-Logik
// (updatePatientDocumentsStatus): irgendein Dokument im Status "none"
// (ausgewaehlt, noch nicht verschickt) => rot; sonst "sent" (verschickt,
// nicht unterschrieben) => gelb; sonst gruen.

export function deriveDocsLight(docStatuses = []) {
  let hasNone = false, hasSent = false;
  for (const raw of docStatuses) {
    const st = String(raw || "").toLowerCase();
    if (st === "none") hasNone = true;
    else if (st === "sent") hasSent = true;
  }
  return hasNone ? "red" : hasSent ? "yellow" : "green";
}

async function liveDocsStatusByPatient(clientId, locationId, patientIds) {
  const db = admin.firestore();
  const out = new Map();
  await Promise.all([...new Set(patientIds)].map(async (pid) => {
    try {
      const snap = await db.collection("clients").doc(clientId)
        .collection("locations").doc(locationId)
        .collection("patients").doc(pid)
        .collection("pdocuments")
        .where("status", "in", ["none", "sent"])
        .get();
      out.set(pid, deriveDocsLight(snap.docs.map((d) => d.data().status)));
    } catch { /* Lookup-Fehler: gestempelter Terminwert bleibt als Fallback */ }
  }));
  return out;
}

// --- I/O: read one day's appointments --------------------------------------

/**
 * Read the booked appointments for one Berlin day from the platform calendar.
 * @param {string} clientId
 * @param {{date?:string, calendarId?:string}} [opts] date = "YYYY-MM-DD" (default: today Berlin)
 */
/**
 * Virtuelle Termine (Recall-/Nachfolger-Platzhalter mit Status
 * "needsConfirmation"/"declined") sind im Plattform-Kalender unsichtbar,
 * solange die Location showVirtualAppointments nicht aktiviert hat.
 * Diese EINE Funktion beantwortet fuer alle Clara-Lesepfade, ob die
 * Platzhalter sichtbar sein sollen — daySchedule, calendarWatch und
 * absencePlanner duerfen das nicht jeweils selbst erraten.
 */
export async function showVirtualAppointments(clientId, locationId) {
  try {
    const locSnap = await admin.firestore().collection("clients").doc(clientId)
      .collection("locations").doc(locationId).get();
    return locSnap.data()?.showVirtualAppointments === true;
  } catch {
    return false; // Standard wie im Kalender: ausblenden
  }
}

/** true, wenn der Status den Termin als virtuellen Platzhalter markiert. */
export function isVirtualStatus(status) {
  const st = String(status || "");
  return st === "needsConfirmation" || st === "declined";
}

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
  // VIRTUELLE Termine genauso ausblenden wie der Plattform-Kalender
  // (calendarCtrl.tsx): Recall-/Nachfolger-Platzhalter stehen mit Status
  // "needsConfirmation" in der Collection, sind fuer das Team aber unsichtbar,
  // solange die Location showVirtualAppointments nicht aktiviert hat.
  // Ohne diesen Filter liest Clara Termine vor, die niemand im Kalender sieht
  // (12.06.: virtueller 1-Jahres-Recall "Haftchenari" am Samstag, den der
  // Recall-Automat vor einem Jahr als Vorschlag angelegt hatte).
  const showVirtual = await showVirtualAppointments(clientId, locationId);
  if (!showVirtual) {
    appts = appts.filter((a) => a.isAbsence || !isVirtualStatus(a.status));
  }
  if (calendarId) appts = appts.filter((a) => a.calendarId === calendarId);

  // Unterschriften-Ampel: SignR ist die Wahrheit, nicht das gestempelte Feld.
  try {
    const live = await liveDocsStatusByPatient(clientId, locationId,
      appts.filter((a) => !a.isAbsence && a.patientId).map((a) => a.patientId));
    for (const a of appts) {
      if (a.patientId && live.has(a.patientId)) a.docsStatus = live.get(a.patientId);
    }
  } catch { /* best-effort — Terminliste darf daran nie scheitern */ }

  // Neupatienten-Status: EXAKT das, was den grünen Rahmen im Kalender setzt —
  // das auf den Termin gestempelte ``appointment.patient.newPatient``
  // (calendarCtrl.tsx: Klasse kt-new-patient bei appointment.patient.newPatient).
  // Es wird bereits in normalizeAppointment als a.newPatient uebernommen, daher
  // hier KEINE eigene Live-Regel mehr: eine frueher abweichende Heuristik
  // (importierte/Mehrfach-Patienten ausschliessen) liess Claras Zahl von den
  // gruenen Rahmen abweichen (Chef-Feedback 15.06.2026).

  return { ok: true, date: day, locationId, calendars: booking.calendars || [], appointments: appts };
}

// Obergrenze fuer einen Bereichs-Read (Firestore-Kosten + Sprech-Laenge). Ein
// Jahr passt; laengere Angaben werden ab `from` gekappt.
export const MAX_RANGE_DAYS = 366;

// Termine ueber einen DATUMSBEREICH [from..to] (beide inklusive, ISO-Tage).
// EINE Firestore-Query, danach EXAKT dieselben Filter wie getDayAppointments
// (temporaere Holds + Multi-Day raus, virtuelle Termine wie der Plattform-
// Kalender ausblenden, optional calendarId). Bewusst OHNE die pro-Patient
// Unterschriften-Ampel (liveDocsStatusByPatient) — ein Bereichs-Ueberblick
// zaehlt Auslastung, nicht die Doku-Ampel jedes Einzeltermins. Vertragstreu:
// getDayAppointments bleibt fuer Einzeltage unveraendert.
export async function getRangeAppointments(clientId, { from, to, calendarId } = {}) {
  const fromDay = (from || "").trim() || todayBerlin();
  let toDay = (to || "").trim() || fromDay;
  if (toDay < fromDay) { const t = toDay; toDay = fromDay; from = t; } // defensiv tauschen
  // Bereich kappen (from bleibt, Ende begrenzen).
  const cap = new Date(ensureBerlinTz(`${fromDay}T00:00:00`));
  cap.setUTCDate(cap.getUTCDate() + (MAX_RANGE_DAYS - 1));
  const capDay = cap.toISOString().slice(0, 10);
  const clamped = toDay > capDay;
  if (clamped) toDay = capDay;

  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return { ok: false, reason: "no_location", from: fromDay, to: toDay };

  const rangeStart = new Date(ensureBerlinTz(`${fromDay}T00:00:00`));
  const rangeEnd = new Date(ensureBerlinTz(`${toDay}T23:59:59`));
  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
    return { ok: false, reason: "bad_date", from: fromDay, to: toDay };
  }

  const snap = await admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments")
    .where("start", ">=", rangeStart)
    .where("start", "<=", rangeEnd)
    .orderBy("start")
    .get();

  let appts = snap.docs.map((d) => normalizeAppointment(d.id, d.data())).filter(Boolean);
  appts = appts.filter((a) => (a.patientId || a.isAbsence) && !a.isMultiDay);
  const showVirtual = await showVirtualAppointments(clientId, locationId);
  if (!showVirtual) {
    appts = appts.filter((a) => a.isAbsence || !isVirtualStatus(a.status));
  }
  if (calendarId) appts = appts.filter((a) => a.calendarId === calendarId);

  return {
    ok: true, from: fromDay, to: toDay, clamped, locationId,
    calendars: booking.calendars || [], appointments: appts,
  };
}

// --- pure: build the structured briefing ------------------------------------

// Absenzen (Urlaub/OP-Block/Mittag) als "besetzt"-Intervalle eines Kalenders.
// Kalenderlose Absenzen (z.B. praxisweiter Feiertag) gelten fuer jeden Kalender.
function absenceIntervalsFor(calId, absences) {
  return absences
    .filter((a) => !a.calendarId || a.calendarId === calId)
    .map((a) => ({ startMs: a.startMs, endMs: a.endMs || a.startMs }))
    .filter((x) => x.endMs > x.startMs)
    .sort((x, y) => x.startMs - y.startMs);
}

// Freie Teil-Intervalle in [start,end] nach Abzug der besetzten Intervalle.
// So zaehlt eine Abwesenheit MITTEN in einer Terminluecke nicht mehr als frei
// (Bug 26.06.2026: Clara meldete Absenzen als freie Termine).
function freeSubGaps(start, end, busy) {
  const out = [];
  let cur = start;
  for (const b of busy) {
    if (b.endMs <= cur || b.startMs >= end) continue;
    const bs = Math.max(b.startMs, start);
    if (bs > cur) out.push({ startMs: cur, endMs: bs });
    cur = Math.max(cur, Math.min(b.endMs, end));
    if (cur >= end) break;
  }
  if (cur < end) out.push({ startMs: cur, endMs: end });
  return out;
}

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
    const absInts = absenceIntervalsFor(calId, absences);
    const gaps = [];
    for (let i = 0; i < list.length - 1; i++) {
      const endMs = list[i].endMs || list[i].startMs;
      const nextStart = list[i + 1].startMs;
      if (nextStart - endMs < GAP_MIN_MINUTES * 60000) continue;
      // Absenzen aus der Luecke schneiden -> nur echte freie Reste zaehlen.
      for (const piece of freeSubGaps(endMs, nextStart, absInts)) {
        const minutes = Math.round((piece.endMs - piece.startMs) / 60000);
        if (minutes >= GAP_MIN_MINUTES) gaps.push({ startMs: piece.startMs, endMs: piece.endMs, minutes });
      }
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

// "von 10 Uhr bis 11 Uhr 30 und von 14 Uhr bis 15 Uhr" — natürlich gesprochen.
function spokenGaps(gaps) {
  const g = gaps.slice(0, 3).map((x) => `von ${spokenTime(x.startMs)} bis ${spokenTime(x.endMs)}`);
  if (g.length === 1) return g[0];
  return `${g.slice(0, -1).join(", ")} und ${g[g.length - 1]}`;
}

// Gesprochenes Tagesbriefing in ECHTEN Sätzen. Vorher klang das nach
// Stichpunkten ("Tagesplan: 1 Termin." / "Petsas: 1 Termin von 09:00 bis
// 09:30. Hinweise: 1 Neupatient.") — fürs Vorlesen unbrauchbar. Den Anrufer
// mit eigenem Namen + vollem Datum anzusprechen ("Dr. Michael Petsas,
// Donnerstag, 11. Juni ...") nervt: er weiß, wer er ist und welcher Tag ist.
// Daher "Sie haben heute ..." sobald der eigene Kalender gelesen wird.
export function buildSpokenDayBriefing(briefing, { date, operatorDoctorName = "", overview = false } = {}) {
  const day = date || todayBerlin();
  const rel = relativeDayLabel(day);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // now-Bewusstsein (Vorfall 04.07.2026): abends darf das Tagesbriefing nicht
  // mehr "Heute haben Sie 5 Termine ... frei ist noch von 9:30" sagen, wenn
  // laengst alles vorbei ist. Ist der eigene Kalender-Tag durch, sprechen wir
  // im Rueckblick und lassen vergangene Freislots/Vorbereitungs-Hinweise weg.
  const nowMs = Date.now();
  const isToday = day === todayBerlin();
  const dayOver = Boolean(isToday && briefing?.lastMs && nowMs > briefing.lastMs);
  const futureGaps = (gaps) => (isToday ? (gaps || []).filter((x) => (x.endMs || x.startMs || 0) > nowMs) : (gaps || []));
  if (!briefing || briefing.total === 0) {
    const blocks = briefing?.absences?.length
      ? ` Es ${briefing.absences.length === 1 ? "ist nur eine Sperrzeit" : `sind nur ${briefing.absences.length} Sperrzeiten`} eingetragen.`
      : "";
    return cap(`${rel} sind keine Termine gebucht.${blocks}${closedDayReason(day)}`).trim();
  }

  const parts = [];
  const cals = briefing.byCalendar || [];

  if (cals.length === 1) {
    // Ein Kalender: Eröffnung und Detail in EINEM Satz statt zwei fast
    // identischen Zeilen hintereinander.
    const c = cals[0];
    const span = c.count === 1
      ? `nur einen Termin, von ${spokenTime(c.firstMs)} bis ${spokenTime(c.lastMs)}`
      : `${c.count} Termine, zwischen ${spokenTime(c.firstMs)} und ${spokenTime(c.lastMs)}`;
    // Zeitangabe IMMER nach vorn: "Heute haben Sie ...", "Nächste Woche
    // Donnerstag haben Sie ...", "Am 15. Juni haben Sie ..." — abends im
    // Rueckblick ("Heute hatten Sie ...").
    parts.push(isOwnCalendar(c.calendarName, operatorDoctorName)
      ? cap(`${rel} ${dayOver ? "hatten" : "haben"} Sie ${span}.`)
      : cap(`${rel} ${dayOver ? "hatte" : "hat"} ${c.calendarName || "die Praxis"} ${span}.`));
    const g1 = dayOver ? [] : futureGaps(c.gaps);
    if (g1.length) parts.push(`Frei ist dazwischen noch ${spokenGaps(g1)}.`);
  } else if (overview) {
    // Zoom-out (Lagebild): bei vielen Kalendern NICHT jede Spalte einzeln
    // vorlesen, sondern Gesamtzahl + Tagesspanne — "34 Termine, von 8 bis 17
    // Uhr". Die Aufschluesselung pro Kalender kommt auf Nachfrage.
    const span = (briefing.firstMs && briefing.lastMs)
      ? `, zwischen ${spokenTime(briefing.firstMs)} und ${spokenTime(briefing.lastMs)}`
      : "";
    parts.push(cap(`${rel} ${dayOver ? "standen" : "stehen"} insgesamt ${briefing.total} Termine im Kalender${span}.`));
  } else {
    parts.push(cap(`${rel} ${dayOver ? "standen" : "stehen"} insgesamt ${briefing.total} Termine im Kalender.`));
    for (const c of cals) {
      const own = isOwnCalendar(c.calendarName, operatorDoctorName);
      const who = own ? (dayOver ? "Sie hatten" : "Sie haben") : `${c.calendarName || "Der Kalender"} ${dayOver ? "hatte" : "hat"}`;
      let line = c.count === 1
        ? `${who} einen Termin von ${spokenTime(c.firstMs)} bis ${spokenTime(c.lastMs)}.`
        : `${who} ${c.count} Termine zwischen ${spokenTime(c.firstMs)} und ${spokenTime(c.lastMs)}.`;
      const gc = dayOver ? [] : futureGaps(c.gaps);
      if (gc.length) line += ` Frei ist dort noch ${spokenGaps(gc)}.`;
      parts.push(line);
    }
  }

  // Tag ist durch: kurzer Rueckblick, KEINE vorausschauenden Hinweise mehr
  // (Freislots, Vorzubereiten, Unbestaetigtes ergeben abends keinen Sinn).
  if (dayOver) {
    const recap = pick([
      "Das war Ihr Tag.",
      "Der Tag ist damit durch.",
      "Für heute war das alles.",
    ], day);
    return `${parts.join(" ")} ${recap}`.trim();
  }

  const hl = [];
  if (briefing.newPatients) hl.push(briefing.newPatients === 1 ? "ein Neupatient" : `${briefing.newPatients} Neupatienten`);
  if (briefing.videoCalls) hl.push(briefing.videoCalls === 1 ? "ein Video-Termin" : `${briefing.videoCalls} Video-Termine`);
  if (hl.length) {
    const singular = hl.length === 1 && hl[0].startsWith("ein ");
    parts.push(`Darunter ${singular ? "ist" : "sind"} ${hl.join(" und ")}.`);
  }
  if (briefing.unconfirmed) {
    parts.push(briefing.unconfirmed === 1
      ? "Ein Termin ist noch unbestätigt."
      : `${briefing.unconfirmed} Termine sind noch unbestätigt.`);
  }
  if (briefing.absences.length) {
    parts.push(briefing.absences.length === 1
      ? "Außerdem ist eine Sperrzeit eingetragen."
      : `Außerdem sind ${briefing.absences.length} Sperrzeiten eingetragen.`);
  }

  // Terminnotizen + Dokumentenstatus — die Behandler-Pflichtinfos. Mehr als
  // ein paar gesprochene Hinweise verträgt ein Briefing nicht; der Rest steht
  // im Kalender und kommt über die Terminliste.
  const SPOKEN_ATTENTION_MAX = 6;
  const att = briefing.attention || [];
  if (att.length && overview) {
    // Zoom-out: NICHT jeden Termin einzeln vorlesen (das nervt und liess den
    // Loop-Guard faelschlich anschlagen — "ich drehe mich im Kreis"). Stattdessen
    // zaehlen + Detail auf Zuruf.
    const prep = briefing.docsRed + briefing.docsYellow;
    const notes = att.length - prep > 0 ? att.length - prep : 0;
    const bits = [];
    if (prep) bits.push(`bei ${prep} ${prep === 1 ? "Termin fehlen noch Unterlagen" : "Terminen fehlen noch Unterlagen"}${briefing.docsRed ? ` (${briefing.docsRed} davon noch nicht verschickt)` : ""}`);
    if (notes) bits.push(`${notes} ${notes === 1 ? "Termin hat eine Notiz" : "Termine haben Notizen"}`);
    if (bits.length) parts.push(`Vorzubereiten: ${bits.join(", ")}. Sag Bescheid, dann gehe ich die Termine einzeln durch.`);
    if (att.some((a) => a.docsStatus === "red")) parts.push(redDocsQuip());
  } else if (att.length) {
    const lines = att.slice(0, SPOKEN_ATTENTION_MAX).map((a) => {
      const bits = [];
      if (a.docsStatus === "yellow") bits.push("die Unterlagen sind noch nicht unterschrieben");
      else if (a.docsStatus === "red") bits.push("die Unterlagen wurden noch nicht verschickt");
      if (a.comments) bits.push(`dazu steht in der Notiz: ${a.comments.length > 100 ? `${a.comments.slice(0, 97)}...` : a.comments}`);
      return `Um ${spokenTime(a.startMs)} haben Sie ${spokenPatient(a)} — ${bits.join(", und ")}.`;
    });
    const rest = att.length - SPOKEN_ATTENTION_MAX;
    const more = rest > 0 ? ` ${rest === 1 ? "Ein weiterer Hinweis steht" : `${rest} weitere Hinweise stehen`} im Kalender.` : "";
    parts.push(`Bitte beachten: ${lines.join(" ")}${more}`);
    // Rote Ampel = Unterlagen NIE verschickt — das darf nicht passieren.
    // Clara darf sich darüber hörbar aufregen (EIN Spruch pro Vorlesung).
    if (att.some((a) => a.docsStatus === "red")) parts.push(redDocsQuip());
  }

  return parts.join(" ");
}

// "Keine Termine" hat an Wochenenden einen GRUND — den sagen wir dazu, damit
// Clara (und der Zuhörer) den leeren Tag richtig einordnet, statt ihn wie
// einen toten Arbeitstag klingen zu lassen. Feiertage stehen bereits MIT
// Namen im Datumslabel (relativeDayLabel) — nicht doppelt aussprechen.
function closedDayReason(dateStr) {
  if (holidayName(dateStr)) return "";
  if (isWeekend(dateStr)) return " Da ist Wochenende.";
  return "";
}

// Voice is linear: more than this and the listener has lost the thread anyway.
const SPOKEN_LIST_MAX = 25;

// "morgen"/"heute" beats "am Mittwoch, den 10. Juni" — a receptionist says it
// that way too. Within the current week: "am Donnerstag", in the following
// week: "nächste Woche Donnerstag". Only beyond that (or for past dates) we
// fall back to the full weekday + date. Exported: every spoken surface
// (briefings, absence planner, …) should phrase days exactly like this.
export function relativeDayLabel(dateStr) {
  const today = todayBerlin();
  const diff = Math.round((Date.parse(`${dateStr}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  // Wochenend-/Feiertags-Grounding: bei "heute"/"morgen"/"übermorgen" auf
  // Samstag/Sonntag oder einem Feiertag IMMER dazusagen, was für ein Tag das
  // ist ("morgen, Samstag, ..." / "morgen, Fronleichnam, ein Feiertag, ...").
  // Sonst behandelt Clara ein Wochenende wie einen Arbeitstag (Testlauf
  // 12.06.: "morgen" war Samstag und niemand hat es gemerkt).
  const specialSuffix = (s) => {
    const special = daySpecialLabel(dateStr);
    return special ? `${s}, ${special},` : s;
  };
  if (diff === 0) return specialSuffix("heute");
  if (diff === 1) return specialSuffix("morgen");
  if (diff === 2) return specialSuffix("übermorgen");
  if (diff === -1) return "gestern";
  if (diff === -2) return "vorgestern";
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (isNaN(d.getTime())) return `am ${dateStr}`;
  const wd = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(d);
  // Bei fernen Tagen steht der Wochentag ohnehin im Label — nur ein Feiertag
  // muss zusätzlich erwähnt werden ("am Donnerstag, Fronleichnam, ...").
  const holiday = holidayName(dateStr);
  const withHoliday = (s) => (holiday ? `${s}, ${holiday},` : s);
  if (diff > 2) {
    // Mo=1..So=7; noon UTC keeps the calendar day identical in Berlin.
    const isoDow = (s) => { const n = new Date(`${s}T12:00:00Z`).getUTCDay(); return n === 0 ? 7 : n; };
    const weekDiff = Math.floor((diff + isoDow(today) - 1) / 7);
    if (weekDiff === 0) return withHoliday(`am ${wd}`);
    if (weekDiff === 1) return withHoliday(`nächste Woche ${wd}`);
  }
  const dm = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric", month: "long" }).format(d);
  return withHoliday(`am ${wd}, den ${dm}`);
}

// Gehört der Kalender dem fragenden Operator? Vergleicht tolerant:
// "Dr. Michael Petsas" (Operator) muss "Dr. Petsas" (Kalender) matchen,
// daher zählt am Ende der Nachname (letztes Token). Exportiert, damit jede
// gesprochene Oberfläche (Abwesenheiten, Briefings, …) dieselbe
// "Sie/du statt Dr. X"-Logik nutzt.
export function isOwnCalendar(calName, operatorDoctorName) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const c = norm(calName);
  const o = norm(operatorDoctorName);
  if (!c || !o) return false;
  if (c === o || c.includes(o) || o.includes(c)) return true;
  const last = (s) => s.split(/\s+/).pop();
  const cl = last(c);
  const ol = last(o);
  return cl.length > 2 && cl === ol;
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
export function buildSpokenDayList(appointments = [], { date, calendars = [], operatorDoctorName = "", remaining = false } = {}) {
  const day = date || todayBerlin();
  const rel = relativeDayLabel(day);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const real = appointments.filter((a) => !a.isAbsence).sort((x, y) => x.startMs - y.startMs);

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

  // "Wie viele Termine habe ich NOCH?" — nur die noch kommenden, als EIN Satz
  // mit Anzahl voran. Der Aufrufer hat die Liste bereits auf die Zukunft
  // gefiltert (Chef-Feedback 15.06.2026: vergangene Termine NICHT mitzaehlen).
  if (remaining) {
    if (!real.length) return cap(`${rel} haben Sie keine weiteren Termine mehr.`);
    const shown = real.slice(0, SPOKEN_LIST_MAX);
    const head = `${cap(rel)} haben Sie noch ${real.length === 1 ? "einen Termin" : `${real.length} Termine`}`;
    let msg = `${head}: ${joinSpoken(shown.map(entry))}.`;
    if (real.length > SPOKEN_LIST_MAX) msg += ` Das sind die nächsten ${SPOKEN_LIST_MAX}, der Rest steht im Kalender.`;
    if (shown.some((a) => a.docsStatus === "red")) msg += ` ${redDocsQuip()}`;
    return msg;
  }

  if (!real.length) return cap(`${rel} sind keine Termine gebucht.${closedDayReason(day)}`);

  const nameById = new Map((calendars || []).map((c) => [c.id, c.name]));
  const groups = new Map();
  for (const a of real) {
    const key = a.calendarId || "_";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  const isOwn = (calName) => isOwnCalendar(calName, operatorDoctorName);

  const truncated = real.length > SPOKEN_LIST_MAX;
  let budget = SPOKEN_LIST_MAX;
  const parts = [];
  let first = true;
  for (const [calId, list] of groups) {
    if (budget <= 0) break;
    const who = list[0].calendarName || nameById.get(calId) || "das Team";
    const entries = list.slice(0, budget).map(entry);
    budget -= entries.length;
    // Zeitangabe nach vorn ("Heute haben Sie um 9 Uhr Frau Sablon ...");
    // "haben"/"hat" governs the accusative, which spokenPatient produces.
    const lead = isOwn(who)
      ? (first ? cap(`${rel} haben Sie`) : "Außerdem haben Sie")
      : (first ? cap(`${rel} hat ${who}`) : `${who} hat`);
    parts.push(`${lead} ${joinSpoken(entries)}.`);
    first = false;
  }
  if (groups.size > 1) parts.unshift(`Das sind ${real.length} Termine insgesamt.`);
  if (truncated) parts.push(`Das waren die ersten ${SPOKEN_LIST_MAX} — der Rest steht im Kalender.`);
  // Mindestens ein roter Termin in der vorgelesenen Liste? Ein Aufreger-Satz
  // ans Ende (nicht pro Termin — sonst kippt der Witz ins Genervte).
  if (real.slice(0, SPOKEN_LIST_MAX).some((a) => a.docsStatus === "red")) parts.push(redDocsQuip());
  return parts.join(" ");
}

// --- Patienten-spezifische Termine (16.06.2026) -----------------------------
// "Wann hat Frau Thrandorf ihren naechsten Termin / hat sie ueberhaupt einen?"
// Clara konnte das bisher nicht beantworten: das eingebaute findAppointment
// verlangt ein GEBURTSDATUM (am Telefon nennt das niemand), also rief Clara es
// nie auf und riet stattdessen aus dem offenen Vorgang/Gedaechtnis (Vorfall
// 16.06.: erst "16. Juni 14:30", dann "23. Juni 12:00" — beides erfunden).
// Diese Funktion liest die ECHTEN Kalendertermine eines Patienten direkt aus
// der Plattform-Collection (per patientId, Fallback ueber den Namen) und
// blendet virtuelle Platzhalter genauso aus wie der Kalender (Eiserne Regel 4).

function dayOfMs(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/**
 * Alle (vergangenen + kommenden) ECHTEN Termine eines Patienten, chronologisch.
 * @param {string} clientId
 * @param {{patientId?:string, firstName?:string, lastName?:string}} who
 */
export async function getPatientAppointments(clientId, { patientId, firstName, lastName } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return { ok: false, reason: "no_location" };

  const col = admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments");

  const pid = String(patientId || "").trim();
  const ln = String(lastName || "").trim();
  const fn = String(firstName || "").trim();

  let docs = [];
  // Primaer ueber die patientId (eindeutig, ein einzelner Gleichheits-Filter
  // braucht KEINEN zusammengesetzten Index). Fallback ueber den Nachnamen,
  // falls der Termin keine patientId traegt oder die ID nicht matcht.
  if (pid) {
    try { docs = (await col.where("patient.id", "==", pid).get()).docs; } catch { docs = []; }
  }
  if (!docs.length && ln) {
    try {
      const snap = await col.where("patient.lastName", "==", ln).get();
      docs = snap.docs.filter((d) => {
        const f = String(d.data()?.patient?.firstName || "").trim().toLowerCase();
        return !fn || f === fn.toLowerCase();
      });
    } catch { /* ignore */ }
  }

  let appts = docs.map((d) => normalizeAppointment(d.id, d.data())).filter(Boolean);
  // Echte Termine: Patient gesetzt, keine Sperrzeiten/Mehrtages-Items.
  appts = appts.filter((a) => a.patientId && !a.isAbsence && !a.isMultiDay);
  const showVirtual = await showVirtualAppointments(clientId, locationId);
  if (!showVirtual) appts = appts.filter((a) => !isVirtualStatus(a.status));
  appts.sort((a, b) => a.startMs - b.startMs);

  const now = Date.now();
  const upcoming = appts.filter((a) => a.startMs >= now);
  const past = appts.filter((a) => a.startMs < now);
  return {
    ok: true,
    next: upcoming[0] || null,
    upcoming,
    past,
    last: past.length ? past[past.length - 1] : null,
    count: appts.length,
  };
}

const TREATED_STATUS = 2; // PatientStatus.treated

/**
 * Gesprochene Behandlungs-Historie: "Was wurde bei Herrn Meier zuletzt
 * gemacht?". Nennt die letzten (bis zu drei) vergangenen Termine mit Datum,
 * Behandlungsart und ggf. Notiz. Bevorzugt tatsaechlich erfolgte ("treated")
 * Termine, faellt aber auf alle vergangenen zurueck, weil nicht jede Praxis
 * den Behandlungs-Status pflegt. Pure: speist sich aus getPatientAppointments.
 */
export function buildSpokenTreatmentHistory(result, { who = "der Patient" } = {}) {
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  if (!result?.ok) {
    return vary("historie.fehler", [
      `Die Behandlungen von ${who} kann ich gerade nicht abrufen.`,
      `Ich komme im Moment nicht an die Behandlungs-Historie von ${who} heran.`,
      `Die Kartei von ${who} lädt gerade nicht — bitte gleich noch einmal fragen.`,
      `Da klemmt der Zugriff auf die Historie von ${who}. Ich probiere es gleich wieder.`,
      `Technische Pause: Die Behandlungen von ${who} kann ich gerade nicht nachschlagen.`,
    ]);
  }
  const past = Array.isArray(result.past) ? result.past : [];
  if (!past.length) {
    return vary("historie.leer", [
      `Zu ${who} finde ich keine vergangenen Termine.`,
      `Bei ${who} steht noch nichts in der Termin-Historie — vermutlich der erste Besuch.`,
      `Die Historie von ${who} ist leer, da war noch kein Termin.`,
      `Für ${who} gibt es im Kalender keine früheren Termine.`,
      `Da ist noch nichts gewesen: ${who} hatte bei uns bisher keinen Termin.`,
      `Unbeschriebenes Blatt — von ${who} finde ich keine vergangenen Termine.`,
    ]);
  }
  // Bevorzugt erledigte Behandlungen; sonst alle vergangenen Termine.
  const treated = past.filter((a) => a.patientStatus === TREATED_STATUS);
  const pool = treated.length ? treated : past;
  // Neueste zuerst, maximal drei (Sprache ist linear).
  const recent = pool.slice(-3).reverse();
  const thisYear = todayBerlin().slice(0, 4);
  const entry = (a) => {
    const day = dayOfMs(a.startMs);
    const year = day.slice(0, 4);
    let rel = relativeDayLabel(day);
    // Jahr nur nennen, wenn die Behandlung NICHT im laufenden Jahr war - sonst
    // bliebe bei alten Behandlungen unklar, welches Jahr gemeint ist.
    if (year !== thisYear && !/^(gestern|vorgestern)$/.test(rel)) rel = `${rel} ${year}`;
    const motive = spokenMotive(a.visitMotive) || (a.visitMotive ? `für ${a.visitMotive}` : "");
    const note = a.comments ? `, Notiz: ${a.comments.length > 120 ? `${a.comments.slice(0, 117)}...` : a.comments}` : "";
    return `${rel}${motive ? ` ${motive}` : ""}${note}`;
  };
  if (recent.length === 1) {
    const eins = entry(recent[0]);
    return vary("historie.einer", [
      `Bei ${who} war zuletzt ein Termin ${eins}.`,
      `Der letzte Besuch von ${who} war ${eins}.`,
      `${cap(who)} war zuletzt ${eins} da.`,
      `In der Kartei steht bei ${who} zuletzt: ein Termin ${eins}.`,
      `Zuletzt hatten wir ${who} ${eins} hier.`,
      `Ein Eintrag in der Historie: ${who} war ${eins} da.`,
      `Der bisher einzige Besuch von ${who} war ${eins}.`,
      `${cap(who)} steht mit einem Termin ${eins} in der Historie.`,
    ]);
  }
  const lead = vary("historie.mehrere", [
    `Bei ${cap(who)} waren die letzten Termine`,
    `So sah es zuletzt bei ${who} aus`,
    `Die letzten Besuche von ${who}`,
    `Aus der Kartei von ${who}, die jüngsten Termine`,
    `Kurzer Blick zurück bei ${who}`,
    `Die Historie von ${who} zeigt zuletzt`,
    `Zuletzt war bei ${who} Folgendes`,
    `Das waren die letzten Termine von ${who}`,
    `Rückblick für ${who}`,
    `In der Behandlungs-Historie von ${who} steht zuletzt`,
  ]);
  const head = `${lead}: ${entry(recent[0])}`;
  const rest = recent.slice(1).map((a) => `davor ${entry(a)}`);
  return `${head}; ${rest.join("; ")}.`;
}

/**
 * Gesprochene Antwort auf "Wann ist der naechste Termin von Patient X?".
 * Nennt den naechsten echten Termin (Datum, Uhrzeit, Behandlungsart, Arzt) und
 * — falls vorhanden — kurz den letzten Besuch. Pure: speist sich aus dem
 * Ergebnis von getPatientAppointments.
 */
export function buildSpokenPatientAppointments(result, { who = "der Patient" } = {}) {
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  if (!result?.ok) {
    return vary("pattermine.fehler", [
      `Die Termine von ${who} kann ich gerade nicht abrufen.`,
      `Ich komme gerade nicht an die Termine von ${who} heran — gleich noch einmal fragen, bitte.`,
      `Der Kalender gibt mir die Termine von ${who} im Moment nicht her.`,
      `Kurzes Störgeräusch beim Kalenderzugriff — die Termine von ${who} kann ich gerade nicht lesen.`,
      `Da klemmt es gerade: Die Termine von ${who} lassen sich nicht abrufen.`,
    ]);
  }
  const { next, last } = result;
  const parts = [];
  if (next) {
    const rel = relativeDayLabel(dayOfMs(next.startMs));
    const zeit = spokenTime(next.startMs);
    const motive = spokenMotive(next.visitMotive);
    const motiv = motive ? ` ${motive}` : "";
    const at = next.calendarName ? ` bei ${next.calendarName}` : "";
    parts.push(vary("pattermine.naechster", [
      `${cap(who)} hat als Nächstes einen Termin ${rel} um ${zeit}${motiv}${at}.`,
      `Der nächste Termin von ${who} ist ${rel} um ${zeit}${motiv}${at}.`,
      `${cap(who)} kommt ${rel} um ${zeit}${motiv}${at}.`,
      `${cap(who)} steht ${rel} um ${zeit} im Kalender${motiv}${at}.`,
      `Im Kalender steht für ${who} als Nächstes: ${rel} um ${zeit}${motiv}${at}.`,
      `${cap(who)} ist ${rel} um ${zeit} wieder da${motiv}${at}.`,
      `Als Nächstes sehen wir ${who} ${rel} um ${zeit}${motiv}${at}.`,
      `Notiert ist für ${who} ein Termin ${rel} um ${zeit}${motiv}${at}.`,
      `${cap(who)} hat den nächsten Besuch ${rel} um ${zeit}${motiv}${at}.`,
      `Der Kalender sagt: ${who} kommt ${rel} um ${zeit}${motiv}${at}.`,
    ]));
  } else {
    parts.push(vary("pattermine.keiner", [
      `${cap(who)} hat aktuell keinen kommenden Termin im Kalender.`,
      `Für ${who} steht derzeit nichts im Kalender — kein kommender Termin.`,
      `Da ist nichts geplant: ${who} hat momentan keinen nächsten Termin.`,
      `${cap(who)} steht aktuell mit keinem Termin im Kalender.`,
      `Kein Eintrag: Für ${who} ist gerade kein Termin gebucht.`,
      `${cap(who)} hat im Moment keinen Termin vor sich — falls gewünscht, kann ich einen Vorschlag machen.`,
      `Momentan Fehlanzeige — ${who} hat keinen anstehenden Termin.`,
      `Der Kalender ist an der Stelle leer: kein kommender Termin für ${who}.`,
      `${cap(who)} ist derzeit ohne Folgetermin.`,
      `Nichts Zukünftiges im Kalender für ${who}.`,
    ]));
  }
  if (last) {
    const relL = relativeDayLabel(dayOfMs(last.startMs));
    const motiveL = spokenMotive(last.visitMotive);
    const motivL = motiveL ? ` ${motiveL}` : "";
    parts.push(vary("pattermine.letzter", [
      `Der letzte Termin war ${relL}${motivL}.`,
      `Zuletzt war ${who} ${relL}${motivL} da.`,
      `Der letzte Besuch war ${relL}${motivL}.`,
      `Davor: ein Termin ${relL}${motivL}.`,
      `Zuletzt stand ${relL} ein Termin${motivL} an.`,
      `Das letzte Mal war ${relL}${motivL}.`,
      `In der Historie steht zuletzt ${relL} ein Termin${motivL}.`,
      `Der jüngste Eintrag: ${relL}${motivL}.`,
    ]));
  }
  return parts.join(" ");
}

// "Der nächste freie Termin ... ist am <Tag> um <Uhrzeit> Uhr." Pure.
export function buildSpokenNextFreeSlot(slotIso, { calendarName = "", visitMotiveName = "" } = {}) {
  const m = String(slotIso || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) {
    const wo = calendarName ? `bei ${calendarName}` : "in den nächsten Tagen";
    return vary("slot.keiner", [
      `${wo.charAt(0).toUpperCase()}${wo.slice(1)} finde ich aktuell keinen freien Termin.`,
      `Da ist ${wo} gerade alles belegt — ich finde keinen freien Termin.`,
      `Leider Fehlanzeige: ${wo} ist aktuell nichts frei.`,
      `Der Kalender ist ${wo} gut gefüllt, ich sehe keinen freien Termin.`,
      `Ich habe geschaut — ${wo} ist momentan kein Termin frei.`,
      `Volles Haus: ${wo} finde ich derzeit keine Lücke.`,
    ]);
  }
  const rel = relativeDayLabel(m[1]);
  const hh = Number(m[2]);
  const mm = Number(m[3]);
  const time = mm === 0 ? `${hh} Uhr` : `${hh} Uhr ${mm}`;
  const at = calendarName ? ` bei ${calendarName}` : "";
  const fuer = visitMotiveName ? ` für ${visitMotiveName}` : "";
  return vary("slot.gefunden", [
    `Der nächste freie Termin${at}${fuer} ist ${rel} um ${time}.`,
    `Frei wäre als Nächstes${fuer}: ${rel} um ${time}${at}.`,
    `Die nächste Lücke${at}${fuer} ist ${rel} um ${time}.`,
    `Ich hätte ${rel} um ${time}${at} etwas frei${fuer}.`,
    `${rel.charAt(0).toUpperCase()}${rel.slice(1)} um ${time}${at} wäre der nächste freie Termin${fuer}.`,
    `Als frühesten Termin${fuer} kann ich ${rel} um ${time}${at} anbieten.`,
    `Es passt am ehesten ${rel} um ${time}${at}${fuer ? `, und zwar${fuer}` : ""}.`,
    `Der Kalender bietet${fuer} als Nächstes ${rel} um ${time}${at} an.`,
    `Erster freier Platz${at}${fuer}: ${rel} um ${time}.`,
    `Machbar wäre ${rel} um ${time}${at}${fuer}.`,
  ]);
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
    let cases = casesByPatientId.get(a.patientId) || [];
    if (!cases.length) continue;
    // Dedup (09.07.2026, Live-Test): Die Termin-Zeile meldet die Dokumenten-
    // Ampel bereits ("Unterlagen noch nicht unterschrieben/verschickt"). Ein
    // zusaetzlicher offener Vorgang mit Thema "document" ist dann dieselbe
    // Sache doppelt (Chef: "doppelt gemoppelt und nervig") -> weglassen.
    // Andere Themen (Beschwerde, Rueckruf, Rechnung ...) bleiben erhalten.
    if (a.docsStatus === "yellow" || a.docsStatus === "red") {
      cases = cases.filter((c) => c.topic !== "document");
    }
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

/**
 * Vorbereitungs-Hinweise pro Tagespatient (09.07.2026, Chef-Wunsch): auffaellige
 * Anamnese-Befunde (Allergien/Medikamente/Vorerkrankungen) und die letzte
 * Behandlung. Pure — gefuettert mit den normalisierten Terminen plus einer
 * Map(patientId -> { findings:[{category,text}], lastAppt }). Patienten ohne
 * Befund UND ohne Vorbehandlung werden uebersprungen (kein Geschwaetz).
 */
export function buildSpokenPatientPrep(appointments = [], prepByPatientId = new Map()) {
  const real = appointments.filter((a) => !a.isAbsence && a.patientId).sort((x, y) => x.startMs - y.startMs);
  const thisYear = todayBerlin().slice(0, 4);
  const seen = new Set();
  const bits = [];
  for (const a of real) {
    if (seen.has(a.patientId)) continue;
    seen.add(a.patientId);
    const p = prepByPatientId.get(a.patientId);
    if (!p) continue;

    // Anamnese-Befunde je Kategorie buendeln (Fakten aus getPatientAnamnese).
    const byCat = new Map();
    for (const f of (p.findings || [])) {
      if (!byCat.has(f.category)) byCat.set(f.category, []);
      const t = f.text && f.text !== "ja" ? f.text : "";
      if (t) byCat.get(f.category).push(t);
    }
    const flagParts = [];
    for (const [cat, texts] of byCat) {
      flagParts.push(texts.length ? `${cat}: ${[...new Set(texts)].join(", ")}` : cat);
    }

    // Letzte Behandlung (Vorbehandlung): Datum + Behandlungsart.
    let lastSeg = "";
    const la = p.lastAppt;
    if (la && la.startMs) {
      const day = dayOfMs(la.startMs);
      let rel = relativeDayLabel(day);
      const year = day.slice(0, 4);
      if (year !== thisYear && !/^(gestern|vorgestern)$/.test(rel)) rel = `${rel} ${year}`;
      const motive = spokenMotive(la.visitMotive) || (la.visitMotive ? `für ${la.visitMotive}` : "");
      lastSeg = `zuletzt${motive ? ` ${motive}` : ""}${rel ? ` ${rel}` : ""}`.trim();
    }

    const segs = [];
    if (flagParts.length) segs.push(flagParts.join("; "));
    if (lastSeg) segs.push(lastSeg);
    if (!segs.length) continue;
    bits.push(`Bei ${spokenPatient(a)} ${segs.join(", ")}`);
    if (bits.length >= MEMORY_HINT_MAX) break;
  }
  if (!bits.length) return "";
  return `Zur Vorbereitung: ${bits.join(". ")}.`;
}
