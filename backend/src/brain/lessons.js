import { createHash, randomUUID } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { getCase } from "./caseStore.js";

// ============================================================================
// Living Prompt — Erkenntnisse (Lessons).
//
// A Lesson is ONE learned behavioural rule for an AI agent, distilled from real
// outcomes in the shared brain (cases/events). Lessons are the ONLY way agent
// behaviour evolves — and they are guarded:
//
//   * Evidence required: every lesson links the case ids it was learned from.
//   * Status machine: proposed -> active (human approval) | rejected;
//     active -> retired. LLM output is NEVER directly effective.
//   * Dedupe: a normalized rule key prevents the same insight piling up.
//   * Cap: at most MAX_ACTIVE_LESSONS active per agent — a prompt that grows
//     unbounded gets worse, not better.
//
// Storage: clients/{clientId}/mas_prompt_lessons/{lessonId}
// Compilation into versioned prompts lives in livingPrompt.js.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const COLLECTION = "mas_prompt_lessons";

export const LESSON_AGENTS = Object.freeze(["lisa", "bianca", "clara", "nadine", "all"]);
const AGENT_SET = new Set(LESSON_AGENTS);

export const LESSON_STATUS = Object.freeze({
  PROPOSED: "proposed",
  ACTIVE: "active",
  REJECTED: "rejected",
  RETIRED: "retired",
});

export const MAX_ACTIVE_LESSONS = 15; // per agent (incl. "all" lessons it inherits)
const RULE_MIN = 12;
const RULE_MAX = 300;
const MIN_CONFIDENCE = 0.5;

function col(clientId) {
  return masCollection(clientId, COLLECTION);
}

function s(v) {
  return v == null ? "" : String(v).trim();
}

/**
 * Stable dedupe key for a rule text: case/umlaut/punctuation-insensitive, so
 * "Bei Senioren erst nach dem Befinden fragen!" and "bei senioren erst nach dem
 * befinden fragen" collapse to one key.
 */
