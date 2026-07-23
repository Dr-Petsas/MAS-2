// Neutrale Bruecke zwischen Clara/Infrastruktur und Lena (Stand 23.07.2026).
//
// Zweck der Trennung: Clara und der Tool-Router importieren NIEMALS direkt
// Lena-Logik. Stattdessen meldet Lena beim Server-Boot ihre Implementierungen
// hier an (register*Provider). Ist Lena nicht geladen oder defekt, liefern die
// Funktionen sichere Defaults zurueck — der Server bootet, und Clara laeuft
// unbeschadet weiter. So kann kein Umbau an Lena Clara zum Absturz bringen.
//
// WICHTIG: Diese Datei darf WEDER aus ../clara NOCH aus ../lena importieren
// (sonst entstehen Zyklen und die Entkopplung ist hinfaellig).

const EMPTY_BRIEFING = Object.freeze({ spoken: "", cardNote: "", facts: [], source: "none" });
const LENA_OFFLINE = Object.freeze({
  ok: false,
  message: "Die Behandlungs-Dokumentation (Lena) ist gerade nicht verfügbar.",
});

let _visitBriefing = null;
let _dictation = null;

/** Lena meldet ihren Besuchs-Briefing-Provider an. */
export function registerVisitBriefingProvider(fn) {
  _visitBriefing = typeof fn === "function" ? fn : null;
}

/** Lena meldet ihre Diktat-/Doku-Funktionen an (Objekt mit den Handlern). */
export function registerDictationProvider(obj) {
  _dictation = obj && typeof obj === "object" ? obj : null;
}

/** true, wenn Lenas Funktionen registriert sind (fuer Health/Diagnose). */
export function lenaAvailable() {
  return !!_visitBriefing && !!_dictation;
}

/** Gewichtetes „Beim letzten Mal…“-Briefing. Ohne Lena: leeres Briefing. */
export async function loadWeightedVisitBriefing(clientId, opts = {}) {
  if (typeof _visitBriefing !== "function") return { ...EMPTY_BRIEFING };
  try {
    const r = await _visitBriefing(clientId, opts);
    return r || { ...EMPTY_BRIEFING };
  } catch {
    return { ...EMPTY_BRIEFING };
  }
}

function dictationHandler(name) {
  return async (...args) => {
    const fn = _dictation ? _dictation[name] : null;
    if (typeof fn !== "function") return { ...LENA_OFFLINE };
    return fn(...args);
  };
}

export const readTreatmentDictation = dictationHandler("readTreatmentDictation");
export const findInTreatment = dictationHandler("findInTreatment");
export const readTreatmentLabels = dictationHandler("readTreatmentLabels");
export const addTreatmentLabel = dictationHandler("addTreatmentLabel");
export const findBackdatedAppointment = dictationHandler("findBackdatedAppointment");
