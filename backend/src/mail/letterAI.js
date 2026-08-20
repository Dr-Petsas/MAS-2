import { chat, llmInfo, strongLlm } from "./llm.js";
import { getCaseContext, listCases } from "../brain/caseStore.js";
import { resolvePatientSubject } from "../brain/identity.js";
import { listMessagesForCase } from "./store.js";
import { listDocumentsForCase, summarizeDocument } from "./documents.js";
import { getLetter, listLetters } from "./letterArchive.js";
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

// Hochgeladene Unterlagen fuer den Prompt aufbereiten. Lange PDFs (12k+ Zeichen)
// haben den Lauf auf ~76 s getrieben — der Tunnel (mas.pickadoc-tunnel.com)
// bricht dann oft ab, bevor die Antwort ankommt. Deshalb laeuft alles ueber
// DIGEST_LIMIT zuerst durch den faktentreuen 5090-Steckbrief; scheitert der,
// wird gekappt statt die Unterlage ganz zu verlieren.
const DIGEST_LIMIT = 2200;

async function condenseDocuments(documents, max = 4) {
  const raw = Array.isArray(documents)
    ? documents.filter((d) => d && String(d.text || "").trim()).slice(0, max)
    : [];
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const d = raw[i];
    const full = String(d.text || "").trim();
    let text = clip(full, DIGEST_LIMIT);
    let condensed = false;
    if (full.length > DIGEST_LIMIT) {
      const digest = await summarizeDocument(full).catch(() => "");
      if (digest && digest.trim()) { text = digest.trim(); condensed = true; }
    }
    out.push({ filename: clip(d.filename || `Unterlage ${i + 1}`, 120), text, condensed, chars: full.length });
  }
  return out;
}

