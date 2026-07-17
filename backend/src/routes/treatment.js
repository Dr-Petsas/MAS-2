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
import { structureTreatment, billTreatment, flagSmalltalk } from "../lena/lenaDoc.js";
import { appendEvent, deleteEventsByIdPrefix } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";
import { identifyByDevice } from "../clara/devices.js";
import { getActiveRecording } from "../clara/sessions.js";
import { getDayAppointments, todayBerlin } from "../clara/daySchedule.js";
import { resolveChairAppointment, matchCalendarId } from "../clara/treatmentRecording.js";
import { getPatientAnamnese, clip } from "../clara/anamnese.js";

const _DOKU_MEMORY_TAGE = 45;
// React-Frontend (Firebase Hosting) — dort liegt /dictate/... fuer die Lena-iframe.
const PLATFORM_WEB_URL = (process.env.PLATFORM_WEB_URL || "https://docgenda.web.app").replace(/\/+$/, "");

const router = express.Router();

const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

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
      dictateUrl,
    });
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

    const segRef = ref.collection("dictations").doc();
    await segRef.set({
      id: segRef.id,
      text,
      lang,
      source,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // W-LENA-7: Doku sichtbar fuers ganze Haus — dasselbe Shared-Memory-Event
    // (Kanal lena_doc, 45 Tage) wie saveTreatmentDictation, damit auch die per
    // Sprach-Diktat/Tee erfassten Segmente in Cockpit-/Patienten-Timeline
    // mitlesen. Best-effort; der Diktat-Eintrag oben bleibt die fuehrende Quelle.
    try {
      const o = snap.data() || {};
      const subjId = String(o.patientId || o.patient?.id || "").trim();
      const subjName = `${o.patient?.firstName || ""} ${o.patient?.lastName || ""}`.trim();
      const kurz = text.length > 420 ? text.slice(0, 417) + "..." : text;
      await appendEvent(k.clientId, {
        id: `lena-doc:${k.appointmentId}:${segRef.id}`,
        channel: CHANNELS.LENA_DOC,
        type: EVENT_TYPES.NOTE,
        direction: DIRECTIONS.INTERNAL,
        counterparty: { kind: "system", name: "Lena", ref: null },
        subject: subjId
          ? { patientId: subjId, name: subjName, matchStatus: "matched", matchMethod: "name" }
          : { name: subjName, matchStatus: "unmatched" },
        status: "none",
        summary: `Behandlungsdokumentation (Lena, ${source}): ${kurz}`,
        payloadRef: { kind: "dictation", id: segRef.id },
        extractor: "lena@lena-segment",
        tags: ["lena", "dokumentation", "behandlung"],
        expiresAtMs: Date.now() + _DOKU_MEMORY_TAGE * 86400000,
      });
    } catch (memErr) {
      // Shared-Memory ist Komfort — Segment ist bereits geschrieben.
      console.warn("lena-segment: brain-event failed:", memErr?.message || memErr);
    }

    res.set("Cache-Control", "no-store");
    res.json({ ok: true, dictationId: segRef.id });
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
    await segRef.set({
      text,
      // Nach Edit neu klassifizieren lassen (Strukturierung).
      smalltalk: admin.firestore.FieldValue.delete(),
      section: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, dictationId: actor.dictationId, text });
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
