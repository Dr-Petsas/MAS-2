// QM Julia (/clara/qm/*): Anforderungs-Engine, Buecher, Jobs, Personal, Hygiene, Kalender.
// Mechanischer W1.2-Split aus server.js (04.07.2026): Pfade und Handler
// byte-identisch uebernommen, nur app. -> router. Kein Verhalten geaendert.
import express from "express";
import { listFachrichtungen, defaultProfileFor as qmDefaultProfileFor, listWizards as qmListWizards, getWizard as qmGetWizard, getProfileWizard as qmGetProfileWizard, getOptionLists as qmGetOptionLists } from "../qm/catalog.js";
import { previewWizard as qmPreviewWizard, applyWizard as qmApplyWizard } from "../qm/wizards.js";
import { runInterviewTurn as qmRunInterviewTurn } from "../qm/interview.js";
import { saveProfile as qmSaveProfile, getProfile as qmGetProfile, computeRequirements as qmComputeRequirements, activateBook as qmActivateBook, deactivateBook as qmDeactivateBook, setBookResponsible as qmSetBookResponsible, markReviewed as qmMarkReviewed, listBooks as qmListBooks, setBookPlans as qmSetBookPlans } from "../qm/books.js";
import { listDocuments as qmListDocuments, listAllDocuments as qmListAllDocuments, exportRows as qmExportRows } from "../qm/documents.js";
import { createJob as qmCreateJob, updateJob as qmUpdateJob, deleteJob as qmDeleteJob, assignJob as qmAssignJob, ackJob as qmAckJob, startJob as qmStartJob, completeJob as qmCompleteJob, getJob as qmGetJob, listJobsForStaff as qmListJobsForStaff, redistributeOpenJobs as qmRedistribute } from "../qm/jobs.js";
import { verifyPortalToken as qmVerifyPortalToken } from "../qm/portal.js";
import { listPraxen as qmListPraxen, createPraxis as qmCreatePraxis, renamePraxis as qmRenamePraxis, deletePraxis as qmDeletePraxis, setActivePraxis as qmSetActivePraxis } from "../qm/praxis.js";
import { PRODUCT_PRESETS as qmHygienePresets, TASK_TEMPLATES as qmHygieneTasks, defaultProductSelection as qmHygieneDefaults, buildHygienePlans as qmBuildHygienePlans, setupHygienePlan as qmSetupHygiene } from "../qm/hygiene.js";
import { TASK_TEMPLATES as qmSteriTasks, buildSterilizationPlans as qmBuildSteriPlans, setupSterilizationPlan as qmSetupSteri } from "../qm/sterilization.js";
import { createSchedule as qmCreateSchedule, listSchedules as qmListSchedules, updateSchedule as qmUpdateSchedule, deleteSchedule as qmDeleteSchedule } from "../qm/schedules.js";
import { upsertStaff as qmUpsertStaff, listStaff as qmListStaff, addAbsence as qmAddAbsence, removeAbsence as qmRemoveAbsence, suggestAssignee as qmSuggestAssignee } from "../qm/staff.js";
import { pushJob as qmPushJob } from "../qm/notify.js";
import { resolveBookKeyFromText as qmResolveBookKey, buildSpokenNextDue as qmSpokenNextDue, buildSpokenHistory as qmSpokenHistory, getNextDue as qmGetNextDue, getCalendar as qmGetCalendar, buildSpokenCalendar as qmSpokenCalendar, buildSpokenOverdue as qmSpokenOverdue } from "../qm/calendarRead.js";
import { PUBLIC_BASE_URL, qmRoute } from "./_shared.js";

const router = express.Router();


// --- Handy-Portal (oeffentlich, nur per signiertem Ein-Job-Token) --------------
// Die Push-Nachricht verlinkt /m/qm.html?c=&job=&k=. Diese Endpunkte pruefen den
// Token (portal.js) und geben/aendern GENAU diesen einen Job — ohne Login. In
// auth.js als public gelistet; die Pruefung passiert HIER, timing-safe.
function portalGuard(req, res) {
  const clientId = String(req.query?.c || req.body?.c || "").trim();
  const jobId = String(req.query?.job || req.body?.job || "").trim();
  const k = String(req.query?.k || req.body?.k || "").trim();
  if (!clientId || !jobId || !qmVerifyPortalToken(clientId, jobId, k)) {
    res.status(403).json({ error: "bad_token" });
    return null;
  }
  return { clientId, jobId };
}