function documentsBlock(docs) {
  if (!docs.length) return "";
  return "\n\nHOCHGELADENE UNTERLAGEN (verbindlicher Fakten-Kontext — nichts erfinden, was nicht darin steht):\n"
    + docs.map((d, i) => `--- ${i + 1}. ${d.filename}${d.condensed ? " (Steckbrief)" : ""} ---\n${d.text}`).join("\n\n");
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

export async function assembleContext(clientId, { caseId, patientName, sourceText, sourceLetterIds } = {}) {
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
  let docs = 0;
  let letters = 0;
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

      // Dauerhaft gespeicherte Unterlagen dieses Vorgangs (Uploads/Scans, Block
      // E). Der 5090-Steckbrief (digest, Block F) kommt bevorzugt zum Einsatz —
      // sonst der Volltext gekappt. So "erinnert" sich ein FOLGE-Brief an alles,
      // was zu diesem Vorgang je hochgeladen wurde.
      const documents = await listDocumentsForCase(clientId, resolvedCaseId, 5).catch(() => []);
      docs = documents.length;
      if (documents.length) {
        const blocks = documents.map((d) => {
          const head = `### ${d.filename || "Unterlage"}`;
          const meta = d.digest ? "(Steckbrief)" : "(Auszug)";
          const content = d.digest ? String(d.digest).trim() : clip(d.text, 2000);
          return `${head} ${meta}\n${content}`;
        });
        sections.push("## Zugehörige Unterlagen\n" + blocks.join("\n\n"));
      }
    }
  }

  // Frühere Briefe als Kontext: explizit aus dem Archiv gewählte (sourceLetterIds)
  // PLUS automatisch die letzten Briefe DIESES Vorgangs — damit ein Folge-
  // Schreiben an denselben Ton/Sachstand anknüpft, ohne dass man es manuell
  // heraussuchen muss. Dedupe, Deckel auf 4 Briefe, jeweils gekappt.
  {
    const wanted = [];
    const seen = new Set();
    for (const id of Array.isArray(sourceLetterIds) ? sourceLetterIds : []) {
      const key = String(id || "").trim();
      if (key && !seen.has(key)) { seen.add(key); wanted.push(key); }
    }
    if (resolvedCaseId) {
      const recent = await listLetters(clientId, { caseId: resolvedCaseId, limit: 3 }).catch(() => ({ items: [] }));
      for (const it of recent.items || []) {
        if (!seen.has(it.id)) { seen.add(it.id); wanted.push(it.id); }
      }
    }
    const picked = (await Promise.all(wanted.slice(0, 4).map((id) => getLetter(clientId, id).catch(() => null)))).filter(Boolean);
    letters = picked.length;
    if (picked.length) {
      const blocks = picked.map((l) => {
        const when = l.ts ? new Date(l.ts).toLocaleDateString("de-DE") : "";
        const head = `### An ${l.recipient?.split(/\r?\n/)[0] || l.patientName || "Unbekannt"}${when ? ` (${when})` : ""} — ${l.subject || "(kein Betreff)"}`;
        return `${head}\n${clip(l.body, 1500)}`;
      });
      sections.push("## Frühere Briefe (als Kontext)\n" + blocks.join("\n\n"));
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
    counts: { calls, emails, docs, letters },
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
 * @param {{caseId?:string, patientName?:string, recipient?:string, sourceText?:string, direction?:string, tone?:string, recipientType?:string, useContext?:boolean, documents?:Array<{filename?:string,text:string}>}} input
 *   recipientType (optional): behoerde | anwalt | versicherung | geschaeftlich | patient. Fehlt er,
 *   wird er aus der Klassifizierung des Eingangsschreibens bzw. per Heuristik abgeleitet.
 *   documents (optional): frisch hochgeladene Unterlagen, die NICHT im Gehirn liegen.
 *   Sie fliessen als eigener, verbindlicher Faktenblock in den Prompt — lange
 *   Texte vorher als Steckbrief verdichtet. Der Empfaengertyp wird bewusst NICHT
 *   daraus abgeleitet: der Absender der Unterlage ist oft ein anderer als der
 *   Empfaenger der neuen Mail (Kassenbrief lesen, an den Patienten schreiben).
 * @returns {Promise<{ok:boolean, subject:string, body:string, contextUsed:object, model:string, fallback:boolean, reason?:string, documentsUsed:Array<object>}>}
 */
export async function draftLetter(clientId, { caseId, patientName, recipient, sourceText, sourceLetterIds, direction, tone, recipientType, useContext = true, documents } = {}) {
  const docs = await condenseDocuments(documents);
  const docsBlock = documentsBlock(docs);
  const ctx = useContext
    ? await assembleContext(clientId, { caseId, patientName, sourceText, sourceLetterIds })
    : { contextText: (sourceText && sourceText.trim()) ? "## Hochgeladener/zitierter Brief\n" + clip(sourceText, 4000) : "(kein Kontext vorhanden)", caseId: null, patient: patientName || null, sourceCategory: null, counts: { calls: 0, emails: 0, docs: 0, letters: 0 }, sourceIncluded: !!(sourceText && sourceText.trim()) };

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
    docs.length
      ? "Es liegen hochgeladene Unterlagen bei: werte sie aus und nimm ausdrücklich auf ihre Fakten Bezug (Aktenzeichen, Fristen, Forderungen, Beträge). Zahlen, Daten und Aktenzeichen übernimmst du WORTGETREU."
      : "",
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
    docsBlock,
    `\nKONTEXT AUS DEM GEMEINSAMEN GEHIRN:\n${ctx.contextText}`,
  ].join("\n");

  // Letters aren't latency-critical (unlike the voice loop), so Nadine uses the
  // strong model on the RTX-5090 (qwen3.6). No fallback to the weaker local 8b:
  // if the 5090 is unreachable, draftLetter degrades to the deterministic
  // template below — never to a weaker model. The big model is slower → generous
  // timeout.
  const { base: strongBase, model: strongModel } = strongLlm();
  const res = await chat(
    [{ role: "system", content: system }, { role: "user", content: user }],
    { temperature: 0.3, maxTokens: 900, model: strongModel, baseUrl: strongBase, timeoutMs: 120000 }
  );

  const documentsUsed = docs.map((d) => ({ filename: d.filename, condensed: d.condensed, chars: d.chars }));

  if (!res.ok) {
    return { ok: false, ...fallbackDraft({ direction, recipient, context: ctx.contextText, signature: sp.signature }), contextUsed: ctx, model: res.model, fallback: true, reason: res.reason, documentsUsed };
  }

  const parsed = parseLetterJson(res.text);
  if (!parsed) {
    // Model answered but not as JSON — use the raw text as the body.
    return { ok: true, subject: clip((direction || "Ihr Schreiben").replace(/[\r\n]+/g, " "), 60), body: res.text.trim(), contextUsed: ctx, model: res.model, fallback: false, documentsUsed };
  }
  return { ok: true, subject: parsed.subject || clip(direction || "Ihr Schreiben", 60), body: parsed.body, contextUsed: ctx, model: res.model, fallback: false, documentsUsed };
}

// Inline edit: rewrite ONLY the marked passage per the user's instruction. Used
// by the "Textstelle markieren & per Prompt ändern" feature. Returns just the
// rewritten span (plain text) so the frontend can splice it back in place.
/**
 * Mehrfach-Chat vor dem Niederschreiben einer E-Mail (Composer-Popup).
 * qwen3.6 diskutiert mit dem Team: Unterlagen analysieren, Argumente klären,
 * Antwortstrategie erarbeiten — OHNE schon die fertige Mail zu erzwingen.
 * Body-Felder (vom Aufrufer): messages[{role,content}], documents[{filename,text}],
 * recipient?, subjectHint?.
 */
export async function discussCompose(clientId, { messages, documents, recipient, subjectHint } = {}) {
  const history = Array.isArray(messages)
    ? messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && String(m.content || "").trim())
        .slice(-16)
        .map((m) => ({ role: m.role, content: clip(m.content, 3500) }))
    : [];
  if (!history.length) return { ok: false, reason: "no_messages", text: "", model: "" };

  const docs = await condenseDocuments(documents);

  const sp = await loadSenderProfile(clientId);
  const docsBlock = documentsBlock(docs);

  const system = [
    "Du bist Nadine, die Schreib- und Beratungs-KI der Praxis. Du hilfst dem Team, ein Thema ZUERST zu erörtern, bevor eine E-Mail niedergeschrieben wird.",
    sp.orgName ? `Absender-Praxis: ${sp.orgName}${sp.branchLabel ? ` (${sp.branchLabel})` : ""}.` : "",
    "Stil: klar, praxisnah, auf Deutsch. Du darfst Fragen stellen, Argumente prüfen, Risiken benennen und Formulierungsvorschläge skizzieren.",
    "Antworte KNAPP und konkret (typisch 8–20 Zeilen) — kein Aufsatz.",
    "WICHTIG: Schreibe in diesem Chat KEINE fertige, versandfertige E-Mail mit Anrede/Grußformel, es sei denn der Nutzer verlangt ausdrücklich einen Formulierungsvorschlag.",
    "Erfinde keine Beträge, Fristen, Aktenzeichen, Diagnosen oder Zusagen, die nicht in den Unterlagen oder im Gespräch stehen.",
    "Wenn eine Unterlage vorliegt, gehe KONKRET darauf ein (Aktenzeichen, Frist, Forderung, Ton).",
    recipient ? `Geplanter Empfänger: ${clip(recipient, 200)}.` : "",
    subjectHint ? `Betreff-Hinweis: ${clip(subjectHint, 200)}.` : "",
    "Antworte als Chatpartner — nicht als JSON.",
  ].filter(Boolean).join(" ") + docsBlock;

  const { base: strongBase, model: strongModel } = strongLlm();
  const t0 = Date.now();
  const res = await chat(
    [{ role: "system", content: system }, ...history],
    { temperature: 0.35, maxTokens: 900, model: strongModel, baseUrl: strongBase, timeoutMs: 90000 }
  );
  const ms = Date.now() - t0;
  if (!res.ok) {
    console.warn(`[compose-ai-chat] llm fail reason=${res.reason || "?"} model=${res.model} ms=${ms} docs=${docs.length}`);
    return { ok: false, reason: res.reason || "llm_error", text: "", model: res.model };
  }
  console.log(`[compose-ai-chat] ok model=${res.model} ms=${ms} docs=${docs.length} chars=${res.text.length}`);
  return { ok: true, text: res.text.trim(), model: res.model };
}

