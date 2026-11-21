// Patienten fuer die HKP-Clara bei PlanR-Praxen ohne MAS (Chef 12.10.2026):
// Diese Praxen haben keine Pickadoc-Kartei. Clara sucht deshalb direkt in
// ihrer Praxissoftware - ueber PlanR, an dem die PlanR-Bridge der Praxis haengt
// (GET /api/intern/pvs/patienten, Schluessel PLANR_HKP_KEY).
// Alle anderen Praxen (MAS, meddent, Demo) bleiben bei der Pickadoc-Kartei.
// Notaus: MAS_PLANR_PVS=0 (dann wieder Pickadoc-Kartei wie bisher).
import { soundsSame } from "../clara/phonetics.js";
import { schreibNah } from "../clara/patientCatalog.js";
import { claraZugangFuer } from "./planrClara.js";
import { pvsNamenMerken } from "./pvsNamen.js";

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

// Live 04.11.2026: gehoert "Prodomos Phanelas", in DS-Win "Prodromos Fanelas" - ein fehlender Buchstabe
// klingt fuer die Koelner Phonetik nach einem anderen Namen. Knapp verhoert (1 Buchstabe, ab 8 Zeichen 2) zaehlt.
function abstand(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let vor = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const neu = [i];
    for (let j = 1; j <= b.length; j++) {
      neu[j] = Math.min(vor[j] + 1, neu[j - 1] + 1, vor[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    vor = neu;
  }
  return vor[b.length];
}
// Gleicher Anfangsbuchstabe Pflicht: "Bauer" ist nicht "Mauer".
const knapp = (t, w) => w.length >= 5 && t.length >= 5 && t[0] === w[0]
  && abstand(t, w) <= (Math.min(t.length, w.length) >= 8 ? 2 : 1);
// Am Aeusserungsanfang verschluckt die Erkennung leise Anlaute ("Anelas" fuer "Fanelas"): nur genau der erste Buchstabe darf fehlen.
const anlautFehlt = (t, w) => w.length >= 5 && t.length === w.length + 1 && t.endsWith(w);

/** 3 gleich, 2 Wortanfang, 1 Klang, knapp verhoert oder Anlaut verschluckt, 0 passt nicht */
function wortPunkte(t, w) {
  if (t === w) return 3;
  if (w.length >= 3 && t.startsWith(w)) return 2;
  // "Petzers" ist "Petsas" (Anruf 11.11.2026): ohne das wartet die Suche die
  // vollen 12 s auf die Praxissoftware, obwohl die Kartei den Patienten hat.
  return soundsSame(t, w) || knapp(t, w) || anlautFehlt(t, w) || schreibNah(t, w) ? 1 : 0;
}

// Chef 06.11.2026: P, F, Ph und B am Wortanfang verwechselt die Erkennung am Telefon ("Panelas" fuer "Fanelas").
// Zaehlt nur, wenn das andere Namenswort sicher passt, und nur als Rueckfrage, nie als Treffer.
const ANLAUT_TAUSCH = [["ph", "f"], ["f", "ph"], ["p", "f"], ["f", "p"], ["ph", "p"], ["p", "ph"], ["b", "p"], ["p", "b"]];
const anlautTausch = (t, w) => w.length >= 4 && t !== w
  && ANLAUT_TAUSCH.some(([a, b]) => w.startsWith(a) && t.startsWith(b) && t.slice(b.length) === w.slice(a.length));

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
    ...(p?.versicherung || p?.insurance ? { versicherung: String(p.versicherung || p.insurance) } : {}),
    ...(p?.privateInsurance === true || p?.privateInsurance === false ? { privateInsurance: p.privateInsurance === true } : {}),
    ...(p?.bonus || p?.bonusheft ? { bonus: String(p.bonus || p.bonusheft) } : {}),
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
      const best = Math.max(0, ...teile.map((t) => wortPunkte(t, w)));
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
  const patients = liste.slice(0, 6).map((p) => ({ ...alsPatient(p), identifiziert: nummer ? "nummer" : "geburtsdatum" }));
  if (patients.length === 1) pvsNamenMerken(clientId, patients);
  return { ok: true, patients };
}

/**
 * Fuer search_patient und die HKP-Werkzeuge: nennt Clara patient_nummer oder geburtsdatum (PlanR-Praxis),
 * entscheidet das statt des Namens. null = nicht zustaendig (kein Merkmal oder keine PlanR-Praxis).
 * -> { patient } | { kandidaten, message } | { message }
 */
export async function pvsKennungAufloesen(clientId, body, { mehrfach, plan = false } = {}) {
  const nummer = String(body?.patient_nummer ?? "").replace(/\D/g, "").slice(0, 9);
  const geburt = isoGeburt(body?.geburtsdatum);
  if (!nummer && !geburt) return null;
  const planr = await patientenAusPvs(clientId);
  // plan: auch MAS-Praxen mit PlanR-Bridge (Plaene und Befunde: PVS zuerst)
  if (!planr && !(plan && pvsGerade(clientId))) return null;
  const name = String(body?.name || "").trim();
  const r = await identifizieren(clientId, { nummer, geburt, name });
  if (!r.ok && !planr) {
    ohnePvs.set(clientId, Date.now());
    return null;
  }
  if (!r.ok) return { message: `Die Suche in der Praxissoftware ist fehlgeschlagen: ${r.error}` };
  if (!planr && !r.patients.length) return null;
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

// MAS-Praxen mit PlanR-Bridge (Chef 02.11.2026): fuer Plaene und Befunde zuerst das PVS, sonst die Pickadoc-Kartei.
// Termine, SMS & Co. bleiben bei der Kartei. Ohne erreichbares PVS ein paar Minuten nicht mehr fragen.
// Notaus MAS_PLAN_PVS_ZUERST=0.
const OHNE_PVS_MS = 3 * 60_000;
const ohnePvs = new Map();
const pvsZuerstAus = () => process.env.MAS_PLAN_PVS_ZUERST === "0" || String(process.env.MAS_PLANR_PVS || "").trim() === "0";
const pvsGerade = (clientId) => !pvsZuerstAus() && Date.now() - (ohnePvs.get(clientId) || 0) >= OHNE_PVS_MS;
/** Nur fuer Tests. */
export function _ohnePvsVergessen() { ohnePvs.clear(); }

/**
 * Patient fuer Plan/Befund einer MAS-Praxis aus dem PVS: { ok, patients, quelle:"pvs" } mit Treffern, sonst null
 * (dann sucht der Aufrufer in der Kartei). PlanR-Praxen ohne MAS: null – dort sucht searchPatient ohnehin im PVS.
 */
export async function sucheFuerPlan(clientId, name) {
  if (!String(name || "").trim() || !pvsGerade(clientId) || (await patientenAusPvs(clientId))) return null;
  const r = await sucheImPvs(clientId, name);
  if (!r.ok) {
    ohnePvs.set(clientId, Date.now());
    return null;
  }
  // Nur Treffer zum ganzen Namen: ein Teiltreffer (nur der Vorname) verdraengt nie den Patienten aus der Kartei
  const ganz = r.patients.filter((p) => passtGanz(name, p));
  if (!ganz.length) return null;
  pvsNamenMerken(clientId, ganz);
  const { alle, ...rest } = r;
  return { ...rest, patients: ganz };
}

// Chef 04.11.2026: "wir suchen bei PLANUNGEN nur IN DAMPSOFT". Fuer Plaene und Befunde kommt der Patient nur aus
// dem PVS, nie aus der Pickadoc-Kartei - auch nicht, wenn das PVS niemanden findet oder nicht antwortet (Partheni
// stand einmal in DS-Win und einmal in der Kartei und wurde als zwei Patienten vorgelesen). Notaus MAS_PLAN_PVS_ZUERST=0.
export const planNurPvs = () => !pvsZuerstAus();

/** Patientensuche fuer Plan/Befund: { ok, patients, quelle:"pvs" } bzw. { ok:false, error }; null = nicht zustaendig. */
export async function sucheNurImPvsFuerPlan(clientId, name) {
  if (!String(name || "").trim() || !planNurPvs() || (await patientenAusPvs(clientId))) return null;
  const r = await sucheImPvs(clientId, name);
  if (!r.ok) return { ok: false, error: r.error, quelle: "pvs" };
  // Nur Treffer zum ganzen Namen: ein Teiltreffer (nur der Vorname) wuerde sonst ungefragt gewaehlt
  const patients = r.patients.filter((p) => passtGanz(name, p));
  if (patients.length) pvsNamenMerken(clientId, patients);
  const { alle = r.patients, ...rest } = r;
  const angebot = patients.length ? [] : gleicherNachname(name, alle);
  return { ...rest, patients, angebot: angebot.length || patients.length ? angebot : anlautAngebot(name, alle) };
}

/**
 * P/F-Anlaut (Chef 06.11.2026): "Protromos Panelas" ist im PVS "Prodromos Fanelas". Angeboten wird nur ein einziger
 * Patient, bei dem jedes andere Wort sicher passt und genau der Anlaut eines Wortes getauscht ist. Notaus wie
 * gleicherNachname.
 */
export function anlautAngebot(name, patienten) {
  if (process.env.MAS_PLAN_NACHNAME_ANGEBOT === "0") return [];
  const ws = woerter(name);
  if (ws.length < 2) return [];
  const treffer = (patienten || []).filter((p) => {
    const teile = woerter(`${p?.firstName || ""} ${p?.lastName || ""}`);
    let tausch = 0;
    for (const w of ws) {
      if (teile.some((t) => wortPunkte(t, w) > 0)) continue;
      if (!teile.some((t) => anlautTausch(t, w))) return false;
      tausch += 1;
    }
    return tausch > 0 && tausch < ws.length;
  });
  return treffer.length === 1 ? treffer : [];
}

/**
 * Live 06.11.2026: "Utromos Fanelas" - der Vorname verhoert, den Nachnamen gibt es im PVS genau einmal.
 * Kein Klang-Raten (patientDisambig.nichtGefundenFrage): nur ein WORTGLEICHER Nachname, und nur wenn er
 * eindeutig ist. Gewaehlt wird nie - Clara fragt "Meinen Sie ...?". Notaus MAS_PLAN_NACHNAME_ANGEBOT=0.
 */
export function gleicherNachname(name, patienten) {
  if (process.env.MAS_PLAN_NACHNAME_ANGEBOT === "0") return [];
  const ws = new Set(woerter(name).filter((w) => w.length >= 4));
  const treffer = (patienten || []).filter((p) => woerter(p?.lastName).some((t) => ws.has(t)));
  return treffer.length === 1 ? treffer : [];
}

/** Passt JEDES gesprochene Wort zu Vor- oder Nachname (gleich, Anfang, Klang)? Patient in Kartei-Form. */
export function passtGanz(gesprochen, p) {
  const ws = woerter(gesprochen);
  const teile = woerter(`${p?.firstName || ""} ${p?.lastName || ""}`);
  const passt = (w) => teile.some((t) => wortPunkte(t, w) > 0);
  // Live 06.11.2026: "Pro Dromos Phanelas" - die Erkennung zerlegt einen Namen in zwei Woerter.
  for (let i = 0; i < ws.length;) {
    const zwei = i + 1 < ws.length && !(passt(ws[i]) && passt(ws[i + 1])) && passt(ws[i] + ws[i + 1]);
    if (zwei) i += 2;
    else if (passt(ws[i])) i += 1;
    else return false;
  }
  return !!ws.length;
}

const KLANG_VARIANTEN = [[/ph/g, "f"], [/^f/, "ph"], [/th/g, "t"], [/y/g, "i"], [/c/g, "k"], [/^k/, "c"], [/z/g, "s"],
  [/v/g, "w"], [/w/g, "v"], [/^p(?!h)/, "f"], [/^f/, "p"], [/^p(?!h)/, "b"], [/^b/, "p"]];

const klangFormen = (w) => KLANG_VARIANTEN.map(([re, rep]) => w.replace(re, rep)).filter((v) => v !== w);

/** Suchbegriffe nach dem ersten Wort: zusammengezogene Woerter und Klang-/Anlautvarianten, dann die Wortanfaenge. */
export function suchVarianten(name) {
  const alle = woerter(name);
  const lang = [...new Set(alle.filter((x) => x.length >= 4))].slice(0, 3);
  // "Pro Dromos": nur ein kurzes Wort ist ein abgespaltener Namensteil
  const zusammen = alle.slice(1).map((w, i) => (Math.min(alle[i].length, w.length) <= 4 ? alle[i] + w : "")).filter((x) => x.length >= 6);
  const formen = [...zusammen, ...lang.flatMap(klangFormen)];
  const anfaenge = lang.flatMap((w) => [w, ...klangFormen(w)]).map((v) => v.slice(0, 4));
  return { formen: [...new Set(formen)], anfaenge: [...new Set(anfaenge)].filter((q) => q.length >= 4) };
}

/**
 * Wie searchPatient: { ok, patients } bzw. { ok:false, error }.
 * Die Bridge arbeitet die Auftraege nacheinander ab (Anruf 06.11.2026: 13 Anfragen, 9 Sekunden): so wenig Anfragen
 * wie moeglich und Schluss, sobald einer passt. Zuerst das laengste Wort (PlanR sucht beim ganzen Namen auch nur
 * danach), dann die uebrigen Woerter mit Klang- und Anlautvarianten, zuletzt die Wortanfaenge.
 */
export async function sucheImPvs(clientId, name) {
  const gesprochen = String(name || "").split(/[^\p{L}]+/u).filter((w) => w.length >= 3);
  const roheWoerter = [...new Set(gesprochen.map((w) => w.toLocaleLowerCase("de")))];
  const erst = gesprochen.length ? gesprochen.reduce((a, b) => (b.length > a.length ? b : a)) : String(name || "").trim();
  const ganz = await frage(clientId, erst);
  if (!ganz.ok) return { ok: false, error: ganz.meldung };
  let roh = ganz.patienten;
  const gefragt = new Set([erst, klein(erst)]);
  const runde = async (begriffe) => {
    const neu = [...new Set(begriffe)].filter((q) => !gefragt.has(q)).slice(0, 8);
    for (const q of neu) gefragt.add(q);
    const teil = await Promise.all(neu.map((w) => frage(clientId, w)));
    const ids = new Map(roh.map((p) => [p.id, p]));
    for (const t of teil) for (const p of t.ok ? t.patienten : []) if (p?.id && !ids.has(p.id)) ids.set(p.id, p);
    roh = [...ids.values()];
  };
  const fertig = () => roh.some((p) => {
    const k = { firstName: p?.vorname, lastName: p?.name };
    return passtGanz(name, k) || anlautAngebot(name, [k]).length > 0;
  });
  const varianten = process.env.MAS_PVS_VARIANTEN !== "0" ? suchVarianten(name) : { formen: [], anfaenge: [] };
  if (!fertig()) await runde([...roheWoerter.slice(0, 3), ...varianten.formen]);
  if (!fertig()) await runde(varianten.anfaenge);
  return { ok: true, patients: bewerten(name, roh).map(alsPatient), alle: roh.map(alsPatient), quelle: "pvs" };
}
