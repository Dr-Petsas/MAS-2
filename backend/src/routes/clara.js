// Clara-Kern (/clara/*): Sessions, Identifikation, Team, Sophie-Zuleitung, QR/Connect-Seiten.
// Mechanischer W1.2-Split aus server.js (04.07.2026): Pfade und Handler
// byte-identisch uebernommen, nur app. -> router. Kein Verhalten geaendert.
// MUSS als letzter Router gemountet werden (/clara/:clientId-Catch-alls).
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import QRCode from "qrcode";
import { assertAppEnabled } from "../entitlements.js";
import { getClientSpecialty } from "../lena/specialty.js";
import { resolveSpec } from "../lena/domainKnowledge.js";
import { loadOverlay } from "../lena/lenaLearn.js";
import { createClaraSession } from "../clara/session.js";
import { intakeToAbsichten } from "../clara/billingIntake.js";
import { cacheSophieKatalog } from "../clara/sophieKatalog.js";
import { resolveAppointmentInfo, readAppointmentSegments, combineActiveSegments } from "../clara/treatmentDoc.js";
import { appendAbrechnungsHinweis, getAbrechnungsMemo, pruefeAbrechnung } from "../clara/dokuAbrechnung.js";
import { askWorkforce as wfAsk, setBetriebsferien as wfSetBetriebsferien, spokenBetriebsferien as wfSpokenBetriebsferien, parseDateFromText as wfParseDate } from "../clara/workforce.js";
import { createSession, endSession, setOperator } from "../clara/sessions.js";
import { listDirectory, upsertDirectoryEntry, removeDirectoryEntry } from "../clara/directory.js";
import { identifyByPin, listOperators, saveOperators, OPERATOR_ROLES, roleLabel } from "../clara/operators.js";
import { identifyByDevice, callOperator, consumePendingCallContext } from "../clara/devices.js";
import { getGreetingContext } from "../clara/greetingContext.js";
import { listPatientNamesForStt } from "../clara/sttPatientNames.js";
import { runClaraHealth, statusPageHtml } from "../clara/health.js";
import { runMorgenlauf } from "../clara/morgenlauf.js";
import { recordToolError, recentToolErrors } from "../clara/toolErrors.js";
import { loadProof, proofToSvg } from "../clara/proofCard.js";
import { narrateChapter, chatGuide, synthClaraVoice, ttsConfigured } from "../clara/tourNarrate.js";
import { CLARA_PROFILE_ID, DEFAULT_CLIENT_ID, PUBLIC_BASE_URL, qmRoute, resolveClientId } from "./_shared.js";

const router = express.Router();
// __dirname zeigt wie vor dem Split auf src/ (routes/ liegt eine Ebene tiefer).
const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");


// --- Clara liest Maries Dienstplan (Team/Urlaub/Anwesenheit, read-only) ---
// Eine Frage, eine Antwort: Resturlaub, Anwesenheit (heute/Tag/Vormittag/
// Nachmittag), Besetzung ("genug Helferinnen?"), Arbeitszeiten, Krank-/Urlaubs-
// Auskunft. Deterministisch aus Maries Firestore — niemand wird geraten.
router.get("/clara/team/ask", qmRoute(async (clientId, req, res) => {
  const q = String(req.query?.q || "").trim();
  const r = await wfAsk(clientId, q);
  res.json({ ok: true, clientId, ...r });
}));


