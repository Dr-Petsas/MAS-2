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
  const such = typeof q === "string" ? { q } : q;
  const url = `${basis()}/api/intern/pvs/patienten?${new URLSearchParams({ clientId, ...such })}`;
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

const MONATE = ["januar", "februar", "maerz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];

/** "1972-03-05", "5.3.1972", "05.03.72", "5. März 1972" oder ISO-Zeit -> "1972-03-05" | null */
export function isoGeburt(s, heute = new Date()) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2}|\d{4})$/);
  if (!m) {
    const w = klein(t).match(/^(\d{1,2})\.?\s*([a-z]+)\s+(\d{2}|\d{4})$/);
    const monat = w ? MONATE.findIndex((x) => x.startsWith(w[2].slice(0, 3))) + 1 : 0;
    if (monat) m = [t, w[1], String(monat), w[3]];
  }
  if (!m) return null;
  let jahr = Number(m[3]);
  if (m[3].length === 2) jahr += jahr > heute.getFullYear() % 100 ? 1900 : 2000;
  const tag = Number(m[1]), mon = Number(m[2]);
  const d = new Date(Date.UTC(jahr, mon - 1, tag));
  if (d.getUTCMonth() !== mon - 1 || d.getUTCDate() !== tag || d > heute) return null;
  return `${jahr}-${String(mon).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}
const deutsch = (iso) => iso.split("-").reverse().join(".");

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

/**
 * Patient per Patientennummer (genau) oder Geburtsdatum (+ Name zum Eingrenzen) aus dem PVS.
 * Aeltere Bridges durchsuchen das Geburtsdatum nicht: dann Name wortweise und hier nach Datum filtern.
 */
export async function identifizieren(clientId, { nummer = "", geburt = "", name = "" } = {}) {
  const r = await frage(clientId, nummer ? { nummer } : { geburt, ...(name ? { q: name } : {}) });
  if (!r.ok) return { ok: false, error: r.meldung };
  let liste = r.patienten;
  if (!liste.length && geburt && name) {
    const teil = await Promise.all([...new Set(woerter(name).filter((w) => w.length >= 3))].slice(0, 3).map((w) => frage(clientId, w)));
    const ids = new Map();
    for (const t of teil) for (const p of t.ok ? t.patienten : []) if (p?.id && isoGeburt(p.geburtsdatum) === geburt) ids.set(p.id, p);
    liste = [...ids.values()];
  }
  if (liste.length > 1 && name) {
    const passend = bewerten(name, liste);
    if (passend.length) liste = passend;
  }
  return { ok: true, patients: liste.slice(0, 6).map((p) => ({ ...alsPatient(p), identifiziert: nummer ? "nummer" : "geburtsdatum" })) };
}

/**
 * Fuer search_patient und die HKP-Werkzeuge: nennt Clara patient_nummer oder geburtsdatum (PlanR-Praxis),
 * entscheidet das statt des Namens. null = nicht zustaendig (kein Merkmal oder keine PlanR-Praxis).
 * -> { patient } | { kandidaten, message } | { message }
 */
export async function pvsKennungAufloesen(clientId, body, { mehrfach } = {}) {
  const nummer = String(body?.patient_nummer ?? "").replace(/\D/g, "").slice(0, 9);
  const geburt = isoGeburt(body?.geburtsdatum);
  if (!nummer && !geburt) return null;
  if (!(await patientenAusPvs(clientId))) return null;
  const name = String(body?.name || "").trim();
  const r = await identifizieren(clientId, { nummer, geburt, name });
  if (!r.ok) return { message: `Die Suche in der Praxissoftware ist fehlgeschlagen: ${r.error}` };
  const wie = nummer ? `der Patientennummer ${nummer}` : `dem Geburtsdatum ${deutsch(geburt)}`;
  let liste = r.patients;
  const hint = String(body?.hint || "").trim();
  if (liste.length > 1 && hint) {
    const fein = bewerten(hint, liste.map((p) => ({ ...p, vorname: p.firstName, name: p.lastName })));
    if (fein.length === 1) liste = fein;
  }
  if (!liste.length) {
    return { kandidaten: [], message: `Unter ${wie} finde ich in der Praxissoftware niemanden. Bitte ${nummer ? "die Nummer" : "das Datum"} noch einmal nennen oder den Nachnamen buchstabieren.` };
  }
  if (liste.length === 1) return { patient: liste[0] };
  return { kandidaten: liste, message: `Unter ${wie} gibt es mehrere. ${mehrfach ? mehrfach(liste) : ""}`.trim() };
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
