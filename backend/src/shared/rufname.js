// Ruf-Name der Sprach-Assistentin pro Mandant (Phase W-NAME, Chef 26.08.2026).
//
// EINE Quelle der Wahrheit fuer alle kundenhoerbaren und kundenlesbaren
// Selbstbezuege der Assistentin (Push "X ruft an", Tour-Erzaehlerin,
// Persona-Prompts, SMS-/Tool-Texte). Gespeichert wird der Name am
// Plattform-Stammdokument clients/{clientId} im Feld `assistantName`
// (gepflegt ueber App-Superuser/Onboarder). Leer/fehlt = Default "Clara".
//
// BEWUSST NICHT hierueber laufen: Urheber-/Audit-Felder wie `by: "Clara"`
// in Vorgaengen und Events. Das sind stabile System-Identifier (Filter,
// Timelines, Alt-Daten) — die ANZEIGE personalisiert das Frontend
// (assistantNameService.withAssistantName). Ein dynamisches `by` wuerde
// Alt-/Neu-Daten auseinanderreissen.
//
// Fehlerpfad: getAssistantName() wirft NIE — der Anzeigename haengt im
// Push-/Sprachpfad; ein Firestore-Schluckauf darf keinen Anruf brechen.

import { clientRef } from "../tenant.js";

export const DEFAULT_ASSISTANT_NAME = "Clara";

// 10-Minuten-Cache wie loadPraxisIdentitaet (Stammdaten aendern sich selten).
const _cache = new Map();
const CACHE_MS = 10 * 60000;

/** Ruf-Name der Assistentin dieses Mandanten. Nie leer, nie werfend. */
export async function getAssistantName(clientId) {
  const id = (clientId || "").trim();
  if (!id) return DEFAULT_ASSISTANT_NAME;
  const hit = _cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.name;
  let name = DEFAULT_ASSISTANT_NAME;
  try {
    const snap = await clientRef(id).get();
    const raw = snap.exists ? (snap.data() || {}).assistantName : "";
    const trimmed = (raw == null ? "" : String(raw)).trim();
    if (trimmed) name = trimmed;
  } catch {
    return DEFAULT_ASSISTANT_NAME; // Fehler nicht cachen — naechster Aufruf versucht es neu
  }
  _cache.set(id, { at: Date.now(), name });
  return name;
}

/** Cache leeren (Tests / sofort nach Namensaenderung). */
export function invalidateAssistantName(clientId) {
  if (clientId) _cache.delete(String(clientId).trim());
  else _cache.clear();
}

/** Deutscher Genitiv: "Luna" -> "Lunas", "Iris" -> "Iris'". */
export function assistantNameGenitive(name) {
  const n = (name || "").trim() || DEFAULT_ASSISTANT_NAME;
  return /[sxz\u00df]$/i.test(n) ? `${n}'` : `${n}s`;
}

/**
 * Ersetzt "Clara"/"Claras" (Wortgrenze) in einem Text durch den Ruf-Namen.
 * Beim Default-Namen wird der Text unveraendert zurueckgegeben —
 * byte-identisches Verhalten, solange keine Praxis den Namen setzt.
 */
export function withAssistantName(text, name) {
  const n = (name || "").trim();
  if (!text || !n || n === DEFAULT_ASSISTANT_NAME) return text;
  return String(text)
    .replace(/\bClaras\b/g, assistantNameGenitive(n))
    .replace(/\bClara\b/g, n);
}
