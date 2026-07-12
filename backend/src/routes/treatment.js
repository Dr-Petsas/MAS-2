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
import { structureTreatment, billTreatment, flagSmalltalk } from "../lena/lenaDoc.js";
import { appendEvent, deleteEventsByIdPrefix } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";

const _DOKU_MEMORY_TAGE = 45;

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

// POST /treatment/lena-segment — EIN Doku-Segment serverseitig anlegen
// (W-LENA-2 Teil 4). Nutzt der Clara-Worker, wenn er im Headset-Modus die
// Arzt-Stimme aus der LiveKit-Session an lena_stt tee't und die fertigen
// Finals als Segmente (source=arzt) ablegen muss. Gleiches Dokument-Layout
// wie die Plattform-CF submitTreatmentDictation ({id,text,lang,source,
// createdAt}). Vertrauensmodell wie die anderen Public-Routen hier: die drei
// nicht erratbaren IDs sind das Ticket; zusaetzlich muss der Termin existieren.
// Schutz: Ist LENA_STT_PUBLISH_TOKEN gesetzt, wird derselbe Token verlangt
// (der Worker laeuft auf derselben Maschine wie MAS und lena_stt).
router.post("/treatment/lena-segment", async (req, res) => {
  try {
    const want = String(process.env.LENA_STT_PUBLISH_TOKEN || "").trim();
    if (want) {
      const got = String(req.get("x-lena-token") || req.body?.token || "").trim();
      if (got !== want) return res.status(403).json({ ok: false, error: "forbidden" });
    }
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const text = String(req.body?.text || "").trim().slice(0, 20000);
    if (!text) return res.status(400).json({ ok: false, error: "empty_text" });
    const lang = String(req.body?.lang || "de-DE").slice(0, 12) || "de-DE";
    const source = String(req.body?.source || "arzt").slice(0, 20) || "arzt";

    const ref = apptRef(k.clientId, k.locationId, k.appointmentId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "appointment_not_found" });

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

// POST /treatment/structure — Diktat-Segmente klassifizieren (lokales LLM)
// und die Karteikarte deterministisch aus den ECHTEN Segmenttexten bauen.
// Ersetzt die OpenAI-Cloud-Function structureTreatmentNote (Quota tot,
// Patiententexte bleiben im Haus). Aufrufer: eingeloggte Plattform (Lena-Seite).
router.post("/treatment/structure", async (req, res) => {
  try {
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const by = String(req.auth?.name || req.auth?.email || req.auth?.userId || "mas-lena").slice(0, 60);
    const r = await structureTreatment(k.clientId, k.locationId, k.appointmentId, { updatedBy: by });
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
    const k = readIds(req);
    if (!k) return res.status(400).json({ ok: false, error: "bad_ids" });
    const by = String(req.auth?.name || req.auth?.email || req.auth?.userId || "mas-lena").slice(0, 60);
    const r = await billTreatment(k.clientId, k.locationId, k.appointmentId, { updatedBy: by });
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

export default router;
