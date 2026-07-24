// Behandlungs-Companion (iPad/Handy am Behandlungsstuhl) — PUBLIC Endpunkte.
//
// Die Diktier-Seite der Plattform (/dictate/<client>/<location>/<appointment>)
// wird per QR-Code auf einem NICHT eingeloggten Geraet geoeffnet. Damit dieses
// Geraet trotzdem live mit der Praxis zusammenspielen kann (LED "iPad
// verbunden" auf der Lena-Seite, geteilter Aufnahme-Zustand, Diktat-Dialog),
// laufen Presence + Zustand ueber diese Routen mit dem Admin SDK — die
// Firestore-Rules verlangen fuer Direktzugriff Auth, die das Geraet nicht hat.
//
// Vertrauensmodell: Der QR-Link enthaelt clientId + locationId + appointmentId,
// drei nicht erratbare IDs — der Link IST das Zugangsticket. Exakt dasselbe
// Modell wie die bestehende oeffentliche Cloud Function
// submitTreatmentDictation der Plattform (dort werden Segmente ohne Auth
// geschrieben). Es wird nur der Behandlungs-Kontext EINES Termins offengelegt.
//
// Firestore-Layout (unter dem Termin, wie die Plattform):
//   .../appointments/{a}/treatment/recorder   geteilter Aufnahme-Zustand
//   .../appointments/{a}/treatment/companion  Presence des gekoppelten Geraets
//   .../appointments/{a}/dictations/{id}      Diktat-/Doku-Segmente

import express from "express";
import admin from "./../firebase.js";
import { AUTH_ENFORCED } from "../auth.js";
import {
  structureTreatment,
  billTreatment,
  flagSmalltalk,
  refreshTemplateFields,
  finalizeTreatmentDoc,
} from "../lena/lenaDoc.js";
import { deleteEventsByIdPrefix } from "../brain/eventStore.js";
import { identifyByDevice } from "../clara/devices.js";
import { getActiveRecording } from "../clara/sessions.js";
import { getDayAppointments, todayBerlin } from "../clara/daySchedule.js";
import { resolveChairAppointment, matchCalendarId } from "../clara/treatmentRecording.js";
import { getPatientAnamnese, clip } from "../clara/anamnese.js";
import { chat, strongLlm } from "../mail/llm.js";
import { buildLlmContext as domainLlmContext, resolveSpec } from "../lena/domainKnowledge.js";
import { listPatientNamesForStt } from "../clara/sttPatientNames.js";

// React-Frontend (Firebase Hosting) — dort liegt /dictate/... fuer die Lena-iframe.
const PLATFORM_WEB_URL = (process.env.PLATFORM_WEB_URL || "https://docgenda.web.app").replace(/\/+$/, "");

const router = express.Router();

const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

// lena_stt (Live-Korrektur-Korpus): dort liegt das kurzlebige WAV je Aeusserung.
// Gleiche Annahme wie routes/training.js — MAS laeuft neben lena_stt (127.0.0.1).
const LENA_STT_PORT = Number(process.env.LENA_STT_PORT || 8140);
const LENA_STT_BASE = (process.env.LENA_STT_BASE || `http://127.0.0.1:${LENA_STT_PORT}`).replace(/\/+$/, "");
const AUDIO_ID_RE = /^[0-9a-f]{8,64}$/;

function apptRef(clientId, locationId, appointmentId) {
  return admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(appointmentId);
}

function readIds(req) {
  const clientId = String(req.body?.clientId || req.query?.clientId || "").trim();
  const locationId = String(req.body?.locationId || req.query?.locationId || "").trim();
  const appointmentId = String(req.body?.appointmentId || req.query?.appointmentId || "").trim();
  if (!ID_RE.test(clientId) || !ID_RE.test(locationId) || !ID_RE.test(appointmentId)) return null;
  return { clientId, locationId, appointmentId };
}

/** Gekoppeltes iPad/Companion — gleiches Modell wie /treatment/lena-segment. */
async function companionDeviceOk(req) {
  const clientId = String(req.body?.clientId || req.query?.clientId || "").trim();
  const deviceId = String(req.body?.deviceId || "").trim();
  const deviceKey = String(req.body?.deviceKey || "").trim();
  if (!ID_RE.test(clientId) || !deviceId || !deviceKey) return null;
  const who = await identifyByDevice(clientId, deviceId, deviceKey).catch(() => null);
  return who || null;
}

/** Public routes: deviceKey ODER eingeloggter Nutzer (Bearer), sonst 403. */
async function structureBillingActor(req) {
  const deviceId = String(req.body?.deviceId || "").trim();
  const deviceKey = String(req.body?.deviceKey || "").trim();
  const attemptedDevice = !!(deviceId && deviceKey);
  const dev = await companionDeviceOk(req);
  if (dev) {
    return {
      ok: true,
      updatedBy: String(dev.name || dev.operatorName || dev.doctorName || "iPad").slice(0, 60),
    };
  }
  // Falsche Companion-Credentials nie als Dev-Bypass durchlassen.
  if (attemptedDevice) return { ok: false, error: "forbidden" };
  const hdr = req.header("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(hdr);
  if (m && m[1]) {
    try {
      const dec = await admin.auth().verifyIdToken(m[1]);
      const name = String(dec.name || "").trim();
      const email = String(dec.email || "").trim();
      return {
        ok: true,
        updatedBy: String(name || email || dec.uid || "mas-lena").slice(0, 60),
      };
    } catch {
      return { ok: false, error: "invalid_token" };
    }
  }
  if (!AUTH_ENFORCED) {
    return { ok: true, updatedBy: String(req.auth?.name || req.auth?.email || req.auth?.userId || "mas-lena").slice(0, 60) };
  }
  return { ok: false, error: "forbidden" };
}

const tsToMs = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v._seconds === "number") return v._seconds * 1000;
  return 0;
};

// ── Live-Korrektur-Korpus (Chef 24.07.2026) ─────────────────────────────────
// Jedes ARZT-Segment (Diktat/Gespraech) wird als Audio↔Text-Paar gesichert.
// So kann der Arzt eine Verhoerung im Live-Transkript EINMAL korrigieren, bevor
// es in die Akte geht — und Lena lernt daraus (Export -> lena_stt Hotwords/
// Postkorrektur + spaeteres Fine-Tuning). Patiententext (source=raum) wird NUR
// als Text gespeichert (kein Patienten-Audio — DSGVO/Datensparsamkeit).
function liveSamplesCol(clientId) {
  return admin.firestore().collection("clients").doc(clientId).collection("lenaLiveSamples");
}
function correctionsCol(clientId) {
  return admin.firestore().collection("clients").doc(clientId).collection("lenaCorrections");
}
async function clientSpecialty(clientId) {
  try {
    const snap = await admin.firestore().collection("clients").doc(clientId).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    return String(d.specialty || d.fachrichtung || d.fach || "").trim().slice(0, 60);
  } catch { return ""; }
}
const looseEq = (a, b) =>
  String(a || "").trim().toLowerCase().replace(/\s+/g, " ") ===
  String(b || "").trim().toLowerCase().replace(/\s+/g, " ");

