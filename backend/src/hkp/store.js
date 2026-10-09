// HKP-Register: clients/{clientId}/hkp/{id}. Clara legt Entwuerfe an und liest,
// PlanR (Praxis-Schluessel) pflegt, gibt frei und setzt den weiteren Status.
// Der Plan liegt als JSON-String (planJson) — Firestore lehnt undefined in
// verschachtelten Objekten ab, und der Plan wird nie feldweise abgefragt.
import admin from "../firebase.js";

export const STATUS = [
  "wartet_auf_freigabe", "freigegeben", "eingereicht", "genehmigt", "abgelehnt", "abgerechnet", "verworfen",
];
export const STATUS_TEXT = {
  wartet_auf_freigabe: "wartet auf Freigabe",
  freigegeben: "freigegeben",
  eingereicht: "bei der Kasse eingereicht",
  genehmigt: "genehmigt",
  abgelehnt: "abgelehnt",
  abgerechnet: "abgerechnet",
  verworfen: "verworfen",
};
/** Status, die einen neuen HKP fuer denselben Kiefer als Doppelung verdaechtig machen */
export const AKTIV = new Set(["wartet_auf_freigabe", "freigegeben", "eingereicht", "genehmigt"]);

const col = (clientId) => admin.firestore().collection("clients").doc(clientId).collection("hkp");
const praxisRef = (clientId) => admin.firestore().collection("clients").doc(clientId).collection("hkpPraxis").doc("standard");

export class KonfliktFehler extends Error {
  constructor(aktuell) {
    super("version_konflikt");
    this.code = "version_konflikt";
    this.aktuell = aktuell;
  }
}

const jetzt = () => new Date().toISOString();

function ausDoc(d) {
  const x = d.data() || {};
  return { id: d.id, ...x };
}

/** Kopf ohne Plan (fuer Listen) */
export function kopf(h) {
  const { planJson, ...rest } = h;
  return rest;
}

export async function hkpAnlegen(clientId, daten, wer) {
  const ref = col(clientId).doc();
  const doc = {
    ...daten,
    status: daten.status || "wartet_auf_freigabe",
    erstellt: jetzt(),
    aktualisiert: jetzt(),
    version: 1,
    verlauf: [{ at: jetzt(), wer, was: daten.verlaufText || "angelegt" }],
  };
  delete doc.verlaufText;
  await ref.set(doc);
  return { id: ref.id, ...doc };
}

export async function hkpLesen(clientId, id) {
  const d = await col(clientId).doc(String(id)).get();
  return d.exists ? ausDoc(d) : null;
}

export async function hkpListe(clientId, { patientId, limit = 300 } = {}) {
  let q = col(clientId);
  if (patientId) q = q.where("patient.id", "==", String(patientId));
  const snap = await q.limit(limit).get();
  return snap.docs.map(ausDoc).sort((a, b) => String(b.erstellt).localeCompare(String(a.erstellt)));
}

/**
 * Aendert einen HKP. `version` = Stand, auf dem der Aufrufer gearbeitet hat;
 * weicht er ab, gewinnt NIEMAND stillschweigend (KonfliktFehler).
 * pruefen(aktuell) darf werfen, um z. B. Statusregeln durchzusetzen.
 */
export async function hkpAktualisieren(clientId, id, { version, felder, wer, was, pruefen }) {
  const ref = col(clientId).doc(String(id));
  return admin.firestore().runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (!d.exists) {
      const e = new Error("nicht_gefunden");
      e.code = "nicht_gefunden";
      throw e;
    }
    const aktuell = ausDoc(d);
    if (version !== undefined && version !== null && Number(version) !== Number(aktuell.version)) throw new KonfliktFehler(kopf(aktuell));
    if (pruefen) pruefen(aktuell);
    const verlauf = [...(aktuell.verlauf || []), { at: jetzt(), wer, was }].slice(-100);
    const neu = { ...felder, version: Number(aktuell.version || 0) + 1, aktualisiert: jetzt(), verlauf };
    tx.update(ref, neu);
    return { ...aktuell, ...neu };
  });
}

/** Hilfsfeld ohne Versionssprung (z. B. offener Aenderungsvorschlag) */
export async function hkpFeldSetzen(clientId, id, felder) {
  await col(clientId).doc(String(id)).update(felder);
}

// Dateien am HKP (z. B. diktierter Befund): Inhalt in hkp/{id}/dateien/{dateiId},
// Kopf im HKP-Feld `dateien`, damit die Liste ohne Inhalt auskommt.
const dateiCol = (clientId, id) => col(clientId).doc(String(id)).collection("dateien");

export async function hkpDateiAnhaengen(clientId, id, { id: dateiId, name, art, typ = "application/json", inhalt }) {
  const meta = { id: String(dateiId), name: String(name), art: String(art), erstellt: jetzt() };
  await dateiCol(clientId, id).doc(meta.id).set({ ...meta, typ, inhalt: String(inhalt) });
  await col(clientId).doc(String(id)).update({ dateien: admin.firestore.FieldValue.arrayUnion(meta) });
  return meta;
}

export async function hkpDateiLesen(clientId, id, dateiId) {
  const d = await dateiCol(clientId, id).doc(String(dateiId)).get();
  return d.exists ? d.data() : null;
}

export async function hkpLoeschenFuerTest(clientId, id) {
  const dateien = await dateiCol(clientId, id).get();
  await Promise.all(dateien.docs.map((d) => d.ref.delete()));
  await col(clientId).doc(String(id)).delete();
}

// --- Praxis-Standard aus PlanR: Preislisten, Eigenlabor-Katalog, Einstellungen ---

const praxisCache = new Map();

export async function praxisSpeichern(clientId, { preislisten = [], eigen = [], einstellungen = {} }) {
  const ref = praxisRef(clientId);
  const alt = await ref.collection("listen").get();
  const batch = admin.firestore().batch();
  alt.docs.forEach((d) => batch.delete(d.ref));
  for (const l of preislisten) {
    if (!l?.id) continue;
    batch.set(ref.collection("listen").doc(String(l.id).replace(/\//g, "_")), { json: JSON.stringify(l) });
  }
  batch.set(ref, { eigenJson: JSON.stringify(eigen), einstellungenJson: JSON.stringify(einstellungen), aktualisiert: jetzt() });
  await batch.commit();
  praxisCache.delete(clientId);
  return { preislisten: preislisten.length, eigen: eigen.length };
}

export async function praxisLaden(clientId) {
  const hit = praxisCache.get(clientId);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.daten;
  const ref = praxisRef(clientId);
  const [d, listen] = await Promise.all([ref.get(), ref.collection("listen").get()]);
  const x = d.exists ? d.data() : {};
  const parse = (s, f) => { try { return s ? JSON.parse(s) : f; } catch { return f; } };
  const daten = {
    preislisten: listen.docs.map((l) => parse(l.data().json, null)).filter(Boolean),
    eigen: parse(x.eigenJson, []),
    einstellungen: parse(x.einstellungenJson, {}),
    aktualisiert: x.aktualisiert || "",
  };
  praxisCache.set(clientId, { at: Date.now(), daten });
  return daten;
}
