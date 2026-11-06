// PVS-Patienten fuer die Namensliste der Spracherkennung (Anruf 06.11.2026 08:36): Patienten, die nur in DS-Win
// stehen, kannte die Liste nie ("Protromos Panelas" statt "Prodromos Fanelas"). Jeder im PVS gefundene Patient
// wird hier je Praxis gemerkt; sttPatientNames.js nimmt die Namen in die Liste fuer die naechsten Gespraeche.
// Nur im Prozess, ohne Firestore. Notaus MAS_STT_PVS_NAMEN=0.
const PRO_PRAXIS = 300;
const HALTBAR_MS = 60 * 24 * 60 * 60 * 1000;

/** @type {Map<string, Map<string, { vorname: string, name: string, at: number }>>} */
const gemerkt = new Map();

export const pvsNamenAn = () => process.env.MAS_STT_PVS_NAMEN !== "0";

/** Patienten in Kartei-Form ({ firstName, lastName }) oder PVS-Form ({ vorname, name }). Wirft nie. */
export function pvsNamenMerken(clientId, patienten) {
  const cid = String(clientId || "").trim();
  if (!cid || !pvsNamenAn()) return;
  const liste = gemerkt.get(cid) || new Map();
  for (const p of patienten || []) {
    const vorname = String(p?.firstName ?? p?.vorname ?? "").trim();
    const name = String(p?.lastName ?? p?.name ?? "").trim();
    if (!name) continue;
    const key = `${vorname} ${name}`.toLowerCase();
    liste.delete(key);
    liste.set(key, { vorname, name, at: Date.now() });
  }
  while (liste.size > PRO_PRAXIS) liste.delete(liste.keys().next().value);
  gemerkt.set(cid, liste);
}

/** Gemerkte PVS-Patienten dieser Praxis, juengste zuerst. */
export function pvsNamenListe(clientId) {
  if (!pvsNamenAn()) return [];
  const grenze = Date.now() - HALTBAR_MS;
  return [...(gemerkt.get(String(clientId || "").trim())?.values() || [])]
    .filter((x) => x.at >= grenze)
    .reverse();
}

/** Nur fuer Tests. */
export function _pvsNamenVergessen() { gemerkt.clear(); }
