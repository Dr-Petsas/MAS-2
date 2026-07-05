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

    const [recSnap, segSnap] = await Promise.all([
      ref.collection("treatment").doc("recorder").get(),
      ref.collection("dictations").orderBy("createdAt", "asc").limit(200).get(),
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

    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      patientName: `${o.patient?.firstName || ""} ${o.patient?.lastName || ""}`.trim(),
      doctorName: o.calendar?.name || "",
      visitMotive: o.visitMotive?.name || "",
      startMs: tsToMs(o.start),
      recorder: normalizeRecorder(recSnap.exists ? recSnap.data() : null),
      segments,
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

export default router;
