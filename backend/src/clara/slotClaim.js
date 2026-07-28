// Online-Zusage fuer Recall-/Lueckenfueller-SMS (Chef 28.07.2026):
// "fuer die sms braeuchten wir eine html seite wo die zusagen koennen, und dann
//  muss bei der ersten zusage die luecke geschlossen werden."
//
// Jede Recall-SMS bekommt einen Link auf eine oeffentliche Zusage-Seite
// (/z/<clientId>/<token>). Der Token ist das Ticket: 96 Bit Zufall, gilt fuer
// GENAU EINEN Kandidaten und GENAU EINEN Slot, laeuft mit Slot-Beginn ab.
//
// ERSTE ZUSAGE GEWINNT: Die Reservierung laeuft als Firestore-Transaktion
// ueber das Case-Dokument (callList.slotClaim). Nur wer die Reservierung
// setzt, bucht; alle spaeteren Klicker sehen "schon vergeben". Die Buchung
// selbst geht ueber commitBooking (masBookAppointment) — derselbe Weg, den
// auch Lisas Telefon-Zusagen nehmen (recallCoach.bookAcceptedCandidate).
//
// Testlauf-Sicherheit: Traegt der Claim ein testTarget (Umleitungs-Testlauf,
// testRedirect.js), wird NICHT der echte Patient gebucht, sondern der
// Testpatient — kein echter Patient bekommt einen Termin, den er nie bestellt
// hat. Die Case-Notiz benennt das ausdruecklich.

import { randomBytes } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { commitBooking } from "./agentBooking.js";
import { addUpdate, setStatus } from "../brain/caseStore.js";
import { CASE_STATUS } from "../brain/cases.js";
import { emitCommand } from "./sessions.js";
import { markConverted } from "./outreachStats.js";
import { log } from "../log.js";

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4000").trim().replace(/\/+$/, "");

function claimsCol(clientId) {
  return masCollection(clientId, "mas_slot_claims");
}

function casesCol(clientId) {
  return masCollection(clientId, "mas_cases");
}

function s(v) {
  return v == null ? "" : String(v).trim();
}

/** 16 Zeichen base64url = 96 Bit Zufall — nicht erratbar, SMS-tauglich kurz. */
export function newClaimToken() {
  return randomBytes(12).toString("base64url");
}

export function claimUrlFor(clientId, token) {
  return `${PUBLIC_BASE_URL}/z/${encodeURIComponent(clientId)}/${token}`;
}

/**
 * Legt das Zusage-Ticket fuer EINEN Kandidaten an. Alles, was die oeffentliche
 * Seite spaeter zeigt oder braucht, steht IM Claim — die Seite liest genau ein
 * Dokument und gibt nur die Daten preis, die auch in der SMS standen.
 */
