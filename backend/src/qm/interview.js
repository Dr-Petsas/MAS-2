// ============================================================================
// Julia QM-Plan-Interview — Gespraechsschleife (LLM-gefuehrter Quiz).
//
// Eine Runde: Frontend schickt bookKey + bisherige Nachrichten. Wir bauen den
// buchbezogenen System-Prompt (interviewPrompts.js), fragen das STARKE Modell
// auf dem RTX-5090 (strongLlm(): qwen3.6), parsen die [ERGEBNIS]-Bloecke und den
// [STATUS]interview_abgeschlossen-Marker heraus und liefern den bereinigten
// sichtbaren Antworttext + die erfassten Themen zurueck.
//
// Deterministisch bleibt die spaetere Plangenerierung (qm/hygiene.js). Das
// Interview sammelt nur, WAS in der Praxis zutrifft.
// ============================================================================

import { chat, strongLlm } from "../mail/llm.js";
import { buildInterviewSystemPrompt, interviewTopics, hasInterview } from "./interviewPrompts.js";
import { log } from "../log.js";

const MAX_TURNS = 60; // Sicherheitsnetz gegen Endlos-Verlaeufe.

const RE_ERGEBNIS = /\[ERGEBNIS\]([\s\S]*?)\[\/ERGEBNIS\]/gi;
const RE_STATUS_DONE = /\[STATUS\]\s*interview_abgeschlossen\s*\[\/STATUS\]/i;
const RE_ANY_STATUS = /\[STATUS\][\s\S]*?\[\/STATUS\]/gi;

/** Parst einen [ERGEBNIS]-Block-Inhalt in { thema, inhalt }. */
function parseErgebnisBlock(inner) {
  const themaM = inner.match(/Thema:\s*(.+)/i);
  const inhaltM = inner.match(/Inhalt:\s*([\s\S]*)/i);
  const thema = themaM ? themaM[1].trim().replace(/\s+/g, " ") : "";
  let inhalt = inhaltM ? inhaltM[1].trim() : "";
  inhalt = inhalt.replace(/\[\/?ERGEBNIS\]/gi, "").trim();
  return { thema, inhalt };
}

/** Zerlegt die LLM-Rohantwort in sichtbaren Text, Captures und done-Flag. */
export function parseInterviewReply(raw) {
  const text = String(raw || "");
  const captures = [];
  let m;
  RE_ERGEBNIS.lastIndex = 0;
  while ((m = RE_ERGEBNIS.exec(text)) !== null) {
    const c = parseErgebnisBlock(m[1]);
    if (c.thema) captures.push(c);
  }
  const done = RE_STATUS_DONE.test(text);
  // Sichtbaren Text bereinigen: ERGEBNIS-Bloecke + STATUS-Marker entfernen.
  const reply = text
    .replace(RE_ERGEBNIS, "")
    .replace(RE_ANY_STATUS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { reply, captures, done };
}

/**
 * Fuehrt eine Interview-Runde aus.
 * @param {string} clientId
 * @param {{ bookKey: string, messages?: {role:string,content:string}[] }} opts
 * @returns {Promise<{ ok, reply, captures, done, topics, model, reason? }>}
 */
export async function runInterviewTurn(clientId, opts = {}) {
  const bookKey = String(opts.bookKey || "").trim();
  if (!hasInterview(bookKey)) return { ok: false, reason: "unknown_book" };

  const system = buildInterviewSystemPrompt(bookKey);
  const history = Array.isArray(opts.messages) ? opts.messages : [];
  const clean = history
    .filter((mm) => mm && (mm.role === "user" || mm.role === "assistant") && typeof mm.content === "string")
    .slice(-MAX_TURNS)
    .map((mm) => ({ role: mm.role, content: String(mm.content).slice(0, 4000) }));

  // Interview-Start: noch keine Nutzerantwort -> Julia stellt sich vor + Frage 1.
  const hasUser = clean.some((mm) => mm.role === "user");
  const kickoff = hasUser ? [] : [{ role: "user", content: "Bitte starte das Interview mit dem ersten Thema." }];

  const messages = [{ role: "system", content: system }, ...clean, ...kickoff];

  const s = strongLlm();
  const r = await chat(messages, {
    baseUrl: s.base,
    model: s.model,
    temperature: 0.3,
    maxTokens: 1200,
    timeoutMs: 60000,
  });

  if (!r.ok) {
    log.warn("qm.interview_llm_fail", { clientId, bookKey, reason: r.reason, model: r.model });
    return { ok: false, reason: r.reason || "llm_unreachable", model: r.model, topics: interviewTopics(bookKey) };
  }

  const parsed = parseInterviewReply(r.text);
  log.info("qm.interview_turn", { clientId, bookKey, captures: parsed.captures.length, done: parsed.done });
  return {
    ok: true,
    reply: parsed.reply,
    captures: parsed.captures,
    done: parsed.done,
    topics: interviewTopics(bookKey),
    model: r.model,
  };
}
