// Anlass-Abgleich (Chef 27.11.2026): der Anlass fuer den Anruf gilt nur als sicher, wenn die abgerechneten
// Leistungen im Praxisprogramm (Dampsoft, ueber PlanR und die Bridge) und die Terminhistorie in Pickadoc
// dasselbe sagen. Sonst waehlt ein Mensch in der Maske, zu welchem Thema angerufen wird.
//
// Wann zwei Eintraege uebereinstimmen (fest, nichts wird geraten):
//   1. Datum: der letzte Tag mit abgerechneten Positionen und ein wahrgenommener Pickadoc-Termin liegen
//      hoechstens TOLERANZ_TAGE Kalendertage auseinander (Vorgabe 1: am Abend behandelt, am Morgen erfasst),
//      und Pickadoc kennt danach keinen spaeteren wahrgenommenen Termin.
//   2. Behandlungsart: der Besuchsgrund dieses Termins und mindestens eine Position des Tages fallen in
//      dieselbe Behandlungsart der Tabelle ARTEN. Laesst sich eine Seite keiner Art zuordnen, ist das keine
//      Uebereinstimmung ("nicht_vergleichbar").
//
// Gilt nur hinter MAS_ANLASS_LEISTUNGEN (je Praxis), liest nur, wirft nie.
import admin from "../firebase.js";
import { loadBooking } from "./booking.js";
import { spokenMotiveLabel } from "./gapFill.js";
import { anlassAusLeistungen } from "./leistungsAnlass.js";
import { fetchPatientsByIds } from "./patientCatalog.js";

const TZ = "Europe/Berlin";
const TAG_MS = 86400000;
const s = (v) => String(v ?? "").trim();
const ymd = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
const tagMs = (tag) => Date.parse(`${tag}T12:00:00Z`);
const millis = (v) => v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0);

export const ABGLEICH = {
  GLEICH: "uebereinstimmend",
  ABWEICHEND: "abweichend",
  DAMPSOFT_LEER: "dampsoft_leer",
  NICHT_GELESEN: "dampsoft_nicht_gelesen",
  NICHT_GEPRUEFT: "nicht_geprueft",
};

const JE_GRUPPE = () => Math.max(1, Math.min(10, Number(process.env.MAS_ANLASS_LEISTUNGEN_MAX) || 5));
const INSGESAMT = 20;

/** Kalendertage, die Abrechnungstag und Termin auseinanderliegen duerfen. MAS_ANLASS_TOLERANZ_TAGE, 0 bis 7, Vorgabe 1. */
export function toleranzTage(roh = process.env.MAS_ANLASS_TOLERANZ_TAGE) {
  if (!s(roh)) return 1;
  const n = Number(s(roh));
  return Number.isInteger(n) && n >= 0 && n <= 7 ? n : 1;
}

// Behandlungsarten: ein Wort des Textes muss das Stichwort enthalten; kurze Stichworte (bis vier Zeichen)
// muessen das ganze Wort sein. Die Tabelle steht bewusst hier und nirgends sonst.
const ARTEN = [
  ["zahnreinigung", ["zahnreinigung", "pzr"]],
  ["untersuchung", ["untersuchung"]],
  ["fuellung", ["füllung", "fuellung"]],
  ["wurzelbehandlung", ["wurzel", "endodont", "endo", "wsr"]],
  ["extraktion", ["extraktion", "osteotomie"]],
  ["zahnersatz", ["krone", "brücke", "bruecke", "prothese", "zahnersatz", "eingliederung"]],
  ["implantat", ["implant"]],
  ["parodontitis", ["parodont", "antiinfekti", "par", "upt", "ait"]],
  ["schiene", ["schiene", "schienung"]],
  ["versiegelung", ["versiegelung"]],
  ["aufhellung", ["aufhellung", "bleaching"]],
];

function woerter(text) {
  const aus = [];
  let wort = "";
  for (const z of s(text).toLowerCase()) {
    if ((z >= "a" && z <= "z") || "äöüß".includes(z)) wort += z;
    else { if (wort) aus.push(wort); wort = ""; }
  }
  if (wort) aus.push(wort);
  return aus;
}

/** Pure: die Behandlungsarten, die in einem Text genannt sind (Besuchsgrund oder Positionstext). */
export function behandlungsarten(text) {
  const ww = woerter(text);
  const aus = new Set();
  for (const [art, stichworte] of ARTEN) {
    if (stichworte.some((k) => ww.some((w) => (k.length <= 4 ? w === k : w.includes(k))))) aus.add(art);
  }
  return aus;
}

// Kennzeichen am Termin (Plattform: PatientStatus): 4 = nicht erschienen, 5 = abgesagt; 1 bis 3 = war da.
const WAR_DA = new Set([1, 2, 3]);
const FEHLTE = new Set([4, 5]);