// Holt das WAV zu einer audioId aus lena_stt und legt es als Live-Sample ab.
// Fire-and-forget: darf den Live-Doku-Pfad NIE verzoegern oder brechen.
async function storeLiveSampleFromAudioId({ clientId, locationId, appointmentId, dictationId, audioId, text, source }) {
  try {
    if (!AUDIO_ID_RE.test(String(audioId || ""))) return;
    const resp = await fetch(`${LENA_STT_BASE}/capture/${audioId}`, { cache: "no-store" });
    if (!resp.ok) return;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) return;
    const sampleRef = liveSamplesCol(clientId).doc();
    const audioPath = `clients/${clientId}/lena-live/${sampleRef.id}.wav`;
    await admin.storage().bucket().file(audioPath).save(buf, {
      contentType: "audio/wav",
      resumable: false,
      metadata: { metadata: { clientId, appointmentId, dictationId } },
    });
    const specialty = await clientSpecialty(clientId);
    await sampleRef.set({
      id: sampleRef.id,
      appointmentId, locationId, dictationId,
      source: source || "arzt",
      targetText: text, recognizedText: text,
      corrected: false,
      audioPath, specialty, subcategory: "",
      createdAtMs: Date.now(),
    });
  } catch (e) {
    console.warn("lena-live-sample store failed:", e?.message || e);
  }
}

// Verankert eine Live-Korrektur: aktualisiert das Sample (targetText/corrected)
// und legt ein deterministisches Korrekturpaar (from->to) fuer den Export an.
async function anchorLiveCorrection({ clientId, dictationId, oldText, newText }) {
  try {
    if (looseEq(oldText, newText)) return;
    let specialty = "", subcategory = "";
    const q = await liveSamplesCol(clientId).where("dictationId", "==", dictationId).limit(5).get().catch(() => null);
    if (q && !q.empty) {
      for (const doc of q.docs) {
        const d = doc.data() || {};
        specialty = specialty || String(d.specialty || "");
        subcategory = subcategory || String(d.subcategory || "");
        await doc.ref.set({ targetText: newText, corrected: true, correctedAtMs: Date.now() }, { merge: true });
      }
    }
    if (String(oldText || "").trim()) {
      await correctionsCol(clientId).add({
        from: String(oldText).trim().slice(0, 2000),
        to: String(newText).trim().slice(0, 2000),
        dictationId, specialty, subcategory,
        createdAtMs: Date.now(),
      });
    }
  } catch (e) {
    console.warn("anchorLiveCorrection failed:", e?.message || e);
  }
}

function normalizeRecorder(raw) {
  const o = raw || {};
  return {
    status: o.status === "recording" || o.status === "paused" ? o.status : "idle",
    command: o.command === "pause" || o.command === "stop" ? o.command : "",
    commandAtMs: typeof o.commandAtMs === "number" ? o.commandAtMs : 0,
    deviceId: typeof o.deviceId === "string" ? o.deviceId : "",
    deviceLabel: typeof o.deviceLabel === "string" ? o.deviceLabel : "",
    by: typeof o.by === "string" ? o.by : "",
    startedAtMs: typeof o.startedAtMs === "number" ? o.startedAtMs : 0,
    accumMs: typeof o.accumMs === "number" ? o.accumMs : 0,
    updatedAtMs: typeof o.updatedAtMs === "number" ? o.updatedAtMs : 0,
  };
}

// POST /treatment/current — Raum→Termin fuer das gekoppelte iPad (Paket 2b).
// Authentifiziert per deviceId+deviceKey (kein Login). Liefert:
//   - den Termin am Stuhl (activeRecording ODER pickCurrentAppointment),
//   - die gefilterte Tagesliste (Body.date optional, default heute Berlin),
//   - Kalender/Behandler fuer den Wizard.
// Bei Behandler-Geraeten: nur dessen Kalender.
function slimAppt(a) {
  return {
    appointmentId: String(a.id || ""),
    patientId: String(a.patientId || ""),
    patientName: String(a.patientName || ""),
    startMs: Number(a.startMs) || 0,
    endMs: Number(a.endMs) || 0,
    visitMotive: String(a.visitMotive || ""),
    calendarId: String(a.calendarId || ""),
    doctorName: String(a.calendarName || a.doctorName || ""),
    comments: String(a.comments || ""),
    docsStatus: String(a.docsStatus || ""),
    newPatient: a.newPatient === true,
    patientStatus: typeof a.patientStatus === "number" ? a.patientStatus : null,
    status: String(a.status || ""),
  };
}

/** Kanonisch: clients/{c}/locations/{l}/patients/{id}; Fallback client-weit. */
async function loadPatientDoc(clientId, locationId, patientId) {
  const pid = String(patientId || "").trim();
  if (!ID_RE.test(clientId) || !pid) return null;
  const db = admin.firestore();
  const paths = [];
  if (locationId && ID_RE.test(locationId)) {
    paths.push(db.collection("clients").doc(clientId)
      .collection("locations").doc(locationId)
      .collection("patients").doc(pid));
  }
  paths.push(db.collection("clients").doc(clientId).collection("patients").doc(pid));
  for (const ref of paths) {
    try {
      const snap = await ref.get();
      if (snap.exists) return snap.data() || {};
    } catch { /* naechster Pfad */ }
  }
  return null;
}

function _hint(ico, title, desc) {
  return { ico, title: String(title || "").slice(0, 80), desc: String(desc || "").slice(0, 280) };
}

function _docsHint(docsStatus) {
  const docs = String(docsStatus || "").toLowerCase();
  if (docs === "none" || docs === "red") {
    return _hint("red", "Unterschriften fehlen", "Pflicht-Dokumente noch nicht unterschrieben (SignR).");
  }
  if (docs === "sent" || docs === "yellow") {
    return _hint("yellow", "Dokumente ausstehend", "Verschickt, noch nicht unterschrieben.");
  }
  if (docs === "ok" || docs === "green" || docs === "signed") {
    return _hint("green", "Dokumente ok", "Unterschriften vorhanden.");
  }
  return null;
}

