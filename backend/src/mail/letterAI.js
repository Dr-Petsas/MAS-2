import { chat, llmInfo } from "./llm.js";
import { getCaseContext, listCases } from "../brain/caseStore.js";
import { resolvePatientSubject } from "../brain/identity.js";
import { listMessagesForCase } from "./store.js";
import { getLetterSettings } from "./letterSettings.js";
import { getProfile } from "../qm/books.js";
import { getFachrichtung } from "../qm/catalog.js";

// AI letter drafting that draws on the SHARED BRAIN. Nadine gathers context from
// phone calls / the case thread, related e-mails, and an uploaded/pasted source
// letter, then — given the team's rough direction — drafts a professional German
// letter with the local model. This is the crucial "gemeinsames Gehirn" tie-in:
// the draft is grounded in what actually happened, not invented.

function clip(s, n) {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n) + " …" : t;
}

// HTML-Mail auf sprechbaren/lesbaren Fliesstext reduzieren (fuer den Fall, dass
// nur ein htmlBody vorliegt). Bewusst simpel — es geht um Kontext, nicht um
// pixelgenaues Rendering.
function htmlToText(html) {
  return String(html || "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Bester verfuegbarer Klartext einer Mail: Textteil, sonst HTML entkernt, sonst
// die Vorschau. So bekommt Nadine den ECHTEN Inhalt statt nur eines Snippets.
function plainBody(m) {
  const t = String(m?.textBody || "").trim();
  if (t) return t;
  const h = htmlToText(m?.htmlBody);
  if (h) return h;
  return String(m?.preview || "").trim();
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
  let sourceCategory = null; // Klassifizierung des Eingangsschreibens (steuert den Ton)

  if (resolvedCaseId) {
    const ctx = await getCaseContext(clientId, resolvedCaseId).catch(() => null);
    if (ctx) {
      if (!patient) patient = ctx.case?.subject?.name || null;
      // "Telefonate" = echte Anruf-Kontakte (Bianca/Lisa), nicht jedes Event.
      // Der Vorgangskontext enthaelt den Verlauf der Kontakte inkl. Anrufen —
      // so fliessen Telefonate in jeden Brief-/Mail-Entwurf ein.
      calls = (ctx.events || []).filter((e) => /call/i.test(e?.channel || "")).length;
      sections.push("## Vorgang & Telefonate\n" + ctx.contextText);

      const mail = await listMessagesForCase(clientId, resolvedCaseId).catch(() => []);
      emails = mail.length;
      if (mail.length) {
        // Das juengste EINGEGANGENE Schreiben ist das, worauf geantwortet wird —
        // es kommt im VOLLTEXT (gekappt), damit Nadine konkret darauf eingeht,
        // statt nur auf einen 200-Zeichen-Anriss (Vorfall: zu unpraezise).
        const inbound = mail.filter((m) => m.direction !== "out");
        const primary = inbound.length ? inbound[inbound.length - 1] : null;
        if (primary) {
          sourceCategory = primary.category || null;
          const from = primary.from?.name || primary.from?.address || "unbekannt";
          sections.push(
            "## Eingangsschreiben, auf das geantwortet wird\n" +
            `Von ${from}, Betreff: ${primary.subject || "(kein Betreff)"}\n\n` +
            clip(plainBody(primary), 4000)
          );
        }
        // Alle weiteren Mails (inkl. bereits gesendeter) nur als kurzer Anriss.
        const rest = mail.filter((m) => m !== primary);
        if (rest.length) {
          const lines = rest.map((m) => {
            const who = m.direction === "out" ? "Gesendet an " + (m.to?.[0]?.address || "") : "Von " + (m.from?.name || m.from?.address || "");
            return `- ${who}: ${m.subject || "(kein Betreff)"} — ${clip(m.preview || plainBody(m), 200)}`;
          });
          sections.push("## Weitere zugehörige E-Mails\n" + lines.join("\n"));
        }
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
    sourceCategory,
    counts: { calls, emails },
    sourceIncluded: !!(sourceText && sourceText.trim()),
  };
}

const FALLBACK_NOTE = "[KI-Modell nicht erreichbar — Vorlage aus Kontext. Bitte Text ergänzen.]";

function fallbackDraft({ direction, recipient, context, signature }) {
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
    signature || "",
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
 * Who is Nadine writing FOR? Derived from the logged-in tenant — never
 * hardcoded to a dental practice. Organisation name + optional signature come
 * from the letterhead settings; an optional branch label comes from the QM
 * practice profile (Fachrichtung). Any/all fields may be empty: then Nadine is
 * simply a neutral professional writer, which also fits a non-medical sender.
 *
 * @param {string} clientId
 * @returns {Promise<{orgName:string, branchLabel:string|null, signature:string|null}>}
 */
async function loadSenderProfile(clientId) {
  const out = { orgName: "", branchLabel: null, signature: null };
  try {
    const [settings, profile] = await Promise.all([
      getLetterSettings(clientId).catch(() => null),
      getProfile(clientId).catch(() => null),
    ]);
    if (settings) {
      out.orgName = String(settings.senderName || "").trim();
      const sigName = String(settings.signatureName || "").trim();
      const sigRole = String(settings.signatureRole || "").trim();
      if (sigName) out.signature = sigRole ? `${sigName}, ${sigRole}` : sigName;
    }
    if (profile?.fachrichtung) {
      const f = getFachrichtung(profile.fachrichtung);
      if (f?.label) out.branchLabel = f.label;
    }
  } catch { /* any read error → neutral profile, never block the draft */ }
  return out;
}

// Register/Tonfall je Empfaengertyp. Nadine schreibt eben NICHT nur an Patienten,
// sondern auch an Behoerden, Gerichte, Anwaelte, Versicherungen, Firmen und
// Privatpersonen — jede Gruppe erwartet einen anderen Ton.
const REGISTER = Object.freeze({
  behoerde: "Empfänger ist eine Behörde bzw. ein Gericht: streng sachlich, formell und knapp, ohne Floskeln; nimm auf Aktenzeichen/Geschäftszeichen und Fristen ausdrücklich Bezug und halte dich exakt an die Faktenlage.",
  anwalt: "Empfänger ist eine Anwaltskanzlei: formell, präzise und sachlich; mache KEINE Schuldeingeständnisse oder Zusagen ohne Deckung im Kontext; nimm auf Fristen und Aktenzeichen Bezug.",
  versicherung: "Empfänger ist eine Versicherung/Krankenkasse: sachlich und strukturiert; nimm auf Versicherten-, Schaden- oder Vorgangsnummer Bezug, falls vorhanden.",
  geschaeftlich: "Empfänger ist ein Unternehmen/Geschäftspartner: professionell-geschäftlicher, verbindlicher Ton.",
  patient: "Empfänger ist eine Privatperson/ein Patient: persönlich, freundlich und gut verständlich, ohne Fachjargon.",
});

// Klassifizierungs-Kategorie des Eingangsschreibens -> Empfaengertyp.
const CATEGORY_TO_TYPE = Object.freeze({
  "Gerichtliche Klage": "behoerde",
  "Forderungsmanagement": "anwalt",
  "Rechnung": "geschaeftlich",
  "Versicherung": "versicherung",
  "Labor": "geschaeftlich",
  "Praxissoftware": "geschaeftlich",
  "Terminanfrage": "patient",
  "Beschwerde": "patient",
});

function normalizeType(t) {
  const v = String(t || "").trim().toLowerCase();
  return REGISTER[v] ? v : null;
}

// Stichwort-Heuristik als letzte Instanz, wenn weder ein expliziter Typ noch
// eine Kategorie vorliegt (z. B. Ad-hoc-Brief aus dem Editor ohne Vorgang).
function inferRecipientType(haystack) {
  const h = String(haystack || "").toLowerCase();
  if (/(amtsgericht|landgericht|staatsanwalt|\bgericht\b|behörde|behoerde|\bamt\b|ordnungsamt|finanzamt|jugendamt|gesundheitsamt|kammer)/.test(h)) return "behoerde";
  if (/(rechtsanwalt|rechtsanwält|anwalt|anwält|kanzlei|\brae\b)/.test(h)) return "anwalt";
  if (/(versicherung|krankenkasse|krankenversicherung|beihilfe|\bkasse\b)/.test(h)) return "versicherung";
  if (/(gmbh|\bag\b|\bkg\b|\bug\b|firma|labor|lieferant)/.test(h)) return "geschaeftlich";
  return null;
}

/**
 * Draft a letter from a rough direction + brain context.
 * @param {string} clientId
 * @param {{caseId?:string, patientName?:string, recipient?:string, sourceText?:string, direction?:string, tone?:string, recipientType?:string, useContext?:boolean}} input
 *   recipientType (optional): behoerde | anwalt | versicherung | geschaeftlich | patient. Fehlt er,
 *   wird er aus der Klassifizierung des Eingangsschreibens bzw. per Heuristik abgeleitet.
 * @returns {Promise<{ok:boolean, subject:string, body:string, contextUsed:object, model:string, fallback:boolean, reason?:string}>}
 */
export async function draftLetter(clientId, { caseId, patientName, recipient, sourceText, direction, tone, recipientType, useContext = true } = {}) {
  const ctx = useContext
    ? await assembleContext(clientId, { caseId, patientName, sourceText })
    : { contextText: (sourceText && sourceText.trim()) ? "## Hochgeladener/zitierter Brief\n" + clip(sourceText, 4000) : "(kein Kontext vorhanden)", caseId: null, patient: patientName || null, sourceCategory: null, counts: { calls: 0, emails: 0 }, sourceIncluded: !!(sourceText && sourceText.trim()) };

  // Empfaengertyp: expliziter Wert > Kategorie des Eingangsschreibens > Heuristik.
  const rtype =
    normalizeType(recipientType) ||
    CATEGORY_TO_TYPE[ctx.sourceCategory] ||
    inferRecipientType(`${recipient || ""} ${direction || ""}`) ||
    null;
  const registerLine = rtype ? REGISTER[rtype] : "";

  const sp = await loadSenderProfile(clientId);
  const closing = sp.signature
    ? `Beende den Brief mit der Grußformel „Mit freundlichen Grüßen“ und darunter der Signatur „${sp.signature}“.`
    : "Beende den Brief mit der Grußformel „Mit freundlichen Grüßen“ ohne erfundene Personennamen — die Unterschrift/Signatur ergänzt der Absender selbst.";

  const system = [
    "Du bist Nadine, eine professionelle Schreibkraft. Du verfasst im Auftrag des Absenders Briefe und E-Mails.",
    sp.orgName ? `Absender ist ${sp.orgName}${sp.branchLabel ? ` (${sp.branchLabel})` : ""}.` : "",
    "Schreibe professionell, höflich und präzise auf Deutsch (Sie-Form).",
    "Nutze AUSSCHLIESSLICH die bereitgestellten Fakten aus Kontext und Quelle — erfinde nichts, keine erfundenen Beträge, Daten oder Namen.",
    "Gehe KONKRET auf das Eingangsschreiben ein: greife dessen Anliegen, Fragen und — falls vorhanden — Aktenzeichen/Bezug ausdrücklich auf.",
    registerLine,
    "Schlage NIEMALS konkrete Termine, Daten oder Uhrzeiten vor, die nicht ausdrücklich im Kontext stehen.",
    "Wenn eine Information fehlt, formuliere neutral oder bitte höflich um die fehlende Angabe.",
    tone ? `Tonfall: ${tone}.` : "Tonfall: sachlich, freundlich, verbindlich.",
    "WICHTIG: Füge KEINEN Briefkopf, KEINE Absenderadresse und KEINE Telefonnummer/E-Mail hinzu — Briefkopf und Signatur ergänzt der Absender automatisch.",
    closing,
    "Antworte NUR mit JSON in genau diesem Format: {\"subject\": \"…\", \"body\": \"…\"}.",
    "Der body enthält nur Anrede, Fließtext und Grußformel mit Zeilenumbrüchen (\\n).",
  ].filter(Boolean).join(" ");

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
    return { ok: false, ...fallbackDraft({ direction, recipient, context: ctx.contextText, signature: sp.signature }), contextUsed: ctx, model: res.model, fallback: true, reason: res.reason };
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
    "Du bist Nadine, eine professionelle Schreibkraft.",
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