/**
 * Chatverlauf (+ Unterlagen) → fertige E-Mail (subject/body) über denselben
 * starken Draft-Pfad. Wird vom Button „E-Mail generieren“ im Diskussions-Popup
 * aufgerufen.
 */
export async function draftFromDiscussion(clientId, { messages, documents, recipient, subjectHint, tone } = {}) {
  const history = Array.isArray(messages)
    ? messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && String(m.content || "").trim())
        .slice(-30)
    : [];
  const docs = Array.isArray(documents)
    ? documents.filter((d) => d && String(d.text || "").trim()).slice(0, 6)
    : [];

  const transcript = history
    .map((m) => `${m.role === "user" ? "TEAM" : "NADINE"}: ${String(m.content || "").trim()}`)
    .join("\n\n");
  const docsText = docs
    .map((d, i) => `--- Unterlage ${i + 1}: ${d.filename || "Dokument"} ---\n${clip(d.text, 12000)}`)
    .join("\n\n");

  const sourceText = [
    docsText ? `## Unterlagen\n${docsText}` : "",
    transcript ? `## Gesprächsverlauf (erarbeitete Antwortstrategie)\n${transcript}` : "",
  ].filter(Boolean).join("\n\n");

  if (!sourceText.trim()) {
    return { ok: false, subject: "", body: "", fallback: true, reason: "no_discussion", model: "", contextUsed: null };
  }

  return draftLetter(clientId, {
    recipient,
    sourceText,
    direction: [
      "Formuliere JETZT die im Gespräch erarbeitete Antwort als fertige, versandfertige E-Mail.",
      "Nutze die im Gespräch vereinbarten Punkte, Tonlage und Zusagen — nichts Neues erfinden.",
      "Der E-Mail-Body enthält Anrede, Fließtext und Grußformel.",
      subjectHint ? `Betreff-Hinweis (falls passend): ${subjectHint}` : "",
    ].filter(Boolean).join("\n"),
    tone: tone || "freundlich, verbindlich",
    useContext: false, // Gespräch + Unterlagen sind die Quelle — kein fremder Gehirn-Kontext
  });
}

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

  const { base: strongBase, model: strongModel } = strongLlm();
  const res = await chat(
    [{ role: "system", content: system }, { role: "user", content: user }],
    { temperature: 0.3, maxTokens: 600, model: strongModel, baseUrl: strongBase, timeoutMs: 90000 }
  );
  if (!res.ok) return { ok: false, reason: res.reason, text: "", model: res.model };

  // Strip wrapping quotes/fences the model sometimes adds.
  let out = res.text.trim().replace(/^```[a-z]*\n?|\n?```$/gi, "").trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("„") && out.endsWith("“"))) out = out.slice(1, -1).trim();
  return { ok: true, text: out, model: res.model };
}

export { llmInfo };
