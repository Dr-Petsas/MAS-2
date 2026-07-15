import { chat, llmInfo } from "./llm.js";
import { getCaseContext, listCases } from "../brain/caseStore.js";
import { resolvePatientSubject } from "../brain/identity.js";
import { listMessagesForCase } from "./store.js";

// AI letter drafting that draws on the SHARED BRAIN. Nadine gathers context from
// phone calls / the case thread, related e-mails, and an uploaded/pasted source
// letter, then — given the team's rough direction — drafts a professional German
// letter with the local model. This is the crucial "gemeinsames Gehirn" tie-in:
// the draft is grounded in what actually happened, not invented.

function clip(s, n) {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n) + " …" : t;
}

/**
 * Pull together everything Nadine should know before writing.
 * @param {string} clientId
 * @param {{ caseId?: string, patientName?: string, sourceText?: string }} input
 * @returns {Promise<{contextText:string, caseId:string|null, patient:string|null, counts:{calls:number, emails:number}, sourceIncluded:boolean}>}
 */
// Lightweight read model for the editor's "context card": what Nadine found for
// this recipient BEFORE writing, so the team can see (and trust) the grounding.
export async function letterContextSummary(clientId, { caseId, patientName } = {}) {
  const ctx = await assembleContext(clientId, { caseId, patientName });
  return {
    patient: ctx.patient,
    caseId: ctx.caseId,
    counts: ctx.counts,
    contextText: ctx.contextText,
    found: ctx.contextText !== "(kein Kontext vorhanden)",
  };
}

export async function assembleContext(clientId, { caseId, patientName, sourceText } = {}) {
  let resolvedCaseId = (caseId || "").trim() || null;
  let patient = null;

  // No explicit case but a name? Resolve via brain identity, then newest active case.
  if (!resolvedCaseId && patientName) {
    const subj = await resolvePatientSubject(clientId, patientName).catch(() => null);
    patient = subj?.name || patientName;
    if (subj?.patientId) {
      const cases = await listCases(clientId, { patientId: subj.patientId, activeOnly: true, limit: 5 }).catch(() => []);
      if (cases.length) resolvedCaseId = cases[0].id;
    }
  }

  const sections = [];
  let calls = 0;
  let emails = 0;

  if (resolvedCaseId) {
    const ctx = await getCaseContext(clientId, resolvedCaseId).catch(() => null);
    if (ctx) {
      if (!patient) patient = ctx.case?.subject?.name || null;
      calls = (ctx.events || []).length;
      sections.push("## Vorgang & Telefonate\n" + ctx.contextText);

      const mail = await listMessagesForCase(clientId, resolvedCaseId).catch(() => []);
      emails = mail.length;
      if (mail.length) {
        const lines = mail.map((m) => {
          const who = m.direction === "out" ? "Gesendet an " + (m.to?.[0]?.address || "") : "Von " + (m.from?.name || m.from?.address || "");
          return `- ${who}: ${m.subject || "(kein Betreff)"} — ${clip(m.preview || m.textBody, 200)}`;
        });
        sections.push("## Zugehörige E-Mails\n" + lines.join("\n"));
      }
    }
  }

  if (sourceText && sourceText.trim()) {
    sections.push("## Hochgeladener/zitierter Brief (worauf geantwortet wird)\n" + clip(sourceText, 4000));
  }

  return {
    contextText: sections.join("\n\n") || "(kein Kontext vorhanden)",
    caseId: resolvedCaseId,
    patient,
    counts: { calls, emails },
    sourceIncluded: !!(sourceText && sourceText.trim()),
  };
}

const FALLBACK_NOTE = "[KI-Modell nicht erreichbar — Vorlage aus Kontext. Bitte Text ergänzen.]";

function fallbackDraft({ direction, recipient, context }) {
  const name = (recipient || "").split(/\r?\n/)[0]?.trim() || "";
  const subject = clip((direction || "Ihr Anliegen").replace(/[\r\n]+/g, " "), 60);
  const body = [
    name ? `Guten Tag ${name},` : "Guten Tag,",
    "",
    FALLBACK_NOTE,
    direction ? `Anliegen/Richtung: ${direction}` : "",
    "",
    context && context !== "(kein Kontext vorhanden)" ? "Kontext lag vor (siehe Vorgang)." : "",
    "",
    "Mit freundlichen Grüßen",
    "Ihr Praxisteam",
  ].filter((l) => l !== "").join("\n");
  return { subject, body };
}

function parseLetterJson(text) {
  if (!text) return null;
  // Grab the first {...} block, tolerant of markdown fences.
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (o && typeof o.body === "string") return { subject: String(o.subject || "").trim(), body: o.body.trim() };
  } catch { /* fall through */ }
  return null;
}

/**
 * Draft a letter from a rough direction + brain context.
 * @returns {Promise<{ok:boolean, subject:string, body:string, contextUsed:object, model:string, fallback:boolean, reason?:string}>}
 */