/**
 * Pure: wahrgenommene Termine aus der Terminhistorie, juengster zuerst. Zaehlt: nicht geloescht, nicht
 * abgelehnt, nicht abgesagt oder versaeumt, in der Vergangenheit, mit Besuchsgrund, und bestaetigt oder
 * mit Kennzeichen "war da". Recall-Platzhalter (needsConfirmation ohne Kennzeichen) zaehlen nicht.
 */
export function besuchteTermine(termine, jetzt = Date.now()) {
  const aus = [];
  for (const t of termine || []) {
    const ms = millis(t?.start);
    const ps = Number(t?.patientStatus) || 0;
    const name = s(t?.visitMotive?.name);
    if (!ms || ms > jetzt || t.isDeleted || t.status === "declined" || FEHLTE.has(ps) || !name) continue;
    if (t.status !== "confirmed" && !WAR_DA.has(ps)) continue;
    aus.push({ ms, datum: ymd(ms), behandlung: spokenMotiveLabel(name) || name, besuchsgrundId: s(t.visitMotive?.id) });
  }
  return aus.sort((a, b) => b.ms - a.ms);
}

const tageZwischen = (a, b) => Math.round(Math.abs(tagMs(a) - tagMs(b)) / TAG_MS);

function kandidatDampsoft(anlass) {
  return { quelle: "dampsoft", behandlung: anlass.letzter_besuch.grund, datum: anlass.letzter_besuch.datum, vorauswahl: true,
    letzter_besuch: anlass.letzter_besuch, kontrollgrund: anlass.kontrollgrund, anlass_quelle: anlass.anlass_quelle };
}

function kandidatPickadoc(termin, vorauswahl) {
  return { quelle: "pickadoc", behandlung: termin.behandlung, datum: termin.datum, vorauswahl,
    letzter_besuch: { datum: termin.datum, grund: termin.behandlung } };
}

/**
 * Pure: Abgleich fuer einen Patienten. `dampsoft`: { stand: "ok", leistungen } oder { stand: <warum nicht> };
 * `termine`: Terminhistorie aus Pickadoc. Ergebnis sind nur die Felder, die an den Vorschlag kommen.
 */
export function abgleichen(dampsoft, termine, { jetzt = Date.now(), toleranz = toleranzTage() } = {}) {
  const besucht = besuchteTermine(termine, jetzt);
  const nurPickadoc = besucht.length ? [kandidatPickadoc(besucht[0], true)] : [];
  if (dampsoft?.stand !== "ok") {
    return { anlass_abgleich: ABGLEICH.NICHT_GELESEN, anlass_abgleich_grund: s(dampsoft?.stand) || "nicht_erreichbar",
      anlass_sicher: false, anlass_kandidaten: nurPickadoc };
  }
  const anlass = anlassAusLeistungen(dampsoft.leistungen, jetzt);
  if (!anlass) return { anlass_abgleich: ABGLEICH.DAMPSOFT_LEER, anlass_sicher: false, anlass_kandidaten: nurPickadoc };

  const tag = anlass.letzter_besuch.datum;
  const ds = kandidatDampsoft(anlass);
  const abweichend = (warum, termin) => ({ anlass_abgleich: ABGLEICH.ABWEICHEND, anlass_abweichung: warum, anlass_sicher: false,
    anlass_kandidaten: termin ? [ds, kandidatPickadoc(termin, false)] : [ds] });
  if (!besucht.length) return abweichend("pickadoc_leer", null);
  const nah = besucht.filter((t) => tageZwischen(t.datum, tag) <= toleranz);
  const spaeter = besucht.find((t) => t.datum > tag && tageZwischen(t.datum, tag) > toleranz);
  if (!nah.length || spaeter) return abweichend("datum", besucht[0]);

  const artenDampsoft = new Set();
  for (const e of dampsoft.leistungen) if (s(e?.date) === tag && Number(e?.anzahl) > 0) for (const a of behandlungsarten(e.text)) artenDampsoft.add(a);
  const gleich = nah.find((t) => [...behandlungsarten(t.behandlung)].some((a) => artenDampsoft.has(a)));
  if (gleich) {
    return { ...anlass, anlass_abgleich: ABGLEICH.GLEICH, anlass_sicher: true, anlass_kandidaten: [ds, kandidatPickadoc(gleich, false)] };
  }
  const vergleichbar = artenDampsoft.size > 0 && nah.some((t) => behandlungsarten(t.behandlung).size > 0);
  return abweichend(vergleichbar ? "behandlung" : "nicht_vergleichbar", nah[0]);
}

const basis = () => s(process.env.PLANR_URL || "https://planr.pickadoc.de").replace(/\/+$/, "");
const schluessel = () => s(process.env.PLANR_HKP_KEY);

