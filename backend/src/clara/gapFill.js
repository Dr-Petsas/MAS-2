import { createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { loadBooking, ensureBerlinTz, resolveCalendar } from "./booking.js";
import { getOperator } from "./sessions.js";
import { getDayAppointments, todayBerlin } from "./daySchedule.js";
import { createCase, listCases, addUpdate, setStatus } from "../brain/caseStore.js";
import { CASE_STATUS } from "../brain/cases.js";
import { getActivePrompt } from "../brain/livingPrompt.js";
import { queryRecent } from "../brain/eventStore.js";
import { normalizePhone } from "./callerLookup.js";
import { pick as pickPhrase } from "./variation.js";
import { loadStatsMap, contactsInWindow, isBookedSuppressed, isSpamRisk, nameMitZaehler } from "./outreachStats.js";
import { log } from "../log.js";

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
export const MAX_CANDIDATES_PER_LIST = Number(process.env.MAS_GAP_MAX_CANDIDATES || 8);
// Puffer (Chef 28.07.2026): In der Liste liegen DEUTLICH mehr Kandidaten, als
// gesprochen/kontaktiert werden — wischt der Chef einen Patienten weg, rueckt
// sofort der naechste aus dem Puffer nach. Lisa kontaktiert weiterhin nur die
// obersten MAX_CANDIDATES_PER_LIST aktiven Kandidaten.
const MAX_CANDIDATES_STORED = Number(process.env.MAS_GAP_MAX_STORED || 24);
// Vorlaufzeit, ab der eine Lücke noch sinnvoll per Recall zu füllen ist. Liegt
// eine Lücke näher (z. B. heute), ist klassischer Recall meist zu kurzfristig —
// Clara weist darauf hin und bietet stattdessen das gezielte Einbestellen an.
const RECALL_MIN_LEAD_HOURS = Number(process.env.MAS_RECALL_MIN_LEAD_HOURS || 16);
const THROTTLE_DAYS = 14; // no patient is proposed twice within this window
// Chef 28.07.2026 ("meine Buckets haben hunderte wenn nicht tausende
// Patienten"; "Kons sind insgesamt ueber 1000, ueber alle Kalender"):
// Live lagen 3072 virtuelle Recalls im Bestand, gelesen wurden aber nur 300
// unsortierte. Der Bestand wird jetzt KOMPLETT paginiert gelesen (projiziert,
// mit Kurzzeit-Cache). Zweiter Fresser war die Altersgrenze: 1.808 der 3.072
// Recalls sind aelter als 3 Jahre ueberfaellig (darunter 788 Kons) — die
// Grenze steht deshalb auf 10 Jahren (praktisch: kein Ausschluss; alt heisst
// nicht wertlos, die Spam-Wache und das Ranking schuetzen vor Unfug).
const RECALL_LOOKBACK_DAYS = Number(process.env.MAS_RECALL_LOOKBACK_DAYS || 3650);
const RECALL_INVENTORY_CACHE_MS = Number(process.env.MAS_RECALL_INVENTORY_CACHE_MS || 10 * 60 * 1000);
const RECALL_INVENTORY_MAX = Number(process.env.MAS_RECALL_INVENTORY_MAX || 8000);
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
        bucketKey: bucketKeyOf(s(camp.visitMotiveName) || s(camp.name)),
        fachbereich: fachbereichOf(s(camp.visitMotiveName) || s(camp.name)),
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

// Kurzzeit-Cache fuer das Recall-Inventar: Ein Voll-Scan liest tausende Docs —
// innerhalb weniger Minuten (Scan + Overview + Sprach-Rueckfrage) aendert sich
// der Bestand nicht nennenswert.
const recallInventoryCache = new Map(); // clientId -> { at, rows }

/** Cache leeren (Tests). */
export function clearRecallInventoryCache() {
  recallInventoryCache.clear();
}

/**
 * ALLE virtuellen Recalls (needsConfirmation) der Location paginiert lesen —
 * projiziert auf die benoetigten Felder, damit tausende Docs bezahlbar sind.
 * Vorher las der Code 300 unsortierte Docs (Chef: "meine Buckets haben
 * hunderte wenn nicht tausende Patienten" — live 3072).
 */
async function loadRecallInventory(clientId, locationId) {
  const cached = recallInventoryCache.get(clientId);
  if (cached && Date.now() - cached.at < RECALL_INVENTORY_CACHE_MS) return cached.rows;
  // Stale-while-revalidate (Chef 28.07.2026 "am schlimmsten ist der lag"):
  // Ist der Cache nur ABGELAUFEN (nicht leer), liefern wir sofort den alten
  // Stand und erneuern im Hintergrund — der Voll-Scan (tausende Docs) blockiert
  // nie wieder eine Sprach-Antwort oder den Monitor. Recalls aendern sich
  // langsam; eine Minuten-alte Sicht ist fuer Listen-Bildung unkritisch.
  if (cached?.rows?.length) {
    if (!cached.refreshing) {
      cached.refreshing = true;
      scanRecallInventory(clientId, locationId)
        .catch(() => {})
        .finally(() => {
          const c = recallInventoryCache.get(clientId);
          if (c) c.refreshing = false;
        });
    }
    return cached.rows;
  }
  return scanRecallInventory(clientId, locationId);
}

/** Der eigentliche Voll-Scan (siehe loadRecallInventory). */
async function scanRecallInventory(clientId, locationId) {
  const rows = [];
  const base = db.collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments")
    .where("status", "==", "needsConfirmation")
    .select("createdBy", "start", "remindLaterCount",
      "patient.id", "patient.firstName", "patient.lastName",
      "patient.mobilePhoneNumber", "patient.phoneNumber",
      "visitMotive.id", "visitMotive.name",
      "calendar.id", "calendar.name")
    .orderBy("__name__")
    .limit(500);
  let cursor = null;
  while (rows.length < RECALL_INVENTORY_MAX) {
    const snap = await (cursor ? base.startAfter(cursor) : base).get();
    if (snap.empty) break;
    for (const d of snap.docs) rows.push({ id: d.id, ...d.data() });
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }
  recallInventoryCache.set(clientId, { at: Date.now(), rows });
  return rows;
}

/** Bucket-Schluessel eines Recalls: das Behandlungs-Thema (visitMotive). */
export function bucketKeyOf(visitMotiveName) {
  return s(visitMotiveName).toLowerCase().replace(/\s+/g, " ").trim() || "sonstiges";
}

/**
 * Fachbereich aus dem Motiv-Namen (Chef 28.07.2026): Praxis-Abkuerzungen
 * KCH/PRO/IMP/ZE nicht vorlesen — sprachlich Prophylaxe, Kons, ZE, Implantat.
 * Fein-Buckets bleiben intern; die Sprache arbeitet auf Fachbereich.
 */
export function fachbereichOf(visitMotiveName) {
  const q = s(visitMotiveName).toLowerCase();
  if (!q) return "sonstiges";
  if (/\b(pro|pzr|prophy|prophylaxe|zahnreinigung)\b/.test(q) || q.startsWith("pro ")) return "prophylaxe";
  if (/\b(ze|zahnersatz|prothese|krone|bruecke|brücke)\b/.test(q) || q.startsWith("ze ")) return "ze";
  if (/\b(imp|implant|implantat)\b/.test(q) || q.startsWith("imp ")) return "implantat";
  if (/\b(kch|kons|konservierend|chirurgie|kontrolle|erstuntersuch|neupatient)\b/.test(q) || q.startsWith("kch ")) return "kons";
  return "sonstiges";
}

/** Gesprochener Fachbereichs-Name — nie KCH/PRO/IMP. */
export function spokenFachbereich(fb) {
  switch (s(fb)) {
    case "prophylaxe": return "Prophylaxe";
    case "kons": return "Kons";
    case "ze": return "ZE";
    case "implantat": return "Implantat";
    default: return "";
  }
}

/**
 * Motiv-Label sprechbar machen: "KCH Kontrolluntersuchung" -> "Kontrolluntersuchung",
 * "PRO professionelle Zahnreinigung" -> "professionelle Zahnreinigung".
 */
export function spokenMotiveLabel(raw) {
  let t = s(raw).replace(/\s+/g, " ").trim();
  if (!t) return "";
  t = t.replace(/^(kch|pro|imp|ze)\s+/i, "");
  t = t.replace(/\bKCH\b/gi, "Kons").replace(/\bPRO\b/gi, "Prophylaxe").replace(/\bIMP\b/gi, "Implantat");
  return t;
}

async function recallCandidates(clientId, locationId, booking) {
  const out = [];
  let docs = [];
  try {
    docs = await loadRecallInventory(clientId, locationId);
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
      bucketKey: bucketKeyOf(a.visitMotive?.name),
      fachbereich: fachbereichOf(a.visitMotive?.name),
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
  return unique.slice(0, MAX_CANDIDATES_STORED);
}

/** Nicht weggewischte Kandidaten einer Liste (Chef entfernt per Swipe). */
export function aktiveKandidaten(list) {
  return (list?.candidates || []).filter((c) => c && !c.removed);
}

/**
 * Kalender-Grenze des Lueckenfuellers (Chef 28.07.2026): Diese Clara gehoert
 * EINEM Behandler (gekoppeltes Handy = Operator). Ist sein Kalender
 * aufloesbar, ist er das EINZIGE, was der Lueckenfueller scannt und anzeigt —
 * Kollegen (z. B. Dr. Patrikis) bedienen ihre eigene Clara ueber ihr eigenes
 * Konto. Ohne aufloesbaren Operator (kein Pairing, andere Mandanten) bleibt
 * das bisherige Verhalten (praxisweit bzw. expliziter Parameter) erhalten.
 */
export async function gapFillCalendarBoundary(clientId) {
  try {
    const op = await getOperator(clientId);
    const name = s(op?.doctorName || op?.name);
    if (!name) return null;
    const booking = await loadBooking(clientId).catch(() => null);
    const cal = booking ? resolveCalendar(booking, name) : null;
    return cal?.id || null;
  } catch {
    return null;
  }
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

// Exportiert fuer scripts/test-listen-pflege.mjs (Reopen-Pin 28.07.2026) —
// produktiv ruft nur runGapFill hier hinein.
export async function upsertCallListCase(clientId, { date, calendar, gap, candidates, booking, promptTag, bucket = null, bucketExplicit = false }) {
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
    // Themen-Bucket, aus dem diese Liste geformt wurde (null = alle Themen).
    bucketKey: s(bucket?.key) || null,
    bucketLabel: s(bucket?.label) || null,
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
  // Vorfall 28.07.2026 15:24: Die Mittwoch-Liste war um 13:07 schon einmal
  // freigegeben (in_progress). Der neue Themen-Scan praesentierte sie wie
  // frisch ("24 Kandidaten ... Recall freigeben"), aber die Freigabe fand
  // nichts mehr ("Es wartet gerade keine Anrufliste") — Sackgasse am Telefon.
  // Darum: Eine AUSDRUECKLICHE Themenwahl des Chefs eroeffnet auf einer
  // bereits freigegebenen/geschlossenen Liste eine NEUE Runde, die wieder
  // auf Freigabe wartet. Automatische Scans lassen laufende Listen in Ruhe.
  if (existing.status !== CASE_STATUS.WAITING_APPROVAL && bucketExplicit) {
    const removedIds = new Set(
      (existing.callList?.candidates || [])
        .filter((c) => c?.removed && c.patientId)
        .map((c) => s(c.patientId))
    );
    if (removedIds.size) {
      callList.candidates = callList.candidates.map((c) =>
        removedIds.has(s(c.patientId))
          ? { ...c, removed: true, removedBy: "uebernommen", removedAt: Date.now() }
          : c);
    }
    await ref.update({
      callList,
      status: CASE_STATUS.WAITING_APPROVAL,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await addUpdate(clientId, caseId, {
      by: "Clara",
      kind: "note",
      text: `Neue Recall-Runde${s(bucket?.label) ? ` (Thema ${s(bucket.label)})` : ""} für dieselbe Lücke — die frühere Freigabe ist abgearbeitet, die Liste wartet wieder auf Freigabe.`,
    }).catch(() => {});
    return { caseId, created: false, refreshed: true, reopened: true };
  }
  // Only a still-unapproved list is refreshed; approved/closed lists are facts.
  if (existing.status === CASE_STATUS.WAITING_APPROVAL) {
    // Hat das Team die Liste auf ein Thema gestellt, ueberschreibt ein
    // AUTOMATISCHER (themenloser) Scan sie NICHT — die Bucket-Wahl ist eine
    // Chef-Entscheidung. Eine NEUE ausdrueckliche Wahl (Stimme/Monitor,
    // bucketExplicit) darf die Liste dagegen jederzeit umformen, auch zurueck
    // auf "alle Themen" (Chef 28.07.2026: erst Implantat, dann doch Kons).
    const exBucket = s(existing.callList?.bucketKey);
    if (exBucket && exBucket !== s(bucket?.key) && !bucketExplicit) {
      return { caseId, created: false, refreshed: false, bucketKept: exBucket, status: existing.status };
    }
    // Vom Chef weggewischte Kandidaten (removed) bleiben beim Auffrischen
    // draussen — sonst kaeme jeder entfernte Patient beim naechsten Scan zurueck.
    const removedIds = new Set(
      (existing.callList?.candidates || [])
        .filter((c) => c?.removed && c.patientId)
        .map((c) => s(c.patientId))
    );
    if (removedIds.size) {
      callList.candidates = callList.candidates.map((c) =>
        removedIds.has(s(c.patientId))
          ? { ...c, removed: true, removedBy: "uebernommen", removedAt: Date.now() }
          : c);
    }
    await ref.update({ callList, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { caseId, created: false, refreshed: true };
  }
  return { caseId, created: false, refreshed: false, status: existing.status };
}

// ----------------------------------------------------------------------------
// Listen-Pflege (Chef 28.07.2026: "27.7. ist in der Vergangenheit, 8-15 Uhr
// ist unmoeglich, da steht eine Abwesenheit") — Listen verfallen von selbst.
// ----------------------------------------------------------------------------

/** Ende der Luecke als Zeitstempel (Berlin). Unparsebar -> 0 (nie verfallen). */
function listSlotEndMs(l) {
  const date = s(l?.callList?.date || l?.date);
  const endMin = Number(l?.callList?.slot?.endMin ?? l?.slot?.endMin);
  if (!date || !Number.isFinite(endMin)) return 0;
  const hh = String(Math.floor(endMin / 60)).padStart(2, "0");
  const mm = String(endMin % 60).padStart(2, "0");
  const t = new Date(ensureBerlinTz(`${date}T${hh}:${mm}:00`)).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Schon jemand kontaktiert? Dann ist die Liste ein Fakt, kein Entwurf mehr. */
function listHasContacts(l) {
  const cands = l?.callList?.candidates || l?.candidates || [];
  return cands.some((c) => c?.contact?.taskId);
}

/**
 * Verstrichene Liste schliessen (Slot-Ende liegt in der Vergangenheit).
 * Fire-and-forget aus dem Overview heraus — idempotent, auditiert.
 */
async function closeStaleList(clientId, c, grund) {
  try {
    await setStatus(clientId, c.id, CASE_STATUS.CLOSED, { by: "Clara", note: "" });
    await addUpdate(clientId, c.id, {
      by: "Clara",
      kind: "note",
      text: `Anrufliste automatisch geschlossen: ${grund}.`,
    });
    log.info("gapfill.list_closed", { clientId, caseId: c.id, grund });
  } catch (e) {
    log.warn("gapfill.list_close_failed", { clientId, caseId: c.id, error: String(e?.message || e) });
  }
}

/**
 * Kandidaten-Pool (Kampagnen + faellige Recalls) inkl. Kontakt-Zaehler und
 * Drossel-Schluessel — gemeinsame Grundlage fuer den Coach-Lauf, das
 * Bucket-Inventar und den Bucket-Wechsel einer einzelnen Liste.
 */
// Kurz-Cache fuer die Outreach-Stats-Map: loadStatsMap liest EIN Dokument pro
// Kandidat (getAll ueber ~3000 IDs ≈ 1 s) — das lief bei JEDEM Aufruf mit,
// auch fuer die reine Themen-Frage und die Monitor-Bucket-Zaehlung (Chef
// 28.07.2026: "am schlimmsten ist der lag"). 45 s Frische reicht: die Zaehler
// aendern sich nur, wenn Lisa wirklich kontaktiert.
const statsMapCache = new Map(); // clientId -> { at, map }
const STATS_MAP_CACHE_MS = 45000;

async function cachedStatsMap(clientId, patientIds) {
  const hit = statsMapCache.get(clientId);
  if (hit && Date.now() - hit.at < STATS_MAP_CACHE_MS) return hit.map;
  const map = await loadStatsMap(clientId, patientIds);
  statsMapCache.set(clientId, { at: Date.now(), map });
  return map;
}

async function candidatePool(clientId, booking, { demoOnly = false, mitStats = true } = {}) {
  const locationId = booking.locationId;
  const [allCandidatesRoh, throttled] = await Promise.all([
    Promise.all([
      campaignCandidates(clientId, locationId, booking, { demoOnly }),
      demoOnly ? Promise.resolve([]) : recallCandidates(clientId, locationId, booking),
    ]).then(([a, b]) => [...a, ...b]),
    recentlyContactedKeys(clientId),
  ]);

  // Kontakt-Zaehler anheften (Chef 28.07.2026): Gesamtkontakte + Erfolge pro
  // Patient. Faehrt als Momentaufnahme am Kandidaten mit in die Anrufliste —
  // Anzeige (hochgestellte Zahlen), Ranking und Spam-Wache lesen daraus.
  // mitStats=false: reine Zaehl-Aufrufe (Bucket-Inventar, Themen-Frage)
  // brauchen keine Zaehler — spart den teuersten Firestore-Schritt.
  const statsMap = mitStats
    ? await cachedStatsMap(clientId, allCandidatesRoh.map((c) => c.patientId))
    : new Map();
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
  return { allCandidates, throttled };
}

/** Anzeige-Name eines Buckets: sprechbar, ohne Praxis-Abkuerzungen. */
function bucketLabelFor(candidates, bucketKey) {
  const hit = candidates.find((c) => c.bucketKey === bucketKey && s(c.visitMotiveName));
  const raw = s(hit?.visitMotiveName) || s(candidates.find((c) => c.bucketKey === bucketKey)?.campaignName) || bucketKey;
  return spokenMotiveLabel(raw) || raw;
}

/**
 * Bucket-Inventar fuer den Monitor: fein nach Motiv, plus Fachbereich.
 * Sprache nutzt listRecallFachbereiche() — kurze Auswahl ohne Zahlen.
 */
export async function listRecallBuckets(clientId) {
  const booking = await loadBooking(clientId).catch(() => null);
  if (!booking?.locationId) return { ok: false, reason: "no_booking_config", buckets: [] };
  const boundary = await gapFillCalendarBoundary(clientId);
  // mitStats:false — fuers Zaehlen der Buckets braucht niemand Kontakt-Zaehler
  // (Lag-Fix 28.07.2026: sparte ~1 s pro Themen-Frage/Monitor-Dropdown).
  const { allCandidates } = await candidatePool(clientId, booking, { mitStats: false });
  const map = new Map();
  for (const c of allCandidates) {
    const key = c.bucketKey || "sonstiges";
    if (!map.has(key)) {
      map.set(key, {
        key, label: "", fachbereich: c.fachbereich || fachbereichOf(c.visitMotiveName),
        gesamt: 0, passend: 0,
      });
    }
    const b = map.get(key);
    b.gesamt++;
    if (!c.calendarId || !boundary || c.calendarId === boundary) b.passend++;
  }
  for (const b of map.values()) b.label = bucketLabelFor(allCandidates, b.key);
  const buckets = [...map.values()].sort((a, b) => b.passend - a.passend || b.gesamt - a.gesamt);
  return { ok: true, buckets, candidatesTotal: allCandidates.length };
}

/** Kern-Fachbereiche fuer die kurze Sprachfrage (Reihenfolge fest). */
const FACH_KERN = ["prophylaxe", "kons", "ze"];
/** Zusatz, nur wenn Bestand vorhanden — nicht ausschliessen (Chef 28.07.). */
const FACH_ZUSATZ = ["implantat"];

/**
 * Fachbereichs-Inventar fuer die Sprach-Rueckfrage: kurze Labels, ohne
 * Patientenzahlen. Kern immer Prophylaxe/Kons/ZE; Implantat nur wenn passend.
 */
export async function listRecallFachbereiche(clientId) {
  const inv = await listRecallBuckets(clientId);
  if (!inv.ok) return inv;
  const byFb = new Map();
  for (const b of inv.buckets) {
    const fb = b.fachbereich || fachbereichOf(b.label);
    if (!byFb.has(fb)) byFb.set(fb, { key: fb, label: spokenFachbereich(fb) || b.label, passend: 0, gesamt: 0 });
    const x = byFb.get(fb);
    x.passend += b.passend;
    x.gesamt += b.gesamt;
  }
  const kern = FACH_KERN.filter((k) => (byFb.get(k)?.passend || 0) > 0).map((k) => byFb.get(k));
  const zusatz = FACH_ZUSATZ.filter((k) => (byFb.get(k)?.passend || 0) > 0).map((k) => byFb.get(k));
  // Weitere Nicht-Kern-Buckets (selten) als sprechbare Zusatzoption.
  for (const [k, v] of byFb) {
    if (FACH_KERN.includes(k) || FACH_ZUSATZ.includes(k) || k === "sonstiges") continue;
    if (v.passend > 0) zusatz.push(v);
  }
  return { ok: true, kern, zusatz, buckets: inv.buckets, candidatesTotal: inv.candidatesTotal };
}

/**
 * Kurze Sprachfrage — keine Zahlen, keine Abkuerzungen.
 * z.B. "Aus welchem Fachbereich soll der Recall erfolgen — Prophylaxe, Kons oder ZE? Bei Bedarf auch Implantat."
 */
export function spokenFachbereichFrage(fach) {
  const kern = (fach?.kern || []).map((b) => b.label).filter(Boolean);
  const zusatz = (fach?.zusatz || []).map((b) => b.label).filter(Boolean);
  if (!kern.length && !zusatz.length) {
    return "Aus welchem Fachbereich soll der Recall erfolgen — Prophylaxe, Kons oder ZE?";
  }
  const liste = kern.length ? kern : zusatz;
  const letzte = liste[liste.length - 1];
  const kopf = liste.length === 1 ? liste[0]
    : liste.length === 2 ? `${liste[0]} oder ${liste[1]}`
    : `${liste.slice(0, -1).join(", ")} oder ${letzte}`;
  let satz = `Aus welchem Fachbereich soll der Recall erfolgen — ${kopf}?`;
  if (kern.length && zusatz.length) {
    satz += ` Bei Bedarf auch ${zusatz.map((z) => z).join(" oder ")}.`;
  }
  return satz;
}

/**
 * Gesprochenes Thema -> Fachbereich ("Kons", "Prophylaxe", "ZE", "Implantat")
 * oder genauer Bucket-Key. "alle" -> null (alle Themen).
 */
export function resolveBucketKey(buckets, gesprochen) {
  const q = s(gesprochen).toLowerCase().replace(/\s+/g, " ").trim();
  if (!q || /^(alle|alles|egal|gemischt|querbeet|komplett)(\s+themen?)?$/.test(q)) return null;
  // Fachbereich zuerst (Sprache arbeitet so). STT-Hoerfehler mit abdecken
  // (Live 28.07.2026: "Kons" kam als "Cont."/"Funks." an, ZE gern als "Zeh"):
  // im Zweifel lieber das gemeinte Thema treffen als die Frage wiederholen.
  if (/^(prophy|prophylaxe|pzr|zahnreinigung)\b/.test(q)) return "fach:prophylaxe";
  if (/^(kons|konservierend|kontrolle|cons|conz|konz|cont|kohns|funks|konst)\b/.test(q) && !/\bze\b/.test(q)) return "fach:kons";
  if (/^(ze|zeh|zett? ?e|zahnersatz)\b/.test(q)) return "fach:ze";
  if (/^(imp|implant|implantat)\b/.test(q)) return "fach:implantat";
  if (/^kch\b/.test(q)) return "fach:kons";
  if (/^pro\b/.test(q)) return "fach:prophylaxe";

  const list = Array.isArray(buckets) ? buckets : [];
  const exakt = list.find((b) => b.key === q || s(b.label).toLowerCase() === q);
  if (exakt) return exakt.key;
  const teil = list.find((b) => b.key.includes(q) || s(b.label).toLowerCase().includes(q) || q.includes(b.key));
  if (teil) return teil.key;
  const wort = list.find((b) => b.key.split(/[^a-zäöüß]+/i).some((w) => w.startsWith(q) || q.startsWith(w && w.length >= 4 ? w : "\u0000")));
  return wort?.key || null;
}

/** Kandidaten auf Fachbereich oder Fein-Bucket filtern. */
export function filterByThema(candidates, themaKey) {
  const want = s(themaKey);
  if (!want) return candidates;
  if (want.startsWith("fach:")) {
    const fb = want.slice(5);
    return candidates.filter((c) => (c.fachbereich || fachbereichOf(c.visitMotiveName)) === fb);
  }
  return candidates.filter((c) => c.bucketKey === want);
}

function themaLabel(pool, themaKey) {
  const want = s(themaKey);
  if (!want) return null;
  if (want.startsWith("fach:")) return spokenFachbereich(want.slice(5)) || null;
  return bucketLabelFor(pool, want);
}

/**
 * The coach run: scan [date .. date+horizonDays-1], compute real gaps per
 * Behandler, gate+rank candidates, upsert one approval-pending call-list case
 * per gap. Returns everything the voice/UI layer needs.
 */
export async function runGapFill(clientId, { date, horizonDays = 1, demoOnly = false, calendarId = null, bucketKey = null, bucketExplicit = false } = {}) {
  const startDate = s(date) || todayBerlin();
  const booking = await loadBooking(clientId).catch(() => null);
  if (!booking?.locationId) return { ok: false, reason: "no_booking_config", gaps: [], callLists: [] };
  const locationId = booking.locationId;
  // Persoenlicher Assistent (17.07.2026): Ist ein Kalender vorgegeben (der des
  // angemeldeten Behandlers), werden NUR dessen Luecken gescannt. Ohne Vorgabe
  // bleibt das Verhalten praxisweit (alle Kalender). Vorfall: Clara meldete zu
  // viele freie Luecken, weil sie ueber ALLE Behandler-Kalender scannte (leerer
  // Kollegen-Kalender = ganzer Tag "frei").
  // Kalender-Grenze (Chef 28.07.2026): Der Kalender des gekoppelten Behandlers
  // schlaegt ALLES — auch explizite Parameter und "alle"-Anfragen. Der
  // Monitor-Scan lief bisher praxisweit und legte eine Liste fuer Dr. Patrikis
  // an, obwohl diese Clara Dr. Petsas gehoert.
  const boundary = await gapFillCalendarBoundary(clientId);
  const onlyCalId = boundary || s(calendarId) || null;

  const [{ allCandidates: poolAlle, throttled }, prompt] = await Promise.all([
    candidatePool(clientId, booking, { demoOnly }),
    getActivePrompt(clientId, "lisa"),
  ]);
  // Themen-Bucket / Fachbereich (Chef 28.07.2026): Ist ein Thema gewaehlt
  // (fach:kons, fein-Bucket, ...), werden die Listen NUR daraus geformt.
  const wantBucket = s(bucketKey) || null;
  const allCandidates = filterByThema(poolAlle, wantBucket);
  const bucketLabel = themaLabel(poolAlle, wantBucket);

  const gaps = [];
  const callLists = [];
  for (let i = 0; i < Math.max(1, Math.min(7, horizonDays)); i++) {
    const d = new Date(`${startDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const weekday = weekdayIndexOf(day);

    const dayData = await getDayAppointments(clientId, { date: day });
    if (!dayData.ok) continue;

    // Gueltige Luecken-Identitaeten dieses Tages — alles andere ist ueberholt.
    const gueltigeCaseIds = new Set();
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
        gueltigeCaseIds.add(gapCaseId(clientId, calendar.id, day, gap.startMin));
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
        const upsert = await upsertCallListCase(clientId, {
          date: day, calendar, gap, candidates, booking,
          promptTag: prompt.ok ? prompt.tag : "pv:lisa:0",
          bucket: wantBucket ? { key: wantBucket, label: bucketLabel } : null,
          bucketExplicit,
        });
        callLists.push({
          ...upsert, date: day, calendarName: s(calendar.name), slot: gap.label, candidates: candidates.length,
          // Die vordersten Namen fuer den Sprechtext (Chef 28.07.2026: Kandidaten
          // DIREKT nennen statt "sagen Sie: wer sind die Kandidaten").
          topNamen: candidates.slice(0, 3).map((k) => s(k.name)).filter(Boolean),
        });
      }
    }

    // Abgleich (Chef 28.07.2026: "8-15 Uhr ist unmoeglich, da steht eine
    // Abwesenheit"): Aktive Listen dieses Tages, deren Luecke es nach dem
    // frischen Scan NICHT mehr gibt (inzwischen belegt/Abwesenheit), werden
    // geschlossen — ausser es wurde schon jemand kontaktiert (dann laufen
    // Antworten, der Ergebnis-Sweep behandelt sie ehrlich weiter).
    try {
      const aktive = await listCases(clientId, { activeOnly: true, assignee: "Lisa", limit: 100 });
      for (const c of aktive) {
        if (!c.id.startsWith("gapfill_") || !c.callList) continue;
        if (c.callList.date !== day) continue;
        if (onlyCalId && c.callList.calendarId !== onlyCalId) continue;
        if (gueltigeCaseIds.has(c.id)) continue;
        if (listHasContacts(c)) continue;
        await closeStaleList(clientId, c, "die Lücke existiert nicht mehr (inzwischen belegt oder Abwesenheit eingetragen)");
      }
    } catch { /* Pflege ist Zugabe — der Scan selbst bleibt unberuehrt */ }
  }

  return {
    ok: true, date: startDate, demoOnly: !!demoOnly, gaps, callLists,
    candidatesTotal: allCandidates.length,
    bucketKey: wantBucket, bucketLabel,
  };
}

/**
 * EINE Liste auf ein anderes Themen-Bucket stellen (Chef 28.07.2026: "ich
 * muss die Buckets tauschen koennen in der Liste"). Bereits Kontaktierte
 * bleiben unveraendert vorn (Antworten laufen), Weggewischte bleiben als
 * removed-Audit erhalten und kommen nicht zurueck; der Rest wird frisch aus
 * dem gewaehlten Bucket gerankt. bucketKey leer/"alle" = alle Themen.
 */
export async function setListBucket(clientId, caseId, { bucketKey = null, by = "" } = {}) {
  const ref = masCollection(clientId, "mas_cases").doc(s(caseId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const c = snap.data();
  const list = c.callList;
  if (!list?.slot) return { ok: false, reason: "not_a_call_list" };

  const booking = await loadBooking(clientId).catch(() => null);
  if (!booking?.locationId) return { ok: false, reason: "no_booking_config" };
  const { allCandidates: pool, throttled } = await candidatePool(clientId, booking);

  const want = s(bucketKey) || null;
  const scoped = filterByThema(pool, want);
  const label = themaLabel(pool, want);
  if (want && !scoped.length) return { ok: false, reason: "bucket_empty", bucketKey: want };

  const gap = {
    startMin: list.slot.startMin, endMin: list.slot.endMin,
    minutes: list.slot.minutes, label: list.slot.label,
  };
  const ranked = rankCandidatesForGap(scoped, gap, { calendarId: list.calendarId, throttled });

  const alt = Array.isArray(list.candidates) ? list.candidates : [];
  const kontaktiert = alt.filter((x) => x.contact?.taskId);
  const entfernt = alt.filter((x) => x.removed && !x.contact?.taskId);
  const belegt = new Set([...kontaktiert, ...entfernt].map((x) => s(x.patientId)));
  const frisch = ranked.filter((x) => !belegt.has(s(x.patientId)));
  const platz = Math.max(0, MAX_CANDIDATES_STORED - kontaktiert.length - entfernt.length);
  const candidates = [...kontaktiert, ...frisch.slice(0, platz), ...entfernt];

  await ref.update({
    "callList.candidates": candidates,
    "callList.bucketKey": want,
    "callList.bucketLabel": label,
    "callList.refreshedAt": Date.now(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const aktiv = candidates.filter((x) => !x.removed).length;
  await addUpdate(clientId, s(caseId), {
    by: s(by) || "Team",
    kind: "note",
    text: want
      ? `Anrufliste auf Thema »${label}« umgestellt: ${aktiv} Kandidat(en)${kontaktiert.length ? `, ${kontaktiert.length} bereits Kontaktierte bleiben` : ""}.`
      : `Anrufliste auf alle Themen gestellt: ${aktiv} Kandidat(en).`,
  });
  return { ok: true, bucketKey: want, bucketLabel: label, candidates: aktiv };
}

/** UI read-model: pending + approved call lists (active gap-fill cases). */
export async function gapFillOverview(clientId) {
  const [cases, boundary] = await Promise.all([
    listCases(clientId, { activeOnly: true, assignee: "Lisa", limit: 100 }),
    gapFillCalendarBoundary(clientId),
  ]);
  const gapCases = [];
  const now = Date.now();
  for (const c of cases) {
    if (!c.id.startsWith("gapfill_") || !c.callList) continue;
    // Verstrichene Luecken (Chef 28.07.2026: "27.7. ist in der Vergangenheit")
    // verschwinden von selbst: nicht mehr anzeigen und den Fall schliessen.
    const endMs = listSlotEndMs(c);
    if (endMs && endMs < now) {
      closeStaleList(clientId, c, `die Lücke ${c.callList.slot?.label || ""} am ${c.callList.date} ist verstrichen`).catch(() => {});
      continue;
    }
    // Kalender-Grenze: Listen fremder Behandler-Kalender gehoeren nicht zu
    // dieser Clara — ausblenden und (solange niemand kontaktiert wurde)
    // schliessen, damit sie nirgends auf Freigabe warten.
    if (boundary && c.callList.calendarId && c.callList.calendarId !== boundary) {
      if (!listHasContacts(c)) {
        closeStaleList(clientId, c, `die Liste gehört zum Kalender von ${c.callList.calendarName || "einem anderen Behandler"} — nicht zum Behandler dieser Clara`).catch(() => {});
      }
      continue;
    }
    gapCases.push(c);
  }
  // Kontakt-Zaehler LIVE anheften (Chef 28.07.2026: "ich sehe immer noch
  // keine kennzahlen"): die Momentaufnahme vom Formungszeitpunkt veraltet,
  // sobald Lisa anruft oder online gebucht wird. Der Monitor bekommt deshalb
  // bei jedem Laden den frischen Stand aus dem Kontakt-Ledger (wenige IDs,
  // ein getAll — billig). Zaehler sind Zugabe: ein Fehler hier darf die
  // Uebersicht nie verhindern.
  try {
    const ids = [...new Set(gapCases.flatMap((c) => (c.callList?.candidates || []).map((k) => s(k.patientId)).filter(Boolean)))];
    if (ids.length) {
      const frisch = await loadStatsMap(clientId, ids);
      for (const c of gapCases) {
        const cands = c.callList?.candidates;
        if (!Array.isArray(cands)) continue;
        c.callList = {
          ...c.callList,
          candidates: cands.map((k) => {
            const st = frisch.get(s(k.patientId));
            if (!st) return k;
            return { ...k, stats: { ...(k.stats || {}), contacts: st.contacts, booked: st.booked } };
          }),
        };
      }
    }
  } catch { /* Zaehler sind Zugabe */ }
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
    bucketKey: c.callList?.bucketKey || null,
    bucketLabel: c.callList?.bucketLabel || null,
    voicemailScript: c.callList?.voicemailScript,
    promptVersionTag: c.callList?.promptVersionTag,
    approvedBy: c.callList?.approvedBy || null,
    approvedAt: c.callList?.approvedAt || null,
  };
}

/**
 * Kandidat von einer Anrufliste nehmen (Chef 28.07.2026: nach links wischen
 * zum Entfernen, iOS-Stil). Der Eintrag bleibt als removed=true erhalten
 * (Audit + damit der naechste Scan ihn nicht wieder hereinholt); kontaktiert
 * wird er nicht mehr, der naechste Puffer-Kandidat rueckt automatisch nach.
 */
export async function removeCandidateFromList(clientId, caseId, { patientId, by, via } = {}) {
  const ref = masCollection(clientId, "mas_cases").doc(s(caseId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const c = snap.data();
  const cands = c.callList?.candidates;
  if (!Array.isArray(cands)) return { ok: false, reason: "not_a_call_list" };
  const idx = cands.findIndex((x) => s(x.patientId) === s(patientId));
  if (idx < 0) return { ok: false, reason: "candidate_not_found" };
  // Kontaktierte DUERFEN entfernt werden (Chef 28.07.2026: "ich habe darum
  // gebeten, Tatjana Kruse zu entfernen" — sie war bereits angerufen). Die
  // Kontakt-Daten bleiben am Kandidaten fuer die Nachvollziehbarkeit; removed
  // heisst nur: nicht mehr auf der Liste, kein weiterer Versuch.
  if (cands[idx].removed) return { ok: true, already: true, name: s(cands[idx].name) };

  const neu = [...cands];
  neu[idx] = { ...neu[idx], removed: true, removedBy: s(by) || "Team", removedAt: Date.now() };
  await ref.update({ "callList.candidates": neu, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await addUpdate(clientId, s(caseId), {
    by: s(by) || "Team",
    kind: "note",
    text: `Kandidat ${neu[idx].name || patientId} von der Anrufliste genommen (${s(via) || "im Monitor entfernt"}).`,
  });
  const verbleibend = neu.filter((x) => !x.removed).length;
  return { ok: true, remaining: verbleibend, name: s(neu[idx].name) };
}

// --- Kandidat per NAME entfernen (Sprach-Weg) --------------------------------
// Chef 28.07.2026: "ich habe darum gebeten tatjana kruse zu entfernen, kann
// sie nicht" — es gab schlicht kein Sprach-Tool; das LLM griff zu
// gapfill_call_patient und las zur "Hilfe" alle Kandidaten vor. Der Name
// kommt aus STT und darf verhoert sein ("Krose" -> Kruse), deshalb tolerante
// Suche: exakt > Teilstring > Levenshtein bis 2 (ein Wort matcht Nachnamen).

function normPersonName(x) {
  return s(x).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
}

function levDistanz(a, b, max = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Abstand Suchbegriff <-> Kandidatenname (0 exakt … 3 kein Treffer). */
function nameTrefferScore(query, kandidatName) {
  const q = normPersonName(query);
  const full = normPersonName(kandidatName);
  if (!q || !full) return 99;
  if (full === q) return 0;
  if (full.includes(q) || q.includes(full)) return 1;
  const qWorte = q.split(" ");
  const fWorte = full.split(" ");
  // Ein gesprochenes Wort darf einen Namensbestandteil treffen ("Kruse").
  if (qWorte.length === 1) {
    let best = 99;
    for (const w of fWorte) best = Math.min(best, levDistanz(qWorte[0], w, 2));
    return best <= 2 ? 1 + best : 99;
  }
  const d = levDistanz(q, full, 2);
  return d <= 2 ? d : 99;
}

export async function removeCandidateByName(clientId, { patientName, by } = {}) {
  const gesagt = s(patientName);
  if (!gesagt) return { ok: false, reason: "no_name" };
  const ov = await gapFillOverview(clientId);
  const listen = [...(ov.pending || []), ...(ov.approved || [])];
  if (!listen.length) return { ok: false, reason: "no_lists" };

  // Beste Treffer ueber alle offenen Listen einsammeln (derselbe Patient kann
  // in mehreren Listen stehen — dann fliegt er ueberall raus).
  const treffer = new Map(); // patientId -> { name, score, faelle:Set }
  for (const l of listen) {
    for (const k of l.candidates || []) {
      if (k.removed || !s(k.patientId)) continue;
      const score = nameTrefferScore(gesagt, k.name);
      if (score > 3) continue;
      const t = treffer.get(s(k.patientId)) || { name: s(k.name), score, faelle: new Set() };
      t.score = Math.min(t.score, score);
      t.faelle.add(l.caseId);
      treffer.set(s(k.patientId), t);
    }
  }
  if (!treffer.size) return { ok: false, reason: "candidate_not_found" };
  const sortiert = [...treffer.entries()].sort((a, b) => a[1].score - b[1].score);
  const bestScore = sortiert[0][1].score;
  const beste = sortiert.filter(([, t]) => t.score === bestScore);
  if (beste.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      kandidaten: beste.map(([, t]) => t.name),
    };
  }
  const [patientId, t] = beste[0];
  let entferntAus = 0;
  for (const caseId of t.faelle) {
    const r = await removeCandidateFromList(clientId, caseId, {
      patientId, by, via: "per Stimme entfernt",
    });
    if (r.ok) entferntAus++;
  }
  return { ok: entferntAus > 0, name: t.name, listen: entferntAus };
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
  const aktiv = aktiveKandidaten(c.callList).length;
  await addUpdate(clientId, c.id, {
    by: who,
    kind: "note",
    text: `Anrufliste freigegeben: ${Math.min(aktiv, MAX_CANDIDATES_PER_LIST)} Kandidat(en) werden kontaktiert (${aktiv} aktiv in der Liste), Slot ${c.callList.slot?.label || ""} bei ${c.callList.calendarName || ""}. Gilt Prompt-Version ${c.callList.promptVersionTag || "pv:lisa:0"}. Lisa darf kontaktieren, sobald der Anrufkanal aktiv ist.`,
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
/**
 * Kurzfassung dessen, was Lisa den Patienten sagen wird — fuer die PROAKTIVE
 * Ansage-Besprechung im Briefing (Chef 28.07.2026: "es waere gut wenn clara
 * zur absicherung den prompt mit mir bespricht ... und ich dann eine chance
 * habe das umzustellen"). Muss inhaltlich zu recallKontrollFokus passen:
 * immer Kontroll-Charakter, immer "liegt lange zurueck".
 */
function lisaAnsageKurz(bucketKey) {
  const k = s(bucketKey);
  if (k === "fach:ze") return "Lisa lädt zur Zahnersatz-Kontrolle ein — die Versorgung liegt lange zurück, wir prüfen sie zur Qualitätssicherung";
  if (k === "fach:kons") return "Lisa lädt zur Kontrolle der Füllungen ein — die letzte Behandlung liegt lange zurück";
  if (k === "fach:prophylaxe") return "Lisa lädt zur fälligen Prophylaxe ein — die letzte Sitzung liegt lange zurück";
  if (k === "fach:implantat") return "Lisa lädt zur Implantat-Kontrolle ein — wir begutachten, ob alles reizfrei und ohne Entzündung sitzt";
  if (k === "fach:paro") return "Lisa lädt zur Zahnfleisch-Kontrolle ein — wir überprüfen den Zustand nach der Parodontitis-Behandlung";
  if (k === "fach:kfo") return "Lisa lädt zur Schienen-Kontrolle ein — die letzte Kontrolle liegt lange zurück";
  return "Lisa lädt zur Kontrolle ein und betont, dass der letzte Termin lange zurückliegt";
}

export function buildSpokenGapBriefing(run, { operatorName, themaLabel, bucketKey = null, kandidatenAngezeigt = false } = {}) {
  const hi = operatorName ? `${operatorName}, ` : "";
  if (!run?.ok) return `${hi}der Lückenfüller ist nicht konfiguriert — es fehlt die Buchungskonfiguration.`;
  if (!run.gaps.length) return `${hi}im Kalender sind keine nennenswerten Lücken — sehr gut.`;

  // Wiederholungs-Ekel (Chef 28.07.2026): Thema EINWEBEN statt als Stummel
  // "Recall-Thema Kons." davorzukleben, bei EINER Luecke EIN Satz ohne den
  // Behandlernamen doppelt zu nennen (Anrede reicht), und die beiden
  // Schluss-Hinweise (Kandidaten/Freigabe) zu EINEM Satz buendeln.
  const thema = s(themaLabel);
  const fuerThema = thema ? ` für ${thema}` : "";
  const parts = [];
  const total = run.gaps.length;
  const withCands = run.gaps.filter((g) => g.candidateCount > 0).length;
  // Umsatzzahlen werden bewusst NICHT genannt (O-Ton Chef 12.06.2026:
  // "umsatzzahlen komplett NICHT nennen" — das wird ein separates Element
  // mit Lena und Sophie). gapRevenuePotential bleibt dafür als API erhalten.
  if (total === 1) {
    const g = run.gaps[0];
    const cand = g.candidateCount === 1 ? "einen passenden Kandidaten"
      : g.candidateCount ? `${g.candidateCount} passende Kandidaten` : "";
    parts.push(g.candidateCount
      ? `${hi}für die Lücke ${g.label} (${g.minutes} Minuten) habe ich ${cand}${fuerThema}.`
      : `${hi}für die Lücke ${g.label} (${g.minutes} Minuten) finde ich${fuerThema ? ` bei ${thema}` : ""} keinen passenden Kandidaten.`);
    // Kandidaten DIREKT nennen (Chef 28.07.2026: "nicht fragen ob sie die
    // Listen anzeigen soll, sondern direkt anzeigen") — die vordersten Namen
    // in den Satz, der Rest steht auf der mitgeschickten Karte.
    const namen = (run.callLists?.[0]?.topNamen || []).filter(Boolean);
    if (namen.length && g.candidateCount) {
      const aufz = namen.length === 1 ? namen[0]
        : `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
      parts.push(`Vorn ${namen.length === 1 ? "steht" : "stehen"} ${aufz}.`);
    }
  } else {
    parts.push(`${hi}ich habe ${total} Lücken gefunden, davon ${withCands} mit passenden Kandidaten${fuerThema}.`);
    for (const g of run.gaps.slice(0, 4)) {
      parts.push(`${g.calendarName}: ${g.label} (${g.minutes} Minuten)${g.candidateCount ? ` — ${g.candidateCount} Kandidat${g.candidateCount === 1 ? "" : "en"}` : " — kein passender Kandidat"}.`);
    }
  }

  // Kurzfristigkeits-Einschätzung (Wunsch Chef 16.06.2026): liegen die Lücken
  // mit Kandidaten praktisch alle sehr nah (z. B. heute), ist klassischer Recall
  // meist zu knapp — dann gezieltes Einbestellen anbieten statt Massen-Recall.
  const candGaps = run.gaps.filter((g) => g.candidateCount > 0);
  const allCandShort = candGaps.length > 0 && candGaps.every((g) => isShortNoticeGap(g));
  const anyShort = run.gaps.some((g) => isShortNoticeGap(g));
  if (allCandShort || (!candGaps.length && anyShort)) {
    parts.push(`${total === 1 ? "Die Lücke liegt" : "Die Lücken liegen"} allerdings sehr kurzfristig — wenn Sie lieber jemand Bestimmten einbestellen möchten, nennen Sie mir einfach den Namen.`);
  }

  const lists = run.callLists?.length || 0;
  if (lists) {
    parts.push(kandidatenAngezeigt
      ? `Die ${lists === 1 ? "Liste liegt" : "Listen liegen"} auf Ihrem Display und im Monitor.`
      : `${lists === 1 ? "Die Anrufliste wartet" : `${lists} Anruflisten warten`} im Monitor auf Ihre Freigabe.`);
    // Ansage-Besprechung PROAKTIV (Chef 28.07.2026: "der Lisa auftrags prompt
    // wird nicht besprochen"): VOR der Freigabe hoert der Chef, was Lisa sagen
    // wird, und kann direkt umformulieren — nicht erst auf Nachfrage.
    parts.push(`${lisaAnsageKurz(bucketKey)}. Wenn das passt: „Recall freigeben“ — oder sagen Sie mir, was Lisa anders sagen soll.`);
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
    const cands = aktiveKandidaten(l).slice(0, MAX_CANDIDATES_PER_LIST);
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
    candidates: aktiveKandidaten(l).slice(0, MAX_CANDIDATES_PER_LIST).map((c) => ({
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
