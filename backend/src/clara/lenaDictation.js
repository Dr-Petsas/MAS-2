// W-LENA-7: Clara als Sprach-Doku-Assistent — Vorlesen, Suchen+Push, Historie,
// Label-Auskunft. Baut auf den vorhandenen Doku-Bausteinen auf (treatmentDoc.js)
// und bindet den Patienten/Termin halluzinationsfrei aus dem echten Kalender.
//
// Speicherpfad bleibt die vorhandene Doppel-Spur:
//   primaer   clients/{c}/locations/{l}/appointments/{a}/dictations/{seg}
//   sekundaer clients/{c}/mas_events (Shared Memory, Kanal lena_doc, 45 Tage)
// Diese Datei LIEST/durchsucht nur (kein neues Schreiben) — Aufnehmen/Ergaenzen/
// Loeschen laufen ueber die bestehenden save-/strike-Diktat-Pfade.

import admin from "../firebase.js";
import { emitCommand } from "./sessions.js";
import {
  resolveAppointmentInfo,
  readAppointmentSegments,
  combineActiveSegments,
} from "./treatmentDoc.js";

const _BERLIN = "Europe/Berlin";

function _tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (ts?._seconds) return ts._seconds * 1000;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function _germanDate(ms) {
  if (!ms) return "";
  return new Intl.DateTimeFormat("de-DE", { timeZone: _BERLIN, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ms));
}

/** Text in Saetze zerlegen (fuer Vorlesen/Suche) — grob, aber robust. */
function _sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * VORLESEN (7b): die Doku eines Termins sprechbar zurueckgeben.
 *  mode "full"    -> kompletter aktiver Doku-Text (verbatim)
 *  mode "last"    -> nur das zuletzt Diktierte (juengstes aktives Segment)
 *  mode "summary" -> knappe Zusammenfassung (Anzahl + erster/letzter Satz)
 * Termin: explizite appointmentId > Patient+Datum > juengster begonnener Termin.
 */
export async function readTreatmentDictation(clientId, { mode = "full", appointmentId, patientId, lastName, date } = {}) {
  const info = await resolveAppointmentInfo(clientId, { appointmentId, patientId, lastName, date });
  if (!info?.ok) return { ok: false, message: info?.message || "Ich konnte keinen passenden Termin finden." };

  let segs;
  try {
    segs = await readAppointmentSegments(clientId, info.locationId, info.appointmentId);
  } catch (e) {
    return { ok: false, message: `Die Dokumentation konnte ich nicht lesen: ${String(e?.message || e)}` };
  }
  const aktiv = (segs || []).filter((s) => !s.struck && String(s.source || "") !== "sophie" && String(s.text || "").trim());
  const who = info.patientName || "diesem Patienten";
  const wann = info.apptStartMs ? ` vom ${_germanDate(info.apptStartMs)}` : "";
  if (!aktiv.length) {
    return { ok: true, empty: true, appointmentId: info.appointmentId, message: `Zu ${who}${wann} ist noch nichts dokumentiert.` };
  }

  if (mode === "last") {
    const letzter = aktiv[aktiv.length - 1];
    return { ok: true, appointmentId: info.appointmentId, message: `Zuletzt diktiert: ${String(letzter.text || "").trim()}` };
  }

  const full = combineActiveSegments(aktiv);
  if (mode === "summary") {
    const saetze = _sentences(full);
    const kopf = `Zu ${who}${wann}: ${aktiv.length} ${aktiv.length === 1 ? "Eintrag" : "Einträge"}.`;
    if (!saetze.length) return { ok: true, appointmentId: info.appointmentId, message: kopf };
    const erster = saetze[0];
    const letzter = saetze[saetze.length - 1];
    const kern = saetze.length === 1 ? erster : `${erster} … ${letzter}`;
    return { ok: true, appointmentId: info.appointmentId, message: `${kopf} ${kern}` };
  }

  // full (Default): kompletter Text, sanft gedeckelt (nicht endlos vorlesen).
  const text = full.length > 1500 ? full.slice(0, 1497) + "…" : full;
  return { ok: true, appointmentId: info.appointmentId, message: `Doku zu ${who}${wann}: ${text}` };
}

/**
 * SUCHE + PUSH (7e): eine Aussage in der Termin-Doku finden und die Fundstelle
 * (Patientenname, Datum, Textpassage) per Live-Follow an den Monitor pushen.
 * Sucht standardmaessig im aktuell aufgeloesten Termin; mit `date` in dem des
 * Tages. Deterministisch (Wortueberlappung), kein LLM.
 */