export async function createSlotClaim(clientId, {
  caseId, patientId, patientName, phone, visitMotiveId, visitMotiveName,
  topicLabel, calendarId, calendarName, date, timeLabel, slotIso,
  practiceName, practicePhone, testTarget = null,
  source = "", campaignId = "", recallAppointmentId = "", locationId = "",
} = {}) {
  const token = newClaimToken();
  // Zusagen sind bis Slot-Beginn moeglich; danach ist das Angebot vorbei.
  const expMs = new Date(slotIso).getTime() || (Date.now() + 24 * 3600 * 1000);
  const doc = {
    token,
    caseId: s(caseId),
    patientId: s(patientId),
    patientName: s(patientName),
    phone: s(phone),
    visitMotiveId: s(visitMotiveId),
    visitMotiveName: s(visitMotiveName),
    topicLabel: s(topicLabel),
    calendarId: s(calendarId),
    calendarName: s(calendarName),
    date: s(date),
    timeLabel: s(timeLabel),
    slotIso: s(slotIso),
    practiceName: s(practiceName),
    practicePhone: s(practicePhone),
    // Herkunft fuer die Bucket-Streichung nach der Buchung (markConverted):
    // Kampagnen-Patient -> appointmentMade; virtueller Recall -> Ledger.
    source: s(source),
    campaignId: s(campaignId),
    recallAppointmentId: s(recallAppointmentId),
    locationId: s(locationId),
    status: "open", // open | booked | declined | gone | failed
    testTarget: testTarget && testTarget.patientId
      ? { patientId: s(testTarget.patientId), name: s(testTarget.name) }
      : null,
    bookedAppointmentId: null,
    answeredAt: null,
    createdMs: Date.now(),
    expMs,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await claimsCol(clientId).doc(token).set(doc);
  return { token, url: claimUrlFor(clientId, token) };
}

export async function loadClaim(clientId, token) {
  const t = s(token);
  if (!t || t.length > 64) return null;
  const snap = await claimsCol(clientId).doc(t).get().catch(() => null);
  return snap?.exists ? snap.data() : null;
}

/** Der Minuten-genaue Slot-Schluessel, mit dem auch der Sweep vergleicht. */
function slotKey(iso) {
  return s(iso).slice(0, 16);
}

/** Ist der Gap-Slot laut Case schon vergeben (egal ueber welchen Kanal)? */
function caseSlotTaken(caseData, gapSlotIso, ownToken) {
  const claim = caseData?.callList?.slotClaim;
  if (claim?.token && claim.token !== ownToken) return true;
  if (caseData?.status === CASE_STATUS.RESOLVED) return true;
  const key = slotKey(gapSlotIso);
  return (caseData?.callList?.candidates || []).some(
    (x) => x.contact?.outcome === "booked" &&
      (!x.contact.bookedSlotIso || slotKey(x.contact.bookedSlotIso) === key)
  );
}

/** Kandidaten-Eintrag am Case fortschreiben (per claimToken zugeordnet). */
async function writeCandidateOutcome(clientId, claim, outcome, extra = {}) {
  const ref = casesCol(clientId).doc(claim.caseId);
  const snap = await ref.get().catch(() => null);
  if (!snap?.exists) return;
  const c = snap.data();
  const candidates = [...(c.callList?.candidates || [])];
  let changed = false;
  for (let i = 0; i < candidates.length; i++) {
    const contact = candidates[i].contact;
    if (!contact || contact.claimToken !== claim.token) continue;
    // Telefon-Ergebnisse "booked"/"complaint" nie durch SMS-Antworten ueberschreiben.
    if (contact.outcome === "booked" || contact.outcome === "complaint") return;
    candidates[i] = { ...candidates[i], contact: { ...contact, outcome, ...extra } };
    changed = true;
    break;
  }
  if (changed) {
    await ref.update({
      "callList.candidates": candidates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Zusage: erst Reservierung (Transaktion, erste gewinnt), dann feste Buchung.
 * Rueckgabe ist ein Seiten-Zustand: booked | gone | expired | failed | unknown.
 */
export async function acceptClaim(clientId, token) {
  const db = admin.firestore();
  const claimRef = claimsCol(clientId).doc(s(token));

  let claim = null;
  let verdict = null; // vorzeitiges Urteil aus der Transaktion

  try {
    await db.runTransaction(async (tx) => {
      const claimSnap = await tx.get(claimRef);
      if (!claimSnap.exists) { verdict = "unknown"; return; }
      claim = claimSnap.data();

      if (claim.status === "booked") { verdict = "booked"; return; }
      if (claim.status === "gone") { verdict = "gone"; return; }
      // "booking" = paralleler Klick derselben Person hat die Reservierung
      // schon; die Buchung laeuft. Fuer den Patienten zaehlt: reserviert.
      if (claim.status === "booking") { verdict = "booked"; return; }
      if (Date.now() > (claim.expMs || 0)) { verdict = "expired"; return; }

      const caseRef = casesCol(clientId).doc(claim.caseId);
      const caseSnap = await tx.get(caseRef);
      if (!caseSnap.exists) { verdict = "unknown"; return; }
      const caseData = caseSnap.data();

      if (caseSlotTaken(caseData, claim.slotIso, claim.token)) {
        tx.update(claimRef, { status: "gone", answeredAt: Date.now() });
        verdict = "gone";
        return;
      }

      // DIE Reservierung: atomar am Case — nur eine Transaktion gewinnt.
      tx.update(caseRef, {
        "callList.slotClaim": { token: claim.token, at: Date.now(), name: claim.patientName || "" },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(claimRef, { status: "booking", answeredAt: Date.now() });
    });
  } catch (e) {
    log.warn("slotclaim.tx_failed", { clientId, token: s(token), error: String(e?.message || e) });
    return { state: "failed", claim };
  }
  if (verdict) return { state: verdict, claim };

  // Reservierung steht — jetzt fest buchen. Im Umleitungs-Testlauf wird der
  // TESTPATIENT gebucht (nie der echte Patient, der von nichts weiss).
  const bookPatientId = claim.testTarget?.patientId || claim.patientId;
  const bookPatientName = claim.testTarget?.name || claim.patientName;
  let booked = null;
  try {
    booked = await commitBooking(clientId, {
      patientId: bookPatientId,
      calendarId: claim.calendarId,
      visitMotiveId: claim.visitMotiveId,
      slotIso: claim.slotIso,
    });
  } catch (e) {
    booked = { ok: false, error: String(e?.message || e) };
  }

  if (booked?.ok && booked.booked) {
    await claimRef.update({
      status: "booked",
      bookedAppointmentId: booked.appointmentId || null,
    }).catch(() => {});
    await writeCandidateOutcome(clientId, claim, "booked", {
      bookedSlotIso: claim.slotIso, bookedVia: "sms_web",
    }).catch(() => {});
    const testHinweis = claim.testTarget?.patientId
      ? ` (TESTLAUF: gebucht wurde der Testpatient ${bookPatientName}, nicht ${claim.patientName})`
      : "";
    await addUpdate(clientId, claim.caseId, {
      by: "Recall-Coach",
      kind: "note",
      text: `GEBUCHT (Online-Zusage): ${claim.patientName} hat per SMS-Link zugesagt — Termin am ${claim.date} ${claim.timeLabel} Uhr bei ${claim.calendarName || ""} ist fest eingetragen.${testHinweis}`,
    }).catch(() => {});
    await setStatus(clientId, claim.caseId, CASE_STATUS.RESOLVED, {
      by: "Recall-Coach",
      note: "Lücke gefüllt — Termin über Online-Zusage gebucht.",
    }).catch(() => {});
    await emitCommand(clientId, {
      type: "appointment_created",
      date: claim.date,
      slotIso: claim.slotIso,
      calendarId: claim.calendarId,
      calendarName: claim.calendarName,
      patient: { firstName: "", lastName: bookPatientName },
      visitMotiveName: claim.visitMotiveName || null,
    }).catch(() => {});
    // Zaehler (gruene Erfolgszahl) + Bucket-Streichung — NUR im Echtbetrieb:
    // im Testlauf hat der echte Patient weder zugesagt noch gebucht.
    if (!claim.testTarget?.patientId) {
      await markConverted(clientId, {
        patientId: claim.patientId,
        name: claim.patientName,
        via: "sms_zusage",
        source: claim.source,
        campaignId: claim.campaignId,
        locationId: claim.locationId,
      }).catch(() => {});
    }
    log.info("slotclaim.booked", { clientId, caseId: claim.caseId, token: claim.token, test: !!claim.testTarget });
    return { state: "booked", claim: { ...claim, status: "booked" } };
  }

  // Buchung fehlgeschlagen -> Reservierung freigeben (Slot ist real noch frei)
  // und das Team alarmieren; der Patient wartet auf seine Bestaetigung.
  await claimRef.update({ status: "failed" }).catch(() => {});
  await casesCol(clientId).doc(claim.caseId).update({
    "callList.slotClaim": admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch(() => {});
  await addUpdate(clientId, claim.caseId, {
    by: "Recall-Coach",
    kind: "note",
    text: `ACHTUNG: ${claim.patientName} hat per SMS-Link zugesagt, aber die automatische Buchung schlug fehl (${booked?.error || (booked?.needsPhone ? "needs_phone" : "unbekannt")}). Bitte SOFORT zurückrufen und den Termin ${claim.date} ${claim.timeLabel} Uhr eintragen — der Patient wartet auf seine Bestätigung.`,
  }).catch(() => {});
  log.warn("slotclaim.book_failed", { clientId, caseId: claim.caseId, token: claim.token, error: booked?.error || "" });
  return { state: "failed", claim };
}

/** Absage ueber die Seite: protokollieren, Slot bleibt fuer andere offen. */
export async function declineClaim(clientId, token) {
  const claim = await loadClaim(clientId, token);
  if (!claim) return { state: "unknown", claim: null };
  if (claim.status === "booked" || claim.status === "booking") return { state: "booked", claim };
  if (claim.status === "gone") return { state: "gone", claim };
  await claimsCol(clientId).doc(claim.token).update({
    status: "declined",
    answeredAt: Date.now(),
  }).catch(() => {});
  await writeCandidateOutcome(clientId, claim, "declined", { declinedVia: "sms_web" }).catch(() => {});
  await addUpdate(clientId, claim.caseId, {
    by: "Recall-Coach",
    kind: "note",
    text: `${claim.patientName} hat über den SMS-Link abgesagt — kein Interesse an dem Slot.`,
  }).catch(() => {});
  return { state: "declined", claim: { ...claim, status: "declined" } };
}
