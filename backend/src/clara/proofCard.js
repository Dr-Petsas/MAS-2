import { randomUUID } from "node:crypto";
import { masCollection } from "../tenant.js";
import { notifyProofToDevices } from "./devices.js";

const PROOF_TTL_MS = 7 * 24 * 3600 * 1000;

function escSvg(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ISO date (YYYY-MM-DD) -> German weekday + date for absence proofs. */
export function formatDateDe(isoDate) {
  const raw = String(isoDate ?? "").trim().slice(0, 10);
  if (!raw) return "";
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(d);
}

/** ISO slot -> German label for proof cards and pushes. */
export function formatSlotDe(iso) {
  const raw = String(iso ?? "").trim().replace(" ", "T");
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(d);
}

/** Build a structured proof object from a booking CF body. */
export function buildAppointmentProof(body, { calendarName = null } = {}) {
  const slotIso = body?.appointmentStartDate || body?.slotIso || "";
  const patient = `${body?.patientFirstName || ""} ${body?.patientLastName || ""}`.trim();
  return {
    kind: "appointment",
    title: "Termin eingetragen",
    slotIso: String(slotIso || ""),
    slotLabel: formatSlotDe(slotIso),
    date: slotIso ? String(slotIso).slice(0, 10) : null,
    patient,
    calendarName: calendarName || null,
    visitMotiveName: body?.visitMotiveName || null,
  };
}

/** Build a structured proof object when an absence block is written. */
export function buildAbsenceProof({ date, calendarName, windowLabel, cancelledCount = 0, phase = "entered" } = {}) {
  const cancelled = Number(cancelledCount) || 0;
  const title = phase === "approved" && cancelled > 0
    ? "Abwesenheit freigegeben"
    : "Abwesenheit eingetragen";
  return {
    kind: "absence",
    title,
    date: String(date || "").slice(0, 10) || null,
    dateLabel: formatDateDe(date),
    windowLabel: windowLabel || "ganztägig",
    calendarName: calendarName || null,
    cancelledCount: cancelled,
  };
}

function proofLines(proof) {
  if (proof?.kind === "absence") {
    return [
      proof.dateLabel && `Tag: ${proof.dateLabel}`,
      proof.windowLabel && `Zeitraum: ${proof.windowLabel}`,
      proof.calendarName && `Bei: ${proof.calendarName}`,
      proof.cancelledCount > 0 && `${proof.cancelledCount} Termin(e) abgesagt`,
    ].filter(Boolean);
  }
  return [
    proof.patient && `Patient: ${proof.patient}`,
    proof.slotLabel && `Wann: ${proof.slotLabel}`,
    proof.calendarName && `Bei: ${proof.calendarName}`,
    proof.visitMotiveName && `Grund: ${proof.visitMotiveName}`,
  ].filter(Boolean);
}

/** Render a compact SVG card (used as push image + inline proof). */
export function proofToSvg(proof) {
  const lines = proofLines(proof);
  const headerFill = proof?.kind === "absence" ? "#1e3a5f" : "#14532d";
  const accent = proof?.kind === "absence" ? "#60a5fa" : "#34d399";
  const body = lines
    .map((line, i) =>
      `<text x="24" y="${92 + i * 28}" fill="#cbd5e1" font-size="15" font-family="system-ui,sans-serif">${escSvg(line)}</text>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${Math.max(180, 90 + lines.length * 28 + 24)}" viewBox="0 0 400 ${Math.max(180, 90 + lines.length * 28 + 24)}">
  <rect width="400" height="100%" rx="16" fill="#0f172a" stroke="#334155" stroke-width="2"/>
  <rect x="0" y="0" width="400" height="52" rx="16" fill="${headerFill}"/>
  <text x="24" y="34" fill="${accent}" font-size="17" font-weight="700" font-family="system-ui,sans-serif">✓ ${escSvg(proof.title || (proof?.kind === "absence" ? "Abwesenheit eingetragen" : "Termin eingetragen"))}</text>
  ${body}
</svg>`;
}

export async function storeProof(clientId, proof) {
  const id = `p_${randomUUID().slice(0, 12)}`;
  await masCollection(clientId, "mas_proofs").doc(id).set({
    ...proof,
    id,
    clientId,
    createdAtMs: Date.now(),
  });
  return id;
}

export async function loadProof(clientId, proofId) {
  const snap = await masCollection(clientId, "mas_proofs").doc(String(proofId || "")).get();
  if (!snap.exists) return null;
  const proof = snap.data();
  if (Date.now() - (proof.createdAtMs || 0) > PROOF_TTL_MS) return null;
  return proof;
}

/**
 * Store proof, build SVG URL, push to paired phones. Returns the enriched proof
 * incl. `pushed` ({ ok, sent, failed }) so callers koennen WAHRHEITSGEMAESS
 * sagen, ob ein Beleg wirklich aufs Handy ging (nie behaupten, wenn kein Geraet
 * gekoppelt ist). Speichern/Push bleiben best-effort und werfen nie.
 */
export async function publishProof(clientId, proof) {
  let proofId = "";
  let proofImageUrl = "";
  try {
    proofId = await storeProof(clientId, proof);
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    if (base && proofId) {
      proofImageUrl = `${base}/clara/proof/${encodeURIComponent(clientId)}/${encodeURIComponent(proofId)}.svg`;
    }
  } catch {
    /* proof storage is best-effort */
  }
  let pushed = { ok: false, sent: 0, failed: 0 };
  if (proofId) {
    pushed = await notifyProofToDevices(clientId, { ...proof, proofId, imageUrl: proofImageUrl || null })
      .catch(() => ({ ok: false, sent: 0, failed: 0 }));
  }
  return { ...proof, proofId: proofId || null, imageUrl: proofImageUrl || null, pushed };
}
