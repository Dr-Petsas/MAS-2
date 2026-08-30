// Sammel-Router: /health, /anamnese, /lisa, /cf, /admin, /remote.
// Mechanischer W1.2-Split aus server.js (04.07.2026): Pfade und Handler
// byte-identisch uebernommen, nur app. -> router. Kein Verhalten geaendert.
import express from "express";
import { assertAppEnabled } from "../entitlements.js";
import { getPatientAnamnese } from "../clara/anamnese.js";
import {
  proxyGetFreeTimeSlots, proxyCreateAppointment, proxyUpdateOrCancel,
  proxyGetDoctorAbsences, proxyFindPatientAppointments, proxyCancelAppointmentById,
} from "../clara/cfProxy.js";
import { listLisaTasks, getLisaTaskDetail, getLisaTaskAudio, smsConfigured as lisaSmsConfigured, callConfigured as lisaCallConfigured } from "../lisa/outbound.js";
import { backfillAddressBook } from "../brain/addressBook.js";
import { llmHealth } from "../mail/llm.js";
import { AUTH_ENFORCED, SERVICE_TOKEN } from "../auth.js";
import { remoteTokenOk, addRemoteMessage, remoteState, setRemoteBoard, pendingRemoteMessages, ackRemoteMessages, saveRemoteFile } from "../remoteChat.js";
import { meldeFall, listeFaelle, letztesGespraech, probiereNamen, hoerprobe, wiederholungslauf, merkeNachweis, sprachmeldung, sprachnotizPfad, improveDialog, KATEGORIEN } from "../improve.js";
import { zentraleListe, zentraleAnzahl, setzeStand } from "../improveZentrale.js";
import admin from "../firebase.js";
import { log } from "../log.js";
import { exportTenant, eraseTenant, applyRetention } from "../dsgvo.js";
import { DEFAULT_CLIENT_ID, resolveClientId, resolveUser } from "./_shared.js";

const router = express.Router();


router.get("/health", (req, res) => {
  // Liveness only. Don't leak the configured tenant in production.
  res.json(AUTH_ENFORCED ? { ok: true } : { ok: true, defaultClientId: DEFAULT_CLIENT_ID });
});


// Readiness: verifies the process can actually serve — Firestore reachable +
// required config present. Returns 503 when not ready so an orchestrator can
// hold traffic. Reports only booleans, never secret values.
router.get("/health/ready", async (req, res) => {
  const checks = {
    firestore: false,
    mailCryptoKey: !!(process.env.MAIL_CRYPTO_KEY || "").trim(),
    storageBucket: false,
    authEnforced: AUTH_ENFORCED,
    serviceToken: !!SERVICE_TOKEN,
  };
  try {
    // Cheap connectivity probe: get a non-existent doc (no read cost on data).
    await admin.firestore().collection("_health").doc("_probe").get();
    checks.firestore = true;
  } catch (e) {
    log.error("readiness firestore probe failed", { requestId: req.requestId, err: e });
  }
  try {
    checks.storageBucket = !!admin.storage().bucket()?.name;
  } catch {
    checks.storageBucket = false;
  }
  // Local LLM (Nadine's brain): report reachability + on-prem locality. Not a
  // hard readiness gate — if the model is down Nadine degrades to deterministic
  // templates — but operators must see it, and that it never points to a cloud.
  const llm = await llmHealth();
  checks.llmReachable = llm.reachable;
  checks.llmLocal = llm.local;
  checks.llm = { base: llm.base, model: llm.model, local: llm.local, reachable: llm.reachable, reason: llm.reason };
  // Brain dead-letter visibility: any communication whose event/case write
  // failed and exhausted its retries lands here. Not a hard gate, but operators
  // MUST see it — a non-zero count means a logged communication needs attention.
  try {
    const deadSnap = await admin.firestore().collectionGroup("mas_brain_outbox").where("status", "==", "dead").limit(100).get();
    checks.brainOutboxDead = deadSnap.size;
  } catch {
    checks.brainOutboxDead = null; // index not ready / probe failed — non-fatal
  }
  const ready = checks.firestore; // Firestore is the hard dependency.
  res.status(ready ? 200 : 503).json({ ok: ready, checks });
});


