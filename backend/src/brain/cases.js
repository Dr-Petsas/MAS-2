import { randomUUID } from "node:crypto";
import { normalizeSubject } from "./events.js";

// ============================================================================
// Vorgänge (Cases) — the follow-up layer of the shared brain.
//
// Events are raw FACTS (one call, one e-mail). A Case is the THREAD that ties
// them together and is followed through to resolution — exactly like a good
// help-desk ticket: it remembers how often and why someone got in touch, who
// did what and when (append-only update log), and how far the matter is solved
// (status). Repeat contacts about the same matter attach to the SAME case, so
// "Frau Meier ruft zum 3. Mal wegen der Rechnung an" falls out automatically.
//
// PURE module (no I/O): model, validation, lifecycle helpers. Persistence is in
// caseStore.js.
// ============================================================================

export const CASE_SCHEMA_VERSION = 1;

// Lifecycle. `waiting` = we're waiting on someone (patient/lab/colleague).
// `waiting_approval` = an AI draft is prepared and needs a human's go-ahead
// before it goes out (approval-first — nothing auto-sends to a patient).
export const CASE_STATUS = Object.freeze({
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  WAITING_APPROVAL: "waiting_approval",
  WAITING: "waiting",
  RESOLVED: "resolved",
  CLOSED: "closed",
});
const STATUS_SET = new Set(Object.values(CASE_STATUS));
const ACTIVE_STATUSES = new Set([CASE_STATUS.OPEN, CASE_STATUS.IN_PROGRESS, CASE_STATUS.WAITING_APPROVAL, CASE_STATUS.WAITING]);

export function isActiveStatus(status) {
  return ACTIVE_STATUSES.has(status);
}

// Kinds of update-log entries. `contact` = a new interaction was attached;
// `status` = a lifecycle change; `note` = a human/AI note; `system` = automatic.
export const UPDATE_KINDS = Object.freeze({
  CONTACT: "contact",
  STATUS: "status",
  NOTE: "note",
  SYSTEM: "system",
});

// Topics group contacts into threads. Derived from the dominant signal so the
// same concern threads together even across channels.
export const TOPICS = Object.freeze({
  COMPLAINT: "complaint",
  BILLING: "billing",
  APPOINTMENT: "appointment",
  CALLBACK: "callback",
  DOCUMENT: "document",
  OTHER: "other",
});

export const TOPIC_LABELS = Object.freeze({
  complaint: "Beschwerde",
  billing: "Rechnung/Kosten",
  appointment: "Termin",
  callback: "Rückruf",
  document: "Dokumente",
  other: "Allgemein",
});

// Map a communication channel to the actor that should be credited in the log.
export function actorForChannel(channel) {
  switch (channel) {
    case "bianca_call":
      return "Bianca";
    case "lisa_call":
    case "lisa_sms":
      return "Lisa";
    case "nadine_email":
    case "nadine_letter":
      return "Nadine";
    case "clara_voice":
      return "Clara";
    case "frontdesk":
      return "Team";
    default:
      return "System";
  }
}

/** Derive a thread topic from an event's signals (priority order). */
export function deriveTopic(signals = {}) {
  if (signals.complaintStated || signals.painPersists || signals.repeatVisitStated) return TOPICS.COMPLAINT;
  if (signals.billingQuestion) return TOPICS.BILLING;
  if (signals.appointmentRequest) return TOPICS.APPOINTMENT;
  if (signals.callbackRequested) return TOPICS.CALLBACK;
  if (signals.documentRelated) return TOPICS.DOCUMENT;
  return TOPICS.OTHER;
}

function s(v) {
  return v == null ? "" : String(v).trim();
}

/**
 * Build one append-only update-log entry. Always carries WHO and WHEN — this is
 * the customer-service audit trail.
 */
export function buildUpdate(input = {}) {
  const kind = Object.values(UPDATE_KINDS).includes(input.kind) ? input.kind : UPDATE_KINDS.NOTE;
  const entry = {
    id: s(input.id) || randomUUID(),
    ts: Number.isFinite(Number(input.ts)) ? Number(input.ts) : Date.now(),
    by: s(input.by) || "System",
    kind,
    text: s(input.text),
  };
  if (input.statusFrom) entry.statusFrom = s(input.statusFrom);
  if (input.statusTo) entry.statusTo = s(input.statusTo);
  if (input.eventId) entry.eventId = s(input.eventId);
  return entry;
}

/**
 * Build a canonical Case. Required: clientId. A first update is seeded so the
 * thread is never empty.
 */
export function buildCase(input = {}) {
  const clientId = s(input.clientId);
  if (!clientId) throw new Error("Case.clientId required");

  let status = s(input.status) || CASE_STATUS.OPEN;
  if (!STATUS_SET.has(status)) throw new Error(`Case.status invalid: "${status}"`);

  const subject = normalizeSubject(input.subject || {});
  const topic = Object.values(TOPICS).includes(input.topic) ? input.topic : TOPICS.OTHER;
  const createdBy = s(input.createdBy) || "System";
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();

  const title =
    s(input.title) ||
    `${TOPIC_LABELS[topic]}${subject.name ? ` – ${subject.name}` : ""}`;

  const seedUpdates = Array.isArray(input.updates) ? input.updates.map(buildUpdate) : [];

  return {
    id: s(input.id) || randomUUID(),
    schemaVersion: CASE_SCHEMA_VERSION,
    clientId,
    title,
    topic,
    subject,
    status,
    priority: s(input.priority) || "normal",
    assignee: s(input.assignee) || null,
    createdBy,
    createdAt: now,
    updatedAt: now,
    lastContactAt: Number.isFinite(Number(input.lastContactAt)) ? Number(input.lastContactAt) : now,
    contactCount: Number.isFinite(Number(input.contactCount)) ? Number(input.contactCount) : 0,
    eventIds: Array.isArray(input.eventIds) ? input.eventIds.map(s).filter(Boolean) : [],
    updates: seedUpdates,
  };
}

