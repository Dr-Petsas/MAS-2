// Eigene Texte einer Praxis fuer die Anliegen-Knoepfe der Clara-Seite.
//
// Die Vorgaben stehen in public/m/clara-vorlagen.js. Hier liegt nur, was eine
// Praxis daran geaendert hat: je Knopf der eigene Text, unter
// clients/{id}/mas_config/notiz_vorlagen. Ohne Eintrag gilt die Vorgabe.

import { masCollection } from "../tenant.js";

export const MAX_VORLAGEN = 80;
export const MAX_TEXT = 600;

function ref(clientId) {
  return masCollection(clientId, "mas_config").doc("notiz_vorlagen");
}

/** Nur saubere Eintraege behalten: { knopfId: "Text" }. */
export function vorlagenSaeubern(eingabe) {
  const out = {};
  if (!eingabe || typeof eingabe !== "object" || Array.isArray(eingabe)) return out;
  for (const [id, wert] of Object.entries(eingabe)) {
    const key = String(id).trim().slice(0, 60);
    const text = typeof wert === "string" ? wert.trim().slice(0, MAX_TEXT) : "";
    if (!key || !text) continue;
    out[key] = text;
    if (Object.keys(out).length >= MAX_VORLAGEN) break;
  }
  return out;
}

export async function ladeVorlagen(clientId) {
  const snap = await ref(clientId).get();
  return vorlagenSaeubern(snap.exists ? snap.data()?.texte : {});
}

/** Einen Knopf-Text setzen; leerer Text stellt die Vorgabe wieder her. */
export async function setzeVorlage(clientId, id, text, { by = "Team" } = {}) {
  const key = String(id || "").trim().slice(0, 60);
  if (!key) throw new Error("id required");
  const texte = await ladeVorlagen(clientId);
  const neu = typeof text === "string" ? text.trim().slice(0, MAX_TEXT) : "";
  if (neu) texte[key] = neu;
  else delete texte[key];
  const sauber = vorlagenSaeubern(texte);
  await ref(clientId).set({ texte: sauber, updatedAt: Date.now(), updatedBy: String(by || "Team").slice(0, 80) });
  return sauber;
}