// Job-Details fuer die Handy-Seite. Das Oeffnen quittiert den Job (gesehen).
router.get("/clara/qm/portal/job", async (req, res) => {
  const g = portalGuard(req, res);
  if (!g) return;
  try {
    const job = await qmGetJob(g.clientId, g.jobId);
    if (!job) return res.status(404).json({ error: "not_found" });
    if (["assigned", "overdue", "escalated"].includes(job.status)) {
      await qmAckJob(g.clientId, g.jobId, { by: job.assignedTo || "handy" }).catch(() => {});
    }
    res.json({
      ok: true,
      job: {
        id: job.id,
        title: job.title,
        deviceRef: job.deviceRef || null,
        status: job.status,
        dueAt: job.dueAt || null,
        assignedToName: job.assignedToName || null,
        purpose: job.purpose || null,
        instructions: Array.isArray(job.instructions) ? job.instructions : [],
        completionCriteria: job.completionCriteria || null,
        requiredFields: Array.isArray(job.requiredFields) ? job.requiredFields : [],
      },
    });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// "In Arbeit" vom Handy (optional, ein Tipp bevor erledigt).
router.post("/clara/qm/portal/start", async (req, res) => {
  const g = portalGuard(req, res);
  if (!g) return;
  try {
    const job = await qmGetJob(g.clientId, g.jobId);
    if (!job) return res.status(404).json({ error: "not_found" });
    const r = await qmStartJob(g.clientId, g.jobId, { by: job.assignedTo || "handy" });
    res.json(r.ok ? { ok: true } : { ok: false, error: r.reason });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// Erledigt-Meldung vom Handy: schreibt den Nachweis + setzt Status done.
router.post("/clara/qm/portal/complete", async (req, res) => {
  const g = portalGuard(req, res);
  if (!g) return;
  try {
    const job = await qmGetJob(g.clientId, g.jobId);
    if (!job) return res.status(404).json({ error: "not_found" });
    const body = req.body || {};
    const r = await qmCompleteJob(g.clientId, g.jobId, {
      by: job.assignedTo || "handy",
      byName: job.assignedToName || "per Handy",
      fields: body.fields && typeof body.fields === "object" ? body.fields : {},
      note: "per Handy als erledigt gemeldet",
    });
    res.json(r.ok ? { ok: true } : { ok: false, error: r.reason });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// --- Praxen (Praxisgemeinschaft: mehrere Praxen unter einem Login) ---
router.get("/clara/qm/praxen", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, ...(await qmListPraxen(clientId)) });
}));
router.post("/clara/qm/praxen", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, ...(await qmCreatePraxis(clientId, { name: (req.body || {}).name })) });
}));
router.patch("/clara/qm/praxen/:id", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, ...(await qmRenamePraxis(clientId, req.params.id, { name: (req.body || {}).name })) });
}));
router.delete("/clara/qm/praxen/:id", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, ...(await qmDeletePraxis(clientId, req.params.id)) });
}));
router.post("/clara/qm/praxen/active", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, ...(await qmSetActivePraxis(clientId, (req.body || {}).praxisId)) });
}));


// --- Profil & Anforderungs-Engine ---
router.get("/clara/qm/fachrichtungen", qmRoute(async (clientId, req, res) => {
  const key = String(req.query?.key || "").trim();
  res.json({ ok: true, clientId, fachrichtungen: listFachrichtungen(), defaultProfile: key ? qmDefaultProfileFor(key) : null });
}));

router.get("/clara/qm/profile", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, profile: await qmGetProfile(clientId) });
}));

router.post("/clara/qm/profile", qmRoute(async (clientId, req, res) => {
  const r = await qmSaveProfile(clientId, req.body || {});
  res.json({ ok: true, clientId, ...r });
}));

router.get("/clara/qm/requirements", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, ...(await qmComputeRequirements(clientId)) });
}));


// --- Wizards (deterministische Fragebögen: Ja/Nein + Dropdowns) ---
router.get("/clara/qm/wizards", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, wizards: qmListWizards(), profileWizard: qmGetProfileWizard(), optionLists: qmGetOptionLists() });
}));

