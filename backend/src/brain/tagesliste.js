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
// Reihenfolge: Patienten-Vorgaenge zuerst, danach Rechnungen, Mahnungen und
// Fristsachen. Der Bereich kommt aus dem, was am Vorgang und an seinen
// Eintraegen schon steht (Patient zugeordnet, Kennzeichen "rechnung"/"mahnung",
// erkannte Frist) — hier wird kein Text neu gelesen.
//
// "Ich kuemmere mich" (Status in Arbeit) und "Erledigt" nehmen den Vorgang aus
// der offenen Liste. Beides steht im Verlauf des Vorgangs (wer, wann, von, nach)
// und kommt von dort als `uebernommen` bzw. `erledigtHeute` zurueck.
//
// "Spaeter" (zurueckgestellt bis zu einem Zeitpunkt) nimmt den Vorgang ebenfalls
// aus der offenen Liste; er steht solange unter `zurueckgestellt` und kommt danach
// mit dem Vermerk `wiederVorgelegt` zurueck. Ein neuer Kontakt holt ihn sofort zurueck.
//
// Julias QM-Aufgaben sind ein eigener, nachgeordneter Abschnitt. Er ist
// vorerst ausgeblendet (mitQm), bis der Rueckstand bei Julia aufgeraeumt ist.

import { isActiveStatus, TOPICS, TOPIC_LABELS, UPDATE_KINDS, tsToMs } from "./cases.js";
import { listCases } from "./caseStore.js";
import { queryLatest } from "./eventStore.js";
import { MAX_CANDIDATES_PER_LIST } from "../clara/gapFill.js";
import { listCalendar as qmListCalendar } from "../qm/jobs.js";
import { zurueckgestelltVon } from "./zurueckstellen.js";
import { lisaAnrufeFuerSeite } from "./lisaAnrufe.js";

const EVENT_FENSTER_MS = 14 * 24 * 3_600_000;
const LIEFERANTEN = ["Bianca", "Lisa", "Nadine", "Clara"];
const RANG = { sofort: 0, heute: 1, normal: 2 };
const BEREICH_RANG = { patient: 0, rechnung: 1, mahnung: 2, frist: 3, sonstiges: 4 };
const TAG_MS = 24 * 3_600_000;
// Eine Frist, die laenger als das zurueckliegt, gilt als erledigt oder verfallen.
const FRIST_ALT_MS = 30 * TAG_MS;
const FRIST_NAH_MS = 3 * TAG_MS;
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
  const tags = new Set();
  let telefon = "";
  let fristMs = 0;
  let patientKontakt = false;
  for (const id of Array.isArray(c?.eventIds) ? c.eventIds : []) {
    const e = eventsById.get(id);
    if (!e || e.channel === "system") continue;
    for (const [k, v] of Object.entries(e.signals || {})) if (v === true) out[k] = true;
    for (const t of Array.isArray(e.tags) ? e.tags : []) tags.add(text(t).toLowerCase());
    if (e.deadlineStrong === true && Number(e.deadlineMs) > fristMs) fristMs = Number(e.deadlineMs);
    if (e.counterparty?.kind === "patient") patientKontakt = true;
    const ref = text(e.counterparty?.ref);
    if (!telefon && !ref.includes("@") && ziffern(ref).length >= 7) telefon = ref;
  }
  return { signale: out, telefon, tags, fristMs, patientKontakt };
}

/** patient | rechnung | mahnung | frist | sonstiges — aus vorhandenen Feldern. */
export function bereichVon(c, quelle, merkmale = {}) {
  const { signale = {}, tags = new Set(), fristMs = 0, patientKontakt = false } = merkmale;
  if (c?.callList) return "patient";
  if (text(c?.subject?.patientId) || patientKontakt || quelle === "Bianca" || quelle === "Lisa") return "patient";
  if (tags.has("mahnung")) return "mahnung";
  if (tags.has("rechnung") || signale.invoiceOrPayment || signale.billingQuestion || c?.topic === TOPICS.BILLING) return "rechnung";
  if (fristMs) return "frist";
  return "sonstiges";
}

