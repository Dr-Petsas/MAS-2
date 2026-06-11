import { createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { loadBooking, ensureBerlinTz } from "./booking.js";
import { todayBerlin, relativeDayLabel } from "./daySchedule.js";
import { lisaSendSms, lisaStartCall, smsConfigured, callConfigured } from "../lisa/outbound.js";
import { sendMail } from "../mail/mailbox.js";
import { listAccounts } from "../mail/accounts.js";
import { proxyUpdateOrCancel } from "./cfProxy.js";
import { createCase, addUpdate, setStatus, listCases } from "../brain/caseStore.js";
import { CASE_STATUS } from "../brain/cases.js";
import { appendEvent } from "../brain/eventStore.js";
import { CHANNELS, DIRECTIONS, EVENT_TYPES } from "../brain/events.js";
import { log } from "../log.js";

// ============================================================================
// Abwesenheits-Planer — "nächsten Freitag bin ich nicht da."
//
// Der geschlossene Kreislauf (Muster: Recall-Coach, approval-first):
//
//   PLAN       planAbsence: liest die Termine des Tages für den Behandler,
//              bestimmt PRO PATIENT genau EINEN Absage-Kanal (SMS | E-Mail |
//              Anruf — Lisa und Nadine "stimmen sich ab", niemand bekommt
//              doppelt Post) und legt einen Absage-Auftrag als Case an
//              (waiting_approval). Es passiert noch NICHTS.
//   FREIGABE   approveAbsence ("Abwesenheit freigeben"):
//                1. trägt die Abwesenheit als Sperrblock in den Kalender ein
//                   -> auch die Telefon-KI (Bianca) kann den Tag nicht mehr
//                   buchen, weil keine freien Slots mehr existieren,
//                2. storniert die Termine über die Plattform-Cloud-Function
//                   (Reminder werden dort mit abgeräumt),
//                3. verschickt die Absagen: SMS/Anruf über Lisa, E-Mail über
//                   Nadine — jeweils mit Online-Buchungslink bzw. Termin-
//                   angebot am Telefon.
//   RÜCKKANAL  sweepAbsenceRebookings: Clara überwacht den Kalender. Bucht
//              ein abgesagter Patient neu, schreibt sie in den NEUEN Termin
//              die Notiz "Termin verschoben durch die Praxis vom … " und
//              quittiert das am Case. Sind alle versorgt -> Case resolved.
// ============================================================================

const TZ = "Europe/Berlin";

function s(v) {
  return v == null ? "" : String(v).trim();
}

// Volles Datum — NUR für Patienten-Nachrichten (SMS/E-Mail/Anruf): dort muss
// das konkrete Datum stehen, weil "morgen" beim Lesen längst falsch sein kann.
function dateDe(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
}

// Gesprochene Tagesangabe für den OPERATOR: exakt so, wie ein Mensch es sagt
// ("morgen", "am Freitag", "nächste Woche Donnerstag"). Sagt der Chef "trag
// für morgen ein", antwortet Clara mit "morgen" — nicht mit "Freitag, den
// 12. Juni" (numerische Echos klingen nach Maschine).
function dayRel(isoDate) {
  return relativeDayLabel(isoDate);
}

function capFirst(s2) {
  return s2 ? s2.charAt(0).toUpperCase() + s2.slice(1) : s2;
}

// ----------------------------------------------------------------------------
// Stimmungs-Sprüche: Clara frotzelt beim Abwesenheits-Eintragen.
// Bewusst im Backend (deterministisch, nie zweimal derselbe hintereinander)
// statt im LLM-Prompt — das 4B-Modell soll Tool-Texte wörtlich sprechen und
// NICHT selbst witzig sein müssen (Halluzinations-/Routing-Risiko).
// ----------------------------------------------------------------------------

const ABSENCE_QUIPS = [
  "Na na na, schon wieder keine Lust?",
  "Was? Und ich bleib alleine hier, oder wie?",
  "Neee, sorry, das genehmige ich nicht. … Na gut, ausnahmsweise.",
  "Ja nee, is klar — schon wieder weg.",
  "Boaaah, echt jetzt?",
  "Und wo geht's hin? Ich komm mit!",
  "Ich will auch mal blaumachen … ich schalte mich jetzt einfach aus! … Kleiner Scherz.",
  "Soso, wir gönnen uns mal wieder was.",
  "Das notiere ich beim Betriebsrat der KIs.",
  "Ich sag's keinem weiter, versprochen.",
  "Schon wieder dieses harte Arbeitsleben, hm?",
  "Na gut — aber das Wartezimmer wird weinen.",
  "Urlaub vom Urlaub, verstehe.",
  "Mein Kalender und ich sind not amused.",
  "Okay, aber nur weil du es bist.",
  "Und ich? Ich krieg nicht mal Wochenende.",
  "Wenn das so weitergeht, eröffne ich hier eine Strandbar.",
  "Moment, ich hole kurz das Beschwerdebuch … ach, vergiss es.",
];

const ABSENCE_SENDOFFS = [
  "Na dann, viel Spaß — ich halte hier die Stellung.",
  "Genieß es — ich passe auf den Laden auf.",
  "Schönen freien Tag! Einer von uns beiden muss ja arbeiten.",
  "Bring mir was mit.",
  "Erholung befohlen — den Rest übernehme ich.",
  "Ich sage Bescheid, falls hier die Wände wackeln.",
];

let lastQuipIdx = -1;
let lastSendoffIdx = -1;

function pickQuip(pool, lastIdxRef) {
  if (!pool.length) return "";
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === lastIdxRef.value) i = (i + 1) % pool.length;
  lastIdxRef.value = i;
  return pool[i];
}

