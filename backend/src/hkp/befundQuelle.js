// Befund fuer einen Clara-HKP finden (Chef 05.10.2026: "Clara muss den richtigen
// Befund finden und wenn keiner da ist, mich fragen"). Kaskade:
//   1. gesprochener Befund (ueberschreibt je Zahn alles andere)
//   2. letzter Lena-01-Zahnstatus des Patienten (treatment/main.zahnstatus01)
//   3. PVS-Zahnschema (Lese-Adapter fehlt noch -> "nicht verfuegbar")
//   4. sonst Rueckfrage — es wird nie ein Befund erfunden.
import admin from "../firebase.js";
import { befundVerstehen } from "../vendor/hkp-engine.mjs";
import { fromTeethRaw } from "../pvs/befundMap.js";
import { getPatientAppointments } from "../clara/daySchedule.js";
import { loadBooking } from "../clara/booking.js";

export const BEFUND_MAX_ALTER_TAGE = 183;

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
export const ALLE_ZAEHNE = [...OK, ...UK];

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

/** PVS-Zahnschema lesen — Adapter folgt (Dampsoft/DENS schreiben bisher nur). */
export async function pvsBefund() {
  return null;
}

/**
 * Liefert { ok:true, befund, quelle, hinweise } oder { ok:false, frage, grund }.
 * gesprochen: Befundtext aus dem Gespraech; bestaetigt: Chef hat einen alten
 * Lena-01-Befund ausdruecklich als gueltig bestaetigt.
 */
export async function befundErmitteln(clientId, patient, { gesprochen = "", kiefer, bestaetigt = false, ohneBefundOk = false, lena = letzterLena01, pvs = pvsBefund } = {}) {
  const hinweise = [];
  const gesagt = gesprochen ? befundVerstehen(gesprochen, kiefer) : {};
  let basis = null;
  let quelle = null;

  const l = await lena(clientId, patient).catch(() => null);
  if (l) {
    const alter = tage(l.datum);
    if (alter > BEFUND_MAX_ALTER_TAGE && !bestaetigt && !Object.keys(gesagt).length) {
      return {
        ok: false, grund: "befund_alt", datum: l.datum,
        frage: `Der letzte Befund von ${patient.label} ist vom ${datumDe(l.datum)}. Gilt der noch, oder nennen Sie mir den aktuellen Befund?`,
      };
    }
    const r = befundAusLena01(l.teeth);
    basis = r.befund;
    hinweise.push(...r.hinweise);
    quelle = { art: "lena01", datum: l.datum, appointmentId: l.appointmentId };
    if (alter > BEFUND_MAX_ALTER_TAGE) hinweise.push(`Befund vom ${datumDe(l.datum)} – laut Ansage weiterhin gültig.`);
  } else {
    const p = await pvs(clientId, patient).catch(() => null);
    if (p) {
      basis = p.befund;
      quelle = { art: "pvs", datum: p.datum || "" };
    }
  }

  if (Object.keys(gesagt).length) {
    return {
      ok: true,
      befund: { ...(basis || {}), ...gesagt },
      quelle: { art: basis ? `gesprochen+${quelle.art}` : "gesprochen", datum: new Date().toISOString(), ...(quelle?.appointmentId ? { appointmentId: quelle.appointmentId } : {}) },
      hinweise,
    };
  }
  if (basis) return { ok: true, befund: basis, quelle, hinweise };
  // Reine Totalprothese: die Engine plant zahnlos und vermerkt die Annahme.
  if (ohneBefundOk) return { ok: true, befund: {}, quelle: { art: "keiner" }, hinweise };
  return {
    ok: false, grund: "befund_fehlt",
    frage: `Für ${patient.label} habe ich keinen Befund – weder aus der Lena-Erstuntersuchung noch aus dem Praxisprogramm. `
      + `Dann nehme ich ihn jetzt auf: Welche Zähne fehlen im ${kiefer === "UK" ? "Unterkiefer" : kiefer === "OK" ? "Oberkiefer" : "Ober- und Unterkiefer"}, `
      + "welche sind überkront und welche sind nicht erhaltungswürdig? Alle übrigen nehme ich als vorhanden auf, nicht genannte Weisheitszähne als fehlend – ich lese Ihnen danach alles zur Kontrolle vor.",
  };
}