/** sofort | heute | normal — oder null, wenn der Vorgang nicht in die Liste gehoert. */
export function einstufen(c, quelle, signale, { bereich = "", fristMs = 0, nowMs = Date.now(), endOfDayMs = nowMs } = {}) {
  if (!isActiveStatus(c?.status)) return null;
  if (!quelle) return null;
  const hoch = c.priority === "high" || c.priority === "urgent";
  if (signale.critical || c.topic === TOPICS.COMPLAINT || hoch) return "sofort";
  const wartetAufFreigabe = c.status === "waiting_approval";
  if (wartetAufFreigabe) return "heute";
  // Eine KI-Kollegin arbeitet daran; ihr Ergebnis kommt als neuer Kontakt zurueck.
  if (lieferant(c.assignee)) return null;
  if (quelle === "Nadine") {
    // Gewoehnliche Post bleibt draussen; Mahnungen und laufende Fristen nicht.
    if (bereich === "mahnung") return "heute";
    if (fristMs && fristMs >= nowMs - FRIST_ALT_MS) return fristMs <= endOfDayMs + FRIST_NAH_MS ? "heute" : "normal";
    return null;
  }
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
  const aktiv = (Array.isArray(l.candidates) ? l.candidates : []).filter((k) => k && !k.removed);
  return {
    art: "anrufliste",
    kandidaten: aktiv.length,
    // Kontaktiert werden nur die obersten Kandidaten; der Rest rueckt nach.
    anrufe: Math.min(aktiv.length, MAX_CANDIDATES_PER_LIST),
    patienten: aktiv.slice(0, MAX_CANDIDATES_PER_LIST).map((k) => ({
      name: text(k.name) || "Ohne Namen",
      grund: text(k.campaignName) || text(k.visitMotiveName),
      weg: k.consent?.sms === true && k.consent?.reminder !== true ? "SMS" : "Anruf",
    })),
    datum,
    zeit: text(l.slot?.label),
    kalender: text(l.calendarName),
    anlass: text(l.bucketLabel),
    // Eine Liste fuer einen vergangenen Tag wird nicht mehr zur Freigabe angeboten.
    moeglich: !heute || !datum || datum >= heute,
  };
}

