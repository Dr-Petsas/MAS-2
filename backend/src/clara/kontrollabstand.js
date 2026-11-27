// Kontrollabstand je Behandlung (Chef 27.11.2026): Lisa nennt, in welchem Abstand die Kontrolle faellig ist.
// Der Wert ist der Recall-Abstand, den die Praxis in der Plattform am Besuchsgrund eingestellt hat
// (visitMotives: recurrenceCount und recurrenceInterval, z. B. "6-m" oder "1-y"), und zwar am Besuchsgrund
// des Termins, aus dem der Recall entstand. Er gilt nur, wenn der Recall auch wirklich in diesem Abstand
// gerechnet wurde (Faelligkeit minus ausloesender Termin). Sonst gibt es keinen Wert: nichts wird geraten.
import admin from "../firebase.js";

const s = (v) => String(v ?? "").trim();
const TAG_MS = 86400000;

function teile(intervall) {
  const t = s(intervall).toLowerCase().split("-");
  const n = Number(t[0]);
  return t.length === 2 && Number.isInteger(n) && n > 0 ? { n, einheit: t[1] } : null;
}

/** Pure: "6-m" -> 6, "1-y" -> 12. Tage und Wochen ergeben keinen Monatswert. Nur ganze Monate von 1 bis 240. */
export function abstandMonate(intervall) {
  const t = teile(intervall);
  const monate = !t ? 0 : t.einheit === "m" ? t.n : t.einheit === "y" ? t.n * 12 : 0;
  return monate >= 1 && monate <= 240 ? monate : null;
}

/** Pure: so viele Tage rechnet die Plattform fuer den Abstand ("6-m" -> 180, "12-m" -> 360, "1-y" -> 365). */
export function abstandTage(intervall) {
  const t = teile(intervall);
  return !t ? null : t.einheit === "m" ? t.n * 30 : t.einheit === "y" ? t.n * 365 : null;
}

/**
 * Pure: Recall-Abstand eines Besuchsgrunds in Monaten, oder null. Zaehlt nur mit eingeschaltetem Recall-Muster
 * (recurrenceCount ungleich 0); an vielen Besuchsgruenden steht ein Abstand, ohne dass ein Recall laeuft.
 */
export function recallAbstandMonate(motiv) {
  const anzahl = Number(motiv?.recurrenceCount ?? 0);
  if (!Number.isFinite(anzahl) || anzahl === 0) return null;
  return abstandMonate(motiv.recurrenceInterval);
}

/**
 * Pure: der Abstand gilt nur, wenn zwischen ausloesendem Termin und Faelligkeit auch dieser Abstand liegt.
 * `spielTage`: so weit darf die Faelligkeit davon abliegen (die Praxis verschiebt Platzhalter um ein paar Tage).
 */
export function bestaetigterAbstand(motiv, vonMs, bisMs, spielTage) {
  const monate = recallAbstandMonate(motiv);
  const soll = abstandTage(motiv?.recurrenceInterval);
  if (!monate || !soll || !(Number(vonMs) > 0) || !(Number(bisMs) > 0)) return null;
  return Math.abs((bisMs - vonMs) / TAG_MS - soll) <= spielTage ? monate : null;
}

// Buckets rechnet die Plattform selbst: dort stimmt der Abstand auf den Tag (zwei Tage Spiel fuer die Zeitumstellung).
export const SPIEL_BUCKET_TAGE = 2;
// Alte Platzhalter-Termine verschiebt die Praxis von Hand: bis zu einem Monat gilt noch als derselbe Abstand.
export const SPIEL_PLATZHALTER_TAGE = 31;

const ELTERN_CACHE_MS = 60 * 60 * 1000;
const elternCache = new Map();

async function elternLesen(clientId, locationId, ids) {
  const col = admin.firestore().collection("clients").doc(clientId).collection("locations").doc(locationId).collection("appointments");
  const docs = await admin.firestore().getAll(...ids.map((id) => col.doc(id)), { fieldMask: ["start", "visitMotive.id", "patient.id"] });
  return docs.filter((d) => d.exists).map((d) => {
    const x = d.data() || {};
    return { id: d.id, startMs: x.start?.toMillis?.() ?? 0, grundId: s(x.visitMotive?.id), patientId: s(x.patient?.id) };
  });
}

/** Nur fuer Tests. */
export function _elternCacheLeeren() { elternCache.clear(); }

/**
 * Kandidaten aus alten Recall-Platzhaltern um `kontrollabstandMonate` ergaenzen. Gelesen wird der Termin, aus
 * dem der Recall entstand (`parentRecallId`), und dessen Besuchsgrund. Kandidaten ohne diesen Verweis, mit
 * fremdem oder fehlendem Ausloeser oder mit anderem Abstand bleiben ohne Wert. Wirft nie.
 */
export async function mitKontrollabstand(clientId, locationId, kandidaten, motive, { lesen = elternLesen, jetzt = Date.now() } = {}) {
  try {
    const schluessel = (id) => `${clientId}/${locationId}/${id}`;
    const offen = [];
    for (const c of kandidaten || []) {
      const id = s(c.parentRecallId);
      if (!id || Number.isInteger(c.kontrollabstandMonate) || offen.includes(id)) continue;
      const g = elternCache.get(schluessel(id));
      if (!g || jetzt - g.at >= ELTERN_CACHE_MS) offen.push(id);
    }
    for (let i = 0; i < offen.length; i += 300) {
      const teil = offen.slice(i, i + 300);
      const gefunden = new Map((await lesen(clientId, locationId, teil)).map((e) => [e.id, e]));
      for (const id of teil) elternCache.set(schluessel(id), { at: jetzt, eltern: gefunden.get(id) || null });
    }
    return (kandidaten || []).map((c) => {
      const e = s(c.parentRecallId) && !Number.isInteger(c.kontrollabstandMonate) ? elternCache.get(schluessel(s(c.parentRecallId)))?.eltern : null;
      if (!e || e.patientId !== s(c.patientId)) return c;
      const monate = bestaetigterAbstand(motive.get(e.grundId), e.startMs, c.recallStartMs, SPIEL_PLATZHALTER_TAGE);
      return monate ? { ...c, kontrollabstandMonate: monate } : c;
    });
  } catch {
    return kandidaten;
  }
}