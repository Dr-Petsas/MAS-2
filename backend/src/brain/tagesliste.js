// Tagesliste: alles, worauf heute jemand reagieren muss.
//
// Lese-Modell ueber die bestehenden Vorgaenge (mas_cases) — kein zweiter
// Datenspeicher. Jede Zeile traegt ihre Quelle (Bianca, Lisa, Nadine, Clara),
// damit weitere Lieferanten ohne Umbau dazukommen: wer ueber
// POST /brain/events einliefert, erscheint hier von selbst.
//
// Was NICHT hineingehoert:
//  - reine Termintelefonate (Thema "Termin"), solange niemand zurueckrufen muss
//  - Notizen, die das Team selbst fuer Bianca hinterlegt hat (die stehen auf
//    der Seite im Bereich "Notiz fuer Bianca")
//  - gewoehnliche E-Mails; von Nadine kommen nur dringende und solche, deren
//    Entwurf auf eine Freigabe wartet
//  - Beobachtungen der Kalender-Automatik (Dokumenten-Ampel, Termin entfernt)
//  - Auftraege, an denen Lisa, Nadine oder Clara gerade selbst arbeiten
//
// Anruflisten fuer Lisa, die auf eine Freigabe warten, tragen `freigabe`;
// freigegeben wird ueber den bestehenden Weg POST /brain/gap-fill/:id/approve.
//
// Julias QM-Aufgaben sind ein eigener, nachgeordneter Abschnitt. Er ist
// vorerst ausgeblendet (mitQm), bis der Rueckstand bei Julia aufgeraeumt ist.

import { isActiveStatus, TOPICS, TOPIC_LABELS, UPDATE_KINDS, tsToMs } from "./cases.js";
import { listCases } from "./caseStore.js";
import { queryLatest } from "./eventStore.js";
import { listCalendar as qmListCalendar } from "../qm/jobs.js";

const EVENT_FENSTER_MS = 14 * 24 * 3_600_000;
const LIEFERANTEN = ["Bianca", "Lisa", "Nadine", "Clara"];
const RANG = { sofort: 0, heute: 1, normal: 2 };
const QM_OFFEN = new Set(["planned", "assigned", "seen", "in_progress", "overdue", "escalated"]);
export const QM_HOECHSTENS = 20;
// Kennung der Kalender-Automatik (clara/calendarWatch.js).
const AUTOMATIK_PREFIX = "appt-watch:";

function text(v) {
  return v == null ? "" : String(v).trim();
}

function ziffern(v) {
  let out = "";
  for (const z of text(v)) if (z >= "0" && z <= "9") out += z;
  return out;
}

function lieferant(wer) {
  const name = text(wer).toLowerCase();
  return LIEFERANTEN.find((q) => q.toLowerCase() === name) || null;
}

function istAutomatik(update, eventsById) {
  const id = text(update?.eventId);
  if (id.startsWith(AUTOMATIK_PREFIX)) return true;
  return eventsById.get(id)?.channel === "system";
}

/** Kontakte eines Vorgangs ohne die Beobachtungen der Kalender-Automatik. */
function kontakte(c, eventsById) {
  return (Array.isArray(c?.updates) ? c.updates : [])
    .filter((u) => u?.kind === UPDATE_KINDS.CONTACT && !istAutomatik(u, eventsById));
}

/**
 * Wer hat den Vorgang geliefert? Der juengste Kontakt von Bianca, Lisa, Nadine
 * oder Clara. Team-Notizen tragen den Namen der Mitarbeiterin als Urheber und
 * ergeben deshalb keine Quelle (null).
 */
export function quelleVon(c, eventsById = new Map()) {
  const explizit = lieferant(c?.source);
  if (explizit) return explizit;
  const alle = (Array.isArray(c?.updates) ? c.updates : []).filter((u) => u?.kind === UPDATE_KINDS.CONTACT);
  const liste = kontakte(c, eventsById);
  for (let i = liste.length - 1; i >= 0; i -= 1) {
    const wer = lieferant(liste[i].by);
    if (wer) return wer;
  }
  // Von Hand oder per Sprache angelegte Aufgabe ohne jeden Kontakt.
  return alle.length ? null : lieferant(c?.createdBy);
}

function signaleVon(c, eventsById) {
  const out = {};
  let telefon = "";
  for (const id of Array.isArray(c?.eventIds) ? c.eventIds : []) {
    const e = eventsById.get(id);
    if (!e || e.channel === "system") continue;
    for (const [k, v] of Object.entries(e.signals || {})) if (v === true) out[k] = true;
    const ref = text(e.counterparty?.ref);
    if (!telefon && !ref.includes("@") && ziffern(ref).length >= 7) telefon = ref;
  }
  return { signale: out, telefon };
}

/** sofort | heute | normal — oder null, wenn der Vorgang nicht in die Liste gehoert. */
export function einstufen(c, quelle, signale) {
  if (!isActiveStatus(c?.status)) return null;
  if (!quelle) return null;
  const hoch = c.priority === "high" || c.priority === "urgent";
  if (signale.critical || c.topic === TOPICS.COMPLAINT || hoch) return "sofort";
  const wartetAufFreigabe = c.status === "waiting_approval";
  if (wartetAufFreigabe) return "heute";
  // Eine KI-Kollegin arbeitet daran; ihr Ergebnis kommt als neuer Kontakt zurueck.
  if (lieferant(c.assignee)) return null;
  if (quelle === "Nadine") return null;
  if (c.topic === TOPICS.APPOINTMENT) {
    return signale.callbackRequested || signale.needsHuman ? "heute" : null;
  }
  if (c.topic === TOPICS.CALLBACK || signale.callbackRequested || signale.needsHuman || signale.unresolvedByAI) {
    return "heute";
  }
  return "normal";
}

