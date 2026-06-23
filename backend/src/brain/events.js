import { randomUUID } from "node:crypto";

// ============================================================================
// The shared brain — Event envelope (the foundational contract).
//
// Every interaction in the practice (incoming/outgoing call, SMS, e-mail,
// scanned letter, Clara voice note, and later QM / dictation / treatment-room
// audio) becomes ONE immutable Event on a patient's timeline. Briefing,
// on-demand Q&A ("Clara, was war heute los?"), and the revenue coach are all
// just read-models over these events.
//
// Design principles (do not erode these):
//  1. ONE generic, channel-agnostic envelope. New channels = new `channel`
//     value, never a new shape. Raw data (transcript/e-mail) is REFERENCED via
//     `payloadRef`, never copied in — data minimisation + privacy by design.
//  2. Append-only. Events are facts and never mutated. Operational state
//     (open/resolved) is the only thing that changes, and resolution is itself
//     recorded as a new event for the audit trail.
//  3. `counterparty` (who made contact) is separate from `subject` (which
//     patient it is about) — a colleague can call about a patient.
//  4. Everything machine-derived carries provenance (`extractor`) and
//     `confidence`, and the human-readable `summary` is attributed ("laut
//     Anruf …") so a human can verify in seconds.
//  5. `schemaVersion` is stamped on every event so the model/prompt can evolve
//     without breaking old data.
//
// This module is PURE (no I/O): it defines, validates and normalises the
// envelope. Persistence lives in eventStore.js.
// ============================================================================

export const SCHEMA_VERSION = 1;

// Communication channels. Extend this list as new AIs/sources come online
// (qm, dictation, room_audio, …). Keep it an allow-list so the read-models stay
// reliable; unknown channels are rejected rather than silently mis-grouped.
export const CHANNELS = Object.freeze({
  BIANCA_CALL: "bianca_call", // inbound phone (AI)
  LISA_CALL: "lisa_call", // outbound phone (AI)
  LISA_SMS: "lisa_sms", // outbound SMS (AI)
  NADINE_EMAIL: "nadine_email", // inbound/outbound e-mail (AI)
  NADINE_LETTER: "nadine_letter", // scanned letter / fax (AI, OCR)
  CLARA_VOICE: "clara_voice", // in-practice voice copilot
  LENA_DOC: "lena_doc", // Behandlungsdokumentation (Diktat/schriftlich) via Lena
  FRONTDESK: "frontdesk", // a human team member logged something
  SYSTEM: "system", // observed platform automation (docs, reminders, …)
});
const CHANNEL_SET = new Set(Object.values(CHANNELS));

export const DIRECTIONS = Object.freeze({ IN: "in", OUT: "out", INTERNAL: "internal" });
const DIRECTION_SET = new Set(Object.values(DIRECTIONS));

export const EVENT_TYPES = Object.freeze({
  INTERACTION: "interaction", // a real contact (call/mail/sms/visit)
  OBSERVATION: "observation", // a system fact we observed (docs sent, no-show)
  NOTE: "note", // a free internal note / resolution marker
});
const TYPE_SET = new Set(Object.values(EVENT_TYPES));

// Who made contact. NOT necessarily the patient (Dr. Müller calls about X).
export const COUNTERPARTY_KINDS = Object.freeze({
  PATIENT: "patient",
  COLLEAGUE: "colleague", // another doctor / referrer
  LAB: "lab",
  PHARMACY: "pharmacy",
  INSURER: "insurer",
  OTHER: "other",
  UNKNOWN: "unknown",
  SYSTEM: "system",
});
const COUNTERPARTY_SET = new Set(Object.values(COUNTERPARTY_KINDS));

// How confident we are that the event is linked to the right patient. We never
// guess: ambiguous/unmatched is surfaced honestly (e.g. in the briefing).
export const MATCH_STATUS = Object.freeze({
  MATCHED: "matched",
  UNMATCHED: "unmatched",
  AMBIGUOUS: "ambiguous",
  NOT_APPLICABLE: "n/a",
});
const MATCH_SET = new Set(Object.values(MATCH_STATUS));

// Lifecycle of an actionable item. Non-actionable events use NONE.
export const ITEM_STATUS = Object.freeze({
  NONE: "none",
  OPEN: "open",
  RESOLVED: "resolved",
});
const STATUS_SET = new Set(Object.values(ITEM_STATUS));

