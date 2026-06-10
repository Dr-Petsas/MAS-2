import { masCollection } from "../tenant.js";
import { listCases } from "./caseStore.js";
import { chat, llmInfo } from "../mail/llm.js";
import { proposeLesson, validateLessonProposal, LESSON_AGENTS } from "./lessons.js";
import { log } from "../log.js";

// ============================================================================
// Living Prompt — the reflection loop ("Mutation" of the guided evolution).
//
// Periodically the LOCAL LLM (DSGVO: never cloud) reads recent case outcomes
// from the shared brain and distils candidate lessons. Its output is harmless
// by construction: every candidate passes the machine filter
// (validateLessonProposal + evidence-must-exist + dedupe in proposeLesson) and
// then sits as `proposed` until a human approves it. A bad reflection costs the
// practice nothing but an ignorable suggestion.
//
// Nightly scheduling is tracked per tenant in mas_config/living_prompt
// (lastReflectionAt) and driven from the mail scheduler tick.
// ============================================================================

const MAX_CASES = 40;
const MAX_PROPOSALS_PER_RUN = 5;

function s(v) {
  return v == null ? "" : String(v).trim();
}

function fmtDay(ms) {
  if (!ms) return "?";
  try {
    return new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  } catch {
    return "?";
  }
}

/**
 * Compact, anonym-sparse German digest of one case for the reflection prompt.
 * Patient names are NOT included — the LLM learns behaviour patterns, not
 * people. Case ids are included as evidence handles.
 */
export function caseDigest(c) {
  const contacts = (c.updates || []).filter((u) => u.kind === "contact").slice(-3);
  const notes = (c.updates || []).filter((u) => u.kind === "note").slice(-2);
  const lines = [
    `Vorgang ${c.id} | Thema: ${c.topic} | Status: ${c.status} | Kontakte: ${c.contactCount || 0} | zuletzt: ${fmtDay(c.lastContactAt)}`,
  ];
  for (const u of contacts) lines.push(`  Kontakt: ${s(u.text).slice(0, 160)}`);
  for (const u of notes) lines.push(`  Notiz (${u.by}): ${s(u.text).slice(0, 160)}`);
  return lines.join("\n");
}

const SYSTEM_PROMPT = [
  "Du bist ein Qualitäts-Analyst für eine Arztpraxis. Du liest abgeschlossene und laufende Vorgänge (Tickets) und destillierst daraus WENIGE, konkrete Verhaltensregeln für die KI-Assistentinnen der Praxis.",
  "Assistentinnen: lisa (Outbound-Telefon/SMS), bianca (eingehendes Telefon), clara (interne Assistenz), nadine (E-Mail/Brief). 'all' = gilt für alle.",
  "Eine gute Regel ist: konkret, allgemein anwendbar (kein Einzelfall), aus den Daten belegbar, und verbessert künftige Gespräche/Texte.",
  "KEINE Regeln zu Datenschutz, Diagnosen oder Preisen — diese sind bereits fest verdrahtet.",
  "Antworte AUSSCHLIESSLICH mit einem JSON-Array (auch leer [] ist erlaubt). Jedes Element:",
  '{"agent":"lisa|bianca|clara|nadine|all","rule":"<konkrete Regel, 1-2 Sätze, Deutsch>","scopeNote":"<wann sie gilt, kurz>","evidenceCaseIds":["<Vorgang-IDs aus den Daten>"],"confidence":0.0-1.0}',
  "Maximal 5 Vorschläge. Nur Regeln mit echter Evidenz in den gezeigten Vorgängen. Im Zweifel: leeres Array.",
].join("\n");

/**
 * Extract and structurally validate proposals from raw LLM text. Pure.
 * Tolerant about surrounding prose, strict about the schema.
 *
 * @returns {{proposals: object[], invalid: number}}
 */
export function parseProposals(text) {
  const raw = String(text || "");
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return { proposals: [], invalid: 0 };

  let arr;
  try {
    arr = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { proposals: [], invalid: 0 };
  }
  if (!Array.isArray(arr)) return { proposals: [], invalid: 0 };

  const proposals = [];
  let invalid = 0;
  for (const item of arr.slice(0, MAX_PROPOSALS_PER_RUN)) {
    const candidate = {
      agent: s(item?.agent).toLowerCase(),
      rule: s(item?.rule),
      scopeNote: s(item?.scopeNote),
      evidenceCaseIds: Array.isArray(item?.evidenceCaseIds) ? item.evidenceCaseIds.map(s).filter(Boolean) : [],
      confidence: Number(item?.confidence),
      source: "reflection",
    };
    if (validateLessonProposal(candidate).ok) proposals.push(candidate);
    else invalid++;
  }
  return { proposals, invalid };
}