// Adressbuch-Backfill von Hand anstoßen (?force=1 ignoriert den Einmal-Marker).
router.post("/admin/addressbook/backfill", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const force = req.query?.force === "1" || req.body?.force === true;
    const out = await backfillAddressBook(clientId, { force });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// 1e-vor) ANAMNESE-FLAGS fuer das Termin-Popup (Frontend): gleiche Auswertung
// wie Claras Tool, aber strukturiert als JSON. Deckt seit 04.07.2026 auch
// SIGNIERTE Boegen ab — der Server liest die Textebene des PDFs
// (anamnesePdf.js) und cached das Ergebnis. Der Browser kann das nicht
// selbst (Storage-Zugriff + PDF-Parsing gehoeren auf den Server).
router.post("/anamnese/flags", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const patientId = String(req.body?.patientId || "").trim();
    if (!patientId) return res.status(400).json({ error: "patientId fehlt" });
    const result = await getPatientAnamnese(clientId, { patientId });
    return res.json(result);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Monitor: recent Lisa delegations (SMS + calls) with status/outcome.
router.get("/lisa/tasks", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const tasks = await listLisaTasks(clientId, Math.min(Number(req.query.limit) || 25, 100));
    res.json({ ok: true, clientId, smsConfigured: lisaSmsConfigured(), callConfigured: lisaCallConfigured(), tasks });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Gesprächs-Popup (Lisa-Arbeitsplatz): EIN Anruf mit Zeitmarken-Transkript
// und Metadaten. Das Transkript wird nach dem ersten Abruf am Task gecacht.
router.get("/lisa/tasks/:id/detail", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const out = await getLisaTaskDetail(clientId, req.params.id);
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 400).json(out);
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Audio-Mitschnitt eines Lisa-Anrufs (Proxy zu ElevenLabs — der API-Key bleibt
// auf dem Server). Wird vom <audio>-Element geladen, das keine Header setzen
// kann: das Firebase-Token kommt deshalb als ?t=… mit (siehe auth.js).
router.get("/lisa/tasks/:id/audio", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const out = await getLisaTaskAudio(clientId, req.params.id);
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 400).json(out);
    res.set("Content-Type", out.contentType);
    res.set("Cache-Control", "private, max-age=3600");
    res.send(out.buffer);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Cloud Function proxy (the worker's built-in tools post here) ---------
// booking.cf_base_url in Clara's profile points at /cf, so the proven v5.2
// deterministic booking flow runs unchanged and we emit live commands here.
// We return the real Cloud Function response verbatim so the worker is unaware.
function sendCf(res, out) {
  return res.status(out.status || 200).json(out.data == null ? {} : out.data);
}


router.post("/cf/getFreeTimeSlots", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    sendCf(res, await proxyGetFreeTimeSlots(clientId, req.body || {}));
  } catch (e) {
    res.status(500).json({ status: "error", message: String(e?.message || e) });
  }
});


router.post("/cf/createAppointment", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    sendCf(res, await proxyCreateAppointment(clientId, req.body || {}));
  } catch (e) {
    res.status(500).json({ status: "error", message: String(e?.message || e) });
  }
});


router.post("/cf/agentGetDoctorAbsences", async (req, res) => {
  try {
    sendCf(res, await proxyGetDoctorAbsences(req.body || {}));
  } catch (e) {
    res.status(500).json({ status: "error", message: String(e?.message || e) });
  }
});


router.post("/cf/agentFindPatientAppointments", async (req, res) => {
  try {
    sendCf(res, await proxyFindPatientAppointments(req.body || {}));
  } catch (e) {
    res.status(500).json({ status: "error", message: String(e?.message || e) });
  }
});


router.post("/cf/agentCancelAppointmentById", async (req, res) => {
  try {
    sendCf(res, await proxyCancelAppointmentById(req.body || {}));
  } catch (e) {
    res.status(500).json({ status: "error", message: String(e?.message || e) });
  }
});


router.post("/cf/updateOrCancelAppointment", async (req, res) => {
  try {
    sendCf(res, await proxyUpdateOrCancel(req.body || {}));
  } catch (e) {
    res.status(500).json({ status: "error", message: String(e?.message || e) });
  }
});


// ── DSGVO / GDPR data lifecycle (admin only, own tenant only) ──────────────
// Authorization: must be an admin (or service/superuser context). clientId is
// always the caller's own tenant from resolveClientId — a normal user token
// cannot target another practice. Erasure additionally requires an explicit
// confirmation matching the clientId to guard against accidents.

function requireAdmin(req, res) {
  const { isAdmin } = resolveUser(req);
  if (!isAdmin) {
    res.status(403).json({ ok: false, error: "admin_required" });
    return false;
  }
  return true;
}


// Art. 20 — export all MAS-owned data for the tenant as a single JSON document.
router.get("/admin/tenant/export", async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const includeSecrets = req.query.includeSecrets === "1";
    const out = await exportTenant(clientId, { includeSecrets });
    log.warn("dsgvo export", { requestId: req.requestId, clientId, includeSecrets });
    res.set("Content-Disposition", `attachment; filename="mas-export-${clientId}.json"`);
    res.json(out);
  } catch (e) {
    next(e);
  }
});


