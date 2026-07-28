// ============================================================================
// Patienten-Dokumente lesen (Chef 29.07.2026): "dokumente kann clara noch
// nicht auslesen und darstellen." Live-Vorfall 00:00 Uhr: Auf "Welche
// Dokumente hat Frau Sablon unterschrieben?" ERFAND das Modell eine Liste
// ("Aufklaerungsgespraech, Abrechnung, Behandlungsplan, Abrechnung,
// Abrechnung") — es gab kein Tool. Dieses Modul liest die ECHTEN
// pdocuments des Patienten (dieselbe Quelle wie anamnese.js) und liefert
// eine ehrliche, gedeckte Antwort + Karte.
//
// Datenmodell (Plattform):
//   clients/{clientId}/locations/{locationId}/patients/{pid}/pdocuments/*
//   Felder u.a.: name, status ("signed" | ...), mandatory, pdfCreatedAt,
//   createdAt, expiresAt, formRows, fileSrc.
//
// Read-only. Das Anzeigen des PDF-INHALTS (Textebene) leistet fuer die
// Anamnese anamnesePdf.js; ein allgemeiner PDF-Viewer haengt am Plattform-
// pdfService und ist ein eigenes Paket — hier geht es um die Auflistung
// (welche Dokumente liegen vor, unterschrieben, seit wann, Pflicht/abgelaufen).
// ============================================================================

import admin from "../firebase.js";
import { loadBooking } from "./booking.js";

function s(v) {
  return v == null ? "" : String(v).trim();
}

/** Timestamp/number/Date -> ms (0 wenn leer). */
function toMs(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toDate === "function") { try { return v.toDate().getTime(); } catch { return 0; } }
  if (v?._seconds) return v._seconds * 1000;
  const p = Date.parse(v);
  return Number.isFinite(p) ? p : 0;
}

/**
 * Alle Dokumente eines Patienten (read-only).
 * @returns {Promise<{ok:boolean, reason?:string, docs:object[],
 *   signedCount:number, totalCount:number}>}
 *   docs[]: { name, signed, status, ms, mandatory, expired }
 */
export async function getPatientDocuments(clientId, { patientId } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return { ok: false, reason: "no_location", docs: [], signedCount: 0, totalCount: 0 };
  const pid = s(patientId);
  if (!pid) return { ok: false, reason: "no_patient", docs: [], signedCount: 0, totalCount: 0 };

  let raw = [];
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("patients").doc(pid)
      .collection("pdocuments").get();
    raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return { ok: false, reason: "read_failed", error: String(e?.message || e), docs: [], signedCount: 0, totalCount: 0 };
  }

  const nowMs = Date.now();
  const docs = raw
    .map((d) => {
      const status = s(d.status).toLowerCase();
      const ms = toMs(d.pdfCreatedAt) || toMs(d.signedAt) || toMs(d.createdAt);
      const expMs = toMs(d.expiresAt);
      return {
        name: s(d.name) || "Dokument",
        status,
        signed: status === "signed" || !!d.pdfCreatedAt,
        ms,
        mandatory: !!d.mandatory,
        expired: expMs > 0 && expMs < nowMs,
      };
    })
    // Nur echte Dokumente (Name vorhanden), nach Datum absteigend.
    .filter((d) => d.name && d.name !== "Dokument")
    .sort((a, b) => b.ms - a.ms);

  return {
    ok: true,
    docs,
    signedCount: docs.filter((d) => d.signed).length,
    totalCount: docs.length,
  };
}

const TZ = "Europe/Berlin";

/** "1783323358000" -> "am 5. März 2026" (leer bei 0). */
function datumLang(ms) {
  if (!ms) return "";
  try {
    return "am " + new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
  } catch { return ""; }
}

/**
 * Ehrliche, gedeckte Sprech-Antwort. NIE etwas behaupten, was die Daten nicht
 * hergeben — genau das war der Halluzinations-Fall.
 */
export function buildSpokenDocuments(result, { who = "der Patient" } = {}) {
  if (!result?.ok) {
    return `Die Dokumente von ${who} kann ich gerade nicht einsehen.`;
  }
  const { docs, signedCount } = result;
  if (!docs.length) {
    return `Zu ${who} sind keine Dokumente hinterlegt.`;
  }
  const signierte = docs.filter((d) => d.signed);
  const offene = docs.filter((d) => !d.signed);

  const teile = [];
  if (signierte.length) {
    const liste = signierte.map((d) => d.name).join(", ");
    teile.push(`${who} hat ${signierte.length === 1 ? "ein unterschriebenes Dokument" : `${signierte.length} unterschriebene Dokumente`}: ${liste}.`);
  } else {
    teile.push(`Zu ${who} liegen ${docs.length === 1 ? "ein Dokument" : `${docs.length} Dokumente`} vor, aber noch nichts Unterschriebenes.`);
  }
  if (offene.length) {
    const pflicht = offene.filter((d) => d.mandatory);
    const liste = offene.map((d) => d.name).join(", ");
    teile.push(`Noch offen: ${liste}${pflicht.length ? " — davon Pflicht" : ""}.`);
  }
  const abgelaufen = docs.filter((d) => d.expired);
  if (abgelaufen.length) {
    teile.push(`Abgelaufen ist: ${abgelaufen.map((d) => d.name).join(", ")}.`);
  }
  // Die Datumsangabe des jüngsten signierten Bogens ist oft nützlich.
  const jung = signierte[0];
  if (jung?.ms) {
    const d = datumLang(jung.ms);
    if (d) teile.push(`Zuletzt unterschrieben: ${jung.name} ${d}.`);
  }
  return teile.join(" ");
}
