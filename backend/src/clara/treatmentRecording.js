// Lena-Aufnahme per Sprachbefehl (W-LENA-1, 11.07.2026)
// ===========================================================================
// "Clara, starte/beende die Aufnahme" steuert den Behandlungs-Mitschnitt
// (Lena). Diese Datei kapselt:
//   1. die HALLUZINATIONSFREIE Patientenbindung (pickCurrentAppointment ist
//      rein und wird per Unit-Test abgesichert; der Patient stammt IMMER aus
//      dem echten Kalender, nie aus dem LLM),
//   2. das Schreiben des geteilten Aufnahme-Zustands (treatment/recorder,
//      dieselbe Stelle wie iPad/Handy-Companion und die Lena-Seite),
//   3. eine Live-Follow-Meldung, damit der Praxis-Monitor Lena fuer den Termin
//      oeffnet.
// Clara selbst (Wake/Sleep, Diktat, Briefings) wird davon nicht beruehrt.

import admin from "../firebase.js";
import { emitCommand } from "./sessions.js";

const _BERLIN = "Europe/Berlin";

function _tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (ts?._seconds) return ts._seconds * 1000;
  return 0;
}

/** Gesprochene Uhrzeit eines Termins ("um 14:30 Uhr") oder "". */
export function spokenApptWhen(startMs) {
  if (!startMs) return "";
  try {
    const hm = new Intl.DateTimeFormat("de-DE", {
      timeZone: _BERLIN, hour: "2-digit", minute: "2-digit",
    }).format(new Date(startMs));
    return ` um ${hm} Uhr`;
  } catch {
    return "";
  }
}

