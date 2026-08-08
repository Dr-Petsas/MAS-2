import { loadBooking, ensureBerlinTz } from "./booking.js";
import { listContextPatientIds } from "./sttPatientNames.js";

// Internal-team booking flow (Clara on behalf of the practice staff).
//
// Unlike the patient-facing phone flow (name + phone -> create patient), the
// team books for an EXISTING patient that they cannot identify by phone number.
// So this module talks to the two dedicated, additive Cloud Functions:
//   masSearchPatients  -> find an existing patient by spoken name
//   masBookAppointment -> book by patientId (no phone needed)
//
// MAS-2 stays the source of truth: it resolves the calendar + visit motive from
// the per-tenant mas_config/booking config (never hardcoded), and returns short
// structured results. The voice worker never sees or echoes a Firestore id --
// the selected patient is remembered server-side in the live session.

const REAL_CF_BASE = (
  process.env.PICKADOC_REAL_CF_BASE_URL || "https://europe-west3-docgenda.cloudfunctions.net"
).replace(/\/+$/, "");

function norm(s) {
  return s == null ? "" : String(s).trim();
}

async function cfPost(route, body) {
  const resp = await fetch(`${REAL_CF_BASE}/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }
  return { status: resp.status, data };
}

// Fuzzy-resolve a calendar id from a spoken doctor name (token overlap), same
// approach as the phone flow. Falls back to the configured default calendar.
// Generische Titel-Tokens ("Dr.", "Prof.") duerfen NICHT matchen, sonst trifft
// "Dr. Michael Petsas" den ERSTEN Kalender mit "Dr." im Namen (falscher Arzt).
const GENERIC_DOCTOR_TOKENS = new Set([
  "dr", "med", "dent", "prof", "doktor", "doctor", "herr", "frau",
  "zahnarzt", "zahnaerztin", "praxis",
]);
function resolveCalendar(booking, doctorName) {
  const cals = Array.isArray(booking.calendars) ? booking.calendars : [];
  const q = norm(doctorName).toLowerCase();
  if (q) {
    const exact = cals.find((c) => norm(c.name).toLowerCase() === q);
    if (exact) return exact;
    const qTokens = q
      .split(/\s+/)
      .map((t) => t.replace(/[.,;:]/g, ""))
      .filter((t) => t.length > 2 && !GENERIC_DOCTOR_TOKENS.has(t));
    // Bester Treffer gewinnt (meiste matchende Namens-Tokens), nicht der erste.
    let best = null;
    let bestScore = 0;
    for (const c of cals) {
      const name = norm(c.name).toLowerCase();
      const score = qTokens.filter((t) => name.includes(t)).length;
      if (score > bestScore) { best = c; bestScore = score; }
    }
    if (best) return best;
  }
  const def = norm(booking.defaultCalendarId);
  if (def) return cals.find((c) => c.id === def) || { id: def, name: null };
  return null;
}

function resolveVisitMotive(booking, visitMotiveName) {
  const vms = Array.isArray(booking.visitMotives) ? booking.visitMotives : [];
  const q = norm(visitMotiveName).toLowerCase();
  if (!q) return null;
  const exact = vms.find((v) => norm(v.name).toLowerCase() === q);
  if (exact) return exact;
  return (
    vms.find(
      (v) =>
        norm(v.name).toLowerCase().includes(q) || q.includes(norm(v.name).toLowerCase())
    ) || null
  );
}

// Per-tenant default = a "Kontrolltermin". We never hardcode an id: we pick the
// configured visit motive whose name signals a control appointment, else the
// explicit booking.defaultVisitMotiveId, else the first motive.
export function defaultControlMotive(booking) {
  const vms = Array.isArray(booking.visitMotives) ? booking.visitMotives : [];
  const byFlag = norm(booking.defaultVisitMotiveId);
  if (byFlag) {
    const hit = vms.find((v) => v.id === byFlag);
    if (hit) return hit;
  }
  const byName = vms.find((v) => norm(v.name).toLowerCase().includes("kontroll"));
  if (byName) return byName;
  return vms[0] || null;
}

// search existing patients by spoken name. Returns a compact candidate list.
// Patient lookup must work even when the practice has no mas_config/booking yet
// (that config is only needed for the booking flow). So we load it softly and
// fall back to the MAS clientId — the lookup is read-only and harmless.
// Namensteilchen, die einen Nachnamen NICHT unterscheidbar machen. Sie stehen
// in der Kartei mit im Nachnamen ("El Hajjami"), taugen aber als Suchbegriff
// nichts: eine Suche nach "El" liefert das halbe Alphabet, eine Suche nach
// "El Hajjami" dagegen NICHTS, weil die Suche mehrteilige Begriffe nicht
// aufloest. Wir zerlegen den gesprochenen Namen deshalb selbst.
const NAME_PARTICLES = new Set([
  "el", "al", "ale", "ben", "bin", "ibn", "abu", "van", "von", "der", "den",
  "de", "di", "da", "do", "du", "le", "la", "los", "las", "dos", "das", "st",
  "mac", "mc", "ter", "zu", "zum", "zur", "auf", "am", "im",
]);

/**
 * Suchvarianten aus einem gesprochenen Namen (PUR, unit-testbar).
 *
 * Anlass (Live-Anruf Dr. Petsas 04.08.2026): "Ouafa El Hajjami" — die Suche
 * nach dem VOLLSTAENDIG richtigen Namen lieferte null Treffer, ebenso "El
 * Hajjami" und "Hajjami"; nur der Vorname allein fand die Patientin. Clara
 * drehte sich daraufhin minutenlang im Kreis. Wir probieren deshalb bewusst
 * mehrere Zuschnitte: den ganzen Namen, den Nachnamen-Kern und den Vornamen.
 *
 * Bewusst auf drei Varianten gedeckelt — jede Variante ist eine Datenbank-
 * Abfrage, und die Suche laeuft bei tausenden Mandanten sehr oft.
 */
export function nameQueryVariants(spoken, { max = 3 } = {}) {
  const clean = norm(spoken).replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out = [];
  const push = (v) => {
    const t = norm(v);
    if (t.length < 2) return;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    if (out.length < max) out.push(t);
  };
  push(clean);
  const tokens = clean.split(" ").filter(Boolean);
  const core = tokens.filter((t) => t.length >= 3 && !NAME_PARTICLES.has(t.toLowerCase()));
  if (tokens.length > 1 && core.length) {
    // Nachname zuerst: der letzte Kern-Bestandteil ist im Deutschen wie im
    // Arabischen der unterscheidende Teil ("Hajjami", "Tzannis").
    push(core[core.length - 1]);
    if (core.length > 1) push(core[0]);
  }
  return out;
}

export async function searchPatient(clientId, name) {
  let booking = {};
  try { booking = await loadBooking(clientId); } catch { booking = {}; }
  const searchClientId = norm(booking.clientId) || clientId;
  // Kandidaten-Schicht (additiv): Termin-Patienten der naechsten Tage als
  // Kontext mitgeben, damit bei Namensvettern der wahrscheinlich Gemeinte oben
  // steht. Best-effort + gecacht; faellt es aus, sucht die CF wie bisher.
  let contextPatientIds = [];
  try { contextPatientIds = await listContextPatientIds(searchClientId); } catch { contextPatientIds = []; }
  // Mehrere Zuschnitte des gesprochenen Namens probieren (siehe
  // nameQueryVariants). Treffer werden ueber die Patienten-Kennung
  // zusammengefuehrt, Reihenfolge der ersten erfolgreichen Variante gewinnt.
  // Mandantenfaehig: jede Abfrage traegt die Kennung dieses Standorts, es wird
  // NICHTS zwischen Mandanten geteilt oder zwischengespeichert.
  const variants = nameQueryVariants(name);
  if (!variants.length) return { ok: true, patients: [] };
  const seen = new Map();
  let lastError = null;
  for (const query of variants) {
    const { status, data } = await cfPost("masSearchPatients", {
      clientId: searchClientId,
      locationId: norm(booking.locationId),
      query,
      contextPatientIds,
    });
    if (status !== 200 || data?.status !== "success") {
      lastError = data?.message || `masSearchPatients failed (${status})`;
      continue;
    }
    for (const p of Array.isArray(data.patients) ? data.patients : []) {
      const key = norm(p?.id) || `${norm(p?.firstName)} ${norm(p?.lastName)}`.toLowerCase();
      if (key && !seen.has(key)) seen.set(key, p);
    }
    // Genug gefunden? Dann keine weitere Abfrage — spart Lesevorgaenge.
    if (seen.size >= 3) break;
  }
  if (!seen.size && lastError) return { ok: false, error: lastError };
  return { ok: true, patients: [...seen.values()] };
}

// Step 1 of booking: resolve the calendar + visit motive + start time from the
// per-tenant config WITHOUT writing anything. The server uses this to drive the
// progressive, field-by-field fill of the live appointment dialog on the monitor.
export async function resolveBooking(clientId, args = {}) {
  const booking = await loadBooking(clientId);

  const cal = resolveCalendar(booking, args.doctorName);
  if (!cal) return { ok: false, error: "no_calendar" };

  const vm = resolveVisitMotive(booking, args.visitMotiveName) || defaultControlMotive(booking);
  if (!vm) return { ok: false, error: "no_motive" };

  const startIso = ensureBerlinTz(args.appointmentStartDate);
  return {
    ok: true,
    calendarId: cal.id,
    calendarName: cal.name || null,
    visitMotiveId: vm.id,
    visitMotiveName: vm.name || null,
    visitMotiveDuration: vm.duration || null,
    slotIso: startIso,
    date: startIso ? String(startIso).slice(0, 10) : null,
  };
}

// Step 2 of booking: actually write the appointment for the resolved patient via
// the dedicated Cloud Function. Returns booked / needsPhone / error. The server
// only calls this once it knows the patient has a phone on file (or to let the
// CF re-validate). Never called in dry-run mode.
export async function commitBooking(clientId, args = {}) {
  const booking = await loadBooking(clientId);
  const patientId = norm(args.patientId);
  if (!patientId) return { ok: false, error: "no_patient" };

  const body = {
    clientId: norm(booking.clientId) || clientId,
    locationId: norm(booking.locationId),
    patientId,
    calendarId: norm(args.calendarId),
    visitMotiveId: norm(args.visitMotiveId),
    appointmentStartDate: norm(args.slotIso),
  };
  const { status, data } = await cfPost("masBookAppointment", body);

  if (status === 200 && data?.status === "needs_phone") {
    return { ok: true, needsPhone: true, booked: false, patient: data.patient || null };
  }
  if (status === 200 && data?.status === "success") {
    return {
      ok: true,
      booked: true,
      appointmentId: data.appointmentId || null,
      alreadyBooked: !!data.alreadyBooked,
      patient: data.patient || null,
      doctorName: data.doctorName || null,
    };
  }
  return { ok: false, error: data?.message || `masBookAppointment failed (${status})` };
}