export function assertStatus(status) {
  if (!STATUS_SET.has(status)) {
    throw new Error(`Case.status invalid: "${status}" (allowed: ${[...STATUS_SET].join(", ")})`);
  }
}

// Who a case can be handed off to. These map onto the channel AIs plus humans.
export const ASSIGNEES = Object.freeze({
  NADINE: "Nadine", // formal letter / e-mail
  LISA: "Lisa", // outbound call / SMS
  CLARA: "Clara",
  TEAM: "Team", // a human handles it
});

const CHANNEL_PHRASE = Object.freeze({
  bianca_call: "am Telefon",
  lisa_call: "telefonisch (Lisa)",
  lisa_sms: "per SMS",
  nadine_email: "per E-Mail",
  nadine_letter: "per Brief",
  clara_voice: "über Clara",
  frontdesk: "am Empfang",
  system: "im System",
});

function tsToMs(v) {
  return v?.toMillis?.() ?? (typeof v === "number" ? v : 0);
}

function fmt(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Compile the COMPLETE context an assignee (Nadine/Lisa/a human) needs to act —
 * the whole thread in plain words: what it is about, the patient, status, every
 * contact in order, and the handoff instruction. This is what Nadine reads
 * before writing the letter, or Lisa before calling back. Pure + linkable to
 * raw transcripts via the events' payloadRef.
 *
 * @param {object} caseDoc
 * @param {object[]} events full linked events (chronological-ish; we sort)
 * @returns {string}
 */
export function compileCaseContext(caseDoc, events = []) {
  if (!caseDoc) return "";
  const lines = [];
  const subj = caseDoc.subject || {};
  lines.push(`Vorgang: ${caseDoc.title}`);
  lines.push(`Thema: ${TOPIC_LABELS[caseDoc.topic] || caseDoc.topic}`);
  if (subj.name) lines.push(`Patient: ${subj.name}${subj.matchStatus && subj.matchStatus !== "matched" ? ` (Zuordnung: ${subj.matchStatus})` : ""}`);
  lines.push(`Status: ${caseDoc.status} · Kontakte: ${caseDoc.contactCount || 0}`);
  if (caseDoc.handoff?.assignee) {
    lines.push(`Auftrag an ${caseDoc.handoff.assignee}: ${caseDoc.handoff.instruction || "(keine nähere Angabe)"} — beauftragt von ${caseDoc.handoff.by || "Team"}.`);
  }

  const sorted = [...events].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  if (sorted.length) {
    lines.push("");
    lines.push("Verlauf der Kontakte:");
    for (const e of sorted) {
      const when = fmt(e.ts);
      const how = CHANNEL_PHRASE[e.channel] || e.channel || "";
      const corrected = e._humanReviewed ? " [vom Team korrigiert]" : "";
      lines.push(`- ${when} ${how}${corrected}: ${e.summary || "(ohne Zusammenfassung)"}`);
    }
  }

  // The thread's human/AI notes (status changes, delegations, manual notes).
  const updates = [...(caseDoc.updates || [])].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const notes = updates.filter((u) => u.kind === "note" || u.kind === "status");
  if (notes.length) {
    lines.push("");
    lines.push("Notizen / Schritte:");
    for (const u of notes) {
      const when = fmt(u.ts);
      const what = u.kind === "status" ? `Status → ${u.statusTo}${u.text ? ` (${u.text})` : ""}` : u.text;
      lines.push(`- ${when} ${u.by}: ${what}`);
    }
  }

  return lines.join("\n");
}

// Subject lines per topic for an outgoing patient message.
const DRAFT_SUBJECTS = Object.freeze({
  billing: "Ihre Rechnung",
  appointment: "Ihr Termin",
  callback: "Ihre Anfrage",
  complaint: "Ihr Anliegen",
  document: "Ihre Unterlagen",
  other: "Ihre Nachricht an die Praxis",
});

/**
 * A ready-to-edit starter draft so Nadine begins from a written draft, not a
 * blank page. Deterministic German, neutral and safe — the human/AI finalises
 * it. Pulls the matter from the handoff instruction or the latest contact.
 *
 * @param {object} caseDoc
 * @returns {{channel:string, to:string, subject:string, body:string}}
 */
export function buildEmailDraft(caseDoc) {
  if (!caseDoc) return { channel: "email", to: "", subject: "", body: "" };
  const name = caseDoc.subject?.name || "";
  const subject = DRAFT_SUBJECTS[caseDoc.topic] || caseDoc.title || "Ihre Nachricht an die Praxis";

  const instruction = caseDoc.handoff?.instruction || "";
  const lastContact = [...(caseDoc.updates || [])]
    .filter((u) => u.kind === "contact")
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(-1)[0]?.text || "";
  const matter = instruction || lastContact;

  const greeting = name ? `Guten Tag ${name},` : "Guten Tag,";
  const bodyLines = [
    greeting,
    "",
    "vielen Dank für Ihre Nachricht.",
  ];
  if (matter) {
    bodyLines.push("", `Betreff Ihres Anliegens: ${matter}`);
  }
  bodyLines.push(
    "",
    "[Hier den Text ergänzen.]",
    "",
    "Mit freundlichen Grüßen",
    "Ihr Praxisteam"
  );
  return { channel: "email", to: "", subject, body: bodyLines.join("\n") };
}

export { tsToMs };
