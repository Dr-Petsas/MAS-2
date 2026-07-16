import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ============================================================================
// QM-Stammwissen: Artefakt-Katalog, Aktivierungsregeln, Fachrichtungs-Profile.
//
// Das ist KEIN Mandantendatum, sondern versionierte Konfiguration. Hier nur
// Laden + Indizieren (pure, kein Firestore). Pro Praxis wird ausschließlich das
// ERGEBNIS gespeichert (mas_qm_books) — nie der Katalog kopiert.
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data", "qm");

function load(file) {
  return JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8"));
}

const ARTIFACTS = load("qm-artifacts.json").artifacts || [];
const RULES = load("qm-rules.json").rules || [];
const FACHRICHTUNGEN = load("qm-fachrichtungen.json").fachrichtungen || [];
const WIZARDS_DOC = load("qm-wizards.json");
const WIZARDS = Array.isArray(WIZARDS_DOC.wizards) ? WIZARDS_DOC.wizards : [];
const OPTION_LISTS = WIZARDS_DOC.optionLists || {};
const PROFILE_WIZARD = WIZARDS_DOC.profileWizard || null;

const ARTIFACT_BY_KEY = new Map(ARTIFACTS.map((a) => [a.key, a]));
const FACHRICHTUNG_BY_KEY = new Map(FACHRICHTUNGEN.map((f) => [f.key, f]));
const WIZARD_BY_KEY = new Map(WIZARDS.map((w) => [w.wizardKey, w]));

export function listArtifacts() {
  return ARTIFACTS.slice();
}

export function getArtifact(key) {
  return ARTIFACT_BY_KEY.get(String(key || "").trim()) || null;
}

export function listRules() {
  return RULES.slice();
}

export function listFachrichtungen() {
  // Schlanke Liste für UI-Dropdowns (ohne die Default-Blöcke).
  return FACHRICHTUNGEN.map((f) => ({ key: f.key, label: f.label, sector: f.sector }));
}

export function getFachrichtung(key) {
  return FACHRICHTUNG_BY_KEY.get(String(key || "").trim()) || null;
}

// --- Wizards (deterministische Fragebögen) ---
export function listWizards() {
  return WIZARDS.map((w) => ({
    wizardKey: w.wizardKey,
    artifactKey: w.artifactKey || null,
    title: w.title,
    produces: w.produces || null,
    requiresCapability: w.requiresCapability || null,
    sectionCount: Array.isArray(w.sections) ? w.sections.length : 0,
  }));
}

export function getWizard(key) {
  return WIZARD_BY_KEY.get(String(key || "").trim()) || null;
}

export function getProfileWizard() {
  return PROFILE_WIZARD;
}

/** Reusable dropdown options (FREQ/ROLE/…). FACHRICHTUNGEN wird dynamisch ergänzt. */
export function getOptionList(ref) {
  const key = String(ref || "").trim();
  if (key === "FACHRICHTUNGEN") return listFachrichtungen().map((f) => ({ value: f.key, label: f.label }));
  return OPTION_LISTS[key] || null;
}

export function getOptionLists() {
  return { ...OPTION_LISTS, FACHRICHTUNGEN: listFachrichtungen().map((f) => ({ value: f.key, label: f.label })) };
}

// Default-Profil aus einer Fachrichtung ableiten (Vorbelegung fürs Onboarding).
export function defaultProfileFor(fachrichtungKey) {
  const f = getFachrichtung(fachrichtungKey);
  if (!f) return null;
  return {
    fachrichtung: f.key,
    sector: f.sector,
    activities: { ...(f.defaultActivities || {}) },
    capabilities: { ...(f.defaultCapabilities || {}) },
    confirmQuestions: (f.confirmQuestions || []).slice(),
  };
}