// Controlled signal vocabulary. v1 deliberately favours HIGH-PRECISION content
// reports (what was said) over subjective judgement. `sentiment` is the only
// interpretive field and may be left "unknown".
export const SENTIMENTS = Object.freeze(["positive", "neutral", "negative", "unknown"]);
const SENTIMENT_SET = new Set(SENTIMENTS);

// Boolean "what was said / what happened" signals.
export const SIGNAL_FLAGS = Object.freeze([
  "callbackRequested", // patient asks to be called back
  "appointmentRequest", // wants to book/move/cancel
  "billingQuestion", // asked about an invoice / costs
  "complaintStated", // voiced a complaint / dissatisfaction (as stated)
  "repeatVisitStated", // said they've been in repeatedly (as stated)
  "painPersists", // said symptoms persist (as stated)
  "documentRelated", // about forms / documents
  "abortedEarly", // call ended abruptly / very short
  "unresolvedByAI", // the AI could not resolve the matter
  "needsHuman", // explicitly should reach a human / the doctor
  "critical", // Eskalations-Radar: Anwalt/Kammer/Mahnung/Pfändung/Eskalation
]);
const FLAG_SET = new Set(SIGNAL_FLAGS);

function s(v) {
  return v == null ? "" : String(v).trim();
}

// Honorifics/titles that must not become part of an identity key.
const HONORIFICS = new Set(["herr", "frau", "familie", "fam", "dr", "prof", "med", "dent", "von", "de", "der", "die"]);

/**
 * A stable identity key from a (possibly unmatched) spoken name. Folds umlauts,
 * drops honorifics/punctuation, sorts tokens so "Familie Müller" and "Müller"
 * thread together and "Peter Mayer" == "Mayer, Peter". Empty when no usable
 * name. This lets repeat calls from an UNMATCHED but named caller attach to the
 * SAME case instead of spawning duplicates.
 */
