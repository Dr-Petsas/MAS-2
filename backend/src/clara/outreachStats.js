// Kontakt-Zaehler + Konversions-Gedaechtnis pro Patient (Chef 28.07.2026):
// "angerufene oder angesimste patienten muessen einen laufenden zaehler
//  bekommen (sichtbar als hochgestellte zahl) ... eine gesamtkontaktzahl und
//  eine gruene zahl wo das funktioniert hat. dadurch ranken wir unsere
//  patienten und achten auf spam. ausserdem muss nach termin ueber dieses
//  verfahren der patient aus dem recallbucket gestrichen und neu sortiert
//  werden."
//
// clients/{clientId}/mas_patient_outreach/{patientId}:
//   { patientId, name, phoneNorm,
//     contacts,            // Gesamtzahl aller Kontaktversuche (Anruf + SMS)
//     booked,              // wie oft ein Kontakt zu einem Termin fuehrte
//     recentContactsMs[],  // Zeitstempel der letzten Kontakte (fuer Fenster)
//     lastContactMs, lastContactChannel,
//     lastBookedMs, lastBookedVia }
//
// Verwendung:
//   - ANZEIGE  hochgestellte Zahlen am Namen ("Maria Ackermann ⁵ ✓²")
//   - RANKING  wenige juengste Kontakte zuerst (Spam-Schutz), Bucher bevorzugt
//   - BUCKET   nach Buchung wird der Patient fuer BOOKED_SUPPRESS_DAYS aus
//              allen Kandidaten-Listen genommen ("aus dem Bucket gestrichen");
//              die Neu-Einsortierung uebernimmt der Recaller der Plattform
//              anhand des NEUEN Termins.
//
// Die Zaehler sind MAS-eigene Daten (mas_*) — Plattform-Kollektionen werden
// hier nicht beschrieben. Einzige Ausnahme (markConverted): das Konversions-
// Flag appointmentMade am Kampagnen-Patienten, das die Kampagnen-Buckets der
// Plattform selbst als "raus aus dem Bucket" definieren (gapFill liest es
// bereits genau so). Es wird NUR gesetzt, wenn wirklich fest gebucht wurde.

import admin from "../firebase.js";
import { db } from "../firebase.js";
import { masCollection } from "../tenant.js";
import { log } from "../log.js";

function statsCol(clientId) {
  return masCollection(clientId, "mas_patient_outreach");
}

function s(v) {
  return v == null ? "" : String(v).trim();
}

/** Nach einer Buchung so lange kein neuer Recall-Vorschlag fuer den Patienten. */
export const BOOKED_SUPPRESS_DAYS = Number(process.env.MAS_OUTREACH_BOOKED_SUPPRESS_DAYS || 60);
/** Ab so vielen erfolglosen Kontakten im Fenster gilt: Spam-Gefahr, aussortieren. */
export const SPAM_MAX_CONTACTS = Number(process.env.MAS_OUTREACH_SPAM_MAX || 3);
/** Fenster fuer die Spam-Betrachtung (juengste Kontakte). */
export const SPAM_WINDOW_DAYS = Number(process.env.MAS_OUTREACH_SPAM_WINDOW_DAYS || 90);

const RECENT_CAP = 20;

