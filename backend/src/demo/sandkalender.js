import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { DEMO_MANDANT } from "./tor.js";
import { log } from "../log.js";

// ============================================================================
// Sandbox-Kalender der Erlebnis-Demo (Chef 19.08.2026).
//
// Der Wegwerf-Demo-Account soll ECHT anfuehlen, aber NIE eine echte Praxis
// beruehren: keine Pickadoc-Cloud-Function, kein fremder Kalender. Deshalb
// liegt der Demo-Kalender in Pickadocs eigenem Mandanten (DEMO_MANDANT) unter
// mas_demo_kalender/{sid} und wird ausschliesslich hier gelesen/geschrieben.
//
// "sid" ist die Demo-Sitzungs-ID (die Firestore-Lead-Id). Sie hat KEINE Macht
// ueber SMS oder Anrufe (das kann nur das 48-stellige Ticket ueber tor.js) und
// darf deshalb gefahrlos als LiveKit-Raumname an DemoClara gereicht werden.
//
// Der Kalender startet LEER — genau der gewuenschte Erstlauf: "die Praxis hat
// noch keine Termine, legen wir zusammen einen an?".
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const COL = "mas_demo_kalender";

function text(v) {
  return (v == null ? "" : String(v)).trim();
}

function ref(sid) {
  return masCollection(DEMO_MANDANT, COL).doc(text(sid));
}

/** Aktueller Stand des Demo-Kalenders (leer, wenn noch nichts angelegt wurde). */
export async function standHolen(sid) {
  const id = text(sid);
  if (!id) return { termine: [], praxis: "", behandler: "" };
  const snap = await ref(id).get();
  const d = snap.exists ? (snap.data() || {}) : {};
  return {
    termine: Array.isArray(d.termine) ? d.termine : [],
    praxis: text(d.praxis),
    behandler: text(d.behandler),
  };
}

/** Praxis-/Behandlernamen einmalig setzen (aus dem Lead), ohne Termine zu ruehren. */
export async function sitzungAnlegen(sid, { praxis, behandler } = {}) {
  const id = text(sid);
  if (!id) return;
  await ref(id).set(
    { praxis: text(praxis), behandler: text(behandler), ts: Date.now() },
    { merge: true },
  );
}

// --- Datum/Uhrzeit: nur einfache, robuste Pruefungen (Demo, keine Zeitzonen-Akrobatik) --

function istDatum(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(s)) && !isNaN(new Date(`${text(s)}T00:00:00`).getTime());
}

function istUhrzeit(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text(s));
}

function wochentagBerlin(datum) {
  // 0 = Sonntag ... 6 = Samstag
  const wt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" })
    .format(new Date(`${datum}T09:00:00`));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wt);
}

/**
 * Freie Slots fuer einen Tag: 08:00–18:00 im 30-Minuten-Raster, abzueglich
 * schon belegter Zeiten. Wochenende gibt bewusst nichts zurueck.
 *
 * @returns {string[]} z. B. ["09:00","09:30", ...]
 */
export function freieSlots(datum, termine = []) {
  if (!istDatum(datum)) return [];
  const wt = wochentagBerlin(datum);
  if (wt === 0 || wt === 6) return [];
  const belegt = new Set(
    (Array.isArray(termine) ? termine : [])
      .filter((t) => text(t?.datum) === text(datum))
      .map((t) => text(t?.uhrzeit)),
  );
  const slots = [];
  for (let m = 8 * 60; m < 18 * 60; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    const u = `${hh}:${mm}`;
    if (!belegt.has(u)) slots.push(u);
  }
  return slots;
}

/**
 * Einen Termin im Sandbox-Kalender anlegen. Gibt den Termin + eine kurze,
 * sprechbare Bestaetigung zurueck (fuer DemoClara).
 */
export async function terminAnlegen(sid, roh = {}) {
  const id = text(sid);
  if (!id) return { ok: false, fehler: "sid" };

  const datum = text(roh.datum);
  const uhrzeit = text(roh.uhrzeit);
  const patient = text(roh.patient) || text(roh.patientName);
  const grund = text(roh.grund) || text(roh.visitMotiveName) || "Termin";
  const behandler = text(roh.behandler);
  const dauer = Number(roh.dauer) > 0 ? Number(roh.dauer) : 30;

  if (!istDatum(datum)) return { ok: false, fehler: "datum", klartext: "Für welchen Tag soll der Termin sein?" };
  if (!istUhrzeit(uhrzeit)) return { ok: false, fehler: "uhrzeit", klartext: "Zu welcher Uhrzeit soll der Termin sein?" };
  if (!patient) return { ok: false, fehler: "patient", klartext: "Auf welchen Namen soll ich den Termin eintragen?" };

  const stand = await standHolen(id);
  const schonBelegt = stand.termine.some((t) => text(t.datum) === datum && text(t.uhrzeit) === uhrzeit);
  if (schonBelegt) {
    return { ok: false, fehler: "belegt", klartext: `Um ${uhrzeit} ist an dem Tag leider schon etwas eingetragen.` };
  }

  const termin = {
    id: `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    datum,
    uhrzeit,
    dauer,
    patient,
    grund,
    behandler: behandler || stand.behandler || "",
    erstelltAm: Date.now(),
  };

  await ref(id).set({ termine: FieldValue.arrayUnion(termin), ts: Date.now() }, { merge: true });
  log.info("demo.kalender.termin", { sid: id, datum, uhrzeit, grund });

  return { ok: true, termin, spoken: sprechbar(termin) };
}

/** Kurzer gesprochener Satz zu einem Termin (relative Datumsangabe macht spaeter der response_guard). */
function sprechbar(t) {
  const teile = [`${t.patient}`, t.grund && `— ${t.grund}`, `am ${t.datum}`, `um ${t.uhrzeit} Uhr`].filter(Boolean);
  return `Eingetragen: ${teile.join(" ")}.`;
}

/** Demo-Kalender einer Sitzung leeren (Wegwerf: nach der Sitzung wieder frisch). */
export async function leeren(sid) {
  const id = text(sid);
  if (!id) return;
  await ref(id).set({ termine: [], ts: Date.now() }, { merge: true });
  log.info("demo.kalender.geleert", { sid: id });
}
