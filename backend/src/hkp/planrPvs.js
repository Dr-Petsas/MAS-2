// Patienten fuer die HKP-Clara bei PlanR-Praxen ohne MAS (Chef 12.10.2026):
// Diese Praxen haben keine Pickadoc-Kartei. Clara sucht deshalb direkt in
// ihrer Praxissoftware - ueber PlanR, an dem die PlanR-Bridge der Praxis haengt
// (GET /api/intern/pvs/patienten, Schluessel PLANR_HKP_KEY).
// Alle anderen Praxen (MAS, meddent, Demo) bleiben bei der Pickadoc-Kartei.
// Notaus: MAS_PLANR_PVS=0 (dann wieder Pickadoc-Kartei wie bisher).
import { soundsSame } from "../clara/phonetics.js";
import { claraZugangFuer } from "./planrClara.js";

const basis = () => String(process.env.PLANR_URL || "https://planr.pickadoc.de").trim().replace(/\/+$/, "");
const schluessel = () => String(process.env.PLANR_HKP_KEY || "").trim();
const KEIN_PVS = "die Praxissoftware antwortet gerade nicht. Bitte prüfen, ob die PlanR-Bridge auf dem Praxisserver läuft.";

let holen = (...a) => fetch(...a);
/** Nur fuer Tests. */
export function _setHolen(fn) { holen = fn || ((...a) => fetch(...a)); }

/** true = Patienten dieser Praxis kommen aus ihrem PVS (PlanR-Praxis mit HKP-Clara). Wirft nie. */
export async function patientenAusPvs(clientId) {
  if (String(process.env.MAS_PLANR_PVS || "").trim() === "0") return false;
  return (await claraZugangFuer(clientId)) === "planr";
}

async function frage(clientId, q) {
  if (!schluessel()) return { ok: false, meldung: "in MAS ist kein PlanR-Schlüssel eingerichtet." };
  const url = `${basis()}/api/intern/pvs/patienten?${new URLSearchParams({ clientId, q })}`;
  try {
    const r = await holen(url, { headers: { "X-PlanR-Key": schluessel() }, signal: AbortSignal.timeout(12000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d?.ok) return { ok: false, meldung: String(d?.meldung || "") || KEIN_PVS };
    return { ok: true, patienten: Array.isArray(d.patienten) ? d.patienten : [] };
  } catch {
    return { ok: false, meldung: KEIN_PVS };
  }
}

const klein = (s) => String(s || "").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const woerter = (s) => klein(s).split(/[^a-z]+/).filter((w) => w.length >= 2);

/** "1972-03-05", "05.03.1972" oder ISO-Zeit -> "1972-03-05" | null */
export function isoGeburt(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** PVS-Treffer -> gleiche Form wie fetchPatientsByIds, damit Rueckfragen und HKP-Anlage unveraendert laufen. */
export function alsPatient(p) {
  return {
    id: String(p?.id || ""),
    firstName: String(p?.vorname || ""),
    lastName: String(p?.name || ""),
    gender: "",
    birthDate: isoGeburt(p?.geburtsdatum),
    mobilePhoneNumber: "",
    phoneNumber: "",
    phone: "",
    email: "",
    hasPhone: false,
    createdAt: null,
    quelle: "pvs",
  };
}

/**
 * Treffer nach dem gesprochenen Namen ordnen: wer zu ALLEN Woertern passt
 * (gleich > Anfang > Klang), sonst die mit den meisten passenden Woertern.
 */
export function bewerten(gesprochen, liste) {
  const ws = woerter(gesprochen);
  if (!ws.length) return [];
  const bewertet = (Array.isArray(liste) ? liste : []).map((p) => {
    const teile = woerter(`${p?.vorname || ""} ${p?.name || ""}`);
    let punkte = 0, passend = 0;
    for (const w of ws) {
      const best = Math.max(0, ...teile.map((t) => (t === w ? 3 : w.length >= 3 && t.startsWith(w) ? 2 : soundsSame(t, w) ? 1 : 0)));
      if (best) { punkte += best; passend++; }
    }
    return { p, punkte, passend };
  }).filter((x) => x.passend > 0);
  const alle = bewertet.filter((x) => x.passend === ws.length);
  const kreis = alle.length ? alle : bewertet.filter((x) => x.passend === Math.max(...bewertet.map((y) => y.passend)));
  if (!kreis.length) return [];
  const oben = Math.max(...kreis.map((x) => x.punkte));
  return kreis.filter((x) => x.punkte === oben).slice(0, 6).map((x) => x.p);
}

/** Wie searchPatient: { ok, patients } bzw. { ok:false, error } */
export async function sucheImPvs(clientId, name) {
  const ganz = await frage(clientId, String(name || "").trim());
  if (!ganz.ok) return { ok: false, error: ganz.meldung };
  let roh = ganz.patienten;
  if (!roh.length) {
    // Falsch verstandener Vor- oder Nachname: jedes Wort einzeln, dann nach Klang ordnen.
    const einzeln = [...new Set(woerter(name).filter((w) => w.length >= 3))].slice(0, 3);
    const teil = await Promise.all(einzeln.map((w) => frage(clientId, w)));
    const ids = new Map();
    for (const t of teil) for (const p of t.ok ? t.patienten : []) if (p?.id && !ids.has(p.id)) ids.set(p.id, p);
    roh = [...ids.values()];
  }
  return { ok: true, patients: bewerten(name, roh).map(alsPatient), quelle: "pvs" };
}
