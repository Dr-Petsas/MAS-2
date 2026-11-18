// Private Plaene per Sprache (Chef 15.10.2026): Clara legt sie hier ab, die PlanR-Uebersicht holt sie in den
// Eingang des Planers (Entwurf mit eigener Nummer) und meldet sie abgeholt. Kassen-HKPs bleiben im HKP-Register.
import admin from "../firebase.js";
import { registerFuer } from "./verbund.js";

export const MODULE = new Set(["privat-kv", "kons-mkv", "privat-kons", "privat-impl", "privat-kb"]);
// Im Praxis-Verbund (verbund.js) holt die Uebersicht der Haupt-Praxis die Entwuerfe ab.
const col = async (clientId) => admin.firestore().collection("clients").doc(await registerFuer(clientId)).collection("planrEntwuerfe");
const jetzt = () => new Date().toISOString();

export async function entwurfAblegen(clientId, { modul, patient, anzeige, betrag, planJson, auftragText = "", befundQuelle = null, hinweise = [], engineStand = "", fallId = "", fallTitel = "" }) {
  if (!MODULE.has(modul)) throw new Error(`Modul ${modul} nimmt keine Sprach-Entwuerfe an`);
  const ref = (await col(clientId)).doc();
  const e = {
    modul, status: "offen", patient, anzeige: String(anzeige || "").slice(0, 160), betrag: Number(betrag) || 0, planJson,
    auftragText: String(auftragText).slice(0, 2000), befundQuelle, hinweise: hinweise.slice(0, 30).map(String), engineStand,
    ...(fallId ? { fallId: String(fallId), fallTitel: String(fallTitel || "").slice(0, 160) } : {}),
    erstelltVon: "clara", erstellt: jetzt(),
  };
  await ref.set(e);
  return { id: ref.id, ...e };
}

export async function entwurfLesen(clientId, id) {
  const d = await (await col(clientId)).doc(String(id)).get();
  return d.exists ? { id: d.id, ...d.data() } : null;
}

export async function entwuerfeOffen(clientId) {
  const s = await (await col(clientId)).where("status", "==", "offen").limit(50).get();
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.erstellt).localeCompare(String(b.erstellt)));
}

/** Nur die Patienten der juengsten Entwuerfe (Namensliste der Spracherkennung), ohne Plan. */
export async function entwurfPatientenJuengste(clientId, limit = 200) {
  const s = await (await col(clientId)).orderBy("erstellt", "desc").limit(limit).select("patient").get();
  return s.docs.map((d) => d.get("patient")).filter(Boolean);
}

/** Nur ein offener Entwurf wechselt den Status – so holt ihn genau eine Uebersicht ab bzw. nimmt ihn Clara zurueck. */
async function wechseln(clientId, id, felder) {
  const ref = (await col(clientId)).doc(String(id));
  return admin.firestore().runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (!d.exists) return { ok: false, grund: "fehlt" };
    if (d.data().status !== "offen") return { ok: false, grund: d.data().status, nummer: d.data().nummer || "" };
    tx.update(ref, felder);
    return { ok: true };
  });
}

export const entwurfAbgeholt = (clientId, id, nummer) =>
  wechseln(clientId, id, { status: "abgeholt", nummer: String(nummer || "").slice(0, 80), abgeholt: jetzt() });

export const entwurfVerwerfen = (clientId, id) => wechseln(clientId, id, { status: "verworfen", verworfen: jetzt() });

export async function entwurfLoeschenFuerTest(clientId, id) {
  await (await col(clientId)).doc(String(id)).delete();
}
