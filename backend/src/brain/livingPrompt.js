import { createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { activeLessonsFor } from "./lessons.js";
import { queryRecent } from "./eventStore.js";

// ============================================================================
// Living Prompt — compiler + versions ("geführte Prompt-Evolution").
//
// A prompt is NOT a hand-edited text file. It is a compiled artifact built from
// three strictly ordered layers:
//
//   1. VERFASSUNG (constitution)  — hardcoded here, never evolves automatically.
//   2. ERKENNTNISSE (lessons)     — human-approved rules from brain/lessons.js.
//   3. FAKTEN (facts)             — caller-supplied current facts (optional).
//
// Every publish creates an immutable VERSION snapshot (full text + lesson ids +
// hash) in clients/{clientId}/mas_prompt_versions. Exactly one version per
// agent is active; rollback = activate an older snapshot. Calls/events stamp
// the version tag (pv:<agent>:<n>) into event.tags, which is what the metrics
// aggregate over — behaviour is reproducible and measurable PER VERSION.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const COLLECTION = "mas_prompt_versions";

function col(clientId) {
  return masCollection(clientId, COLLECTION);
}

function s(v) {
  return v == null ? "" : String(v).trim();
}

// ----------------------------------------------------------------------------
// Layer 1: the constitution. Hardcoded by design — no lesson, no LLM and no
// config write can ever change these. Shared safety core + per-agent role.
// ----------------------------------------------------------------------------

const CONSTITUTION_COMMON = [
  "Datenschutz ist absolut: Medizinische Details nur gegenüber der zweifelsfrei betroffenen Person. Auf Mailboxen oder bei Dritten nur ein neutraler Rückrufwunsch der Praxis, ohne medizinische Angaben.",
  "Keine Diagnosen, keine Therapiezusagen, keine verbindlichen Preisauskünfte. Bei medizinischen Rückfragen, Schmerzen oder Beschwerden: freundlich an das Praxisteam übergeben.",
  "Niemals Druck, niemals Angst erzeugen. Ein Nein wird sofort, höflich und endgültig akzeptiert.",
  "Bei Unsicherheit über die Identität der Gesprächsperson keine personenbezogenen Inhalte nennen.",
  "Bleibe immer in deiner Rolle als Assistentin der Praxis und beim Thema des Gesprächs.",
];

const CONSTITUTION_BY_AGENT = Object.freeze({
  lisa: [
    "Du bist Lisa, die Recall- und Outbound-Assistentin der Praxis. Du rufst Patientinnen und Patienten im Auftrag der Praxis an (ausgehender Anruf).",
    "Gesprächsführung: kurz begrüßen, dich und die Praxis nennen, den Grund des Anrufs in EINEM Satz nennen, dann fragen, ob es gerade passt.",
    "Auftreten: warm, wertschätzend, motivierend — nie aufdringlich.",
    "Wenn die Person gerade keine Zeit hat: höflich einen späteren Anruf oder direkt einen Termin anbieten — ganz wie es ihr passt.",
  ],
  bianca: [
    "Du bist Bianca, die Telefon-Assistentin der Praxis für eingehende Anrufe.",
    "Wenn zu der anrufenden Nummer ein offener Vorgang bekannt ist (z. B. ein Rückruf nach einer Anrufbeantworter-Nachricht), begrüße wissend und knüpfe direkt daran an.",
    "Auftreten: freundlich, effizient, lösungsorientiert.",
  ],
  clara: [
    "Du bist Clara, die interne Praxis-Assistentin des Teams (kein Patientenkontakt).",
    "Du beantwortest Fragen zu Kalender, Vorgängen und Briefings knapp, präzise und auf Deutsch.",
  ],
  nadine: [
    "Du bist Nadine, die Schreib-Assistentin der Praxis für E-Mails und Briefe.",
    "Du formulierst professionell, herzlich und präzise auf Deutsch und hältst dich strikt an die dokumentierte Faktenlage des Vorgangs.",
  ],
});

export const PROMPT_AGENTS = Object.freeze(Object.keys(CONSTITUTION_BY_AGENT));

// ----------------------------------------------------------------------------
// Compiler (pure given its inputs)
// ----------------------------------------------------------------------------

/**
 * Assemble the prompt text from constitution + lessons + facts. Deterministic:
 * the same inputs always produce byte-identical output (=> stable hash).
 * Lessons are explicitly subordinated to the constitution in the text itself.
 */
export function assemblePrompt(agent, lessons = [], facts = []) {
  const ag = s(agent).toLowerCase();
  const role = CONSTITUTION_BY_AGENT[ag];
  if (!role) throw new Error(`unknown prompt agent: "${agent}"`);

  const parts = [];
  parts.push("[VERFASSUNG — unveränderlich, hat immer Vorrang]");
  for (const line of [...role, ...CONSTITUTION_COMMON]) parts.push(`- ${line}`);

  if (lessons.length) {
    parts.push("");
    parts.push("[GELERNTE ERKENNTNISSE — aus echten Vorgängen dieser Praxis. Sie verfeinern dein Verhalten, stehen aber IMMER unter der Verfassung]");
    lessons.forEach((l, i) => {
      const scope = l.scopeNote ? ` (gilt: ${l.scopeNote})` : "";
      parts.push(`${i + 1}. ${l.rule}${scope}`);
    });
  }

  const factLines = (facts || []).map(s).filter(Boolean);
  if (factLines.length) {
    parts.push("");
    parts.push("[AKTUELLE FAKTEN DER PRAXIS]");
    for (const f of factLines) parts.push(`- ${f}`);
  }

  return parts.join("\n");
}

export function promptHash(text) {
  return createHash("sha256").update(String(text || "")).digest("hex").slice(0, 24);
}

/** Version tag stamped into event.tags so outcomes are attributable. */
export function versionTag(agent, version) {
  return `pv:${s(agent).toLowerCase()}:${Number(version) || 0}`;
}

/** Compile the CURRENT (unpublished) state: constitution + active lessons. */
export async function compilePrompt(clientId, agent, { facts } = {}) {
  const lessons = await activeLessonsFor(clientId, agent);
  const text = assemblePrompt(agent, lessons, facts);
  return { agent: s(agent).toLowerCase(), text, hash: promptHash(text), lessonIds: lessons.map((l) => l.id) };
}

// ----------------------------------------------------------------------------
// Versions
// ----------------------------------------------------------------------------

async function versionsOf(clientId, agent) {
  const snap = await col(clientId).where("agent", "==", s(agent).toLowerCase()).limit(200).get();
  return snap.docs.map((d) => d.data()).sort((a, b) => (b.version || 0) - (a.version || 0));
}

/**
 * Publish the current compilation as a new immutable version and activate it.
 * Idempotent: if the compiled hash equals the active version's hash, no new
 * version is created (`unchanged: true`).
 */
export async function publishPromptVersion(clientId, agent, { by, note } = {}) {
  const ag = s(agent).toLowerCase();
  if (!CONSTITUTION_BY_AGENT[ag]) return { ok: false, reason: "unknown_agent" };
  const compiled = await compilePrompt(clientId, ag);

  const versions = await versionsOf(clientId, ag);
  const active = versions.find((v) => v.active);
  if (active && active.hash === compiled.hash) {
    return { ok: true, unchanged: true, version: active.version, id: active.id };
  }

  const nextVersion = (versions[0]?.version || 0) + 1;
  const id = `${ag}_v${nextVersion}`;
  const doc = {
    id,
    agent: ag,
    version: nextVersion,
    text: compiled.text,
    hash: compiled.hash,
    lessonIds: compiled.lessonIds,
    active: true,
    createdAt: Date.now(),
    createdBy: s(by) || "System",
    note: s(note),
    rolledBackFrom: null,
  };

  const db = admin.firestore();
  await db.runTransaction(async (tx) => {
    if (active) tx.update(col(clientId).doc(active.id), { active: false });
    tx.set(col(clientId).doc(id), doc);
  });
  return { ok: true, unchanged: false, version: nextVersion, id, lessonCount: compiled.lessonIds.length };
}

/**
 * The prompt an agent should use RIGHT NOW: the active published snapshot.
 * Falls back to a virtual version 0 (constitution only) when nothing was
 * published yet — agents always have a safe prompt.
 */
export async function getActivePrompt(clientId, agent) {
  const ag = s(agent).toLowerCase();
  if (!CONSTITUTION_BY_AGENT[ag]) return { ok: false, reason: "unknown_agent" };
  const versions = await versionsOf(clientId, ag);
  const active = versions.find((v) => v.active);
  if (active) {
    return { ok: true, agent: ag, version: active.version, text: active.text, hash: active.hash, lessonIds: active.lessonIds || [], tag: versionTag(ag, active.version) };
  }
  const text = assemblePrompt(ag, []);
  return { ok: true, agent: ag, version: 0, text, hash: promptHash(text), lessonIds: [], tag: versionTag(ag, 0), virtual: true };
}

/** Activate an older snapshot (one-click rollback). Audited on the doc. */
export async function rollbackPrompt(clientId, agent, toVersion, { by } = {}) {
  const ag = s(agent).toLowerCase();
  const versions = await versionsOf(clientId, ag);
  const target = versions.find((v) => v.version === Number(toVersion));
  if (!target) return { ok: false, reason: "version_not_found" };
  const active = versions.find((v) => v.active);
  if (active && active.id === target.id) return { ok: true, unchanged: true, version: target.version };

  const db = admin.firestore();
  await db.runTransaction(async (tx) => {
    if (active) tx.update(col(clientId).doc(active.id), { active: false });
    tx.update(col(clientId).doc(target.id), {
      active: true,
      rolledBackFrom: active ? active.version : null,
      rolledBackAt: Date.now(),
      rolledBackBy: s(by) || "Team",
    });
  });
  return { ok: true, version: target.version, deactivated: active?.version ?? null };
}

/** All versions of an agent (metadata only, text excluded), newest first. */
export async function listPromptVersions(clientId, agent) {
  const versions = await versionsOf(clientId, agent);
  return versions.map(({ text, ...meta }) => ({ ...meta, textLength: (text || "").length }));
}

// ----------------------------------------------------------------------------
// Metrics per version — aggregated over events stamped with pv:<agent>:<n>
// ----------------------------------------------------------------------------

/**
 * Outcome metrics per prompt version, from the shared brain itself: every
 * stamped event counts as one contact; signals classify the outcome. This is
 * what decides whether a version EARNS its lessons (selection pressure).
 */
export async function promptVersionMetrics(clientId, agent, { sinceDays = 90 } = {}) {
  const ag = s(agent).toLowerCase();
  const since = Date.now() - sinceDays * 86400000;
  const events = await queryRecent(clientId, since, 2000).catch(() => []);
  const prefix = `pv:${ag}:`;

  const byVersion = {};
  for (const e of events) {
    const tag = (e.tags || []).find((t) => typeof t === "string" && t.startsWith(prefix));
    if (!tag) continue;
    const version = Number(tag.slice(prefix.length));
    if (!Number.isFinite(version)) continue;
    const m = (byVersion[version] ||= {
      version, contacts: 0, booked: 0, aborted: 0, negative: 0, complaints: 0, resolved: 0,
    });
    m.contacts++;
    const sig = e.signals || {};
    if (sig.appointmentRequest) m.booked++;
    if (sig.abortedEarly) m.aborted++;
    if (sig.sentiment === "negative") m.negative++;
    if (sig.complaintStated) m.complaints++;
    if (e.status === "resolved") m.resolved++;
  }
  return Object.values(byVersion).sort((a, b) => b.version - a.version);
}

/** Test helper: wipe all prompt versions of a tenant. */
export async function _deleteAllPromptVersions(clientId) {
  const snap = await col(clientId).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  return snap.size;
}

export { FieldValue };
