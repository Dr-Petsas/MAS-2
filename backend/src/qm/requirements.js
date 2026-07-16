import { listArtifacts, listRules, getArtifact, defaultProfileFor } from "./catalog.js";
import { reviewIntervalMonthsFor } from "./reviewPolicy.js";

// ============================================================================
// Anforderungs-Engine (PURE, kein I/O).
//
// Eingabe: Praxisprofil (Sektor, Tätigkeiten, Geräte/Merkmale).
// Ausgabe: pro Artefakt der Status required | recommended | optional samt
// Begründung(en) — auditierbar für eine KV-/Gesundheitsamt-Begehung.
//
// Bewusst KEINE 50x20-Matrix: Fachrichtung liefert nur Defaults, die finale
// Liste entsteht deklarativ aus den Regeln (qm-rules.json).
// ============================================================================

function asBool(v) {
  return v === true || v === 1 || v === "1" || v === "true" || v === "ja";
}

function normalizeProfile(input = {}) {
  const p = input || {};
  return {
    fachrichtung: String(p.fachrichtung || "").trim(),
    sector: String(p.sector || "").trim().toLowerCase(),
    activities: p.activities && typeof p.activities === "object" ? p.activities : {},
    capabilities: p.capabilities && typeof p.capabilities === "object" ? p.capabilities : {},
  };
}

/**
 * Evaluate a rule `when` clause against a profile. Grammar:
 *   { sector: ["arzt","zahnarzt"] }      -> profile.sector in list
 *   { capability: "roentgen", eq: true } -> capabilities.roentgen === eq
 *   { activity: "operativ", eq: true }   -> activities.operativ === eq
 *   { any: [ ... ] } / { all: [ ... ] }  -> recursion
 * Missing `when` is treated as "matches" (rule always applies in its sector).
 */
export function evalWhen(when, profile) {
  if (!when || typeof when !== "object") return true;

  if (Array.isArray(when.any)) {
    return when.any.some((sub) => evalWhen(sub, profile));
  }
  if (Array.isArray(when.all)) {
    return when.all.every((sub) => evalWhen(sub, profile));
  }
  if (Array.isArray(when.sector)) {
    return when.sector.map((s) => String(s).toLowerCase()).includes(profile.sector);
  }
  if (typeof when.capability === "string") {
    const want = when.eq === undefined ? true : asBool(when.eq);
    return asBool(profile.capabilities[when.capability]) === want;
  }
  if (typeof when.activity === "string") {
    const want = when.eq === undefined ? true : asBool(when.eq);
    return asBool(profile.activities[when.activity]) === want;
  }
  return true;
}

const STATUS_RANK = { required: 3, recommended: 2, optional: 1 };

/**
 * Resolve the QM requirements for a practice profile.
 * @returns {{ profile: object, items: Array<{key,title,type,category,status,reasons,legalBasis,hasInterview,defaultCycle,recurrenceMode}> }}
 */
export function resolveRequirements(input = {}) {
  const profile = normalizeProfile(input);
  const rules = listRules();

  // artifactKey -> { status, reasons:Set }
  const acc = new Map();

  for (const rule of rules) {
    const required = String(rule.required || "").trim(); // always|conditional|recommended
    if (!evalWhen(rule.when, profile)) continue;

    // map rule-kind to an item status
    const status = required === "always" || required === "conditional" ? "required"
      : required === "recommended" ? "recommended"
      : null;
    if (!status) continue;

    const cur = acc.get(rule.artifactKey) || { status: "optional", reasons: new Set() };
    if (STATUS_RANK[status] > STATUS_RANK[cur.status]) cur.status = status;
    if (rule.reason) cur.reasons.add(rule.reason);
    acc.set(rule.artifactKey, cur);
  }

  const items = [];
  for (const [key, v] of acc) {
    const a = getArtifact(key);
    if (!a) continue; // rule references an unknown artifact -> ignore safely
    items.push({
      key,
      title: a.title,
      type: a.type,
      category: a.category,
      status: v.status,
      reasons: [...v.reasons],
      legalBasis: a.legalBasis || [],
      hasInterview: a.hasInterview === true,
      defaultCycle: a.defaultCycle || null,
      recurrenceMode: a.recurrenceMode || "fixed",
      reviewIntervalMonths: reviewIntervalMonthsFor(a),
    });
  }

  // stable, human-friendly ordering: required first, then by category, then title
  items.sort((x, y) => {
    if (STATUS_RANK[y.status] !== STATUS_RANK[x.status]) return STATUS_RANK[y.status] - STATUS_RANK[x.status];
    if (x.category !== y.category) return x.category < y.category ? -1 : 1;
    return x.title < y.title ? -1 : x.title > y.title ? 1 : 0;
  });

  return { profile, items };
}

/** Convenience: full artifact list with a default status of "optional" (for the UI catalog view). */
export function allArtifactsWithStatus(input = {}) {
  const { items } = resolveRequirements(input);
  const byKey = new Map(items.map((i) => [i.key, i]));
  return listArtifacts().map((a) => byKey.get(a.key) || {
    key: a.key, title: a.title, type: a.type, category: a.category,
    status: "optional", reasons: [], legalBasis: a.legalBasis || [],
    hasInterview: a.hasInterview === true, defaultCycle: a.defaultCycle || null,
    recurrenceMode: a.recurrenceMode || "fixed",
    reviewIntervalMonths: reviewIntervalMonthsFor(a),
  });
}

export { defaultProfileFor };