// --- Fähigkeits-Tour (Audio-Menü): Clara erzählt pro Kapitel, was sie kann ---
// Volle Prompt-Anpassung: das Frontend schickt Titel + Kapitel-Prompt, Clara
// formuliert die Ansage über das lokale LLM und (falls ElevenLabs konfiguriert)
// liefert das Audio in ihrer Stimme gleich mit. Kein Patientenbezug.
router.post("/clara/tour/narrate", qmRoute(async (clientId, req, res) => {
  const body = { ...(req.body || {}) };
  const title = String(body.title || "").slice(0, 160);
  const prompt = String(body.prompt || "").slice(0, 2000);
  const fallbackText = String(body.text || body.fallbackText || "").slice(0, 2000);
  const wantAudio = body.audio !== false && body.audio !== "false";

  const spoken = await narrateChapter({ title, prompt, fallbackText });
  const out = { ok: !!spoken.text, clientId, text: spoken.text, source: spoken.source, model: spoken.model || null, ttsConfigured: ttsConfigured() };

  if (wantAudio && spoken.text && ttsConfigured()) {
    const audio = await synthClaraVoice(spoken.text);
    if (audio.ok) { out.audioBase64 = audio.audioBase64; out.mime = audio.mime; }
    else out.audioReason = audio.reason;
  }
  res.json(out);
}));


// Echtes Gespräch im Tour-Modus: Clara erklärt als Guide ihr Können und nennt
// Beispiel-Kommandos. Das Frontend schickt den bisherigen Dialog (messages) oder
// einen einzelnen Text; Clara antwortet mit Text + (falls möglich) ihrer Stimme.
// Kein Patientenbezug, keine Aktionen — reine Selbst-Erklärung.
router.post("/clara/tour/chat", qmRoute(async (clientId, req, res) => {
  const body = { ...(req.body || {}) };
  const wantAudio = body.audio !== false && body.audio !== "false";
  let history = Array.isArray(body.messages) ? body.messages : [];
  if (!history.length && body.text) history = [{ role: "user", content: String(body.text) }];

  const spoken = await chatGuide(history);
  const out = { ok: !!spoken.text, clientId, text: spoken.text, source: spoken.source, model: spoken.model || null, ttsConfigured: ttsConfigured() };

  if (wantAudio && spoken.text && ttsConfigured()) {
    const audio = await synthClaraVoice(spoken.text);
    if (audio.ok) { out.audioBase64 = audio.audioBase64; out.mime = audio.mime; }
    else out.audioReason = audio.reason;
  }
  res.json(out);
}));


