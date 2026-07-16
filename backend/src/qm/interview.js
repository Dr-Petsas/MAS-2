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

// Thema-Namen vereinheitlichen (identisch zur Frontend-normTopic): klein,
// Klammern raus, nur Wortzeichen. So matchen Backend-Kanon und Frontend-Pille.
function normTopic(x) {
  return String(x || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}
function topicTokens(x) {
  return normTopic(x).split(" ").filter((w) => w.length >= 4);
}

/**
 * Das vom LLM gemeldete Thema auf den EXAKTEN Namen aus der Themenliste abbilden.
 * Das Modell benennt Themen oft anders ("Instrumentenarten" statt
 * "Instrumenten-/Medizinprodukteaufbereitung (C)", "Entsorgung" statt
 * "Abfallentsorgung"). Ohne diese Zuordnung fuellt sich die Fortschritts-/
 * Pillen-Anzeige nie. Rueckgabe: kanonischer Themenname oder das Original.
 */
function canonicalizeTopic(thema, topics) {
  const want = normTopic(thema);
  if (!want) return thema;
  for (const t of topics) if (normTopic(t) === want) return t; // exakt
  const wt = topicTokens(thema);
  if (!wt.length) return thema;
  let best = null, bestScore = 0;
  for (const t of topics) {
    const ct = topicTokens(t);
    if (!ct.length) continue;
    let overlap = 0;
    for (const w of wt) {
      if (ct.includes(w)) { overlap += 1; continue; }
      if (ct.some((cw) => cw.includes(w) || w.includes(cw))) overlap += 0.5;
    }
    const score = overlap / Math.min(wt.length, ct.length);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return bestScore >= 0.5 ? best : thema;
}

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
  // Denken abschalten (qwen3.6 auf vLLM): eine Interview-Frage + ein kurzer
  // [ERGEBNIS]-Block brauchen kein langes Reasoning — das war der Haupt-Grund
  // fuer die langen Wartezeiten. chat_template_kwargs.enable_thinking=false ist
  // der vLLM-Weg, /no_think im Prompt der Fallback.
  const NO_THINK = { chat_template_kwargs: { enable_thinking: false } };
  const r = await chat(messages, {
    baseUrl: s.base,
    model: s.model,
    temperature: 0.3,
    maxTokens: 800,
    timeoutMs: 60000,
    extraBody: NO_THINK,
  });

  if (!r.ok) {
    log.warn("qm.interview_llm_fail", { clientId, bookKey, reason: r.reason, model: r.model });
    return { ok: false, reason: r.reason || "llm_unreachable", model: r.model, topics: interviewTopics(bookKey) };
  }

  let parsed = parseInterviewReply(r.text);

  // Julia liefert manchmal nur den [ERGEBNIS]-Block und KEINE sichtbare Frage.
  // Dann ist der Chat leer und der Nutzer sieht keine naechste Frage. In dem
  // Fall genau EINMAL nachfassen: Ergebnis behalten, aber die naechste Frage
  // nachliefern (billiger Zusatz-Call, kein zweites Erfassen noetig).
  if (parsed.done !== true && !parsed.reply.trim()) {
    const nudge = [
      ...messages,
      { role: "assistant", content: r.text },
      { role: "user", content: "Gib jetzt KEINEN [ERGEBNIS]-Block aus. Stelle nur die naechste Einzelfrage zum naechsten offenen Thema (oder gib [STATUS]interview_abgeschlossen[/STATUS] aus, wenn alle Themen erledigt sind)." },
    ];
    const r2 = await chat(nudge, { baseUrl: s.base, model: s.model, temperature: 0.3, maxTokens: 500, timeoutMs: 45000, extraBody: NO_THINK });
    if (r2.ok) {
      const parsed2 = parseInterviewReply(r2.text);
      parsed = {
        reply: parsed2.reply || parsed.reply,
        captures: [...parsed.captures, ...parsed2.captures],
        done: parsed.done || parsed2.done,
      };
      log.info("qm.interview_nudge", { clientId, bookKey, recovered: !!parsed2.reply.trim() });
    }
  }

  // Erfasste Themen auf die kanonischen Namen der Themenliste abbilden, damit
  // die Fortschritts-/Pillen-Anzeige im Frontend zuverlaessig matcht.
  const topics = interviewTopics(bookKey);
  const captures = parsed.captures.map((c) => ({ ...c, thema: canonicalizeTopic(c.thema, topics) }));

  log.info("qm.interview_turn", { clientId, bookKey, captures: captures.length, done: parsed.done });
  return {
    ok: true,
    reply: parsed.reply,
    captures,
    done: parsed.done,
    topics,
    model: r.model,
  };
}