export async function draftLetter(clientId, { caseId, patientName, recipient, sourceText, direction, tone, useContext = true } = {}) {
  const ctx = useContext
    ? await assembleContext(clientId, { caseId, patientName, sourceText })
    : { contextText: (sourceText && sourceText.trim()) ? "## Hochgeladener/zitierter Brief\n" + clip(sourceText, 4000) : "(kein Kontext vorhanden)", caseId: null, patient: patientName || null, counts: { calls: 0, emails: 0 }, sourceIncluded: !!(sourceText && sourceText.trim()) };

  const system = [
    "Du bist Nadine, die Schreib-Assistentin einer deutschen Zahnarztpraxis.",
    "Schreibe einen professionellen, höflichen Brief auf Deutsch (Sie-Form).",
    "Nutze AUSSCHLIESSLICH die bereitgestellten Fakten aus Kontext und Quelle — erfinde nichts, keine erfundenen Beträge/Diagnosen.",
    "Schlage NIEMALS konkrete Termine, Daten oder Uhrzeiten vor, die nicht ausdrücklich im Kontext stehen — bitte stattdessen höflich um einen Terminwunsch.",
    "Wenn eine Information fehlt, formuliere neutral oder bitte höflich um die fehlende Angabe.",
    tone ? `Tonfall: ${tone}.` : "Tonfall: sachlich, freundlich, verbindlich.",
    "WICHTIG: Füge KEINEN Briefkopf, KEINE Absenderadresse, KEINE Telefonnummer/E-Mail und KEINE erfundenen Namen hinzu — Briefkopf und Unterschrift ergänzt die Praxis automatisch.",
    "Beende den Brief mit der Grußformel 'Mit freundlichen Grüßen' und einer Zeile 'Ihr Praxisteam' (keine erfundenen Personennamen).",
    "Antworte NUR mit JSON in genau diesem Format: {\"subject\": \"…\", \"body\": \"…\"}.",
    "Der body enthält nur Anrede, Fließtext und Grußformel mit Zeilenumbrüchen (\\n).",
  ].join(" ");

  const user = [
    direction ? `RICHTUNG / AUFTRAG:\n${direction}` : "RICHTUNG / AUFTRAG:\n(keine — formuliere ein passendes, neutrales Schreiben aus dem Kontext)",
    recipient ? `\nEMPFÄNGER:\n${recipient}` : "",
    `\nKONTEXT AUS DEM GEMEINSAMEN GEHIRN:\n${ctx.contextText}`,
  ].join("\n");

  // Letters aren't latency-critical (unlike the voice loop), so prefer the
  // stronger model for better faithfulness. Default is the local Ollama model;
  // for the big jump set MAS_LETTER_BASE_URL to the RTX-5090 vLLM server
  // (http://100.77.30.98:8000/v1) + MAS_LETTER_MODEL=qwen3.6:35b-a3b. The bigger
  // model is slower, so the timeout is generous.
  const res = await chat(
    [{ role: "system", content: system }, { role: "user", content: user }],
    {
      temperature: 0.3,
      maxTokens: 900,
      model: process.env.MAS_LETTER_MODEL || "qwen3:8b",
      baseUrl: process.env.MAS_LETTER_BASE_URL || undefined,
      timeoutMs: 120000,
    }
  );

  if (!res.ok) {
    return { ok: false, ...fallbackDraft({ direction, recipient, context: ctx.contextText }), contextUsed: ctx, model: res.model, fallback: true, reason: res.reason };
  }

  const parsed = parseLetterJson(res.text);
  if (!parsed) {
    // Model answered but not as JSON — use the raw text as the body.
    return { ok: true, subject: clip((direction || "Ihr Schreiben").replace(/[\r\n]+/g, " "), 60), body: res.text.trim(), contextUsed: ctx, model: res.model, fallback: false };
  }
  return { ok: true, subject: parsed.subject || clip(direction || "Ihr Schreiben", 60), body: parsed.body, contextUsed: ctx, model: res.model, fallback: false };
}

// Inline edit: rewrite ONLY the marked passage per the user's instruction. Used
// by the "Textstelle markieren & per Prompt ändern" feature. Returns just the
// rewritten span (plain text) so the frontend can splice it back in place.
export async function rewritePassage(clientId, { selection, instruction, fullText, tone } = {}) {
  const sel = String(selection || "").trim();
  const ask = String(instruction || "").trim();
  if (!sel) return { ok: false, reason: "no_selection", text: "" };
  if (!ask) return { ok: false, reason: "no_instruction", text: "" };

  const system = [
    "Du bist Nadine, die Schreib-Assistentin einer deutschen Zahnarztpraxis.",
    "Du bekommst eine MARKIERTE PASSAGE aus einem Brief und eine ANWEISUNG, wie sie geändert werden soll.",
    "Formuliere AUSSCHLIESSLICH die markierte Passage gemäß Anweisung um (Deutsch, Sie-Form).",
    "Erfinde keine neuen Fakten, Beträge, Diagnosen, Termine oder Namen.",
    tone ? `Tonfall: ${tone}.` : "Tonfall: sachlich, freundlich, verbindlich.",
    "Gib NUR den umgeschriebenen Text zurück — keine Anführungszeichen, keine Erklärung, keine Anrede/Grußformel (außer sie war Teil der Passage).",
  ].join(" ");

  const user = [
    fullText ? `GESAMTER BRIEF (nur als Kontext, NICHT zurückgeben):\n${clip(fullText, 3000)}\n` : "",
    `MARKIERTE PASSAGE:\n${sel}`,
    `\nANWEISUNG:\n${ask}`,
  ].join("\n");

  const res = await chat(
    [{ role: "system", content: system }, { role: "user", content: user }],
    {
      temperature: 0.3,
      maxTokens: 600,
      model: process.env.MAS_LETTER_MODEL || "qwen3:8b",
      baseUrl: process.env.MAS_LETTER_BASE_URL || undefined,
      timeoutMs: 90000,
    }
  );
  if (!res.ok) return { ok: false, reason: res.reason, text: "", model: res.model };

  // Strip wrapping quotes/fences the model sometimes adds.
  let out = res.text.trim().replace(/^```[a-z]*\n?|\n?```$/gi, "").trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("„") && out.endsWith("“"))) out = out.slice(1, -1).trim();
  return { ok: true, text: out, model: res.model };
}

export { llmInfo };
