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

const ARTIFACT_BY_KEY = new Map(ARTIFACTS.map((a) => [a.key, a]));
const FACHRICHTUNG_BY_KEY = new Map(FACHRICHTUNGEN.map((f) => [f.key, f]));

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