/**
 * One reflection run for a tenant. Reads recent cases, asks the local LLM for
 * lesson candidates, funnels every candidate through proposeLesson (evidence +
 * dedupe guards). Never throws; degrades to zero proposals when the LLM is
 * offline.
 *
 * @returns {Promise<{ok:boolean, casesAnalyzed:number, proposed:number, duplicates:number, invalid:number, llm:string, reason?:string}>}
 */
export async function reflectOnce(clientId, { sinceDays = 14 } = {}) {
  const since = Date.now() - sinceDays * 86400000;
  const all = await listCases(clientId, { limit: 200 }).catch(() => []);
  const recent = all
    .filter((c) => {
      const ts = c.updatedAt?.toMillis?.() ?? c.updatedAt ?? c.lastContactAt ?? 0;
      return ts >= since;
    })
    // Closed matters and multi-contact threads carry the most signal.
    .sort((a, b) => {
      const score = (c) => (c.status === "resolved" || c.status === "closed" ? 2 : 0) + Math.min(3, c.contactCount || 0);
      return score(b) - score(a);
    })
    .slice(0, MAX_CASES);

  if (recent.length < 3) {
    return { ok: true, casesAnalyzed: recent.length, proposed: 0, duplicates: 0, invalid: 0, llm: "skipped", reason: "too_few_cases" };
  }

  const userPrompt = [
    `Vorgänge der letzten ${sinceDays} Tage (${recent.length} Stück):`,
    "",
    ...recent.map(caseDigest),
    "",
    "Destilliere daraus jetzt 0–5 Verhaltensregeln als JSON-Array (Schema siehe oben).",
  ].join("\n");

  const r = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.2, maxTokens: 900, timeoutMs: 60000 }
  );
  if (!r.ok) {
    log.warn("reflection: LLM unavailable — no proposals this run", { clientId, reason: r.reason });
    return { ok: true, casesAnalyzed: recent.length, proposed: 0, duplicates: 0, invalid: 0, llm: r.reason || "unreachable" };
  }

  const { proposals, invalid } = parseProposals(r.text);
  let proposed = 0;
  let duplicates = 0;
  let rejected = invalid;
  for (const p of proposals) {
    const out = await proposeLesson(clientId, p).catch(() => ({ ok: false, reason: "store_error" }));
    if (out.ok) proposed++;
    else if (out.reason === "duplicate") duplicates++;
    else rejected++;
  }

  log.info("reflection run", { clientId, casesAnalyzed: recent.length, proposed, duplicates, invalid: rejected, model: llmInfo().model });
  return { ok: true, casesAnalyzed: recent.length, proposed, duplicates, invalid: rejected, llm: "ok" };
}

// ----------------------------------------------------------------------------
// Nightly driver (called from the scheduler tick)
// ----------------------------------------------------------------------------

const NIGHTLY_AFTER_HOUR = 3; // Berlin local
const MIN_GAP_MS = 20 * 3600000; // at most once per ~day, survives restarts

function berlinHour() {
  return Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "numeric", hour12: false }).format(new Date()));
}

/**
 * Run reflection for a tenant if it is due (after 03:00 Berlin, not run in the
 * last ~20h). State lives in mas_config/living_prompt so restarts don't double-run.
 */
export async function maybeReflectNightly(clientId) {
  if (berlinHour() < NIGHTLY_AFTER_HOUR) return { ran: false, reason: "before_window" };
  const ref = masCollection(clientId, "mas_config").doc("living_prompt");
  const snap = await ref.get().catch(() => null);
  const last = snap?.exists ? Number(snap.data().lastReflectionAt) || 0 : 0;
  if (Date.now() - last < MIN_GAP_MS) return { ran: false, reason: "recent" };

  // Claim BEFORE running so parallel ticks/instances don't double-run.
  await ref.set({ lastReflectionAt: Date.now() }, { merge: true });
  const result = await reflectOnce(clientId).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
  await ref.set({ lastReflectionResult: { ...result, at: Date.now() } }, { merge: true }).catch(() => {});
  return { ran: true, result };
}