function _anamneseIco(category) {
  const cat = String(category || "").toLowerCase();
  if (cat.startsWith("allerg")) return "red";
  if (cat.startsWith("medikament") || cat.startsWith("blutung") || cat.includes("gerinnung")) return "red";
  if (cat.startsWith("vorerkrank") || cat.startsWith("schwanger")) return "yellow";
  return "yellow";
}

/** Besonderheiten fuer iPad-Besonderheiten-Panel ({ico,title,desc}[]). */
function buildPatientHints({
  newPatient = false,
  docsStatus = "",
  comments = "",
  visitMotive = "",
  patient = null,
  anamneseFindings = [],
} = {}) {
  const hints = [];
  const seen = new Set();
  const push = (h) => {
    if (!h) return;
    const key = `${h.ico}|${h.title}|${h.desc}`;
    if (seen.has(key)) return;
    seen.add(key);
    hints.push(h);
  };

  if (newPatient) {
    push(_hint("green", "Neupatient", "Erster Besuch — Anamnese / Formulare prüfen."));
  }
  push(_docsHint(docsStatus));

  const apptComments = String(comments || "").trim();
  if (apptComments) push(_hint("yellow", "Termin-Notiz", apptComments));

  const p = patient || {};
  const patComments = String(p.comments || p.notes || "").trim();
  if (patComments && patComments !== apptComments) {
    push(_hint("yellow", "Akten-Notiz", clip(patComments, 220)));
  }
  for (const field of ["allergies", "medical", "medicalNotes", "medicalHistory"]) {
    const val = String(p[field] || "").trim();
    if (!val) continue;
    const title = field === "allergies" ? "Allergie"
      : field === "medical" ? "Medizinisch"
        : field === "medicalNotes" ? "Medizin-Notiz"
          : "Vorerkrankung";
    push(_hint(field === "allergies" ? "red" : "yellow", title, clip(val, 220)));
  }
  if (p.privateInsurance === true) {
    push(_hint("cyan", "Privatversichert", "Abrechnung / GOZ beachten."));
  }

  for (const f of (anamneseFindings || []).slice(0, 6)) {
    const cat = String(f?.category || "").trim();
    const txt = f?.text && f.text !== "ja" ? `${cat}: ${f.text}` : cat;
    if (!txt) continue;
    push(_hint(_anamneseIco(cat), cat || "Anamnese", clip(txt, 220)));
  }

  if (visitMotive) push(_hint("cyan", "Besuchsgrund", String(visitMotive)));
  return hints.slice(0, 12);
}