export async function findInTreatment(clientId, { query, appointmentId, patientId, lastName, date, push = true } = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, message: "Wonach soll ich in der Doku suchen?" };

  const info = await resolveAppointmentInfo(clientId, { appointmentId, patientId, lastName, date });
  if (!info?.ok) return { ok: false, message: info?.message || "Ich konnte keinen passenden Termin finden." };

  let segs;
  try {
    segs = await readAppointmentSegments(clientId, info.locationId, info.appointmentId);
  } catch (e) {
    return { ok: false, message: `Die Dokumentation konnte ich nicht lesen: ${String(e?.message || e)}` };
  }
  const aktiv = (segs || []).filter((s) => !s.struck && String(s.source || "") !== "sophie" && String(s.text || "").trim());
  const who = info.patientName || "diesem Patienten";
  const wann = info.apptStartMs ? _germanDate(info.apptStartMs) : "";

  const qWords = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  let best = null;
  let bestScore = 0;
  for (const s of aktiv) {
    for (const satz of _sentences(s.text)) {
      const low = satz.toLowerCase();
      let score = 0;
      if (low.includes(q.toLowerCase())) score += 100; // Volltreffer der Phrase
      for (const w of qWords) if (low.includes(w)) score += 1;
      if (score > bestScore) { bestScore = score; best = satz; }
    }
  }
  if (!best || bestScore === 0) {
    return { ok: true, found: false, appointmentId: info.appointmentId, message: `Zu „${q}" finde ich bei ${who}${wann ? ` (${wann})` : ""} nichts in der Dokumentation.` };
  }

  const treffer = { patientName: who, dateMs: info.apptStartMs || 0, dateLabel: wann, passage: best, appointmentId: info.appointmentId, query: q };
  if (push) {
    // Fundstelle an den Monitor pushen (Chef sieht Patient/Datum/Passage).
    try {
      await emitCommand(clientId, {
        type: "lena_find_result",
        appointmentId: info.appointmentId,
        patientId: info.patientId || "",
        locationId: info.locationId,
        patientName: who,
        dateMs: info.apptStartMs || 0,
        query: q,
        passage: best,
      });
    } catch { /* kein aktiver Monitor -> die gesprochene Antwort reicht */ }
  }
  return {
    ok: true,
    found: true,
    ...treffer,
    message: `Gefunden bei ${who}${wann ? ` am ${wann}` : ""}: „${best}". Die Stelle habe ich dir auf den Bildschirm gelegt.`,
  };
}

/**
 * LABEL-AUSKUNFT (7d, Lesen): die aktuell fuer den Termin geplanten
 * Behandlungen (Sophie-Plan `sophiePlan.terminGrund`) vorlesen. Ergaenzen/
 * Loeschen von Labels laeuft architektur-konform ueber Diktat-Ergaenzung
 * (save_treatment_dictation) bzw. Streichen (strike_treatment_dictation) —
 * Sophie leitet die Labels/Ziffern daraus ab (Lena bestimmt keine Ziffern).
 */
export async function readTreatmentLabels(clientId, { appointmentId, patientId, lastName, date } = {}) {
  const info = await resolveAppointmentInfo(clientId, { appointmentId, patientId, lastName, date });
  if (!info?.ok) return { ok: false, message: info?.message || "Ich konnte keinen passenden Termin finden." };
  const who = info.patientName || "diesem Patienten";
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(info.locationId)
      .collection("appointments").doc(info.appointmentId).get();
    const sp = snap.exists ? snap.data()?.sophiePlan : null;
    const grund = String(sp?.terminGrund || "").trim();
    if (grund) {
      return { ok: true, appointmentId: info.appointmentId, message: `Für ${who} sind geplant: ${grund}.` };
    }
    const n = Array.isArray(sp?.absichten) ? sp.absichten.length : 0;
    if (n) return { ok: true, appointmentId: info.appointmentId, message: `Für ${who} sind ${n} Behandlungen geplant.` };
    return { ok: true, empty: true, appointmentId: info.appointmentId, message: `Für ${who} ist noch keine Behandlung an Sophie übergeben. Die Labels erkennt Lena aus der Aufnahme.` };
  } catch (e) {
    return { ok: false, message: `Den Plan konnte ich nicht lesen: ${String(e?.message || e)}` };
  }
}