export function ruleKeyOf(rule) {
  const norm = String(rule || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
  if (!norm) return "";
  return createHash("sha256").update(norm).digest("hex").slice(0, 16);
}

/**
 * Structural validation of a lesson proposal (LLM or human input). Pure.
 * This is the machine filter BEFORE anything reaches a human: bad shape,
 * missing evidence or low confidence never even shows up for approval.
 *
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
export function validateLessonProposal(input = {}) {
  const agent = s(input.agent).toLowerCase();
  if (!AGENT_SET.has(agent)) return { ok: false, reason: "invalid_agent" };

  const rule = s(input.rule);
  if (rule.length < RULE_MIN) return { ok: false, reason: "rule_too_short" };
  if (rule.length > RULE_MAX) return { ok: false, reason: "rule_too_long" };

  const evidence = Array.isArray(input.evidenceCaseIds) ? input.evidenceCaseIds.map(s).filter(Boolean) : [];
  if (evidence.length < 1) return { ok: false, reason: "missing_evidence" };

  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return { ok: false, reason: "invalid_confidence" };
  if (confidence < MIN_CONFIDENCE) return { ok: false, reason: "low_confidence" };

  return { ok: true };
}

/** Canonical lesson doc. Assumes validateLessonProposal passed. Pure. */
export function buildLesson(input = {}) {
  const rule = s(input.rule);
  return {
    id: s(input.id) || randomUUID(),
    schemaVersion: 1,
    agent: s(input.agent).toLowerCase(),
    rule,
    ruleKey: ruleKeyOf(rule),
    scopeNote: s(input.scopeNote).slice(0, 200),
    evidenceCaseIds: [...new Set((input.evidenceCaseIds || []).map(s).filter(Boolean))].slice(0, 20),
    confidence: Math.max(0, Math.min(1, Number(input.confidence))),
    source: input.source === "manual" ? "manual" : "reflection",
    status: LESSON_STATUS.PROPOSED,
    createdAt: Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now(),
    decidedAt: null,
    decidedBy: null,
    decisionNote: "",
    retiredAt: null,
    retiredBy: null,
    retireReason: "",
  };
}

/**
 * Propose a lesson. Runs the full guard chain:
 *   structural validation -> evidence cases must EXIST -> dedupe by ruleKey
 * Only then is it stored as `proposed` (still without any effect on prompts).
 *
 * @returns {Promise<{ok:boolean, lesson?:object, reason?:string}>}
 */
export async function proposeLesson(clientId, input = {}) {
  const v = validateLessonProposal(input);
  if (!v.ok) return v;

  const lesson = buildLesson(input);

  // Evidence must point at real cases — an LLM cannot invent its proof.
  for (const caseId of lesson.evidenceCaseIds) {
    const c = await getCase(clientId, caseId).catch(() => null);
    if (!c) return { ok: false, reason: "evidence_not_found", caseId };
  }

  // Dedupe against any not-discarded lesson with the same normalized rule.
  const dupSnap = await col(clientId).where("ruleKey", "==", lesson.ruleKey).limit(10).get();
  const dup = dupSnap.docs.map((d) => d.data()).find(
    (l) => l.status === LESSON_STATUS.PROPOSED || l.status === LESSON_STATUS.ACTIVE
  );
  if (dup) return { ok: false, reason: "duplicate", existingId: dup.id };

  await col(clientId).doc(lesson.id).set(lesson);
  return { ok: true, lesson };
}

/** List lessons, optionally filtered by status and/or agent. Newest first. */
export async function listLessons(clientId, { status, agent, limit = 100 } = {}) {
  let q = col(clientId);
  const st = s(status);
  if (st) q = q.where("status", "==", st);
  const snap = await q.limit(300).get();
  let lessons = snap.docs.map((d) => d.data());
  const ag = s(agent).toLowerCase();
  if (ag) lessons = lessons.filter((l) => l.agent === ag || l.agent === "all");
  lessons.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return lessons.slice(0, limit);
}

async function countActiveFor(clientId, agent) {
  const snap = await col(clientId).where("status", "==", LESSON_STATUS.ACTIVE).limit(300).get();
  return snap.docs.map((d) => d.data()).filter((l) => l.agent === agent || l.agent === "all").length;
}

/**
 * Human decision on a proposed lesson: approve (-> active) or reject.
 * Approval enforces the active cap so the compiled prompt stays bounded.
 */
export async function decideLesson(clientId, lessonId, { approve, by, note } = {}) {
  const id = s(lessonId);
  if (!id) return { ok: false, reason: "missing_id" };
  const who = s(by);
  if (!who) return { ok: false, reason: "missing_by" };

  const ref = col(clientId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const lesson = snap.data();
  if (lesson.status !== LESSON_STATUS.PROPOSED) return { ok: false, reason: "not_proposed", status: lesson.status };

  if (approve) {
    const active = await countActiveFor(clientId, lesson.agent);
    if (active >= MAX_ACTIVE_LESSONS) return { ok: false, reason: "active_cap_reached", cap: MAX_ACTIVE_LESSONS };
  }

  const status = approve ? LESSON_STATUS.ACTIVE : LESSON_STATUS.REJECTED;
  await ref.update({ status, decidedAt: Date.now(), decidedBy: who, decisionNote: s(note) });
  return { ok: true, status };
}

/** Retire an active lesson (it stops being compiled into future versions). */
export async function retireLesson(clientId, lessonId, { by, reason } = {}) {
  const id = s(lessonId);
  if (!id) return { ok: false, reason: "missing_id" };
  const who = s(by);
  if (!who) return { ok: false, reason: "missing_by" };

  const ref = col(clientId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const lesson = snap.data();
  if (lesson.status !== LESSON_STATUS.ACTIVE) return { ok: false, reason: "not_active", status: lesson.status };

  await ref.update({ status: LESSON_STATUS.RETIRED, retiredAt: Date.now(), retiredBy: who, retireReason: s(reason) });
  return { ok: true };
}

/**
 * The active lessons an agent inherits ("all" + its own), oldest approval
 * first (stable order => deterministic compilation), capped.
 */
export async function activeLessonsFor(clientId, agent) {
  const ag = s(agent).toLowerCase();
  const snap = await col(clientId).where("status", "==", LESSON_STATUS.ACTIVE).limit(300).get();
  return snap.docs
    .map((d) => d.data())
    .filter((l) => l.agent === ag || l.agent === "all")
    .sort((a, b) => (a.decidedAt || 0) - (b.decidedAt || 0))
    .slice(0, MAX_ACTIVE_LESSONS);
}

/** Test/DSGVO helper: wipe all lessons of a tenant. */
export async function _deleteAllLessons(clientId) {
  const snap = await col(clientId).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  return snap.size;
}

export { FieldValue };
