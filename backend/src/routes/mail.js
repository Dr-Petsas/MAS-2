// Nadine-Mail (/mail/*): Konten, Nachrichten, Versand, Briefe, Briefpapier, Bausteine.
// Mechanischer W1.2-Split aus server.js (04.07.2026): Pfade und Handler
// byte-identisch uebernommen, nur app. -> router. Kein Verhalten geaendert.
import express from "express";
import { assertAppEnabled } from "../entitlements.js";
import { searchPatient } from "../clara/agentBooking.js";
import { appendEvent } from "../brain/eventStore.js";
import { resolvePatientSubject } from "../brain/identity.js";
import { linkEventToCase } from "../brain/caseStore.js";
import { recordCommunication } from "../brain/record.js";
import { findContactsByPhone } from "../brain/addressBook.js";
import { outboxHealth, processBrainOutbox } from "../brain/outbox.js";
import { createAccount, updateAccount, deleteAccount, getAccountPublic } from "../mail/accounts.js";
import { testImap, syncAccount, syncAll, sendMail } from "../mail/mailbox.js";
import { listMessages, getMessage, markRead, listContacts, getAttachmentUrl, getAttachmentData, setMessageClassification, deleteMessage, linkMessageToCase, markAnswered, folderCounts } from "../mail/store.js";
import { classifyWithLLM, deriveMailSignals } from "../mail/classify.js";
import { buildLetterPdf, letterFilename } from "../mail/letter.js";
import { buildMailBriefing } from "../mail/briefing.js";
import { getLetterSettings, setLetterSettings } from "../mail/letterSettings.js";
import { saveLetterheadAsset, getLetterheadMeta, deleteLetterheadAsset, listLetterheads, setActiveLetterhead, deleteLetterhead } from "../mail/letterhead.js";
import { saveLetterAsset, getLetterAssetMeta, deleteLetterAsset, getLetterAssetBuffer } from "../mail/letterAssets.js";
import { listBlocks, createBlock, updateBlock, deleteBlock, seedDefaultBlocks } from "../mail/letterBlocks.js";
import { draftLetter, draftFromDiscussion, discussCompose, llmInfo, letterContextSummary, rewritePassage } from "../mail/letterAI.js";
import { extractText } from "../mail/extract.js";
import { saveDocument } from "../mail/documents.js";
import { archiveLetter, listLetters, getLetter } from "../mail/letterArchive.js";
import { log } from "../log.js";
import { actorName, canManageAccount, canSeeMessage, logOutboundMail, mailAccess, renderArgs, resolveAnsweredEvent, resolveClientId } from "./_shared.js";

const router = express.Router();


// --- Mail client (Nadine) -------------------------------------------------
// Per-practice IMAP/SMTP accounts (passwords encrypted at rest), inbox sync,
// message read models and sending. All tenant-scoped under mas_mail_*.

