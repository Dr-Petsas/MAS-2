// Praxisgedaechtnis (/brain/*): Events, Cases, Briefings, Lessons, Recall, Retention, DSGVO-Konfig.
// Mechanischer W1.2-Split aus server.js (04.07.2026): Pfade und Handler
// byte-identisch uebernommen, nur app. -> router. Kein Verhalten geaendert.
import express from "express";
import { createHash } from "node:crypto";
import { assertAppEnabled } from "../entitlements.js";
import { getDayAppointments, computeDayBriefing, buildSpokenDayBriefing, todayBerlin } from "../clara/daySchedule.js";
import { listLessons, proposeLesson, decideLesson, retireLesson } from "../brain/lessons.js";
import { getActivePrompt, publishPromptVersion, rollbackPrompt, listPromptVersions, promptVersionMetrics, PROMPT_AGENTS } from "../brain/livingPrompt.js";
import { reflectOnce } from "../brain/reflect.js";
import { runGapFill, gapFillOverview, approveCallList, removeCandidateFromList, listRecallBuckets, setListBucket } from "../clara/gapFill.js";
import { dailyInitiativeScan } from "../clara/recallCoach.js";
import { listLisaTasks } from "../lisa/outbound.js";
import { listCalendar as qmListCalendar } from "../qm/jobs.js";
import { runRetentionSweep, getRetentionConfig, setRetentionDays } from "../brain/retention.js";
import { searchPatient } from "../clara/agentBooking.js";
import { getOperator } from "../clara/sessions.js";
import { buildCallerContext } from "../bianca/callerContext.js";
import { appendEvent, getEvent, queryRecent, queryByPatient, resolveItem, annotateEvent } from "../brain/eventStore.js";
import { buildBriefing, buildSpokenBriefing } from "../brain/briefing.js";
import { extractFromTranscript, extractPatientName } from "../brain/extractor.js";
import { resolvePatientSubject } from "../brain/identity.js";
import { createCase, getCase, listCases, addUpdate, setStatus, linkEventToCase, assignCase, getCaseContext, saveCaseDraft, attachEventId } from "../brain/caseStore.js";
import { buildCaseBriefing, buildSpokenCaseBriefing } from "../brain/caseBriefing.js";
import { buildRedList, spokenRedList } from "../brain/redList.js";
import { searchBrain, buildKarteikarte, answerBrain } from "../brain/search.js";
import { buildEntityProfile, buildProfilePreviewFast } from "../brain/entityProfile.js";
import { getDsgvoConfig, setDsgvoConfig } from "../brain/aiDisclosure.js";
import { analyzeContactDupes, mergeContacts } from "../brain/addressBook.js";
import { enqueueBrainWrite } from "../brain/outbox.js";
import { sendMail } from "../mail/mailbox.js";
import { prepareCaseDraft } from "../mail/nadineAuto.js";
import { buildLetterPdf, letterFilename, archiveLetter } from "../mail/letter.js";
import { PUBLIC_BASE_URL, actorName, fmtDay, renderArgs, resolveAnsweredEvent, resolveClientId } from "./_shared.js";

const router = express.Router();


// --- Shared brain: event pool + briefing ---------------------------------
// The append-only timeline every AI (Bianca, Lisa, Nadine, Clara) and the
// platform write to, and that the briefing / Q&A / revenue coach read from.
// All MAS-owned (mas_events), tenant-isolated, purely additive.