// --- Aktion: Betriebsferien eintragen + alle per Push informieren ---
// Zweistufig wie alle Clara-Aktionen: ohne confirm=true nur Vorschau (was
// passieren WÜRDE), erst mit confirm=true wird geschrieben + gepusht. So kann
// Clara den Zeitraum vorlesen und auf das ausdrückliche "Ja" warten.
router.post("/clara/team/betriebsferien", qmRoute(async (clientId, req, res) => {
  const body = { ...(req.query || {}), ...(req.body || {}) };
  const q = String(body.q || "").trim();
  // Daten aus Feldern ODER aus dem Freitext (z.B. "von 23.12. bis 6.1.").
  let from = String(body.from || "").trim();
  let to = String(body.to || "").trim();
  if (!from || !to) {
    const m = q.match(/(?:von\s+)?(\d{1,2}\.\s*\d{1,2}\.(?:\s*\d{2,4})?)\s*(?:bis|-|–)\s*(\d{1,2}\.\s*\d{1,2}\.(?:\s*\d{2,4})?)/i);
    if (m) { from = from || wfParseDate(m[1]) || ""; to = to || wfParseDate(m[2]) || ""; }
  } else {
    // erlaubte Eingabe als dd.mm.(yyyy) ODER yyyy-mm-dd
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) from = wfParseDate(from) || from;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) to = wfParseDate(to) || to;
  }
  const note = String(body.note || "").trim();
  const confirm = body.confirm === true || body.confirm === "true";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.json({ ok: true, clientId, intent: "betriebsferien_preview", spoken: "Für die Betriebsferien brauche ich ein klares Von- und Bis-Datum, zum Beispiel: vom 23. Dezember bis zum 6. Januar." });
  }
  if (!confirm) {
    const de = (x) => { const m = x.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}.${m[2]}.${m[1]}` : x; };
    return res.json({ ok: true, clientId, intent: "betriebsferien_preview", confirmRequired: true, from, to, spoken: `Soll ich Betriebsferien von ${de(from)} bis ${de(to)} eintragen, alle Mitarbeiter per Push informieren und die Tage vom Urlaub abziehen? Sag Ja, dann mache ich das.` });
  }
  const result = await wfSetBetriebsferien(clientId, { fromYmd: from, toYmd: to, note, by: "Clara", notify: true });
  res.status(result.ok ? 200 : 400).json({ ok: result.ok, clientId, intent: "betriebsferien", ...result, spoken: wfSpokenBetriebsferien(result) });
}));


// --- Live session channel ------------------------------------------------
// The PC (platform Clara page / CalendR) starts a session; the "live_session"
// pointer makes it the active one. Voice tools resolve it by clientId and push
// UI commands that the PC follows in real time.
router.post("/clara/session-start", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const { sessionId } = await createSession(clientId, req.body?.sessionId);
    res.json({ ok: true, clientId, sessionId });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Sophie-Abrechnung: Kurzschrift/Diktat → strukturierte Behandlungsabsichten
// { konzept, attrs } via lokalem LLM. Reine Verständnis-Schicht — KEINE Ziffern;
// die berechnet die deterministische Sophie-Engine im Frontend. Additiv, ohne
// Vertrag zu bestehenden Routen. Fällt bei LLM-Ausfall sauber auf ok:false.
router.post("/clara/billing-intake", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.json({ ok: false, reason: "empty", absichten: [], unbekannt: [] });
    const zahn = String(req.body?.zahn || "").trim();
    const katalog = req.body?.katalog || {};
    const beispiele = Array.isArray(req.body?.beispiele) ? req.body.beispiele : [];
    // 7d+: den mitgeschickten Katalog serverseitig spiegeln, damit Clara am
    // Telefon/Headset gesprochene Behandlungen OHNE Frontend erkennen kann.
    if (katalog && Array.isArray(katalog.konzepte) && katalog.konzepte.length) {
      cacheSophieKatalog(katalog).catch(() => {});
    }
    const out = await intakeToAbsichten({ text, zahn, katalog, beispiele });
    res.json(out);
  } catch (e) {
    res.json({ ok: false, reason: "error", detail: String(e?.message || e), absichten: [], unbekannt: [] });
  }
});


router.post("/clara/session-end", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const out = await endSession(clientId, req.body?.sessionId);
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Sophie-Zuleitung von der Lena-Seite (Masterplan W-LENA, 04.07.2026) ----
// Abrechnungsrelevante Hinweise zu EINEM Termin eintippen/diktieren — landet
// im selben Abrechnungs-Arbeitsstand (mas_abrechnung_memo), den auch Claras
// Diktat-Trennung fuellt: IMMER mit Bezug auf Patient/Datum/Termin. Nach dem
// Merken laeuft die stille Sophie-Sonde (klinische Doku + alle Hinweise) und
// meldet die naechste Gegenfrage bzw. "alles beisammen" zurueck.
// Additiv — bestehende Routen und Formate unveraendert.

/** Nachname aus "Vorname Nachname" ziehen (fuer den Arbeitsstand-Vermerk). */
function lastNameOf(patientName) {
  const teile = String(patientName || "").trim().split(/\s+/);
  return teile.length ? teile[teile.length - 1] : "";
}


router.get("/clara/sophie-hinweis", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const appointmentId = String(req.query?.appointmentId || "").trim();
    if (!appointmentId) return res.status(400).json({ ok: false, message: "appointmentId fehlt." });
    const memo = await getAbrechnungsMemo(clientId, appointmentId);
    res.json({ ok: true, clientId, appointmentId, ...memo });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/clara/sophie-hinweis", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const text = String(req.body?.text || "").trim();
    const appointmentId = String(req.body?.appointmentId || "").trim();
    if (!appointmentId) return res.status(400).json({ ok: false, message: "appointmentId fehlt." });
    if (!text) return res.status(400).json({ ok: false, message: "Kein Hinweis-Text." });

    const info = await resolveAppointmentInfo(clientId, { appointmentId });
    if (!info?.ok) return res.status(404).json({ ok: false, message: info?.message || "Termin nicht gefunden." });
    const patientId = info.patientId || String(req.body?.patientId || "").trim();
    const lastName = lastNameOf(info.patientName) || String(req.body?.lastName || "").trim();

    await appendAbrechnungsHinweis(clientId, info.appointmentId, { text, patientId, lastName });

    // Klinischen Gesamttext des Termins dazu lesen, damit die Sonde beides
    // sieht (Doku + Hinweise) — genau wie beim Clara-Diktat. Best-effort.
    let combined = "";
    try {
      const segs = await readAppointmentSegments(clientId, info.locationId, info.appointmentId);
      combined = combineActiveSegments(segs);
    } catch { /* Sonde laeuft dann nur auf den Hinweisen */ }

    const sonde = await pruefeAbrechnung(clientId, {
      appointmentId: info.appointmentId,
      klinischText: combined,
      explizit: true,
      patientId,
      lastName,
    }).catch(() => null);

    const memo = await getAbrechnungsMemo(clientId, info.appointmentId);
    res.json({
      ok: true,
      clientId,
      appointmentId: info.appointmentId,
      patientId,
      patientName: info.patientName || "",
      motiveName: info.motiveName || "",
      apptStartMs: info.apptStartMs || 0,
      hinweise: memo.hinweise,
      sophie: sonde
        ? { status: sonde.status, frage: sonde.frage, label: sonde.label, zeile: sonde.zeile }
        : null,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice-Worker: WARUM hat Clara angerufen? Wird beim Verbinden EINMALIG
// abgeholt (consume), damit ein Push-initiiertes Gespräch thematisch startet
// ("Ich habe dich angerufen: morgen ist wenig los ...") statt bei Null.
router.post("/clara/pending-context", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const context = await consumePendingCallContext(clientId);
    res.json({ ok: true, context: context || null });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice-Worker: Gibt es ein FRISCHES auffaelliges Ereignis (<= 45 min), das
// Clara direkt nach dem Hallo erwaehnen kann? (W-HUMAN Stufe 2, 10.07.2026:
// "Starts sollen interessant sein - das letzte auffaellige Ereignis, wenn es
// zeitlich passt.") Nicht-konsumierend, rein lesend; kein Treffer -> null.
// WICHTIG: Route steht VOR den /clara/:clientId-Catch-alls.
router.get("/clara/greeting-context", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const context = await getGreetingContext(clientId);
    res.json({ ok: true, context: context || null });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Voice-Worker: Patientennamen aus dem Kalenderfenster
// (letzte 2 Wochen + diese + naechste Woche) als STT-Bias.
// WICHTIG: Route steht VOR den /clara/:clientId-Catch-alls.
router.get("/clara/stt-patient-names", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const force = String(req.query?.force || "") === "1";
    const out = await listPatientNamesForStt(clientId, { force });
    // Fachrichtung + Auto-Lern-Overlay mitliefern (Chef 24.07.): lena_stt waehlt
    // daraus die passende Fachwissens-Nachkorrektur und wendet zusaetzlich die
    // automatisch gelernten Verhoerungs-Fixes an — alles in EINEM Call.
    let specialty = "";
    try { specialty = await getClientSpecialty(clientId); } catch { /* optional */ }
    const spec = resolveSpec(specialty);
    let knowledge = { verhoerungen: [], begriffe: [] };
    try { knowledge = await loadOverlay(spec); } catch { /* Overlay optional */ }
    res.json({
      ok: true,
      clientId,
      locationId: out.locationId || "",
      from: out.from || "",
      to: out.to || "",
      source: out.source || "calendar",
      count: out.count,
      lastCount: out.lastCount || 0,
      firstCount: out.firstCount || 0,
      memoryCount: out.memoryCount || 0,
      todayCount: out.todayCount || 0,
      tomorrowCount: out.tomorrowCount || 0,
      cached: !!out.cached,
      specialty,
      spec,
      knowledge,
      names: out.names,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Clara voice channel -------------------------------------------------
// Mint a LiveKit join token for a browser session. The voice worker (reused
// v5.2 pipeline, run as an instance) joins the same room and drives STT->LLM->TTS.
router.post("/clara/session", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const profileId = (req.body?.profileId || CLARA_PROFILE_ID).trim();
    const pipelineRaw = String(req.body?.pipeline || "").trim().toLowerCase();
    const pipeline = pipelineRaw === "text" ? "text" : "";
    const session = await createClaraSession({ clientId, profileId, pipeline });
    // Optional identification — two PIN-less-friendly paths:
    //   a) paired phone: deviceId + deviceKey (from the QR pairing) resolve the
    //      operator without any typing — that's the "Clara ruft an" flow;
    //   b) personal PIN (car / shared devices) as before.
    let operator = null;
    let pinError = null;
    const deviceId = (req.body?.deviceId || "").trim();
    const deviceKey = (req.body?.deviceKey || "").trim();
    const pin = (req.body?.pin || "").trim();
    if (deviceId && deviceKey) {
      const op = await identifyByDevice(clientId, deviceId, deviceKey);
      if (op) { await setOperator(clientId, op); operator = { name: op.name, role: op.role }; }
      else { pinError = "device_invalid"; }
    } else if (pin) {
      const op = await identifyByPin(clientId, pin);
      if (op) { await setOperator(clientId, op); operator = { name: op.name, role: op.role }; }
      // Be honest: a wrong PIN must NOT silently fall back to an anonymous
      // operator (which would give the wrong role-scoped briefing). The token is
      // still minted so the channel works, but the UI shows the PIN was rejected.
      else { pinError = "pin_invalid"; }
    }
    res.json({ ok: true, ...session, operator, pinError });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Stand-alone identification (used by the phone/car page and the in-app tab):
// exchange a personal PIN for the operator on the active live session.
const identifyAttempts = new Map(); // key -> { count, resetAt }
function throttleIdentify(key) {
  const now = Date.now();
  const rec = identifyAttempts.get(key);
  if (!rec || now > rec.resetAt) {
    identifyAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  rec.count += 1;
  return rec.count <= 8; // max 8 PIN tries per minute per client+IP
}


router.post("/clara/identify", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const key = `${clientId}:${req.ip || ""}`;
    if (!throttleIdentify(key)) {
      return res.status(429).json({ ok: false, error: "too_many_attempts" });
    }
    const op = await identifyByPin(clientId, req.body?.pin);
    if (!op) return res.status(401).json({ ok: false, error: "pin_invalid" });
    await setOperator(clientId, op);
    res.json({ ok: true, operator: { name: op.name, role: op.role } });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Praxis-Verzeichnis (Kollegen mit Kontaktdaten) -----------------------
// Chef 27.07.2026: "Koennen wir alle Aerzte, Telefonnummer und E-Mails
// permanent speichern?" Genau dafuer. Von Hand gepflegt, wird von keinem
// Mail-/Anruf-Import ueberschrieben; find_contact und contact_card lesen es
// VOR der Patientenkartei (dort liegen gleichnamige Alt-Datensaetze).
router.get("/clara/directory", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    res.json({ ok: true, clientId, entries: await listDirectory(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/clara/directory", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const eintrag = await upsertDirectoryEntry(clientId, req.body || {});
    res.json({ ok: true, clientId, entry: eintrag, entries: await listDirectory(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.delete("/clara/directory", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const r = await removeDirectoryEntry(clientId, req.body?.name || req.query?.name || "");
    res.json({ ok: true, clientId, ...r, entries: await listDirectory(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Operator team & PINs ------------------------------------------------
// The roster of people who may identify themselves to Clara via a personal PIN.
// PINs are stored only as salted hashes (see operators.js); the API never
// returns or accepts the plaintext after saving (an empty pin keeps the old one).
router.get("/clara/team", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const members = await listOperators(clientId);
    const roles = Object.values(OPERATOR_ROLES).map((id) => ({ id, label: roleLabel(id) }));
    res.json({ ok: true, clientId, members, roles });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.put("/clara/team", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const r = await saveOperators(clientId, req.body?.members || []);
    const members = await listOperators(clientId);
    res.json({ ok: true, clientId, count: r.count, members });
  } catch (e) {
    // Map validation errors to a clear 400 with the offending member's name.
    if (e?.code) return res.status(400).json({ error: e.code, who: e.who || "" });
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Service/authenticated: ring ALL phones of a team member. This is the hook the
// proactive briefings (scheduler) will use: "Clara ruft Dr. X an".
router.post("/clara/call-operator", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const operatorId = (req.body?.operatorId || "").trim();
    if (!operatorId) return res.status(400).json({ ok: false, error: "operator_id_required" });
    const reason = (req.body?.reason || "").trim();
    const r = await callOperator(clientId, operatorId, { reason, publicBaseUrl: PUBLIC_BASE_URL });
    res.status(r.ok ? 200 : 502).json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Live-Stack-Health als JSON (nebenwirkungsfrei, keine PII). Speist die
// Status-Seite. MUSS vor "/clara/:clientId" stehen, sonst faengt der Catch-all
// "health" als clientId ab.
router.get("/clara/health", async (req, res) => {
  try {
    const h = await runClaraHealth();
    res.status(h.overall === "green" ? 200 : 503).json(h);
  } catch (e) {
    res.status(500).json({ overall: "red", error: String(e?.message || e), checks: [] });
  }
});


// W-STABIL-4 "Fehler-als-Zustand": der Voice-Worker meldet technische
// Tool-Ausfaelle (Route tot, 500, Netzwerkfehler) — roter Eintrag statt
// leiser Leere. Die Status-Seite zeigt Stoerungen der letzten Stunde rot.
router.post("/clara/tool-error", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const tool = String(req.body?.tool || "").trim();
    if (!tool) return res.status(400).json({ ok: false, error: "tool_required" });
    const out = await recordToolError(clientId, {
      tool,
      error: String(req.body?.error || ""),
      source: String(req.body?.source || "worker"),
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});


// Stoerungen der letzten Stunde (Diagnose, read-only).
router.get("/clara/tool-errors", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const errors = await recentToolErrors(clientId, {});
    res.json({ ok: true, count: errors.length, errors });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});


// Morgenlauf von Hand ausloesen (W-STABIL-6): Ping + Verkaufskern-Register,
// Ergebnis optional als Push. NICHT oeffentlich (Service-Token/Login noetig).
// ?push=0 bzw. body {push:false} unterdrueckt den Push (Handtest nachts).
router.post("/clara/morgenlauf/run", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const push = !(req.query?.push === "0" || req.body?.push === false);
    const out = await runMorgenlauf(clientId, { publicBaseUrl: PUBLIC_BASE_URL, push });
    res.status(out.ok ? 200 : 503).json(out);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});


// System-Status-Seite (GRUEN/ROT pro Komponente, Auto-Refresh). Read-only,
// loest keine Aktionen aus -> sicher gegen Live.
router.get("/clara/:clientId/status", (req, res) => {
  res.type("html").send(statusPageHtml((req.params.clientId || DEFAULT_CLIENT_ID).trim()));
});


// Per-tenant QR landing page: shows a QR that opens the connect page on a phone.
router.get("/clara/:clientId", async (req, res) => {
  const clientId = (req.params.clientId || DEFAULT_CLIENT_ID).trim();
  // Best-effort: ensure an active live session exists so calendar tools have a
  // target to push UI commands to (the platform sets its own on mount).
  let sessionId = "";
  try {
    ({ sessionId } = await createSession(clientId));
  } catch {
    sessionId = "";
  }
  const connectUrl =
    `${PUBLIC_BASE_URL}/clara/${encodeURIComponent(clientId)}/connect` +
    (sessionId ? `?session=${encodeURIComponent(sessionId)}` : "");
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(connectUrl, { width: 320, margin: 1 });
  } catch {
    qrDataUrl = "";
  }
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clara verbinden</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;
       margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{background:#1e293b;border-radius:20px;padding:32px;max-width:420px;text-align:center;
        box-shadow:0 20px 60px rgba(0,0,0,.4)}
  h1{margin:0 0 4px;font-size:24px}
  p{color:#94a3b8;margin:8px 0 20px}
  img{background:#fff;border-radius:12px;padding:12px}
  a.btn{display:inline-block;margin-top:20px;background:#6366f1;color:#fff;text-decoration:none;
        padding:12px 22px;border-radius:10px;font-weight:600}
  code{color:#cbd5e1;font-size:12px}
  .status{margin-top:18px;display:inline-flex;align-items:center;gap:8px;padding:7px 14px;
          border-radius:999px;font-size:13px;font-weight:600;text-decoration:none}
  .status .d{width:10px;height:10px;border-radius:50%;background:currentColor}
  .status.green{background:rgba(34,197,94,.15);color:#86efac}
  .status.red{background:rgba(239,68,68,.15);color:#fca5a5}
  .status.load{background:rgba(148,163,184,.15);color:#cbd5e1}
</style></head><body>
<div class="card">
  <h1>Mit Clara sprechen</h1>
  <p>Scanne den QR-Code mit dem Handy oder klicke unten.</p>
  ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" width="320" height="320">` : `<p>QR nicht verfügbar</p>`}
  <div><a class="btn" href="${connectUrl}">Jetzt verbinden</a></div>
  <p style="margin-top:18px"><code>Praxis: ${clientId}</code></p>
  <div><a id="st" class="status load" href="/clara/${encodeURIComponent(clientId)}/status"><span class="d"></span><span id="stt">System-Status...</span></a></div>
