// Befund fuer einen Clara-HKP (Chef 05.10.2026: "Clara muss den richtigen Befund finden und wenn
// keiner da ist, mich fragen"; Chef 14.10.2026: der Befund wird GEWAEHLT). Quellen:
//   - "pvs":  aktueller Zahnstatus aus dem Praxisprogramm (ueber PlanR und die PlanR-Bridge), Kuerzel
//             unveraendert – der HKP zeigt genau, was dort steht.
//   - "lena": letzter Lena-01-Zahnstatus (treatment/main.zahnstatus01), nur mit MAS.
//   - "neu":  gesprochen aufgenommen; nach der Befund-Freigabe ersetzt er im Praxisprogramm den alten,
//             nur in den abgefragten Kiefern (Schreiben macht die Route).
// Ohne gewaehlte Quelle fragt Clara, es wird nie ein Befund erfunden.
// Notaus: MAS_HKP_BEFUND_WAHL=0 (alte Kaskade gesprochen > Lena > Rueckfrage), MAS_HKP_PVS_BEFUND=0 (kein PVS).
import admin from "../firebase.js";
import { BEFUND_KUERZEL, befundVerstehen } from "../vendor/hkp-engine.mjs";
import { fromTeethRaw } from "../pvs/befundMap.js";
import { getPatientAppointments } from "../clara/daySchedule.js";
import { loadBooking } from "../clara/booking.js";
import { claraZugangFuer } from "./planrClara.js";

export const BEFUND_MAX_ALTER_TAGE = 183;

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
export const ALLE_ZAEHNE = [...OK, ...UK];
const KIEFER = { OK, UK };
const KIEFER_NAME = { OK: "Oberkiefer", UK: "Unterkiefer" };
const kieferVon = (z) => (/^[12]/.test(String(z)) ? "OK" : "UK");

/**
 * Lena-01-Zahnschema -> eHKP-Befundkuerzel je Zahn (alle 32 Zaehne; ohne
 * ZE-relevanten Befund = vorhanden ""). Bewusst konservativ: Karies oder
 * Wurzelfuellung machen KEINEN Zahn ueberkronungsbeduerftig — das entscheidet
 * der Behandler (gesprochen oder in PlanR).
 */
export function befundAusLena01(teethRaw) {
  const befund = Object.fromEntries(ALLE_ZAEHNE.map((z) => [z, ""]));
  const hinweise = [];
  const implantate = [];
  for (const t of fromTeethRaw(teethRaw)) {
    const z = String(t.fdi);
    if (!(z in befund)) continue;
    const ids = new Set(t.ids);
    const insuff = ids.has("ze_insuffizient");
    let code = "";
    if (ids.has("zahn_fehlt") || ids.has("alle_fehlend_ok") || ids.has("alle_fehlend_uk")) code = "f";
    else if (ids.has("imp_lockerung") || ids.has("imp_fraktur")) code = "ix";
    else if (ids.has("implantat")) { implantate.push(z); code = ""; }
    else if (ids.has("brueckenglied")) code = insuff ? "bw" : "b";
    else if (ids.has("prothesenzahn") || ids.has("alle_ersetzt_ok") || ids.has("alle_ersetzt_uk")) code = insuff ? "ew" : "e";
    else if (ids.has("zahn_zerstoert") || ids.has("fraktur") || ids.has("wurzelrest")) code = "x";
    else if (ids.has("teleskop")) code = insuff ? "tw" : "t";
    else if (ids.has("krone") || ids.has("teilkrone")) code = insuff ? "kw" : "k";
    else if (ids.has("lueckenschluss")) code = ")(";
    befund[z] = code;
  }
  if (implantate.length) hinweise.push(`Implantat an ${implantate.join(", ")} laut Lena-01 – Versorgung bitte in PlanR prüfen.`);
  return { befund, hinweise };
}

const tage = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86400000);
export const datumDe = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
};