router.post("/treatment/current", async (req, res) => {
  try {
    const clientId = String(req.body?.clientId || req.query?.clientId || "").trim();
    const deviceId = String(req.body?.deviceId || "").trim();
    const deviceKey = String(req.body?.deviceKey || "").trim();
    const date = String(req.body?.date || "").trim() || todayBerlin();
    if (!ID_RE.test(clientId) || !deviceId || !deviceKey) {
      return res.status(400).json({ ok: false, error: "bad_ids" });
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: "bad_date" });
    }
    const who = await identifyByDevice(clientId, deviceId, deviceKey);
    if (!who) return res.status(401).json({ ok: false, error: "device_auth_failed" });

    const active = await getActiveRecording(clientId).catch(() => null);
    let appts = [];
    let locationId = "";
    let calendars = [];
    let matchedCalId = "";
    const day = await getDayAppointments(clientId, { date }).catch(() => null);
    if (day?.ok) {
      locationId = day.locationId || "";
      calendars = day.calendars || [];
      appts = day.appointments || [];
      // Behandler-Geraet: nur dessen Kalender, damit bei mehreren Stuehlen
      // nicht geraten wird (analog ambiguous in pickCurrentAppointment).
      matchedCalId = matchCalendarId(calendars, who.doctorName);
      if (matchedCalId) appts = appts.filter((a) => a.calendarId === matchedCalId);
    }

    const patients = appts.filter((a) => a && !a.isAbsence && a.patientId);
    const dayList = patients.map(slimAppt);
    const calList = (calendars || [])
      .filter((c) => c?.id && c?.name)
      .filter((c) => !matchedCalId || c.id === matchedCalId)
      .map((c) => ({ id: String(c.id), name: String(c.name) }));

    const resolved = resolveChairAppointment(active, appts, Date.now(), locationId);
    res.set("Cache-Control", "no-store");

    const base = {
      ok: true,
      day: date,
      locationId: locationId || resolved.locationId || "",
      operatorName: who.name || "",
      doctorName: who.doctorName || resolved.doctorName || "",
      calendarId: matchedCalId || "",
      calendars: calList,
      appointments: dayList,
      candidates: (resolved.candidates || []).slice(0, 5).map((c) => ({
        appointmentId: c.id,
        patientName: c.patientName || "",
        startMs: c.startMs || 0,
        visitMotive: c.visitMotive || "",
      })),
    };

    if (!resolved.ok || !resolved.appointmentId || !resolved.locationId) {
      return res.json({
        ...base,
        found: false,
        reason: resolved.reason || "none",
      });
    }

    const dictateUrl = `${PLATFORM_WEB_URL}/dictate/${encodeURIComponent(clientId)}/${encodeURIComponent(resolved.locationId)}/${encodeURIComponent(resolved.appointmentId)}?embedded=1`;
    // Anreicherungen aus der Tagesliste (comments/docs), falls der aktuelle
    // Termin dort steht (bei reason=recording ggf. anderer Tag → leer ok).
    const fromDay = dayList.find((a) => a.appointmentId === resolved.appointmentId) || null;
    const pid = String(resolved.patientId || fromDay?.patientId || "").trim();
    const hintCtx = {
      newPatient: fromDay?.newPatient === true,
      docsStatus: fromDay?.docsStatus || "",
      comments: fromDay?.comments || "",
      visitMotive: resolved.visitMotive || fromDay?.visitMotive || "",
      patient: null,
      anamneseFindings: [],
    };
    if (pid) {
      const [patient, ana] = await Promise.all([
        loadPatientDoc(clientId, resolved.locationId, pid).catch(() => null),
        getPatientAnamnese(clientId, { patientId: pid }).catch(() => null),
      ]);
      if (patient) {
        hintCtx.patient = patient;
        if (patient.newPatient === true) hintCtx.newPatient = true;
        if (!hintCtx.docsStatus && patient.docsStatus) hintCtx.docsStatus = String(patient.docsStatus);
      }
      if (ana?.ok && ana.findings?.length) hintCtx.anamneseFindings = ana.findings;
    }
    const patientHints = buildPatientHints(hintCtx);
    res.json({
      ...base,
      found: true,
      reason: resolved.reason,
      locationId: resolved.locationId,
      appointmentId: resolved.appointmentId,
      patientId: resolved.patientId,
      patientName: resolved.patientName,
      doctorName: resolved.doctorName || who.doctorName || "",
      visitMotive: hintCtx.visitMotive,
      startMs: resolved.startMs || fromDay?.startMs || 0,
      endMs: fromDay?.endMs || 0,
      comments: hintCtx.comments,
      docsStatus: hintCtx.docsStatus,
      newPatient: hintCtx.newPatient,
      patientHints,
      // Strukturierte Anamnese fuer Doku-Box (Prefill), parallel zu patientHints.
      anamneseFindings: (hintCtx.anamneseFindings || []).slice(0, 20).map((f) => ({
        category: String(f?.category || "").trim().slice(0, 80),
        text: String(f?.text || "").trim().slice(0, 400),
      })).filter((f) => f.text),
      dictateUrl,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Aufklaerungs-/Einwilligungs-Dokumente (SignR) am Namen erkennen. Anamnese
// bleibt aussen vor (die fuellt die Anamnese-Box separat).
const AUFKLAERUNG_NAME_RE =
  /aufkl(?:ä|ae)r|einwillig|einverst(?:ä|ae)nd|consent|behandlungsvertrag|datenschutz|schweige/i;

// POST /treatment/patient-docs — Prefill-Kontext fuer den AKTUELL am iPad
// gewaehlten Termin (Chef 24.07.2026): strukturierte Anamnese (robust auch bei
// manuell gewaehltem Termin, nicht nur Stuhl-Termin) UND die unterschriebenen
// Aufklaerungsdokumente mit zeitlich begrenztem PDF-Link. Bewusst EIGENER,
// selten (bei Termin-/Seitenwechsel) aufgerufener Endpunkt — nicht im Heartbeat,
// damit der Poll keine pdocuments-Reads + signierten URLs pro Sekunde erzeugt.
router.post("/treatment/patient-docs", async (req, res) => {
  try {
    const who = await companionDeviceOk(req);
    if (!who) return res.status(401).json({ ok: false, error: "device_auth_failed" });
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });

    let patientId = String(req.body?.patientId || "").trim();
    if (!patientId) {
      const snap = await apptRef(k.clientId, k.locationId, k.appointmentId).get().catch(() => null);
      const o = snap?.exists ? (snap.data() || {}) : {};
      patientId = String(o.patient?.id || o.patientId || "").trim();
    }

    const anamneseFindings = [];
    let aufklaerungDocs = [];
    if (patientId) {
      const [ana, docs] = await Promise.all([
        getPatientAnamnese(k.clientId, { patientId }).catch(() => null),
        admin.firestore()
          .collection("clients").doc(k.clientId)
          .collection("locations").doc(k.locationId)
          .collection("patients").doc(patientId)
          .collection("pdocuments").get()
          .then((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))
          .catch(() => []),
      ]);
      if (ana?.ok && Array.isArray(ana.findings)) {
        for (const f of ana.findings.slice(0, 20)) {
          const text = String(f?.text || "").trim().slice(0, 400);
          if (text) anamneseFindings.push({ category: String(f?.category || "").trim().slice(0, 80), text });
        }
      }
      const signed = (docs || []).filter((d) =>
        AUFKLAERUNG_NAME_RE.test(String(d.name || "")) &&
        (d.status === "signed" || d.pdfCreatedAt));
      signed.sort((a, b) => tsToMs(b.pdfCreatedAt) - tsToMs(a.pdfCreatedAt));
      const bucket = admin.storage().bucket();
      aufklaerungDocs = await Promise.all(signed.slice(0, 12).map(async (d) => {
        const path = `clients/${k.clientId}/locations/${k.locationId}/patients/${patientId}/documents/${d.id}.pdf`;
        let url = "";
        try {
          const [signedUrl] = await bucket.file(path).getSignedUrl({
            version: "v4", action: "read", expires: Date.now() + 15 * 60 * 1000,
          });
          url = signedUrl;
        } catch { /* PDF fehlt/kein Zugriff -> Eintrag ohne Link */ }
        return {
          id: String(d.id),
          name: String(d.name || "Dokument").slice(0, 120),
          status: d.status === "signed" ? "signed" : (d.pdfCreatedAt ? "signed" : String(d.status || "")),
          signedAtMs: tsToMs(d.pdfCreatedAt) || 0,
          url,
        };
      }));
    }

    res.set("Cache-Control", "no-store");
    res.json({ ok: true, patientId, anamneseFindings, aufklaerungDocs });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/heartbeat — EIN Poll fuer alles: schreibt die Presence des
// Geraets (LED auf der Lena-Seite) und liefert Termin-Metadaten, Aufnahme-
// Zustand und Diktat-Segmente zurueck. presence:false = nur lesen (z. B.
// initialer Abruf, ohne als "verbunden" zu gelten).
router.post("/treatment/heartbeat", async (req, res) => {
  try {
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const ref = apptRef(k.clientId, k.locationId, k.appointmentId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "appointment_not_found" });
    const o = snap.data() || {};

    const deviceLabel = String(req.body?.deviceLabel || "iPad").slice(0, 40);
    if (req.body?.presence !== false) {
      await ref.collection("treatment").doc("companion")
        .set({ deviceLabel, lastSeenMs: Date.now() }, { merge: true });
    }

    const [recSnap, segSnap, setSnap, noteSnap] = await Promise.all([
      ref.collection("treatment").doc("recorder").get(),
      ref.collection("dictations").orderBy("createdAt", "asc").limit(200).get(),
      admin.firestore()
        .collection("clients").doc(k.clientId)
        .collection("locations").doc(k.locationId)
        .collection("settings").doc("lenaRecorder").get(),
      ref.collection("treatment").doc("main").get(),
    ]);

    const segments = segSnap.docs.map((d) => {
      const s = d.data() || {};
      return {
        id: d.id,
        text: typeof s.text === "string" ? s.text : "",
        source: typeof s.source === "string" ? s.source : "",
        struck: s.struck === true,
        createdAtMs: tsToMs(s.createdAt),
        // Sprech-Zeit (Wall-Clock) fuer chronologische Sortierung ueber beide
        // Kanaele; fehlt bei Alt-Segmenten (dann Fallback createdAt/Reihenfolge).
        startMs: Number(s.startMs) || 0,
        endMs: Number(s.endMs) || 0,
      };
    });

    // Kanal-Vertrag: das iPad muss wissen, ob ES das Raummikro ist ("ipad")
    // oder ob der PC den Patienten aufnimmt ("pc-stereo"/"pc-mono").
    const settings = setSnap.exists ? (setSnap.data() || {}) : {};
    const raumSource = settings.raumSource === "ipad" || settings.raumSource === "pc-mono"
      || settings.raumSource === "pc-stereo" ? settings.raumSource : "pc-stereo";
    const arztSource = settings.arztSource === "headset" ? "headset" : "lavalier";

    // Zusammenfassung mitliefern, damit das iPad sie ohne Reload aktualisieren
    // kann (Web-Lena lauscht ohnehin per Firestore-Listener auf treatment/main).
    const note = noteSnap.exists ? (noteSnap.data() || {}) : {};

    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      appointmentId: k.appointmentId,
      locationId: k.locationId,
      patientName: `${o.patient?.firstName || ""} ${o.patient?.lastName || ""}`.trim(),
      doctorName: o.calendar?.name || "",
      visitMotive: o.visitMotive?.name || "",
      startMs: tsToMs(o.start),
      recorder: normalizeRecorder(recSnap.exists ? recSnap.data() : null),
      segments,
      structuredText: typeof note.structuredText === "string" ? note.structuredText : "",
      structuredHtml: typeof note.structuredHtml === "string" ? note.structuredHtml : "",
      raumSource,
      arztSource,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/recorder — Aufnahme-Zustand vom gekoppelten Geraet schreiben
// (Start/Pause/Stop auf dem iPad bzw. Fernbefehl an das aufnehmende Geraet).
// Nur die bekannten Felder werden uebernommen; Merge wie im Frontend-Service,
// updatedAtMs ist immer der Server-Zeitpunkt (Heartbeat der Aufnahme).
router.post("/treatment/recorder", async (req, res) => {
  try {
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const ref = apptRef(k.clientId, k.locationId, k.appointmentId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "appointment_not_found" });

    const p = req.body?.patch || {};
    const patch = {};
    if (p.status === "idle" || p.status === "recording" || p.status === "paused") patch.status = p.status;
    if (p.command === "" || p.command === "pause" || p.command === "stop") patch.command = p.command;
    if (typeof p.commandAtMs === "number") patch.commandAtMs = p.commandAtMs;
    if (typeof p.deviceId === "string") patch.deviceId = p.deviceId.slice(0, 60);
    if (typeof p.deviceLabel === "string") patch.deviceLabel = p.deviceLabel.slice(0, 40);
    if (typeof p.by === "string") patch.by = p.by.slice(0, 60);
    if (typeof p.startedAtMs === "number") patch.startedAtMs = p.startedAtMs;
    if (typeof p.accumMs === "number") patch.accumMs = p.accumMs;

    await ref.collection("treatment").doc("recorder")
      .set({ ...patch, updatedAtMs: Date.now() }, { merge: true });

    res.set("Cache-Control", "no-store");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/lena-segment — EIN Doku-Segment serverseitig anlegen
// (W-LENA-2 Teil 4). Aufrufer:
//   A) Clara-Worker (Headset-Tee) mit LENA_STT_PUBLISH_TOKEN, oder
//   B) gekoppeltes iPad mit deviceId+deviceKey (wie /treatment/current), oder
//   C) Legacy: drei Termin-IDs als Ticket, nur wenn KEIN Publish-Token gesetzt.
// Layout wie submitTreatmentDictation ({id,text,lang,source,createdAt}).
router.post("/treatment/lena-segment", async (req, res) => {
  try {
    const want = String(process.env.LENA_STT_PUBLISH_TOKEN || "").trim();
    const got = String(req.get("x-lena-token") || req.body?.token || "").trim();
    const tokenOk = !!(want && got && got === want);

    const clientId = String(req.body?.clientId || req.query?.clientId || "").trim();
    const deviceId = String(req.body?.deviceId || "").trim();
    const deviceKey = String(req.body?.deviceKey || "").trim();
    let deviceOk = false;
    if (ID_RE.test(clientId) && deviceId && deviceKey) {
      const who = await identifyByDevice(clientId, deviceId, deviceKey).catch(() => null);
      deviceOk = !!who;
    }

    if (want) {
      // Token konfiguriert: Worker-Token ODER gueltiges Geraet.
      if (!tokenOk && !deviceOk) return res.status(403).json({ ok: false, error: "forbidden" });
    }
    // Ohne Token: deviceKey bevorzugt, sonst Drei-ID-Ticket (Altverhalten).

    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    if (deviceOk && k.clientId !== clientId) {
      return res.status(403).json({ ok: false, error: "client_mismatch" });
    }
    const text = String(req.body?.text || "").trim().slice(0, 20000);
    if (!text) return res.status(400).json({ ok: false, error: "empty_text" });
    const lang = String(req.body?.lang || "de-DE").slice(0, 12) || "de-DE";
    let source = String(req.body?.source || "arzt").slice(0, 20) || "arzt";

    const ref = apptRef(k.clientId, k.locationId, k.appointmentId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "appointment_not_found" });

    // W-LENA-7: Laeuft fuer diesen Termin gerade ein DIKTAT (Clara-Sprach-Diktat,
    // recorder.mode=dictation), ist die getee'te Arzt-Stimme ein WORTWOERTLICHER
    // Nachtrag -> source=nachdiktat (eigener, ungefilterter Abschnitt). Die
    // normale Behandlungs-AUFNAHME (mode=recording) bleibt source=arzt (Gespraech).
    // Explizit vom Client gesetzte Quellen (iPad raum/nachdiktat) bleiben unberuehrt.
    if (source === "arzt") {
      try {
        const recSnap = await ref.collection("treatment").doc("recorder").get();
        const rec = recSnap.exists ? (recSnap.data() || {}) : {};
        if (rec.status === "recording" && rec.mode === "dictation") source = "nachdiktat";
      } catch { /* Recorder-Status ist Komfort */ }
    }

    // Sprech-Zeitfenster (absolute Wall-Clock-ms, vom iPad aus recStartedAtMs +
    // Lena-Stream-Offset). Nur speichern, wenn plausibel (>0) — sonst bleibt das
    // Feld weg (Alt-Segmente/kein Timing => Merge faellt auf Text+createdAt zurueck).
    const startMs = Number(req.body?.startMs) || 0;
    const endMs = Number(req.body?.endMs) || 0;
    const hasTiming = startMs > 0 && endMs >= startMs;

    const segRef = ref.collection("dictations").doc();
    await segRef.set({
      id: segRef.id,
      text,
      lang,
      source,
      ...(hasTiming ? { startMs, endMs } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Live-Korrektur-Korpus: nur Arzt-Audio (Diktat/Nachtrag) sichern. audioId
    // kommt vom Worker (lena_stt hat das WAV kurz gehalten). Fire-and-forget,
    // damit das Live-Doku-Tempo unberuehrt bleibt.
    const audioId = String(req.body?.audioId || "").trim();
    if (audioId && (source === "arzt" || source === "nachdiktat")) {
      storeLiveSampleFromAudioId({
        clientId: k.clientId, locationId: k.locationId, appointmentId: k.appointmentId,
        dictationId: segRef.id, audioId, text, source,
      }).catch(() => {});
    }

    // Shared Memory (lena_doc) erst beim Abschluss „Speichern“
    // (`/treatment/finalize`) — nicht live pro Segment (Chef 21.07.2026).
    // Fuehrende Quelle bleibt dictations/* (Clara liest dort beim Vorlesen).

    res.set("Cache-Control", "no-store");
    res.json({ ok: true, dictationId: segRef.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// AP3 (Chef 24.07.2026) — Raummikro auf einem ZWEITEN Geraet (Computer). Das
// iPad kann per BT-Headset + USB-Raummikro nicht GLEICHZEITIG hoeren (iPadOS
// Ein-Mikro-Limit), darum laeuft die Patientensprache ueber einen separaten
// Capture-Daemon (lena_stt/room_capture.py). Steuerung:
//   POST /treatment/room-capture        (iPad, deviceKey)  -> Flag an/aus
//   GET  /treatment/room-capture-state  (Daemon, x-lena-token) -> aktiver Termin
// Der Zustand liegt am Termin UND als Client-Zeiger (clients/{id}/clara/
// roomCapture), damit der Daemon (kennt nur clientId) den Termin findet.
function roomCapturePointerRef(clientId) {
  return admin.firestore()
    .collection("clients").doc(clientId)
    .collection("clara").doc("roomCapture");
}

// POST /treatment/room-capture — Raummikro-Capture an-/ausschalten (iPad-Sprachbefehl).
router.post("/treatment/room-capture", async (req, res) => {
  try {
    const dev = await companionDeviceOk(req);
    if (!dev) return res.status(403).json({ ok: false, error: "forbidden" });
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const on = req.body?.on === true || String(req.body?.on || "") === "true";
    const nowMs = Date.now();
    const ref = apptRef(k.clientId, k.locationId, k.appointmentId);
    await ref.collection("treatment").doc("roomCapture")
      .set({ on, updatedAtMs: nowMs }, { merge: true });
    await roomCapturePointerRef(k.clientId).set({
      on,
      clientId: k.clientId,
      locationId: k.locationId,
      appointmentId: k.appointmentId,
      updatedAtMs: nowMs,
    }, { merge: true });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, on });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// GET /treatment/room-capture-state — der Capture-Daemon fragt hier, ob und
// fuer welchen Termin er das Raummikro streamen soll. Auth: Publish-Token
// (LENA_STT_PUBLISH_TOKEN) ODER gekoppeltes Geraet. Alter Zustand (>2 min ohne
// Update) gilt als aus — schuetzt vor haengendem Flag nach App-Absturz.
router.get("/treatment/room-capture-state", async (req, res) => {
  try {
    const want = String(process.env.LENA_STT_PUBLISH_TOKEN || "").trim();
    const got = String(req.get("x-lena-token") || req.query?.token || "").trim();
    const tokenOk = !!(want && got && got === want);
    const clientId = String(req.query?.clientId || "").trim();
    if (!ID_RE.test(clientId)) return res.status(400).json({ ok: false, error: "bad_ids" });
    if (want && !tokenOk) {
      const dev = await companionDeviceOk(req);
      if (!dev) return res.status(403).json({ ok: false, error: "forbidden" });
    }
    const snap = await roomCapturePointerRef(clientId).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    const fresh = Number(d.updatedAtMs || 0) > Date.now() - 120000;
    const on = d.on === true && fresh;
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      on,
      clientId,
      locationId: on ? String(d.locationId || "") : "",
      appointmentId: on ? String(d.appointmentId || "") : "",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/finalize — Eintrag abschliessen: Karteikarte + Shared Memory.
// iPad-Button „Speichern“. Auth wie structure (deviceKey oder Bearer).
router.post("/treatment/finalize", async (req, res) => {
  try {
    const actor = await structureBillingActor(req);
    if (!actor.ok) {
      return res.status(actor.error === "invalid_token" ? 401 : 403).json({ ok: false, error: actor.error });
    }
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const structuredText = String(req.body?.structuredText || "").trim();
    const r = await finalizeTreatmentDoc(k.clientId, k.locationId, k.appointmentId, {
      structuredText,
      updatedBy: actor.updatedBy,
    });
    res.set("Cache-Control", "no-store");
    if (!r.ok) {
      const code = r.error === "no_content" ? 409 : 502;
      return res.status(code).json(r);
    }
    res.json(r);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/lena-delete — die Behandlungsdoku EINES Termins KOMPLETT aus
// dem geteilten Praxisgedaechtnis entfernen (Chef 12.07.). Ergaenzt den
// Frontend-Hard-Delete (Diktat-Segmente + Karteikarte direkt auf Firestore):
// hier verschwinden die zugehoerigen lena_doc-Audit-Events (Cockpit-/Patienten-
// Timeline). Alle Doku-Events tragen die stabile ID `lena-doc:<appt>:<segId>`
// (saveTreatmentDictation + /treatment/lena-segment) — der Praefix erwischt sie
// alle. Bewusste Append-only-Ausnahme fuer Fehl-/Testaufnahmen. NICHT public
// (isPublic) -> verlangt in Produktion einen eingeloggten Nutzer, genau wie
// /treatment/structure. Best-effort/idempotent: nichts zu loeschen = ok, 0.
router.post("/treatment/lena-delete", async (req, res) => {
  try {
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const { deleted } = await deleteEventsByIdPrefix(k.clientId, `lena-doc:${k.appointmentId}:`);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, deleted });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** Companion darf ein Segment aendern/loeschen — gleiche Auth wie lena-segment. */
async function companionSegmentActor(req) {
  const want = String(process.env.LENA_STT_PUBLISH_TOKEN || "").trim();
  const got = String(req.get("x-lena-token") || req.body?.token || "").trim();
  const tokenOk = !!(want && got && got === want);
  const clientId = String(req.body?.clientId || req.query?.clientId || "").trim();
  const deviceId = String(req.body?.deviceId || "").trim();
  const deviceKey = String(req.body?.deviceKey || "").trim();
  let deviceOk = false;
  if (ID_RE.test(clientId) && deviceId && deviceKey) {
    const who = await identifyByDevice(clientId, deviceId, deviceKey).catch(() => null);
    deviceOk = !!who;
  }
  if (deviceId && deviceKey && !deviceOk) return { ok: false, error: "forbidden" };
  if (want) {
    if (!tokenOk && !deviceOk) return { ok: false, error: "forbidden" };
  } else if (!deviceOk && AUTH_ENFORCED) {
    return { ok: false, error: "forbidden" };
  }
  const k = readIds(req);
  if (!k) return { ok: false, error: "bad_ids" };
  if (deviceOk && k.clientId !== clientId) return { ok: false, error: "client_mismatch" };
  const dictationId = String(req.body?.dictationId || req.body?.id || "").trim();
  if (!dictationId) return { ok: false, error: "missing_dictation_id" };
  return { ok: true, k, dictationId };
}

// POST /treatment/lena-segment-update — Text eines Segments aendern (iPad/Desktop).
router.post("/treatment/lena-segment-update", async (req, res) => {
  try {
    const actor = await companionSegmentActor(req);
    if (!actor.ok) {
      const code = actor.error === "bad_ids" || actor.error === "missing_dictation_id" ? 400 : 403;
      return res.status(code).json({ ok: false, error: actor.error });
    }
    const text = String(req.body?.text || "").trim().slice(0, 20000);
    if (!text) return res.status(400).json({ ok: false, error: "empty_text" });
    const segRef = apptRef(actor.k.clientId, actor.k.locationId, actor.k.appointmentId)
      .collection("dictations").doc(actor.dictationId);
    const snap = await segRef.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "not_found" });
    const oldText = String(snap.data()?.text || "").trim();
    await segRef.set({
      text,
      // Nach Edit neu klassifizieren lassen (Strukturierung).
      smalltalk: admin.firestore.FieldValue.delete(),
      section: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    // Korrektur verankern: Audio↔Text-Paar aktualisieren + Korrekturpaar
    // fuer den Export sichern (damit dieselbe Verhoerung nicht wiederkehrt).
    anchorLiveCorrection({
      clientId: actor.k.clientId, dictationId: actor.dictationId, oldText, newText: text,
    }).catch(() => {});
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, dictationId: actor.dictationId, text });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/lena-suggest — Korrekturvorschlaege fuer ein (verhoertes)
// Live-Segment. IMMER qwen3.6 auf dem RTX-5090 (Chef 24.07.2026) — kein
// Fallback aufs kleine Modell; klappt es nicht, tippt der Arzt manuell.
router.post("/treatment/lena-suggest", async (req, res) => {
  try {
    const dev = await companionDeviceOk(req);
    if (!dev) return res.status(403).json({ ok: false, error: "forbidden" });
    const full = String(req.body?.text || "").trim().slice(0, 2000);
    const focus = String(req.body?.focus || "").trim().slice(0, 200);
    if (!full && !focus) return res.status(400).json({ ok: false, error: "empty" });

    const strong = strongLlm();
    const clientId = String(req.body?.clientId || req.query?.clientId || "").trim();
    // Fachrichtung des Mandanten (Chef 24.07.): waehlt die passende
    // Wissensbasis, damit ein Dermatologe/Radiologe genauso gut korrigiert wird
    // wie ein Zahnarzt. Freitext-Feld -> KB-Key (Default: zahnmedizin).
    let spec = resolveSpec("");
    if (clientId) {
      try { spec = resolveSpec(await clientSpecialty(clientId)); } catch { /* Default behalten */ }
    }
    // Fachwissen als Grounding (Begriffe/Abkuerzungen/Verhoerungen/Reasoning der
    // Fachrichtung) — dieselbe Wissensbasis wie die lena_stt-Postkorrektur, damit
    // die Vorschlaege konsistent und fachlich richtig sind.
    let domainCtx = "";
    try { domainCtx = domainLlmContext(spec, 8000); } catch { /* Wissen darf nie blockieren */ }
    // Patientennamen aus dem Kalender (letzte 2 Wochen + diese + naechste Woche,
    // shared/auto-aktualisiert via sttPatientNames). So korrigiert die KI auch
    // verhoerte Eigennamen auf echte Patienten dieser Praxis.
    let names = [];
    if (clientId) {
      try {
        const nm = await listPatientNamesForStt(clientId);
        names = (nm?.names || []).slice(0, 60);
      } catch { /* ohne Namen weiter */ }
    }
    const namesBlock = names.length
      ? `\n\n## Bekannte Eigennamen (Patienten dieser Praxis aus dem Kalender)\nWenn der verhoerte Ausdruck einem dieser Namen aehnelt, schlage den Namen EXAKT so geschrieben vor:\n${names.join(", ")}`
      : "";
    const sys = "Du bist ein Korrekturassistent fuer deutsche MEDIZINISCHE Spracherkennung (Diktat am Behandlungsstuhl bzw. am Patienten). Ein Wort oder kurzer Ausdruck wurde vermutlich verhoert. Nutze das folgende Fachwissen der jeweiligen Fachrichtung. Antworte AUSSCHLIESSLICH mit einem JSON-Array aus bis zu 5 plausiblen, fachlich korrekten Alternativen (Strings), beste zuerst. Keine Erklaerung, kein weiterer Text."
      + (domainCtx ? `\n\n${domainCtx}` : "")
      + namesBlock;
    const user = focus
      ? `Satz: "${full}"\nZu korrigierender Ausdruck: "${focus}"\nGib Alternativen NUR fuer diesen Ausdruck (als JSON-Array von Strings).`
      : `Vermutlich verhoerter Satz: "${full}"\nGib korrigierte Fassungen des ganzen Satzes (als JSON-Array von Strings).`;

    const r = await chat(
      [{ role: "system", content: sys }, { role: "user", content: user }],
      { baseUrl: strong.base, model: strong.model, temperature: 0.3, maxTokens: 300, timeoutMs: 20000 },
    );
    let suggestions = [];
    if (r.ok) {
      const m = /\[[\s\S]*\]/.exec(r.text || "");
      if (m) {
        try {
          const arr = JSON.parse(m[0]);
          if (Array.isArray(arr)) {
            suggestions = arr.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 5);
          }
        } catch { /* kein valides JSON -> keine Vorschlaege */ }
      }
    }
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, suggestions, llmOk: !!r.ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/lena-segment-delete — ein Segment loeschen + Memory-Event.
router.post("/treatment/lena-segment-delete", async (req, res) => {
  try {
    const actor = await companionSegmentActor(req);
    if (!actor.ok) {
      const code = actor.error === "bad_ids" || actor.error === "missing_dictation_id" ? 400 : 403;
      return res.status(code).json({ ok: false, error: actor.error });
    }
    const segRef = apptRef(actor.k.clientId, actor.k.locationId, actor.k.appointmentId)
      .collection("dictations").doc(actor.dictationId);
    const snap = await segRef.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "not_found" });
    await segRef.delete();
    try {
      await deleteEventsByIdPrefix(
        actor.k.clientId,
        `lena-doc:${actor.k.appointmentId}:${actor.dictationId}`,
      );
    } catch (memErr) {
      console.warn("lena-segment-delete: memory cleanup failed:", memErr?.message || memErr);
    }
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, dictationId: actor.dictationId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/structure — Diktat-Segmente klassifizieren (lokales LLM)
// und die Karteikarte deterministisch aus den ECHTEN Segmenttexten bauen.
// Ersetzt die OpenAI-Cloud-Function structureTreatmentNote (Quota tot,
// Patiententexte bleiben im Haus). Aufrufer: eingeloggte Plattform (Lena-Seite).
router.post("/treatment/structure", async (req, res) => {
  try {
    const actor = await structureBillingActor(req);
    if (!actor.ok) return res.status(actor.error === "invalid_token" ? 401 : 403).json({ ok: false, error: actor.error });
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const r = await structureTreatment(k.clientId, k.locationId, k.appointmentId, { updatedBy: actor.updatedBy });
    res.set("Cache-Control", "no-store");
    if (!r.ok) {
      const code = r.error === "no_segments" ? 409 : 502;
      return res.status(code).json(r);
    }
    res.json(r);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/template — W-LENA-8b: Doku-Template-Felder eines Termins
// robust per LLM aus den Segmenten fuellen (additiv) und unter
// treatment/main.templateFields persistieren. Liefert templateFields +
// template-basierten structuredText + Abrechnungshinweise (8c) zurueck. Die
// Lena-Seite/das iPad kann das explizit anstossen; ausserdem laeuft es
// automatisch am Ende von /treatment/structure mit. Gleiche Auth wie structure.
router.post("/treatment/template", async (req, res) => {
  try {
    const actor = await structureBillingActor(req);
    if (!actor.ok) return res.status(actor.error === "invalid_token" ? 401 : 403).json({ ok: false, error: actor.error });
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const r = await refreshTemplateFields(k.clientId, k.locationId, k.appointmentId, { updatedBy: actor.updatedBy });
    res.set("Cache-Control", "no-store");
    if (!r.ok) {
      const code = r.reason === "no_segments" ? 409 : 502;
      return res.status(code).json(r);
    }
    res.json(r);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/smalltalk — Auto-Klassifikation (11.07.2026): prueft alle
// noch unklassifizierten Diktat-Segmente des Termins mit dem lokalen LLM und
// schreibt das Smalltalk-Flag. Die Lena-Seite ruft das automatisch (debounced)
// waehrend des Diktats auf — der Dialog kuerzt Belangloses dann von selbst.
router.post("/treatment/smalltalk", async (req, res) => {
  try {
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const r = await flagSmalltalk(k.clientId, k.locationId, k.appointmentId);
    res.set("Cache-Control", "no-store");
    if (!r.ok) return res.status(502).json(r);
    res.json(r);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/billing — BEMA/BEMA+/GOZ-Vorschlaege aus der Doku (lokales
// LLM mit Katalog-Grounding, deterministischer Fallback). Ersetzt die
// OpenAI-Cloud-Function generateTreatmentBilling.
router.post("/treatment/billing", async (req, res) => {
  try {
    const actor = await structureBillingActor(req);
    if (!actor.ok) return res.status(actor.error === "invalid_token" ? 401 : 403).json({ ok: false, error: actor.error });
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const r = await billTreatment(k.clientId, k.locationId, k.appointmentId, { updatedBy: actor.updatedBy });
    res.set("Cache-Control", "no-store");
    if (!r.ok) {
      const code = r.error === "no_content" ? 409 : 502;
      return res.status(code).json(r);
    }
    res.json(r);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// POST /treatment/lena-stt-url — der Lena-STT-Launcher (start-lena-stt.ps1)
// meldet hier die aktuelle oeffentliche wss-Adresse des STT-Dienstes; das
// Backend veroeffentlicht sie nach settings/lenaStt (public read). Die Web-App
// loest die Adresse ZUR LAUFZEIT von dort auf (wie settings/masRuntime) — der
// Cloudflare-Quick-Tunnel wechselt bei jedem Neustart, und der STT-Dienst zieht
// spaeter auf einen anderen Server um; nur die Firestore-URL aendert sich dann.
//
// Schutz: Ist LENA_STT_PUBLISH_TOKEN gesetzt, muss der Request ihn tragen
// (Header x-lena-token ODER Body token), damit niemand die STT-Adresse der
// Praxis von aussen umbiegen kann.
router.post("/treatment/lena-stt-url", async (req, res) => {
  try {
    const want = String(process.env.LENA_STT_PUBLISH_TOKEN || "").trim();
    if (want) {
      const got = String(req.get("x-lena-token") || req.body?.token || "").trim();
      if (got !== want) return res.status(403).json({ ok: false, error: "forbidden" });
    }
    const url = String(req.body?.url || "").trim().replace(/\/+$/, "");
    // Nur oeffentliche wss-URLs (kein ws:// aus dem LAN — der HTTPS-Client
    // wuerde es ohnehin als Mixed-Content blockieren).
    if (!/^wss:\/\/[^\s]+$/i.test(url)) {
      return res.status(400).json({ ok: false, error: "bad_url" });
    }
    await admin.firestore().collection("settings").doc("lenaStt").set({
      wsUrl: url,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, wsUrl: url });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// GET /treatment/lena-stt-url — oeffentliche wss-Adresse fuer iPad-Companion.
// Bevorzugt den stabilen MAS-Named-Tunnel-Proxy (/lena-stt → lokal :8140),
// Fallback: settings/lenaStt (Quick-Tunnel, oft tot).
router.get("/treatment/lena-stt-url", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const pub = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
    if (/^https:\/\//i.test(pub)) {
      const wss = pub.replace(/^https:\/\//i, "wss://") + "/lena-stt";
      return res.json({ ok: true, wsUrl: wss, via: "mas-proxy" });
    }
    if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(pub)) {
      const wss = pub.replace(/^http:\/\//i, "ws://") + "/lena-stt";
      return res.json({ ok: true, wsUrl: wss, via: "mas-proxy-local" });
    }
    const snap = await admin.firestore().collection("settings").doc("lenaStt").get();
    const url = String(snap.data()?.wsUrl || "").trim().replace(/\/+$/, "");
    if (!/^wss:\/\/[^\s]+$/i.test(url)) {
      return res.json({ ok: false, wsUrl: "" });
    }
    res.json({ ok: true, wsUrl: url, via: "firestore" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