// Append one interaction/observation. Callers (voice workers, document
// automations, human notes) post a generic envelope; validation/normalisation
// happens in the brain. Idempotent on a stable `id`.
router.post("/brain/events", async (req, res) => {
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
router.get("/brain/timeline", async (req, res) => {
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


// Single event by id (for the search-engine Cockpit detail view / deep links).
// Additive; must sit before the ":id/resolve" and ":id/annotate" POST paths is
// irrelevant (different method), but declared here for readability.
router.get("/brain/events/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const event = await getEvent(clientId, req.params.id);
    if (!event) return res.status(404).json({ ok: false, reason: "not_found" });
    res.json({ ok: true, clientId, event });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Mark an open item as handled. The executing AI (or a human at the monitor)
// closes it out — this is what stops it resurfacing and triggers no more
// outreach. Body: { actor, note? }.
router.post("/brain/events/:id/resolve", async (req, res) => {
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
router.get("/brain/briefing", async (req, res) => {
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
router.post("/brain/events/:id/annotate", async (req, res) => {
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
router.post("/brain/ingest/transcript", async (req, res) => {
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
      deadlineMs: extracted.deadlineMs || null,
      deadlineStrong: extracted.deadlineStrong === true,
      amountCents: extracted.amountCents || null,
      tags: [
        ...(extracted.criticalCategory ? ["kritisch", extracted.criticalCategory] : []),
        ...(extracted.signals?.invoiceOrPayment ? ["rechnung"] : []),
      ],
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
router.get("/brain/patients", async (req, res) => {
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


// Eskalations-Radar + Fristen-Wächter: rote Liste (offene kritische Vorgänge)
// und Fristenliste (nach Fälligkeit, mit Warnstufe) fürs Cockpit und die
// Briefings. Eine Query, kein Index-Zwang, niemals Umsatzzahlen.
router.get("/brain/red-list", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await buildRedList(clientId);
    res.json({ ok: true, clientId, ...out, spoken: spokenRedList(out) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Gedaechtnis-Suche (W-SUCHE): Google-artige UNIVERSAL-Suche. Trefferarten:
// patient (Karteikarte), case (Vorgang), event (Einzel-Ereignis). ?q= Begriff
// (leer = letzte Vorgaenge), Filter ?kind=&status=open|done&topic=&channel=
// &assignee=&limit=. Gerankte Treffer mit Snippet + Facetten. Rein additiv,
// kein Volltext-Index (In-Memory-Scan + Patienten-CF).
router.get("/brain/search", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await searchBrain(clientId, {
      q: req.query?.q || "",
      kind: req.query?.kind || "",
      status: req.query?.status || "",
      topic: req.query?.topic || "",
      channel: req.query?.channel || "",
      assignee: req.query?.assignee || "",
      sinceDays: req.query?.sinceDays,
      limit: req.query?.limit,
    });
    // Suchergebnisse sind dynamisch: ETag/304 hier hatte im Browser sporadisch
    // leere Trefferlisten erzeugt (Befund 05.07.) — deshalb nie cachen.
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// KI-Modus der Suche: Frage in Saetzen beantwortet, NUR aus den Suchtreffern,
// ueber das lokale LLM (DSGVO: bleibt im Praxisnetz). Antwort + Quellen.
router.get("/brain/answer", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await answerBrain(clientId, {
      q: req.query?.q || "",
      sinceDays: req.query?.sinceDays,
      // Eingeloggter Nutzer (Anzeigename): begrenzt Kalender-Antworten auf den
      // eigenen Kalender — Kollegen-Termine nur auf Nachfrage (Chef 05.07.).
      operator: req.query?.operator || "",
    });
    res.set("Cache-Control", "no-store");
    if (!out.ok) return res.status(out.reason === "empty_query" ? 400 : 502).json({ ok: false, ...out });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Entity-Profil (W-SUCHE-3): Google-Business-artige Vollansicht fuer Patienten
// (?patientId= / ?name=) oder Kontakte (?contactId=). Termine, Anamnese,
// Kommunikation, Dokumente, Abrechnung, Recall, Bewertungen.
router.get("/brain/profile-preview", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const patientId = (req.query?.patientId || "").trim();
    if (!patientId) return res.status(400).json({ error: "patientId_required" });
    const preview = await buildProfilePreviewFast(clientId, {
      patientId,
      firstName: (req.query?.firstName || "").trim(),
      lastName: (req.query?.lastName || "").trim(),
      birthDate: (req.query?.birthDate || "").trim() || null,
    });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, clientId, preview });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

router.get("/brain/profile", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const patientId = (req.query?.patientId || "").trim();
    const contactId = (req.query?.contactId || "").trim();
    const name = (req.query?.name || "").trim();
    if (!patientId && !contactId && !name) {
      return res.status(400).json({ error: "patientId_contactId_or_name_required" });
    }
    const out = await buildEntityProfile(clientId, {
      patientId,
      contactId,
      name,
      sinceDays: req.query?.sinceDays,
    });
    if (!out.ok) return res.status(out.reason === "not_found" ? 404 : 400).json(out);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Karteikarte: ALLES aus dem Gedaechtnis zu EINEM Patienten (Ereignisse +
// Vorgaenge, auch nur namens-zugeordnete). ?patientId= und/oder ?name=
// ("Vorname Nachname" — alle Namens-Tokens muessen vorkommen). Termine/
// Behandlungsdoku ergaenzt das Frontend aus der Plattform-DB.
router.get("/brain/karteikarte", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const patientId = (req.query?.patientId || "").trim();
    const name = (req.query?.name || "").trim();
    if (!patientId && !name) return res.status(400).json({ error: "patientId_or_name_required" });
    const out = await buildKarteikarte(clientId, { patientId, name, sinceDays: req.query?.sinceDays });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, clientId, patientId: patientId || null, name: name || null, eventCount: out.events.length, caseCount: out.cases.length, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Rückrufer-Kontext (Telefon-Loop 2/2): die Plattform-CF onInboundPhoneCall
// fragt beim Klingeln "Was weiß die Praxis über diese Nummer?" und reicht die
// Antwort als dynamic_variable caller_context in Biancas Agent-Prompt. Muss
// SCHNELL sein (die CF wartet mit kurzem Timeout) und darf nie werfen.
router.get("/brain/caller-context", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const phone = String(req.query?.phone || "").trim();
    if (!phone) return res.json({ ok: true, found: false, context: "" });
    const out = await buildCallerContext(clientId, phone);
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(200).json({ ok: false, found: false, context: "", error: String(e?.message || e) });
  }
});


// --- Vorgänge (cases): the followed-up threads -----------------------------
// A case bundles repeat contacts about one matter and carries an append-only
// update log (who/when/what) plus a status, so the team always sees how far a
// problem is solved.

// List cases (?activeOnly=1 to hide resolved/closed, ?patientId= to scope).
router.get("/brain/cases", async (req, res) => {
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
router.get("/brain/cases/briefing", async (req, res) => {
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


router.get("/brain/cases/:id", async (req, res) => {
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
router.get("/brain/cases/:id/context", async (req, res) => {
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
router.post("/brain/cases/:id/draft", async (req, res) => {
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
router.post("/brain/cases/:id/send", async (req, res) => {
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
    const by = actorName(req);
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
    // Frist-Dokumentation: offene fristbehaftete/kritische Eingangs-Ereignisse
    // dieses Vorgangs gelten mit der gesendeten Antwort als bedient — mit
    // Zeitstempel und Absender im Audit-Event ("Frist ... eingehalten ...").
    try {
      for (const evId of (Array.isArray(c.eventIds) ? c.eventIds.slice(-15) : [])) {
        const ev = await getEvent(clientId, evId).catch(() => null);
        if (ev && ev.direction === "in" && ev.status === "open" && (ev.deadlineMs || ev.signals?.critical)) {
          await resolveAnsweredEvent(clientId, ev.id, { by });
        }
      }
    } catch { /* best-effort, blockiert den Versand nie */ }
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


// Generate a letter PDF from a case draft, archive it, log it on the case.
// Body: { to?, subject?, body?, by? } (defaults come from the case draft).
router.post("/brain/cases/:id/letter", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const c = await getCase(clientId, req.params.id);
    if (!c) return res.status(404).json({ ok: false, reason: "not_found" });
    const to = (req.body?.to ?? c.draft?.to ?? "").trim();
    const subject = (req.body?.subject ?? c.draft?.subject ?? c.title ?? "").trim();
    const body = req.body?.body ?? c.draft?.body ?? "";
    const by = actorName(req);

    const { settings, letterhead, signatureImage, stampImage } = await renderArgs(clientId);
    const buffer = await buildLetterPdf({ settings, letterhead, signatureImage, stampImage, to, subject, body });
    const filename = letterFilename(subject);
    const archived = await archiveLetter(clientId, req.params.id, filename, buffer);

    await saveCaseDraft(clientId, req.params.id, { channel: "letter", to, subject, body }, { by });
    await addUpdate(clientId, req.params.id, {
      by, kind: "note",
      text: `Brief als PDF erstellt: ${filename}${archived.stored ? " (archiviert)" : ""}.`,
    });

    // Selbst geschriebene Briefe gehören ebenfalls ins geteilte Gedächtnis —
    // sonst ist der Briefinhalt für Clara, Briefings und die Suche unsichtbar.
    // Deterministische id: derselbe unveränderte Brief erneut gerendert erzeugt
    // kein zweites Event; ein inhaltlich geänderter Brief schon. Hängt am
    // Vorgang eine offene Frist, wird sie hier dokumentiert ("Brief erstellt am
    // ... durch ... zur Frist ..."), aber NICHT automatisch erledigt — das PDF
    // ist erstellt, der physische Versand bestätigt der Chef selbst.
    try {
      const letterHash = createHash("sha256").update(`${req.params.id}:${to}:${subject}:${body}`).digest("hex").slice(0, 20);
      const clipBody = (() => { const t = String(body || "").trim(); return t.length > 600 ? t.slice(0, 600) + " …" : t; })();
      let fristNote = "";
      const evIds = Array.isArray(c.eventIds) ? c.eventIds.slice(-15) : [];
      const evs = await Promise.all(evIds.map((id) => getEvent(clientId, id).catch(() => null)));
      const withDeadline = evs
        .filter((e) => e?.deadlineMs && e.status !== "resolved")
        .sort((a, b) => a.deadlineMs - b.deadlineMs);
      if (withDeadline.length) {
        fristNote = ` — zur Frist ${fmtDay(withDeadline[0].deadlineMs)} (Brief erstellt am ${fmtDay(Date.now())} durch ${by})`;
      }
      const letterEvent = {
        id: `letter-out:${letterHash}`,
        channel: "nadine_letter",
        direction: "out",
        type: "interaction",
        counterparty: { kind: c.subject?.patientId ? "patient" : "unknown", name: c.subject?.name || to || "Empfänger", ref: null },
        subject: c.subject || { name: "" },
        summary: `Brief an ${to || c.subject?.name || "Empfänger"} — Betreff „${subject || "(kein Betreff)"}“: ${clipBody || "(kein Text)"}${fristNote} (PDF: ${filename})`,
        extractor: "nadine@letter",
      };
      try {
        const { event } = await appendEvent(clientId, letterEvent);
        await attachEventId(clientId, req.params.id, event.id, { by });
      } catch {
        await enqueueBrainWrite(clientId, { kind: "record", eventInput: letterEvent, by, link: false });
      }
    } catch { /* best-effort, blockiert die PDF-Erstellung nie */ }
    res.json({ ok: true, clientId, filename, base64: buffer.toString("base64"), url: archived.url, stored: archived.stored });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Delegate a case. Body: { assignee, instruction?, by? }.
router.post("/brain/cases/:id/assign", async (req, res) => {
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
router.post("/brain/cases", async (req, res) => {
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
router.post("/brain/cases/:id/updates", async (req, res) => {
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
router.post("/brain/cases/:id/status", async (req, res) => {
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


// UI read-model: structured day schedule for the Clara monitor "Tagesplan".
router.get("/brain/day-schedule", async (req, res) => {
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
router.get("/brain/lessons", async (req, res) => {
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
router.post("/brain/lessons", async (req, res) => {
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
router.post("/brain/lessons/:id/decide", async (req, res) => {
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
router.post("/brain/lessons/:id/retire", async (req, res) => {
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
router.post("/brain/lessons/reflect", async (req, res) => {
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
router.get("/brain/prompt/:agent", async (req, res) => {
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
router.get("/brain/prompt/:agent/versions", async (req, res) => {
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
router.post("/brain/prompt/:agent/rollback", async (req, res) => {
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
// Lückenfüller (Umsatz-Coach Stufe 1) + Caller-ID-Lookup
// ============================================================================

// Scan a day for real free gaps (opening hours) + matching due recall
// candidates, and create/refresh ONE Gesprächsauftrag case per gap
// (assignee Lisa, waiting_approval). Idempotent per (calendar, date, slot).
router.post("/brain/gap-fill/run", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const demoOnly = req.body?.demoOnly === true || req.body?.demoOnly === "true";
    const out = await runGapFill(clientId, {
      date: req.body?.date,
      horizonDays: Number(req.body?.horizonDays) || 1,
      demoOnly,
      bucketKey: req.body?.bucketKey,
      bucketExplicit: req.body?.bucketKey != null,
    });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// UI read-model: gaps, candidates and pending call lists for the monitor.
router.get("/brain/gap-fill", async (req, res) => {
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
router.post("/brain/gap-fill/:caseId/approve", async (req, res) => {
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


// Themen-Buckets (Chef 28.07.2026): Auswahl, aus welchem Bucket eine
// Anrufliste geformt wird — Kons, ZE-Kontrolle, Prophylaxe ... mit Zahlen.
router.get("/brain/gap-fill/buckets", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await listRecallBuckets(clientId);
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// EINE Liste auf ein anderes Themen-Bucket stellen (bucketKey leer = alle
// Themen). Kontaktierte bleiben, Weggewischte kommen nicht zurueck.
router.post("/brain/gap-fill/:caseId/set-bucket", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await setListBucket(clientId, req.params.caseId, {
      bucketKey: req.body?.bucketKey,
      by: req.body?.by || "Team (Monitor)",
    });
    if (!out.ok) {
      const code = out.reason === "not_found" ? 404 : 409;
      return res.status(code).json(out);
    }
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Kandidat von einer Anrufliste wischen (Chef 28.07.2026, iOS-Stil im
// Monitor): removed=true bleibt als Audit stehen, der naechste Kandidat
// rueckt aus dem Puffer nach. Bereits Kontaktierte sind nicht entfernbar.
router.post("/brain/gap-fill/:caseId/remove-candidate", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const out = await removeCandidateFromList(clientId, req.params.caseId, {
      patientId: req.body?.patientId,
      by: req.body?.by || "Team (Monitor)",
    });
    if (!out.ok) {
      const code = out.reason === "not_found" || out.reason === "candidate_not_found" ? 404 : 409;
      return res.status(code).json(out);
    }
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Service/Test: Aufbewahrungs-Sweep manuell anstoßen (sonst täglich per
// Scheduler). Löscht Nachrichten, Tickets und Gedächtnis-Einträge, die älter
// als RETENTION_DAYS (Standard 90 Tage) sind — endgültig.
router.post("/brain/retention/run", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const days = Number(req.body?.days) || undefined; // ohne Angabe: Mandanten-Regler
    const out = await runRetentionSweep(clientId, { days });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Speed-zu-Qualität-Regler (Cockpit): Aufbewahrungsdauer des Shared Memory
// lesen/setzen. Kurz = schlankes, schnelles Gehirn; lang = mehr Kontext.
// DSGVO: KI-Ansage pro Agent zuschaltbar (Default AUS). Bianca wirkt über den
// Default der Dynamic Variable am ElevenLabs-Agenten, Lisa zur Laufzeit.
router.get("/brain/dsgvo-config", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    res.json({ ok: true, clientId, ...(await getDsgvoConfig(clientId)) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/brain/dsgvo-config", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const out = await setDsgvoConfig(clientId, req.body || {}, { by: req.body?.by });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Dubletten-Analyse + Bereinigung im geteilten Adressbuch (Cockpit).
router.get("/brain/contact-dupes", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    res.json({ ok: true, clientId, ...(await analyzeContactDupes(clientId)) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/brain/contact-dupes/merge", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const out = await mergeContacts(clientId, String(req.body?.keepId || ""), req.body?.mergeIds || []);
    res.status(out.ok ? 200 : 400).json({ clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.get("/brain/retention-config", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    res.json({ ok: true, clientId, ...(await getRetentionConfig(clientId)) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/brain/retention-config", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const out = await setRetentionDays(clientId, req.body?.days, { by: req.body?.by });
    res.json({ ok: true, clientId, ...(await getRetentionConfig(clientId)), saved: out.days });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Leitstelle: Bucket-Zähler + Tages-Jobs aller Mitarbeiter (KI + Mensch) --
// EIN Lese-Modell für die neue Clara-Startseite: oben Buckets (wie viel kam
// heute/diese Woche pro Kanal rein), rechts die Jobs-Spalte (wer arbeitet heute
// woran, mit Status + Artefakt-Link). Aggregiert NUR bestehende Quellen
// (Ereignis-Pool, Vorgänge, Lisa-Aufträge, QM-Jobs) — keine zweite Datenbank.
// Rein additiv; jede Teilquelle fällt einzeln weich aus (leere Liste statt 500).

function berlinDayBounds(dateStr) {
  // "YYYY-MM-DD" -> [Mitternacht, Mitternacht+24h) in Europe/Berlin als UTC-ms.
  // Offset (CET/CEST) wird über die Berliner Wanduhr am UTC-Mittag bestimmt.
  const noonUtc = new Date(`${dateStr}T12:00:00Z`).getTime();
  const berlinHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).format(new Date(noonUtc))
  );
  const offsetH = berlinHour - 12;
  const startMs = new Date(`${dateStr}T00:00:00Z`).getTime() - offsetH * 3_600_000;
  return { startMs, endMs: startMs + 24 * 3_600_000 - 1 };
}

function countBuckets(events) {
  const byChannel = {};
  let unmatched = 0;
  let open = 0;
  for (const e of events) {
    byChannel[e.channel] = (byChannel[e.channel] || 0) + 1;
    if (e.type === "interaction" && (e.subject?.matchStatus === "unmatched" || e.subject?.matchStatus === "ambiguous")) unmatched += 1;
    if (e.status === "open") open += 1;
  }
  return { total: events.length, byChannel, unmatched, open };
}

const QM_OPEN_STATES = new Set(["planned", "assigned", "seen", "in_progress", "overdue", "escalated"]);

router.get("/brain/leitstelle", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const date = String(req.query?.date || "").trim() || todayBerlin();
    const { startMs, endMs } = berlinDayBounds(date);
    const nowMs = Date.now();
    const notes = [];

    // 1) Buckets: heute exakt, Woche als zweites Fenster (Deckel 2000 Events).
    let todayEvents = [];
    let weekEvents = [];
    try {
      todayEvents = await queryRecent(clientId, startMs, 2000);
      todayEvents = todayEvents.filter((e) => (e.ts || 0) <= endMs);
      weekEvents = await queryRecent(clientId, endMs - 7 * 24 * 3_600_000, 2000);
      weekEvents = weekEvents.filter((e) => (e.ts || 0) <= endMs);
    } catch (e) {
      notes.push(`events:${String(e?.message || e)}`);
    }
    const buckets = { today: countBuckets(todayEvents), week: countBuckets(weekEvents) };

    // 2) Jobs-Spalte. Feste KI-Plätze (Nadine, Lisa, Team) + echte Mitarbeiter
    //    aus den QM-Zuweisungen. Erledigtes von heute zählt in den Fortschritt.
    const workers = [];

    // Lisa: delegierte Anrufe/SMS von heute (mas_lisa_tasks).
    let lisaJobs = [];
    try {
      const tasks = await listLisaTasks(clientId, 80);
      lisaJobs = tasks
        .filter((t) => (t.ts || 0) >= startMs && (t.ts || 0) <= endMs)
        .map((t) => {
          const status =
            t.status === "failed" ? "problem"
            : (t.status === "done" || t.status === "sent") ? "done"
            : t.status === "calling" ? "in_progress"
            : "open";
          return {
            id: t.id,
            title: `${t.kind === "sms" ? "SMS" : "Anruf"}: ${t.contactName || t.phone || "—"}`,
            detail: (t.resultSummary || t.text || t.prompt || "").slice(0, 220),
            status,
            ts: t.ts || 0,
            outcome: t.outcome || null,
            link: { kind: "lisa_task", id: t.id },
            transcript: (t.transcriptText || "").slice(0, 4000) || null,
          };
        })
        .sort((a, b) => b.ts - a.ts);
    } catch (e) {
      notes.push(`lisa:${String(e?.message || e)}`);
    }

    // Nadine + Team: aktive Vorgänge mit Zuweisung; erledigt = heute geschlossen.
    let nadineJobs = [];
    let teamJobs = [];
    try {
      const cases = await listCases(clientId, { activeOnly: false, limit: 150 });
      const toMillis = (v) => (v?.toMillis?.() ?? Number(v) ?? 0) || 0;
      const caseJob = (c) => {
        const active = ["open", "in_progress", "waiting", "waiting_approval"].includes(c.status);
        const doneToday = !active && toMillis(c.updatedAt) >= startMs && toMillis(c.updatedAt) <= endMs;
        if (!active && !doneToday) return null;
        const status =
          c.status === "waiting_approval" ? "approval"
          : c.status === "in_progress" ? "in_progress"
          : c.status === "waiting" ? "waiting"
          : active ? "open" : "done";
        const draftHint = c.draft ? ` · Entwurf liegt bereit (${c.draft.channel === "letter" ? "Brief" : "E-Mail"})` : "";
        return {
          id: c.id,
          title: c.title || "Vorgang",
          detail: `${c.subject?.name ? `${c.subject.name} · ` : ""}${c.handoff?.instruction || ""}${draftHint}`.slice(0, 220),
          status,
          ts: c.lastContactAt || toMillis(c.updatedAt),
          link: { kind: "case", id: c.id },
        };
      };
      for (const c of cases) {
        const who = String(c.assignee || "").toLowerCase();
        if (who !== "nadine" && who !== "team") continue;
        const job = caseJob(c);
        if (!job) continue;
        if (who === "nadine") nadineJobs.push(job); else teamJobs.push(job);
      }
    } catch (e) {
      notes.push(`cases:${String(e?.message || e)}`);
    }

    // QM: Julias Tageskalender — offene Jobs bis heute (Überfälliges bleibt
    // sichtbar) + heute Erledigtes, gruppiert nach zugewiesener Helferin.
    const qmByStaff = new Map();
    let qmUnassigned = [];
    try {
      const qmJobs = await qmListCalendar(clientId, { fromMs: 0, toMs: endMs });
      for (const j of qmJobs) {
        const isOpen = QM_OPEN_STATES.has(j.status);
        const completedMs = j.completedAt ? new Date(j.completedAt).getTime() : 0;
        const doneToday = j.status === "done" && completedMs >= startMs && completedMs <= endMs;
        if (!isOpen && !doneToday) continue;
        const overdue = isOpen && (j.dueAtMs || 0) < nowMs && (j.status === "overdue" || (j.dueAtMs || 0) < startMs);
        const job = {
          id: j.id,
          title: j.title || j.bookKey || "QM-Aufgabe",
          detail: [j.deviceRef, j.cycle ? `Zyklus ${j.cycle}` : "", j.status === "escalated" && j.escalation?.escalatedToName ? `eskaliert an ${j.escalation.escalatedToName}` : ""].filter(Boolean).join(" · ").slice(0, 220),
          status:
            j.status === "done" ? "done"
            : j.status === "escalated" ? "escalated"
            : overdue || j.status === "overdue" ? "overdue"
            : j.status === "in_progress" ? "in_progress"
            : j.status === "seen" ? "seen"
            : "open",
          ts: j.dueAtMs || 0,
          dueMs: j.dueAtMs || 0,
          link: { kind: "qm_job", id: j.id },
          doneBy: j.completedByName || null,
        };
        if (j.assignedTo) {
          const key = j.assignedTo;
          if (!qmByStaff.has(key)) qmByStaff.set(key, { name: j.assignedToName || "Mitarbeiter/in", jobs: [] });
          qmByStaff.get(key).jobs.push(job);
        } else {
          qmUnassigned.push(job);
        }
      }
    } catch (e) {
      notes.push(`qm:${String(e?.message || e)}`);
    }

    const pack = (key, name, kind, role, jobs) => ({
      key, name, kind, role,
      total: jobs.length,
      done: jobs.filter((j) => j.status === "done").length,
      attention: jobs.filter((j) => j.status === "overdue" || j.status === "escalated" || j.status === "problem" || j.status === "approval").length,
      jobs: jobs.slice(0, 25),
    });

    workers.push(pack("nadine", "Nadine", "ai", "Post & E-Mail", nadineJobs));
    workers.push(pack("lisa", "Lisa", "ai", "Telefon ausgehend", lisaJobs));
    if (teamJobs.length) workers.push(pack("team", "Team", "human", "Persönlich übernommen", teamJobs));
    for (const [staffId, entry] of [...qmByStaff.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
      workers.push(pack(`staff:${staffId}`, entry.name, "human", "QM · Julia", entry.jobs.sort((a, b) => (a.dueMs || 0) - (b.dueMs || 0))));
    }
    if (qmUnassigned.length) {
      workers.push(pack("julia", "Julia", "ai", "QM · noch zu verteilen", qmUnassigned.sort((a, b) => (a.dueMs || 0) - (b.dueMs || 0))));
    }

    res.json({ ok: true, clientId, date, startMs, endMs, buckets, workers, notes });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Service/Test: Initiative-Scan manuell anstoßen (sonst macht das der Scheduler).
router.post("/brain/recall/scan", async (req, res) => {
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

export default router;