/** Letzter gespeicherter Lena-01-Status (neuester Termin zuerst, hoechstens 15 Termine) */
export async function letzterLena01(clientId, patient) {
  const appts = await getPatientAppointments(clientId, {
    patientId: patient.id, firstName: patient.firstName, lastName: patient.lastName,
  });
  if (!appts?.ok) return null;
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return null;
  const kandidaten = [...(appts.past || []), ...(appts.upcoming || []).filter((a) => a.startMs < Date.now() + 86400000)]
    .sort((a, b) => b.startMs - a.startMs)
    .slice(0, 15);
  const docs = await Promise.all(kandidaten.map((a) => admin.firestore()
    .collection("clients").doc(clientId).collection("locations").doc(locationId)
    .collection("appointments").doc(a.id).collection("treatment").doc("main")
    .get().then((d) => ({ a, z: d.exists ? d.data()?.zahnstatus01 : null })).catch(() => ({ a, z: null }))));
  const treffer = docs
    .filter(({ z }) => z && z.teethJson && z.teethJson !== "null")
    .sort((x, y) => String(y.z.updatedAt || "").localeCompare(String(x.z.updatedAt || "")))[0];
  if (!treffer) return null;
  let teeth = null;
  try { teeth = JSON.parse(treffer.z.teethJson); } catch { teeth = null; }
  if (!teeth || typeof teeth !== "object" || !Object.keys(teeth).length) return null;
  return { teeth, datum: treffer.z.updatedAt || new Date(treffer.a.startMs).toISOString(), appointmentId: treffer.a.id };
}

// --- Praxisprogramm ueber PlanR (GET/POST /api/intern/pvs/befund, Schluessel PLANR_HKP_KEY) ---
const planrBasis = () => String(process.env.PLANR_URL || "https://planr.pickadoc.de").trim().replace(/\/+$/, "");
const planrSchluessel = () => String(process.env.PLANR_HKP_KEY || "").trim();
let holen = (...a) => fetch(...a);
/** Nur fuer Tests. */
export function _setHolen(fn) { holen = fn || ((...a) => fetch(...a)); }

/** Patient fuer PlanR: Nummer, wenn er aus dem PVS kommt, sonst Name und Geburtsdatum (Pickadoc-Kartei). */
export function pvsKennung(patient) {
  const id = String(patient?.pvsNummer || (patient?.quelle === "pvs" ? patient.id : "") || "");
  if (/^\d{1,9}$/.test(id)) return { patient: id };
  return { vorname: String(patient?.firstName || ""), name: String(patient?.lastName || ""), geburt: String(patient?.birthDate || "").slice(0, 10) };
}

