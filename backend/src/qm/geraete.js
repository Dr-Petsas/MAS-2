// ============================================================================
// Geraete-Wissensbasis (Julia) — Loader + Ableitung von Pruef-/Validierungs-Jobs.
//
// Liest src/data/qm/qm-geraete.json (globaler Katalog + Fachrichtung->Geraete)
// und stellt Helfer bereit:
//  - geraeteKatalog(), geraetById(key)
//  - geraeteFuerFachrichtung(key)  -> { typisch:[], optional:[] } (aufgeloest)
//  - dueDateFor(pruefung, lastIso) -> naechstes Faelligkeitsdatum (ISO)
//  - jobsForGeraet({ key, lastDates })  -> deterministische Job-Vorlagen je Geraet
//
// Grundsatz: Aus jedem erfassten Geraet + (letztem) Pruefdatum ergeben sich die
// naechsten faelligen Pruefungen. Fehlt ein Datum, wird der Job als "sofort
// faellig / Datum nachtragen" angelegt (konservativ).
// ============================================================================

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const DATA = require("../data/qm/qm-geraete.json");

const KAT = Array.isArray(DATA.geraeteKatalog) ? DATA.geraeteKatalog : [];
const KAT_BY_KEY = new Map(KAT.map((g) => [g.key, g]));
const FR = DATA.fachrichtungGeraete || {};

export function geraeteKatalog() {
  return KAT.map((g) => ({ ...g }));
}
export function geraetById(key) {
  const g = KAT_BY_KEY.get(String(key || "").trim());
  return g ? { ...g } : null;
}
export function gruppen() {
  return { ...(DATA.gruppen || {}) };
}

/** Aufgeloeste Geraeteliste einer Fachrichtung (fallback: _default). */
export function geraeteFuerFachrichtung(fachKey) {
  const entry = FR[String(fachKey || "").trim()] || FR._default || { typisch: [], optional: [] };
  const resolve = (arr) => (arr || []).map((k) => geraetById(k)).filter(Boolean);
  return { typisch: resolve(entry.typisch), optional: resolve(entry.optional) };
}

// Pruef-Typ -> QM-Buch, in dem der Job/Schedule gefuehrt wird. Fehlt das Buch
// im Katalog (qm-artifacts.json), faellt der Aufrufer auf "kein Job" zurueck.
const BOOK_BY_TYP = {
  sachverstaendigenpruefung: "radiation_expert_inspection",
  konstanzpruefung: "constancy_book",
  validierung: "sterilization_log",
  leistungspruefung: "sterilization_log",
  siegelnahtpruefung: "sterilization_log",
  wasserpruefung: "sterilization_log",
  stk: "device_stk_log",
  funktionspruefung: "emergency_checklist",
  bestandspruefung: "emergency_checklist",
  temperaturkontrolle: "temperature_log",
};
export function bookForPruefung(typ) {
  return BOOK_BY_TYP[String(typ || "").trim()] || "";
}

const MONTH_MS = 30.44 * 24 * 3600 * 1000;

/**
 * Naechstes Faelligkeitsdatum: letztes Datum + intervalMonths. Ohne intervalMonths
 * (0 / arbeitstaeglich) -> heute (der wiederkehrende Schedule uebernimmt danach).
 * Ohne lastIso -> heute (Datum unbekannt, sofort nachtragen).
 * @returns {{ dueIso:string, overdue:boolean, ageMonths:number|null }}
 */
export function dueDateFor(pruefung, lastIso) {
  const now = Date.now();
  const interval = Number(pruefung?.intervalMonths || 0);
  const last = lastIso ? Date.parse(lastIso) : NaN;
  if (!Number.isFinite(last)) return { dueIso: new Date(now).toISOString(), overdue: !!interval, ageMonths: null };
  const ageMonths = Math.max(0, (now - last) / MONTH_MS);
  if (!interval) return { dueIso: new Date(now).toISOString(), overdue: false, ageMonths };
  const due = last + interval * MONTH_MS;
  return { dueIso: new Date(Math.max(due, now - MONTH_MS)).toISOString(), overdue: due < now, ageMonths };
}

/**
 * Deterministische Job-/Schedule-Vorlagen fuer EIN Geraet.
 * @param {{ key:string, label?:string, lastDates?:Record<string,string>, attrs?:object }} g
 *   lastDates: pro Pruef-Typ das letzte Datum (ISO), z. B. { validierung: "2019-03-01" }.
 * @returns {Array<{ title, cycle, role, dueAt, overdue, typ, legalBasis, deviceKey, deviceLabel }>}
 */
export function jobsForGeraet(g) {
  const dev = geraetById(g?.key);
  if (!dev) return [];
  const label = g.label || dev.label;
  const lastDates = g.lastDates || {};
  return (dev.pruefungen || []).map((p) => {
    const { dueIso, overdue } = dueDateFor(p, lastDates[p.typ]);
    return {
      title: `${p.titel} — ${label}`,
      cycle: p.cycle,
      role: p.rolle,
      dueAt: dueIso,
      overdue,
      typ: p.typ,
      legalBasis: p.legalBasis,
      deviceKey: dev.key,
      deviceLabel: label,
    };
  });
}