// Art. 17 — erase all MAS-owned data for the tenant. Destructive; dry run by
// default unless { confirm: <clientId> } is provided in the body.
router.post("/admin/tenant/erase", async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const confirm = (req.body?.confirm || "").trim();
    const dryRun = confirm !== clientId; // only a matching confirm performs the wipe
    const out = await eraseTenant(clientId, { dryRun });
    log[dryRun ? "info" : "warn"]("dsgvo erase", {
      requestId: req.requestId, clientId, dryRun, totalDocs: out.totalDocs, totalFiles: out.totalFiles,
    });
    res.json({ ...out, confirmRequired: dryRun ? clientId : undefined });
  } catch (e) {
    next(e);
  }
});


// Retention purge of transient data (trashed mail, ended sessions). Dry run by
// default; pass { apply: true } to actually delete.
router.post("/admin/tenant/retention", async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const dryRun = req.body?.apply !== true;
    const trashDays = Number(req.body?.trashDays) > 0 ? Number(req.body.trashDays) : 30;
    const sessionDays = Number(req.body?.sessionDays) > 0 ? Number(req.body.sessionDays) : 90;
    const out = await applyRetention(clientId, { trashDays, sessionDays, dryRun });
    log.info("dsgvo retention", { requestId: req.requestId, clientId, dryRun, ...out });
    res.json(out);
  } catch (e) {
    next(e);
  }
});


// --- Fernsteuerungs-Chat (Wochenend-Provisorium) ---------------------------
// Statische Seite (Firebase Hosting) <-> dieses Backend <-> lokaler Waechter,
// der eine Agent-Session startet. Token-gated, sonst nutzlos. Siehe
// src/remoteChat.js und tools/remote_chat_watch.ps1.

function remoteGuard(req, res) {
  if (remoteTokenOk(req)) return true;
  res.status(401).json({ ok: false, error: "remote_token_invalid" });
  return false;
}