</div>
<script>
(function(){
  function set(cls,txt){var a=document.getElementById('st');if(!a)return;a.className='status '+cls;document.getElementById('stt').textContent=txt;}
  fetch('/clara/health',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){
    if(d&&d.overall==='green'){set('green','System: alles gruen');}
    else{var bad=((d&&d.checks)||[]).filter(function(c){return !c.ok;}).map(function(c){return c.name;}).join(', ');set('red','System-Problem: '+(bad||'siehe Status'));}
  }).catch(function(){set('red','Status nicht abrufbar');});
})();
</script>
</body></html>`);
});


// The connect page itself (static HTML reads :clientId from the URL via JS).
// Termin-Bildbeleg (SVG) fuer Push und Chat-Vorschau auf dem Handy.
router.get("/clara/proof/:clientId/:proofId.svg", async (req, res) => {
  try {
    const clientId = (req.params.clientId || "").trim();
    const proofId = String(req.params.proofId || "").replace(/\.svg$/i, "");
    const proof = await loadProof(clientId, proofId);
    if (!proof) return res.status(404).type("text/plain").send("Beleg nicht gefunden");
    res.set("Cache-Control", "public, max-age=86400");
    res.type("image/svg+xml").send(proofToSvg(proof));
  } catch (e) {
    res.status(500).type("text/plain").send(String(e?.message || e));
  }
});


router.get("/clara/:clientId/connect", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "clara", "connect.html"));
});

export default router;
