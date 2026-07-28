import { createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { loadBooking, ensureBerlinTz } from "./booking.js";
import { getDayAppointments, todayBerlin } from "./daySchedule.js";
import { createCase, listCases, addUpdate, setStatus } from "../brain/caseStore.js";
import { CASE_STATUS } from "../brain/cases.js";
import { getActivePrompt } from "../brain/livingPrompt.js";
import { queryRecent } from "../brain/eventStore.js";
import { normalizePhone } from "./callerLookup.js";
import { pick as pickPhrase } from "./variation.js";
import { loadStatsMap, contactsInWindow, isBookedSuppressed, isSpamRisk, nameMitZaehler } from "./outreachStats.js";

// ============================================================================
// Lückenfüller / Umsatz-Coach — Stufe 1 (Clara is the coach, Lisa executes).
//
// Pipeline per day & Behandler:
//   1. REAL free gaps  = opening hours (doctor-first, location fallback; the
//      same rule the platform's own slot search uses) minus pause, minus booked
//      appointments, minus absence blocks.
//   2. CANDIDATES      = patients from the practice's own recall pools:
//      campaign buckets (campaigns/{id}/patients, auto-filled by the recall
//      rules per visit motive) + due virtual recall appointments
//      (status "needsConfirmation", createdBy recaller/campaign/predecessor).
//      Hard gates: not converted, not recently contacted (brain throttle),
//      reachable, treatment duration fits the gap.
//   3. CALL LIST       = ONE Gesprächsauftrag case per gap (assignee Lisa,
//      waiting_approval, idempotent id), carrying everything Lisa needs:
//      slot, candidates ranked, reason per candidate, DSGVO voicemail script,
//      and the Lisa prompt version the calls will run under. A human approves
//      EVERY list individually before anything goes out.
//
// Everything lands in the shared brain (cases + audit updates), so Clara,
// Nadine, Bianca and the team all see what is planned, approved and done.
// ============================================================================

const TZ = "Europe/Berlin";
const MIN_GAP_MINUTES = 25; // a gap must fit a short treatment incl. buffer
// Wieviele Kandidaten pro Lücke vorgeschlagen werden (Chef-Frage "warum nur 5?":
// jetzt konfigurierbar, Default 8). Zu viele Namen am Telefon überfordern; 8
// gibt der Praxis spürbar mehr Auswahl als die alte feste 5.
const MAX_CANDIDATES_PER_LIST = Number(process.env.MAS_GAP_MAX_CANDIDATES || 8);
// Vorlaufzeit, ab der eine Lücke noch sinnvoll per Recall zu füllen ist. Liegt
// eine Lücke näher (z. B. heute), ist klassischer Recall meist zu kurzfristig —
// Clara weist darauf hin und bietet stattdessen das gezielte Einbestellen an.
const RECALL_MIN_LEAD_HOURS = Number(process.env.MAS_RECALL_MIN_LEAD_HOURS || 16);
const THROTTLE_DAYS = 14; // no patient is proposed twice within this window
const RECALL_LOOKBACK_DAYS = 365;
/** Feste Kampagnen-ID fuer `scripts/seed-gapfill-demo.mjs` — nur bei demoOnly. */
export const DEMO_GAPFILL_CAMPAIGN_ID = "demo_gapfill_campaign";

const db = admin.firestore();

function s(v) {
  return v == null ? "" : String(v).trim();
}

// ----------------------------------------------------------------------------
// Opening hours (platform Firestore, read-only) — doctor first, else location
// ----------------------------------------------------------------------------

/** Tolerant time parser: {hour,minute} object or "HH:mm" string -> minutes. */
export function parseTimeToMinutes(v) {
  if (v && typeof v === "object" && Number.isFinite(Number(v.hour))) {
    return Number(v.hour) * 60 + (Number(v.minute) || 0);
  }
  const m = String(v || "").match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return null;
}

/** Tolerant span parser: {start,end} objects or "HH:mm-HH:mm" string. */
export function parseSpan(v) {
  if (typeof v === "string") {
    const [a, b] = v.split("-");
    const start = parseTimeToMinutes(a);
    const end = parseTimeToMinutes(b);
    return start != null && end != null && end > start ? { start, end } : null;
  }
  if (v && typeof v === "object") {
    const start = parseTimeToMinutes(v.start);
    const end = parseTimeToMinutes(v.end);
    return start != null && end != null && end > start ? { start, end } : null;
  }
  return null;
}

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Normalised working day {open:{start,end}, pause?:{start,end}} or null. */
export function workingDayOf(openingHours, weekdayIndex) {
  const day = openingHours?.[WEEKDAY_KEYS[weekdayIndex] || ""];
  if (!day || day.hasOpen !== true) return null;
  const open = parseSpan(day.open);
  if (!open) return null;
  const pause = day.hasPause === true ? parseSpan(day.pause) : null;
  return { open, pause };
}

const hoursCache = new Map(); // `${clientId}:${calendarId}` -> {at, hours}
const HOURS_TTL_MS = 10 * 60000;

/**
 * Effective opening hours for a calendar: the doctor's own (if enabled), else
 * the location's — exactly the platform rule (getFreeTimeSlots CF, App.tsx).
 */
export async function loadOpeningHoursForCalendar(clientId, locationId, calendarId) {
  const key = `${clientId}:${calendarId}`;
  const hit = hoursCache.get(key);
  if (hit && Date.now() - hit.at < HOURS_TTL_MS) return hit.hours;

  let hours = null;
  try {
    const calSnap = await db.collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("calendars").doc(calendarId).get();
    const userId = calSnap.exists ? s(calSnap.data().userId) : "";
    if (userId) {
      const userSnap = await db.collection("clients").doc(clientId).collection("users").doc(userId).get();
      const oh = userSnap.exists ? userSnap.data().openingHours : null;
      if (oh && oh.enabled === true) hours = oh;
    }
    if (!hours) {
      const locSnap = await db.collection("clients").doc(clientId).collection("locations").doc(locationId).get();
      hours = locSnap.exists ? locSnap.data().openingHours || null : null;
    }
  } catch {
    hours = null;
  }
  hoursCache.set(key, { at: Date.now(), hours });
  return hours;
}

// ----------------------------------------------------------------------------
// Gap computation (pure)
// ----------------------------------------------------------------------------

function berlinMinutesOf(ms) {
  const parts = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
  const m = parts.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

export function weekdayIndexOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

function hhmm(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Vorlaufzeit einer Lücke ab jetzt in Stunden (Berlin). Infinity bei Fehlern. */
export function gapLeadHours(date, startMin) {
  try {
    const ms = new Date(ensureBerlinTz(`${date}T${hhmm(startMin)}:00`)).getTime();
    if (!ms) return Infinity;
    return (ms - Date.now()) / 3600000;
  } catch {
    return Infinity;
  }
}

/** True, wenn die Lücke zu kurzfristig für klassischen Recall ist. */
export function isShortNoticeGap(gap) {
  return gapLeadHours(gap?.date, gap?.startMin) < RECALL_MIN_LEAD_HOURS;
}

/**
 * Real free windows of one calendar on one day. Busy = confirmed/real
 * appointments + absence blocks; virtual holds (needsConfirmation/declined) do
 * NOT block — the platform's own slot calculator ignores them too. Pure.
 *
 * @param {{open:{start,end}, pause?:{start,end}}} workingDay
 * @param {{startMin:number, endMin:number}[]} busy
 * @returns {{startMin:number, endMin:number, minutes:number, label:string}[]}
 */
export function computeGapWindows(workingDay, busy = [], { minGap = MIN_GAP_MINUTES } = {}) {
  if (!workingDay) return [];
  const blocks = [];
  if (workingDay.pause) blocks.push({ startMin: workingDay.pause.start, endMin: workingDay.pause.end });
  for (const b of busy) {
    const startMin = Math.max(workingDay.open.start, b.startMin);
    const endMin = Math.min(workingDay.open.end, Math.max(b.endMin, b.startMin));
    if (endMin > startMin) blocks.push({ startMin, endMin });
  }
  blocks.sort((a, b) => a.startMin - b.startMin);

  const gaps = [];
  let cursor = workingDay.open.start;
  for (const b of blocks) {
    if (b.startMin > cursor) {
      const minutes = b.startMin - cursor;
      if (minutes >= minGap) gaps.push({ startMin: cursor, endMin: b.startMin, minutes, label: `${hhmm(cursor)}–${hhmm(b.startMin)}` });
    }
    cursor = Math.max(cursor, b.endMin);
  }
  if (workingDay.open.end > cursor) {
    const minutes = workingDay.open.end - cursor;
    if (minutes >= minGap) gaps.push({ startMin: cursor, endMin: workingDay.open.end, minutes, label: `${hhmm(cursor)}–${hhmm(workingDay.open.end)}` });
  }
  return gaps;
}

// ----------------------------------------------------------------------------
// Candidates (campaign buckets + due virtual recalls), gated + ranked
// ----------------------------------------------------------------------------

function durationOfMotive(booking, visitMotiveId, visitMotiveName) {
  const vms = Array.isArray(booking?.visitMotives) ? booking.visitMotives : [];
  const byId = vms.find((v) => v.id === visitMotiveId);
  if (byId?.duration) return Number(byId.duration);
  const q = s(visitMotiveName).toLowerCase();
  const byName = q ? vms.find((v) => s(v.name).toLowerCase() === q) : null;
  return Number(byName?.duration) || 30; // safe default
}

async function campaignCandidates(clientId, locationId, booking, { demoOnly = false } = {}) {
  const out = [];
  let campaigns = [];
  try {
    // CampaignStatus.started === 1 (numeric enum in the platform model).
    const snap = await db.collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("campaigns").where("status", "==", 1).limit(25).get();
    campaigns = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return out;
  }
  if (demoOnly) {
    campaigns = campaigns.filter((c) => c.id === DEMO_GAPFILL_CAMPAIGN_ID);
  }

  for (const camp of campaigns) {
    let patients = [];
    try {
      const snap = await db.collection("clients").doc(clientId)
        .collection("locations").doc(locationId)
        .collection("campaigns").doc(camp.id)
        .collection("patients").limit(200).get();
      patients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      continue;
    }
    for (const p of patients) {
      // Demo-Modus: Konversions-Status ignorieren, damit der Testlauf mit den
      // geseedeten Patienten beliebig wiederholbar bleibt.
      if (!demoOnly && p.appointmentMade === true) continue; // already converted — out of the bucket
      const phone = s(p.mobilePhoneNumber) || s(p.phoneNumber);
      if (!phone) continue;
      // Consent (opt-in semantics: missing flag = NOT allowed):
      const smsOk = p.smsAllowed === true;
      const reminderOk = p.reminderAllowed === true;
      const overdueDays = p.lastAppointmentDate
        ? Math.max(0, Math.round((Date.now() - (p.lastAppointmentDate?.toMillis?.() ?? new Date(p.lastAppointmentDate).getTime() ?? Date.now())) / 86400000))
        : 0;
      out.push({
        source: "campaign",
        campaignId: camp.id,
        campaignName: s(camp.name),
        patientId: s(p.id),
        name: `${s(p.firstName)} ${s(p.lastName)}`.trim(),
        phone,
        phoneNorm: normalizePhone(phone),
        visitMotiveId: s(camp.visitMotiveId),
        visitMotiveName: s(camp.visitMotiveName),
        durationMin: durationOfMotive(booking, s(camp.visitMotiveId), s(camp.visitMotiveName)),
        calendarId: s(camp.calendarId) || null, // null = any Behandler
        doctorName: s(camp.doctorName) || s(camp.calendarName),
        overdueDays,
        alreadyCalled: p.called === true,
        consent: { sms: smsOk, reminder: reminderOk },
        reason: `Kampagne »${s(camp.name)}«${camp.visitMotiveName ? ` — ${s(camp.visitMotiveName)}` : ""}`,
        // Kampagnen-Vorgabe für den Anruf: neues Schema cfg.phoneKi.prompt
        // (CampaignR, W-OUTREACH-Vorbelegung), Altbestand camp.phonePrompt.
        phonePrompt: s(camp.cfg?.phoneKi?.prompt) || s(camp.phonePrompt),
      });
    }
  }
  return out;
}

async function recallCandidates(clientId, locationId, booking) {
  const out = [];
  let docs = [];
  try {
    const snap = await db.collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("appointments")
      .where("status", "==", "needsConfirmation")
      .limit(300).get();
    docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return out;
  }

  const now = Date.now();
  const oldest = now - RECALL_LOOKBACK_DAYS * 86400000;
  for (const a of docs) {
    const createdBy = s(a.createdBy);
    if (!["recaller", "campaign", "predecessor"].includes(createdBy)) continue;
    const startMs = a.start?.toMillis?.() ?? (a.start ? new Date(a.start).getTime() : 0);
    if (!startMs || startMs < oldest) continue;
    if (startMs > now + 7 * 86400000) continue; // not due yet
    const phone = s(a.patient?.mobilePhoneNumber) || s(a.patient?.phoneNumber);
    if (!phone || !s(a.patient?.id)) continue;
    out.push({
      source: "recall",
      recallAppointmentId: a.id,
      patientId: s(a.patient.id),
      name: `${s(a.patient.firstName)} ${s(a.patient.lastName)}`.trim(),
      phone,
      phoneNorm: normalizePhone(phone),
      visitMotiveId: s(a.visitMotive?.id),
      visitMotiveName: s(a.visitMotive?.name),
      durationMin: durationOfMotive(booking, s(a.visitMotive?.id), s(a.visitMotive?.name)),
      calendarId: s(a.calendar?.id) || null,
      doctorName: s(a.calendar?.name),
      overdueDays: Math.max(0, Math.round((now - startMs) / 86400000)),
      remindLaterCount: Number(a.remindLaterCount) || 0,
      alreadyCalled: false,
      // No explicit per-patient consent flags on the appointment doc — the
      // human sees "consent unknown" on the list and decides.
      consent: { sms: null, reminder: null },
      reason: `Fälliger Recall${a.visitMotive?.name ? ` — ${s(a.visitMotive.name)}` : ""} (geplant ${new Date(startMs).toLocaleDateString("de-DE")})`,
    });
  }
  return out;
}

/** Patients contacted via Lisa within the throttle window (brain = history). */
async function recentlyContactedKeys(clientId) {
  const since = Date.now() - THROTTLE_DAYS * 86400000;
  const events = await queryRecent(clientId, since, 1000).catch(() => []);
  const keys = new Set();
  for (const e of events) {
    if (e.channel !== "lisa_call" && e.channel !== "lisa_sms") continue;
    if (e.subject?.patientId) keys.add(`p:${e.subject.patientId}`);
    const ref = normalizePhone(e.counterparty?.ref || "");
    if (ref) keys.add(`t:${ref}`);
  }
  return keys;
}

/**
 * Gate + rank candidates for ONE gap. Pure.
 * Gate: fits duration, matches Behandler (or unbound), not throttled, not
 * already called in its campaign, not freshly booked over this very process
 * (aus dem Bucket gestrichen), not a spam risk (Kontakt-Zaehler, Chef
 * 28.07.2026). Rank: most overdue first, then FEWEST recent contacts (Spam-
 * Schutz), then proven responders (booked), then higher-value (longer)
 * treatments, then reachable-with-consent first.
 */
export function rankCandidatesForGap(candidates, gap, { calendarId, throttled = new Set(), ignorePhoneThrottle = false, ignoreOutreachGates = false } = {}) {
  const fits = candidates.filter((c) => {
    if (c.durationMin > gap.minutes) return false;
    if (c.calendarId && calendarId && c.calendarId !== calendarId) return false;
    if (c.alreadyCalled) return false;
    if (throttled.has(`p:${c.patientId}`)) return false;
    if (!ignorePhoneThrottle && c.phoneNorm && throttled.has(`t:${c.phoneNorm}`)) return false;
    // Kontakt-Zaehler-Tore (im Demo-Modus aus, damit Testlaeufe wiederholbar
    // bleiben): frisch ueber diese Strecke gebucht -> raus aus dem Bucket;
    // oft kontaktiert ohne je zu buchen -> Spam-Gefahr, aussortieren.
    if (!ignoreOutreachGates && c.stats?.suppressed) return false;
    if (!ignoreOutreachGates && c.stats?.spamRisk) return false;
    return true;
  });
  const consentScore = (c) => (c.consent?.sms === true || c.consent?.reminder === true ? 1 : 0);
  fits.sort((a, b) =>
    (b.overdueDays - a.overdueDays) ||
    ((a.stats?.recent || 0) - (b.stats?.recent || 0)) ||
    ((b.stats?.booked || 0) - (a.stats?.booked || 0)) ||
    (b.durationMin - a.durationMin) ||
    (consentScore(b) - consentScore(a))
  );
  // One patient appears once per list (dedupe across sources, campaign first).
  const seen = new Set();
  const unique = [];
  for (const c of fits) {
    const key = c.patientId || c.phoneNorm || c.name;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  return unique.slice(0, MAX_CANDIDATES_PER_LIST);
}

// ----------------------------------------------------------------------------
// Call-list cases (Gesprächsaufträge) — idempotent, approval-first
// ----------------------------------------------------------------------------

export function gapCaseId(clientId, calendarId, date, startMin) {
  const h = createHash("sha256").update(`${clientId}|${calendarId}|${date}|${startMin}`).digest("hex").slice(0, 20);
  return `gapfill_${h}`;
}

/** Neutral, DSGVO-safe voicemail script — never any medical detail. */
export function buildVoicemailScript(booking) {
  const praxis = s(booking?.practiceName) || "Ihrer Praxis";
  const phone = s(booking?.practicePhone);
  return `Guten Tag, hier ist Lisa von ${praxis}. Wir haben ein Anliegen zu Ihrem nächsten Termin. Bitte rufen Sie uns zurück${phone ? ` unter ${phone}` : ""}. Vielen Dank und einen schönen Tag.`;
}

async function upsertCallListCase(clientId, { date, calendar, gap, candidates, booking, promptTag }) {
  const caseId = gapCaseId(clientId, calendar.id, date, gap.startMin);
  const ref = masCollection(clientId, "mas_cases").doc(caseId);
  const snap = await ref.get();

  const callList = {
    kind: "gap_fill",
    date,
    calendarId: calendar.id,
    calendarName: s(calendar.name),
    slot: { startMin: gap.startMin, endMin: gap.endMin, minutes: gap.minutes, label: gap.label },
    candidates,
    voicemailScript: buildVoicemailScript(booking),
    promptVersionTag: promptTag,
    approvedBy: null,
    approvedAt: null,
    refreshedAt: Date.now(),
  };

  if (!snap.exists) {
    await createCase(clientId, {
      id: caseId,
      title: `Anrufliste: ${s(calendar.name)} ${date} ${gap.label}`,
      topic: "appointment",
      subject: { name: `Lückenfüller ${s(calendar.name)}` },
      status: CASE_STATUS.WAITING_APPROVAL,
      assignee: "Lisa",
      createdBy: "Clara",
      updates: [{
        by: "Clara",
        kind: "note",
        text: `Lücke erkannt: ${gap.label} (${gap.minutes} min) bei ${s(calendar.name)} am ${date}. ${candidates.length} Kandidat(en) vorgeschlagen — wartet auf Freigabe der Anrufliste (${promptTag}).`,
      }],
    });
    await ref.update({ callList });
    return { caseId, created: true };
  }

  const existing = snap.data();
  // Only a still-unapproved list is refreshed; approved/closed lists are facts.
  if (existing.status === CASE_STATUS.WAITING_APPROVAL) {
    await ref.update({ callList, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { caseId, created: false, refreshed: true };
  }
  return { caseId, created: false, refreshed: false, status: existing.status };
}

/**
 * The coach run: scan [date .. date+horizonDays-1], compute real gaps per
 * Behandler, gate+rank candidates, upsert one approval-pending call-list case
 * per gap. Returns everything the voice/UI layer needs.
 */
export async function runGapFill(clientId, { date, horizonDays = 1, demoOnly = false, calendarId = null } = {}) {
  const startDate = s(date) || todayBerlin();
  const booking = await loadBooking(clientId).catch(() => null);
  if (!booking?.locationId) return { ok: false, reason: "no_booking_config", gaps: [], callLists: [] };
  const locationId = booking.locationId;
  // Persoenlicher Assistent (17.07.2026): Ist ein Kalender vorgegeben (der des
  // angemeldeten Behandlers), werden NUR dessen Luecken gescannt. Ohne Vorgabe
  // bleibt das Verhalten praxisweit (alle Kalender). Vorfall: Clara meldete zu
  // viele freie Luecken, weil sie ueber ALLE Behandler-Kalender scannte (leerer
  // Kollegen-Kalender = ganzer Tag "frei").
  const onlyCalId = s(calendarId) || null;

  const [allCandidatesRoh, throttled, prompt] = await Promise.all([
    Promise.all([
      campaignCandidates(clientId, locationId, booking, { demoOnly }),
      demoOnly ? Promise.resolve([]) : recallCandidates(clientId, locationId, booking),
    ]).then(([a, b]) => [...a, ...b]),
    recentlyContactedKeys(clientId),
    getActivePrompt(clientId, "lisa"),
  ]);

  // Kontakt-Zaehler anheften (Chef 28.07.2026): Gesamtkontakte + Erfolge pro
  // Patient. Faehrt als Momentaufnahme am Kandidaten mit in die Anrufliste —
  // Anzeige (hochgestellte Zahlen), Ranking und Spam-Wache lesen daraus.
  const statsMap = await loadStatsMap(clientId, allCandidatesRoh.map((c) => c.patientId));
  const allCandidates = allCandidatesRoh.map((c) => {
    const st = statsMap.get(s(c.patientId));
    if (!st) return c;
    return {
      ...c,
      stats: {
        contacts: st.contacts,
        booked: st.booked,
        recent: contactsInWindow(st),
        suppressed: isBookedSuppressed(st),
        spamRisk: isSpamRisk(st),
      },
    };
  });

  const gaps = [];
  const callLists = [];
  for (let i = 0; i < Math.max(1, Math.min(7, horizonDays)); i++) {
    const d = new Date(`${startDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const weekday = weekdayIndexOf(day);

    const dayData = await getDayAppointments(clientId, { date: day });
    if (!dayData.ok) continue;

    const scopedCalendars = (booking.calendars || []).filter((c) => !onlyCalId || c.id === onlyCalId);
    for (const calendar of scopedCalendars) {
      const hours = await loadOpeningHoursForCalendar(clientId, locationId, calendar.id);
      const wd = workingDayOf(hours, weekday);
      if (!wd) continue;

      const busy = dayData.appointments
        // Belegt = Termine dieses Kalenders PLUS praxisweite (kalenderlose)
        // Abwesenheiten (Feiertag/Praxis-Sperre gelten fuer jeden Kalender).
        // Ohne Letzteres wertete Clara eine praxisweite Abwesenheit als frei.
        .filter((a) => a.calendarId === calendar.id || (a.isAbsence && !a.calendarId))
        .filter((a) => a.isAbsence || (a.status !== "needsConfirmation" && a.status !== "declined"))
        .map((a) => ({ startMin: berlinMinutesOf(a.startMs), endMin: berlinMinutesOf(a.endMs || a.startMs) }));

      for (const gap of computeGapWindows(wd, busy)) {
        const candidates = rankCandidatesForGap(allCandidates, gap, {
          calendarId: calendar.id,
          throttled,
          ignorePhoneThrottle: demoOnly,
          // Demo-Modus: Zaehler-Tore aus, damit der Testlauf mit den geseedeten
          // Patienten beliebig wiederholbar bleibt (wie beim Konversions-Flag).
          ignoreOutreachGates: demoOnly,
        });
        gaps.push({ date: day, calendarId: calendar.id, calendarName: s(calendar.name), ...gap, candidateCount: candidates.length });
        if (!candidates.length) continue;
        const upsert = await upsertCallListCase(clientId, { date: day, calendar, gap, candidates, booking, promptTag: prompt.ok ? prompt.tag : "pv:lisa:0" });
        callLists.push({ ...upsert, date: day, calendarName: s(calendar.name), slot: gap.label, candidates: candidates.length });
      }
    }
  }

  return { ok: true, date: startDate, demoOnly: !!demoOnly, gaps, callLists, candidatesTotal: allCandidates.length };
}

/** UI read-model: pending + approved call lists (active gap-fill cases). */
export async function gapFillOverview(clientId) {
  const cases = await listCases(clientId, { activeOnly: true, assignee: "Lisa", limit: 100 });
  const gapCases = cases.filter((c) => c.id.startsWith("gapfill_") && c.callList);
  return {
    pending: gapCases.filter((c) => c.status === CASE_STATUS.WAITING_APPROVAL).map(toOverviewItem),
    approved: gapCases.filter((c) => c.status !== CASE_STATUS.WAITING_APPROVAL).map(toOverviewItem),
  };
}

function toOverviewItem(c) {
  return {
    caseId: c.id,
    title: c.title,
    status: c.status,
    date: c.callList?.date,
    calendarName: c.callList?.calendarName,
    slot: c.callList?.slot,
    candidates: c.callList?.candidates || [],
    voicemailScript: c.callList?.voicemailScript,
    promptVersionTag: c.callList?.promptVersionTag,
    approvedBy: c.callList?.approvedBy || null,
    approvedAt: c.callList?.approvedAt || null,
  };
}

/**
 * Approve ONE call list (per your decision: each list individually). Audited:
 * who approved, how many candidates, under which Lisa prompt version.
 */
export async function approveCallList(clientId, caseId, { by } = {}) {
  const ref = masCollection(clientId, "mas_cases").doc(s(caseId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const c = snap.data();
  if (!c.callList) return { ok: false, reason: "not_a_call_list" };
  if (c.status !== CASE_STATUS.WAITING_APPROVAL) return { ok: false, reason: "not_pending", status: c.status };

  const who = s(by) || "Team";
  await ref.update({
    "callList.approvedBy": who,
    "callList.approvedAt": Date.now(),
  });
  await setStatus(clientId, c.id, CASE_STATUS.IN_PROGRESS, { by: who, note: "" });
  await addUpdate(clientId, c.id, {
    by: who,
    kind: "note",
    text: `Anrufliste freigegeben: ${c.callList.candidates?.length || 0} Kandidat(en), Slot ${c.callList.slot?.label || ""} bei ${c.callList.calendarName || ""}. Gilt Prompt-Version ${c.callList.promptVersionTag || "pv:lisa:0"}. Lisa darf kontaktieren, sobald der Anrufkanal aktiv ist.`,
  });
  return { ok: true, caseId: c.id, approvedBy: who, candidates: c.callList.candidates?.length || 0 };
}

// Lücken-Radar mit Euro-Zahl (Jawdropper ③, 12.06.2026): Kalenderlücken in
// Umsatzpotenzial übersetzen. Kalkulationssatz konfigurierbar über
// MAS_GAP_HOUR_RATE_EUR (Entscheidung Chef: 300 EUR/h Startwert).
const GAP_HOUR_RATE_EUR = Number(process.env.MAS_GAP_HOUR_RATE_EUR || 300);

/** Summe freier Behandlungsminuten eines Coach-Laufs -> grobe Euro-Schätzung. */
export function gapRevenuePotential(run) {
  const minutes = (run?.gaps || []).reduce((sum, g) => sum + (Number(g.minutes) || 0), 0);
  // Auf 10er runden — eine Schätzung, die auf den Euro genau klingt, wäre
  // Pseudo-Präzision (und genau der numerische Ton, den der Chef nicht will).
  const euro = Math.round(((minutes / 60) * GAP_HOUR_RATE_EUR) / 10) * 10;
  return { minutes, euro, rate: GAP_HOUR_RATE_EUR };
}

/** Gesprochener Euro-Satz fürs Lücken-Radar (auch im Morgen-Moment genutzt). */
export function spokenGapEuro(run) {
  const { minutes, euro } = gapRevenuePotential(run);
  if (!minutes || euro < 50) return "";
  const hours = minutes >= 90 ? `${(minutes / 60).toFixed(1).replace(".", ",")} Stunden` : `${minutes} Minuten`;
  return pickPhrase([
    `Zusammen sind das ${hours} freie Behandlungszeit — grob ${euro} Euro Umsatzpotenzial, wenn wir sie füllen.`,
    `Unterm Strich liegen da etwa ${euro} Euro auf dem Tisch — ${hours}, die wir füllen könnten.`,
    `Das entspricht ungefähr ${euro} Euro offenem Potenzial über ${hours}.`,
  ]);
}

/** Spoken German summary of a coach run (for /tools/gap-briefing). */
export function buildSpokenGapBriefing(run, { operatorName } = {}) {
  const hi = operatorName ? `${operatorName}, ` : "";
  if (!run?.ok) return `${hi}der Lückenfüller ist nicht konfiguriert — es fehlt die Buchungskonfiguration.`;
  if (!run.gaps.length) return `${hi}im Kalender sind keine nennenswerten Lücken — sehr gut.`;

  const parts = [];
  const total = run.gaps.length;
  const withCands = run.gaps.filter((g) => g.candidateCount > 0).length;
  parts.push(`${hi}ich habe ${total} ${total === 1 ? "Lücke" : "Lücken"} gefunden, davon ${withCands} mit passenden Recall-Kandidaten.`);
  // Umsatzzahlen werden bewusst NICHT genannt (O-Ton Chef 12.06.2026:
  // "umsatzzahlen komplett NICHT nennen" — das wird ein separates Element
  // mit Lena und Sophie). gapRevenuePotential bleibt dafür als API erhalten.
  for (const g of run.gaps.slice(0, 4)) {
    parts.push(`${g.calendarName}: ${g.label} (${g.minutes} Minuten)${g.candidateCount ? ` — ${g.candidateCount} Kandidat${g.candidateCount === 1 ? "" : "en"}` : " — kein passender Kandidat"}.`);
  }

  // Kurzfristigkeits-Einschätzung (Wunsch Chef 16.06.2026): liegen die Lücken
  // mit Kandidaten praktisch alle sehr nah (z. B. heute), ist klassischer Recall
  // meist zu knapp — dann gezieltes Einbestellen anbieten statt Massen-Recall.
  const candGaps = run.gaps.filter((g) => g.candidateCount > 0);
  const allCandShort = candGaps.length > 0 && candGaps.every((g) => isShortNoticeGap(g));
  const anyShort = run.gaps.some((g) => isShortNoticeGap(g));
  if (allCandShort || (!candGaps.length && anyShort)) {
    parts.push("Die Lücken liegen allerdings sehr kurzfristig — für einen klassischen Recall ist das oft zu knapp.");
    parts.push("Wenn Sie jemand Bestimmten einbestellen möchten, nenne mir einfach den Namen, dann lasse ich ihn von Lisa anrufen.");
  }

  const lists = run.callLists?.length || 0;
  if (lists) {
    parts.push(`${lists} Anrufliste${lists === 1 ? " wartet" : "n warten"} auf Ihre Freigabe im Monitor.`);
    parts.push("Wenn Sie wissen möchten, wen ich vorschlage, sag: wer sind die Kandidaten.");
  }
  return parts.join(" ");
}

/** "seit 245 Tagen" klingt technisch — ab zwei Monaten in Monaten sprechen. */
function faelligSeit(overdueDays) {
  const d = Number(overdueDays) || 0;
  if (d <= 0) return "";
  if (d < 60) return `seit ${d} Tagen fällig`;
  const monate = Math.round(d / 30);
  return `seit etwa ${monate} Monaten fällig`;
}

/**
 * Themen-Schluessel eines Kandidaten: Kampagnen-Bucket oder faelliger Recall,
 * mit dem Behandlungsgrund als Zweck ("wen Sie zu welchem Zweck anrufen").
 */
function kandidatThema(c) {
  const motiv = s(c.visitMotiveName);
  if (c.campaignName) {
    return `aus der Kampagne »${s(c.campaignName)}«${motiv ? ` — Zweck: ${motiv}` : ""}`;
  }
  return motiv ? `aus dem fälligen Recall — Zweck: ${motiv}` : "aus dem fälligen Recall";
}

/** Kontakt-Zaehler nur aussprechen, wenn er etwas zu sagen hat (Spam-Blick). */
function zaehlerSatz(stats) {
  const c = Number(stats?.contacts) || 0;
  const b = Number(stats?.booked) || 0;
  if (c < 2) return "";
  const mal = c === 2 ? "zweimal" : c === 3 ? "dreimal" : `${c}-mal`;
  if (b > 0) return `, schon ${mal} kontaktiert, ${b === 1 ? "einmal" : `${b}-mal`} hat es geklappt`;
  return `, schon ${mal} kontaktiert, bisher ohne Termin`;
}

/**
 * Gesprochene Aufzählung der konkreten Kandidaten der offenen Anruflisten —
 * beantwortet die Chef-Nachfrage "welche Patienten sind das denn?". Seit
 * 28.07.2026 nach THEMA gruppiert (Bucket/Behandlungsgrund) mit Zweck des
 * Anrufs und Kontakt-Zaehler-Hinweis, damit der Chef sieht, wen er zu welchem
 * Zweck kontaktieren laesst — und wo Spam-Gefahr droht.
 */
export async function buildSpokenGapCandidates(clientId, { date } = {}) {
  const ov = await gapFillOverview(clientId).catch(() => ({ pending: [], approved: [] }));
  const day = date ? s(date) : null;
  const lists = [...(ov.pending || []), ...(ov.approved || [])].filter((l) => !day || l.date === day);
  if (!lists.length) {
    return "Aktuell warten keine Anruflisten mit Kandidaten. Sage Recall starten, dann suche ich passende Patienten.";
  }
  // Mehrere Luecken teilen sich oft DIESELBEN Kandidaten (gleicher Tag,
  // gleicher Kalender) — die Namen werden dann nur EINMAL vorgelesen und die
  // weiteren Luecken kurz benannt, statt sechsmal dieselbe Liste zu sprechen
  // (Live-Befund 28.07.2026: 6 Listen x 8 Namen = unzumutbare Ansage).
  const parts = [];
  const gesprochen = new Map(); // Kandidaten-Schluessel -> Index in parts
  const auchFuer = new Map();   // Index in parts -> weitere Slot-Labels
  for (const l of lists.slice(0, 8)) {
    const cands = (l.candidates || []).slice(0, MAX_CANDIDATES_PER_LIST);
    if (!cands.length) continue;
    const wo = `${l.slot?.label || "die Lücke"}${l.calendarName ? ` bei ${l.calendarName}` : ""}`;

    const kandKey = cands.map((c) => s(c.name)).sort().join("|");
    if (gesprochen.has(kandKey)) {
      const idx = gesprochen.get(kandKey);
      auchFuer.set(idx, [...(auchFuer.get(idx) || []), wo]);
      continue;
    }

    // Nach Thema buendeln (Kampagne vor Recall, Reihenfolge der Liste bleibt).
    const gruppen = new Map();
    for (const c of cands) {
      const key = kandidatThema(c);
      if (!gruppen.has(key)) gruppen.set(key, []);
      gruppen.get(key).push(c);
    }
    const saetze = [];
    for (const [thema, gruppe] of gruppen) {
      const namen = gruppe.map((c) => {
        const st = [faelligSeit(c.overdueDays), zaehlerSatz(c.stats).replace(/^, /, "")]
          .filter(Boolean).join(", ");
        return `${s(c.name) || "Unbekannt"}${st ? ` (${st})` : ""}`;
      }).join("; ");
      saetze.push(`${thema}: ${namen}`);
    }
    gesprochen.set(kandKey, parts.length);
    parts.push(`Für ${wo} schlage ich vor — ${saetze.join(". ")}.`);
  }
  for (const [idx, orte] of auchFuer) {
    const genannt = orte.slice(0, 3).join(", ");
    const rest = orte.length - 3;
    parts[idx] += ` Dieselben Kandidaten passen auch für ${genannt}${rest > 0 ? ` und ${rest} weitere Lücke${rest === 1 ? "" : "n"}` : ""}.`;
  }
  if (!parts.length) return "Zu den offenen Lücken sind aktuell keine konkreten Kandidaten hinterlegt.";
  return `Das sind die vorgeschlagenen Patienten. ${parts.join(" ")} Sag Recall freigeben, wenn Lisa sie kontaktieren soll — oder nenne mir jemanden, den ich gezielt einbestellen lassen soll.`;
}

/**
 * Karten-Daten fuer die offenen Anruflisten (eine Karte je Liste): Kandidaten
 * mit Anzeige-Namen inkl. hochgestellter Kontakt-Zaehler, Thema, Faelligkeit
 * und Kanalwort. Die Karte selbst baut karten.karteRecallKandidaten (rein).
 */
export async function gapCandidateCardData(clientId, { date } = {}) {
  const ov = await gapFillOverview(clientId).catch(() => ({ pending: [], approved: [] }));
  const day = date ? s(date) : null;
  const lists = [...(ov.pending || []), ...(ov.approved || [])].filter((l) => !day || l.date === day);
  return lists.slice(0, 4).map((l) => ({
    slotLabel: l.slot?.label || "",
    calendarName: l.calendarName || "",
    date: l.date || "",
    status: l.status === CASE_STATUS.WAITING_APPROVAL ? "wartet auf Freigabe" : "freigegeben",
    candidates: (l.candidates || []).slice(0, MAX_CANDIDATES_PER_LIST).map((c) => ({
      anzeigeName: nameMitZaehler(c.name, c.stats),
      name: s(c.name) || "Unbekannt",
      thema: c.campaignName ? `Kampagne »${s(c.campaignName)}«` : (s(c.visitMotiveName) || "Recall"),
      faellig: faelligSeit(c.overdueDays),
      // Kanalwort wie channelFor (recallCoach): nur-SMS-Consent -> SMS.
      viaWort: c.consent?.sms === true && c.consent?.reminder !== true ? "SMS" : "Anruf",
      stats: c.stats || null,
    })),
  }));
}