/** Name fuer Tageslisten-Abgleich: klein, ohne Anrede/Satzzeichen. */
function _normSpokenName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b(herrn?|frau|fr(?:ä|ae)ulein|hr|fr|dr|prof|doktor|patient(?:in)?)\.?\b/g, " ")
    .replace(/[^a-zäöüß0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reiner Abgleich eines gesprochenen Namens gegen HEUTIGE Termine.
 * Kein Firestore, kein LLM — nie raten. Unit-testbar.
 *
 * @param {Array} appts  getDayAppointments-Form
 * @param {string} spokenName  z.B. "Herrn Meier" / "Meier"
 * @param {string} [hint]  optionaler Hinweis ("der um 10", "Peter")
 * @returns {{matches:Array, reason:string}}
 *   reason: "unique" | "ambiguous" | "none" | "empty_name"
 */
export function matchTodayAppointmentsByName(appts, spokenName, hint = "") {
  const nameQ = _normSpokenName(spokenName);
  if (!nameQ) return { matches: [], reason: "empty_name" };
  const toks = nameQ.split(" ").filter(Boolean);
  const patients = (Array.isArray(appts) ? appts : [])
    .filter((a) => a && !a.isAbsence && a.patientId);
  let matches = patients.filter((a) => {
    const hay = _normSpokenName(`${a.patientName || ""} ${a.patientLastName || ""}`);
    return toks.every((tok) => hay.includes(tok));
  });
  const hintQ = _normSpokenName(hint);
  if (hintQ && matches.length > 1) {
    const hToks = hintQ.split(" ").filter(Boolean);
    const narrowed = matches.filter((a) => {
      const hay = _normSpokenName(
        `${a.patientName || ""} ${a.patientLastName || ""} ${a.visitMotive || ""}`,
      );
      const when = spokenApptWhen(a.startMs).toLowerCase();
      const blob = `${hay} ${when}`;
      return hToks.every((tok) => blob.includes(tok));
    });
    if (narrowed.length) matches = narrowed;
  }
  if (!matches.length) return { matches: [], reason: "none" };
  if (matches.length > 1) return { matches, reason: "ambiguous" };
  return { matches, reason: "unique" };
}

/**
 * Reine Auswahl "wer sitzt gerade im Stuhl?" aus einer Tagesliste.
 * Kein Firestore, kein LLM — deterministisch und unit-testbar.
 *
 * @param {Array} appts   Termine (getDayAppointments-Form: {id, startMs, endMs,
 *                         patientId, patientName, isAbsence, calendarId, ...})
 * @param {number} nowMs  aktuelle Zeit
 * @param {{graceMs?:number, windowMs?:number}} [opts]
 *   graceMs  = wie lange nach endMs ein Termin noch als "laeuft" gilt (Default 15 min)
 *   windowMs = wie nah der naechste/letzte Termin an "jetzt" liegen darf, wenn
 *              gerade keiner laeuft (Default 30 min)
 * @returns {{appointment:Object|null, reason:string, candidates:Array}}
 *   reason: "in_progress" | "nearest" | "ambiguous" | "none"
 *   candidates: bei "ambiguous" die konkurrierenden laufenden Termine
 */
export function pickCurrentAppointment(appts, nowMs, opts = {}) {
  const graceMs = Number.isFinite(opts.graceMs) ? opts.graceMs : 15 * 60 * 1000;
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : 30 * 60 * 1000;
  const now = Number(nowMs) || 0;

  const patients = (Array.isArray(appts) ? appts : [])
    .filter((a) => a && !a.isAbsence && a.patientId && a.startMs);

  if (!patients.length) return { appointment: null, reason: "none", candidates: [] };

  // 1) Laeuft gerade: start <= now <= (end || start+grace) + grace
  const inProgress = patients.filter((a) => {
    const end = a.endMs || (a.startMs + 30 * 60 * 1000);
    return a.startMs <= now && now <= end + graceMs;
  });
  if (inProgress.length === 1) {
    return { appointment: inProgress[0], reason: "in_progress", candidates: [] };
  }
  if (inProgress.length > 1) {
    // Mehrere Behandler behandeln gleichzeitig -> nicht raten, nachfragen.
    return { appointment: null, reason: "ambiguous", candidates: inProgress };
  }

  // 2) Keiner laeuft: der zeitlich naechste Termin (vor ODER nach jetzt) im
  //    Fenster. Bei Gleichstand gewinnt der noch kommende (der "naechste").
  let best = null;
  let bestDist = Infinity;
  for (const a of patients) {
    const dist = Math.abs(a.startMs - now);
    if (dist < bestDist || (dist === bestDist && a.startMs >= now)) {
      best = a;
      bestDist = dist;
    }
  }
  if (best && bestDist <= windowMs) {
    return { appointment: best, reason: "nearest", candidates: [] };
  }
  return { appointment: null, reason: "none", candidates: [] };
}

/**
 * Raum→Termin fuer das gekoppelte iPad (Paket 2b): zuerst eine laufende
 * Aufnahme (activeRecording), sonst "wer sitzt im Stuhl?" aus der Tagesliste.
 * Rein / unit-testbar — kein Firestore.
 *
 * @param {{appointmentId?:string, locationId?:string, patientId?:string, patientName?:string}|null} active
 * @param {Array} appts   Tagesliste (bereits auf den Behandler gefiltert, falls noetig)
 * @param {number} nowMs
 * @param {string} [locationId] Standort der Tagesliste (Fallback, wenn active keins traegt)
 * @returns {{ok:boolean, reason:string, appointmentId:string|null, locationId:string|null,
 *            patientId:string, patientName:string, startMs:number, visitMotive:string,
 *            doctorName:string, candidates:Array}}
 */
export function resolveChairAppointment(active, appts, nowMs, locationId = "") {
  const a = active && typeof active === "object" ? active : null;
  if (a?.appointmentId && a?.locationId) {
    return {
      ok: true,
      reason: "recording",
      appointmentId: String(a.appointmentId),
      locationId: String(a.locationId),
      patientId: String(a.patientId || ""),
      patientName: String(a.patientName || ""),
      startMs: Number(a.startedAtMs) || 0,
      visitMotive: "",
      doctorName: "",
      candidates: [],
    };
  }
  const pick = pickCurrentAppointment(appts, nowMs);
  if (pick.appointment) {
    const p = pick.appointment;
    return {
      ok: true,
      reason: pick.reason,
      appointmentId: String(p.id || ""),
      locationId: String(locationId || p.locationId || ""),
      patientId: String(p.patientId || ""),
      patientName: String(p.patientName || ""),
      startMs: Number(p.startMs) || 0,
      visitMotive: String(p.visitMotive || ""),
      doctorName: String(p.calendarName || p.doctorName || ""),
      candidates: [],
    };
  }
  return {
    ok: false,
    reason: pick.reason || "none",
    appointmentId: null,
    locationId: String(locationId || "") || null,
    patientId: "",
    patientName: "",
    startMs: 0,
    visitMotive: "",
    doctorName: "",
    candidates: Array.isArray(pick.candidates) ? pick.candidates : [],
  };
}

/** Kalender-ID zum Geraete-Behandler finden (exakter Name, sonst Token-Overlap). */
export function matchCalendarId(calendars, doctorName) {
  const q = String(doctorName || "").trim().toLowerCase();
  if (!q) return "";
  const cals = Array.isArray(calendars) ? calendars : [];
  const exact = cals.find((c) => String(c?.name || "").trim().toLowerCase() === q);
  if (exact?.id) return String(exact.id);
  const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
  if (!tokens.length) return "";
  let best = null;
  let bestScore = 0;
  for (const c of cals) {
    const name = String(c?.name || "").trim().toLowerCase();
    if (!name || !c?.id) continue;
    const score = tokens.filter((t) => name.includes(t)).length;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return bestScore > 0 && best?.id ? String(best.id) : "";
}

function recorderRef(clientId, locationId, appointmentId) {
  return admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(appointmentId)
    .collection("treatment").doc("recorder");
}

/**
 * Arzt-Quelle des Standorts (W-LENA-2 Teil 4): "lavalier" (Default, zwei
 * Ansteckmikros am PC) oder "headset" (Shokz ueber Clara -> der Worker tee't
 * die Arzt-Stimme, der PC nimmt nur den Patienten auf). Gespeichert unter
 * clients/{c}/locations/{l}/settings/lenaRecorder.arztSource — dieselbe Stelle,
 * die das Frontend schreibt/liest.
 */
export async function getArztSource(clientId, locationId) {
  if (!clientId || !locationId) return "lavalier";
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("settings").doc("lenaRecorder").get();
    return snap.exists && snap.data()?.arztSource === "headset" ? "headset" : "lavalier";
  } catch {
    return "lavalier";
  }
}

/**
 * Raum-/Patienten-Quelle des Standorts (Kanal-Vertrag Diarisierung):
 * "pc-stereo" (Default), "pc-mono" oder "ipad". Gespeichert unter
 * clients/{c}/locations/{l}/settings/lenaRecorder.raumSource — dieselbe Stelle,
 * die das Frontend schreibt/liest. Steht der Standort auf "ipad", ist das
 * gekoppelte iPad das Raummikro (channel=raum) und der PC nimmt nichts auf.
 */
export async function getRaumSource(clientId, locationId) {
  if (!clientId || !locationId) return "pc-stereo";
  try {
    const snap = await admin.firestore()
      .collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("settings").doc("lenaRecorder").get();
    const v = snap.exists ? snap.data()?.raumSource : "";
    return v === "ipad" || v === "pc-mono" || v === "pc-stereo" ? v : "pc-stereo";
  } catch {
    return "pc-stereo";
  }
}

/**
 * Aufnahme starten: geteilten Recorder-Zustand auf "recording" setzen und den
 * Monitor per Live-Follow zu Lena schicken. Setzt voraus, dass Termin +
 * Patient bereits eindeutig aufgeloest sind (der Aufrufer bindet den Patienten
 * halluzinationsfrei).
 */
export async function startRecordingSession(clientId, { locationId, appointmentId, patientName, patientId, by, mode, forceTee } = {}) {
  if (!clientId || !locationId || !appointmentId) {
    return { ok: false, message: "Mir fehlt der Termin für die Aufnahme." };
  }
  const isDictation = mode === "dictation";
  const now = Date.now();
  await recorderRef(clientId, locationId, appointmentId).set({
    status: "recording",
    command: "",
    commandAtMs: 0,
    deviceId: "clara-voice",
    deviceLabel: isDictation ? "Diktat (Sprachbefehl)" : "Sprachbefehl",
    mode: isDictation ? "dictation" : "recording",
    by: String(by || "Clara").slice(0, 60),
    startedAtMs: now,
    accumMs: 0,
    updatedAtMs: now,
  }, { merge: true });

  // Monitor/Room-PC zu Lena fuer genau diesen Termin schicken (best-effort).
  try {
    await emitCommand(clientId, {
      type: "open_lena_recording",
      appointmentId,
      patientId: patientId || "",
      locationId,
      patientName: patientName || "",
      mode: isDictation ? "dictation" : "recording",
    });
  } catch { /* kein aktiver Monitor -> Recorder-Zustand reicht als Wahrheit */ }

  // Headset-Modus (W-LENA-2 Teil 4): der PC nimmt nur den Patienten auf; die
  // Arzt-Stimme muss der Clara-Worker aus der LiveKit-Session an lena_stt tee'n.
  // Diesen Auftrag geben wir im Tool-Result mit (der Worker liest `lenaTee`).
  // W-LENA-7: Beim reinen Sprach-DIKTAT spricht der Arzt IN Clara (Headset/
  // Telefon) — die Stimme kommt IMMER aus der LiveKit-Session. Deshalb wird der
  // Tee dort erzwungen (forceTee), unabhaengig von der Ansteckmikro-Einstellung.
  // Kanal-Vertrag: Ist das iPad das Raummikro (raumSource="ipad"), nimmt der PC
  // nichts auf — die Arzt-Stimme MUSS dann über den Clara-Tee kommen, sonst gibt
  // es keinen arzt-Kanal. Deshalb den Tee auch in diesem Modus erzwingen.
  const [arztSource, raumSource] = await Promise.all([
    getArztSource(clientId, locationId),
    getRaumSource(clientId, locationId),
  ]);
  const teeActive = forceTee === true || arztSource === "headset" || raumSource === "ipad";
  const lenaTee = teeActive
    ? {
        active: true,
        clientId,
        locationId,
        appointmentId,
        channel: "arzt",
        lang: "de-DE",
        // Headset-Doku: PCM → lena_stt Whisper (Clara-Parakeet bleibt Telefon-STT).
        stt: "whisper",
      }
    : { active: false };

  const who = patientName || "den Patienten";
  return {
    ok: true,
    appointmentId,
    patientName: patientName || "",
    arztSource,
    raumSource,
    lenaTee,
    mode: isDictation ? "dictation" : "recording",
    message: isDictation
      ? `Ich nehme jetzt Ihr Diktat für ${who} auf. Ich starte die Aufnahme.`
      : `Aufnahme läuft für ${who}.`,
  };
}

/** Aufnahme beenden: dem aufnehmenden Geraet Stop signalisieren + Zustand idle. */
export async function stopRecordingSession(clientId, { locationId, appointmentId, patientName, mode } = {}) {
  if (!clientId || !locationId || !appointmentId) {
    return { ok: false, message: "Es läuft gerade keine Aufnahme." };
  }
  const now = Date.now();
  await recorderRef(clientId, locationId, appointmentId).set({
    status: "idle",
    command: "stop",
    commandAtMs: now,
    updatedAtMs: now,
  }, { merge: true });
  const who = patientName ? ` für ${patientName}` : "";
  const wort = mode === "dictation" ? "Diktat" : "Aufnahme";
  // Dem Worker signalisieren, einen etwaigen Arzt-Tee zu beenden (Headset-Modus).
  return { ok: true, appointmentId, lenaTee: { active: false, appointmentId }, message: `${wort} beendet${who}.` };
}