/** -> Antwort von PlanR | { ok:false, pvs, meldung } | null (fuer die Praxis ist kein Praxisprogramm angebunden) */
async function planrBefund(clientId, patient, { body = null, ms }) {
  if (process.env.MAS_HKP_PVS_BEFUND === "0" || !planrSchluessel()) return null;
  const url = `${planrBasis()}/api/intern/pvs/befund?${new URLSearchParams({ clientId, ...(body ? {} : pvsKennung(patient)) })}`;
  try {
    const r = await holen(url, {
      method: body ? "POST" : "GET",
      headers: { "X-PlanR-Key": planrSchluessel(), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(ms),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.ok) return d;
    // Ohne PVS-Namen ist die Praxis keine PlanR-Praxis bzw. dort ist kein Praxisprogramm eingestellt.
    return d?.pvs ? { ok: false, pvs: String(d.pvs), meldung: String(d.meldung || `HTTP ${r.status}`) } : null;
  } catch {
    return body ? { ok: false, pvs: "", meldung: "PlanR antwortet gerade nicht." } : null;
  }
}

/** Aktueller Befund im Praxisprogramm: { ok:true, pvs, datum, befund, nummer } | { ok:false, pvs, meldung } | null */
export async function pvsBefund(clientId, patient) {
  const d = await planrBefund(clientId, patient, { ms: 35000 });
  if (!d?.ok) return d;
  return {
    ok: true, pvs: String(d.pvs || "dem Praxisprogramm"), datum: String(d.datum || ""),
    befund: d.zaehne && typeof d.zaehne === "object" ? d.zaehne : {}, nummer: String(d.patient || ""),
  };
}

/** Freigegebenen Befund ins Praxisprogramm (nur die Zaehne der genannten Kiefer): { ok, pvs, geschrieben } | { ok:false, pvs, meldung } */
export async function befundInsPvs(clientId, patient, { kiefer, zaehne, nummer = "" }) {
  const kennung = /^\d{1,9}$/.test(String(nummer)) ? { patient: String(nummer) } : pvsKennung(patient);
  const d = await planrBefund(clientId, patient, { body: { ...kennung, kiefer, zaehne }, ms: 90000 });
  if (!d) return { ok: false, pvs: "", meldung: "Für diese Praxis ist kein Praxisprogramm angebunden." };
  return d.ok ? { ok: true, pvs: String(d.pvs || ""), geschrieben: Array.isArray(d.geschrieben) ? d.geschrieben : [] } : d;
}

/** Lenas Erstuntersuchung gibt es nur mit MAS – PlanR-Praxen ohne MAS (Zugang "planr") bekommen sie nicht angeboten. */
export async function lenaFreigeschaltet(clientId) {
  return (await claraZugangFuer(clientId)) !== "planr";
}

/** Gewaehlte Quelle aus dem Werkzeug-Feld oder der Antwort: "pvs" | "lena" | "neu" | "" */
export function quelleAus(text) {
  const t = String(text || "").trim().toLowerCase();
  if (/^(pvs|lena|neu)$/.test(t)) return t;
  if (/\bneu|aufnehm|selbst|diktier/.test(t)) return "neu";
  if (/lena|erstuntersuchung|multi.?agent/.test(t)) return "lena";
  if (/dampsoft|ds.?win|\bdens|evident|charly|praxis(programm|software)|\bpvs\b|kartei|programm/.test(t)) return "pvs";
  return "";
}

/** Kiefer, die der Auftrag betrifft (fuer Befundfrage und Schreiben) – ohne Angabe beide */
export function auftragsKiefer(auftrag) {
  const k = new Set();
  for (const t of auftrag?.teile?.length ? auftrag.teile : [auftrag || {}]) {
    if (t.kiefer === "OK" || t.kiefer === "UK") k.add(t.kiefer);
    for (const z of [...(t.pfeiler || []), ...(t.glieder || []), ...(t.entfernen || [])]) k.add(kieferVon(z));
  }
  return k.size ? ["OK", "UK"].filter((x) => k.has(x)) : ["OK", "UK"];
}

/** Gesprochener Befund -> ganze Kiefer: nicht genannte Zaehne vorhanden, nicht genannte Weisheitszaehne fehlend */
export function kieferBefund(gesagt, kiefer) {
  const out = { ...gesagt };
  for (const k of kiefer) for (const z of KIEFER[k] || []) if (!(z in out)) out[z] = z.endsWith("8") ? "f" : "";
  return out;
}

const nurKiefer = (befund, kiefer) => Object.fromEntries(Object.entries(befund).filter(([z]) => kiefer.includes(kieferVon(z))));

/** Kuerzel aus dem Praxisprogramm, die kein eHKP-Befund sind (z. B. DS-Win "t1"): unveraendert uebernommen, mit Hinweis */
export function fremdeKuerzel(befund, pvs) {
  const fremd = Object.entries(befund).filter(([, c]) => c && c !== "i" && !(c in BEFUND_KUERZEL));
  return fremd.length ? [`Aus ${pvs} unverändert übernommen, kein eHKP-Kürzel: ${fremd.map(([z, c]) => `${z} ${c}`).join(", ")} – bitte in PlanR prüfen.`] : [];
}

const LUECKE = "Alle übrigen nehme ich als vorhanden auf, nicht genannte Weisheitszähne als fehlend.";

/** Frage nach einem neuen Befund fuer die Kiefer des Auftrags */
export function neuFrage(kiefer, pvsName, vorweg = "") {
  const wo = kiefer.length === 1 ? `im ${KIEFER_NAME[kiefer[0]]}` : "im Ober- und Unterkiefer";
  const danach = pvsName
    ? `Bevor ich ihn nach ${pvsName} übertrage, lese ich ihn Ihnen zur Freigabe vor.`
    : "Ich lese Ihnen danach alles zur Kontrolle vor.";
  return `${vorweg}Dann nehme ich den Befund jetzt neu auf: Welche Zähne fehlen ${wo}, welche sind überkront, welche brauchen eine Krone `
    + `und welche sind nicht erhaltungswürdig? ${LUECKE} ${danach}`;
}

const pvsDatum = (p) => (p.datum ? ` vom ${datumDe(p.datum)}` : "");
const pvsFehler = (p) => (p ? `Den Befund aus ${p.pvs} kann ich gerade nicht lesen: ${p.meldung} ` : "");

/** Rueckfrage nach der Quelle; das Praxisprogramm mit Namen und Datum */
export function quelleFrage(patient, { p, l, gesagt = false }) {
  const wahl = [];
  if (p?.ok) wahl.push(`den aktuellen aus ${p.pvs}${pvsDatum(p)}`);
  if (l) wahl.push(`den aus Lenas Erstuntersuchung vom ${datumDe(l.datum)}`);
  const vorweg = p && !p.ok ? pvsFehler(p) : "";
  if (gesagt) return `${vorweg}Sie haben Zähne genannt. Soll ich damit ${wahl.join(" oder ")} ergänzen – oder ist das ein neuer, vollständiger Befund?`;
  return `${vorweg}Welchen Befund nehme ich für ${patient.label}: ${wahl.join(" oder ")} – oder nehmen wir einen neuen Befund auf?`;
}

const wahlAus = () => process.env.MAS_HKP_BEFUND_WAHL === "0";
const hat = (o) => Object.keys(o || {}).length > 0;

/**
 * Liefert { ok:true, befund, quelle, quelleWahl, hinweise, gesagt, abgeleitet, pvs?, neu? } oder
 * { ok:false, grund, frage, pvsName, gesagt, abgeleitet }.
 * gesprochen: ausdruecklich genannter Befund; ausAuftrag: Befund-Satzteile aus dem Auftrag. Clara haengt
 * Antworten an den Auftrag an – fuer PVS und neuen Befund zaehlt deshalb nur, was seit dem letzten Schritt
 * (abgeleitetVorher) dazukam; der Rest des Auftrags ueberschreibt einen PVS-Befund nicht (widerspricht der Plan
 * dem PVS, fragt die Engine nach). Auch einen gemerkten Befund schickt Clara bei jedem Aufruf erneut –
 * gesprochen zaehlt daher nur, soweit er sich gegenueber genanntVorher geaendert hat.
 * quelle: "pvs" | "lena" | "neu" | "". bisher: schon genannte, noch nicht freigegebene Zaehne. neu: was nach
 * der Befund-Freigabe ins Praxisprogramm geht ({ kiefer, zaehne }). bestaetigt: alter Lena-Befund gilt noch.
 */
export async function befundErmitteln(clientId, patient, {
  gesprochen = "", ausAuftrag = "", kiefer, kieferListe, quelle = "", bestaetigt = false, ohneBefundOk = false,
  lena = letzterLena01, pvs = pvsBefund, lenaErlaubt = true, bisher = null, abgeleitetVorher, genanntVorher,
  pvsName, neuGefragt = false,
} = {}) {
  const jetzt = new Date().toISOString();
  const hinweise = [];
  const seit = (b, vorher) => Object.fromEntries(Object.entries(b).filter(([z, c]) => vorher[z] !== c));
  const abgeleitet = ausAuftrag ? befundVerstehen(ausAuftrag, kiefer) : {};
  const genannt = gesprochen ? befundVerstehen(gesprochen, kiefer) : genanntVorher || {};
  const gesagt = { ...(bisher || {}), ...seit(abgeleitet, abgeleitetVorher ?? abgeleitet), ...seit(genannt, genanntVorher || {}) };
  const jaws = kieferListe?.length ? kieferListe : kiefer === "OK" || kiefer === "UK" ? [kiefer] : ["OK", "UK"];
  const holePvs = () => pvs(clientId, patient).catch(() => null);
  const holeLena = () => (lenaErlaubt ? lena(clientId, patient).catch(() => null) : Promise.resolve(null));
  const stand = { gesagt, abgeleitet, genannt };
  const fragen = (grund, frage, p) => ({ ok: false, grund, frage, pvsName: p?.pvs || pvsName || "", ...stand });

  const ausLena = (l) => {
    const alter = tage(l.datum);
    const spoken = { ...abgeleitet, ...gesagt };
    if (alter > BEFUND_MAX_ALTER_TAGE && !bestaetigt && !hat(spoken)) {
      return {
        ok: false, grund: "befund_alt", datum: l.datum, pvsName: pvsName || "", ...stand,
        frage: `Der letzte Befund von ${patient.label} ist vom ${datumDe(l.datum)}. Gilt der noch, oder nennen Sie mir den aktuellen Befund?`,
      };
    }
    const r = befundAusLena01(l.teeth);
    hinweise.push(...r.hinweise);
    if (alter > BEFUND_MAX_ALTER_TAGE) hinweise.push(`Befund vom ${datumDe(l.datum)} – laut Ansage weiterhin gültig.`);
    return {
      ok: true, befund: { ...r.befund, ...spoken }, quelleWahl: "lena", ...stand, hinweise,
      quelle: { art: hat(spoken) ? "gesprochen+lena01" : "lena01", datum: hat(spoken) ? jetzt : l.datum, appointmentId: l.appointmentId },
    };
  };

  /** Neuer Befund: ganze Kiefer; ins Praxisprogramm nur, wenn eines angebunden ist */
  const ausGesagt = (roh, p) => {
    const befund = kieferBefund(roh, jaws);
    const name = p?.pvs || pvsName || "";
    return {
      ok: true, befund, quelleWahl: "neu", ...stand, gesagt: roh, hinweise, quelle: { art: "gesprochen", datum: jetzt },
      ...(name ? { pvs: { name, nummer: p?.ok ? p.nummer : "" }, neu: { kiefer: jaws, zaehne: nurKiefer(befund, jaws) } } : {}),
    };
  };

  if (!quelle) {
    const [p, l] = wahlAus() ? [null, await holeLena()] : await Promise.all([holePvs(), holeLena()]);
    if (wahlAus() && l) return ausLena(l);
    if (p?.ok || l) return fragen("befund_quelle", quelleFrage(patient, { p, l, gesagt: hat(gesagt) }), p);
    if (hat(gesagt)) return ausGesagt({ ...abgeleitet, ...gesagt }, p);
    if (hat(abgeleitet)) return { ok: true, befund: abgeleitet, quelleWahl: "", ...stand, gesagt: {}, hinweise, quelle: { art: "gesprochen", datum: jetzt } };
    // Reine Totalprothese: die Engine plant zahnlos und vermerkt die Annahme.
    if (ohneBefundOk) return { ok: true, befund: {}, quelleWahl: "", ...stand, gesagt: {}, hinweise, quelle: { art: "auftrag", datum: jetzt } };
    return fragen("befund_fehlt", neuFrage(jaws, p?.pvs, pvsFehler(p) || `Für ${patient.label} habe ich keinen gespeicherten Befund. `), p);
  }

  if (quelle === "pvs") {
    const p = await holePvs();
    if (!p?.ok) {
      const warum = pvsFehler(p) || "Für diese Praxis ist kein Praxisprogramm angebunden. ";
      const l = await holeLena();
      if (l) return fragen("befund_quelle", `${warum}Soll ich den Befund aus Lenas Erstuntersuchung vom ${datumDe(l.datum)} nehmen, oder nehmen wir einen neuen auf?`, p);
      return fragen("befund_fehlt", neuFrage(jaws, p?.pvs, warum), p);
    }
    const geaendert = Object.keys(gesagt).filter((z) => String(p.befund[z] ?? "") !== gesagt[z]);
    const befund = { ...p.befund, ...gesagt };
    hinweise.push(...fremdeKuerzel(befund, p.pvs));
    const basis = { ok: true, befund, quelleWahl: "pvs", ...stand, hinweise, pvs: { name: p.pvs, nummer: p.nummer } };
    if (!geaendert.length) return { ...basis, quelle: { art: "pvs", pvs: p.pvs, datum: p.datum } };
    const k = [...new Set(geaendert.map(kieferVon))];
    return {
      ...basis, quelle: { art: "gesprochen+pvs", pvs: p.pvs, datum: jetzt, pvsDatum: p.datum },
      neu: { kiefer: k, zaehne: nurKiefer(befund, k), geaendert: Object.fromEntries(geaendert.map((z) => [z, gesagt[z]])) },
    };
  }

  if (quelle === "lena") {
    const l = await holeLena();
    if (l) return ausLena(l);
    const warum = lenaErlaubt ? `Von Lena habe ich für ${patient.label} keinen Befund. ` : "Lenas Erstuntersuchung gibt es nur mit Pickadoc MAS. ";
    const p = await holePvs();
    if (p?.ok) return fragen("befund_quelle", `${warum}Soll ich den aktuellen Befund aus ${p.pvs}${pvsDatum(p)} nehmen, oder nehmen wir einen neuen auf?`, p);
    return fragen("befund_fehlt", neuFrage(jaws, p?.pvs, warum), p);
  }

  // "neu": erst fragen, dann aufnehmen. Hat Clara die Antwort in den Auftrag gepackt, zaehlt sie nach der Frage auch.
  const roh = hat(gesagt) ? { ...abgeleitet, ...gesagt } : neuGefragt ? abgeleitet : {};
  const p = pvsName === undefined ? await holePvs() : null;
  if (!hat(roh)) return fragen("befund_fehlt", neuFrage(jaws, p?.pvs ?? pvsName, "Gut. "), p);
  return ausGesagt(roh, p);
}