function absenceQuip() {
  const ref = { value: lastQuipIdx };
  const q = pickQuip(ABSENCE_QUIPS, ref);
  lastQuipIdx = ref.value;
  return q;
}

function absenceSendoff() {
  const ref = { value: lastSendoffIdx };
  const q = pickQuip(ABSENCE_SENDOFFS, ref);
  lastSendoffIdx = ref.value;
  return q;
}

function dateDeShort(ms) {
  if (!ms) return "";
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ms));
}

function hhmm(ms) {
  if (!ms) return "";
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

function tsToMs(v) {
  if (v == null) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function casesCol(clientId) {
  return masCollection(clientId, "mas_cases");
}

function apptsCol(clientId, locationId) {
  return admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments");
}

export function absenceCaseId(clientId, calendarId, date, window = "") {
  // ``window`` ("10:00-17:00") macht Teil-Tages-Abwesenheiten am selben Tag
  // unterscheidbar; leer = ganztägig (alte IDs bleiben stabil).
  const h = createHash("sha256").update(`${clientId}|${calendarId}|${date}|${window}`).digest("hex").slice(0, 20);
  return `absence_${h}`;
}

// --- Zeitfenster ("ich bin morgen zwischen 15 und 17 Uhr nicht da") ---------

/** "10", "10:00", "10.30", "10 Uhr 30" -> "HH:MM"; ungültig -> "". */
export function normalizeClockTime(v) {
  const t = s(v).toLowerCase().replace(/uhr/g, " ").trim();
  const m = t.match(/^(\d{1,2})(?:\s*[:.]?\s*(\d{2}))?$/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Fenstergrenzen eines Tages: ohne Zeiten = ganztägig, nur startTime =
 * "ab 10 Uhr" (bis Tagesende), nur endTime = "bis 12 Uhr" (ab Tagesanfang).
 */
function absenceWindow(date, startTime, endTime) {
  const st = normalizeClockTime(startTime) || "00:00";
  const en = normalizeClockTime(endTime) || "23:59";
  const startDt = new Date(ensureBerlinTz(`${date}T${st}:00`));
  const endDt = new Date(ensureBerlinTz(`${date}T${en}:00`));
  const wholeDay = st === "00:00" && en === "23:59";
  return { st, en, startDt, endDt, wholeDay };
}

function spokenClock(hhmmStr) {
  const [h, m] = hhmmStr.split(":").map(Number);
  return m === 0 ? `${h} Uhr` : `${h} Uhr ${m}`;
}

/** "ganztägig" / "ab 10 Uhr" / "bis 12 Uhr" / "von 15 Uhr bis 17 Uhr". */
function windowLabel(win) {
  if (win.wholeDay) return "ganztägig";
  if (win.en === "23:59") return `ab ${spokenClock(win.st)}`;
  if (win.st === "00:00") return `bis ${spokenClock(win.en)}`;
  return `von ${spokenClock(win.st)} bis ${spokenClock(win.en)}`;
}

/** Online-Buchungslink der Patienten-App (Neubuchung nach Absage). */
function bookingLink(clientId, locationId) {
  return `https://pickadoc.de/profile/${clientId}/${locationId}`;
}

// ----------------------------------------------------------------------------
// PLAN: Termine lesen, Kanal pro Patient bestimmen, Auftrag anlegen
// ----------------------------------------------------------------------------

/**
 * Kanalwahl — genau EIN Kanal pro Patient (Abstimmung Lisa/Nadine):
 *   1. SMS     wenn Mobilnummer + SMS-Consent (schnell, mit Buchungslink)
 *   2. E-Mail  wenn Adresse + E-Mail-Consent (Nadine, mit Buchungslink)
 *   3. Anruf   wenn irgendeine Nummer existiert (Lisa, bietet Neubuchung an)
 *   4. none    -> manuelle Nacharbeit, wird im Case ausgewiesen
 */
function chooseChannel({ mobile, anyPhone, email, smsAllowed, emailAllowed, emailAvailable }) {
  if (mobile && smsAllowed && smsConfigured()) return "sms";
  if (email && emailAllowed && emailAvailable) return "email";
  if (anyPhone && callConfigured()) return "call";
  if (email && emailAvailable) return "email"; // besser informieren als gar nicht
  return "none";
}

/**
 * Liest die ECHTEN Termine eines Tages für einen Kalender direkt (roh, weil
 * wir die Patienten-Telefonnummern aus dem Termin-Dokument brauchen).
 */
async function rawDayAppointments(clientId, locationId, date, calendarId) {
  const dayStart = new Date(ensureBerlinTz(`${date}T00:00:00`));
  const dayEnd = new Date(ensureBerlinTz(`${date}T23:59:59`));
  const snap = await apptsCol(clientId, locationId)
    .where("start", ">=", dayStart)
    .where("start", "<=", dayEnd)
    .orderBy("start")
    .get();
  return snap.docs
    .map((d) => ({ docId: d.id, ...d.data() }))
    .filter((a) =>
      a.calendarItemType !== "absence" &&
      a.isMultiDay !== true &&
      s(a.patient?.id) &&
      (a.calendar?.id || a.resourceId) === calendarId
    );
}

async function loadPatientDoc(clientId, locationId, patientId) {
  if (!patientId) return null;
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("patients").doc(patientId).get();
    return snap.exists ? snap.data() : null;
  } catch {
    return null;
  }
}

/**
 * Legt (idempotent) den Absage-Auftrag für eine Abwesenheit an und gibt die
 * gesprochene Zusammenfassung zurück. Approval-first, mit EINER Ausnahme:
 * ein Zeitraum OHNE betroffene Patiententermine ("sperr ab 10 Uhr", leerer
 * Nachmittag) wird SOFORT als Sperrblock eingetragen — es gibt nichts
 * abzusagen, also auch nichts freizugeben.
 *
 * ``startTime``/``endTime`` ("HH:MM", tolerant normalisiert) begrenzen die
 * Abwesenheit auf ein Zeitfenster; ohne beide gilt der ganze Tag.
 */
export async function planAbsence(clientId, { date, startTime, endTime, calendarId, calendarName, by } = {}) {
  const day = s(date);
  if (!day || day < todayBerlin()) {
    return { ok: false, message: "Für welchen Tag soll ich die Abwesenheit planen? Der Tag darf nicht in der Vergangenheit liegen." };
  }
  if (!calendarId) {
    return { ok: false, message: "Ich konnte den Kalender nicht zuordnen. Für welchen Behandler soll die Abwesenheit eingetragen werden?" };
  }
  const booking = await loadBooking(clientId).catch(() => null);
  if (!booking?.locationId) return { ok: false, message: "Es ist keine Praxis-Buchungskonfiguration hinterlegt." };
  const locationId = booking.locationId;
  const calName = s(calendarName) || s((booking.calendars || []).find((c) => c.id === calendarId)?.name);

  const win = absenceWindow(day, startTime, endTime);
  if (win.startDt >= win.endDt) {
    return { ok: false, message: "Die Endzeit liegt vor der Startzeit — bitte das Zeitfenster noch einmal nennen." };
  }
  const winLabel = windowLabel(win);
  const winKey = win.wholeDay ? "" : `${win.st}-${win.en}`;

  const caseId = absenceCaseId(clientId, calendarId, day, winKey);
  const existingSnap = await casesCol(clientId).doc(caseId).get();
  if (existingSnap.exists && existingSnap.data().status !== CASE_STATUS.WAITING_APPROVAL) {
    const st = existingSnap.data().status;
    return {
      ok: true, caseId, alreadyHandled: true,
      message: st === CASE_STATUS.IN_PROGRESS || st === CASE_STATUS.RESOLVED
        ? `Die Abwesenheit ${dayRel(day)} (${winLabel}) ist bereits eingetragen beziehungsweise in Bearbeitung. Frag mich nach dem Abwesenheits-Status.`
        : `${capFirst(dayRel(day))} (${winLabel}) gibt es bereits einen Absage-Auftrag (Status ${st}).`,
    };
  }

  let appts = await rawDayAppointments(clientId, locationId, day, calendarId);
  // Nur Termine, die das Abwesenheitsfenster ÜBERLAPPEN, sind betroffen.
  if (!win.wholeDay) {
    appts = appts.filter((a) => {
      const aStart = tsToMs(a.start);
      const aEnd = tsToMs(a.end) || aStart;
      return aStart < win.endDt.getTime() && aEnd > win.startDt.getTime();
    });
  }
  const emailAvailable = (await listAccounts(clientId).catch(() => [])).length > 0;

  const patients = [];
  for (const a of appts) {
    const p = a.patient || {};
    const pdoc = await loadPatientDoc(clientId, locationId, s(p.id));
    const mobile = s(pdoc?.mobilePhoneNumber) || s(p.mobilePhoneNumber);
    const anyPhone = mobile || s(pdoc?.phoneNumber) || s(p.phoneNumber);
    const email = s(pdoc?.email);
    const channel = chooseChannel({
      mobile,
      anyPhone,
      email,
      smsAllowed: pdoc?.smsAllowed === true,
      emailAllowed: pdoc?.emailAllowed === true,
      emailAvailable,
    });
    patients.push({
      appointmentId: a.docId,
      patientId: s(p.id),
      firstName: s(p.firstName),
      lastName: s(p.lastName),
      name: `${s(p.firstName)} ${s(p.lastName)}`.trim(),
      gender: s(p.gender).toLowerCase(),
      startMs: tsToMs(a.start),
      timeLabel: hhmm(tsToMs(a.start)),
      visitMotiveName: s(a.visitMotive?.name),
      phone: mobile || anyPhone || "",
      email,
      channel,
      contact: null,
      rebooked: null,
    });
  }

  const plan = {
    kind: "absence",
    date: day,
    startTime: win.wholeDay ? null : win.st,
    endTime: win.wholeDay ? null : win.en,
    windowLabel: winLabel,
    calendarId,
    calendarName: calName,
    locationId,
    bookingLink: bookingLink(clientId, locationId),
    patients,
    approvedBy: null,
    approvedAt: null,
    refreshedAt: Date.now(),
  };

  // KEIN Termin betroffen -> Sperrblock SOFORT eintragen. Genau das meint
  // "sperr ab 10 Uhr Buchungen": ab jetzt findet auch die Telefon-KI dort
  // keine freien Slots mehr. Es gibt nichts abzusagen, also keine Freigabe.
  if (!patients.length) {
    const blockId = await writeAbsenceBlock(clientId, plan, { by }).catch((e) => {
      log.warn("absence.block_failed", { clientId, caseId, err: String(e?.message || e) });
      return null;
    });
    if (!blockId) {
      return { ok: false, message: "Der Kalendereintrag hat nicht geklappt — bitte im Monitor prüfen." };
    }
    plan.approvedBy = by || "Operator";
    plan.approvedAt = Date.now();
    plan.blockAppointmentId = blockId;
    await createCase(clientId, {
      id: caseId,
      title: `Abwesenheit: ${calName} am ${day} (${winLabel})`,
      topic: "appointment",
      subject: { name: `Praxisausfall ${calName}` },
      status: CASE_STATUS.RESOLVED,
      assignee: "Clara",
      createdBy: by || "Clara",
      updates: [{
        by: by || "Clara",
        kind: "note",
        text: `Abwesenheit ${calName} am ${day} (${winLabel}) direkt eingetragen — keine Termine betroffen, Zeitraum im Kalender gesperrt.`,
      }],
    });
    await casesCol(clientId).doc(caseId).update({ absencePlan: plan });
    return {
      ok: true, caseId, date: day, calendarName: calName, blocked: true, total: 0,
      message: `${absenceQuip()} Erledigt — ich habe die Abwesenheit für ${calName} ${dayRel(day)} ${winLabel} eingetragen. In dem Zeitraum sind keine Termine betroffen, und es kann dort nichts mehr gebucht werden.`,
    };
  }

  const counts = { sms: 0, email: 0, call: 0, none: 0 };
  for (const p of patients) counts[p.channel] = (counts[p.channel] || 0) + 1;

  if (!existingSnap.exists) {
    await createCase(clientId, {
      id: caseId,
      title: `Abwesenheit: ${calName} am ${day} (${winLabel})`,
      topic: "appointment",
      subject: { name: `Praxisausfall ${calName}` },
      status: CASE_STATUS.WAITING_APPROVAL,
      assignee: "Clara",
      createdBy: by || "Clara",
      updates: [{
        by: by || "Clara",
        kind: "note",
        text: `Abwesenheit ${calName} am ${day} (${winLabel}) geplant: ${patients.length} Termin(e) betroffen — ${counts.sms} SMS, ${counts.email} E-Mail, ${counts.call} Anruf(e), ${counts.none} ohne Kanal. Wartet auf Freigabe.`,
      }],
    });
    await casesCol(clientId).doc(caseId).update({ absencePlan: plan });
  } else {
    await casesCol(clientId).doc(caseId).update({ absencePlan: plan, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  }

  const parts = [absenceQuip(), `${capFirst(dayRel(day))} ${winLabel === "ganztägig" ? "" : `${winLabel} `}${patients.length === 1 ? "steht 1 Termin" : `stehen ${patients.length} Termine`} bei ${calName} im Kalender.`];
  const how = [];
  if (counts.sms) how.push(`${counts.sms} per SMS`);
  if (counts.email) how.push(`${counts.email} per E-Mail durch Nadine`);
  if (counts.call) how.push(`${counts.call} per Anruf durch Lisa`);
  parts.push(`Wenn du freigibst, sperre ich den Zeitraum im Kalender und sage ab: ${how.join(", ")} — jeder Patient bekommt genau eine Nachricht, mit Bitte um Neubuchung.`);
  if (counts.none) parts.push(`Achtung: für ${counts.none} Patient${counts.none === 1 ? "en" : "en"} habe ich keinen Kontaktweg — die stehen im Monitor zur manuellen Absage.`);
  parts.push("Soll ich das machen? Sage: Abwesenheit freigeben.");
  return { ok: true, caseId, date: day, calendarName: calName, window: winLabel, counts, total: patients.length, message: parts.join(" ") };
}

// ----------------------------------------------------------------------------
// FREIGABE + AUSFÜHRUNG
// ----------------------------------------------------------------------------

function buildSmsText({ name, praxis, date, link }) {
  return (
    `Guten Tag${name ? ` ${name}` : ""}, hier ist ${praxis}. ` +
    `Ihr Termin am ${dateDe(date)} muss leider praxisbedingt abgesagt werden — wir bitten um Entschuldigung. ` +
    `Einen neuen Termin können Sie direkt online buchen: ${link} Oder rufen Sie uns einfach an.`
  );
}

function buildEmailText({ name, praxis, date, timeLabel, link }) {
  return (
    `Guten Tag${name ? ` ${name}` : ""},\n\n` +
    `leider müssen wir Ihren Termin am ${dateDe(date)}${timeLabel ? ` um ${timeLabel} Uhr` : ""} praxisbedingt absagen. ` +
    `Wir bitten die Unannehmlichkeiten zu entschuldigen.\n\n` +
    `Einen neuen Termin können Sie jederzeit bequem online buchen:\n${link}\n\n` +
    `Alternativ erreichen Sie uns natürlich auch telefonisch.\n\n` +
    `Herzliche Grüße\n${praxis}`
  );
}

function buildCallInstruction({ name, praxis, date, timeLabel }) {
  return (
    `Du rufst im Auftrag von ${praxis} an. Gesprächspartner: ${name || "der Patient"}. ` +
    `Teile freundlich mit, dass der Termin am ${dateDe(date)}${timeLabel ? ` um ${timeLabel} Uhr` : ""} ` +
    `leider praxisbedingt abgesagt werden muss, und entschuldige dich für die Unannehmlichkeiten. ` +
    `Biete an, direkt am Telefon einen neuen Termin zu vereinbaren. ` +
    `Wenn der Patient gerade nicht entscheiden will: sage, dass er jederzeit anrufen oder online buchen kann. ` +
    `Nenne KEINE medizinischen Details. Sei freundlich und fasse dich kurz.`
  );
}

/** Sperrblock in den Plattform-Kalender schreiben (Zeitfenster oder ganztägig). */
async function writeAbsenceBlock(clientId, plan, { by } = {}) {
  const start = new Date(ensureBerlinTz(`${plan.date}T${plan.startTime || "00:00"}:00`));
  const end = new Date(ensureBerlinTz(`${plan.date}T${plan.endTime || "23:59"}:00`));
  const now = admin.firestore.FieldValue.serverTimestamp();
  const ref = await apptsCol(clientId, plan.locationId).add({
    clientId,
    locationId: plan.locationId,
    calendarItemType: "absence",
    calendar: { id: plan.calendarId, name: plan.calendarName || "" },
    resourceId: plan.calendarId,
    start,
    end,
    isMultiDay: false,
    status: "confirmed",
    comments: `Abwesenheit ${plan.calendarName || ""} (${plan.windowLabel || "ganztägig"}) — eingetragen durch Clara${by ? ` (freigegeben von ${by})` : ""}.`,
    createdBy: "clara",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

async function pendingAbsenceCases(clientId, { date } = {}) {
  const cases = await listCases(clientId, { activeOnly: true, limit: 100 }).catch(() => []);
  return cases.filter((c) =>
    c.id.startsWith("absence_") &&
    c.absencePlan &&
    c.status === CASE_STATUS.WAITING_APPROVAL &&
    (!date || c.absencePlan.date === date)
  );
}

/**
 * Mündliche Freigabe ("Abwesenheit freigeben"): Kalender sperren, Termine
 * stornieren, Absagen verschicken. `dryRun` führt alles ausser den externen
 * Wirkungen aus (kein Kalender-Write, keine Stornos, kein Versand) — für
 * gefahrlose Tests.
 */
export async function approveAbsence(clientId, { date, caseId, by, dryRun = false } = {}) {
  let targets;
  if (caseId) {
    const c = await casesCol(clientId).doc(s(caseId)).get();
    targets = c.exists ? [c.data()] : [];
  } else {
    targets = await pendingAbsenceCases(clientId, { date: s(date) || null });
  }
  if (!targets.length) {
    return { ok: true, approved: 0, message: "Es wartet gerade keine Abwesenheit auf Freigabe. Sage zuerst zum Beispiel: Trag eine Abwesenheit für Freitag ein." };
  }

  const booking = await loadBooking(clientId).catch(() => null);
  const praxis = s(booking?.practiceName) || "Ihrer Praxis";
  const accounts = await listAccounts(clientId).catch(() => []);
  const mailAccountId = accounts[0]?.id || null;

  let approved = 0;
  const totals = { cancelled: 0, sms: 0, email: 0, call: 0, none: 0 };

  for (const c of targets) {
    const plan = c.absencePlan;
    if (!plan || plan.approvedBy) continue;

    // 1) Kalender sperren — ab jetzt findet auch Bianca keine freien Slots mehr.
    let blockId = null;
    if (!dryRun) {
      blockId = await writeAbsenceBlock(clientId, plan, { by }).catch((e) => {
        log.warn("absence.block_failed", { clientId, caseId: c.id, err: String(e?.message || e) });
        return null;
      });
    }

    const patients = [...(plan.patients || [])];
    for (let i = 0; i < patients.length; i++) {
      const p = patients[i];
      if (p.contact?.at) continue; // idempotent: schon kontaktiert

      // 2) Termin stornieren (Plattform-CF räumt Reminder mit ab).
      let cancelled = false;
      if (!dryRun) {
        const r = await proxyUpdateOrCancel({
          clientId,
          locationId: plan.locationId,
          action: "cancel",
          lastName: p.lastName,
          firstName: p.firstName,
          appointmentDate: plan.date,
        }).catch(() => null);
        cancelled = !!(r && (r.data?.success === true || r.status === 200));
      }
      if (cancelled || dryRun) totals.cancelled++;

      // 3) Absage über GENAU EINEN Kanal.
      let contact = { via: p.channel, ok: false, at: Date.now(), dryRun: !!dryRun };
      if (dryRun) {
        contact.ok = p.channel !== "none";
      } else if (p.channel === "sms") {
        const out = await lisaSendSms(clientId, {
          phone: p.phone,
          message: buildSmsText({ name: p.name, praxis, date: plan.date, link: plan.bookingLink }),
          recipientName: p.name,
          by: by || "Abwesenheits-Planer",
        });
        contact = { ...contact, ok: out.ok !== false, taskId: out.taskId || null };
        if (out.ok !== false) totals.sms++;
      } else if (p.channel === "email" && mailAccountId) {
        try {
          await sendMail(clientId, mailAccountId, {
            to: [p.email],
            subject: `Ihr Termin am ${dateDe(plan.date)} — Absage und Neubuchung`,
            text: buildEmailText({ name: p.name, praxis, date: plan.date, timeLabel: p.timeLabel, link: plan.bookingLink }),
          });
          contact.ok = true;
          totals.email++;
          await appendEvent(clientId, {
            channel: CHANNELS.NADINE_EMAIL,
            direction: DIRECTIONS.OUT,
            type: EVENT_TYPES.INTERACTION,
            counterparty: { kind: "patient", name: p.name, ref: p.email },
            subject: { patientId: p.patientId, name: p.name, matchStatus: "matched" },
            summary: `Nadine hat ${p.name} die Terminabsage für den ${plan.date} gemailt (Abwesenheit ${plan.calendarName}), mit Online-Buchungslink.`,
            status: "none",
            extractor: "absence@planner",
            tags: ["absence"],
          }).catch(() => {});
        } catch (e) {
          contact.error = String(e?.message || e);
        }
      } else if (p.channel === "call") {
        const out = await lisaStartCall(clientId, {
          phone: p.phone,
          instruction: buildCallInstruction({ name: p.name, praxis, date: plan.date, timeLabel: p.timeLabel }),
          contactName: p.name,
          by: by || "Abwesenheits-Planer",
        });
        contact = { ...contact, ok: out.ok !== false, taskId: out.taskId || null };
        if (out.ok !== false) totals.call++;
      } else {
        totals.none++;
      }
      patients[i] = { ...p, cancelled: cancelled || (dryRun ? "dry" : false), contact };
    }

    await casesCol(clientId).doc(c.id).update({
      "absencePlan.patients": patients,
      "absencePlan.approvedBy": by || "Operator",
      "absencePlan.approvedAt": Date.now(),
      "absencePlan.blockAppointmentId": blockId,
      "absencePlan.dryRun": !!dryRun,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await setStatus(clientId, c.id, CASE_STATUS.IN_PROGRESS, {
      by: by || "Clara",
      note: dryRun
        ? "TESTLAUF: Freigabe simuliert — keine Stornos, kein Versand, kein Kalendereintrag."
        : `Freigegeben: Tag gesperrt${blockId ? "" : " (Sperrblock fehlgeschlagen!)"}, ${totals.cancelled} Storno(s), ${totals.sms} SMS, ${totals.email} E-Mail(s), ${totals.call} Anruf(e) durch Lisa.`,
    });
    approved++;
  }

  if (!approved) return { ok: false, message: "Die Freigabe hat nicht geklappt — bitte im Monitor prüfen." };
  const parts = [dryRun ? `Testlauf: ${approved} Abwesenheit${approved === 1 ? "" : "en"} simuliert.` : `Erledigt — der Zeitraum ist im Kalender gesperrt, auch telefonisch kann dort nichts mehr gebucht werden.`];
  if (totals.sms) parts.push(`${totals.sms} SMS mit Buchungslink ${totals.sms === 1 ? "geht" : "gehen"} raus.`);
  if (totals.email) parts.push(`Nadine verschickt ${totals.email} E-Mail${totals.email === 1 ? "" : "s"}.`);
  if (totals.call) parts.push(`Lisa ruft ${totals.call} Patient${totals.call === 1 ? "en" : "en"} an.`);
  if (totals.none) parts.push(`${totals.none} ohne Kontaktweg — bitte manuell absagen, Details im Monitor.`);
  parts.push("Ich beobachte den Kalender und sage Bescheid, wenn Patienten neu gebucht haben.");
  if (!dryRun) parts.push(absenceSendoff());
  return { ok: true, approved, ...totals, message: parts.join(" ") };
}

// ----------------------------------------------------------------------------
// RÜCKKANAL: Neubuchungen erkennen und quittieren
// ----------------------------------------------------------------------------

/**
 * Periodischer Sweep: hat ein abgesagter Patient inzwischen NEU gebucht?
 * Dann schreibt Clara die Verschiebe-Notiz in den neuen Termin (Kalender-
 * Überwachung = Quittung) und protokolliert es am Case.
 */
export async function sweepAbsenceRebookings(clientId) {
  const cases = await listCases(clientId, { activeOnly: true, limit: 100 }).catch(() => []);
  const running = cases.filter((c) => c.id.startsWith("absence_") && c.absencePlan?.approvedBy && c.status === CASE_STATUS.IN_PROGRESS);
  let found = 0;

  for (const c of running) {
    const plan = c.absencePlan;
    if (plan.dryRun) continue; // Testläufe nicht nachverfolgen
    const approvedAt = Number(plan.approvedAt) || 0;
    const patients = [...(plan.patients || [])];
    let changed = false;

    for (let i = 0; i < patients.length; i++) {
      const p = patients[i];
      if (!p.patientId || p.rebooked) continue;

      // Einzel-Equality-Query (kein Composite-Index nötig), Filter im Speicher.
      const snap = await apptsCol(clientId, plan.locationId)
        .where("patient.id", "==", p.patientId)
        .limit(50)
        .get()
        .catch(() => null);
      if (!snap) continue;

      const candidates = snap.docs
        .map((d) => ({ docId: d.id, ...d.data() }))
        .filter((a) =>
          a.docId !== p.appointmentId &&
          a.calendarItemType !== "absence" &&
          tsToMs(a.createdAt) > approvedAt &&
          tsToMs(a.start) > Date.now() - 3600000
        )
        .sort((x, y) => tsToMs(x.start) - tsToMs(y.start));
      const neu = candidates[0];
      if (!neu) continue;

      const newStartMs = tsToMs(neu.start);
      const note = `Termin verschoben durch die Praxis: ursprünglich am ${dateDeShort(p.startMs)} um ${p.timeLabel} Uhr (Abwesenheit ${plan.calendarName || ""}), neu gebucht für den ${dateDeShort(newStartMs)} um ${hhmm(newStartMs)} Uhr. (Clara)`;
      const existing = s(neu.comments);
      await apptsCol(clientId, plan.locationId).doc(neu.docId)
        .update({ comments: existing ? `${existing}\n${note}` : note })
        .catch((e) => log.warn("absence.note_failed", { clientId, appt: neu.docId, err: String(e?.message || e) }));

      patients[i] = { ...p, rebooked: { appointmentId: neu.docId, startMs: newStartMs, at: Date.now() } };
      changed = true;
      found++;

      await addUpdate(clientId, c.id, {
        by: "Clara",
        kind: "note",
        text: `NEU GEBUCHT: ${p.name} hat nach der Absage einen neuen Termin am ${dateDeShort(newStartMs)} um ${hhmm(newStartMs)} Uhr — Verschiebe-Notiz steht im Termin.`,
      });
      await appendEvent(clientId, {
        channel: CHANNELS.SYSTEM,
        direction: DIRECTIONS.INTERNAL,
        type: EVENT_TYPES.OBSERVATION,
        counterparty: { kind: "patient", name: p.name },
        subject: { patientId: p.patientId, name: p.name, matchStatus: "matched" },
        summary: `Kalender-Quittung: ${p.name} hat nach der Praxis-Absage (${plan.date}) neu gebucht — ${dateDeShort(newStartMs)} ${hhmm(newStartMs)} Uhr.`,
        status: "none",
        extractor: "absence@sweep",
        tags: ["absence", "rebooked"],
      }).catch(() => {});
    }

    if (changed) {
      await casesCol(clientId).doc(c.id).update({
        "absencePlan.patients": patients,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const allDone = patients.every((x) => x.rebooked || x.channel === "none");
      if (allDone && patients.length) {
        await setStatus(clientId, c.id, CASE_STATUS.RESOLVED, { by: "Clara", note: "Alle abgesagten Patienten haben neu gebucht (oder waren ohne Kontaktweg)." });
      }
    }
  }
  return { ok: true, found };
}

// ----------------------------------------------------------------------------
// Statusbericht
// ----------------------------------------------------------------------------

export async function absenceStatusSpoken(clientId) {
  const cases = await listCases(clientId, { limit: 100 }).catch(() => []);
  const relevant = cases.filter((c) => c.id.startsWith("absence_") && c.absencePlan).slice(0, 5);
  if (!relevant.length) return "Es gibt aktuell keine geplanten oder laufenden Abwesenheiten.";

  const parts = [];
  for (const c of relevant) {
    const plan = c.absencePlan;
    const ps = plan.patients || [];
    const winInfo = plan.windowLabel && plan.windowLabel !== "ganztägig" ? ` (${plan.windowLabel})` : "";
    if (c.status === CASE_STATUS.WAITING_APPROVAL) {
      parts.push(`${capFirst(dayRel(plan.date))}${winInfo} bei ${plan.calendarName}: ${ps.length} Termin(e), wartet auf deine Freigabe.`);
      continue;
    }
    if (!ps.length) {
      parts.push(`${capFirst(dayRel(plan.date))}${winInfo} bei ${plan.calendarName}: Zeitraum gesperrt, keine Termine betroffen.`);
      continue;
    }
    const rebooked = ps.filter((p) => p.rebooked).length;
    const contacted = ps.filter((p) => p.contact?.ok).length;
    const open = ps.length - rebooked;
    parts.push(
      `${capFirst(dayRel(plan.date))}${winInfo} bei ${plan.calendarName}: ${contacted} von ${ps.length} informiert, ${rebooked} ${rebooked === 1 ? "hat" : "haben"} bereits neu gebucht${open > 0 && c.status !== CASE_STATUS.RESOLVED ? `, ${open} noch offen` : ""}.`
    );
  }
  return `Abwesenheits-Stand: ${parts.join(" ")}`;
}