/** Anrufliste, die auf die Freigabe wartet — sonst null. */
function freigabeVon(c, heute) {
  const l = c?.callList;
  if (!l || c.status !== "waiting_approval") return null;
  const datum = text(l.date);
  return {
    art: "anrufliste",
    kandidaten: (Array.isArray(l.candidates) ? l.candidates : []).filter((k) => k && !k.removed).length,
    datum,
    zeit: text(l.slot?.label),
    kalender: text(l.calendarName),
    anlass: text(l.bucketLabel),
    // Eine Liste fuer einen vergangenen Tag wird nicht mehr zur Freigabe angeboten.
    moeglich: !heute || !datum || datum >= heute,
  };
}

function zeile(c, quelle, dringlichkeit, signale, telefon, eventsById, heute) {
  const liste = kontakte(c, eventsById);
  const letzter = liste[liste.length - 1];
  const zuletzt = Number(c.lastContactAt) || tsToMs(c.updatedAt) || 0;
  return {
    id: c.id,
    art: "vorgang",
    quelle,
    dringlichkeit,
    thema: TOPIC_LABELS[c.topic] || TOPIC_LABELS.other,
    name: text(c.subject?.name),
    patientId: text(c.subject?.patientId) || null,
    telefon: telefon || null,
    kurz: text(letzter?.text || c.title).slice(0, 280),
    status: c.status,
    wartetAufFreigabe: c.status === "waiting_approval",
    zustaendig: text(c.assignee) || null,
    kontakte: Number(c.contactCount) || liste.length || 1,
    zuletztMs: zuletzt,
    rueckrufGewuenscht: !!signale.callbackRequested || c.topic === TOPICS.CALLBACK,
    freigabe: freigabeVon(c, heute),
  };
}

/**
 * @param {{cases?:object[], events?:object[], qmJobs?:object[], nowMs?:number, endOfDayMs?:number, heute?:string}} daten
 *   heute = "JJJJ-MM-TT" (Berlin); ohne Angabe gilt jede wartende Anrufliste als freigebbar.
 */
export function baueTagesliste({ cases = [], events = [], qmJobs = [], nowMs = Date.now(), endOfDayMs = nowMs, heute = "" } = {}) {
  const eventsById = new Map();
  for (const e of events) if (e?.id) eventsById.set(e.id, e);

  const patienten = [];
  for (const c of cases) {
    const quelle = quelleVon(c, eventsById);
    const { signale, telefon } = signaleVon(c, eventsById);
    const dringlichkeit = einstufen(c, quelle, signale);
    if (!dringlichkeit) continue;
    patienten.push(zeile(c, quelle, dringlichkeit, signale, telefon, eventsById, heute));
  }
  // Dringendes zuerst, darin das am laengsten Wartende oben.
  patienten.sort((a, b) => RANG[a.dringlichkeit] - RANG[b.dringlichkeit] || a.zuletztMs - b.zuletztMs);

  const qmAlle = [];
  for (const j of qmJobs) {
    if (!QM_OFFEN.has(j?.status)) continue;
    const faellig = Number(j.dueAtMs) || 0;
    if (faellig > endOfDayMs) continue;
    qmAlle.push({
      id: j.id,
      art: "qm",
      quelle: "Julia",
      titel: text(j.title || j.bookKey) || "QM-Aufgabe",
      detail: [text(j.deviceRef), j.cycle ? `Zyklus ${j.cycle}` : ""].filter(Boolean).join(" · "),
      zustaendig: text(j.assignedToName) || null,
      faelligMs: faellig,
      ueberfaellig: j.status === "overdue" || j.status === "escalated" || (faellig > 0 && faellig < nowMs),
      status: j.status,
    });
  }
  // Heutiges zuerst, dann das zuletzt faellig Gewordene. Ein alter Rueckstand
  // wird gezaehlt, aber nicht ausgerollt.
  qmAlle.sort((a, b) => b.faelligMs - a.faelligMs);

  const zaehler = { sofort: 0, heute: 0, normal: 0 };
  for (const p of patienten) zaehler[p.dringlichkeit] += 1;
  return {
    patienten,
    qm: qmAlle.slice(0, QM_HOECHSTENS),
    zaehler: {
      ...zaehler,
      patienten: patienten.length,
      qm: qmAlle.length,
      qmUeberfaellig: qmAlle.filter((q) => q.ueberfaellig).length,
    },
  };
}

/** Laedt die Quellen einzeln weich (eine ausgefallene Quelle leert nur ihren Teil). */
export async function ladeTagesliste(clientId, { nowMs = Date.now(), endOfDayMs = nowMs, heute = "", mitQm = false } = {}) {
  const hinweise = [];
  const weich = async (name, fn) => {
    try {
      return await fn();
    } catch (e) {
      hinweise.push(`${name}:${String(e?.message || e)}`);
      return [];
    }
  };
  const [cases, events, qmJobs] = await Promise.all([
    weich("cases", () => listCases(clientId, { activeOnly: true, limit: 300 })),
    weich("events", () => queryLatest(clientId, nowMs - EVENT_FENSTER_MS, 800)),
    mitQm ? weich("qm", () => qmListCalendar(clientId, { fromMs: 0, toMs: endOfDayMs })) : [],
  ]);
  return { ...baueTagesliste({ cases, events, qmJobs, nowMs, endOfDayMs, heute }), qmAusgeblendet: !mitQm, hinweise };
}
