import { isOpenItem, applyHumanReview } from "./events.js";

// ============================================================================
// Briefing read-model (PURE: events in -> structured briefing + spoken text).
//
// "Clara, wie sieht mein Tag aus?" / 3x täglich (morgens, Mittagspause, Feier-
// abend). We only ever surface OPEN, actionable items — anything an AI or a
// human already resolved drops out automatically. Items are grouped by what the
// team needs to DO, ordered by urgency, and every line is attributed so it can
// be trusted ("laut Anruf …").
//
// This is the first consumer of the shared brain. The revenue coach, the
// monitor list and on-demand Q&A read the same events with different lenses.
// ============================================================================

function who(event) {
  const name = (event.counterparty?.name || "").trim();
  if (name) return name;
  if (event.subject?.name) return event.subject.name;
  return "Unbekannt";
}

function aboutPatient(event) {
  const subjectName = (event.subject?.name || "").trim();
  // Only worth naming the patient separately when the caller ISN'T the patient
  // (e.g. a colleague calling about someone) — avoids "Meier (Patient: Meier)".
  const cpName = (event.counterparty?.name || "").trim();
  const isSelf = event.counterparty?.kind === "patient" || (cpName && cpName === subjectName);
  return isSelf ? "" : subjectName;
}

function toItem(event) {
  return {
    eventId: event.id,
    ts: event.ts,
    channel: event.channel,
    who: who(event),
    aboutPatient: aboutPatient(event),
    matchStatus: event.subject?.matchStatus || "n/a",
    summary: (event.summary || "").trim(),
    confidence: event.confidence ?? null,
    signals: event.signals || {},
  };
}

// Assign each open event to exactly ONE primary group, by urgency. This keeps
// the spoken briefing concise and non-repetitive ("wie ein echter Mitarbeiter")
// — the full signal set stays on the item so a richer monitor view can still
// show secondary tags. Order here defines priority.
function classify(event) {
  const sig = event.signals || {};
  const match = event.subject?.matchStatus;
  if (match === "ambiguous" || match === "unmatched") return "needsIdentity";
  if (sig.complaintStated || sig.painPersists || sig.repeatVisitStated) return "complaints";
  if (event.counterparty?.kind === "colleague") return "colleagueCalls";
  if (sig.unresolvedByAI || sig.needsHuman) return "unresolvedByAI";
  if (sig.callbackRequested) return "callbacks";
  if (sig.billingQuestion) return "billing";
  if (sig.documentRelated) return "documents";
  return null; // open but uncategorised — not surfaced in the spoken briefing
}

/**
 * Aggregate raw events into a grouped, prioritised briefing read-model.
 *
 * Each event can appear in MORE THAN ONE group when it carries multiple signals
 * (e.g. an angry billing call). Groups are mutually useful, not mutually
 * exclusive. Order of groups reflects urgency.
 *
 * @param {object[]} events
 * @param {{now?: number, windowStart?: number}} [opts]
 */
export function buildBriefing(events, opts = {}) {
  const now = opts.now ?? Date.now();
  // Apply human corrections before aggregating so the briefing reflects what the
  // team last confirmed, not the raw machine extraction.
  const open = (events || []).map(applyHumanReview).filter(isOpenItem);

  const groups = {
    complaints: [], // verärgert / Schmerz hält an / mehrfach da gewesen
    callbacks: [], // Rückrufbitten
    billing: [], // Rechnungs-/Kostenfragen
    colleagueCalls: [], // Kollege/Überweiser hat angerufen
    unresolvedByAI: [], // KI konnte es nicht lösen / braucht Mensch
    documents: [], // Dokumente/Formulare
    needsIdentity: [], // Patient nicht eindeutig zugeordnet
  };

  for (const event of open) {
    const group = classify(event);
    if (group) groups[group].push(toItem(event));
  }

  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  const counts = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
  counts.openTotal = open.length;

  return { generatedAt: now, windowStart: opts.windowStart ?? null, counts, groups };
}

function pat(item) {
  return item.aboutPatient ? ` (Patient: ${item.aboutPatient})` : "";
}

function lines(items, render) {
  return items.map(render);
}

/**
 * Render a briefing into a concise, natural German text for Clara's TTS.
 * Prioritised: complaints & unresolved first, then callbacks, billing,
 * colleague calls, documents, and finally identity gaps. Returns "" when there
 * is nothing open, so Clara can say a clean "Nichts Offenes".
 *
 * @param {ReturnType<typeof buildBriefing>} briefing
 * @param {{greeting?: string}} [opts]
 */
export function buildSpokenBriefing(briefing, opts = {}) {
  const g = briefing.groups;
  const parts = [];
  if (opts.greeting) parts.push(opts.greeting);

  if (briefing.counts.openTotal === 0) {
    parts.push("Aktuell ist nichts Offenes für dich da. Alles erledigt.");
    return parts.join(" ");
  }

  if (g.complaints.length) {
    parts.push(
      `${g.complaints.length === 1 ? "Ein Patient" : g.complaints.length + " Patienten"} ` +
        `${g.complaints.length === 1 ? "hat" : "haben"} sich unzufrieden geäußert:`
    );
    parts.push(...lines(g.complaints, (it) => `${it.who}${pat(it)}: ${it.summary}`));
  }

  if (g.unresolvedByAI.length) {
    parts.push(
      `${g.unresolvedByAI.length} ${g.unresolvedByAI.length === 1 ? "Anliegen wurde" : "Anliegen wurden"} ` +
        `noch nicht gelöst und ${g.unresolvedByAI.length === 1 ? "braucht" : "brauchen"} dich:`
    );
    parts.push(...lines(g.unresolvedByAI, (it) => `${it.who}${pat(it)}: ${it.summary}`));
  }

  if (g.callbacks.length) {
    parts.push(`${g.callbacks.length} ${g.callbacks.length === 1 ? "Rückrufbitte" : "Rückrufbitten"}:`);
    parts.push(...lines(g.callbacks, (it) => `${it.who}${pat(it)} bittet um Rückruf — ${it.summary}`));
  }

  if (g.billing.length) {
    parts.push(`${g.billing.length} ${g.billing.length === 1 ? "Rechnungsfrage" : "Rechnungsfragen"}:`);
    parts.push(...lines(g.billing, (it) => `${it.who}${pat(it)}: ${it.summary}`));
  }

  if (g.colleagueCalls.length) {
    parts.push(`${g.colleagueCalls.length === 1 ? "Ein Kollege hat" : g.colleagueCalls.length + " Kollegen haben"} angerufen:`);
    parts.push(...lines(g.colleagueCalls, (it) => `${it.who}${pat(it)}: ${it.summary}`));
  }

  if (g.documents.length) {
    parts.push(`${g.documents.length} ${g.documents.length === 1 ? "Dokumenten-Anliegen" : "Dokumenten-Anliegen"}:`);
    parts.push(...lines(g.documents, (it) => `${it.who}${pat(it)}: ${it.summary}`));
  }

  if (g.needsIdentity.length) {
    parts.push(
      `${g.needsIdentity.length} ${g.needsIdentity.length === 1 ? "Anruf konnte" : "Anrufe konnten"} ` +
        `keinem Patienten eindeutig zugeordnet werden — bitte kurz prüfen:`
    );
    parts.push(...lines(g.needsIdentity, (it) => `${it.who}: ${it.summary}`));
  }

  return parts.join(" ");
}
