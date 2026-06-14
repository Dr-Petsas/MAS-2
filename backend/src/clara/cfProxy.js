import { emitCommand } from "./sessions.js";
import { loadBooking } from "./booking.js";
import { buildAppointmentProof, storeProof } from "./proofCard.js";
import { notifyProofToDevices } from "./devices.js";

// Transparent proxy for the Pickadoc booking Cloud Functions.
//
// The v5.2 voice worker books DETERMINISTICALLY via its built-in appointment
// tools (LIVEAVATAR_LLM_COMPACT_PROMPT=1: booking logic lives in the worker, not
// the LLM). Those tools POST to {booking.cf_base_url}/{getFreeTimeSlots|...}.
//
// By pointing booking.cf_base_url at MAS-2 (/cf), the proven worker flow stays
// intact AND every search/booking transparently flows through here, where we (a)
// forward 1:1 to the real Cloud Function and (b) emit a live UI command so the
// monitor follows along. No worker code change, no reliance on LLM tool-calling.

const REAL_CF_BASE = (
  process.env.PICKADOC_REAL_CF_BASE_URL || "https://europe-west3-docgenda.cloudfunctions.net"
).replace(/\/+$/, "");

// Small per-client cache for calendarId -> name (cosmetic, for the live panel).
const calNameCache = new Map();
async function calendarName(clientId, calendarId) {
  if (!calendarId) return null;
  const key = `${clientId}:${calendarId}`;
  if (calNameCache.has(key)) return calNameCache.get(key);
  try {
    const booking = await loadBooking(clientId);
    for (const c of booking.calendars || []) {
      calNameCache.set(`${clientId}:${c.id}`, c.name);
    }
  } catch {
    /* booking config optional for naming */
  }
  return calNameCache.get(key) || null;
}

async function forward(route, body) {
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

function parseSlots(data) {
  const raw = data?.data?.free_time_slots;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw || [];
  } catch {
    return [];
  }
}

// POST /cf/getFreeTimeSlots — forward + emit a "navigate" command.
export async function proxyGetFreeTimeSlots(clientId, body) {
  const out = await forward("getFreeTimeSlots", body);
  if (out.status === 200 && out.data?.status === "success") {
    const slots = parseSlots(out.data);
    const date = slots[0] ? String(slots[0]).slice(0, 10) : (body?.startDate || null);
    if (date) {
      await emitCommand(clientId, {
        type: "navigate",
        date,
        calendarId: body?.calendarId || null,
        calendarName: await calendarName(clientId, body?.calendarId),
        slots: slots.slice(0, 12),
        visitMotiveName: body?.visitMotiveName || null,
      });
    }
  }
  return out;
}

// POST /cf/createAppointment — forward + emit an "appointment_created" command.
export async function proxyCreateAppointment(clientId, body) {
  if (process.env.MAS_BOOKING_DRY_RUN === "1") {
    await emitCreated(clientId, body);
    return { status: 200, data: { status: "success", dryRun: true } };
  }
  const out = await forward("createAppointment", body);
  if (out.status === 200 && out.data?.status === "success") {
    await emitCreated(clientId, body);
  }
  return out;
}

async function emitCreated(clientId, body) {
  const startIso = body?.appointmentStartDate || "";
  const calName = await calendarName(clientId, body?.calendarId);
  const proof = buildAppointmentProof(body, { calendarName: calName });
  let proofId = "";
  let proofImageUrl = "";
  try {
    proofId = await storeProof(clientId, proof);
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    if (base && proofId) proofImageUrl = `${base}/clara/proof/${encodeURIComponent(clientId)}/${encodeURIComponent(proofId)}.svg`;
  } catch {
    /* proof storage is best-effort */
  }
  await emitCommand(clientId, {
    type: "appointment_created",
    date: startIso ? String(startIso).slice(0, 10) : null,
    slotIso: startIso || null,
    calendarId: body?.calendarId || null,
    calendarName: calName,
    patient: {
      firstName: body?.patientFirstName || "",
      lastName: body?.patientLastName || "",
    },
    visitMotiveName: body?.visitMotiveName || null,
    proofId: proofId || null,
    proof,
  });
  if (proofId) {
    notifyProofToDevices(clientId, { ...proof, proofId, imageUrl: proofImageUrl }).catch(() => {});
  }
}

// updateOrCancelAppointment passes through untouched (no live command yet).
export async function proxyUpdateOrCancel(body) {
  return forward("updateOrCancelAppointment", body);
}
