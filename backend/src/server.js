import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import express from "express";
import QRCode from "qrcode";
import { completeTask } from "./tools/createTask.js";
import { assertAppEnabled } from "./entitlements.js";
import { createClaraSession } from "./clara/session.js";
import { findSlots, bookAppointment, loadBooking, resolveCalendar } from "./clara/booking.js";
import { getDayAppointments, computeDayBriefing, buildSpokenDayBriefing, buildSpokenDayList, buildSpokenMemoryHints, todayBerlin } from "./clara/daySchedule.js";
import { listLessons, proposeLesson, decideLesson, retireLesson } from "./brain/lessons.js";
import { getActivePrompt, publishPromptVersion, rollbackPrompt, listPromptVersions, promptVersionMetrics, PROMPT_AGENTS } from "./brain/livingPrompt.js";
import { reflectOnce } from "./brain/reflect.js";
import { runGapFill, gapFillOverview, approveCallList, buildSpokenGapBriefing } from "./clara/gapFill.js";
import { approveAndExecute, sweepRecallOutcomes, dailyInitiativeScan, snoozeInitiative, initiativeSuffix, recallStatusSpoken } from "./clara/recallCoach.js";
import { planAbsence, approveAbsence, sweepAbsenceRebookings, absenceStatusSpoken } from "./clara/absencePlanner.js";
import { runRetentionSweep, RETENTION_DAYS } from "./brain/retention.js";
import { lookupCaller, normalizePhone } from "./clara/callerLookup.js";
import { searchPatient, resolveBooking, commitBooking } from "./clara/agentBooking.js";
import {
  createSession,
  emitCommand,
  endSession,
  setPatientCandidates,
  getSelectedPatient,
  getPatientCandidates,
  clearSelectedPatient,
  setActiveCase,
  getActiveCase,
  clearActiveCase,
  setOperator,
  getOperator,
} from "./clara/sessions.js";
import {
  disambiguationQuestion, ordinalPick, narrowByPhoneFragment, narrowByExactName,
} from "./clara/patientDisambig.js";
import { identifyByPin, listOperators, saveOperators, normalizeRole, OPERATOR_ROLES, roleLabel } from "./clara/operators.js";
import {
  createPairingToken, redeemPairingToken, listDevices, removeDevice,
  identifyByDevice, refreshSubscription, callDevice, callOperator,
  vapidPublicKey, pushConfigured, consumePendingCallContext, notifyOperator,
} from "./clara/devices.js";
import { proxyGetFreeTimeSlots, proxyCreateAppointment, proxyUpdateOrCancel } from "./clara/cfProxy.js";
import { lisaSendSms, lisaStartCall, finalizeLisaCalls, listLisaTasks, smsConfigured as lisaSmsConfigured, callConfigured as lisaCallConfigured } from "./lisa/outbound.js";
import { appendEvent, queryRecent, queryByPatient, resolveItem, annotateEvent } from "./brain/eventStore.js";
import { buildBriefing, buildSpokenBriefing } from "./brain/briefing.js";
import { extractFromTranscript, extractPatientName } from "./brain/extractor.js";
import { resolvePatientSubject } from "./brain/identity.js";
import { createCase, getCase, listCases, listActiveCasesByPatientIds, addUpdate, setStatus, linkEventToCase, assignCase, getCaseContext, saveCaseDraft, attachEventId } from "./brain/caseStore.js";
import { buildCaseBriefing, buildSpokenCaseBriefing } from "./brain/caseBriefing.js";
import { recordCommunication } from "./brain/record.js";
import { enqueueBrainWrite, outboxHealth, processBrainOutbox } from "./brain/outbox.js";
import { listAccounts, createAccount, updateAccount, deleteAccount, getAccountPublic } from "./mail/accounts.js";
import { testImap, syncAccount, syncAll, sendMail } from "./mail/mailbox.js";
import { listMessages, getMessage, markRead, listContacts, getAttachmentUrl, getAttachmentData, setMessageClassification, deleteMessage, linkMessageToCase } from "./mail/store.js";
import { classifyWithLLM, deriveMailSignals } from "./mail/classify.js";
import { prepareCaseDraft } from "./mail/nadineAuto.js";
import { buildLetterPdf, letterFilename, archiveLetter, practiceFromClient } from "./mail/letter.js";
import { startMailScheduler } from "./mail/scheduler.js";
import { buildMailBriefing } from "./mail/briefing.js";
import { getLetterSettings, setLetterSettings } from "./mail/letterSettings.js";
import { saveLetterheadAsset, getLetterheadMeta, getLetterheadBuffer, deleteLetterheadAsset, listLetterheads, setActiveLetterhead, deleteLetterhead } from "./mail/letterhead.js";
import { saveLetterAsset, getLetterAssetMeta, getLetterAssetBuffer, deleteLetterAsset } from "./mail/letterAssets.js";
import { listBlocks, createBlock, updateBlock, deleteBlock, seedDefaultBlocks } from "./mail/letterBlocks.js";
import { draftLetter, llmInfo, letterContextSummary, rewritePassage } from "./mail/letterAI.js";
import { llmHealth, isLocalLlm } from "./mail/llm.js";
import { extractText } from "./mail/extract.js";
import { listRuns, getRun, startRun, cancelRun, runStatus, catalogInfo } from "./testtrain/runner.js";
import { listPlatformRuns, getPlatformRun, startPlatformRun, cancelPlatformRun, platformRunStatus, PLATFORM_GROUPS } from "./testtrain/platformRunner.js";
import { authMiddleware, AUTH_ENFORCED, SERVICE_TOKEN } from "./auth.js";
import admin from "./firebase.js";
import { log } from "./log.js";
import { exportTenant, eraseTenant, applyRetention } from "./dsgvo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "8mb" }));

// Request id + structured access log. We log method, route path (NOT the query
// string, which can carry patient names in ?q=), status, duration and the
// resolved tenant — never PII. The id is echoed in X-Request-Id for tracing.
app.use((req, res, next) => {
  const requestId = req.header("X-Request-Id") || randomUUID();
  req.requestId = requestId;
  res.set("X-Request-Id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    log.info("request", {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      clientId: req.auth?.clientId || undefined,
      auth: req.auth?.kind || undefined,
    });
  });
  next();
});

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
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  // ngrok-skip-browser-warning: das Frontend sendet ihn, damit der ngrok-Tunnel
  // (Produktion) keine Interstitial-Seite vor API-Antworten schaltet.
  res.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Client-Id,X-Service-Token,X-User-Id,X-User-Admin,ngrok-skip-browser-warning");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "..", "public")));

// Authentication: verify the caller (Firebase ID token or service secret) before
// any route runs. Public routes (/health, PIN-gated phone endpoints) are allowed
// through inside the middleware. See src/auth.js.
app.use(authMiddleware());

const DEFAULT_CLIENT_ID = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
const CLARA_PROFILE_ID = (process.env.CLARA_PROFILE_ID || "clara_meddent").trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4000").trim();

// Tenant context. A logged-in platform user is BOUND to the tenant in their
// verified token (claims.clientId) and cannot read another practice by changing
// a header. Superusers and trusted service/anon callers may target a tenant
// explicitly via X-Client-Id / query / body. Identity comes from auth.js — never
// from spoofable headers.
function resolveClientId(req) {
  const a = req.auth || {};
  if (a.kind === "user" && !a.superUser) {
    const cid = (a.clientId || "").trim();
    if (cid) return cid;
  }
  const explicit = (
    req.header("X-Client-Id") ||
    req.query?.clientId ||
    req.body?.clientId ||
    ""
  ).trim();
  if (explicit) return explicit;
  if (a.clientId) return a.clientId;
  // Dev convenience only: fall back to the test tenant when auth is not enforced.
  return AUTH_ENFORCED ? "" : DEFAULT_CLIENT_ID;
}

// Operator identity for mailbox scoping, derived from the verified token. A
// normal doctor (isAdmin=false) sees only their own + shared mailboxes; admins,
// service callers (voice worker), and the phone page act as the practice.
function resolveUser(req) {
  const a = req.auth || {};
  if (a.kind === "user") return { userId: a.userId || "", isAdmin: !!a.isAdmin };
  return { userId: "", isAdmin: true };
}

// Resolve which mailboxes the caller may see.
//
//   private  ⇒ NUR der Inhaber (ownerUserId === eingeloggter Benutzer).
//              Admin-Status spielt hier KEINE Rolle — privat ist privat.
//   praxis   ⇒ jedes eingeloggte Teammitglied (Admins eingeschlossen).
//
// Nicht-Browser-Aufrufer (Service-Token: Voice-Worker, Scheduler; Dev-Anon)
// behalten Vollzugriff — die Sprach-Tools scopen separat über die
// Geräte-Kopplung (operatorMailAccountIds).
async function mailAccess(clientId, req) {
  const a = req.auth || {};
  const all = await listAccounts(clientId);
  if (a.kind !== "user") return { isAdmin: true, userId: "", accounts: all, allowedIds: null };
  const userId = String(a.userId || "");
  const isAdmin = !!a.isAdmin;
  const accounts = all.filter((acc) =>
    acc.visibility === "private" ? (!!userId && acc.ownerUserId === userId) : true
  );
  return { isAdmin, userId, accounts, allowedIds: new Set(accounts.map((x) => x.id)) };
}

// Darf der Aufrufer die KONFIGURATION eines Kontos ändern/löschen?
//   private ⇒ nur der Inhaber. praxis ⇒ nur Admins.
async function canManageAccount(req, account) {
  const a = req.auth || {};
  if (a.kind !== "user") return true; // Service/Dev
  if (!account) return false;
  if (account.visibility === "private") return !!a.userId && account.ownerUserId === a.userId;
  return !!a.isAdmin;
}

// Guard a single message against the caller's mailbox scope. Returns true when
// the caller may touch it (admin, or the message belongs to an allowed mailbox).
function canSeeMessage(access, msg) {
  if (!access || access.allowedIds == null) return true;
  return !!msg && access.allowedIds.has(msg.accountId);
}

// Postfach-Scope für die SPRACH-Tools: Das gekoppelte Handy gehört EINEM
// Operator. Dessen Sicht = eigene Postfächer (ownerUserId === Operator-User)
// plus geteilte Praxis-Postfächer (ohne Owner) — analog zu mailAccess, nur
// dass die Identität hier aus der Geräte-Kopplung kommt, nicht aus dem Login.
// Liefert undefined (= alles) wenn kein Operator bekannt ist oder ohnehin
// keine Postfächer einem Besitzer zugeordnet sind.
async function operatorMailAccountIds(clientId) {
  try {
    const op = await getOperator(clientId);
    const uid = String(op?.id || "").trim();
    if (!uid) return undefined;
    const all = await listAccounts(clientId);
    // Eigene private Postfächer + alle Praxis-Postfächer.
    const own = all.filter((a) => a.visibility !== "private" || a.ownerUserId === uid);
    if (own.length === all.length) return undefined;
    return own.map((a) => a.id);
  } catch {
    return undefined;
  }
}

app.get("/health", (req, res) => {
  // Liveness only. Don't leak the configured tenant in production.
  res.json(AUTH_ENFORCED ? { ok: true } : { ok: true, defaultClientId: DEFAULT_CLIENT_ID });
});