router.get("/clara/qm/wizards/:key", qmRoute(async (clientId, req, res) => {
  const wizard = qmGetWizard(req.params.key);
  if (!wizard) return res.status(404).json({ error: "unknown_wizard" });
  res.json({ ok: true, clientId, wizard, optionLists: qmGetOptionLists() });
}));

// Vorschau: "So wird gebaut" — PURE, ändert nichts.
router.post("/clara/qm/wizards/:key/preview", qmRoute(async (clientId, req, res) => {
  const body = req.body || {};
  const r = qmPreviewWizard(req.params.key, body.answers || {}, { capabilities: body.capabilities || {} });
  res.status(r.ok ? 200 : 404).json({ clientId, ...r });
}));

// --- LLM-gefuehrtes Plan-Interview (Julias "Quiz" gegen den RTX-5090) ---
// Eine Runde: bookKey + bisherige Nachrichten -> naechste Frage + erfasste
// Themen ([ERGEBNIS]) + done-Flag. Die Plangenerierung bleibt deterministisch
// (hygiene/setup); das Interview sammelt nur, was zutrifft.
router.post("/clara/qm/interview", qmRoute(async (clientId, req, res) => {
  const b = req.body || {};
  const r = await qmRunInterviewTurn(clientId, { bookKey: b.bookKey, messages: b.messages || [] });
  res.status(r.ok ? 200 : (r.reason === "unknown_book" ? 404 : 502)).json({ clientId, ...r });
}));

// Anwenden: Buch aktivieren, Pläne ablegen, Schedules + erste Jobs erzeugen.
router.post("/clara/qm/wizards/:key/apply", qmRoute(async (clientId, req, res) => {
  const body = req.body || {};
  const r = await qmApplyWizard(clientId, req.params.key, body.answers || {}, {
    capabilities: body.capabilities || {},
    responsibleRole: body.responsibleRole || "",
    responsibleStaffId: body.responsibleStaffId || "",
    deputyStaffId: body.deputyStaffId || "",
    createFirstJobs: body.createFirstJobs !== false,
  });
  res.status(r.ok ? 201 : 400).json({ clientId, ...r });
}));


// --- Bücher & Nachweise ---
router.get("/clara/qm/books", qmRoute(async (clientId, req, res) => {
  const activeOnly = String(req.query?.activeOnly || "") === "1";
  res.json({ ok: true, clientId, books: await qmListBooks(clientId, { activeOnly, praxisId: String(req.query?.praxisId || "") }) });
}));

router.post("/clara/qm/books/activate", qmRoute(async (clientId, req, res) => {
  const b = req.body || {};
  const r = await qmActivateBook(clientId, b.bookKey, b);
  res.status(r.ok ? 200 : 400).json({ clientId, ...r });
}));

router.post("/clara/qm/books/deactivate", qmRoute(async (clientId, req, res) => {
  const b = req.body || {};
  const r = await qmDeactivateBook(clientId, b.bookKey, { praxisId: b.praxisId || "" });
  res.status(r.ok ? 200 : 404).json({ clientId, ...r });
}));

router.post("/clara/qm/books/:bookKey/responsible", qmRoute(async (clientId, req, res) => {
  const r = await qmSetBookResponsible(clientId, req.params.bookKey, req.body || {});
  res.status(r.ok ? 200 : 404).json({ clientId, ...r });
}));

// Editierte Pläne speichern: der Nutzer individualisiert die Tabellen (Geräte,
// Produkte, Zeiten) und speichert sie zurück. Verlängert zugleich die Gültigkeit.
router.post("/clara/qm/books/:bookKey/plans", qmRoute(async (clientId, req, res) => {
  const b = req.body || {};
  const plans = Array.isArray(b.plans) ? b.plans : [];
  const r = await qmSetBookPlans(clientId, req.params.bookKey, plans, { products: b.products || null });
  res.status(r.ok ? 200 : 404).json({ clientId, ...r });
}));

// Plan als überprüft markieren -> Gültigkeit läuft neu, "abgelaufen" verschwindet.
router.post("/clara/qm/books/:bookKey/reviewed", qmRoute(async (clientId, req, res) => {
  const r = await qmMarkReviewed(clientId, req.params.bookKey, { by: (req.body || {}).by || "julia" });
  res.status(r.ok ? 200 : 404).json({ clientId, ...r });
}));

