// Gelernte Namens-Verhoerer je Praxis (06.10.2026, "Ich meinte Petsas").
// Clara meldet ein Paar "falsch -> richtig", wenn der Chef einen verhoerten
// Namen korrigiert; der Worker holt die Liste mit /clara/stt-patient-names und
// ersetzt das falsche Wort kuenftig vor dem Modell.
//
// Notaus: MAS_STT_KORREKTUR=0 => nichts merken, nichts ausliefern.

import { masCollection } from "../tenant.js";
import { ensureCatalog, nameTokens } from "./patientCatalog.js";

export const MAX_PAARE = 500;

export function korrekturenAn() {
  return !/^(0|false|no|off)$/i.test(String(process.env.MAS_STT_KORREKTUR ?? "1").trim());
}

function ref(clientId) {
  return masCollection(clientId, "mas_config").doc("stt_korrekturen");
}

const WORT_RE = /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]{2,39}$/;

function wort(v) {
  return String(v ?? "").trim();
}

/** Alle Namenswoerter der Kartei (Vor- und Nachnamen, normalisiert). */
export function namensWoerter(entries = []) {
  const out = new Set();
  for (const e of entries) {
    for (const t of nameTokens(`${e.f || ""} ${e.l || ""}`)) out.add(t);
  }
  return out;
}

/**
 * Paar pruefen: das richtige Wort muss ein Name der Kartei sein, das falsche
 * darf keiner sein — sonst wuerde ein echter Patient kuenftig umbenannt.
 * @returns {{ok:true, falsch:string, richtig:string} | {ok:false, grund:string}}
 */
export function paarPruefen(paar, woerter) {
  const falsch = wort(paar?.falsch);
  const richtig = wort(paar?.richtig);
  if (!WORT_RE.test(falsch) || !WORT_RE.test(richtig)) return { ok: false, grund: "kein_wort" };
  const nf = nameTokens(falsch).join("");
  const nr = nameTokens(richtig).join("");
  if (!nf || nf === nr) return { ok: false, grund: "gleich" };
  if (!woerter.has(nr)) return { ok: false, grund: "richtig_unbekannt" };
  if (woerter.has(nf)) return { ok: false, grund: "falsch_ist_name" };
  return { ok: true, falsch, richtig };
}

/** Neues Paar in die Liste: gleiches falsches Wort wird ueberschrieben, Aelteste fallen raus. */
export function paarEinfuegen(liste = [], paar, jetzt = Date.now()) {
  const nf = nameTokens(paar.falsch).join("");
  const alt = liste.find((p) => nameTokens(p.falsch).join("") === nf);
  const rest = liste.filter((p) => p !== alt);
  const neu = { falsch: paar.falsch, richtig: paar.richtig, n: (alt && alt.richtig === paar.richtig ? alt.n || 1 : 0) + 1, at: jetzt };
  return [...rest, neu].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, MAX_PAARE);
}

export async function korrekturenLaden(clientId) {
  if (!korrekturenAn()) return [];
  const snap = await ref(clientId).get();
  const paare = snap.exists ? snap.data()?.paare : null;
  return Array.isArray(paare) ? paare.filter((p) => p && p.falsch && p.richtig) : [];
}

export async function korrekturMerken(clientId, paar) {
  if (!korrekturenAn()) return { ok: false, grund: "aus" };
  const cat = await ensureCatalog(clientId);
  if (!cat?.entries?.length) return { ok: false, grund: "keine_kartei" };
  const geprueft = paarPruefen(paar, namensWoerter(cat.entries));
  if (!geprueft.ok) return geprueft;
  const liste = paarEinfuegen(await korrekturenLaden(clientId), geprueft);
  await ref(clientId).set({ paare: liste, updatedAt: Date.now() }, { merge: true });
  return { ok: true, falsch: geprueft.falsch, richtig: geprueft.richtig, anzahl: liste.length };
}