// Readiness: verifies the process can actually serve — Firestore reachable +
// required config present. Returns 503 when not ready so an orchestrator can
// hold traffic. Reports only booleans, never secret values.
app.get("/health/ready", async (req, res) => {
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

// ONE task/ticket system: a delegation "task" is now a Case, so everything the
// team must act on lives in ONE place (Clara monitor + Nadine Aufträge + the
// briefing) instead of a parallel mas_tasks store that nothing surfaced. The
// task shape is preserved in the response for backward compatibility.
function caseAsTask(c) {
  return {
    id: c.id,
    text: c.title || "",
    status: c.status === "resolved" || c.status === "closed" ? "done" : "open",
    caseStatus: c.status,
    assignee: c.assignee || null,
    patientName: c.subject?.name || "",
    source: c.createdBy || "clara",
    createdAt: c.createdAt?.toMillis?.() ?? c.createdAt ?? null,
  };
}

app.post("/tools/create-task", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const body = req.body || {};
    const text = String(body.text || body.task || body.title || "").trim();
    const who = String(body.assignee || "").trim() || null;
    const by = String(body.by || body.source || "Clara").trim();
    const subjectName = String(body.patientName || body.name || "").trim();

    let subject = { name: subjectName, matchStatus: "unmatched", matchMethod: null };
    if (subjectName) {
      const s = await resolvePatientSubject(clientId, subjectName).catch(() => null);
      if (s?.patientId) subject = { patientId: s.patientId, name: s.name || subjectName, matchStatus: "matched", matchMethod: s.matchMethod || "name" };
    }

    const c = await createCase(clientId, {
      subject,
      topic: "other",
      title: text ? text.slice(0, 90) : (subjectName ? `Aufgabe – ${subjectName}` : "Aufgabe"),
      createdBy: by,
      assignee: who,
      status: "open",
      updates: text ? [{ by, kind: "note", text }] : [],
    });
    res.status(201).json({ ok: true, clientId, task: caseAsTask(c), caseId: c.id });
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
    const cases = await listCases(clientId, { activeOnly: true, limit: 200 });
    const tasks = cases.map(caseAsTask);
    res.json({ ok: true, clientId, count: tasks.length, tasks });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Mark a delegation task done. Backed by cases; falls back to the legacy
// mas_tasks store for any task id created before the unification.
app.post("/tools/tasks/:id/done", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const by = req.body?.by || "Team";
    const out = await setStatus(clientId, req.params.id, "resolved", { by, note: "Als erledigt markiert" });
    if (out.ok) return res.json({ ok: true, clientId, id: req.params.id, status: "resolved" });
    // Legacy fallback (id is an old mas_tasks doc).
    const legacy = await completeTask(clientId, req.params.id, { by });
    if (!legacy.ok) return res.status(legacy.reason === "not_found" ? 404 : 400).json({ ok: false, ...legacy });
    res.json({ ok: true, clientId, ...legacy });
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

// --- Shared brain: event pool + briefing ---------------------------------
// The append-only timeline every AI (Bianca, Lisa, Nadine, Clara) and the
// platform write to, and that the briefing / Q&A / revenue coach read from.
// All MAS-owned (mas_events), tenant-isolated, purely additive.

// Append one interaction/observation. Callers (voice workers, document
// automations, human notes) post a generic envelope; validation/normalisation
// happens in the brain. Idempotent on a stable `id`.
app.post("/brain/events", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const { event, created } = await appendEvent(clientId, req.body || {});
    // Actionable contacts are threaded into a follow-up case (consistent
    // follow-up). Best-effort: a case failure never blocks recording the fact.
    let caseLink = null;
    if (created && event.status === "open") {
      try {
        caseLink = await linkEventToCase(clientId, event, { by: req.body?.by });
      } catch (err) {
        caseLink = { error: String(err?.message || err) };
      }
    }
    res.status(created ? 201 : 200).json({ ok: true, clientId, created, event, case: caseLink });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Timeline read: by patient (?patientId=) or a recent time window
// (?sinceMinutes= , default 720 = 12h).
app.get("/brain/timeline", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const patientId = (req.query?.patientId || "").trim();
    let events;
    if (patientId) {
      events = await queryByPatient(clientId, patientId, Number(req.query?.limit) || 100);
    } else {
      const sinceMinutes = Number(req.query?.sinceMinutes) || 720;
      events = await queryRecent(clientId, Date.now() - sinceMinutes * 60_000);
    }
    res.json({ ok: true, clientId, count: events.length, events });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Mark an open item as handled. The executing AI (or a human at the monitor)
// closes it out — this is what stops it resurfacing and triggers no more
// outreach. Body: { actor, note? }.
app.post("/brain/events/:id/resolve", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await resolveItem(clientId, req.params.id, {
      actor: req.body?.actor,
      note: req.body?.note,
    });
    if (!out.ok) return res.status(404).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// The briefing: grouped, prioritised, only-open read-model + a German spoken
// text for Clara's TTS. ?sinceMinutes= sets the window (default 720).
app.get("/brain/briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const sinceMinutes = Number(req.query?.sinceMinutes) || 720;
    const windowStart = Date.now() - sinceMinutes * 60_000;
    const events = await queryRecent(clientId, windowStart);
    const briefing = buildBriefing(events, { windowStart });
    const greeting = (req.query?.greeting || "").trim() || undefined;
    const spokenText = buildSpokenBriefing(briefing, { greeting });
    res.json({ ok: true, clientId, briefing, spokenText });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Human correction overlay: a team member fixes a wrong summary/signal/patient
// before or after the call. The original extraction is preserved for audit.
// Body: { summary?, signals?, subject?, by?, note? }.
app.post("/brain/events/:id/annotate", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await annotateEvent(clientId, req.params.id, req.body || {});
    if (!out.ok) return res.status(404).json({ ok: false, ...out });
    res.json({ ok: true, clientId, event: out.event });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Ingest a call transcript -> extract signals -> append ONE brain event. This
// is the bridge from Bianca/Clara conversations into the shared brain. The
// voice worker posts the v5.2 transcript manifest on call end; the deterministic
// extractor turns it into an attributed, signal-tagged event.
// Body: { transcript, channel?, counterparty?, subject?, payloadRef?, ts? }.
app.post("/brain/ingest/transcript", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const transcript = req.body?.transcript;
    if (!transcript) return res.status(400).json({ error: "transcript required" });

    const channel = req.body?.channel || "bianca_call";
    const isClaraInternal = channel === "clara_voice";

    const extracted = await extractFromTranscript(transcript);

    // Clara-internal sessions: the counterparty is the OPERATOR (doctor), not a
    // patient — the patient-call extractor summary ("Laut Anruf: Patient ...")
    // would be wrong. Instead the summary is a digest of what the operator
    // actually said, so memos/instructions from the conversation are readable
    // by the whole team in the shared memory.
    let operatorParty = null;
    if (isClaraInternal) {
      const op = await getOperator(clientId).catch(() => null);
      const who = op?.name || "Operator";
      operatorParty = { kind: "other", name: who };
      const turns = Array.isArray(transcript?.turns) ? transcript.turns : [];
      const said = turns
        .filter((t) => (t?.role || "") === "user")
        .map((t) => String(t?.text || "").trim())
        .filter(Boolean)
        .join(" | ");
      extracted.summary = said
        ? `Clara-Gespräch mit ${who}: ${said.length > 420 ? `${said.slice(0, 417)}...` : said}`
        : `Clara-Gespräch mit ${who} ohne erkennbaren Inhalt.`;
    }

    // Identity: if the caller wasn't pre-identified, try the spoken/extracted
    // name against the patient DB so the call attaches to the right patient/case
    // automatically. Never guesses: 1 hit = matched, >1 = ambiguous, 0 = unmatched.
    // (Skipped for Clara-internal sessions — the speaker is the operator; the
    // self-intro name patterns would misattribute the session to a patient.)
    let subject = req.body?.subject || { matchStatus: "unmatched" };
    if (!subject.patientId && !isClaraInternal) {
      const nameHint = (subject.name || "").trim() || extractPatientName(transcript);
      if (nameHint) subject = await resolvePatientSubject(clientId, nameHint);
    }

    // Idempotency: a stable source id (call/session id) derives a deterministic
    // event id, so a retried or duplicated ingest is a no-op instead of a second
    // event (= a phantom extra contact on the case).
    const sourceId = (req.body?.sourceId || req.body?.callId || "").trim();
    const stableId = sourceId
      ? "evt_" + createHash("sha256").update(`${clientId}:${sourceId}`).digest("hex").slice(0, 24)
      : undefined;

    const { event, created } = await appendEvent(clientId, {
      id: stableId,
      channel,
      direction: req.body?.direction || (isClaraInternal ? "internal" : "in"),
      type: "interaction",
      counterparty: req.body?.counterparty || operatorParty || { kind: "patient" },
      subject,
      summary: extracted.summary,
      signals: extracted.signals,
      confidence: extracted.confidence,
      // Internal operator sessions are memory, not work items: the patient-call
      // signal rules (e.g. "termin" => appointmentRequest) would otherwise open
      // a phantom ticket for every single Clara conversation.
      status: isClaraInternal ? "none" : undefined,
      payloadRef: req.body?.payloadRef || null,
      extractor: req.body?.extractor || "rules@v1",
      ts: req.body?.ts,
    });
    let caseLink = null;
    if (created && event.status === "open") {
      try {
        caseLink = await linkEventToCase(clientId, event);
      } catch (err) {
        caseLink = { error: String(err?.message || err) };
      }
    }
    res.status(created ? 201 : 200).json({ ok: true, clientId, created, event, evidence: extracted.evidence, case: caseLink });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Read-only patient lookup for the brain dashboard (name -> candidates). Reuses
// the additive masSearchPatients CF; NO session side effects (unlike the voice
// search-patient tool).
app.get("/brain/patients", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const q = (req.query?.q || "").trim();
    if (!q) return res.json({ ok: true, clientId, patients: [] });
    const result = await searchPatient(clientId, q);
    if (!result.ok) return res.json({ ok: false, error: result.error });
    res.json({ ok: true, clientId, patients: result.patients || [] });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// --- Vorgänge (cases): the followed-up threads -----------------------------
// A case bundles repeat contacts about one matter and carries an append-only
// update log (who/when/what) plus a status, so the team always sees how far a
// problem is solved.

// List cases (?activeOnly=1 to hide resolved/closed, ?patientId= to scope).
app.get("/brain/cases", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const cases = await listCases(clientId, {
      patientId: (req.query?.patientId || "").trim() || undefined,
      activeOnly: req.query?.activeOnly === "1",
      assignee: (req.query?.assignee || "").trim() || undefined,
      limit: Number(req.query?.limit) || 100,
    });
    res.json({ ok: true, clientId, count: cases.length, cases });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Case-based briefing: one voice per matter, each line carries its caseId so
// the monitor/Clara can open the ticket. MUST be declared before "/cases/:id".
app.get("/brain/cases/briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const cases = await listCases(clientId, { activeOnly: true, limit: 200 });
    const briefing = buildCaseBriefing(cases); // dashboard = full inbox (no role filter)
    const greeting = (req.query?.greeting || "").trim() || undefined;
    res.json({ ok: true, clientId, briefing, spokenText: buildSpokenCaseBriefing(briefing, { greeting, operatorName: op?.name }) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/brain/cases/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const c = await getCase(clientId, req.params.id);
    if (!c) return res.status(404).json({ ok: false, reason: "not_found" });
    res.json({ ok: true, clientId, case: c });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Full context bundle for an assignee (Nadine/Lisa/human): case + linked events
// + a compiled plain-text briefing ready to act on.
app.get("/brain/cases/:id/context", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const ctx = await getCaseContext(clientId, req.params.id);
    if (!ctx) return res.status(404).json({ ok: false, reason: "not_found" });
    res.json({ ok: true, clientId, ...ctx });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Save a prepared email/letter draft on a case (Nadine's workspace).
// Body: { channel?, to?, subject?, body?, by? }.
app.post("/brain/cases/:id/draft", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await saveCaseDraft(clientId, req.params.id, req.body || {}, { by: req.body?.by });
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 400).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Send a case's prepared message via a mail account, then close the loop:
// log the send in the audit trail and resolve the case (unless keepOpen).
// Body: { accountId, to?, subject?, body?, by?, keepOpen? }.
app.post("/brain/cases/:id/send", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const c = await getCase(clientId, req.params.id);
    if (!c) return res.status(404).json({ ok: false, reason: "not_found" });

    const accountId = (req.body?.accountId || "").trim();
    if (!accountId) return res.status(400).json({ ok: false, reason: "account_required" });
    const to = (req.body?.to || c.draft?.to || "").trim();
    const subject = (req.body?.subject ?? c.draft?.subject ?? "").trim();
    const body = req.body?.body ?? c.draft?.body ?? "";
    const by = (req.body?.by || "Nadine").trim();
    if (!to) return res.status(400).json({ ok: false, reason: "no_recipient" });
    // Approval safety: never (re-)send a matter that is already settled. This
    // prevents a double patient mail if the button is hit twice or a stale tab
    // re-approves a closed case. Override with force:true for an explicit resend.
    if ((c.status === "resolved" || c.status === "closed") && req.body?.force !== true) {
      return res.status(409).json({ ok: false, reason: "case_already_closed", status: c.status });
    }
    if (!subject && !String(body).trim()) return res.status(400).json({ ok: false, reason: "empty_message" });

    const sent = await sendMail(clientId, accountId, { to: [to], subject, text: body });
    if (!sent.ok) return res.status(400).json({ ok: false, ...sent });

    // Explicit approval audit: WHO signed off, WHEN, and that it actually went out.
    await addUpdate(clientId, req.params.id, {
      by,
      kind: "note",
      text: `Freigegeben & gesendet von ${by} an ${to}${subject ? ` (Betreff: ${subject})` : ""}${sent.dryRun ? " [Testmodus]" : ""}.`,
    });

    // Record the send in the shared brain too (timeline parity with log-reply),
    // and keep the case's eventIds complete. Reliable: on failure the event is
    // queued in the dead-letter outbox instead of being silently lost.
    const eventInput = {
      id: sent.storedId ? `mail-out:${sent.storedId}` : undefined,
      channel: "nadine_email",
      direction: "out",
      type: "interaction",
      counterparty: { kind: c.subject?.patientId ? "patient" : "unknown", name: c.subject?.name || to, ref: to },
      subject: c.subject || { name: c.subject?.name || "" },
      summary: `E-Mail gesendet an ${to} — Betreff „${subject || "(kein Betreff)"}“: ${(() => { const t = String(body || "").trim(); return t.length > 600 ? t.slice(0, 600) + " …" : t; })() || "(kein Text)"}`,
      extractor: "nadine@case",
    };
    try {
      const { event } = await appendEvent(clientId, eventInput);
      await attachEventId(clientId, req.params.id, event.id, { by });
    } catch {
      await enqueueBrainWrite(clientId, { kind: "record", eventInput, by, link: false });
    }
    let status = c.status;
    if (!req.body?.keepOpen) {
      const r = await setStatus(clientId, req.params.id, "resolved", { by, note: "Per E-Mail beantwortet" });
      if (r.ok) status = "resolved";
    }
    res.json({ ok: true, clientId, messageId: sent.messageId, dryRun: !!sent.dryRun, status });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// --- Mail client (Nadine) -------------------------------------------------
// Per-practice IMAP/SMTP accounts (passwords encrypted at rest), inbox sync,
// message read models and sending. All tenant-scoped under mas_mail_*.

app.get("/mail/accounts", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const access = await mailAccess(clientId, req);
    res.json({ ok: true, clientId, accounts: access.accounts });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/mail/accounts", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const body = { ...(req.body || {}) };
    const a = req.auth || {};
    if (a.kind === "user") {
      if (String(body.visibility || "").toLowerCase() === "private") {
        // Privates Konto gehört standardmäßig dem Anleger; nur Admins dürfen
        // es für jemand anderen einrichten (z. B. MFA richtet das Postfach
        // des Behandlers ein).
        if (!body.ownerUserId || !a.isAdmin) body.ownerUserId = a.userId || "";
      } else if (!a.isAdmin) {
        // Praxis-Postfächer legen nur Admins an.
        return res.status(403).json({ error: "praxis_account_requires_admin" });
      }
    }
    const out = await createAccount(clientId, body);
    if (!out.ok) return res.status(400).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.patch("/mail/accounts/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const cur = await getAccountPublic(clientId, req.params.id);
    if (!cur) return res.status(404).json({ ok: false, reason: "not_found" });
    if (!(await canManageAccount(req, cur))) return res.status(403).json({ error: "account_forbidden" });
    const out = await updateAccount(clientId, req.params.id, req.body || {});
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 400).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.delete("/mail/accounts/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const cur = await getAccountPublic(clientId, req.params.id);
    if (cur && !(await canManageAccount(req, cur))) return res.status(403).json({ error: "account_forbidden" });
    res.json({ ok: true, clientId, ...(await deleteAccount(clientId, req.params.id)) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Test IMAP credentials without saving. Body: { host, port, secure, user, password }.
app.post("/mail/accounts/test", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const r = await testImap(req.body || {});
    res.json({ ok: true, clientId, ...r });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

// Pull new mail. Body: { accountId? } — one account, or all if omitted.
app.post("/mail/sync", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const accountId = (req.body?.accountId || "").trim();
    if (accountId) {
      const access = await mailAccess(clientId, req);
      if (access.allowedIds && !access.allowedIds.has(accountId)) return res.status(403).json({ error: "account_forbidden" });
    }
    const out = accountId ? await syncAccount(clientId, accountId) : await syncAll(clientId);
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/mail/messages", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const access = await mailAccess(clientId, req);
    const wantAccountId = (req.query?.accountId || "").trim() || undefined;
    // A specific mailbox was requested — it must be one the caller may see.
    if (wantAccountId && access.allowedIds && !access.allowedIds.has(wantAccountId)) {
      return res.status(403).json({ error: "account_forbidden" });
    }
    const messages = await listMessages(clientId, {
      accountId: wantAccountId,
      accountIds: access.allowedIds ? [...access.allowedIds] : undefined,
      folder: (req.query?.folder || "INBOX").trim(),
      limit: Number(req.query?.limit) || 50,
    });
    res.json({ ok: true, clientId, count: messages.length, messages });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/mail/messages/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const m = await getMessage(clientId, req.params.id);
    if (!m) return res.status(404).json({ ok: false, reason: "not_found" });
    const access = await mailAccess(clientId, req);
    if (!canSeeMessage(access, m)) return res.status(403).json({ error: "account_forbidden" });
    res.json({ ok: true, clientId, message: m });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/mail/messages/:id/read", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const access = await mailAccess(clientId, req);
    if (access.allowedIds) {
      const m = await getMessage(clientId, req.params.id);
      if (!canSeeMessage(access, m)) return res.status(403).json({ error: "account_forbidden" });
    }
    res.json({ ok: true, clientId, ...(await markRead(clientId, req.params.id, req.body?.seen !== false)) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Record a sent reply into the SHARED BRAIN. This is the "ticket" the team asked
// for: what the incoming mail said + what Nadine answered, threaded onto the
// patient's case so Clara and the briefing see it too. Logs the FINAL sent text,
// so any manual edit to Nadine's draft is captured. Best-effort and additive —
// failures here never affect the actual mail send.
app.post("/mail/messages/:id/log-reply", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });

    const msg = await getMessage(clientId, req.params.id);
    if (!msg) return res.status(404).json({ ok: false, reason: "not_found" });
    const access = await mailAccess(clientId, req);
    if (!canSeeMessage(access, msg)) return res.status(403).json({ error: "account_forbidden" });

    const clip = (s, n) => { const t = String(s || "").trim(); return t.length > n ? t.slice(0, n) + " …" : t; };
    const replyText = String(req.body?.replyText || "").trim();
    const senderName = msg.from?.name || "";
    const senderAddr = msg.from?.address || "";
    const senderLabel = senderName || senderAddr || "Unbekannt";
    const inbound = clip(msg.preview || msg.textBody, 500);

    // Resolve the patient so the entry threads onto the right person (best-effort).
    // E-mail address is the strongest identity, so we pass it alongside the name.
    let subject = { name: senderName };
    let isPatient = false;
    if (senderName || senderAddr) {
      const subj = await resolvePatientSubject(clientId, { name: senderName, email: senderAddr }).catch(() => null);
      if (subj?.patientId) { subject = { patientId: subj.patientId, name: subj.name || senderName, matchStatus: "matched", matchMethod: subj.matchMethod || "name" }; isPatient = true; }
    }

    // Translate the mail's classification into brain signals so the Vorgang gets
    // the RIGHT topic (Rechnung/Termin/Beschwerde …) instead of falling to
    // "other" — this is what makes the role-based briefing route correctly.
    const signals = deriveMailSignals({ category: msg.category, subject: msg.subject, text: msg.textBody || msg.preview });

    const summary = [
      `E-Mail von ${senderLabel} — Betreff „${msg.subject || "(kein Betreff)"}“: ${inbound || "(kein Text)"}`,
      `Nadine-Antwort: ${clip(replyText, 800) || "(leer)"}`,
    ].join("\n\n");

    // Reliable append + case-threading: on failure the work is queued in the
    // dead-letter outbox (never silently lost). Deterministic id makes a repeat
    // call idempotent (no duplicate ticket entries).
    const rec = await recordCommunication(clientId, {
      id: `mail-out:reply:${req.params.id}`,
      channel: "nadine_email",
      direction: "out",
      type: "interaction",
      counterparty: { kind: isPatient ? "patient" : "unknown", name: senderLabel, ref: senderAddr || null },
      subject,
      signals,
      summary,
      extractor: "nadine@mail",
      payloadRef: { kind: "mail", id: req.params.id },
    }, { by: "Nadine" });

    // Cross-link the mail to its case so the thread's e-mails are retrievable
    // (powers Nadine's letter/reply context). Best-effort, never blocks.
    const caseId = rec?.caseId || msg.caseId || null;
    if (caseId && caseId !== msg.caseId) {
      try { await linkMessageToCase(clientId, req.params.id, caseId); } catch { /* non-blocking */ }
    }

    res.json({ ok: true, clientId, eventId: rec?.eventId || null, caseId, queued: !!rec?.queued });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Delete a message: soft (→ Papierkorb) from a normal folder, permanent from the
// Papierkorb or with ?permanent=1.
app.delete("/mail/messages/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const access = await mailAccess(clientId, req);
    if (access.allowedIds) {
      const m = await getMessage(clientId, req.params.id);
      if (!canSeeMessage(access, m)) return res.status(403).json({ error: "account_forbidden" });
    }
    const permanent = req.query.permanent === "1" || req.body?.permanent === true;
    const out = await deleteMessage(clientId, req.params.id, permanent);
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 400).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// On-demand LLM refinement of a message's relevance/category (cached via
// aiClassifiedAt). Falls back gracefully to the keyword result if the model is off.
app.post("/mail/messages/:id/classify", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const m = await getMessage(clientId, req.params.id);
    if (!m) return res.status(404).json({ ok: false, reason: "not_found" });
    const access = await mailAccess(clientId, req);
    if (!canSeeMessage(access, m)) return res.status(403).json({ error: "account_forbidden" });
    const out = await classifyWithLLM({ subject: m.subject, fromAddress: m.from?.address, text: m.textBody || m.preview || "" });
    if (!out) return res.json({ ok: true, clientId, classified: false, category: m.category || null, relevant: m.relevant ?? null, relevanceReason: m.relevanceReason || null });
    await setMessageClassification(clientId, req.params.id, out);
    res.json({ ok: true, clientId, classified: true, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Direct send (compose without a case). Body: { accountId, to, subject, text, html?, cc?, attachments? }.
app.post("/mail/send", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const accountId = (req.body?.accountId || "").trim();
    if (!accountId) return res.status(400).json({ ok: false, reason: "account_required" });
    const access = await mailAccess(clientId, req);
    if (access.allowedIds && !access.allowedIds.has(accountId)) return res.status(403).json({ error: "account_forbidden" });
    const out = await sendMail(clientId, accountId, req.body || {});
    if (!out.ok) return res.status(400).json({ ok: false, ...out });

    // Every outgoing patient communication is logged to the shared brain right
    // here on the server — so the KI/manual reply and the compose path are all
    // covered, and the frontend can NEVER "send but forget to log". Reliable:
    // recordCommunication queues a retry on failure (dead-letter outbox).
    // Opt out with logToBrain:false (the case-send route does its own logging).
    let brain = null;
    if (req.body?.logToBrain !== false) {
      // recordCommunication is failure-safe (queues a retry instead of throwing);
      // the guard is purely defensive so brain logging can never break a send.
      brain = await logOutboundMail(clientId, { storedId: out.storedId, body: req.body || {} }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    }
    res.json({ ok: true, clientId, ...out, brain });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

/**
 * Log an outbound mail into the shared brain. When it answers an inbound message
 * (replyToMessageId) we reuse that mail's sender identity + classification so the
 * exchange threads onto the RIGHT patient/topic; otherwise we resolve the primary
 * recipient by e-mail. Threads a case for replies and for patient recipients;
 * non-patient one-off sends are logged append-only (no junk ticket).
 */
async function logOutboundMail(clientId, { storedId, body }) {
  const clip = (s, n) => { const t = String(s || "").trim(); return t.length > n ? t.slice(0, n) + " …" : t; };
  const toList = Array.isArray(body.to) ? body.to : (body.to ? [body.to] : []);
  const toAddr = String(toList[0] || "").trim();
  const replyToMessageId = String(body.replyToMessageId || "").trim();

  let subject = { name: "", matchStatus: "unmatched", matchMethod: null };
  let isPatient = false;
  let counterpartyName = toAddr || "Empfänger";
  let counterpartyRef = toAddr || null;
  let signals = deriveMailSignals({ subject: body.subject, text: body.text || body.html || "" });

  if (replyToMessageId) {
    const inbound = await getMessage(clientId, replyToMessageId).catch(() => null);
    if (inbound) {
      const senderName = inbound.from?.name || "";
      const senderAddr = inbound.from?.address || "";
      counterpartyName = senderName || senderAddr || counterpartyName;
      counterpartyRef = senderAddr || counterpartyRef;
      const subj = await resolvePatientSubject(clientId, { name: senderName, email: senderAddr }).catch(() => null);
      if (subj?.patientId) { subject = { patientId: subj.patientId, name: subj.name || senderName, matchStatus: "matched", matchMethod: subj.matchMethod || "email" }; isPatient = true; }
      else if (subj) { subject = { name: subj.name || senderName, matchStatus: subj.matchStatus || "unmatched", matchMethod: null }; }
      // Inbound classification gives the better topic than the reply subject alone.
      signals = deriveMailSignals({ category: inbound.category, subject: inbound.subject, text: inbound.textBody || inbound.preview || "" });
    }
  } else if (toAddr) {
    const subj = await resolvePatientSubject(clientId, { email: toAddr }).catch(() => null);
    if (subj?.patientId) { subject = { patientId: subj.patientId, name: subj.name || toAddr, matchStatus: "matched", matchMethod: subj.matchMethod || "email" }; isPatient = true; counterpartyName = subj.name || toAddr; }
  }

  const summary = `E-Mail gesendet an ${counterpartyName} — Betreff „${body.subject || "(kein Betreff)"}“: ${clip(body.text || body.html, 600) || "(kein Text)"}`;
  const link = !!replyToMessageId || isPatient; // thread replies + patient mail; log others append-only
  const result = await recordCommunication(clientId, {
    id: storedId ? `mail-out:${storedId}` : undefined,
    channel: "nadine_email",
    direction: "out",
    type: "interaction",
    counterparty: { kind: isPatient ? "patient" : "unknown", name: counterpartyName, ref: counterpartyRef },
    subject,
    signals,
    summary,
    extractor: "nadine@send",
    payloadRef: storedId ? { kind: "mail", id: storedId } : null,
  }, { by: "Nadine", link });

  // Cross-link the sent mail to its case so the thread stays retrievable.
  if (result?.caseId && storedId) {
    try { await linkMessageToCase(clientId, storedId, result.caseId); } catch { /* non-blocking */ }
  }
  return result;
}

// Brain dead-letter visibility for THIS tenant: how many communications are
// still queued for a retry (pending) or have exhausted retries (dead). The UI
// can show a banner so a dropped event/case write is never invisible.
app.get("/mail/brain/outbox", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const health = await outboxHealth(clientId);
    res.json({ ok: true, clientId, ...health });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Manually drain this tenant's outbox now (retry pending brain writes). Useful
// for ops and after a Firestore incident; the scheduler does this automatically.
app.post("/mail/brain/outbox/drain", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await processBrainOutbox(clientId, { limit: Number(req.body?.limit) || 50 });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Nadine's briefing read-model (new mail today, unread, delegation tasks).
app.get("/mail/briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await buildMailBriefing(clientId, { sinceMinutes: Number(req.query?.sinceMinutes) || 720 });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/mail/contacts", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await listContacts(clientId, {
      q: (req.query?.q || "").trim(),
      limit: Number(req.query?.limit) || 20,
      cursor: req.query?.cursor || null,
    });
    res.json({ ok: true, clientId, contacts: out.items, nextCursor: out.nextCursor });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Nadine's address book: the saved e-mail contacts (practice-relevant senders)
// PLUS, when searching, matching patients straight from the patient database. So
// Nadine has one place to look up anyone she corresponds with. Patient search is
// only run when a query is given (the patient DB is huge and name-indexed).
app.get("/mail/address-book", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const q = (req.query?.q || "").trim();
    const cb = await listContacts(clientId, { q, limit: Number(req.query?.limit) || 300, cursor: req.query?.cursor || null });
    const contacts = cb.items;
    const contactsCursor = cb.nextCursor;
    let patients = [];
    let patientsError = null;
    if (q && q.length >= 2) {
      const pr = await searchPatient(clientId, q).catch((e) => ({ ok: false, error: String(e?.message || e) }));
      if (pr.ok) patients = pr.patients || [];
      else patientsError = pr.error || "Patientensuche fehlgeschlagen";
    }
    res.json({ ok: true, clientId, contacts, contactsCursor, patients, patientsError });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Signed URL for a stored attachment (Cloud Storage). Frontend opens it.
app.get("/mail/messages/:id/attachments/:idx", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const access = await mailAccess(clientId, req);
    if (access.allowedIds) {
      const m = await getMessage(clientId, req.params.id);
      if (!canSeeMessage(access, m)) return res.status(403).json({ error: "account_forbidden" });
    }
    const out = await getAttachmentUrl(clientId, req.params.id, req.params.idx);
    if (!out.ok) return res.status(out.reason === "not_found" || out.reason === "no_attachment" ? 404 : 400).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Raw attachment bytes for inline preview/download. Opened directly via window.open
// (top-level navigation, so no CORS), with ?clientId=… for tenant resolution.
app.get("/mail/messages/:id/attachments/:idx/raw", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const access = await mailAccess(clientId, req);
    if (access.allowedIds) {
      const m = await getMessage(clientId, req.params.id);
      if (!canSeeMessage(access, m)) return res.status(403).json({ error: "account_forbidden" });
    }
    const out = await getAttachmentData(clientId, req.params.id, Number(req.params.idx));
    if (!out.ok) return res.status(out.reason === "not_found" || out.reason === "no_attachment" || out.reason === "not_stored" ? 404 : 400).json({ ok: false, ...out });
    if (out.redirect) return res.redirect(out.redirect);
    res.set("Content-Type", out.contentType || "application/octet-stream");
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(out.filename || "anhang")}"`);
    res.set("Cache-Control", "private, max-age=300");
    res.send(out.buffer);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Resolve the practice letterhead: explicit settings doc, falling back to the
// tenant's client doc. Shared by every letter route so the look is consistent.
async function resolveLetterhead(clientId) {
  const settings = await getLetterSettings(clientId);
  const hasAny = Object.values(settings).some((v) => String(v || "").trim());
  if (hasAny) return settings;
  const practice = await practiceFromClient(clientId);
  return { ...settings, senderName: practice.name, senderAddress: practice.address, contactBlock: practice.contact };
}

// Everything buildLetterPdf needs: typeset settings + (if "asset" mode) the
// uploaded letterhead bytes to use as background/overlay.
async function renderArgs(clientId) {
  const settings = await resolveLetterhead(clientId);
  let letterhead = null;
  if (settings.letterheadMode === "asset") {
    letterhead = await getLetterheadBuffer(clientId).catch(() => null);
  }
  // Optional scanned signature + practice stamp images, drawn into the letter.
  const [signatureImage, stampImage] = await Promise.all([
    getLetterAssetBuffer(clientId, "signature").catch(() => null),
    getLetterAssetBuffer(clientId, "stamp").catch(() => null),
  ]);
  return { settings, letterhead, signatureImage, stampImage };
}

// Ad-hoc / live-preview letter PDF (no case). Body: { to, subject, body }.
app.post("/mail/letter", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const { settings, letterhead, signatureImage, stampImage } = await renderArgs(clientId);
    // An unsaved layout may be passed for live preview while designing.
    const layout = req.body?.layout || null;
    const buffer = await buildLetterPdf({ settings, letterhead, signatureImage, stampImage, layout, to: req.body?.to, subject: req.body?.subject, body: req.body?.body });
    const filename = letterFilename(req.body?.subject);
    res.json({ ok: true, clientId, filename, base64: buffer.toString("base64") });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// KI-Schreibhilfe: draft a letter from a rough direction + the SHARED BRAIN
// (phone calls / case thread, related e-mails) + an uploaded/pasted source letter.
// Body: { caseId?, patientName?, recipient?, sourceText?, direction, tone? }
app.post("/mail/letter/ai-draft", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const b = req.body || {};
    const out = await draftLetter(clientId, {
      caseId: b.caseId,
      patientName: b.patientName,
      recipient: b.recipient,
      sourceText: b.sourceText,
      direction: b.direction,
      tone: b.tone,
      useContext: b.useContext !== false,
    });
    res.json({ ok: true, clientId, ...out, llm: llmInfo() });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Editor "context card": what Nadine knows about this recipient BEFORE writing
// (resolved patient, # phone calls, # e-mails, the assembled context text). The
// editor shows this so the team sees and trusts the grounding. Read-only.
app.get("/mail/letter/context", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await letterContextSummary(clientId, {
      patientName: (req.query?.patientName || "").trim() || undefined,
      caseId: (req.query?.caseId || "").trim() || undefined,
    });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Inline edit: rewrite ONLY the marked passage per an instruction. Body:
// { selection, instruction, fullText?, tone? }. Returns just the rewritten span.
app.post("/mail/letter/ai-rewrite", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const b = req.body || {};
    const out = await rewritePassage(clientId, { selection: b.selection, instruction: b.instruction, fullText: b.fullText, tone: b.tone });
    if (!out.ok) return res.status(400).json({ ok: false, ...out, llm: llmInfo() });
    res.json({ ok: true, clientId, ...out, llm: llmInfo() });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Write a FINISHED letter into the SHARED BRAIN (ticket/case), threaded onto the
// recipient's patient case so Clara & the briefing see it. Default behaviour when
// a letter is finalised; the editor's "Privat" switch skips this call entirely.
// Body: { recipient?, patientName?, subject?, body?, private? }.
app.post("/mail/letter/log", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const b = req.body || {};
    if (b.private === true) return res.json({ ok: true, clientId, logged: false, reason: "private" });

    const clip = (s, n) => { const t = String(s || "").trim(); return t.length > n ? t.slice(0, n) + " …" : t; };
    const nameHint = String(b.patientName || "").trim() || String(b.recipient || "").split(/\r?\n/)[0]?.trim() || "";
    let subject = { name: nameHint };
    let isPatient = false;
    if (nameHint) {
      const subj = await resolvePatientSubject(clientId, nameHint).catch(() => null);
      if (subj?.patientId) { subject = { patientId: subj.patientId, name: subj.name || nameHint, matchStatus: "matched", matchMethod: subj.matchMethod || "name" }; isPatient = true; }
    }

    const summary = [
      `Brief an ${nameHint || "(unbekannt)"} — Betreff „${b.subject || "(kein Betreff)"}“`,
      clip(b.body, 1200) || "(kein Text)",
    ].join("\n\n");

    const { event } = await appendEvent(clientId, {
      channel: "nadine_letter",
      direction: "out",
      type: "interaction",
      counterparty: { kind: isPatient ? "patient" : "unknown", name: nameHint || "Unbekannt", ref: null },
      subject,
      summary,
      extractor: "nadine@letter",
      payloadRef: { kind: "letter", subject: b.subject || "", body: clip(b.body, 8000) },
    });

    let caseLink = null;
    try { caseLink = await linkEventToCase(clientId, event, { by: "Nadine" }); } catch (err) { caseLink = { error: String(err?.message || err) }; }

    res.json({ ok: true, clientId, logged: true, eventId: event.id, caseId: caseLink?.caseId || null });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Extract plain text from an uploaded letter (paste alternative). Body:
// { base64, filename?, contentType? }. Handles text/* and PDF; images -> hint.
app.post("/mail/letter/extract", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await extractText(req.body || {});
    res.json({ ok: out.ok, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Live preview (alias of /mail/letter) — kept explicit for the editor's intent.
app.post("/mail/letter/preview", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const { settings, letterhead, signatureImage, stampImage } = await renderArgs(clientId);
    const layout = req.body?.layout || null; // unsaved layout for live design preview
    const buffer = await buildLetterPdf({ settings, letterhead, signatureImage, stampImage, layout, to: req.body?.to, subject: req.body?.subject, body: req.body?.body });
    res.json({ ok: true, clientId, base64: buffer.toString("base64") });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Letterhead settings.
app.get("/mail/letter/settings", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    res.json({ ok: true, clientId, settings: await getLetterSettings(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.put("/mail/letter/settings", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    res.json({ ok: true, clientId, ...(await setLetterSettings(clientId, req.body || {})) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Branded letterhead file (PDF/image). Upload switches the letterhead to "asset"
// mode automatically. Body: { base64, filename, contentType }.
app.post("/mail/letter/letterhead", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await saveLetterheadAsset(clientId, req.body || {});
    if (!out.ok) return res.status(400).json({ ok: false, clientId, ...out });
    await setLetterSettings(clientId, { letterheadMode: "asset" });
    res.json({ ok: true, clientId, asset: out.asset });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/mail/letter/letterhead", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    res.json({ ok: true, clientId, asset: await getLetterheadMeta(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// List ALL letterheads (with image previews) + which one is active.
app.get("/mail/letter/letterheads", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const { items, activeId } = await listLetterheads(clientId);
    res.json({ ok: true, clientId, items, activeId });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Make a specific letterhead the active one. Body: { id }.
app.post("/mail/letter/letterhead/active", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await setActiveLetterhead(clientId, String(req.body?.id || ""));
    if (!out.ok) return res.status(400).json({ ok: false, clientId, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Delete ONE letterhead by id.
app.delete("/mail/letter/letterhead/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    await deleteLetterhead(clientId, String(req.params.id || ""));
    res.json({ ok: true, clientId });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.delete("/mail/letter/letterhead", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    await deleteLetterheadAsset(clientId);
    await setLetterSettings(clientId, { letterheadMode: "text" });
    res.json({ ok: true, clientId });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Signature ("unterschrift") + stamp ("stempel") IMAGES, drawn into letters.
// :kind = signature | stamp. Upload body: { base64, filename, contentType }.
app.post("/mail/letter/asset/:kind", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await saveLetterAsset(clientId, req.params.kind, req.body || {});
    if (!out.ok) return res.status(400).json({ ok: false, clientId, ...out });
    res.json({ ok: true, clientId, asset: out.asset });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/mail/letter/asset/:kind", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    res.json({ ok: true, clientId, asset: await getLetterAssetMeta(clientId, req.params.kind) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.delete("/mail/letter/asset/:kind", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    await deleteLetterAsset(clientId, req.params.kind);
    res.json({ ok: true, clientId });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Reusable text blocks (Textbausteine).
app.get("/mail/letter/blocks", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    if (req.query?.seed === "1") await seedDefaultBlocks(clientId);
    res.json({ ok: true, clientId, blocks: await listBlocks(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/mail/letter/blocks", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await createBlock(clientId, req.body || {});
    if (!out.ok) return res.status(400).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.patch("/mail/letter/blocks/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await updateBlock(clientId, req.params.id, req.body || {});
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 400).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.delete("/mail/letter/blocks/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    res.json({ ok: true, clientId, ...(await deleteBlock(clientId, req.params.id)) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Generate a letter PDF from a case draft, archive it, log it on the case.
// Body: { to?, subject?, body?, by? } (defaults come from the case draft).
app.post("/brain/cases/:id/letter", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const c = await getCase(clientId, req.params.id);
    if (!c) return res.status(404).json({ ok: false, reason: "not_found" });
    const to = (req.body?.to ?? c.draft?.to ?? "").trim();
    const subject = (req.body?.subject ?? c.draft?.subject ?? c.title ?? "").trim();
    const body = req.body?.body ?? c.draft?.body ?? "";
    const by = (req.body?.by || "Nadine").trim();

    const { settings, letterhead, signatureImage, stampImage } = await renderArgs(clientId);
    const buffer = await buildLetterPdf({ settings, letterhead, signatureImage, stampImage, to, subject, body });
    const filename = letterFilename(subject);
    const archived = await archiveLetter(clientId, req.params.id, filename, buffer);

    await saveCaseDraft(clientId, req.params.id, { channel: "letter", to, subject, body }, { by });
    await addUpdate(clientId, req.params.id, {
      by, kind: "note",
      text: `Brief als PDF erstellt: ${filename}${archived.stored ? " (archiviert)" : ""}.`,
    });
    res.json({ ok: true, clientId, filename, base64: buffer.toString("base64"), url: archived.url, stored: archived.stored });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Delegate a case. Body: { assignee, instruction?, by? }.
app.post("/brain/cases/:id/assign", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await assignCase(clientId, req.params.id, {
      assignee: req.body?.assignee,
      instruction: req.body?.instruction,
      by: req.body?.by || "Team",
    });
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 400).json({ ok: false, ...out });

    // Delegated to Nadine -> she prepares an approval-ready draft in the
    // background (LLM may take a few seconds; we don't block the response).
    const preparing = String(out.assignee || "").toLowerCase() === "nadine";
    if (preparing) prepareCaseDraft(clientId, req.params.id, { by: "Nadine" }).catch(() => { /* best-effort */ });

    res.json({ ok: true, clientId, preparing, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Open a case manually. Body: { subject?, topic?, title?, priority?, createdBy?, text? }.
app.post("/brain/cases", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const body = req.body || {};
    const c = await createCase(clientId, {
      subject: body.subject,
      topic: body.topic,
      title: body.title,
      priority: body.priority,
      createdBy: body.createdBy || body.by || "Team",
      contactCount: 0,
      updates: body.text
        ? [{ by: body.createdBy || body.by || "Team", kind: "note", text: body.text }]
        : [],
    });
    res.status(201).json({ ok: true, clientId, case: c });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Append an update to the log (real-time, who/when/what). Body: { by, text, kind? }.
app.post("/brain/cases/:id/updates", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await addUpdate(clientId, req.params.id, {
      by: req.body?.by || "Team",
      text: req.body?.text || "",
      kind: req.body?.kind || "note",
    });
    if (!out.ok) return res.status(404).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Change a case's status (records the transition + author). Body: { status, by?, note? }.
app.post("/brain/cases/:id/status", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await setStatus(clientId, req.params.id, (req.body?.status || "").trim(), {
      by: req.body?.by || "Team",
      note: req.body?.note,
    });
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 400).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// --- Clara case voice tools (custom_tools) ---------------------------------
// Let Clara work the follow-up loop hands-free: find the ticket for a patient,
// delegate it (Nadine/Lisa/Team), note progress, or close it. The resolved case
// is kept SERVER-SIDE (activeCase) so the 8B model never carries a case id.
const CASE_TOPIC_LABELS = {
  complaint: "Beschwerde",
  billing: "Rechnung/Kosten",
  appointment: "Termin",
  callback: "Rückruf",
  document: "Dokumente",
  other: "Allgemein",
};

function normalizeAssignee(raw) {
  const v = (raw || "").toLowerCase();
  if (/nadine|brief|e-?mail|schreiben/.test(v)) return "Nadine";
  if (/lisa|r[üu]ckruf|anruf|telefon|sms/.test(v)) return "Lisa";
  if (/ich|selbst|pers[öo]nlich|team|mitarbeiter/.test(v)) return "Team";
  return (raw || "").trim() || "Team";
}

function caseSpoken(c) {
  const topic = CASE_TOPIC_LABELS[c.topic] || c.topic;
  const cnt = c.contactCount > 1 ? `, ${c.contactCount} Kontakte` : "";
  const asg = c.assignee ? `, delegiert an ${c.assignee}` : "";
  return `Vorgang ${topic}${c.subject?.name ? ` für ${c.subject.name}` : ""}: Status ${c.status}${cnt}${asg}.`;
}

// Gesprochene Namen kommen mit Anrede an ("Herr Diedershagen", "Frau Meier") --
// die Patienten-DB kennt nur nackte Namen. Vor JEDER Suche entfernen, sonst
// endet "find_case name='Herr Diedershagen'" in "Kein Patient gefunden",
// obwohl Vorgang UND Patient existieren (systemischer Fehler 2026-06-10).
function cleanSpokenPersonName(raw) {
  return String(raw || "")
    .replace(/\b(herrn?|frau|fr(?:ä|ae)ulein|hr|fr|dr|prof|doktor|patient(?:in)?)\.?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// STT schreibt, was sie hört: "Tzannis" wird zu "Zannis", "Christou" zu
// "Kristu". Wenn die exakte Suche leer ausgeht, probieren wir gängige
// Transliterations-Varianten je Namens-Token durch, bevor wir aufgeben.
const SPOKEN_NAME_VARIANTS = [
  [/^z/, "tz"], [/^tz/, "z"], [/^ts/, "tz"],
  [/^c(?!h)/, "k"], [/^k/, "c"], [/^ch/, "k"],
  [/^v/, "w"], [/^w/, "v"], [/^f/, "ph"], [/^ph/, "f"],
  [/^j/, "y"], [/^y/, "j"],
  // Beobachtete STT-Hörfehler aus dem Testlauf 2026-06-10 (Token-Mitte,
  // jeweils nur die erste Fundstelle wird ersetzt):
  [/ay/, "ei"], [/ey/, "ei"], [/ai/, "ei"], [/ei/, "ay"], // Mayer/Meyer/Maier -> Meier
  [/äu/, "eu"], [/eu/, "äu"],                             // Häuser -> Heuser
  [/^tr/, "thr"], [/^thr/, "tr"],                         // Trandorf -> Thrandorf
  [/t/, "d"], [/d/, "t"],                                 // Dietershagen -> Diedershagen
  [/id/, "ied"], [/ied/, "id"],                           // Didershagen -> Diedershagen
  [/ahn/, "ann"], [/ann/, "ahn"],                         // Zahnis -> Zannis/Tzannis
  [/z/, "ts"], [/ts/, "z"],                               // Pezas -> Petsas
  // Parakeet-Testlauf 2026-06-11: verschluckte Konsonanten in der Wortmitte.
  [/nor/, "ndor"], [/ndor/, "nor"],                       // Tranorf -> Trandorf
  [/sagen/, "shagen"], [/shagen/, "sagen"],               // Diedersagen -> Diedershagen
  [/iu$/, "iou"], [/iou$/, "iu"],                         // Vassiliu -> Vassiliou
];
async function searchPatientSpoken(clientId, name) {
  const first = await searchPatient(clientId, name);
  if (!first.ok) return first;
  if ((first.patients || []).length) return first;

  const tokens = String(name).split(/\s+/).filter(Boolean);
  const variants = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    for (const [re, rep] of SPOKEN_NAME_VARIANTS) {
      if (!re.test(t)) continue;
      const v = [...tokens];
      v[i] = t.replace(re, rep);
      const candidate = v.join(" ");
      if (candidate !== name.toLowerCase()) variants.push(candidate);
    }
  }
  for (const v of [...new Set(variants)].slice(0, 12)) {
    const r = await searchPatient(clientId, v).catch(() => null);
    if (r?.ok && (r.patients || []).length) return { ...r, variantUsed: v };
  }
  return first; // ok:true, patients:[]
}

// Token-Match eines gesprochenen Namens gegen den Vorgangs-Betreff. Erlaubt
// Treffer auch ohne Patientendatensatz (z.B. E-Mail-Absender, die noch nicht
// in der Patienten-DB stehen) und überlebt Teil-Namen ("Diedershagen").
function nameMatchesCaseSubject(c, cleanedName) {
  const subj = String(c?.subject?.name || "").toLowerCase();
  if (!subj) return false;
  const tokens = String(cleanedName || "").toLowerCase().split(" ").filter((t) => t.length >= 3);
  if (!tokens.length) return false;
  return tokens.every((t) => subj.includes(t));
}

app.post("/tools/briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const cases = await listCases(clientId, { activeOnly: true, limit: 200 });
    const briefing = buildCaseBriefing(cases, { role: op?.role, operatorName: op?.name });
    const message = buildSpokenCaseBriefing(briefing, { operatorName: op?.name });
    return res.json({ ok: true, message, operator: op ? { name: op.name, role: op.role } : null });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Clara asks Nadine: "Was gab es heute für E-Mails?" -> Nadine's spoken summary.
app.post("/tools/nadine-briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const accountIds = await operatorMailAccountIds(clientId);
    const { spokenText } = await buildMailBriefing(clientId, { sinceMinutes: Number(req.body?.sinceMinutes) || 720, accountIds });
    return res.json({ ok: true, message: spokenText });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Clara: "Lies mir die E-Mail von Signpeople vor." — findet die neueste
// Posteingangs-Mail zu einem gesprochenen Absender/Betreff und liefert den
// INHALT zum Vorlesen. Deckt ALLE Absender ab (Labore, Firmen, Patienten);
// find_case kennt nur Patienten mit offenem Vorgang und lief hier ins Leere.
app.post("/tools/read-email", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const query = String(req.body?.query || req.body?.name || req.body?.sender || "").trim();
    if (!query) return res.json({ ok: false, message: "Von welchem Absender oder zu welchem Betreff soll ich die E-Mail vorlesen?" });

    const accountIds = await operatorMailAccountIds(clientId);
    const rows = await listMessages(clientId, { folder: "INBOX", limit: 50, accountIds });
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    const fromText = (f) => (typeof f === "object" && f !== null ? `${f.name || ""} ${f.address || ""}` : String(f || ""));
    const hay = (r) => `${fromText(r.from)} ${r.subject || ""} ${r.preview || ""}`.toLowerCase();
    let hits = tokens.length ? rows.filter((r) => tokens.some((t) => hay(r).includes(t))) : [];
    // Volltreffer (alle Wörter) schlagen Teiltreffer; Liste ist neueste zuerst.
    const strong = hits.filter((r) => tokens.every((t) => hay(r).includes(t)));
    if (strong.length) hits = strong;
    if (!hits.length) {
      return res.json({ ok: false, message: `Ich finde im Posteingang keine E-Mail zu „${query}“. Soll ich stattdessen die neuesten E-Mails nennen?` });
    }

    const full = await getMessage(clientId, hits[0].id);
    const htmlText = String(full?.htmlBody || "")
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
    const body = (String(full?.textBody || "").replace(/\s+/g, " ").trim() || htmlText || String(full?.preview || "")).slice(0, 1500);
    // "from" ist je nach Sync-Pfad ein String ("Name <addr>") oder ein Objekt
    // ({ name, address }) — beides auf einen sprechbaren Namen reduzieren.
    const fromRaw = full?.from;
    const fromLabel = (
      typeof fromRaw === "object" && fromRaw !== null
        ? String(fromRaw.name || fromRaw.address || "")
        : String(fromRaw || "")
    ).replace(/<[^>]*>/g, "").trim() || "Unbekannt";
    const when = full?.date ? new Date(full.date).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", hour: "2-digit", minute: "2-digit" }) : "";
    const more = hits.length > 1 ? ` Es gibt noch ${hits.length - 1} weitere passende E-Mail${hits.length > 2 ? "s" : ""}.` : "";
    const message = `E-Mail von ${fromLabel}${when ? `, eingegangen ${when}` : ""}. Betreff: ${full?.subject || "(kein Betreff)"}. Inhalt: ${body || "(kein Text erkennbar)"}${more}`;
    return res.json({ ok: true, message, messageId: hits[0].id });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Persönlicher Assistent: Das gekoppelte Handy gehört EINEM Behandler. Ohne
// explizite Behandler-Angabe gilt deshalb NUR dessen eigener Kalender — Clara
// liest Dr. Petsas nicht ungefragt die Termine von Dr. Patrikis vor. Mit
// doctorName "alle"/"Praxis" (oder einem Kollegen-Namen) wird breiter gescopt.
const ALL_DOCTORS_RE = /^(alle|alles|gesamt|praxis|team|komplett|jede[rn]?)\b/i;
async function resolveDayCalendarScope(clientId, body) {
  let calendarId = String(body?.calendarId || "").trim() || null;
  const rawDoctor = String(body?.doctorName || "").trim();
  if (calendarId) return { calendarId, scope: "explicit" };
  if (rawDoctor && ALL_DOCTORS_RE.test(rawDoctor)) return { calendarId: null, scope: "all" };
  if (rawDoctor) {
    const booking = await loadBooking(clientId).catch(() => null);
    const cal = booking ? resolveCalendar(booking, rawDoctor) : null;
    // Unbekannter Name: lieber ungefiltert antworten als still falsch filtern.
    return { calendarId: cal?.id || null, scope: cal ? "named" : "all" };
  }
  // Kein Behandler genannt -> auf den identifizierten Operator scopen.
  try {
    const op = await getOperator(clientId);
    const opName = String(op?.doctorName || op?.name || "").trim();
    if (opName) {
      const booking = await loadBooking(clientId).catch(() => null);
      const cal = booking ? resolveCalendar(booking, opName) : null;
      if (cal) return { calendarId: cal.id, scope: "operator" };
    }
  } catch { /* Operator-Lookup darf nie den Kalender blockieren */ }
  return { calendarId: null, scope: "all" };
}

// Clara: "Was steht heute (oder am …) im Kalender?" — reads the ACTUAL booked
// appointments and speaks a per-Behandler overview incl. free gaps + highlights.
// Optional doctorName scopes it; the monitor jumps to the day for context.
app.post("/tools/day-briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const date = (req.body?.date || "").trim() || todayBerlin();
    const calScope = await resolveDayCalendarScope(clientId, req.body);
    const calendarId = calScope.calendarId;
    const day = await getDayAppointments(clientId, { date, calendarId });
    if (!day.ok) return res.json({ ok: false, message: day.reason === "no_location" ? "Es ist keine Praxis-Buchungskonfiguration hinterlegt." : `Tagesplan nicht verfügbar (${day.reason}).` });

    const briefing = computeDayBriefing(day.appointments, { calendars: day.calendars });
    const op = await getOperator(clientId);
    const opDoctor = op?.doctorName || (String(op?.role || "").toLowerCase().startsWith("arzt") ? op?.name : "") || "";
    let message = buildSpokenDayBriefing(briefing, { date: day.date, operatorDoctorName: opDoctor });
    // Offene Recall-Initiative? Clara bringt sich aktiv ein ("morgen ist wenig
    // los — soll ich die Anruflisten freigeben?").
    try { message += await initiativeSuffix(clientId); } catch { /* optional */ }
    // Show the day on the monitor (best-effort; works only with an active session).
    try { await emitCommand(clientId, { type: "navigate", date: day.date, calendarId: calendarId || null }); } catch { /* no live session */ }
    return res.json({ ok: true, date: day.date, message, counts: { total: briefing.total, newPatients: briefing.newPatients, unconfirmed: briefing.unconfirmed } });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Clara: "Wer kommt morgen?" / "Welche Patienten hat Dr. Petsas?" — the
// CONCRETE appointment list with patient names + times (day_briefing only
// summarises counts and gaps). Internal team tool; never exposed to patients.
app.post("/tools/day-appointments", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const date = (req.body?.date || "").trim() || todayBerlin();
    const calScope = await resolveDayCalendarScope(clientId, req.body);
    const calendarId = calScope.calendarId;
    const day = await getDayAppointments(clientId, { date, calendarId });
    if (!day.ok) return res.json({ ok: false, message: day.reason === "no_location" ? "Es ist keine Praxis-Buchungskonfiguration hinterlegt." : `Terminliste nicht verfügbar (${day.reason}).` });

    // "Sie haben morgen ..." only when the asking operator IS that doctor.
    const op = await getOperator(clientId);
    const operatorDoctorName = op?.doctorName || (String(op?.role || "").toLowerCase().startsWith("arzt") ? op?.name : "") || "";
    const list = buildSpokenDayList(day.appointments, { date: day.date, calendars: day.calendars, operatorDoctorName });

    // Shared brain: surface open cases (e.g. the e-mail Nadine threaded) for
    // the patients on this schedule. Best-effort — the list must never fail
    // because the memory lookup hiccuped.
    let memory = "";
    try {
      const pids = day.appointments.filter((a) => !a.isAbsence && a.patientId).map((a) => a.patientId);
      const caseMap = await listActiveCasesByPatientIds(clientId, pids);
      memory = buildSpokenMemoryHints(day.appointments, caseMap);
    } catch (err) {
      log.warn("day-appointments memory hints failed", { clientId, err: String(err?.message || err) });
    }

    const message = [list, memory].filter(Boolean).join(" ");
    try { await emitCommand(clientId, { type: "navigate", date: day.date, calendarId: calendarId || null }); } catch { /* no live session */ }
    return res.json({ ok: true, date: day.date, message, count: day.appointments.filter((a) => !a.isAbsence).length });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// UI read-model: structured day schedule for the Clara monitor "Tagesplan".
app.get("/brain/day-schedule", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const date = (req.query?.date || "").trim() || todayBerlin();
    const calendarId = (req.query?.calendarId || "").trim() || null;
    const day = await getDayAppointments(clientId, { date, calendarId });
    if (!day.ok) return res.status(400).json({ ok: false, ...day });
    const briefing = computeDayBriefing(day.appointments, { calendars: day.calendars });
    const message = buildSpokenDayBriefing(briefing, { date: day.date });
    res.json({ ok: true, clientId, date: day.date, briefing, message, appointments: day.appointments });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// ============================================================================
// Living Prompt — Erkenntnisse (lessons) + versionierte Prompts.
// Evolution is GUIDED: LLM proposals -> machine validation -> human approval ->
// compiled, versioned prompt with metrics + one-click rollback.
// ============================================================================

// List lessons (filter by ?status=proposed|active|rejected|retired, ?agent=).
app.get("/brain/lessons", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const lessons = await listLessons(clientId, { status: req.query?.status, agent: req.query?.agent });
    res.json({ ok: true, clientId, count: lessons.length, lessons });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Manually propose a lesson (same guard chain as reflection proposals).
app.post("/brain/lessons", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await proposeLesson(clientId, { ...(req.body || {}), source: "manual" });
    if (!out.ok) return res.status(400).json(out);
    res.json({ ok: true, clientId, lesson: out.lesson });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Human decision: { approve: true|false, by, note? }. Approving auto-publishes
// a new prompt version so the lesson takes effect immediately and auditable.
app.post("/brain/lessons/:id/decide", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const approve = req.body?.approve === true;
    const by = (req.body?.by || "").trim() || "Team";
    const out = await decideLesson(clientId, req.params.id, { approve, by, note: req.body?.note });
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 409).json(out);

    let published = null;
    if (approve) {
      const lessons = await listLessons(clientId, { status: "active" });
      const lesson = lessons.find((l) => l.id === req.params.id);
      const agent = lesson?.agent === "all" ? null : lesson?.agent;
      const agents = agent ? [agent] : PROMPT_AGENTS;
      published = [];
      for (const ag of agents) {
        const p = await publishPromptVersion(clientId, ag, { by, note: `Erkenntnis ${req.params.id} freigegeben` });
        if (p.ok && !p.unchanged) published.push({ agent: ag, version: p.version });
      }
    }
    res.json({ ok: true, clientId, ...out, published });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Retire an active lesson; republishes affected prompt(s) without it.
app.post("/brain/lessons/:id/retire", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const by = (req.body?.by || "").trim() || "Team";
    const lessonsBefore = await listLessons(clientId, { status: "active" });
    const lesson = lessonsBefore.find((l) => l.id === req.params.id);
    const out = await retireLesson(clientId, req.params.id, { by, reason: req.body?.reason });
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 409).json(out);

    const agents = lesson?.agent && lesson.agent !== "all" ? [lesson.agent] : PROMPT_AGENTS;
    const published = [];
    for (const ag of agents) {
      const p = await publishPromptVersion(clientId, ag, { by, note: `Erkenntnis ${req.params.id} pensioniert` });
      if (p.ok && !p.unchanged) published.push({ agent: ag, version: p.version });
    }
    res.json({ ok: true, clientId, published });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Manual reflection trigger ("Reflexion jetzt") — proposals only, no effect
// until a human approves them.
app.post("/brain/lessons/reflect", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await reflectOnce(clientId, { sinceDays: Number(req.body?.sinceDays) || 14 });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Active compiled prompt for an agent (what Lisa/Bianca/… should use NOW).
app.get("/brain/prompt/:agent", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await getActivePrompt(clientId, req.params.agent);
    if (!out.ok) return res.status(404).json(out);
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Version history + outcome metrics per version (selection pressure).
app.get("/brain/prompt/:agent/versions", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const [versions, metrics] = await Promise.all([
      listPromptVersions(clientId, req.params.agent),
      promptVersionMetrics(clientId, req.params.agent),
    ]);
    const byVersion = new Map(metrics.map((m) => [m.version, m]));
    res.json({ ok: true, clientId, versions: versions.map((v) => ({ ...v, metrics: byVersion.get(v.version) || null })) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// One-click rollback to an older snapshot: { toVersion, by }.
app.post("/brain/prompt/:agent/rollback", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await rollbackPrompt(clientId, req.params.agent, req.body?.toVersion, { by: req.body?.by || "Team" });
    if (!out.ok) return res.status(404).json(out);
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// ============================================================================
// Test & Train — Superuser-Cockpit fuer die Clara-Testsuite + Gespraechs-Review.
//
// Die Testlaeufe (Python, F:\Clara-Voice\testsuite) laufen auf DIESER Maschine;
// die Endpunkte hier sind die Bruecke fuer das Superuser-UI. Lessons/Prompt-
// Versionen (der "Train"-Teil) nutzen die bestehenden /brain/lessons- und
// /brain/prompt-Routen — Test & Train ergaenzt nur Runs + Gespraechs-Sicht.
//
// Zugriff: NUR Superuser (oder Service-Token/Dev) — Testlaeufe belegen GPU
// und Ollama, das darf kein Praxis-Account ausloesen koennen.
// ============================================================================

function requireSuperuser(req, res) {
  const a = req.auth || {};
  if (a.kind === "user" && !a.superUser) {
    res.status(403).json({ error: "superuser_only" });
    return false;
  }
  return true;
}

// Historische Testlaeufe (kompakte Zusammenfassungen, neueste zuerst).
app.get("/testtrain/runs", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    res.json({ ok: true, runs: listRuns({ limit: Number(req.query?.limit) || 50 }), catalog: catalogInfo() });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Ein Lauf im Detail (alle Faelle inkl. Fails/Antworten).
app.get("/testtrain/runs/:file", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const run = getRun(req.params.file);
    if (!run) return res.status(404).json({ error: "run_not_found" });
    res.json({ ok: true, ...run });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Neuen Lauf starten. Body: { model?, stt?, tts?, limit?, noAudio?, noDialogs?, ids? }
app.post("/testtrain/runs", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const by = req.auth?.kind === "user" ? req.auth.userId || "Superuser" : "Service";
    const out = startRun(req.body || {}, { by });
    if (!out.ok) return res.status(409).json(out);
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Status des aktiven Laufs (+ Log-Tail fuer die Live-Konsole im UI).
app.get("/testtrain/status", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  res.json({ ok: true, ...runStatus() });
});

// Aktiven Lauf abbrechen.
app.post("/testtrain/cancel", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  const out = cancelRun();
  if (!out.ok) return res.status(409).json(out);
  res.json(out);
});

// --- Plattform-Testsuite (Cloud Functions, Apps, Landingpages, Browser) ---

// Historische Plattform-Laeufe + Gruppen-Katalog.
app.get("/testtrain/platform/runs", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    res.json({ ok: true, runs: listPlatformRuns({ limit: Number(req.query?.limit) || 50 }), groups: PLATFORM_GROUPS });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Ein Plattform-Lauf im Detail (alle Checks + Markdown-Report mit Agent-Briefing).
app.get("/testtrain/platform/runs/:file", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const run = getPlatformRun(req.params.file);
    if (!run) return res.status(404).json({ error: "run_not_found" });
    res.json({ ok: true, ...run });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Plattform-Lauf starten. Body: { groups?: string[], noBrowser?: boolean,
// smsNumber?: string } — smsNumber ist die Handynummer des Testers fuer den
// SMS-Check dieses Laufs (leer = SMS-Check wird uebersprungen).
app.post("/testtrain/platform/runs", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const by = req.auth?.kind === "user" ? req.auth.userId || "Superuser" : "Service";
    const out = startPlatformRun({ ...(req.body || {}), trigger: "ui" }, { by });
    if (!out.ok) return res.status(409).json(out);
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get("/testtrain/platform/status", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  res.json({ ok: true, ...platformRunStatus() });
});

app.post("/testtrain/platform/cancel", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  const out = cancelPlatformRun();
  if (!out.ok) return res.status(409).json(out);
  res.json(out);
});

// Echte Gespraeche (Clara/Bianca/Lisa) der letzten Tage als Review-Liste:
// kompakt, mit Signalen (Abbruch/negativ/Beschwerde) und Prompt-Version-Tag,
// damit Auffaelligkeiten direkt einer Version zuzuordnen sind.
app.get("/testtrain/conversations", async (req, res) => {
  if (!requireSuperuser(req, res)) return;
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const sinceDays = Math.min(90, Number(req.query?.sinceDays) || 7);
    const events = await queryRecent(clientId, Date.now() - sinceDays * 86400000, 1000);
    const CALL_CHANNELS = new Set(["bianca_call", "clara_voice", "lisa_call", "lisa_outbound"]);
    const conversations = events
      .filter((e) => e.type === "interaction" && CALL_CHANNELS.has(e.channel))
      .map((e) => {
        const sig = e.signals || {};
        const flags = [];
        if (sig.abortedEarly) flags.push("abgebrochen");
        if (sig.sentiment === "negative") flags.push("negativ");
        if (sig.complaintStated) flags.push("beschwerde");
        // ts ist epoch ms; aeltere Events tragen z. T. Firestore-Timestamps in
        // "at" — beides auf eine Zahl normalisieren, damit das UI sortieren kann.
        const rawTs = e.ts ?? e.at ?? e.createdAt ?? 0;
        const at = typeof rawTs === "object" && rawTs
          ? Number(rawTs._seconds || rawTs.seconds || 0) * 1000
          : Number(rawTs) || 0;
        return {
          id: e.id,
          at,
          channel: e.channel,
          direction: e.direction,
          summary: e.summary || "",
          counterparty: e.counterparty?.name || e.counterparty?.kind || "",
          status: e.status || "",
          flags,
          promptVersion: (e.tags || []).find((t) => typeof t === "string" && t.startsWith("pv:")) || null,
        };
      })
      .sort((a, b) => (b.at || 0) - (a.at || 0));
    const flagged = conversations.filter((c) => c.flags.length).length;
    res.json({ ok: true, clientId, sinceDays, count: conversations.length, flagged, conversations });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// ============================================================================
// Lückenfüller (Umsatz-Coach Stufe 1) + Caller-ID-Lookup
// ============================================================================

// Scan a day for real free gaps (opening hours) + matching due recall
// candidates, and create/refresh ONE Gesprächsauftrag case per gap
// (assignee Lisa, waiting_approval). Idempotent per (calendar, date, slot).
app.post("/brain/gap-fill/run", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await runGapFill(clientId, { date: req.body?.date, horizonDays: Number(req.body?.horizonDays) || 1 });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// UI read-model: gaps, candidates and pending call lists for the monitor.
app.get("/brain/gap-fill", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await gapFillOverview(clientId, { date: req.query?.date });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Approve ONE call list (your decision: every list individually). Records the
// approval audit incl. the Lisa prompt version the calls will run under.
app.post("/brain/gap-fill/:caseId/approve", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await approveCallList(clientId, req.params.caseId, { by: req.body?.by || "Team" });
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 409).json(out);
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Voice: "Wo ist morgen Luft und wer passt rein?" — spoken gap briefing.
app.post("/tools/gap-briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const run = await runGapFill(clientId, { date: req.body?.date, horizonDays: Number(req.body?.horizonDays) || 1 });
    const op = await getOperator(clientId);
    let message = buildSpokenGapBriefing(run, { operatorName: op?.name });
    if (run.callLists?.length) {
      message += " Zum Loslegen sage einfach: Recall freigeben.";
    }
    res.json({ ok: true, message, gaps: run.gaps?.length || 0, callLists: run.callLists?.length || 0 });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// ============================================================================
// Recall-Coach — mündliche Freigabe, Status, Snooze, Initiative-Scan.
// Flow: Initiative (Push/Briefing) -> "Recall starten" (gap_briefing baut die
// Listen) -> "Recall freigeben" (approve + Lisa legt los, consent-gemischt
// SMS/Anruf) -> Sweep bucht Zusagen DIREKT fest -> "Wie läuft der Recall?"
// ============================================================================

// Voice: "Recall freigeben" — alle wartenden Listen (optional eines Tages)
// freigeben UND sofort ausführen. Die Freigabe wird mit Sprecher auditiert.
app.post("/tools/recall-approve", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    // Testsuite-Schutz: niemand wird kontaktiert, keine Liste freigegeben.
    if (req.body?.dryRun) {
      return res.json({ ok: true, dryRun: true, message: "Testlauf: Die wartenden Anruflisten wären jetzt freigegeben worden. Es wurde niemand kontaktiert." });
    }
    const out = await approveAndExecute(clientId, {
      date: req.body?.date,
      caseId: req.body?.caseId,
      by: op?.name || "Team",
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Voice: "Wie läuft der Recall?" — gesprochener Zwischenstand.
app.post("/tools/recall-status", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const message = await recallStatusSpoken(clientId, { date: req.body?.date });
    res.json({ ok: true, message });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Voice: "Heute nicht" — Initiative stummschalten (Anti-Nerv-Regel).
app.post("/tools/recall-snooze", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    res.json(await snoozeInitiative(clientId));
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Service/Test: Aufbewahrungs-Sweep manuell anstoßen (sonst täglich per
// Scheduler). Löscht Nachrichten, Tickets und Gedächtnis-Einträge, die älter
// als RETENTION_DAYS (Standard 90 Tage) sind — endgültig.
app.post("/brain/retention/run", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const days = Number(req.body?.days) || RETENTION_DAYS;
    const out = await runRetentionSweep(clientId, { days });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Service/Test: Initiative-Scan manuell anstoßen (sonst macht das der Scheduler).
app.post("/brain/recall/scan", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await dailyInitiativeScan(clientId, { targetDate: req.body?.date, publicBaseUrl: PUBLIC_BASE_URL });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Voice-Worker: WARUM hat Clara angerufen? Wird beim Verbinden EINMALIG
// abgeholt (consume), damit ein Push-initiiertes Gespräch thematisch startet
// ("Ich habe dich angerufen: morgen ist wenig los ...") statt bei Null.
app.post("/clara/pending-context", async (req, res) => {
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

// Voice: "Nächsten Freitag bin ich nicht da" / "Morgen zwischen 15 und 17 Uhr
// bin ich weg" / "Sperr heute ab 10 Uhr die Buchungen" — Abwesenheit PLANEN.
// Mit startTime/endTime wird nur das Zeitfenster gesperrt; sind KEINE Termine
// betroffen, trägt planAbsence den Sperrblock sofort ein (nichts abzusagen).
// Sonst: Auftrag als Case, Ausführung erst nach Freigabe (approval-first).
app.post("/tools/plan-absence", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const date = String(req.body?.date || "").trim();
    const calScope = await resolveDayCalendarScope(clientId, req.body);
    if (!calScope.calendarId) {
      return res.json({ ok: false, message: "Für welchen Behandler soll ich die Abwesenheit eintragen? Bitte den Namen nennen." });
    }
    const booking = await loadBooking(clientId).catch(() => null);
    const calName = (booking?.calendars || []).find((x) => x.id === calScope.calendarId)?.name || "";
    const op = await getOperator(clientId);
    const out = await planAbsence(clientId, {
      date,
      startTime: req.body?.startTime,
      endTime: req.body?.endTime,
      calendarId: calScope.calendarId,
      calendarName: calName,
      by: op?.name || "Operator",
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Voice: "Abwesenheit freigeben" — Tag sperren, Termine stornieren, Absagen
// verschicken (SMS/Anruf via Lisa, E-Mail via Nadine — je Patient EIN Kanal).
app.post("/tools/absence-approve", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const out = await approveAbsence(clientId, {
      date: req.body?.date,
      caseId: req.body?.caseId,
      by: op?.name || "Operator",
      dryRun: req.body?.dryRun === true,
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Voice: "Wie steht es um die Abwesenheit?" — gesprochener Zwischenstand
// (informiert/neu gebucht/offen).
app.post("/tools/absence-status", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    res.json({ ok: true, message: await absenceStatusSpoken(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Voice: "Merk dir fürs Team: …" — ein Memo ins Praxisgedächtnis. Landet als
// offenes Brain-Event (sichtbar im Monitor) und ist damit für Nadine/Lisa/
// Team-Briefings abrufbar.
app.post("/tools/team-memo", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const text = String(req.body?.text || "").trim();
    if (!text) return res.json({ ok: false, message: "Was soll ich mir für das Team merken?" });
    const op = await getOperator(clientId);
    const who = op?.name || "Operator";
    await appendEvent(clientId, {
      channel: "clara_voice",
      direction: "internal",
      type: "note",
      counterparty: { kind: "other", name: who },
      subject: { matchStatus: "n/a" },
      summary: `Team-Memo von ${who}: ${text}`,
      status: "open",
      extractor: "clara@memo",
      tags: ["memo"],
    });
    res.json({ ok: true, message: "Notiert — das Memo steht im Praxisgedächtnis und ist für das ganze Team sichtbar." });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Inbound phone AI: who is calling and WHY did we contact them? Matches the
// caller id against open Gesprächsauftrag cases + recent outbound events and
// returns a compact spoken context block. The static inbound prompt never
// changes — the knowledge comes from the shared brain at call time.
app.post("/tools/lookup-caller", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await lookupCaller(clientId, { phone: req.body?.phone || req.body?.number, name: req.body?.name });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/tools/find-case", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = (req.body?.name || req.body?.query || "").trim();
    const topic = (req.body?.topic || "").trim().toLowerCase();
    if (!rawName) return res.json({ ok: false, message: "Zu welchem Patienten ist der Vorgang?" });
    const name = cleanSpokenPersonName(rawName) || rawName;

    // 1) Regulärer Weg: Patient in der DB finden, Vorgänge über die Patient-ID.
    let cases = [];
    let displayName = name;
    const found = await searchPatientSpoken(clientId, name);
    const patients = found.ok ? found.patients || [] : [];
    if (patients.length > 1) {
      const list = patients.slice(0, 4).map((p) => `${p.firstName} ${p.lastName}`).join(", ");
      return res.json({ ok: true, message: `Mehrere Patienten: ${list}. Welcher genau?` });
    }
    if (patients.length === 1) {
      const p = patients[0];
      displayName = `${p.firstName} ${p.lastName}`.trim();
      cases = await listCases(clientId, { patientId: p.id, activeOnly: true });
    }

    // 2) Fallback: kein (eindeutiger) Patient ODER keine verknüpften Vorgänge ->
    //    direkt in den offenen Vorgängen nach dem Betreff-Namen suchen. Deckt
    //    E-Mail-Absender ohne Patientendatensatz und Match-Lücken ab.
    if (cases.length === 0) {
      const all = await listCases(clientId, { activeOnly: true, limit: 200 });
      cases = all.filter((c) => nameMatchesCaseSubject(c, name));
      if (cases.length && cases[0].subject?.name) displayName = cases[0].subject.name;
    }

    if (cases.length === 0) {
      await clearActiveCase(clientId);
      return res.json({ ok: true, message: `Zu ${displayName} finde ich weder einen Patienten noch einen offenen Vorgang.` });
    }

    // Themenfilter darf nie in eine Sackgasse führen: passt das Thema nicht,
    // nimm trotzdem die gefundenen Vorgänge (das Modell rät Topics oft falsch).
    if (topic) {
      const filtered = cases.filter((c) => c.topic === topic);
      if (filtered.length) cases = filtered;
    }

    const c = cases[0];
    await setActiveCase(clientId, c);

    // Vollständigen Vorgangs-Kontext (inkl. E-Mail-Zusammenfassungen aus dem
    // Verlauf) mitliefern, damit Nachfragen wie "Was steht in der E-Mail?"
    // direkt aus dem Tool-Ergebnis beantwortet werden können.
    let context = "";
    try {
      const ctx = await getCaseContext(clientId, c.id);
      context = ctx?.contextText || "";
    } catch { /* Kontext ist Komfort, nie ein Blocker */ }

    if (cases.length > 1) {
      const topics = cases.map((x) => CASE_TOPIC_LABELS[x.topic] || x.topic).join(", ");
      return res.json({
        ok: true,
        message: `Es gibt mehrere offene Vorgänge (${topics}). Ich habe den neuesten geöffnet: ${caseSpoken(c)} Sage ein Thema, um zu wechseln.`,
        context,
      });
    }
    return res.json({ ok: true, message: caseSpoken(c), context });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/tools/assign-case", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const active = await getActiveCase(clientId);
    if (!active?.id) return res.json({ ok: false, message: "Welcher Vorgang? Bitte zuerst den Patienten nennen." });
    const assignee = normalizeAssignee(req.body?.assignee);
    const instruction = (req.body?.instruction || req.body?.text || "").trim();
    const op = await getOperator(clientId);
    const out = await assignCase(clientId, active.id, { assignee, instruction, by: op?.name || "Clara" });
    if (!out.ok) return res.json({ ok: false, message: `Delegieren nicht möglich: ${out.reason}` });

    // Delegated to Nadine -> auto-prepare an approval-ready draft (background, so
    // Clara answers immediately and the human approves it later in Nadine).
    let prepNote = "";
    if (String(assignee || "").toLowerCase() === "nadine") {
      prepNote = " Nadine bereitet einen Entwurf zur Freigabe vor.";
      prepareCaseDraft(clientId, active.id, { by: "Nadine" }).catch(() => { /* best-effort */ });
    }
    const who = active.subject?.name ? ` für ${active.subject.name}` : "";
    return res.json({
      ok: true,
      message: `Erledigt. ${assignee} übernimmt den Vorgang${who}${instruction ? `: ${instruction}` : ""}.${prepNote}`,
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/tools/update-case", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const active = await getActiveCase(clientId);
    if (!active?.id) return res.json({ ok: false, message: "Welcher Vorgang? Bitte zuerst den Patienten nennen." });
    const text = (req.body?.text || req.body?.note || "").trim();
    if (!text) return res.json({ ok: false, message: "Was soll ich notieren?" });
    const op = await getOperator(clientId);
    const out = await addUpdate(clientId, active.id, { by: op?.name || "Clara", kind: "note", text });
    if (!out.ok) return res.json({ ok: false, message: `Notiz nicht möglich: ${out.reason}` });
    return res.json({ ok: true, message: "Notiert." });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/tools/close-case", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const active = await getActiveCase(clientId);
    if (!active?.id) return res.json({ ok: false, message: "Welcher Vorgang? Bitte zuerst den Patienten nennen." });
    const note = (req.body?.note || req.body?.text || "").trim();
    const status = /schließ|geschlossen|closed|abschließ/.test((req.body?.status || "").toLowerCase()) ? "closed" : "resolved";
    const op = await getOperator(clientId);
    const out = await setStatus(clientId, active.id, status, { by: op?.name || "Clara", note });
    if (!out.ok) return res.json({ ok: false, message: `Schließen nicht möglich: ${out.reason}` });
    await clearActiveCase(clientId);
    const who = active.subject?.name ? ` von ${active.subject.name}` : "";
    return res.json({ ok: true, message: `Vorgang${who} als ${status === "closed" ? "geschlossen" : "gelöst"} markiert.` });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// --- Lisa: outbound SMS + calls, delegated by Clara (voice) ----------------
// Clara (local LLM) extracts phone + content from the spoken order; these
// endpoints execute deterministically and write every delegation + outcome to
// the shared brain (lisa_sms / lisa_call).
// ============================================================================
// Kontakt-Auflösung per NAME + KONTEXT — "Ruf Herrn Meier an" ohne Nummer.
// Ablauf: find_contact(name) -> eindeutig? Kontakt wird serverseitig gemerkt
// und send_sms / delegate_call brauchen KEINE Telefonnummer mehr. Mehrdeutig?
// Clara nennt die Kandidaten; der Chef antwortet mit Vorname/Jahrgang ODER
// Kontext ("der gestern da war", "der wegen der Rechnung angerufen hat") und
// find_contact(hint) gleicht das gegen Termin-Historie + Vorgänge ab.
// ============================================================================

const HINT_TOPIC_WORDS = {
  rechnung: ["rechnung", "bezahl", "zahlung", "mahnung", "kostenplan", "erstattung"],
  termin: ["termin", "verschieb", "absag", "umbuch"],
  dokumente: ["dokument", "unterlagen", "formular", "anamnese", "ausgefüllt", "ausgefuellt"],
  beschwerde: ["beschwer", "unzufrieden", "ärger", "aerger"],
  rueckruf: ["rückruf", "rueckruf", "zurückrufen", "zurueckrufen"],
};
const HINT_CHANNEL_WORDS = {
  mail: ["e-mail", "email", "mail geschickt", "geschrieben", "gemailt"],
  call: ["angerufen", "anruf", "telefoniert", "gemeldet"],
  sms: ["sms"],
};
const NUM_WORDS_DE = { ein: 1, eine: 1, einer: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8 };

// Aus einem gesprochenen Zeit-Hinweis die zu prüfenden Tage (Offsets relativ zu
// heute, negativ = Vergangenheit) ableiten. null = kein Zeitbezug im Hinweis.
function hintDayOffsets(hintLower) {
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  if (/\bvorgestern\b/.test(hintLower)) return [-2];
  if (/\bgestern\b/.test(hintLower)) return [-1];
  if (/\bheute\b/.test(hintLower)) return [0];
  let m = hintLower.match(/vor\s+(\d+|\w+)\s+tagen?/);
  if (m) {
    const n = Number(m[1]) || NUM_WORDS_DE[m[1]] || 0;
    if (n > 0) return range(-n - 1, -n + 1).filter((o) => o < 0);
  }
  m = hintLower.match(/vor\s+(\d+|\w+)\s+wochen?/);
  if (m) {
    const n = Number(m[1]) || NUM_WORDS_DE[m[1]] || 0;
    if (n > 0) return range(-7 * n - 3, -7 * n + 3);
  }
  if (/letzte[rn]?\s+woche/.test(hintLower)) return range(-13, -5);
  if (/diese[rn]?\s+woche/.test(hintLower)) return range(-6, 0);
  const wd = { montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 0 };
  for (const [name, dow] of Object.entries(wd)) {
    if (hintLower.includes(name)) {
      // Letztes Vorkommen dieses Wochentags innerhalb der letzten 7 Tage.
      const today = new Date().getDay();
      let diff = today - dow;
      if (diff <= 0) diff += 7;
      return [-diff];
    }
  }
  return null;
}

function dayOffsetToIso(offset) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// Welche Kandidaten hatten in den genannten Tagen einen Termin?
async function candidatesWithAppointment(clientId, candidates, offsets) {
  const ids = new Set(candidates.map((p) => String(p.id || "")));
  const hit = new Set();
  // Begrenzt auf 16 Tage, neueste zuerst — ein Tages-Read pro Tag ist ok,
  // Disambiguierung ist ein seltener, interaktiver Moment.
  for (const off of offsets.slice(0, 16)) {
    const day = await getDayAppointments(clientId, { date: dayOffsetToIso(off) }).catch(() => null);
    for (const a of day?.appointments || []) {
      if (!a.isAbsence && ids.has(String(a.patientId || ""))) hit.add(String(a.patientId));
    }
    if (hit.size === ids.size) break;
  }
  return candidates.filter((p) => hit.has(String(p.id || "")));
}

// Welche Kandidaten haben einen Vorgang, der zum Hinweis passt (Thema/Kanal,
// optional im genannten Zeitfenster)?
async function candidatesWithCase(clientId, candidates, hintLower, offsets) {
  const words = [];
  for (const list of Object.values(HINT_TOPIC_WORDS)) for (const w of list) if (hintLower.includes(w)) words.push(w);
  for (const list of Object.values(HINT_CHANNEL_WORDS)) for (const w of list) if (hintLower.includes(w)) words.push(w);
  const fromMs = offsets ? Date.now() + Math.min(...offsets) * 86400000 - 86400000 : 0;
  const toMs = offsets ? Date.now() + Math.max(...offsets) * 86400000 + 86400000 : Number.MAX_SAFE_INTEGER;
  const out = [];
  for (const p of candidates) {
    if (!p.id) continue;
    const cases = await listCases(clientId, { patientId: String(p.id), limit: 20 }).catch(() => []);
    const match = cases.some((c) => {
      const ts = c.updatedAt?.toMillis?.() ?? c.updatedAt ?? 0;
      if (offsets && (ts < fromMs || ts > toMs)) return false;
      if (!words.length) return true; // reiner Zeitbezug: jeder Vorgang im Fenster zählt
      const text = JSON.stringify({ t: c.topic, ti: c.title, s: c.summary, u: (c.updates || []).slice(-5) }).toLowerCase();
      return words.some((w) => text.includes(w));
    });
    if (match) out.push(p);
  }
  return out;
}

function contactSummary(p) {
  const name = `${p.firstName || ""} ${p.lastName || ""}`.trim();
  const phone = String(p.mobilePhoneNumber || "").trim();
  const email = String(p.email || "").trim();
  const parts = [];
  if (phone) parts.push("eine Handynummer ist hinterlegt");
  if (email) parts.push("eine E-Mail-Adresse ist hinterlegt");
  if (!parts.length) {
    return `Gemeint ist ${name} — aber es ist weder Telefonnummer noch E-Mail hinterlegt. Ich kann diesen Patienten nicht direkt erreichen.`;
  }
  const can = [];
  if (phone) { can.push("anrufen lassen"); can.push("eine SMS schicken"); }
  if (email) can.push("Nadine eine E-Mail schreiben lassen");
  return `Gemeint ist ${name}, ${parts.join(" und ")}. Ich kann ${can.join(", ")} — was darf es sein?`;
}

// Gemeinsame Disambiguierungs-Route für find_contact UND search_patient (also
// auch vor jeder Terminbuchung): Vorname/Jahrgang -> Termin-Historie ->
// Vorgänge. Liefert { status: "one"|"many"|"none", narrowed }.
async function narrowPatientCandidatesByHint(clientId, candidates, hintLower) {
  // Deterministische Schnellwege (Stefan-Meier-Loop, 2026-06-11):
  // 1. Ordinal ("der erste", "nummer zwei", "der letzte") gegen die Liste in
  //    der Reihenfolge, in der sie angesagt wurde.
  const byOrdinal = ordinalPick(hintLower, candidates);
  if (byOrdinal) return { status: "one", narrowed: [byOrdinal] };
  // 2. Genannte (Teil-)Telefonnummer gegen die hinterlegten Nummern.
  const byPhone = narrowByPhoneFragment(hintLower, candidates);
  if (byPhone.length === 1) return { status: "one", narrowed: byPhone };
  if (byPhone.length > 1) candidates = byPhone;
  // 3. Exakter voller Name ("Stefan Meier" trifft nicht Stefanie Meierhoefer).
  const byFullName = narrowByExactName(hintLower, candidates);
  if (byFullName.length === 1) return { status: "one", narrowed: byFullName };
  if (byFullName.length > 1) candidates = byFullName;

  const byName = candidates.filter((p) =>
    hintLower.includes(String(p.firstName || "").toLowerCase()) && String(p.firstName || "").length >= 3
  );
  const byYear = candidates.filter((p) => {
    const y = String(p.birthDate || "").slice(0, 4);
    return y && hintLower.includes(y);
  });
  let narrowed = byName.length === candidates.length ? [] : byName;
  if (!narrowed.length) narrowed = byYear;
  // Telefon-/Vollname-Eingrenzung zaehlt als Fortschritt, auch wenn am Ende
  // mehrere bleiben — dann mit MEHR Unterscheidungsmerkmalen nachfragen.
  if (!narrowed.length && (byPhone.length > 1 || byFullName.length > 1)) {
    narrowed = candidates;
  }
  if (!narrowed.length) {
    const offsets = hintDayOffsets(hintLower);
    const mentionsVisit = /\b(da war|hier war|termin|behandlung|gekommen)\b/.test(hintLower);
    const mentionsComm = Object.values(HINT_CHANNEL_WORDS).flat().some((w) => hintLower.includes(w))
      || Object.values(HINT_TOPIC_WORDS).flat().some((w) => hintLower.includes(w));
    if (offsets && (mentionsVisit || !mentionsComm)) {
      narrowed = await candidatesWithAppointment(clientId, candidates, offsets);
    }
    if (!narrowed.length && (mentionsComm || offsets)) {
      narrowed = await candidatesWithCase(clientId, candidates, hintLower, offsets);
    }
  }
  // Der Hint passt auf ALLE Kandidaten gleichermassen (z.B. der geteilte volle
  // Name "Stefan Meier" bei Namensvettern): kein "kein Treffer", sondern
  // gezielt mit Unterscheidungsmerkmalen nachfragen.
  if (!narrowed.length && candidates.length > 1) {
    const full = (p) => `${p.firstName || ""} ${p.lastName || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
    if (candidates.every((p) => full(p).length >= 5 && hintLower.includes(full(p)))) {
      return { status: "many", narrowed: candidates };
    }
  }
  if (narrowed.length === 1) return { status: "one", narrowed };
  if (narrowed.length > 1) return { status: "many", narrowed };
  return { status: "none", narrowed: [] };
}

// ============================================================================
// Externe Kontakte (Handwerker, Labor, Lieferanten): kein Patient, aber im
// Shared Memory auffindbar — Adressbuch (mas_contacts), Posteingang (Absender
// ODER Name im Text, Telefonnummer aus der Signatur) und Anruf-Events
// (counterparty.ref = Rufnummer). "Ruf Herrn Kasper an wegen der Leuchtreklame."
// ============================================================================

const PHONE_IN_TEXT_RE = /(?:\+49|0049|0)[\d\s\/\-().]{7,18}\d/g;

function extractPhoneFromText(text) {
  for (const m of String(text || "").match(PHONE_IN_TEXT_RE) || []) {
    const norm = normalizePhone(m);
    if (norm) return norm;
  }
  return "";
}

function stripHtmlToText(html) {
  return String(html || "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDayDe(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "2-digit" });
  } catch { return ""; }
}

async function findExternalContact(clientId, name, hintLower) {
  const nameLower = name.toLowerCase();
  const tokens = [nameLower, ...hintLower.split(/\s+/).filter((t) => t.length >= 5)];
  const provenance = [];
  let phone = "";
  let email = "";
  let displayName = "";

  // 1) Adressbuch (von Nadine gepflegt: praxisrelevante Absender)
  const book = await listContacts(clientId, { q: name, limit: 5 }).catch(() => ({ items: [] }));
  const bookHit = (book.items || [])[0];
  if (bookHit) {
    displayName = bookHit.name || "";
    email = bookHit.address || "";
    provenance.push(`steht im Adressbuch${bookHit.lastSubject ? ` (zuletzt: „${bookHit.lastSubject}“)` : ""}`);
  }

  // 2) Posteingang: Name im Absender ODER im Text (Signatur), Nummer extrahieren.
  // Auch die Adressbuch-Adresse zählt als Treffer (Name "Kasper" vs. Absender
  // "info@kasper-werbetechnik.de").
  const addrLower = (bookHit?.address || "").toLowerCase();
  const accountIds = await operatorMailAccountIds(clientId).catch(() => null);
  const rows = await listMessages(clientId, { folder: "INBOX", limit: 80, accountIds }).catch(() => []);
  const fromText = (f) => (typeof f === "object" && f !== null ? `${f.name || ""} ${f.address || ""}` : String(f || ""));
  const rowHay = (r) => `${fromText(r.from)} ${r.subject || ""} ${r.preview || ""}`.toLowerCase();
  const mailHits = rows.filter((r) => rowHay(r).includes(nameLower) || (addrLower && rowHay(r).includes(addrLower)));
  // Hint-Wörter (z.B. "leuchtreklame") priorisieren die richtige Mail.
  mailHits.sort((a, b) => {
    const score = (r) => tokens.filter((t) => rowHay(r).includes(t)).length;
    return score(b) - score(a);
  });
  for (const hit of mailHits.slice(0, 3)) {
    const full = await getMessage(clientId, hit.id).catch(() => null);
    if (!full) continue;
    const bodyText = `${String(full.textBody || "")} ${stripHtmlToText(full.htmlBody)}`;
    if (!displayName) {
      const f = full.from;
      displayName = (typeof f === "object" && f !== null ? String(f.name || f.address || "") : String(f || "")).replace(/<[^>]*>/g, "").trim();
    }
    if (!email) {
      const f = full.from;
      const addr = typeof f === "object" && f !== null ? String(f.address || "") : (String(f || "").match(/<([^>]+)>/) || [])[1] || "";
      if (addr.includes("@")) email = addr;
    }
    if (!phone) phone = extractPhoneFromText(bodyText);
    const when = fmtDayDe(full.date ? new Date(full.date).getTime() : 0);
    provenance.push(`hat${when ? ` am ${when}` : ""} eine E-Mail geschickt (Betreff: ${full.subject || "ohne Betreff"})${phone ? " — Telefonnummer aus der E-Mail übernommen" : ""}`);
    if (phone) break;
  }

  // 3) Anruf-Events im Shared Memory: Name als Gesprächspartner, Nummer am Event
  const events = await queryRecent(clientId, Date.now() - 60 * 86400000, 1000).catch(() => []);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const who = `${e.subject?.name || ""} ${e.counterparty?.name || ""}`.toLowerCase();
    if (!who.includes(nameLower)) continue;
    const evPhone = normalizePhone(e.counterparty?.ref || "");
    if (!displayName) displayName = e.subject?.name || e.counterparty?.name || "";
    if (!phone && evPhone) phone = evPhone;
    provenance.push(`${fmtDayDe(e.ts)}: ${e.channel === "lisa_call" ? "Lisa hat dort angerufen" : "hat hier angerufen"}${e.summary ? ` — ${String(e.summary).slice(0, 120)}` : ""}`);
    if (provenance.length >= 4) break;
  }

  if (!provenance.length && !phone && !email) return null;
  return { displayName: displayName || name, phone, email, provenance };
}

app.post("/tools/find-contact", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = String(req.body?.name || "").trim();
    const hint = String(req.body?.hint || "").trim();
    const hintLower = hint.toLowerCase();

    // Ordinal-Antworten ("der erste") IMMER gegen die zuletzt vorgelesene
    // Kandidatenliste aufloesen — nie gegen eine frische Suche (siehe
    // search-patient: sonst trifft "der erste" den falschen Namensvetter).
    {
      const ordinalSource = `${hintLower} ${rawName.toLowerCase()}`.trim();
      if (ordinalSource) {
        const remembered = await getPatientCandidates(clientId);
        // Nur wenn tatsaechlich eine Auswahl offen ist (>1 gemerkte Kandidaten).
        const byOrd = remembered.length > 1 ? ordinalPick(ordinalSource, remembered) : null;
        if (byOrd) {
          await setPatientCandidates(clientId, [byOrd], byOrd);
          return res.json({ ok: true, message: contactSummary(byOrd) });
        }
      }
    }

    // Kandidaten: neue Suche bei Namen, sonst die der letzten Suche (Nachfrage).
    let candidates = [];
    if (rawName) {
      const name = cleanSpokenPersonName(rawName) || rawName;
      const found = await searchPatientSpoken(clientId, name);
      if (!found.ok) return res.json({ ok: false, message: `Patientensuche fehlgeschlagen: ${found.error}` });
      candidates = found.patients || [];
      // Exakter Voll-Name schlaegt Teil-Treffer ("Stefan Meier" soll nicht an
      // "Stefanie Meierhoefer" haengen bleiben).
      if (candidates.length > 1) {
        const exact = narrowByExactName(name.toLowerCase(), candidates);
        if (exact.length) candidates = exact;
      }
      if (!candidates.length) {
        // Kein Patient -> externer Kontakt? (Handwerker, Labor, Lieferant —
        // aus Adressbuch, Posteingang und Anruf-Events im Shared Memory.)
        const ext = await findExternalContact(clientId, name, hintLower);
        if (ext) {
          await setPatientCandidates(clientId, [], {
            id: null,
            firstName: "",
            lastName: ext.displayName,
            mobilePhoneNumber: ext.phone,
            email: ext.email,
            hasPhone: !!ext.phone,
            external: true,
          });
          const who = ext.displayName;
          const trail = ext.provenance.slice(0, 2).join("; ");
          const reach = ext.phone
            ? "Ich habe eine Telefonnummer — soll Lisa anrufen oder eine SMS schicken, oder soll Nadine antworten?"
            : (ext.email ? "Eine Telefonnummer habe ich nicht gefunden, aber die E-Mail-Adresse — soll Nadine schreiben?" : "Ich habe leider weder Telefonnummer noch E-Mail gefunden.");
          return res.json({ ok: true, message: `${who} ist kein Patient, aber ich kenne den Kontakt${trail ? `: ${trail}` : ""}. ${reach}` });
        }
        await setPatientCandidates(clientId, [], null);
        return res.json({ ok: false, message: `Ich finde weder einen Patienten noch einen bekannten Kontakt namens ${name} — auch nicht in E-Mails oder Anrufen.` });
      }
    } else {
      candidates = await getPatientCandidates(clientId);
      if (!candidates.length) {
        return res.json({ ok: false, message: "Für wen suche ich den Kontakt? Bitte den Namen nennen." });
      }
    }

    // Kontext-Hinweis abgleichen: erst Vorname/Jahrgang, dann Termin-Historie,
    // dann Vorgänge (Thema/Kanal/Zeitraum).
    if (hint && candidates.length > 1) {
      const r = await narrowPatientCandidatesByHint(clientId, candidates, hintLower);
      if (r.status === "one") candidates = r.narrowed;
      else if (r.status === "many") {
        await setPatientCandidates(clientId, r.narrowed, null);
        return res.json({ ok: true, message: `Das trifft noch auf mehrere zu. ${disambiguationQuestion(r.narrowed)}` });
      } else {
        // Passt der Hinweis auf keinen Patienten, ist vielleicht ein EXTERNER
        // Kontakt gemeint ("Herr Kasper wegen der Leuchtreklame" = Werbetechniker,
        // nicht der Patient Kasper) — erst prüfen, dann zurückfragen.
        if (rawName) {
          const ext = await findExternalContact(clientId, cleanSpokenPersonName(rawName) || rawName, hintLower);
          if (ext && (ext.phone || ext.email)) {
            await setPatientCandidates(clientId, [], {
              id: null, firstName: "", lastName: ext.displayName,
              mobilePhoneNumber: ext.phone, email: ext.email, hasPhone: !!ext.phone, external: true,
            });
            const trail = ext.provenance.slice(0, 2).join("; ");
            const reach = ext.phone
              ? "Ich habe eine Telefonnummer — soll Lisa anrufen oder eine SMS schicken?"
              : "Eine Telefonnummer habe ich nicht gefunden, aber die E-Mail-Adresse — soll Nadine schreiben?";
            return res.json({ ok: true, message: `Das passt auf keinen Patienten, aber auf einen bekannten Kontakt: ${ext.displayName}${trail ? ` — ${trail}` : ""}. ${reach}` });
          }
        }
        await setPatientCandidates(clientId, candidates, null);
        return res.json({ ok: true, message: `Dazu finde ich keinen passenden Treffer. ${disambiguationQuestion(candidates)}` });
      }
    }

    if (candidates.length > 1) {
      await setPatientCandidates(clientId, candidates, null);
      // Keine zitierbare Beispielantwort anhaengen ("Sie koennen auch sagen:
      // ...") — das 4B-Modell uebernimmt solche Saetze woertlich als eigene
      // Antwort statt die Rueckfrage zu stellen (Testlauf 2026-06-11).
      return res.json({ ok: true, message: disambiguationQuestion(candidates) });
    }

    const sel = candidates[0];
    await setPatientCandidates(clientId, candidates, sel);
    await emitCommand(clientId, {
      type: "patient_selected",
      patient: { firstName: sel.firstName, lastName: sel.lastName, birthDate: sel.birthDate },
      hasPhone: !!sel.hasPhone,
    }).catch(() => {});
    return res.json({ ok: true, message: contactSummary(sel) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Fallback auf den zuvor per find_contact/search_patient bestimmten Kontakt,
// damit SMS und Anruf OHNE gesprochene Telefonnummer funktionieren.
async function resolveDelegationTarget(clientId, body) {
  let phone = String(body?.phone || body?.phoneNumber || "").trim();
  let name = String(body?.recipientName || body?.contactName || "").trim();
  if (phone) return { phone, name };
  const sel = await getSelectedPatient(clientId);
  const selPhone = String(sel?.mobilePhoneNumber || "").trim();
  if (selPhone) {
    return { phone: selPhone, name: name || `${sel.firstName || ""} ${sel.lastName || ""}`.trim() };
  }
  return { phone: "", name };
}

app.post("/tools/send-sms", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const target = await resolveDelegationTarget(clientId, req.body);
    if (!target.phone) {
      return res.json({ ok: false, message: "Ich habe keine Telefonnummer. Sage zuerst: Suche den Kontakt von — und den Namen." });
    }
    // Testsuite-Schutz: validiert den kompletten Pfad (Kontakt, Nummer),
    // verschickt aber NICHTS über Twilio.
    if (req.body?.dryRun) {
      return res.json({ ok: true, dryRun: true, message: `Testlauf: Die SMS an ${target.name || target.phone} wäre jetzt verschickt worden.` });
    }
    const out = await lisaSendSms(clientId, {
      phone: target.phone,
      message: req.body?.message || req.body?.text,
      recipientName: target.name,
      by: op?.name || "Team",
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.post("/tools/delegate-call", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const op = await getOperator(clientId);
    const target = await resolveDelegationTarget(clientId, req.body);
    if (!target.phone) {
      return res.json({ ok: false, message: "Ich habe keine Telefonnummer. Sage zuerst: Suche den Kontakt von — und den Namen." });
    }
    // Testsuite-Schutz: validiert Kontakt + Nummer, ruft aber NIEMANDEN an.
    if (req.body?.dryRun) {
      return res.json({ ok: true, dryRun: true, message: `Testlauf: Lisa hätte jetzt ${target.name || target.phone} angerufen.` });
    }
    const out = await lisaStartCall(clientId, {
      phone: target.phone,
      instruction: req.body?.instruction || req.body?.message || req.body?.text,
      contactName: target.name,
      callLanguage: req.body?.callLanguage,
      by: op?.name || "Team",
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Monitor: recent Lisa delegations (SMS + calls) with status/outcome.
app.get("/lisa/tasks", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const tasks = await listLisaTasks(clientId, Math.min(Number(req.query.limit) || 25, 100));
    res.json({ ok: true, clientId, smsConfigured: lisaSmsConfigured(), callConfigured: lisaCallConfigured(), tasks });
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

// --- Internal-team patient flow (search existing patient + book by id) ----
// Clara books for the practice staff: they name an EXISTING patient (no phone).
// search_patient finds them; the choice is remembered server-side; then
// book_for_patient books by patientId and drives the live monitor (jump to the
// day, open the appointment popup pre-filled). Uses the dedicated additive
// Cloud Functions masSearchPatients / masBookAppointment.
function prettySlot(iso) {
  return String(iso || "").replace("T", " ").slice(0, 16);
}
function birthYear(b) {
  const s = String(b || "");
  return /^\d{4}/.test(s) ? s.slice(0, 4) : "";
}
function patientLabel(p) {
  const name = `${p.firstName || ""} ${p.lastName || ""}`.trim();
  const y = birthYear(p.birthDate);
  return y ? `${name} (Jahrgang ${y})` : name;
}

app.post("/tools/search-patient", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = (req.body?.name || req.body?.query || "").trim();
    const hint = String(req.body?.hint || "").trim();
    const hintLower = hint.toLowerCase();

    // Ordinal-Antworten ("der erste") beziehen sich IMMER auf die zuletzt
    // VORGELESENE Kandidatenliste — nie auf eine frische Namenssuche. Sonst
    // greift "der erste" auf einer neu sortierten Liste daneben (Testlauf
    // 2026-06-11: name="Meier" + hint="der erste" traf Rainer statt Stefan).
    const ordinalSource = `${hintLower} ${rawName.toLowerCase()}`.trim();
    if (ordinalSource) {
      const remembered = await getPatientCandidates(clientId);
      // Nur wenn tatsaechlich eine Auswahl offen ist (>1 gemerkte Kandidaten).
      const byOrd = remembered.length > 1 ? ordinalPick(ordinalSource, remembered) : null;
      if (byOrd) {
        await setPatientCandidates(clientId, [byOrd], byOrd);
        await emitCommand(clientId, {
          type: "patient_selected",
          patient: { firstName: byOrd.firstName, lastName: byOrd.lastName, birthDate: byOrd.birthDate },
          hasPhone: !!byOrd.hasPhone,
        });
        const warn = byOrd.hasPhone ? "" : " Achtung: keine Telefonnummer hinterlegt.";
        return res.json({ ok: true, message: `${patientLabel(byOrd)} gefunden.${warn}` });
      }
    }

    // Gleiche Identifikations-Route wie find_contact: bei einer Nachfrage
    // ("der, der gestern da war") OHNE neuen Namen gegen die gemerkten
    // Kandidaten der letzten Suche disambiguieren — auch vor Terminbuchung.
    let patients = [];
    if (rawName) {
      const name = cleanSpokenPersonName(rawName) || rawName;
      const result = await searchPatientSpoken(clientId, name);
      if (!result.ok) {
        return res.json({ ok: false, message: `Patientensuche fehlgeschlagen: ${result.error}` });
      }
      patients = result.patients || [];
      if (patients.length === 0) {
        await setPatientCandidates(clientId, [], null);
        return res.json({ ok: true, message: `Kein Patient mit dem Namen ${name} gefunden.` });
      }
      // Exakter Voll-Name schlaegt Teil-Treffer ("Stefan Meier" soll nicht an
      // "Stefanie Meierhoefer" haengen bleiben) — Stefan-Meier-Loop 2026-06-11.
      if (patients.length > 1) {
        const exact = narrowByExactName(name.toLowerCase(), patients);
        if (exact.length) patients = exact;
      }
    } else {
      patients = await getPatientCandidates(clientId);
      if (!patients.length) {
        return res.json({ ok: false, message: "Bitte einen Namen nennen." });
      }
    }

    if (hint && patients.length > 1) {
      const r = await narrowPatientCandidatesByHint(clientId, patients, hintLower);
      if (r.status === "one") patients = r.narrowed;
      else if (r.status === "many") {
        await setPatientCandidates(clientId, r.narrowed, null);
        return res.json({ ok: true, message: `Das trifft noch auf mehrere zu. ${disambiguationQuestion(r.narrowed)}` });
      } else {
        await setPatientCandidates(clientId, patients, null);
        return res.json({ ok: true, message: `Dazu finde ich keinen passenden Treffer. ${disambiguationQuestion(patients)}` });
      }
    }

    if (patients.length === 1) {
      const sel = patients[0];
      await setPatientCandidates(clientId, patients, sel);
      await emitCommand(clientId, {
        type: "patient_selected",
        patient: { firstName: sel.firstName, lastName: sel.lastName, birthDate: sel.birthDate },
        hasPhone: !!sel.hasPhone,
      });
      const warn = sel.hasPhone ? "" : " Achtung: keine Telefonnummer hinterlegt.";
      // Keine Buchungsfrage anhaengen: das Tool wird auch fuer reine
      // Nachschlage-Fragen genutzt und drueckte Clara sonst bei jeder
      // Patientensuche in den Termin-Modus (2026-06-10).
      return res.json({
        ok: true,
        message: `${patientLabel(sel)} gefunden.${warn}`,
      });
    }

    // Multiple matches: remember candidates, ask to disambiguate (no selection).
    await setPatientCandidates(clientId, patients, null);
    await emitCommand(clientId, {
      type: "patient_candidates",
      candidates: patients.slice(0, 6).map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate,
        hasPhone: !!p.hasPhone,
      })),
    });
    // Keine zitierbare Beispielantwort anhaengen — siehe find_contact oben.
    return res.json({ ok: true, message: disambiguationQuestion(patients) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Kontaktkarte: "Wie ist die Telefonnummer von Herrn Tzannis?" — identifiziert
// den Patienten über die gleiche Route wie search_patient/find_contact, liest
// Mobil/Festnetz/E-Mail aus dem Patientendokument und PUSHT die Karte aufs
// gekoppelte Handy (Antippen = anrufen). Gesprochen wird die Nummer dazu.
function spokenPhoneNumber(raw) {
  const d = String(raw || "").replace(/[^\d+]/g, "");
  if (!d) return "";
  // "01776004600" -> "0177 600 4600", "+4915253904756" -> "+49 152 539 04 756"
  // — Häppchen liest die TTS sauber vor; nie eine einzelne Ziffer am Ende.
  let prefix = "";
  let body = d;
  let m;
  if ((m = /^0(\d{3})(\d+)$/.exec(d))) { prefix = `0${m[1]}`; body = m[2]; }
  else if ((m = /^(\+\d{2})(\d+)$/.exec(d))) { prefix = m[1]; body = m[2]; }
  const groups = [];
  let i = 0;
  while (i < body.length) {
    const take = body.length - i === 4 ? 2 : 3;
    groups.push(body.slice(i, i + take));
    i += take;
  }
  return `${prefix} ${groups.join(" ")}`.trim();
}

app.post("/tools/contact-card", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const rawName = (req.body?.name || "").trim();
    const hint = String(req.body?.hint || "").trim();

    // Patient identifizieren — gleiche Route wie search_patient (inkl.
    // Nachfrage gegen die gemerkten Kandidaten und STT-Varianten-Suche).
    let patients = [];
    if (rawName) {
      const name = cleanSpokenPersonName(rawName) || rawName;
      const result = await searchPatientSpoken(clientId, name);
      if (!result.ok) return res.json({ ok: false, message: `Patientensuche fehlgeschlagen: ${result.error}` });
      patients = result.patients || [];
      if (!patients.length) {
        await setPatientCandidates(clientId, [], null);
        return res.json({ ok: true, message: `Kein Patient mit dem Namen ${name} gefunden.` });
      }
    } else {
      patients = await getPatientCandidates(clientId);
      if (!patients.length) {
        const sel = await getSelectedPatient(clientId);
        if (sel?.id) patients = [sel];
      }
      if (!patients.length) return res.json({ ok: false, message: "Bitte einen Namen nennen." });
    }

    if (hint && patients.length > 1) {
      const r = await narrowPatientCandidatesByHint(clientId, patients, hint.toLowerCase());
      if (r.status === "one") patients = r.narrowed;
      else {
        const pool = r.status === "many" ? r.narrowed : patients;
        await setPatientCandidates(clientId, pool, null);
        return res.json({ ok: true, message: `Das trifft auf mehrere zu. ${disambiguationQuestion(pool)}` });
      }
    }
    if (patients.length > 1) {
      await setPatientCandidates(clientId, patients, null);
      return res.json({ ok: true, message: disambiguationQuestion(patients) });
    }

    const sel = patients[0];
    await setPatientCandidates(clientId, patients, sel);
    const who = `${sel.firstName || ""} ${sel.lastName || ""}`.trim();

    // Kontaktdaten aus dem Patientendokument.
    const booking = await loadBooking(clientId).catch(() => null);
    let pdoc = null;
    if (booking?.locationId && sel.id) {
      pdoc = await admin.firestore()
        .collection("clients").doc(clientId)
        .collection("locations").doc(booking.locationId)
        .collection("patients").doc(String(sel.id)).get()
        .then((s2) => (s2.exists ? s2.data() : null))
        .catch(() => null);
    }
    const mobile = String(pdoc?.mobilePhoneNumber || "").trim();
    const phone = String(pdoc?.phoneNumber || "").trim();
    const email = String(pdoc?.email || "").trim();
    if (!mobile && !phone && !email) {
      return res.json({ ok: true, message: `${who} gefunden, aber es sind keine Kontaktdaten hinterlegt.` });
    }

    // Karte aufs gekoppelte Handy pushen (Antippen öffnet Anrufen/SMS).
    let pushed = false;
    try {
      const op = await getOperator(clientId);
      if (op?.id) {
        const qp = new URLSearchParams({ n: who });
        if (mobile) qp.set("m", mobile);
        if (phone) qp.set("p", phone);
        if (email) qp.set("e", email);
        const url = `${PUBLIC_BASE_URL.replace(/\/+$/, "")}/m/contact.html?${qp.toString()}`;
        const bodyBits = [mobile && `📱 ${mobile}`, !mobile && phone && `📞 ${phone}`, email].filter(Boolean);
        const r = await notifyOperator(clientId, op.id, { title: `Kontakt: ${who}`, body: bodyBits.join(" · "), url });
        pushed = !!r.ok;
      }
    } catch { /* Push ist Komfort — die gesprochene Antwort steht auch ohne */ }

    const parts = [`${who}:`];
    if (mobile) parts.push(`Mobil ${spokenPhoneNumber(mobile)}.`);
    if (!mobile && phone) parts.push(`Festnetz ${spokenPhoneNumber(phone)}.`);
    if (!mobile && !phone && email) parts.push(`Keine Telefonnummer, aber eine E-Mail-Adresse ist hinterlegt.`);
    parts.push(pushed
      ? "Ich habe dir die Kontaktkarte aufs Handy geschickt — antippen und du kannst direkt anrufen."
      : "Die Karte konnte ich nicht aufs Handy schicken — kein gekoppeltes Gerät erreichbar.");
    return res.json({ ok: true, message: parts.join(" ") });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Delay between progressive draft steps so the team can SEE the dialog fill
// field by field on the monitor. Tunable via env (0 = fill instantly).
const DRAFT_STEP_MS = Number(process.env.MAS_DRAFT_STEP_MS || 600);
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

app.post("/tools/book-for-patient", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const selected = await getSelectedPatient(clientId);
    if (!selected || !selected.id) {
      return res.json({ ok: false, message: "Bitte zuerst den Patienten eindeutig suchen." });
    }
    if (!req.body?.appointmentStartDate) {
      return res.json({ ok: false, message: "Zu welchem Datum und welcher Uhrzeit?" });
    }

    // Ohne Arzt-Angabe: in den Kalender des gekoppelten Behandlers buchen —
    // nicht in den Praxis-Default. Gleiches Prinzip wie bei den Tagesansichten.
    let doctorName = String(req.body?.doctorName || "").trim();
    if (!doctorName) {
      try {
        const op = await getOperator(clientId);
        doctorName = String(op?.doctorName || op?.name || "").trim();
      } catch { /* fällt auf den Praxis-Default zurück */ }
    }

    // Resolve calendar + motive + time WITHOUT writing anything yet.
    const r = await resolveBooking(clientId, {
      doctorName: doctorName || undefined,
      visitMotiveName: req.body?.visitMotiveName,
      appointmentStartDate: req.body.appointmentStartDate,
    });
    if (!r.ok) {
      const map = {
        no_calendar: "Bei welchem Arzt soll der Termin gebucht werden?",
        no_motive: "Welche Behandlung soll gebucht werden?",
      };
      return res.json({ ok: false, message: map[r.error] || `Buchung nicht möglich: ${r.error}` });
    }

    const who = `${selected.firstName || ""} ${selected.lastName || ""}`.trim();
    // Testsuite-Schutz: Kalender/Behandlung/Zeit sind validiert (resolveBooking
    // lief durch), aber es wird NICHTS gebucht und kein Dialog geöffnet.
    if (req.body?.dryRun) {
      return res.json({ ok: true, dryRun: true, message: `Testlauf: Der Termin für ${who} am ${r.slotIso} bei ${r.calendarName} wäre jetzt gebucht worden.` });
    }
    const patientPayload = {
      id: selected.id,
      firstName: selected.firstName,
      lastName: selected.lastName,
      hasPhone: !!selected.hasPhone,
    };
    const baseDraft = {
      type: "appointment_draft",
      status: "collecting",
      date: r.date,
      slotIso: r.slotIso,
      calendarId: r.calendarId,
      calendarName: r.calendarName,
      visitMotiveId: r.visitMotiveId,
      visitMotiveName: r.visitMotiveName,
      visitMotiveDuration: r.visitMotiveDuration,
    };

    // Jump the monitor to the day, then OPEN AN EMPTY new-appointment dialog and
    // fill it step by step: time+calendar -> patient -> treatment. Each emit is a
    // cumulative snapshot; the dialog re-syncs on every change.
    await emitCommand(clientId, {
      type: "navigate",
      date: r.date,
      calendarId: r.calendarId,
      calendarName: r.calendarName,
    });
    // step 1: time + calendar (patient + treatment still empty)
    await emitCommand(clientId, {
      type: "appointment_draft",
      status: "collecting",
      date: r.date,
      slotIso: r.slotIso,
      calendarId: r.calendarId,
      calendarName: r.calendarName,
    });
    await sleep(DRAFT_STEP_MS);
    // step 2: + patient
    await emitCommand(clientId, {
      type: "appointment_draft",
      status: "collecting",
      date: r.date,
      slotIso: r.slotIso,
      calendarId: r.calendarId,
      calendarName: r.calendarName,
      patient: patientPayload,
    });
    await sleep(DRAFT_STEP_MS);
    // step 3: + treatment (full draft)
    const fullDraft = { ...baseDraft, patient: patientPayload };
    await emitCommand(clientId, fullDraft);

    // Dry-run: never write a real appointment.
    if (process.env.MAS_BOOKING_DRY_RUN === "1") {
      await emitCommand(clientId, { ...fullDraft, status: "booked" });
      await clearSelectedPatient(clientId);
      return res.json({
        ok: true,
        dryRun: true,
        booked: true,
        message: `Testmodus: Termin für ${who} am ${prettySlot(r.slotIso)} vorbereitet.`,
      });
    }

    // No phone on file -> hand off to the human: leave the dialog open so the
    // number can be entered and saved through the normal flow. No booking.
    if (!selected.hasPhone) {
      await emitCommand(clientId, { ...fullDraft, status: "need_phone" });
      return res.json({
        ok: true,
        needsPhone: true,
        message: `${who} hat keine Telefonnummer hinterlegt. Der Termin ist im Kalender geöffnet — bitte die Nummer ergänzen und speichern.`,
      });
    }

    // Phone present -> book via the dedicated Cloud Function.
    const c = await commitBooking(clientId, {
      patientId: selected.id,
      calendarId: r.calendarId,
      visitMotiveId: r.visitMotiveId,
      slotIso: r.slotIso,
    });

    if (c.ok && c.needsPhone) {
      await emitCommand(clientId, { ...fullDraft, status: "need_phone" });
      return res.json({
        ok: true,
        needsPhone: true,
        message: `${who} hat keine Telefonnummer hinterlegt. Bitte im geöffneten Termin ergänzen und speichern.`,
      });
    }
    if (!c.ok) {
      // Leave the filled draft open so the team can adjust (e.g. another time).
      return res.json({ ok: false, message: `Buchung nicht möglich: ${c.error}` });
    }

    // Booked: open the saved appointment once it lands via the calendar listener.
    await emitCommand(clientId, {
      type: "appointment_created",
      date: r.date,
      slotIso: r.slotIso,
      calendarId: r.calendarId,
      calendarName: c.doctorName || r.calendarName,
      visitMotiveName: r.visitMotiveName,
      patient: { firstName: selected.firstName, lastName: selected.lastName },
    });
    await clearSelectedPatient(clientId);

    // Read-before-act, spoken back: if this patient ALREADY had an open case
    // in the shared brain, Clara mentions it right after confirming the
    // booking. Looked up BEFORE recording the booking event, so the hint can
    // never be the case this very booking just created.
    let memoryHint = "";
    try {
      const open = await listCases(clientId, { patientId: selected.id, activeOnly: true, limit: 3 });
      if (open.length) {
        const top = open[0];
        memoryHint = ` Hinweis aus dem Praxisgedächtnis: Zu ${who} gibt es einen offenen Vorgang (${top.title || top.topic})${top.assignee ? `, liegt bei ${top.assignee}` : ""}.`;
      }
    } catch { /* hint only — booking already succeeded */ }

    // Shared-brain contract: EVERY action lands on the patient's timeline
    // immediately, with operator attribution. The calendar watch skips this
    // appointment later because the appt-action event already exists.
    const opNow = await getOperator(clientId).catch(() => null);
    if (!c.alreadyBooked) {
      await recordCommunication(clientId, {
        id: `appt-action:${c.appointmentId || `${selected.id}:${r.slotIso}`}:booked`,
        channel: "clara_voice",
        direction: "internal",
        type: "interaction",
        counterparty: { kind: "patient", name: who, ref: null },
        subject: { patientId: selected.id, name: who, matchStatus: "matched", matchMethod: "calendar" },
        signals: { appointmentRequest: true },
        summary: `Clara hat für ${who} am ${prettySlot(r.slotIso)}${r.calendarName ? ` bei ${r.calendarName}` : ""} gebucht (${r.visitMotiveName || "Kontrolle"})${opNow?.name ? ` — auf Zuruf von ${opNow.name}` : ""}.`,
        extractor: "clara@booking",
        payloadRef: c.appointmentId ? { kind: "appointment", id: c.appointmentId } : null,
      }, { by: "Clara" });
    }

    const pre = c.alreadyBooked ? "Der Termin war bereits gebucht" : "Termin gebucht";
    return res.json({
      ok: true,
      booked: true,
      message: `${pre} für ${who} am ${prettySlot(r.slotIso)}${r.calendarName ? ` bei ${r.calendarName}` : ""}.${memoryHint}`,
    });
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

app.post("/cf/getFreeTimeSlots", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    sendCf(res, await proxyGetFreeTimeSlots(clientId, req.body || {}));
  } catch (e) {
    res.status(500).json({ status: "error", message: String(e?.message || e) });
  }
});

app.post("/cf/createAppointment", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    sendCf(res, await proxyCreateAppointment(clientId, req.body || {}));
  } catch (e) {
    res.status(500).json({ status: "error", message: String(e?.message || e) });
  }
});

app.post("/cf/updateOrCancelAppointment", async (req, res) => {
  try {
    sendCf(res, await proxyUpdateOrCancel(req.body || {}));
  } catch (e) {
    res.status(500).json({ status: "error", message: String(e?.message || e) });
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

app.post("/clara/identify", async (req, res) => {
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

// --- Operator team & PINs ------------------------------------------------
// The roster of people who may identify themselves to Clara via a personal PIN.
// PINs are stored only as salted hashes (see operators.js); the API never
// returns or accepts the plaintext after saving (an empty pin keeps the old one).
app.get("/clara/team", async (req, res) => {
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

app.put("/clara/team", async (req, res) => {
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

// ── Clara ruft aufs Handy: Geräte-Pairing + Web-Push ────────────────────────
// Pairing: settings UI mints a single-use QR token bound to a team member; the
// phone scans it, subscribes to Web-Push and registers. From then on Clara can
// ring that phone with a call-style notification, and the phone authenticates
// PIN-less via deviceId+deviceKey. NOTE: these routes must stay ABOVE the
// GET /clara/:clientId catch-all.

// Public: the phone needs the VAPID public key to subscribe.
app.get("/clara/devices/vapid-key", (req, res) => {
  if (!pushConfigured()) return res.status(503).json({ ok: false, error: "push_not_configured" });
  res.json({ ok: true, key: vapidPublicKey() });
});

// Authenticated (settings UI): mint a pairing token + QR for one team member.
app.post("/clara/devices/pairing-token", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    if (!pushConfigured()) return res.status(503).json({ ok: false, error: "push_not_configured" });
    // The person can be an existing team/PIN operator (operatorId) OR any
    // practice member by name — pairing must not require a separate team setup.
    const operatorId = (req.body?.operatorId || "").trim();
    const name = (req.body?.name || "").trim();
    const members = await listOperators(clientId);
    let op = operatorId ? members.find((m) => m.id === operatorId) : null;
    if (!op && name) {
      op = members.find((m) => m.name.toLowerCase() === name.toLowerCase()) || {
        id: `usr_${(req.body?.userId || "").trim() || randomUUID().slice(0, 8)}`,
        name,
        role: normalizeRole(req.body?.role),
        doctorName: null,
      };
    }
    if (!op) return res.status(400).json({ ok: false, error: "operator_unknown" });
    const t = await createPairingToken(clientId, op, { createdBy: req.auth?.userId || "" });
    const url = `${PUBLIC_BASE_URL}/m/pair.html?c=${encodeURIComponent(clientId)}&t=${encodeURIComponent(t.token)}`;
    let qrDataUrl = "";
    try { qrDataUrl = await QRCode.toDataURL(url, { width: 280, margin: 1 }); } catch { qrDataUrl = ""; }
    res.json({ ok: true, token: t.token, url, qrDataUrl, expiresAtMs: t.expiresAtMs, operator: { id: op.id, name: op.name, role: op.role } });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Public (token-gated): the phone redeems the QR token with its push subscription.
app.post("/clara/devices/register", async (req, res) => {
  try {
    const clientId = (req.body?.clientId || req.query?.clientId || "").trim();
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const r = await redeemPairingToken(clientId, req.body?.token, {
      subscription: req.body?.subscription,
      userAgent: req.header("User-Agent") || "",
      label: req.body?.label || "",
    });
    if (!r.ok) return res.status(400).json({ ok: false, error: r.reason });
    log.info("device paired", { requestId: req.requestId, clientId, deviceId: r.deviceId, operatorId: r.operator?.id });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Public (deviceKey-gated): subscriptions rotate; the phone re-registers its own.
app.post("/clara/devices/refresh", async (req, res) => {
  try {
    const clientId = (req.body?.clientId || "").trim();
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const r = await refreshSubscription(clientId, req.body?.deviceId, req.body?.deviceKey, req.body?.subscription);
    if (!r.ok) return res.status(401).json({ ok: false, error: r.reason });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Authenticated: device list for the settings UI (no secrets, no endpoints).
app.get("/clara/devices", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const devices = await listDevices(clientId, { operatorId: (req.query?.operatorId || "").trim() });
    res.json({ ok: true, devices, pushConfigured: pushConfigured() });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.delete("/clara/devices/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const r = await removeDevice(clientId, req.params.id);
    log.info("device removed", { requestId: req.requestId, clientId, deviceId: req.params.id });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Public (deviceKey-gated): the phone rings ITSELF — onboarding self-test.
app.post("/clara/devices/self-test", async (req, res) => {
  try {
    const clientId = (req.body?.clientId || "").trim();
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const who = await identifyByDevice(clientId, req.body?.deviceId, req.body?.deviceKey);
    if (!who) return res.status(401).json({ ok: false, error: "device_auth_failed" });
    const r = await callDevice(clientId, who.deviceId, {
      reason: "Probeanruf – so klingt es, wenn Clara dich anruft",
      publicBaseUrl: PUBLIC_BASE_URL,
    });
    res.status(r.ok ? 200 : 502).json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Authenticated: ring one device ("Probeanruf" from the settings UI).
app.post("/clara/devices/:id/test-call", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const reason = (req.body?.reason || "Probeanruf aus den Einstellungen").trim();
    const r = await callDevice(clientId, req.params.id, { reason, publicBaseUrl: PUBLIC_BASE_URL });
    res.status(r.ok ? 200 : 502).json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Service/authenticated: ring ALL phones of a team member. This is the hook the
// proactive briefings (scheduler) will use: "Clara ruft Dr. X an".
app.post("/clara/call-operator", async (req, res) => {
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
app.get("/admin/tenant/export", async (req, res, next) => {
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
app.post("/admin/tenant/erase", async (req, res, next) => {
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
app.post("/admin/tenant/retention", async (req, res, next) => {
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

// Unknown route -> consistent JSON 404 (never an HTML/empty body).
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found", path: req.path });
});

// Central error handler: any error thrown/forwarded from a route lands here with
// a consistent shape. 4-arg signature is required for Express to treat it as the
// error handler. Avoids leaking stack traces to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = Number(err?.status || err?.statusCode) || 500;
  log.error("request error", { requestId: req.requestId, method: req.method, path: req.path, status, err });
  if (res.headersSent) return;
  res.status(status).json({ ok: false, error: String(err?.message || err) || "internal_error" });
});

// Don't let a stray rejection/exception silently kill the process unseen.
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", { err: reason instanceof Error ? reason : new Error(String(reason)) });
});
process.on("uncaughtException", (err) => {
  log.error("uncaughtException", { err });
});

const PORT = Number(process.env.PORT || 4000);

// DSGVO guard: patient content must stay on the practice network. If the LLM
// endpoint is not local/private, warn loudly — and refuse to start when
// MAS_LLM_REQUIRE_LOCAL=1, so a misconfigured cloud endpoint can't leak data.
function assertLocalLlm() {
  const info = llmInfo();
  const local = isLocalLlm(info.base);
  if (local) {
    log.info("llm endpoint local", { base: info.base, model: info.model });
    return;
  }
  if (String(process.env.MAS_LLM_REQUIRE_LOCAL || "") === "1") {
    log.error("llm endpoint NOT local — refusing to start (MAS_LLM_REQUIRE_LOCAL=1)", { base: info.base });
    process.exit(1);
  }
  log.warn("llm endpoint is NOT local — patient data may leave the practice network", { base: info.base, model: info.model });
}

// Aktuelle öffentliche Backend-URL nach Firestore veröffentlichen
// (settings/masRuntime, public read). Die deployte Web-App löst die MAS-URL
// ZUR LAUFZEIT von dort auf — die Cloudflare-Quick-Tunnel-URL wechselt bei
// jedem Tunnel-Neustart, eine im Frontend-Build eingebackene URL veraltet
// zwangsläufig ("Failed to fetch" beim Handy-Koppeln). Nur HTTPS-URLs werden
// veröffentlicht, damit ein lokaler Dev-Boot (127.0.0.1) die Produktion
// niemals umbiegt.
async function publishRuntimeConfig() {
  if (!PUBLIC_BASE_URL.startsWith("https://")) {
    log.info("runtime config not published (PUBLIC_BASE_URL not public https)", { baseUrl: PUBLIC_BASE_URL });
    return;
  }
  try {
    await admin.firestore().collection("settings").doc("masRuntime").set({
      baseUrl: PUBLIC_BASE_URL.replace(/\/+$/, ""),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    log.info("runtime config published", { baseUrl: PUBLIC_BASE_URL });
  } catch (e) {
    log.warn("runtime config publish failed", { err: String(e?.message || e) });
  }
}

app.listen(PORT, () => {
  assertLocalLlm();
  log.info("backend listening", { port: PORT, authEnforced: AUTH_ENFORCED });
  publishRuntimeConfig();
  startMailScheduler();
  // Lisa call finalizer: fetch transcripts of finished outbound calls and
  // write the outcome to the shared brain. Cheap no-op when nothing is calling.
  if (lisaCallConfigured() && DEFAULT_CLIENT_ID) {
    setInterval(() => {
      finalizeLisaCalls(DEFAULT_CLIENT_ID).catch((e) =>
        log.warn("lisa.finalize_loop_error", { error: String(e?.message || e) })
      );
    }, 15_000);
    log.info("lisa finalizer enabled", { intervalMs: 15_000 });

    // Recall-Sweep: ordnet beendete Lisa-Calls den Anruflisten zu, bucht
    // Zusagen direkt fest und schickt SMS-Fallbacks. Billig im Leerlauf.
    setInterval(() => {
      sweepRecallOutcomes(DEFAULT_CLIENT_ID).catch((e) =>
        log.warn("recall.sweep_error", { error: String(e?.message || e) })
      );
    }, 60_000);

    // Abwesenheits-Rückkanal: erkennt Neubuchungen abgesagter Patienten und
    // schreibt die Verschiebe-Notiz in den neuen Termin (Kalender-Quittung).
    setInterval(() => {
      sweepAbsenceRebookings(DEFAULT_CLIENT_ID).catch((e) =>
        log.warn("absence.sweep_error", { error: String(e?.message || e) })
      );
    }, 300_000);

    // Datensparsamkeit: täglicher Aufräumlauf (ab 3 Uhr nachts, einmal pro
    // Tag). Löscht Nachrichten, Tickets und Gedächtnis-Einträge älter als
    // RETENTION_DAYS endgültig — idempotent, daher unkritisch bei Neustarts.
    let lastRetentionDay = "";
    setInterval(async () => {
      try {
        const hh = Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).format(new Date()));
        const today = todayBerlin();
        if (hh >= 3 && lastRetentionDay !== today) {
          lastRetentionDay = today;
          const out = await runRetentionSweep(DEFAULT_CLIENT_ID);
          log.info("retention.daily_run", out);
        }
      } catch (e) {
        log.warn("retention.daily_error", { error: String(e?.message || e) });
      }
    }, 1_800_000);
  }

  // Recall-Initiative: Abend-Scan (ab 18 Uhr für MORGEN) + Morgen-Scan (ab
  // 7:30 für HEUTE). Läuft je einmal pro Tag; der Push selbst ist zusätzlich
  // über lastPushDay dedupliziert (max. 1 Push pro Tag, Entscheidung Chef).
  if (DEFAULT_CLIENT_ID) {
    const initiativeRuns = { evening: "", morning: "" };
    setInterval(async () => {
      try {
        const now = new Date();
        const berlinHM = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
        const [hh, mm] = berlinHM.split(":").map(Number);
        const today = todayBerlin();
        if (hh >= 18 && initiativeRuns.evening !== today) {
          initiativeRuns.evening = today;
          const tomorrow = new Date(now.getTime() + 86400000);
          const tIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrow);
          const out = await dailyInitiativeScan(DEFAULT_CLIENT_ID, { targetDate: tIso, publicBaseUrl: PUBLIC_BASE_URL });
          log.info("recall.evening_scan", { date: tIso, worthIt: out.worthIt, pushed: out.pushed });
        } else if ((hh > 7 || (hh === 7 && mm >= 30)) && hh < 12 && initiativeRuns.morning !== today) {
          initiativeRuns.morning = today;
          const out = await dailyInitiativeScan(DEFAULT_CLIENT_ID, { targetDate: today, publicBaseUrl: PUBLIC_BASE_URL });
          log.info("recall.morning_scan", { date: today, worthIt: out.worthIt, pushed: out.pushed });
        }
      } catch (e) {
        log.warn("recall.initiative_scheduler_error", { error: String(e?.message || e) });
      }
    }, 5 * 60_000);
    log.info("recall initiative scheduler enabled");
  }
});