// Das eine QM-Kontrollbuch: alle Nachweise über alle Bücher, für Suche/Gliederung.
router.get("/clara/qm/handbook", qmRoute(async (clientId, req, res) => {
  const limit = Math.max(1, Math.min(3000, Number(req.query?.limit) || 1000));
  res.json({ ok: true, clientId, documents: await qmListAllDocuments(clientId, { limit }) });
}));

router.get("/clara/qm/books/:bookKey/documents", qmRoute(async (clientId, req, res) => {
  const deviceRef = String(req.query?.device || "").trim();
  res.json({ ok: true, clientId, documents: await qmListDocuments(clientId, req.params.bookKey, { deviceRef }) });
}));

router.get("/clara/qm/books/:bookKey/export", qmRoute(async (clientId, req, res) => {
  const rows = await qmExportRows(clientId, req.params.bookKey, { from: Number(req.query?.from || 0), to: Number(req.query?.to || Date.now()) });
  res.json({ ok: true, clientId, bookKey: req.params.bookKey, rows });
}));


// --- Hygieneplan-Assistent (Produkt-Vorgaben + 1-Klick-Setup) ---
router.get("/clara/qm/hygiene/presets", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, presets: qmHygienePresets, defaultProducts: qmHygieneDefaults(), tasks: qmHygieneTasks });
}));

router.post("/clara/qm/hygiene/preview", qmRoute(async (clientId, req, res) => {
  const products = (req.body || {}).products || qmHygieneDefaults();
  res.json({ ok: true, clientId, plans: qmBuildHygienePlans(products) });
}));

router.post("/clara/qm/hygiene/setup", qmRoute(async (clientId, req, res) => {
  const r = await qmSetupHygiene(clientId, req.body || {});
  res.status(r.ok ? 201 : 400).json({ clientId, ...r });
}));

// --- Instrumentenaufbereitung/Sterilisation: Unterpläne + Prüf-Jobs ---------
router.get("/clara/qm/sterilization/presets", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, tasks: qmSteriTasks });
}));

router.post("/clara/qm/sterilization/preview", qmRoute(async (clientId, req, res) => {
  const b = req.body || {};
  res.json({ ok: true, clientId, plans: qmBuildSteriPlans({ docSystem: b.docSystem }) });
}));

router.post("/clara/qm/sterilization/setup", qmRoute(async (clientId, req, res) => {
  const r = await qmSetupSteri(clientId, req.body || {});
  res.status(r.ok ? 201 : 400).json({ clientId, ...r });
}));


// --- Jobs (Julias Kalender) ---
router.get("/clara/qm/calendar", qmRoute(async (clientId, req, res) => {
  const fromMs = Number(req.query?.from || 0);
  const toMs = Number(req.query?.to || Number.MAX_SAFE_INTEGER);
  res.json({ ok: true, clientId, jobs: await qmGetCalendar(clientId, { fromMs, toMs, bookKey: String(req.query?.book || ""), deviceRef: String(req.query?.device || ""), praxisId: String(req.query?.praxisId || "") }) });
}));

router.post("/clara/qm/jobs", qmRoute(async (clientId, req, res) => {
  const body = { ...(req.body || {}) };
  // Wenn nur eine Rolle/Kategorie genannt ist, schlägt Julia eine Helferin vor.
  if (!body.assignedTo && (body.assignedRole || body.category)) {
    const sug = await qmSuggestAssignee(clientId, { role: body.assignedRole || "", category: body.category || "" });
    if (sug.ok) { body.assignedTo = sug.staffId; body.assignedToName = sug.staffName; }
  }
  const r = await qmCreateJob(clientId, body);
  res.status(r.ok ? 201 : 400).json({ clientId, ...r });
}));

router.post("/clara/qm/jobs/:id", qmRoute(async (clientId, req, res) => {
  const r = await qmUpdateJob(clientId, req.params.id, req.body || {});
  res.status(r.ok ? 200 : 400).json({ clientId, ...r });
}));

router.post("/clara/qm/jobs/:id/delete", qmRoute(async (clientId, req, res) => {
  const r = await qmDeleteJob(clientId, req.params.id, req.body || {});
  res.status(r.ok ? 200 : 404).json({ clientId, ...r });
}));

