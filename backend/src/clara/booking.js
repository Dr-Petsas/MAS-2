import { masCollection } from "../tenant.js";

// Clara's calendar actions. MAS-2 is the source of truth: it talks to the same
// Pickadoc Cloud Functions the phone agent uses (unauthenticated POST JSON) and
// returns short spoken strings for the LLM. The voice worker stays generic and
// only calls these via custom_tools.

const DEFAULT_CF_BASE = "https://europe-west3-docgenda.cloudfunctions.net";

function cfBase(booking) {
  return (booking?.cfBaseUrl || process.env.PICKADOC_CF_BASE_URL || DEFAULT_CF_BASE).replace(/\/+$/, "");
}

// Booking config (calendars, visit motives, location) lives per-tenant in
// Firestore at clients/{clientId}/mas_config/booking — additive, never touches
// platform data.
export async function loadBooking(clientId) {
  const snap = await masCollection(clientId, "mas_config").doc("booking").get();
  if (!snap.exists) throw new Error(`no mas_config/booking config for client ${clientId}`);
  return snap.data();
}

function norm(s) {
  return (s == null ? "" : String(s)).trim();
}

// Fuzzy-resolve a calendar id from a spoken doctor name (token overlap).
// Generische Titel-Tokens ("Dr.", "Prof.") duerfen NICHT matchen: "Dr. Michael
// Petsas" traf sonst den ERSTEN Kalender mit "Dr." im Namen (Dr. Nikolaou) und
// der Chef bekam einen leeren Tag vorgelesen, obwohl er Termine hatte.
const GENERIC_DOCTOR_TOKENS = new Set([
  "dr", "med", "dent", "prof", "doktor", "doctor", "herr", "frau",
  "zahnarzt", "zahnaerztin", "praxis",
]);
export function resolveCalendar(booking, doctorName) {
  const cals = Array.isArray(booking.calendars) ? booking.calendars : [];
  const q = norm(doctorName).toLowerCase();
  if (!q) return null;
  let exact = cals.find((c) => norm(c.name).toLowerCase() === q);
  if (exact) return exact;
  const qTokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[.,;:]/g, ""))
    .filter((t) => t.length > 2 && !GENERIC_DOCTOR_TOKENS.has(t));
  if (!qTokens.length) return null;
  // Bester Treffer gewinnt (meiste matchende Namens-Tokens), nicht der erste.
  let best = null;
  let bestScore = 0;
  for (const c of cals) {
    const name = norm(c.name).toLowerCase();
    const score = qTokens.filter((t) => name.includes(t)).length;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

function resolveVisitMotive(booking, visitMotiveName) {
  const vms = Array.isArray(booking.visitMotives) ? booking.visitMotives : [];
  const q = norm(visitMotiveName).toLowerCase();
  if (!q) return null;
  let exact = vms.find((v) => norm(v.name).toLowerCase() === q);
  if (exact) return exact;
  return vms.find((v) => norm(v.name).toLowerCase().includes(q) || q.includes(norm(v.name).toLowerCase())) || null;
}

// Europe/Berlin offset (+01:00 / +02:00 DST) for a given instant. The booking
// backend treats a naive datetime as UTC, so we must always send an offset.
function berlinOffset(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+01:00";
  const m = tz.match(/GMT([+-]\d{2}):?(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "+01:00";
}

export function ensureBerlinTz(iso) {
  const s = norm(iso).replace(" ", "T");
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return s + berlinOffset(d);
}

async function cfPost(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }
  return { status: resp.status, data };
}

// getFreeTimeSlots — read-only. Returns { slots: [iso], calendarName, date }.
export async function findSlots(clientId, args = {}) {
  const booking = await loadBooking(clientId);
  const body = {
    clientId: norm(booking.clientId) || clientId,
    locationId: norm(booking.locationId),
    source: norm(booking.source) || "mas-2-clara",
  };
  const cal = resolveCalendar(booking, args.doctorName);
  if (cal) body.calendarId = cal.id;
  else if (norm(booking.defaultCalendarId)) body.calendarId = norm(booking.defaultCalendarId);
  else if (norm(args.doctorName)) body.doctorName = norm(args.doctorName);

  const vm = resolveVisitMotive(booking, args.visitMotiveName);
  if (vm) body.visitMotiveId = vm.id;
  if (norm(args.visitMotiveName)) body.visitMotiveName = norm(args.visitMotiveName);
  if (norm(args.startDate)) body.startDate = norm(args.startDate);
  if (norm(args.patientInsuranceType)) body.patientInsuranceType = norm(args.patientInsuranceType);

  const { status, data } = await cfPost(`${cfBase(booking)}/getFreeTimeSlots`, body);
  if (status === 200 && data?.status === "success") {
    const raw = data.data?.free_time_slots;
    let slots = [];
    try {
      slots = typeof raw === "string" ? JSON.parse(raw) : raw || [];
    } catch {
      slots = [];
    }
    return {
      ok: true,
      slots,
      calendarId: body.calendarId || null,
      calendarName: cal?.name || data.data?.doctor_name || null,
      visitMotiveName: vm?.name || data.data?.visit_motive_name || norm(args.visitMotiveName),
      date: slots[0] ? slots[0].slice(0, 10) : norm(args.startDate) || null,
    };
  }
  return { ok: false, error: data?.message || `getFreeTimeSlots failed (${status})` };
}

// createAppointment — writes a real appointment via the Cloud Function.
export async function bookAppointment(clientId, args = {}) {
  const booking = await loadBooking(clientId);
  const vm = resolveVisitMotive(booking, args.visitMotiveName);
  if (!vm) {
    const names = (booking.visitMotives || []).map((v) => v.name).slice(0, 8).join(", ");
    return { ok: false, error: `Behandlungsart unklar. Verfügbar: ${names}` };
  }
  const cal = resolveCalendar(booking, args.doctorName);
  const startIso = ensureBerlinTz(args.appointmentStartDate);
  const gender = ({ f: "f", m: "m", d: "d", w: "f" }[norm(args.patientGender).toLowerCase()] ) || "";

  const body = {
    clientId: norm(booking.clientId) || clientId,
    locationId: norm(booking.locationId),
    source: norm(booking.source) || "mas-2-clara",
    visitMotiveId: vm.id,
    appointmentStartDate: startIso,
    patientFirstName: norm(args.patientFirstName),
    patientLastName: norm(args.patientLastName),
    patientMobilePhoneNumber: norm(args.patientMobilePhoneNumber),
    patientGender: gender,
  };
  if (cal) body.calendarId = cal.id;
  else if (norm(args.doctorName)) body.doctorName = norm(args.doctorName);

  // Safety valve for unattended/dev runs: never fire a real booking when set.
  if (process.env.MAS_BOOKING_DRY_RUN === "1") {
    return {
      ok: true,
      dryRun: true,
      slotIso: startIso,
      date: startIso.slice(0, 10),
      calendarId: cal?.id || null,
      calendarName: cal?.name || null,
      patient: { firstName: body.patientFirstName, lastName: body.patientLastName },
      visitMotiveName: vm.name,
    };
  }

  const { status, data } = await cfPost(`${cfBase(booking)}/createAppointment`, body);
  if (status === 200 && data?.status === "success") {
    return {
      ok: true,
      slotIso: startIso,
      date: startIso.slice(0, 10),
      calendarId: cal?.id || null,
      calendarName: cal?.name || null,
      patient: { firstName: body.patientFirstName, lastName: body.patientLastName },
      visitMotiveName: vm.name,
    };
  }
  return { ok: false, error: data?.message || `createAppointment failed (${status})` };
}
