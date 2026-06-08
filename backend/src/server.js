import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import QRCode from "qrcode";
import { createTask, listOpenTasks } from "./tools/createTask.js";
import { assertAppEnabled } from "./entitlements.js";
import { createClaraSession } from "./clara/session.js";
import { findSlots, bookAppointment } from "./clara/booking.js";
import { createSession, emitCommand, endSession } from "./clara/sessions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// CORS: the platform (CalendR) runs on a different origin and calls the session
// endpoints from the browser. Allow it. ALLOWED_ORIGINS (comma-separated) locks
// this down in production; default "*" is fine for local dev.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").trim();
app.use((req, res, next) => {
  const origin = req.header("Origin");
  if (ALLOWED_ORIGINS === "*") {
    res.set("Access-Control-Allow-Origin", origin || "*");
  } else if (origin && ALLOWED_ORIGINS.split(",").map((s) => s.trim()).includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,X-Client-Id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "..", "public")));

const DEFAULT_CLIENT_ID = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
const CLARA_PROFILE_ID = (process.env.CLARA_PROFILE_ID || "clara_meddent").trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4000").trim();

// Tenant context: prefer the X-Client-Id header, then query/body clientId, then
// the configured default test client. Every tool runs inside exactly one tenant.
// Custom-tool webhooks (from the voice worker) cannot send headers, so clientId
// is carried in the tool URL's query string.
function resolveClientId(req) {
  return (
    req.header("X-Client-Id") ||
    req.query?.clientId ||
    req.body?.clientId ||
    DEFAULT_CLIENT_ID
  ).trim();
}

app.get("/health", (req, res) => {
  res.json({ ok: true, defaultClientId: DEFAULT_CLIENT_ID });
});

app.post("/tools/create-task", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const task = await createTask(clientId, req.body || {});
    res.status(201).json({ ok: true, clientId, task });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/tools/open-tasks", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const tasks = await listOpenTasks(clientId);
    res.json({ ok: true, clientId, count: tasks.length, tasks });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// --- Live session channel ------------------------------------------------
// The PC (platform Clara page / CalendR) starts a session; the "live_session"
// pointer makes it the active one. Voice tools resolve it by clientId and push
// UI commands that the PC follows in real time.
app.post("/clara/session-start", async (req, res) => {
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

app.post("/clara/session-end", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const out = await endSession(clientId, req.body?.sessionId);
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// --- Clara calendar tools (custom_tools called by the voice worker) -------
// These are MAS-2's own endpoints. They run the same Pickadoc Cloud Functions
// the phone agent uses AND emit live UI commands so the monitor follows along.
function spokenSlots(slots, max = 6) {
  return (slots || [])
    .slice(0, max)
    .map((iso) => String(iso).replace("T", " ").slice(0, 16))
    .join(", ");
}

app.post("/tools/find-slots", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const result = await findSlots(clientId, req.body || {});
    if (!result.ok) {
      return res.json({ ok: false, message: `Keine Termine gefunden: ${result.error}` });
    }
    if (result.date) {
      await emitCommand(clientId, {
        type: "navigate",
        date: result.date,
        calendarId: result.calendarId,
        calendarName: result.calendarName,
        slots: (result.slots || []).slice(0, 12),
        visitMotiveName: result.visitMotiveName,
      });
    }
    const msg = result.slots.length
      ? `Freie Termine bei ${result.calendarName || "der Praxis"}: ${spokenSlots(result.slots)}.`
      : "Keine freien Termine im gewünschten Zeitraum.";
    res.json({ ok: true, message: msg, slots: result.slots, date: result.date });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/tools/book-appointment", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const result = await bookAppointment(clientId, req.body || {});
    if (!result.ok) {
      return res.json({ ok: false, message: `Buchung nicht möglich: ${result.error}` });
    }
    await emitCommand(clientId, {
      type: "appointment_created",
      date: result.date,
      slotIso: result.slotIso,
      calendarId: result.calendarId,
      calendarName: result.calendarName,
      patient: result.patient,
      visitMotiveName: result.visitMotiveName,
    });
    const who = `${result.patient.firstName} ${result.patient.lastName}`.trim();
    res.json({
      ok: true,
      message: `Termin gebucht für ${who} am ${String(result.slotIso).replace("T", " ").slice(0, 16)}.`,
      dryRun: !!result.dryRun,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// --- Clara voice channel -------------------------------------------------
// Mint a LiveKit join token for a browser session. The voice worker (reused
// v5.2 pipeline, run as an instance) joins the same room and drives STT->LLM->TTS.
app.post("/clara/session", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const profileId = (req.body?.profileId || CLARA_PROFILE_ID).trim();
    const session = await createClaraSession({ clientId, profileId });
    res.json({ ok: true, ...session });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Per-tenant QR landing page: shows a QR that opens the connect page on a phone.
app.get("/clara/:clientId", async (req, res) => {
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
</style></head><body>
<div class="card">
  <h1>Mit Clara sprechen</h1>
  <p>Scanne den QR-Code mit dem Handy oder klicke unten.</p>
  ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" width="320" height="320">` : `<p>QR nicht verfügbar</p>`}
  <div><a class="btn" href="${connectUrl}">Jetzt verbinden</a></div>
  <p style="margin-top:18px"><code>Praxis: ${clientId}</code></p>
</div></body></html>`);
});

// The connect page itself (static HTML reads :clientId from the URL via JS).
app.get("/clara/:clientId/connect", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "clara", "connect.html"));
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`[mas-2] tools backend listening on http://127.0.0.1:${PORT}`);
  console.log(`[mas-2] default test client: ${DEFAULT_CLIENT_ID}`);
});