router.post("/clara/qm/jobs/:id/assign", qmRoute(async (clientId, req, res) => {
  const r = await qmAssignJob(clientId, req.params.id, req.body || {});
  res.status(r.ok ? 200 : 400).json({ clientId, ...r });
}));

router.post("/clara/qm/jobs/:id/ack", qmRoute(async (clientId, req, res) => {
  const r = await qmAckJob(clientId, req.params.id, req.body || {});
  res.status(r.ok ? 200 : 400).json({ clientId, ...r });
}));

router.post("/clara/qm/jobs/:id/start", qmRoute(async (clientId, req, res) => {
  const r = await qmStartJob(clientId, req.params.id, req.body || {});
  res.status(r.ok ? 200 : 400).json({ clientId, ...r });
}));

router.post("/clara/qm/jobs/:id/complete", qmRoute(async (clientId, req, res) => {
  const r = await qmCompleteJob(clientId, req.params.id, req.body || {});
  // missing_required_fields ist eine fachliche Ablehnung (422), kein 400.
  const code = r.ok ? 200 : (r.reason === "missing_required_fields" ? 422 : 400);
  res.status(code).json({ clientId, ...r });
}));

router.post("/clara/qm/jobs/:id/push", qmRoute(async (clientId, req, res) => {
  const r = await qmPushJob(clientId, req.params.id, { publicBaseUrl: PUBLIC_BASE_URL, force: (req.body || {}).force === true });
  res.status(r.ok ? 200 : 400).json({ clientId, ...r });
}));


// --- Mitarbeiter-Portal (mobil): "Meine Aufgaben" ---
router.get("/clara/qm/my-jobs", qmRoute(async (clientId, req, res) => {
  const staffId = String(req.query?.staffId || "").trim();
  if (!staffId) return res.status(400).json({ error: "staffId_required" });
  res.json({ ok: true, clientId, jobs: await qmListJobsForStaff(clientId, staffId, { openOnly: String(req.query?.all || "") !== "1" }) });
}));


// --- Schedules (Wiederholungen) ---
router.get("/clara/qm/schedules", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, schedules: await qmListSchedules(clientId, { bookKey: String(req.query?.book || ""), activeOnly: String(req.query?.activeOnly || "") === "1" }) });
}));

router.post("/clara/qm/schedules", qmRoute(async (clientId, req, res) => {
  const r = await qmCreateSchedule(clientId, req.body || {});
  res.status(r.ok ? 201 : 400).json({ clientId, ...r });
}));

router.post("/clara/qm/schedules/:id", qmRoute(async (clientId, req, res) => {
  const r = await qmUpdateSchedule(clientId, req.params.id, req.body || {});
  res.status(r.ok ? 200 : 404).json({ clientId, ...r });
}));

router.post("/clara/qm/schedules/:id/delete", qmRoute(async (clientId, req, res) => {
  res.json({ clientId, ...(await qmDeleteSchedule(clientId, req.params.id)) });
}));


// --- Personal & Rollen ---
router.get("/clara/qm/staff", qmRoute(async (clientId, req, res) => {
  res.json({ ok: true, clientId, staff: await qmListStaff(clientId, { activeOnly: String(req.query?.activeOnly || "") === "1" }) });
}));

router.post("/clara/qm/staff", qmRoute(async (clientId, req, res) => {
  const r = await qmUpsertStaff(clientId, req.body || {});
  // Wird eine Mitarbeiterin deaktiviert, verteilt Julia ihre offenen Jobs neu.
  let redistribution = null;
  if (r.ok && (req.body || {}).active === false && r.staff?.id) {
    redistribution = await qmRedistribute(clientId, r.staff.id, { reason: "Mitarbeiter deaktiviert" }).catch(() => null);
  }
  res.json({ clientId, ...r, redistribution });
}));

// Offene Jobs einer Mitarbeiterin manuell neu verteilen (Vertretung→Rolle→Leitung).
router.post("/clara/qm/staff/:id/redistribute", qmRoute(async (clientId, req, res) => {
  const r = await qmRedistribute(clientId, req.params.id, req.body || {});
  res.status(r.ok ? 200 : 400).json({ clientId, ...r });
}));