function zeile(c, quelle, dringlichkeit, merkmale, eventsById, heute, bereich) {
  const { signale, telefon, fristMs } = merkmale;
  const liste = kontakte(c, eventsById);
  const letzter = liste[liste.length - 1];
  const zuletzt = Number(c.lastContactAt) || tsToMs(c.updatedAt) || 0;
  return {
    id: c.id,
    art: "vorgang",
    quelle,
    dringlichkeit,
    bereich,
    fristMs: fristMs || null,
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

function istMensch(wer) {
  const name = text(wer);
  return !!name && name !== "System" && !lieferant(name);
}

function statusSchritte(c) {
  return (Array.isArray(c?.updates) ? c.updates : []).filter((u) => u?.kind === UPDATE_KINDS.STATUS && u.statusTo);
}

/** Eintrag fuer "uebernommen" / "heute erledigt": der letzte Statusschritt eines Menschen. */
function verlaufZeile(c, quelle, bereich, eventsById) {
  const schritte = statusSchritte(c);
  const letzter = schritte[schritte.length - 1];
  if (!letzter || letzter.statusTo !== c.status || !istMensch(letzter.by)) return null;
  // Rueckgaengig fuehrt auf den letzten Stand, in dem der Vorgang noch offen war.
  let zurueck = "open";
  for (let i = schritte.length - 1; i >= 0; i -= 1) {
    if (isActiveStatus(schritte[i].statusFrom) && schritte[i].statusFrom !== c.status) { zurueck = schritte[i].statusFrom; break; }
  }
  const liste = kontakte(c, eventsById);
  return {
    id: c.id,
    quelle,
    bereich,
    thema: TOPIC_LABELS[c.topic] || TOPIC_LABELS.other,
    name: text(c.subject?.name),
    anrufliste: !!c.callList,
    kurz: text(liste[liste.length - 1]?.text || c.title).slice(0, 200),
    wer: text(letzter.by),
    wannMs: Number(letzter.ts) || 0,
    von: text(letzter.statusFrom) || zurueck,
    nach: c.status,
    zurueck,
  };
}

/**
 * @param {{cases?:object[], events?:object[], qmJobs?:object[], nowMs?:number, endOfDayMs?:number, startOfDayMs?:number, heute?:string}} daten
 *   heute = "JJJJ-MM-TT" (Berlin); ohne Angabe gilt jede wartende Anrufliste als freigebbar.
 */
export function baueTagesliste({ cases = [], events = [], qmJobs = [], nowMs = Date.now(), endOfDayMs = nowMs, startOfDayMs = endOfDayMs - TAG_MS + 1, heute = "" } = {}) {
  const eventsById = new Map();
  for (const e of events) if (e?.id) eventsById.set(e.id, e);

  const patienten = [];
  const uebernommen = [];
  const erledigtHeute = [];
  const zurueckgestellt = [];
  for (const c of cases) {
    const quelle = quelleVon(c, eventsById);
    const merkmale = signaleVon(c, eventsById);
    const bereich = bereichVon(c, quelle, merkmale);
    const lage = { bereich, fristMs: merkmale.fristMs, nowMs, endOfDayMs };
    const aktiv = isActiveStatus(c?.status);
    const zs = aktiv && !c.callList ? zurueckgestelltVon(c, nowMs) : null;
    if (zs?.aktiv) {
      // Nur was ohne die Rueckstellung in der Liste stuende (offen oder vom Team uebernommen).
      const offen = c.status === "in_progress" && !lieferant(c.assignee) ? "open" : c.status;
      if (einstufen({ ...c, status: offen }, quelle, merkmale.signale, lage)) {
        const liste = kontakte(c, eventsById);
        zurueckgestellt.push({
          id: c.id, quelle, bereich, thema: TOPIC_LABELS[c.topic] || TOPIC_LABELS.other, name: text(c.subject?.name),
          kurz: text(liste[liste.length - 1]?.text || c.title).slice(0, 200), status: c.status,
          wer: zs.wer, bisMs: zs.bisMs, seitMs: zs.seitMs, anzahl: zs.anzahl,
        });
      }
      continue;
    }
    const inArbeitBeimTeam = aktiv && c.status === "in_progress" && !c.callList && !lieferant(c.assignee);
    const v = aktiv && !inArbeitBeimTeam ? null : verlaufZeile(c, quelle, bereich, eventsById);
    // In Arbeit ohne erkennbaren Klick eines Menschen bleibt sichtbar — nichts verschwindet still.
    if (aktiv && !v) {
      const dringlichkeit = einstufen(c, quelle, merkmale.signale, lage);
      if (dringlichkeit) {
        const z = zeile(c, quelle, dringlichkeit, merkmale, eventsById, heute, bereich);
        if (zs) z.wiederVorgelegt = { bisMs: zs.bisMs, wer: zs.wer, anzahl: zs.anzahl, neuerKontakt: zs.neuerKontakt };
        patienten.push(z);
      }
      continue;
    }
    if (!v) continue;
    // Nur was vor dem Klick in der Liste gestanden haette, gehoert in den Verlauf.
    if (!einstufen({ ...c, status: v.zurueck }, quelle, merkmale.signale, lage)) continue;
    if (inArbeitBeimTeam) uebernommen.push(v);
    else if (v.wannMs >= startOfDayMs) erledigtHeute.push(v);
  }
  // Patienten zuerst, dann Rechnungen, Mahnungen, Fristsachen; darin Dringendes
  // zuerst und das am laengsten Wartende oben.
  patienten.sort((a, b) => BEREICH_RANG[a.bereich] - BEREICH_RANG[b.bereich]
    || RANG[a.dringlichkeit] - RANG[b.dringlichkeit] || a.zuletztMs - b.zuletztMs);
  uebernommen.sort((a, b) => b.wannMs - a.wannMs);
  erledigtHeute.sort((a, b) => b.wannMs - a.wannMs);
  zurueckgestellt.sort((a, b) => a.bisMs - b.bisMs);

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
    uebernommen,
    erledigtHeute,
    zurueckgestellt,
    qm: qmAlle.slice(0, QM_HOECHSTENS),
    zaehler: {
      ...zaehler,
      patienten: patienten.length,
      zurueckgestellt: zurueckgestellt.length,
      qm: qmAlle.length,
      qmUeberfaellig: qmAlle.filter((q) => q.ueberfaellig).length,
    },
  };
}

/** Laedt die Quellen einzeln weich (eine ausgefallene Quelle leert nur ihren Teil). */
export async function ladeTagesliste(clientId, { nowMs = Date.now(), endOfDayMs = nowMs, startOfDayMs = endOfDayMs - TAG_MS + 1, heute = "", mitQm = false } = {}) {
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
    weich("cases", () => listCases(clientId, { limit: 300 })),
    weich("events", () => queryLatest(clientId, nowMs - EVENT_FENSTER_MS, 800)),
    mitQm ? weich("qm", () => qmListCalendar(clientId, { fromMs: 0, toMs: endOfDayMs })) : [],
  ]);
  // Lisas Anrufe sind ein eigener Abschnitt: dieselben Eintraege, die Bianca beim Rueckruf liest.
  const lisaAnrufe = lisaAnrufeFuerSeite(events, { startOfDayMs });
  return { ...baueTagesliste({ cases, events, qmJobs, nowMs, endOfDayMs, startOfDayMs, heute }), lisaAnrufe, qmAusgeblendet: !mitQm, hinweise };
}