let holen = (...a) => fetch(...a);
/** Nur fuer Tests. */
export function _setHolen(fn) { holen = fn || ((...a) => fetch(...a)); }

// Was PlanR antwortet, wenn es keine Liste gibt: der Grund steht spaeter am Vorschlag.
const STAND_JE_STATUS = { 403: "nicht_freigegeben", 409: "nicht_gefunden", 501: "anderes_programm" };

/**
 * Leistungsliste aus dem Praxisprogramm, mit dem Grund, falls es keine gibt. Stand "ok" heisst: der Patient
 * ist eindeutig gefunden und die Liste gelesen (sie darf leer sein). Wirft nie.
 */
export async function leistungenAbfragen(clientId, { vorname, name, geburt } = {}) {
  if (!s(name) || !s(geburt)) return { stand: "kein_geburtsdatum" };
  if (!schluessel()) return { stand: "nicht_erreichbar" };
  const url = `${basis()}/api/intern/pvs/leistungen?${new URLSearchParams({ clientId: s(clientId), vorname: s(vorname), name: s(name), geburt: s(geburt) })}`;
  try {
    const r = await holen(url, { headers: { "X-PlanR-Key": schluessel() }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { stand: STAND_JE_STATUS[r.status] || "nicht_erreichbar" };
    const d = await r.json().catch(() => null);
    return d?.ok && Array.isArray(d.leistungen) ? { stand: "ok", leistungen: d.leistungen } : { stand: "nicht_erreichbar" };
  } catch {
    return { stand: "nicht_erreichbar" };
  }
}

async function terminhistorieLesen(clientId, patientId) {
  const booking = await loadBooking(clientId).catch(() => null);
  if (!booking?.locationId) throw new Error("no_booking_config");
  const snap = await admin.firestore().collection("clients").doc(clientId).collection("locations").doc(booking.locationId)
    .collection("appointments").where("patient.id", "==", patientId)
    .select("start", "status", "patientStatus", "isDeleted", "visitMotive.id", "visitMotive.name").get();
  return snap.docs.map((d) => d.data());
}

/** Pure: wer geprueft wird. Erst die ausdruecklich Gewuenschten, dann die vordersten jeder Gruppe; hoechstens 20. */
export function zuPruefen(gruppen, zuerst = [], jeGruppe = JE_GRUPPE()) {
  const imVorschlag = new Set((gruppen || []).flatMap((g) => (g.patienten || []).map((p) => s(p.patientId))));
  const ids = [];
  const dazu = (id) => { if (id && imVorschlag.has(id) && !ids.includes(id) && ids.length < INSGESAMT) ids.push(id); };
  for (const id of Array.isArray(zuerst) ? zuerst : []) dazu(s(id));
  for (const g of gruppen || []) for (const p of (g.patienten || []).slice(0, jeGruppe)) dazu(s(p.patientId));
  return ids;
}

/**
 * Die Vorschlaege um den Abgleich ergaenzen. Jeder Patient bekommt `anlass_abgleich`; die Geprueften dazu
 * `anlass_sicher` und `anlass_kandidaten`, und nur bei Uebereinstimmung `letzter_besuch`, `kontrollgrund`
 * und `anlass_quelle` aus der Abrechnung. Wirft nie; im Fehlerfall kommen die Gruppen unveraendert zurueck.
 */
export async function anlassAbgleichen(clientId, gruppen, {
  zuerst = [], laden = fetchPatientsByIds, leistungen = leistungenAbfragen, historie = terminhistorieLesen, jetzt = Date.now(),
} = {}) {
  try {
    const ids = zuPruefen(gruppen, zuerst);
    const kartei = ids.length ? new Map((await laden(clientId, ids)).map((p) => [p.id, p])) : new Map();
    const ergebnis = new Map();
    await Promise.all(ids.map(async (id) => {
      const p = kartei.get(id);
      const [dampsoft, termine] = await Promise.all([
        p ? leistungen(clientId, { vorname: p.firstName, name: p.lastName, geburt: p.birthDate }).catch(() => ({ stand: "nicht_erreichbar" })) : { stand: "nicht_gefunden" },
        historie(clientId, id).catch(() => null),
      ]);
      // Ohne lesbare Terminhistorie gibt es keinen Abgleich: der Patient gilt als nicht geprueft.
      if (termine) ergebnis.set(id, abgleichen(dampsoft, termine, { jetzt }));
    }));
    return (gruppen || []).map((g) => ({ ...g, patienten: (g.patienten || []).map((p) => (
      ergebnis.has(p.patientId) ? { ...p, ...ergebnis.get(p.patientId) } : { ...p, anlass_abgleich: ABGLEICH.NICHT_GEPRUEFT, anlass_sicher: false })) }));
  } catch {
    return gruppen;
  }
}
