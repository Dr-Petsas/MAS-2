// Anlass aus abgerechneten Leistungen (Chef 27.11.2026): Lisa und die Luecke-fuellen-Texte sollen
// nennen, was beim letzten Besuch wirklich abgerechnet wurde, nicht nur den Besuchsgrund des
// letzten Pickadoc-Termins. Die Leistungen kommen aus dem Praxisprogramm ueber PlanR und die Bridge.
//
// Genannt wird nur, was in der Leistungsliste steht: Datum und Text der Position. Aus einem
// Kuerzel wird kein Wort gemacht. Fehlt die Liste, ein Datum oder ein Text, bleibt alles wie
// bisher (Besuchsgrund des letzten Termins).
//
// Schalter MAS_ANLASS_LEISTUNGEN: Liste der Praxen (clientId, mit Komma getrennt), fuer die
// abgerufen werden darf. Leer = aus. Jede Praxis steht einzeln drin, weil der Abruf im
// Praxisprogramm ihr Ja braucht.
import { fetchPatientsByIds } from "./patientCatalog.js";

const TZ = "Europe/Berlin";
const s = (v) => String(v ?? "").trim();
const ymd = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
const istTag = (t) => t.length === 10 && !Number.isNaN(Date.parse(`${t}T12:00:00Z`));
const tagLang = (tag) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(`${tag}T12:00:00Z`));

const TEXTE_HOECHSTENS = 3;
const JE_GRUPPE = () => Math.max(1, Math.min(10, Number(process.env.MAS_ANLASS_LEISTUNGEN_MAX) || 5));
const INSGESAMT = 20;

/** Darf fuer diese Praxis im Praxisprogramm nachgesehen werden? */
export function anlassAn(clientId, roh = process.env.MAS_ANLASS_LEISTUNGEN) {
  const id = s(clientId);
  return !!id && s(roh).split(",").map(s).includes(id);
}

/**
 * Pure: aus der Leistungsliste des Praxisprogramms der letzte Tag mit abgerechneten Positionen.
 * Eine Zeile zaehlt nur mit Kuerzel, Anzahl ueber null und einem Datum, das nicht in der Zukunft
 * liegt. Ergebnis in Lisas Feldern, oder null, wenn nichts Sprechbares da ist.
 */
export function anlassAusLeistungen(leistungen, jetzt = Date.now()) {
  const heute = ymd(jetzt);
  const posten = (Array.isArray(leistungen) ? leistungen : []).filter((e) => e && typeof e === "object"
    && s(e.kind) && Number(e.anzahl) > 0 && istTag(s(e.date)) && s(e.date) <= heute);
  if (!posten.length) return null;
  const tag = posten.reduce((a, e) => (s(e.date) > a ? s(e.date) : a), "");
  const texte = [];
  for (const e of posten) {
    const t = s(e.text).slice(0, 60);
    if (s(e.date) === tag && t && !texte.some((x) => x.toLowerCase() === t.toLowerCase())) texte.push(t);
  }
  if (!texte.length) return null;
  const grund = texte.slice(0, TEXTE_HOECHSTENS).join(", ").slice(0, 120);
  return {
    letzter_besuch: { datum: tag, grund },
    kontrollgrund: `Zuletzt am ${tagLang(tag)} abgerechnet: ${grund}.`,
    anlass_quelle: "abrechnung",
  };
}

const basis = () => s(process.env.PLANR_URL || "https://planr.pickadoc.de").replace(/\/+$/, "");
const schluessel = () => s(process.env.PLANR_HKP_KEY);

let holen = (...a) => fetch(...a);
/** Nur fuer Tests. */
export function _setHolen(fn) { holen = fn || ((...a) => fetch(...a)); }

/**
 * Leistungsliste eines Patienten aus dem Praxisprogramm, ueber PlanR. Der Patient wird dort mit
 * Vorname, Name und Geburtsdatum gesucht. Liefert die Liste oder null (kein Schluessel, PlanR
 * kennt die Abfrage nicht, Patient nicht eindeutig, Bridge antwortet nicht). Wirft nie.
 */
export async function leistungenAusPvs(clientId, { vorname, name, geburt } = {}) {
  if (!schluessel() || !s(name) || !s(geburt)) return null;
  const url = `${basis()}/api/intern/pvs/leistungen?${new URLSearchParams({ clientId: s(clientId), vorname: s(vorname), name: s(name), geburt: s(geburt) })}`;
  try {
    const r = await holen(url, { headers: { "X-PlanR-Key": schluessel() }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return d?.ok && Array.isArray(d.leistungen) ? d.leistungen : null;
  } catch {
    return null;
  }
}

/**
 * Die vordersten Patienten jeder Gruppe um den Anlass aus der Abrechnung ergaenzen. Es kommen nur
 * Felder dazu (`letzter_besuch`, `kontrollgrund`, `anlass_quelle`), nichts wird ersetzt. Ohne
 * Geburtsdatum in der Kartei wird nicht gesucht: der Name allein trifft im Praxisprogramm auch
 * Namensvetter. Wirft nie; im Fehlerfall kommen die Gruppen unveraendert zurueck.
 */
export async function anlassErgaenzen(clientId, gruppen, { laden = fetchPatientsByIds, leistungen = leistungenAusPvs, jetzt = Date.now() } = {}) {
  try {
    const ids = [];
    for (const g of gruppen || []) {
      for (const p of (g.patienten || []).slice(0, JE_GRUPPE())) {
        if (p.patientId && !ids.includes(p.patientId) && ids.length < INSGESAMT) ids.push(p.patientId);
      }
    }
    if (!ids.length) return gruppen;
    const kartei = new Map((await laden(clientId, ids)).map((p) => [p.id, p]));
    const anlass = new Map();
    await Promise.all(ids.map(async (id) => {
      const p = kartei.get(id);
      if (!p?.birthDate || !s(p.lastName)) return;
      const liste = await leistungen(clientId, { vorname: p.firstName, name: p.lastName, geburt: p.birthDate });
      const a = anlassAusLeistungen(liste, jetzt);
      if (a) anlass.set(id, a);
    }));
    if (!anlass.size) return gruppen;
    return gruppen.map((g) => ({ ...g, patienten: g.patienten.map((p) => (anlass.has(p.patientId) ? { ...p, ...anlass.get(p.patientId) } : p)) }));
  } catch {
    return gruppen;
  }
}