router.get("/mail/accounts", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const access = await mailAccess(clientId, req);
    res.json({ ok: true, clientId, accounts: access.accounts });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/mail/accounts", async (req, res) => {
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


router.patch("/mail/accounts/:id", async (req, res) => {
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


router.delete("/mail/accounts/:id", async (req, res) => {
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
router.post("/mail/accounts/test", async (req, res) => {
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
router.post("/mail/sync", async (req, res) => {
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


// Kontenbaum-Übersicht für den Mail-Client: sichtbare Konten + Zähler je
// Ordner (gesamt / ungelesen im Posteingang). Additiv; respektiert dieselbe
// Sichtbarkeit wie /mail/accounts (private Postfächer nur für den Inhaber).
router.get("/mail/overview", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const access = await mailAccess(clientId, req);
    const ids = access.accounts.map((a) => a.id);
    const counts = await folderCounts(clientId, ids);
    res.json({ ok: true, clientId, accounts: access.accounts, counts });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.get("/mail/messages", async (req, res) => {
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


router.get("/mail/messages/:id", async (req, res) => {
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


router.post("/mail/messages/:id/read", async (req, res) => {
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
router.post("/mail/messages/:id/log-reply", async (req, res) => {
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

    // Frist-Dokumentation: das beantwortete Eingangs-Ereignis erledigen und die
    // Einhaltung der Frist im Antwort-Event festhalten (wer, wann).
    const by = actorName(req);
    const comp = await resolveAnsweredEvent(clientId, `mail-in:${req.params.id}`, { by });

    const summary = [
      `E-Mail von ${senderLabel} — Betreff „${msg.subject || "(kein Betreff)"}“: ${inbound || "(kein Text)"}`,
      `Antwort (${by}): ${clip(replyText, 800) || "(leer)"}${comp.suffix}`,
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
    }, { by });

    // Cross-link the mail to its case so the thread's e-mails are retrievable
    // (powers Nadine's letter/reply context). Best-effort, never blocks.
    const caseId = rec?.caseId || msg.caseId || null;
    if (caseId && caseId !== msg.caseId) {
      try { await linkMessageToCase(clientId, req.params.id, caseId); } catch { /* non-blocking */ }
    }

    // Sichtbare Beantwortet-Markierung (wer/wann) auf der Eingangsmail.
    const answered = await markAnswered(clientId, req.params.id, { by }).catch(() => null);

    res.json({ ok: true, clientId, eventId: rec?.eventId || null, caseId, queued: !!rec?.queued, answered });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Delete a message: soft (→ Papierkorb) from a normal folder, permanent from the
// Papierkorb or with ?permanent=1.
router.delete("/mail/messages/:id", async (req, res) => {
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
router.post("/mail/messages/:id/classify", async (req, res) => {
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
router.post("/mail/send", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const accountId = (req.body?.accountId || "").trim();
    if (!accountId) return res.status(400).json({ ok: false, reason: "account_required" });
    const access = await mailAccess(clientId, req);
    if (access.allowedIds && !access.allowedIds.has(accountId)) return res.status(403).json({ error: "account_forbidden" });
    const out = await sendMail(clientId, accountId, req.body || {});
    if (!out.ok) return res.status(400).json({ ok: false, ...out });

    // Sichtbare Beantwortet-Markierung auf der Eingangsmail (Antwort-Fall):
    // damit der Posteingang zeigt, dass + von wem schon geantwortet wurde und
    // nicht mehrere Mitarbeiter dieselbe Mail beantworten. Best-effort.
    const by = actorName(req);
    let answered = null;
    const replyToId = String(req.body?.replyToMessageId || "").trim();
    if (replyToId) answered = await markAnswered(clientId, replyToId, { by }).catch(() => null);

    // Every outgoing patient communication is logged to the shared brain right
    // here on the server — so the KI/manual reply and the compose path are all
    // covered, and the frontend can NEVER "send but forget to log". Reliable:
    // recordCommunication queues a retry on failure (dead-letter outbox).
    // Opt out with logToBrain:false (the case-send route does its own logging).
    let brain = null;
    if (req.body?.logToBrain !== false) {
      // recordCommunication is failure-safe (queues a retry instead of throwing);
      // the guard is purely defensive so brain logging can never break a send.
      brain = await logOutboundMail(clientId, { storedId: out.storedId, body: req.body || {}, by }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    }
    res.json({ ok: true, clientId, ...out, brain, answered });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Brain dead-letter visibility for THIS tenant: how many communications are
// still queued for a retry (pending) or have exhausted retries (dead). The UI
// can show a banner so a dropped event/case write is never invisible.
router.get("/mail/brain/outbox", async (req, res) => {
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
router.post("/mail/brain/outbox/drain", async (req, res) => {
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
router.get("/mail/briefing", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await buildMailBriefing(clientId, { sinceMinutes: Number(req.query?.sinceMinutes) || 720 });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.get("/mail/contacts", async (req, res) => {
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
router.get("/mail/address-book", async (req, res) => {
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


// "Wem gehört diese Nummer?" — direkter Adressbuch-Lookup für UI/Diagnose.
router.get("/mail/contacts/by-phone", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const items = await findContactsByPhone(clientId, String(req.query?.phone || ""));
    res.json({ ok: true, clientId, contacts: items });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Signed URL for a stored attachment (Cloud Storage). Frontend opens it.
router.get("/mail/messages/:id/attachments/:idx", async (req, res) => {
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
router.get("/mail/messages/:id/attachments/:idx/raw", async (req, res) => {
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


// Anhang-Bytes als JSON/base64 (CORS-sicher, kein Storage-Redirect): das
// Frontend nutzt das fuer "Weiterleiten mit Original-Anhaengen" im Composer.
// Additiv — bestehende /raw- und Signed-URL-Routen bleiben unveraendert.
router.get("/mail/messages/:id/attachments/:idx/base64", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const access = await mailAccess(clientId, req);
    if (access.allowedIds) {
      const m = await getMessage(clientId, req.params.id);
      if (!canSeeMessage(access, m)) return res.status(403).json({ error: "account_forbidden" });
    }
    const out = await getAttachmentData(clientId, req.params.id, Number(req.params.idx), { asBuffer: true });
    if (!out.ok) return res.status(out.reason === "not_found" || out.reason === "no_attachment" || out.reason === "not_stored" ? 404 : 400).json({ ok: false, ...out });
    res.json({ ok: true, clientId, filename: out.filename || "anhang", contentType: out.contentType || "application/octet-stream", size: out.buffer.length, base64: out.buffer.toString("base64") });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Ad-hoc / live-preview letter PDF (no case). Body: { to, subject, body }.
router.post("/mail/letter", async (req, res) => {
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
// (phone calls / case thread, related e-mails, gespeicherte Unterlagen) + aus dem
// Archiv gewählte frühere Briefe (sourceLetterIds) + ein hochgeladener Quelltext.
// Frisch hochgeladene Unterlagen (noch nicht im Gehirn) kommen additiv als
// documents:[{filename,text}] dazu — die KI-Zeile im Composer nutzt das.
// Body: { caseId?, patientName?, recipient?, sourceText?, sourceLetterIds?, direction, tone?, recipientType?, documents? }
router.post("/mail/letter/ai-draft", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const b = req.body || {};
    const out = await draftLetter(clientId, {
      caseId: b.caseId,
      patientName: b.patientName,
      recipient: b.recipient,
      sourceText: b.sourceText,
      sourceLetterIds: b.sourceLetterIds,
      direction: b.direction,
      tone: b.tone,
      recipientType: b.recipientType,
      useContext: b.useContext !== false,
      documents: b.documents,
    });
    res.json({ ok: true, clientId, ...out, llm: llmInfo() });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Editor "context card": what Nadine knows about this recipient BEFORE writing
// (resolved patient, # phone calls, # e-mails, the assembled context text). The
// editor shows this so the team sees and trusts the grounding. Read-only.
router.get("/mail/letter/context", async (req, res) => {
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
router.post("/mail/letter/ai-rewrite", async (req, res) => {
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


// Composer-Diskussions-Chat (qwen3.6): Thema erörtern, PDFs/Briefe als Kontext,
// Mehrfach-Turns — bevor „E-Mail generieren“ den Entwurf schreibt.
// Body: { messages:[{role,content}], documents?:[{filename,text}], recipient?, subjectHint? }
router.post("/mail/compose/ai-chat", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const b = req.body || {};
    const out = await discussCompose(clientId, {
      messages: b.messages,
      documents: b.documents,
      recipient: b.recipient,
      subjectHint: b.subjectHint,
    });
    if (!out.ok) return res.status(400).json({ ok: false, ...out, llm: llmInfo() });
    res.json({ ok: true, clientId, ...out, llm: llmInfo() });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Chatverlauf → fertige E-Mail (subject/body). Button „E-Mail generieren“.
// Body: { messages, documents?, recipient?, subjectHint?, tone? }
router.post("/mail/compose/ai-from-chat", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const b = req.body || {};
    const out = await draftFromDiscussion(clientId, {
      messages: b.messages,
      documents: b.documents,
      recipient: b.recipient,
      subjectHint: b.subjectHint,
      tone: b.tone,
    });
    if (!out.ok && !out.body) return res.status(400).json({ ok: false, ...out, llm: llmInfo() });
    res.json({ ok: true, clientId, ...out, llm: llmInfo() });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Write a FINISHED letter into the SHARED BRAIN (ticket/case), threaded onto the
// recipient's patient case so Clara & the briefing see it — UND immer ins
// Briefarchiv (mas_letters, Volldatensatz inkl. Input/Kontext) für Folge-Briefe.
// Der "Privat"-Schalter (private:true) archiviert weiterhin, überspringt aber
// den Gehirn-Eintrag (kein Event, keine Vorgang-Verknüpfung, nicht an Clara).
// Body: { recipient?, patientName?, subject?, body?, private?, recipientType?,
//   direction?, tone?, sourceText?, sourceLetterIds?, contextText?, model?,
//   contextCounts? }.
router.post("/mail/letter/log", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const b = req.body || {};
    const by = actorName(req);
    const clip = (s, n) => { const t = String(s || "").trim(); return t.length > n ? t.slice(0, n) + " …" : t; };
    const nameHint = String(b.patientName || "").trim() || String(b.recipient || "").split(/\r?\n/)[0]?.trim() || "";

    let eventId = null;
    let caseId = null;

    // Privat: NICHT ins Gehirn — nur archivieren.
    if (b.private !== true) {
      let subject = { name: nameHint };
      let isPatient = false;
      if (nameHint) {
        const subj = await resolvePatientSubject(clientId, nameHint).catch(() => null);
        if (subj?.patientId) { subject = { patientId: subj.patientId, name: subj.name || nameHint, matchStatus: "matched", matchMethod: subj.matchMethod || "name" }; isPatient = true; }
      }

      const summary = [
        `Brief an ${nameHint || "(unbekannt)"} — Betreff „${b.subject || "(kein Betreff)"}“${by !== "Nadine" ? ` (verfasst durch ${by})` : ""}`,
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
      eventId = event.id;

      let caseLink = null;
      try { caseLink = await linkEventToCase(clientId, event, { by }); } catch (err) { caseLink = { error: String(err?.message || err) }; }
      caseId = caseLink?.caseId || null;
    }

    // Immer ins Archiv (Volldatensatz für Folge-Briefe). Best-effort: ein
    // Archiv-Fehler darf den Gehirn-Eintrag nicht rückgängig machen.
    let letterId = null;
    try {
      const arch = await archiveLetter(clientId, {
        recipient: b.recipient,
        patientName: nameHint,
        caseId,
        recipientType: b.recipientType,
        subject: b.subject,
        body: b.body,
        private: b.private === true,
        direction: b.direction,
        tone: b.tone,
        sourceText: b.sourceText,
        sourceLetterIds: b.sourceLetterIds,
        contextText: b.contextText,
        model: b.model,
        contextCounts: b.contextCounts,
        eventId,
        createdBy: by,
      });
      letterId = arch.id;
    } catch (err) { /* Archiv best-effort */ }

    res.json({ ok: true, clientId, logged: b.private !== true, eventId, caseId, letterId });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Briefarchiv: Liste (neueste zuerst, Filter q/patientName/caseId, Cursor-
// paginiert) und Detail (Volldatensatz inkl. Input/Kontext).
router.get("/mail/letters", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await listLetters(clientId, {
      q: req.query.q,
      patientName: req.query.patientName,
      caseId: req.query.caseId,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor,
    });
    res.json({ ok: true, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

router.get("/mail/letters/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const letter = await getLetter(clientId, req.params.id);
    if (!letter) return res.status(404).json({ error: "not_found", clientId });
    res.json({ ok: true, clientId, letter });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

// PDF eines archivierten Briefs — ON-DEMAND aus den gespeicherten Feldern neu
// gerendert (nutzt IMMER das aktuelle Briefpapier/Layout des Mandanten).
router.get("/mail/letters/:id/pdf", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const letter = await getLetter(clientId, req.params.id);
    if (!letter) return res.status(404).json({ error: "not_found", clientId });
    const { settings, letterhead, signatureImage, stampImage } = await renderArgs(clientId);
    const buffer = await buildLetterPdf({ settings, letterhead, signatureImage, stampImage, to: letter.recipient || "", subject: letter.subject || "", body: letter.body || "" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${letterFilename(letter.subject || "Brief")}"`);
    res.end(buffer);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Extract plain text from an uploaded letter (paste alternative). Body:
// { base64, filename?, contentType? }. Handles text/* and PDF; images -> hint.
router.post("/mail/letter/extract", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const out = await extractText(req.body || {});
    res.json({ ok: out.ok, clientId, ...out });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Persistiere eine hochgeladene/eingefügte Unterlage DAUERHAFT im gemeinsamen
// Gehirn und hänge sie an den passenden Vorgang — so fließt sie in FOLGE-Briefe
// wieder als Kontext ein (nicht nur in den einen Entwurf). Body:
// { text? | base64?, filename?, contentType?, patientName?, recipient?, caseId? }.
// Nimmt Klartext direkt oder extrahiert vorher aus base64 (Text/PDF).
router.post("/mail/documents", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const b = req.body || {};
    let text = String(b.text || "").trim();
    let kind = "text";
    if (!text && b.base64) {
      const ex = await extractText({ base64: b.base64, filename: b.filename, contentType: b.contentType });
      if (!ex.ok || !ex.text) return res.json({ ok: false, clientId, reason: "no_text", note: ex.note || "Kein Text extrahierbar." });
      text = ex.text;
      kind = ex.kind || "text";
    }
    if (!text) return res.status(400).json({ error: "no_text" });
    const saved = await saveDocument(clientId, {
      text,
      kind,
      filename: b.filename,
      patientName: b.patientName,
      recipient: b.recipient,
      caseId: b.caseId,
      uploadedBy: actorName(req),
    });
    res.json({ ok: saved.ok, clientId, ...saved });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Live preview (alias of /mail/letter) — kept explicit for the editor's intent.
// `stationery: true` liefert NUR das Briefpapier (Briefkopf, Falzmarken, Fußzeile,
// gesetzter Absenderblock) ohne Inhalt — der Inline-Editor rastert das als
// Seitenhintergrund und schreibt direkt darauf.
router.post("/mail/letter/preview", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const { settings, letterhead, signatureImage, stampImage } = await renderArgs(clientId);
    const layout = req.body?.layout || null; // unsaved layout for live design preview
    const stationeryOnly = req.body?.stationery === true;
    const buffer = await buildLetterPdf({ settings, letterhead, signatureImage, stampImage, layout, stationeryOnly, to: req.body?.to, subject: req.body?.subject, body: req.body?.body });
    res.json({ ok: true, clientId, base64: buffer.toString("base64"), usedAsset: !!letterhead, settings: stationeryOnly ? settings : undefined });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Letterhead settings.
router.get("/mail/letter/settings", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    res.json({ ok: true, clientId, settings: await getLetterSettings(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.put("/mail/letter/settings", async (req, res) => {
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
router.post("/mail/letter/letterhead", async (req, res) => {
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


router.get("/mail/letter/letterhead", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    res.json({ ok: true, clientId, asset: await getLetterheadMeta(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// List ALL letterheads (with image previews) + which one is active.
router.get("/mail/letter/letterheads", async (req, res) => {
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
router.post("/mail/letter/letterhead/active", async (req, res) => {
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
router.delete("/mail/letter/letterhead/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    await deleteLetterhead(clientId, String(req.params.id || ""));
    res.json({ ok: true, clientId });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.delete("/mail/letter/letterhead", async (req, res) => {
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
router.post("/mail/letter/asset/:kind", async (req, res) => {
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


router.get("/mail/letter/asset/:kind", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    res.json({ ok: true, clientId, asset: await getLetterAssetMeta(clientId, req.params.kind) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Die Bild-BYTES von Unterschrift/Stempel — der Inline-Editor zeigt sie live an
// ihrer echten Position auf dem Briefbogen. 404, wenn keins hinterlegt ist.
router.get("/mail/letter/asset/:kind/file", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    const [buffer, meta] = await Promise.all([
      getLetterAssetBuffer(clientId, req.params.kind),
      getLetterAssetMeta(clientId, req.params.kind),
    ]);
    if (!buffer) return res.status(404).json({ ok: false, error: "not_found" });
    res.set("Content-Type", meta?.contentType || "image/png");
    res.set("Cache-Control", "private, max-age=300");
    res.send(buffer);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.delete("/mail/letter/asset/:kind", async (req, res) => {
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
router.get("/mail/letter/blocks", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    if (req.query?.seed === "1") await seedDefaultBlocks(clientId);
    res.json({ ok: true, clientId, blocks: await listBlocks(clientId) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.post("/mail/letter/blocks", async (req, res) => {
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


router.patch("/mail/letter/blocks/:id", async (req, res) => {
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


router.delete("/mail/letter/blocks/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) return res.status(403).json({ error: "clara_not_entitled", clientId });
    res.json({ ok: true, clientId, ...(await deleteBlock(clientId, req.params.id)) });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

export default router;