router.post("/remote/message", async (req, res) => {
  try {
    if (!remoteGuard(req, res)) return;
    const out = await addRemoteMessage(DEFAULT_CLIENT_ID, {
      role: req.body?.role, text: req.body?.text, speaker: req.body?.speaker,
    });
    res.status(out.ok ? 200 : 400).json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});


// --- AI IMPROVE: Pflege-/Verbesserungs-Modul der Praxis --------------------
// Auftrag Dr. Petsas 09.08.2026: sichtbares Modul statt internes Testwerkzeug.
// Auth laeuft wie bei allen Routen hier ueber die globale Pruefung in
// server.js — die Seite zeigt Gespraechsinhalte und ist entsprechend geschuetzt.
// Siehe src/improve.js (dort auch die Ehrlichkeitsregel zu Kennzahlen).

// Feste Auswahl statt Freitext: fuehrt den Inhaber in Sekunden zur richtigen
// Schublade, statt ihn Romane schreiben zu lassen.
router.get("/improve/kategorien", (req, res) => {
  res.json({ ok: true, kategorien: KATEGORIEN });
});


// Vorschau: Welches Gespraech wird beim Melden angehaengt? Der Inhaber soll
// VOR dem Absenden sehen, worauf sich seine Meldung bezieht.
router.get("/improve/last", async (req, res) => {
  try {
    // W-MANDANT-1: nur die Aufnahmen des eigenen Mandanten anbieten.
    const g = await letztesGespraech({ clientId: resolveClientId(req) });
    if (!g) return res.json({ ok: true, gespraech: null });
    const fragen = g.zuege.filter((z) => z.rolle === "user");
    res.json({
      ok: true,
      gespraech: {
        id: g.id, begonnen: g.begonnen,
        fragen: fragen.length,
        mit_ton: fragen.filter((z) => z.audio).length,
        erste_frage: fragen[0]?.text || "",
        letzte_frage: fragen[fragen.length - 1]?.text || "",
      },
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});


// HOERPROBE: Der gesprochene Name geht an denselben Erkennungsdienst, den
// Clara im Anruf benutzt. Erst dessen Ergebnis geht danach in die Suche —
// getippte Namen beweisen nichts ueber das Hoeren.
router.post("/improve/hoertest", async (req, res) => {
  try {
    const roh = String(req.body?.audio || "");
    const wav = Buffer.from(roh.replace(/^data:[^,]*,/, ""), "base64");
    if (wav.length > 12 * 1024 * 1024) return res.status(400).json({ ok: false, fehler: "Aufnahme zu lang" });
    res.json(await hoerprobe(wav));
  } catch (e) {
    res.status(400).json({ ok: false, fehler: String(e?.message || e) });
  }
});


// LIVE-NAMENSPROBE: schickt einen Namen durch die echte Suche und meldet jede
// Stufe, sobald sie fertig ist (laufender Datenstrom). So sieht man den
// Korrekturweg entstehen, statt am Ende nur ein Ergebnis zu bekommen.
router.get("/improve/nametest", async (req, res) => {
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  const sende = (stufe, daten) => {
    res.write(`data: ${JSON.stringify({ stufe, ...daten })}\n\n`);
  };
  try {
    await probiereNamen(resolveClientId(req), req.query?.name, sende);
  } catch (e) {
    sende("ergebnis", { urteil: { art: "nichts", text: "Probe fehlgeschlagen: " + String(e?.message || e) } });
  }
  res.write("data: {\"stufe\":\"fertig\"}\n\n");
  res.end();
});


// SPRACHMELDUNG: "Clara, Fehler melden" ueber das Headset. Der Sprach-Worker
// laeuft auf derselben Maschine und meldet ueber localhost; es gibt dort keinen
// angemeldeten Benutzer, deshalb traegt die Meldung die Praxis im Rumpf.
// Absichtlich derselbe Weg wie von der Improve-Seite: ein ganz normaler Fall
// samt zentralem Eintrag, E-Mail und Nachweis.
router.post("/improve/sprachmeldung", async (req, res) => {
  try {
    const clientId = String(req.body?.clientId || "").trim();
    if (!clientId) return res.status(400).json({ ok: false, error: "clientId fehlt" });
    const erg = await sprachmeldung(clientId, {
      anruf: req.body?.anruf,
      audio: req.body?.audio,
      text: req.body?.text,
    });
    return res.json(erg);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Die Tonaufnahme einer Sprachmeldung abspielen (nur Superuser). Der Ton geht
// UNGEFILTERT heraus — ausdruecklich so gewuenscht (Chef 10.08.2026), damit im
// Zweifel hoerbar ist, was wirklich gesagt wurde, Patientennamen eingeschlossen.
router.get("/improve/zentrale/ton", async (req, res) => {
  if (!nurSuperuser(req, res)) return;
  const pfad = sprachnotizPfad(req.query?.anruf, req.query?.datei);
  if (!pfad) return res.status(400).json({ ok: false, error: "unbekannte Aufnahme" });
  // dotfiles: Die Aufnahmen liegen unter ".run" — einem Ordner mit fuehrendem
  // Punkt. Ohne diese Erlaubnis haelt Express ihn fuer versteckt und antwortet
  // stur mit 404, obwohl die Datei da ist. Der Ausbruchsschutz sitzt eine
  // Zeile hoeher in sprachnotizPfad, nicht in dieser Regel.
  return res.sendFile(pfad, {
    dotfiles: "allow",
    headers: { "Content-Type": "audio/wav" },
  }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ ok: false, error: "Aufnahme nicht gefunden" });
  });
});

// WIEDERHOLUNGSLAUF: Der aufgenommene Anruf geht erneut durch die heutige
// Erkennung — damals gegen heute, Zug fuer Zug. Damit wird aus dem letzten
// Schritt der Anzeige ("Nachweis der Lösung") ein Beleg statt eines
// Versprechens. Laeuft als Datenstrom, weil jede Aufnahme einzeln kommt.
router.get("/improve/wiederholung", async (req, res) => {
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  // Wird ein Fall mitgegeben, klebt das Ergebnis danach an ihm — nur so kann
  // der Verlauf spaeter zeigen, was sich zwischen damals und heute geaendert
  // hat, statt nur zu behaupten, es sei etwas geschehen.
  const fall = String(req.query?.fall || "").trim();
  const mandant = resolveClientId(req);
  let letztes = null;
  const sende = (stufe, daten) => {
    if (stufe === "ergebnis") letztes = daten;
    res.write(`data: ${JSON.stringify({ stufe, ...daten })}\n\n`);
  };
  try {
    await wiederholungslauf(
      // W-MANDANT-1: der Lauf sieht nur Aufnahmen des eigenen Mandanten.
      { anruf: req.query?.anruf, gemeinterName: req.query?.name, clientId: mandant },
      sende,
    );
    if (fall && mandant && letztes && !letztes.fehler) {
      await merkeNachweis(mandant, fall, letztes);
    }
  } catch (e) {
    sende("ergebnis", { fehler: String(e?.message || e) });
  }
  res.write("data: {\"stufe\":\"fertig\"}\n\n");
  res.end();
});


router.post("/improve/case", async (req, res) => {
  try {
    // WER hat gemeldet? Bisher blieb das Feld leer, weil die Seite es nie
    // mitschickte — im zentralen Eingang stand dann "unbekannt". Der Name
    // kommt jetzt aus der Anmeldung, damit niemand ihn tippen muss und er
    // trotzdem immer dabei ist (Auftrag Dr. Petsas 10.08.2026).
    const von = String(req.body?.von || "").trim() || String(req.auth?.name || req.auth?.email || "").trim();
    const out = await meldeFall(resolveClientId(req), {
      text: req.body?.text, meldung_von: von,
      kategorie: req.body?.kategorie, schwere: req.body?.schwere, name: req.body?.name,
    });
    if (!out.ok) return res.status(400).json(out);
    res.json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});


router.get("/improve/cases", async (req, res) => {
  try {
    res.json({ ok: true, faelle: await listeFaelle(resolveClientId(req), { limit: Number(req.query?.limit) || 50 }) });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// Nach der Meldung: ueber den Fehler reden (Chef 14.08.2026).
router.post("/improve/gespraech", async (req, res) => {
  try {
    const out = await improveDialog(resolveClientId(req), {
      fallId: req.body?.fallId || req.body?.fall,
      text: req.body?.text,
    });
    if (!out.ok && out.reason === "fall_not_found") return res.status(404).json(out);
    if (!out.ok && out.reason === "fall_required") return res.status(400).json(out);
    res.json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});


// --- ZENTRALER MELDEEINGANG (nur Superuser) -------------------------------
// Auftrag Dr. Petsas 10.08.2026: alle Kunden auf einem Blatt, damit die Faelle
// sichtbar werden, die nur per Code zu loesen sind. Diese Routen sehen ueber
// ALLE Praxen — deshalb hier eine eigene, harte Schranke: Ein Praxis-Konto
// darf sie nie oeffnen, auch nicht versehentlich ueber einen geteilten Link.
function nurSuperuser(req, res) {
  const a = req.auth || {};
  if (a.kind === "user" && !a.superUser) {
    res.status(403).json({ ok: false, error: "superuser_only" });
    return false;
  }
  return true;
}

router.get("/improve/zentrale", async (req, res) => {
  if (!nurSuperuser(req, res)) return;
  try {
    const meldungen = await zentraleListe({
      nurCode: String(req.query?.code || "") === "1",
      nurOffen: String(req.query?.offen || "") === "1",
      limit: Number(req.query?.limit) || 100,
    });
    res.json({ ok: true, meldungen });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// Zaehler fuer den Hinweis im Superuser-Konto ("3 neue Meldungen").
router.get("/improve/zentrale/anzahl", async (req, res) => {
  if (!nurSuperuser(req, res)) return;
  try {
    res.json({ ok: true, ...(await zentraleAnzahl()) });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post("/improve/zentrale/stand", async (req, res) => {
  if (!nurSuperuser(req, res)) return;
  try {
    const out = await setzeStand(req.body?.id, {
      gelesen: req.body?.gelesen, status: req.body?.status, notiz: req.body?.notiz,
    });
    res.status(out.ok ? 200 : 400).json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});


// Datei vom Handy (Chef 09.08.2026): landet im Posteingang-Ordner auf diesem
// Rechner, in den Chat wandert nur eine Nachricht mit dem Ablageort.
router.post("/remote/upload", async (req, res) => {
  try {
    if (!remoteGuard(req, res)) return;
    const out = await saveRemoteFile(DEFAULT_CLIENT_ID, {
      name: req.body?.name, dataBase64: req.body?.data, note: req.body?.note,
    });
    res.status(out.ok ? 200 : 400).json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});


router.get("/remote/state", async (req, res) => {
  try {
    if (!remoteGuard(req, res)) return;
    const out = await remoteState(DEFAULT_CLIENT_ID, { limit: Number(req.query?.limit) || 80 });
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});


router.post("/remote/board", async (req, res) => {
  try {
    if (!remoteGuard(req, res)) return;
    res.json(await setRemoteBoard(DEFAULT_CLIENT_ID, req.body?.text));
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});


router.get("/remote/pending", async (req, res) => {
  try {
    if (!remoteGuard(req, res)) return;
    res.json({ ok: true, messages: await pendingRemoteMessages(DEFAULT_CLIENT_ID) });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});


router.post("/remote/ack", async (req, res) => {
  try {
    if (!remoteGuard(req, res)) return;
    res.json(await ackRemoteMessages(DEFAULT_CLIENT_ID, req.body?.ids, req.body?.status));
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