/** Kontaktversuch protokollieren (Anruf gestartet oder SMS raus). */
export async function recordContact(clientId, { patientId, name, phoneNorm, channel } = {}) {
  const id = s(patientId);
  if (!id) return; // ohne Patienten-Id kein Zaehler (z. B. freier Kontakt)
  const now = Date.now();
  try {
    const payload = {
      patientId: id,
      contacts: admin.firestore.FieldValue.increment(1),
      recentContactsMs: admin.firestore.FieldValue.arrayUnion(now),
      lastContactMs: now,
      lastContactChannel: s(channel) || "call",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (s(name)) payload.name = s(name);
    if (s(phoneNorm)) payload.phoneNorm = s(phoneNorm);
    await statsCol(clientId).doc(id).set(payload, { merge: true });
  } catch (e) {
    log.warn("outreach.record_contact_failed", { clientId, patientId: id, error: String(e?.message || e) });
    return;
  }
  // Fenster-Liste gedeckelt halten (Doc bleibt klein; best effort).
  try {
    const snap = await statsCol(clientId).doc(id).get();
    const arr = snap.data()?.recentContactsMs || [];
    if (Array.isArray(arr) && arr.length > RECENT_CAP) {
      await statsCol(clientId).doc(id).update({
        recentContactsMs: arr.sort((a, b) => b - a).slice(0, RECENT_CAP),
      });
    }
  } catch { /* Deckel ist Kosmetik */ }
}

/** Erfolg protokollieren: ein Kontakt ueber diese Strecke fuehrte zum Termin. */
export async function recordBooked(clientId, { patientId, name, via } = {}) {
  const id = s(patientId);
  if (!id) return;
  try {
    const payload = {
      patientId: id,
      booked: admin.firestore.FieldValue.increment(1),
      lastBookedMs: Date.now(),
      lastBookedVia: s(via) || "unbekannt",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (s(name)) payload.name = s(name);
    await statsCol(clientId).doc(id).set(payload, { merge: true });
  } catch (e) {
    log.warn("outreach.record_booked_failed", { clientId, patientId: id, error: String(e?.message || e) });
  }
}

/**
 * Nach fester Buchung: Patient aus dem Recall-Bucket streichen.
 *  - Ledger (lastBookedMs) unterdrueckt ihn sofort in ALLEN Kandidaten-Quellen
 *    (auch virtuelle Recalls, deren Plattform-Platzhalter wir nicht anfassen).
 *  - Kampagnen-Bucket: appointmentMade=true am Kampagnen-Patienten — dasselbe
 *    Flag, mit dem die Plattform Konversionen zaehlt und das gapFill als
 *    "schon konvertiert" ausblendet. Neu einsortiert wird der Patient von der
 *    Plattform-Recall-Logik anhand seines NEUEN Termins.
 */
export async function markConverted(clientId, {
  patientId, name, via, source, campaignId, locationId,
} = {}) {
  await recordBooked(clientId, { patientId, name, via });
  if (s(source) !== "campaign" || !s(campaignId) || !s(locationId) || !s(patientId)) return;
  try {
    await db.collection("clients").doc(clientId)
      .collection("locations").doc(s(locationId))
      .collection("campaigns").doc(s(campaignId))
      .collection("patients").doc(s(patientId))
      .set({
        appointmentMade: true,
        appointmentMadeAt: admin.firestore.FieldValue.serverTimestamp(),
        appointmentMadeVia: s(via) || "clara_recall",
      }, { merge: true });
    log.info("outreach.campaign_converted", { clientId, campaignId: s(campaignId), patientId: s(patientId) });
  } catch (e) {
    log.warn("outreach.campaign_convert_failed", {
      clientId, campaignId: s(campaignId), patientId: s(patientId), error: String(e?.message || e),
    });
  }
}

/** Zaehler fuer eine Menge Patienten laden -> Map patientId -> stats. */
export async function loadStatsMap(clientId, patientIds = []) {
  const ids = [...new Set(patientIds.map(s).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  try {
    const refs = ids.map((id) => statsCol(clientId).doc(id));
    const snaps = await admin.firestore().getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) map.set(snap.id, normStats(snap.data()));
    }
  } catch (e) {
    log.warn("outreach.load_stats_failed", { clientId, error: String(e?.message || e) });
  }
  return map;
}

export function normStats(d = {}) {
  const recent = Array.isArray(d.recentContactsMs) ? d.recentContactsMs.filter((x) => Number(x) > 0) : [];
  return {
    contacts: Number(d.contacts) || 0,
    booked: Number(d.booked) || 0,
    recentContactsMs: recent,
    lastContactMs: Number(d.lastContactMs) || 0,
    lastBookedMs: Number(d.lastBookedMs) || 0,
  };
}

/** Kontakte im Spam-Fenster (juengste N Tage). */
export function contactsInWindow(stats, { days = SPAM_WINDOW_DAYS, now = Date.now() } = {}) {
  const since = now - days * 86400000;
  return (stats?.recentContactsMs || []).filter((ms) => ms >= since).length;
}

/** Frisch gebucht ueber diese Strecke -> raus aus allen Vorschlagslisten? */
export function isBookedSuppressed(stats, { now = Date.now() } = {}) {
  const last = Number(stats?.lastBookedMs) || 0;
  return last > 0 && (now - last) < BOOKED_SUPPRESS_DAYS * 86400000;
}

/** Spam-Wache: viele juengste Kontakte, aber noch nie gebucht -> aussortieren. */
export function isSpamRisk(stats, { now = Date.now() } = {}) {
  if (!stats) return false;
  return contactsInWindow(stats, { now }) >= SPAM_MAX_CONTACTS && (Number(stats.booked) || 0) === 0;
}

// --- Anzeige: hochgestellte Zahlen am Namen ---------------------------------

const SUP_DIGITS = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

export function supZahl(n) {
  return String(Math.max(0, Math.trunc(Number(n) || 0)))
    .split("").map((d) => SUP_DIGITS[d] ?? "").join("");
}

/**
 * "Maria Ackermann ⁵ ✓²" — Gesamtkontakte hochgestellt, dahinter die
 * Erfolgszahl mit Haken (die "gruene" Zahl; Karten fuehren die Rohwerte
 * zusaetzlich strukturiert mit, damit die App sie farbig rendern kann).
 */
export function nameMitZaehler(name, stats) {
  const n = s(name) || "Unbekannt";
  const c = Number(stats?.contacts) || 0;
  const b = Number(stats?.booked) || 0;
  if (c <= 0 && b <= 0) return n;
  return b > 0 ? `${n} ${supZahl(c)} ✓${supZahl(b)}` : `${n} ${supZahl(c)}`;
}