export function nameKeyOf(name) {
  const folded = String(name || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  const toks = folded
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((t) => t.length > 1 && !HONORIFICS.has(t));
  return [...new Set(toks)].sort().join(" ");
}

function clampConfidence(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

export function normalizeSignals(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of SIGNAL_FLAGS) {
    if (raw[key] === true) out[key] = true; // only store positive flags (sparse)
  }
  if (Array.isArray(raw.topics)) {
    const topics = [...new Set(raw.topics.map((t) => s(t).toLowerCase()).filter(Boolean))];
    if (topics.length) out.topics = topics.slice(0, 12);
  }
  if (raw.sentiment != null) {
    const sentiment = s(raw.sentiment).toLowerCase();
    if (SENTIMENT_SET.has(sentiment) && sentiment !== "unknown") out.sentiment = sentiment;
  }
  return out;
}

function assertEnum(value, set, field) {
  if (!set.has(value)) {
    throw new Error(`Event.${field} invalid: "${value}" (allowed: ${[...set].join(", ")})`);
  }
}

/**
 * Validate + normalise raw input into a canonical Event envelope.
 *
 * Required: clientId, channel. Everything else has safe defaults. Pure: returns
 * a plain object ready to persist; throws on invalid enums so bad data never
 * enters the pool.
 *
 * @param {object} input
 * @returns {object} canonical event
 */
export function buildEvent(input = {}) {
  const clientId = s(input.clientId);
  if (!clientId) throw new Error("Event.clientId required");

  const channel = s(input.channel) || CHANNELS.SYSTEM;
  assertEnum(channel, CHANNEL_SET, "channel");

  const type = s(input.type) || EVENT_TYPES.INTERACTION;
  assertEnum(type, TYPE_SET, "type");

  const direction = s(input.direction) || (channel === CHANNELS.SYSTEM ? DIRECTIONS.INTERNAL : DIRECTIONS.IN);
  assertEnum(direction, DIRECTION_SET, "direction");

  // counterparty (who made contact)
  const cpKind = s(input.counterparty?.kind) || COUNTERPARTY_KINDS.UNKNOWN;
  assertEnum(cpKind, COUNTERPARTY_SET, "counterparty.kind");
  const counterparty = {
    kind: cpKind,
    name: s(input.counterparty?.name),
    ref: s(input.counterparty?.ref) || null,
  };

  // subject (which patient it is about) — may be unmatched/ambiguous
  const subjectPatientId = s(input.subject?.patientId);
  let matchStatus = s(input.subject?.matchStatus);
  if (!matchStatus) {
    matchStatus = subjectPatientId ? MATCH_STATUS.MATCHED : MATCH_STATUS.UNMATCHED;
  }
  assertEnum(matchStatus, MATCH_SET, "subject.matchStatus");
  const subjectName = s(input.subject?.name);
  const subject = {
    patientId: subjectPatientId || null,
    name: subjectName,
    matchStatus,
    // How the patient was identified: "email" (exact, strong), "name"
    // (verified last-name match), or null. Downstream uses this to decide
    // whether it is safe to pull the patient's prior history into a draft.
    matchMethod: s(input.subject?.matchMethod) || null,
    nameKey: s(input.subject?.nameKey) || nameKeyOf(subjectName) || null,
  };

  // lifecycle
  let status = s(input.status);
  if (!status) {
    // default: an interaction with any actionable flag is "open", else "none"
    const sig = normalizeSignals(input.signals);
    // Anything the practice should act on opens an item. This includes the
    // "5th time for the same filling" (repeatVisitStated/painPersists) and
    // document requests — exactly the matters the briefing must surface.
    const actionable =
      sig.callbackRequested ||
      sig.appointmentRequest ||
      sig.billingQuestion ||
      sig.unresolvedByAI ||
      sig.needsHuman ||
      sig.complaintStated ||
      sig.documentRelated ||
      sig.painPersists ||
      sig.repeatVisitStated ||
      sig.critical;
    status = actionable ? ITEM_STATUS.OPEN : ITEM_STATUS.NONE;
  }
  assertEnum(status, STATUS_SET, "status");

  const ts = Number.isFinite(Number(input.ts)) ? Number(input.ts) : Date.now();

  const event = {
    id: s(input.id) || randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    clientId,
    ts,
    channel,
    direction,
    type,
    counterparty,
    subject,
    summary: s(input.summary), // human-readable, ATTRIBUTED ("laut Anruf …")
    signals: normalizeSignals(input.signals),
    confidence: clampConfidence(input.confidence),
    status,
    resolvedBy: null,
    resolvesEventId: s(input.resolvesEventId) || null,
    payloadRef: input.payloadRef
      ? { kind: s(input.payloadRef.kind), id: s(input.payloadRef.id) }
      : null,
    extractor: s(input.extractor) || null, // e.g. "qwen8b@v1" — provenance
    tags: Array.isArray(input.tags) ? input.tags.map(s).filter(Boolean).slice(0, 20) : [],
    // Fristen-Wächter: erkannte Frist (epoch ms, Tagesende) — null wenn keine.
    deadlineMs: Number.isFinite(Number(input.deadlineMs)) && Number(input.deadlineMs) > 0
      ? Number(input.deadlineMs)
      : null,
  };

  return event;
}

/** True if the event represents an actionable, still-open item. */
export function isOpenItem(event) {
  return event?.status === ITEM_STATUS.OPEN;
}

/**
 * Human-in-the-loop overlay. A team member can correct what an AI extracted
 * (wrong summary, wrong signal, wrong patient) without destroying the original
 * fact — corrections live in `event.humanReview` and are merged on read. This
 * is what makes "pre/post-call edits" safe and fully audited.
 *
 * @param {object} event raw stored event
 * @returns {object} effective event (corrections applied) for display/aggregation
 */
export function applyHumanReview(event) {
  const hr = event?.humanReview;
  if (!hr) return event;
  return {
    ...event,
    summary: hr.summary != null && hr.summary !== "" ? hr.summary : event.summary,
    signals: hr.signals && typeof hr.signals === "object" ? hr.signals : event.signals,
    subject: hr.subject && typeof hr.subject === "object" ? { ...event.subject, ...hr.subject } : event.subject,
    _humanReviewed: true,
  };
}

/** Normalise a human-supplied subject correction (validates matchStatus). */
export function normalizeSubject(raw = {}) {
  const patientId = s(raw.patientId) || null;
  let matchStatus = s(raw.matchStatus);
  if (!matchStatus) matchStatus = patientId ? MATCH_STATUS.MATCHED : MATCH_STATUS.UNMATCHED;
  assertEnum(matchStatus, MATCH_SET, "subject.matchStatus");
  const name = s(raw.name);
  // A human-confirmed correction is treated as a strong identity ("name").
  const matchMethod = s(raw.matchMethod) || (patientId ? "name" : null);
  return { patientId, name, matchStatus, matchMethod, nameKey: s(raw.nameKey) || nameKeyOf(name) || null };
}
