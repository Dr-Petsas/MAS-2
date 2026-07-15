import { getCaseContext, saveCaseDraft, addUpdate } from "../brain/caseStore.js";
import { draftLetter } from "./letterAI.js";
import { log } from "../log.js";

// Nadine's autonomous preparation step. When a case is delegated to her, she
// drafts the reply/letter automatically from the shared-brain context and parks
// it for HUMAN APPROVAL (saveCaseDraft moves the case to "waiting_approval").
// Nothing is ever sent here — approval-first by design. The local LLM is used
// when reachable; otherwise we fall back to the deterministic starter draft so
// an approvable draft ALWAYS exists.

/**
 * Prepare (and persist) an approval-ready draft for a case.
 *
 * @param {string} clientId
 * @param {string} caseId
 * @param {{ by?: string }} [opts]
 * @returns {Promise<{ok:boolean, reason?:string, draft?:object, status?:string, fallback?:boolean}>}
 */
export async function prepareCaseDraft(clientId, caseId, { by = "Nadine" } = {}) {
  try {
    return await prepareCaseDraftInner(clientId, caseId, { by });
  } catch (err) {
    // NEVER fail silently: a delegated case whose draft preparation breaks must
    // SHOW the problem in the thread/Aufträge so the team picks it up manually.
    log.error("prepareCaseDraft failed", { clientId, caseId, err });
    await addUpdate(clientId, caseId, {
      by,
      kind: "note",
      text: `⚠️ Nadine konnte keinen Entwurf vorbereiten (${String(err?.message || err)}). Bitte den Vorgang manuell bearbeiten.`,
    }).catch(() => { /* if even this write fails, the scheduler/outbox path still has the event */ });
    return { ok: false, reason: "draft_failed", error: String(err?.message || err) };
  }
}

async function prepareCaseDraftInner(clientId, caseId, { by = "Nadine" } = {}) {
  const ctx = await getCaseContext(clientId, caseId);
  if (!ctx?.case) return { ok: false, reason: "not_found" };

  const c = ctx.case;
  const instruction =
    (c.handoff?.instruction || "").trim() ||
    `Antwortschreiben zum Vorgang „${c.title}“ vorbereiten.`;
  const recipient = c.subject?.name || "";

  // Confidentiality guard: we ALWAYS draft from THIS matter's own context
  // (its thread, phone calls and the incoming letter) — that is scoped to a
  // single case and can never bleed another patient's data in. What we gate on
  // a confirmed identity is only whether we TRUST the recipient enough to skip
  // the caution banner below; on an ambiguous subject we still use the case
  // context but flag it for a human check before sending.
  const strongIdentity = !!c.subject?.patientId && c.subject?.matchStatus === "matched";

  let draft = null;
  let fallback = true;
  try {
    const r = await draftLetter(clientId, { caseId, recipient, direction: instruction, useContext: true });
    if (r && r.body && !r.fallback) {
      draft = {
        channel: "email",
        to: ctx.suggestedDraft?.to || "",
        subject: r.subject || ctx.suggestedDraft?.subject || c.title || "",
        body: r.body,
      };
      fallback = false;
    }
  } catch {
    /* model unreachable — fall back below */
  }

  // Deterministic fallback so there is always something to approve/edit.
  if (!draft) draft = ctx.suggestedDraft || { channel: "email", to: "", subject: c.title || "", body: "" };

  // When the patient isn't uniquely identified, prepend a visible caution so the
  // human verifies the recipient before approving/sending.
  if (!strongIdentity) {
    const warn = "⚠️ Patient nicht eindeutig zugeordnet — bitte Empfänger prüfen, bevor du freigibst. (Es wurde keine frühere Patienten-Historie verwendet.)";
    draft = { ...draft, body: draft.body ? `${warn}\n\n${draft.body}` : warn, needsIdentityCheck: true };
  }

  const saved = await saveCaseDraft(clientId, caseId, draft, { by });

  // Be honest about HOW the draft was produced so the approver knows what they
  // are signing off: a template (KI nicht erreichbar) needs more scrutiny than
  // an AI draft, and a non-strong identity needs the recipient verified.
  if (fallback) {
    await addUpdate(clientId, caseId, {
      by,
      kind: "note",
      text: "Hinweis: Entwurf aus Vorlage erstellt (KI nicht erreichbar) — bitte vor Freigabe inhaltlich prüfen.",
    }).catch(() => { /* non-blocking */ });
  }

  return { ok: true, draft: saved.draft || draft, status: saved.status, fallback, strongIdentity };
}
