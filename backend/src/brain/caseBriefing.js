import { isActiveStatus, TOPIC_LABELS, tsToMs } from "./cases.js";

// ============================================================================
// Case-based briefing: ONE voice per matter (not per call). Where the raw
// event briefing would say "Frau Meier" three times, this says it once —
// "wegen der Rechnung, seit 3 Kontakten offen" — and every line carries its
// caseId so the monitor can jump straight to the ticket and Clara can open it
// by voice. PURE (cases in -> structured briefing + spoken text).
// ============================================================================

// Group order = urgency. Complaints first, identity gaps last.
const GROUP_ORDER = ["complaint", "billing", "appointment", "callback", "document", "other"];

// Role-based relevance: which topics each role hears in their briefing. A
// dentist shouldn't be read billing/appointment logistics; the front desk owns
// those. `admin`/unknown -> everything (null = no filter). Cases delegated to
// the operator are always included on top (handled in buildCaseBriefing).
const ROLE_TOPICS = Object.freeze({
  doctor: ["complaint", "other"],
  frontdesk: ["billing", "appointment", "callback", "document", "complaint"],
  admin: null,
});
function topicsForRole(role) {
  if (!role) return null;
  return Object.prototype.hasOwnProperty.call(ROLE_TOPICS, role) ? ROLE_TOPICS[role] : null;
}

function lastContactSummary(caseDoc) {
  const contacts = (caseDoc.updates || []).filter((u) => u.kind === "contact");
  const last = contacts[contacts.length - 1];
  return last?.text || caseDoc.title || "";
}

function toItem(caseDoc) {
  return {
    caseId: caseDoc.id,
    title: caseDoc.title,
    topic: caseDoc.topic,
    status: caseDoc.status,
    patient: caseDoc.subject?.name || "",
    matchStatus: caseDoc.subject?.matchStatus || "n/a",
    contactCount: caseDoc.contactCount || 0,
    assignee: caseDoc.assignee || null,
    lastContactAt: caseDoc.lastContactAt || tsToMs(caseDoc.updatedAt),
    summary: lastContactSummary(caseDoc),
  };
}

/**
 * Group active cases by topic into a prioritised read-model. Only active
 * (open/in_progress/waiting) cases surface — resolved/closed drop out.
 */
export function buildCaseBriefing(cases, opts = {}) {
  const now = opts.now ?? Date.now();
  const active = (cases || []).filter((c) => isActiveStatus(c.status));

  // Scope by role: keep allowed topics, but never hide a case delegated to this
  // operator (so "delegiert an dich" always surfaces, regardless of topic).
  const allowed = topicsForRole(opts.role);
  const opName = (opts.operatorName || "").trim().toLowerCase();
  const scoped = allowed
    ? active.filter((c) => allowed.includes(c.topic) || (opName && String(c.assignee || "").toLowerCase().includes(opName)))
    : active;

  const groups = {};
  for (const key of GROUP_ORDER) groups[key] = [];
  for (const c of scoped) {
    const item = toItem(c);
    (groups[c.topic] || groups.other).push(item);
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => (b.lastContactAt || 0) - (a.lastContactAt || 0));
  }

  const counts = Object.fromEntries(GROUP_ORDER.map((k) => [k, groups[k].length]));
  counts.openTotal = scoped.length;
  counts.hiddenByRole = active.length - scoped.length;
  return { generatedAt: now, role: opts.role || null, counts, groups };
}

function repeatPhrase(n) {
  if (n >= 2) return `seit ${n} Kontakten offen`;
  return "offen";
}

function assigneePhrase(a) {
  return a ? `, delegiert an ${a}` : "";
}

/**
 * Natural German TTS text. One sentence per matter, complaints first. Returns a
 * clean "nichts offen" when empty so Clara always has something sensible to say.
 */
export function buildSpokenCaseBriefing(briefing, opts = {}) {
  const g = briefing.groups;
  const parts = [];
  // Personal greeting when we know who is asking: "Guten Morgen, Dr. Petsas."
  const name = (opts.operatorName || "").trim();
  if (opts.greeting) parts.push(name ? `${opts.greeting.replace(/[.!]?$/, "")}, ${name}.` : opts.greeting);
  else if (name) parts.push(`${name},`);

  if (briefing.counts.openTotal === 0) {
    parts.push("Es ist aktuell kein für dich relevanter Vorgang offen. Alles erledigt.");
    return parts.join(" ");
  }

  const intro = {
    complaint: "Beschwerde",
    billing: "Rechnung",
    appointment: "Termin",
    callback: "Rückruf",
    document: "Dokumente",
    other: "Allgemein",
  };

  for (const key of GROUP_ORDER) {
    const items = g[key] || [];
    for (const it of items) {
      const who = it.patient || "Ein Anrufer";
      parts.push(`${who}: ${intro[key]} — ${repeatPhrase(it.contactCount)}${assigneePhrase(it.assignee)}.`);
    }
  }
  return parts.join(" ");
}