router.post("/clara/qm/staff/:id/absence", qmRoute(async (clientId, req, res) => {
  const r = await qmAddAbsence(clientId, req.params.id, req.body || {});
  // Deckt die Abwesenheit (auch künftig) Jobs ab, lenkt Julia sie auf die
  // Vertretung um — bis zum Ende der Abwesenheit fällige, offene Jobs.
  let redistribution = null;
  if (r.ok && r.absence) {
    const endIso = `${r.absence.to || r.absence.from}T23:59:59`;
    const toMs = new Date(endIso).getTime();
    if (toMs && toMs >= Date.now()) {
      redistribution = await qmRedistribute(clientId, req.params.id, { onlyDueBeforeMs: toMs, reason: `Abwesenheit (${r.absence.type})` }).catch(() => null);
    }
  }
  res.status(r.ok ? 200 : 400).json({ clientId, ...r, redistribution });
}));

router.post("/clara/qm/staff/:id/absence/:absenceId/delete", qmRoute(async (clientId, req, res) => {
  res.json({ clientId, ...(await qmRemoveAbsence(clientId, req.params.id, req.params.absenceId)) });
}));


// --- Clara liest den QM-Kalender (read-only Auskunft) ---
router.get("/clara/qm/next-due", qmRoute(async (clientId, req, res) => {
  const bookKey = String(req.query?.book || "").trim() || qmResolveBookKey(String(req.query?.q || ""));
  const deviceRef = String(req.query?.device || "").trim();
  if (!bookKey) return res.status(400).json({ error: "book_unresolved" });
  res.json({ ok: true, clientId, bookKey, nextDue: await qmGetNextDue(clientId, { bookKey, deviceRef }), spoken: await qmSpokenNextDue(clientId, { bookKey, deviceRef }) });
}));

router.get("/clara/qm/history", qmRoute(async (clientId, req, res) => {
  const bookKey = String(req.query?.book || "").trim() || qmResolveBookKey(String(req.query?.q || ""));
  const deviceRef = String(req.query?.device || "").trim();
  if (!bookKey) return res.status(400).json({ error: "book_unresolved" });
  res.json({ ok: true, clientId, bookKey, spoken: await qmSpokenHistory(clientId, { bookKey, deviceRef, limit: Number(req.query?.limit || 1) }) });
}));

// Eine Frage, eine Antwort: Claras komplette QM-Kalender-Auskunft per Freitext.
// Deckt ALLE Jobs ab — überfällige, komplette Liste, Zeitfenster (Woche/Monat)
// und gezielte Buch-Fragen (nächste Fälligkeit / wer hat zuletzt erledigt).
router.get("/clara/qm/ask", qmRoute(async (clientId, req, res) => {
  const q = String(req.query?.q || "").trim();
  const deviceRef = String(req.query?.device || "").trim();
  const bookKey = q ? qmResolveBookKey(q) : null;

  // Überfällig/offen explizit gefragt -> Rückstandsliste.
  if (/(überfällig|ueberfaellig|rückstand|rueckstand|offen|versäum|versaeum)/i.test(q)) {
    return res.json({ ok: true, clientId, intent: "overdue", spoken: await qmSpokenOverdue(clientId) });
  }
  // Zeitfenster bestimmen, falls kein einzelnes Buch gemeint ist.
  const days = /monat/i.test(q) ? 30 : /(woche|7 tage)/i.test(q) ? 7 : 30;

  // Kein erkennbares Buch ODER ausdrücklich "alle/kalender/aufgaben" -> komplette Liste.
  if (!bookKey || /(alle|komplett|gesamt|kalender|aufgaben|was steht|überblick|ueberblick|qm)/i.test(q)) {
    return res.json({ ok: true, clientId, intent: "calendar", spoken: await qmSpokenCalendar(clientId, { days }) });
  }

  const wantsHistory = /(wer|zuletzt|letzte|erledigt|gemacht|war)/i.test(q);
  const spoken = wantsHistory
    ? await qmSpokenHistory(clientId, { bookKey, deviceRef })
    : await qmSpokenNextDue(clientId, { bookKey, deviceRef });
  res.json({ ok: true, clientId, bookKey, intent: wantsHistory ? "history" : "next_due", spoken });
}));

export default router;
