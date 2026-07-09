import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { createHash, randomUUID } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { getAccountWithSecrets, markSync, saveSyncState } from "./accounts.js";
import { classifyByKeywords, deriveMailSignals } from "./classify.js";
import { getLetterSettings } from "./letterSettings.js";
import { recordCommunication } from "../brain/record.js";
import { upsertSharedContact, extractPhoneFromText } from "../brain/addressBook.js";
import { resolvePatientSubject } from "../brain/identity.js";
import { assessCritical } from "../brain/critical.js";

function escapeHtml(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function textToHtml(v) {
  return escapeHtml(v).replace(/\r?\n/g, "<br>");
}

// Append the practice's e-mail signature to an outgoing body once.
//   - the plain-text part always gets the "-- " separated plain signature
//   - if a STYLED (HTML) signature exists it is used RAW for the HTML part; a
//     text-only body is upgraded to an HTML part so the styling actually renders
//   - otherwise the HTML part (if any) gets the escaped plain signature
function withSignature(text, html, { plain = "", htmlSig = "" } = {}) {
  const sigText = String(plain || "").trim();
  const sigHtml = String(htmlSig || "").trim();
  if (!sigText && !sigHtml) return { text, html };
  const outText = text != null ? text : "";

  let nextText = outText;
  if (sigText && !outText.includes(sigText)) nextText = `${outText.replace(/\s+$/, "")}\n\n-- \n${sigText}`;

  let nextHtml = html;
  if (sigHtml) {
    if (!nextHtml) nextHtml = textToHtml(outText); // build an HTML part from the text body
    if (!nextHtml.includes(sigHtml)) nextHtml = `${nextHtml}<br><br>--<br>${sigHtml}`;
  } else if (nextHtml && sigText) {
    const esc = textToHtml(sigText);
    if (!nextHtml.includes(esc)) nextHtml = `${nextHtml}<br><br>--<br>${esc}`;
  }
  return { text: nextText, html: nextHtml };
}

// The working mailbox: pull mail over IMAP, send over SMTP, thread by Message-ID,
// keep a light auto address book. Message metadata + bodies live in Firestore
// (clients/{clientId}/mas_mail_messages); large attachments go to Cloud Storage
// when a bucket is configured, otherwise we keep their metadata only. Set
// MAIL_DRY_RUN=1 to exercise the send path without a real SMTP server.

const { FieldValue } = admin.firestore;
const MSG_COL = "mas_mail_messages";
const ATT_COL = "mas_mail_attachments";
const MAX_INLINE = 180000; // keep docs well under Firestore's 1 MiB limit
const MAX_INLINE_ATT = 700 * 1024; // base64 ≈ 933 KB — safely under the 1 MiB doc cap
const DRY_RUN = process.env.MAIL_DRY_RUN === "1";

function msgs(clientId) {
  return masCollection(clientId, MSG_COL);
}
function withTimeout(promise, ms, label, onTimeout) {
  let t;
  const timer = new Promise((_, reject) => {
    t = setTimeout(() => {
      try { onTimeout?.(); } catch { /* ignore */ }
      reject(new Error(`${label} hat das Zeitlimit überschritten.`));
    }, ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

// --- threading -------------------------------------------------------------

export function normalizeThreadToken(value = "") {
  const token = String(value || "").trim();
  if (!token) return "";
  const m = token.match(/<[^>]+>/);
  return String(m?.[0] || token).trim();
}

function refList(parsed = {}) {
  const refs = parsed.references
    ? Array.isArray(parsed.references) ? parsed.references : [parsed.references]
    : [];
  return [parsed.inReplyTo, ...refs].map(normalizeThreadToken).filter(Boolean);
}

/** Resolve a stable threadId: follow References/In-Reply-To to an existing
 *  message's thread, else start a new thread at this Message-ID. */
async function deriveThreadId(clientId, parsed, messageId) {
  const self = normalizeThreadToken(messageId);
  for (const ref of refList(parsed)) {
    const snap = await msgs(clientId).where("messageId", "==", ref).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0].data();
      return normalizeThreadToken(d.threadId || d.messageId || ref);
    }
  }
  return self || refList(parsed)[0] || `<${randomUUID()}@mas.local>`;
}

// --- address helpers -------------------------------------------------------

function addr(one) {
  if (!one) return null;
  const a = Array.isArray(one?.value) ? one.value[0] : one;
  const address = (a?.address || "").toLowerCase().trim();
  if (!address) return null;
  return { name: (a?.name || "").trim(), address };
}

function addrList(field) {
  const value = field?.value || (Array.isArray(field) ? field : []);
  return (value || [])
    .map((a) => ({ name: (a?.name || "").trim(), address: (a?.address || "").toLowerCase().trim() }))
    .filter((a) => a.address);
}

// The address book. We only ever store senders of PRACTICE-RELEVANT mail here
// (newsletters/spam are skipped by the caller), and enrich the entry with the
// category and the last subject so Nadine has a useful directory, not a dump.
// Writes through the SHARED address book (brain/addressBook) so phone numbers
// from signatures land on the same record that Lisa/Bianca/Clara read.
async function upsertContact(clientId, person, extra = {}) {
  if (!person?.address) return;
  await upsertSharedContact(clientId, {
    name: person.name || "",
    email: person.address,
    phone: extra.phone || "",
    source: "nadine_mail_in",
    category: extra.category || "",
    subject: extra.subject || "",
    ts: extra.ts || Date.now(),
  });
}

// --- attachments -----------------------------------------------------------

function getBucket() {
  try {
    const b = admin.storage().bucket();
    return b?.name ? b : null;
  } catch {
    return null;
  }
}

async function storeAttachments(clientId, accountId, msgId, attachments = []) {
  const out = [];
  const bucket = getBucket();
  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    const filename = (a.filename || `attachment-${i + 1}`).replace(/[\\/:*?"<>|]/g, "_");
    const meta = { filename, size: a.size || a.content?.length || 0, contentType: a.contentType || "application/octet-stream", stored: false, storagePath: null, inline: false };
    if (bucket && a.content) {
      const path = `mas-mail/${clientId}/${accountId}/${msgId}/${String(i + 1).padStart(2, "0")}-${filename}`;
      try {
        await bucket.file(path).save(a.content, { contentType: meta.contentType, resumable: false });
        meta.stored = true;
        meta.storagePath = path;
      } catch { /* keep metadata only */ }
    } else if (a.content && a.content.length <= MAX_INLINE_ATT) {
      // No bucket configured: keep small attachments inline in a separate doc so
      // previews/downloads still work. Bytes live OUTSIDE the message doc.
      try {
        await masCollection(clientId, ATT_COL).doc(`${msgId}_${i}`).set({
          messageId: msgId, idx: i, filename, contentType: meta.contentType,
          size: meta.size, data: a.content.toString("base64"), createdAt: FieldValue.serverTimestamp(),
        });
        meta.stored = true;
        meta.inline = true;
      } catch { /* keep metadata only */ }
    }
    out.push(meta);
  }
  return out;
}

// --- storage ---------------------------------------------------------------

function clip(text, n = MAX_INLINE) {
  const t = text || "";
  return t.length > n ? { value: t.slice(0, n), truncated: true } : { value: t, truncated: false };
}

function docIdFor(accountId, messageId) {
  return "m_" + createHash("sha256").update(`${accountId}:${messageId}`).digest("hex").slice(0, 28);
}

async function storeMessage(clientId, account, { parsed, uid, folder, direction, seen }) {
  const messageId = normalizeThreadToken(parsed.messageId) || `<${randomUUID()}@mas.local>`;
  const id = docIdFor(account.id, messageId);
  const ref = msgs(clientId).doc(id);
  const existing = await ref.get();

  const prev = existing.exists ? existing.data() : null;
  const threadId = prev ? prev.threadId : await deriveThreadId(clientId, parsed, messageId);
  const text = clip(parsed.text || "");
  const html = clip(parsed.html || "");
  const from = addr(parsed.from) || { name: "", address: "" };
  const to = addrList(parsed.to);
  const cc = addrList(parsed.cc);
  const attachments = await storeAttachments(clientId, account.id, id, parsed.attachments || []);

  // Ziel-Ordner bestimmen. Zwei Sonderfaelle:
  //  - Papierkorb bleibt Papierkorb (sonst holt der naechste Sync die Mail zurueck).
  //  - Selbst-adressierte Mails liegen auf dem Server in INBOX UND Gesendet;
  //    wir fuehren EIN Dokument je Message-ID => der Posteingang gewinnt, sonst
  //    verschwaende die Mail dort, sobald der Gesendet-Sync sie erneut sieht.
  let effFolder = folder || "INBOX";
  let effDirection = direction || "in";
  if (prev?.folder === "Trash") {
    effFolder = "Trash";
    effDirection = prev.direction || effDirection;
  } else if (prev?.folder === "INBOX" && effFolder === "Sent") {
    effFolder = "INBOX";
    effDirection = prev.direction || "in";
  }

  // Praxisrelevanz + Kategorie: keyword-classify inbound mail at sync time so the
  // badges are always present. Keep any prior LLM refinement (aiClassifiedAt).
  let classification = {};
  if (effDirection === "in") {
    if (prev?.aiClassifiedAt) {
      classification = { category: prev.category || "Sonstiges", relevant: prev.relevant !== false, relevanceReason: prev.relevanceReason || "" };
    } else {
      const c = classifyByKeywords({ subject: parsed.subject, fromAddress: from.address, text: parsed.text || parsed.html || "" });
      classification = { category: c.category, relevant: c.relevant, relevanceReason: c.relevanceReason };
    }
  }

  const doc = {
    accountId: account.id,
    folder: effFolder,
    direction: effDirection,
    uid: uid || null,
    messageId,
    threadId,
    inReplyTo: normalizeThreadToken(parsed.inReplyTo) || "",
    references: refList(parsed),
    from,
    to,
    cc,
    subject: parsed.subject || "(kein Betreff)",
    date: parsed.date ? new Date(parsed.date).getTime() : Date.now(),
    seen: seen != null ? !!seen : effDirection === "out",
    preview: (parsed.text || "").replace(/\s+/g, " ").trim().slice(0, 200),
    textBody: text.value,
    textTruncated: text.truncated,
    htmlBody: html.value,
    htmlTruncated: html.truncated,
    attachments,
    hasAttachments: attachments.length > 0,
    ...classification,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!existing.exists) doc.createdAt = FieldValue.serverTimestamp();

  await ref.set(doc, { merge: true });
  const created = !existing.exists;
  // Frische-Wache: Adressbuch und Gehirn nur fuer Mails der letzten 14 Tage
  // (Fenster wie backfillInboundMailBrain) — ein Historien-Backfill (07.07.2026)
  // darf keine Monate alten Mails als "neue" Vorgaenge in Briefings/Tickets
  // spuelen oder lastSeenAt im geteilten Adressbuch zurueckdrehen.
  const isFresh = (doc.date || 0) > Date.now() - 14 * 86400000;
  // Only practice-relevant inbound senders enter the address book — including
  // the phone number from the signature, so "Ruf Herrn Kasper an" works without
  // re-digging through the inbox.
  if (effDirection === "in" && classification.relevant !== false && isFresh) {
    const sigPhone = extractPhoneFromText(`${text.value} ${html.value.replace(/<[^>]+>/g, " ")}`);
    await upsertContact(clientId, from, { category: classification.category, subject: doc.subject, ts: doc.date, phone: sigPhone });
  }
  // Inbound, practice-relevant, NEW mail enters the shared brain at sync time so
  // Clara's timeline and the case/ticket system see patient mail IMMEDIATELY —
  // not only once someone happens to reply. Idempotent (stable event id) and
  // failure-safe (recordCommunication queues a retry on error, never throws).
  if (created && effDirection === "in" && classification.relevant !== false && isFresh) {
    await recordInboundMail(clientId, id, doc).catch(() => { /* outbox already captured it */ });
  }
  return { id, created, threadId };
}

/**
 * Put a freshly-synced inbound mail into the shared brain: resolve the sender to
 * a patient (e-mail-first, never guessing), translate the mail's category into
 * brain signals (so the ticket gets the right topic), and thread it onto a case.
 */
async function recordInboundMail(clientId, msgId, doc) {
  const senderName = doc.from?.name || "";
  const senderAddr = doc.from?.address || "";

  let subject = { name: senderName, matchStatus: "unmatched", matchMethod: null };
  let isPatient = false;
  if (senderName || senderAddr) {
    const subj = await resolvePatientSubject(clientId, { name: senderName, email: senderAddr }).catch(() => null);
    if (subj?.patientId) {
      subject = { patientId: subj.patientId, name: subj.name || senderName, matchStatus: "matched", matchMethod: subj.matchMethod || "email" };
      isPatient = true;
    } else if (subj) {
      subject = { name: subj.name || senderName, matchStatus: subj.matchStatus || "unmatched", matchMethod: null };
    }
  }
  // Prefer the resolved patient name over a raw address — the summary is read
  // ALOUD by Clara and shown in briefings ("E-Mail von Michael Diedershagen",
  // nicht "von michael.diedershagen@gmx.de").
  const senderLabel = (isPatient && subject.name) || senderName || senderAddr || "Unbekannt";

  // HTML-only mails (very common) have an empty text part — fall back to the
  // tag-stripped HTML so the brain never stores "(kein Text)" for a real mail.
  const htmlText = String(doc.htmlBody || "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  const bodyText = String(doc.preview || doc.textBody || "").replace(/\s+/g, " ").trim() || htmlText;

  const signals = deriveMailSignals({ category: doc.category, subject: doc.subject, text: doc.textBody || doc.preview || htmlText || "" });
  const preview = bodyText.slice(0, 500);
  const summary = `E-Mail von ${senderLabel} — Betreff „${doc.subject || "(kein Betreff)"}“: ${preview || "(kein Text)"}`;

  // Eskalations-Radar: Anwalt/Kammer/Mahnung/Pfändung erkennen und die Frist
  // gleich mit — kritische Post darf nie als Zeile 17 im Briefing untergehen.
  const crit = assessCritical({ subject: doc.subject, text: doc.textBody || htmlText || doc.preview || "" });
  const tags = [];
  if (crit.critical) {
    signals.critical = true;
    tags.push("kritisch", crit.category);
  }

  return recordCommunication(clientId, {
    id: `mail-in:${msgId}`,
    channel: "nadine_email",
    direction: "in",
    type: "interaction",
    // Ereignis-Zeit = Mail-Eingang, nicht Sync-Zeit — nachgeholte Mails landen
    // an der richtigen Stelle der Timeline statt als "heute neu" im Briefing.
    ts: doc.date || undefined,
    counterparty: { kind: isPatient ? "patient" : "unknown", name: senderLabel, ref: senderAddr || null },
    subject,
    signals,
    summary: crit.critical ? `[${crit.label}] ${summary}` : summary,
    deadlineMs: crit.deadlineMs,
    tags,
    extractor: "nadine@sync",
    payloadRef: { kind: "mail", id: msgId },
  }, { by: "Nadine" });
}

/**
 * Repair sweep: put relevant inbound mails into the shared brain that were
 * MISSED at sync time — synced before the brain pipeline existed, or only
 * re-classified as relevant later (LLM refinement after a keyword miss).
 * Idempotent (stable `mail-in:<id>` event ids), so running it repeatedly is
 * safe and cheap. Returns how many mails were checked/recorded.
 */
export async function backfillInboundMailBrain(clientId, { sinceDays = 14, max = 200 } = {}) {
  const cutoff = Date.now() - sinceDays * 86400000;
  // No composite index needed: order by date only, filter direction in memory
  // (same trade-off as listCases — recent window, small result set).
  const snap = await msgs(clientId)
    .orderBy("date", "desc")
    .limit(max)
    .get();

  const eventsCol = masCollection(clientId, "mas_events");
  let recorded = 0, checked = 0, rematched = 0;
  for (const d of snap.docs) {
    const m = d.data();
    if ((m.date || 0) < cutoff) break; // sorted desc — everything after is older
    if ((m.direction || "in") !== "in") continue;
    if (m.relevant === false || m.folder === "Trash") continue;
    checked++;
    const ev = await eventsCol.doc(`mail-in:${d.id}`).get();
    if (!ev.exists) {
      const r = await recordInboundMail(clientId, d.id, m).catch(() => null);
      if (r?.ok) recorded++;
      continue;
    }
    // Identity repair: the event exists but the sender was never matched to a
    // platform patient (e.g. the e-mail lookup was broken, or the address was
    // added to the patient record later). Re-resolve and patch event + case so
    // cross-agent context (Clara's day list) can find it by patientId.
    const evData = ev.data();
    if (evData?.subject?.patientId) continue;
    const senderAddr = m.from?.address || "";
    const senderName = m.from?.name || "";
    if (!senderAddr && !senderName) continue;
    const subj = await resolvePatientSubject(clientId, { name: senderName, email: senderAddr }).catch(() => null);
    if (!subj?.patientId) continue;
    const patched = {
      patientId: subj.patientId,
      name: subj.name || senderName || senderAddr,
      matchStatus: "matched",
      matchMethod: subj.matchMethod || "email",
    };
    await ev.ref.update({ subject: patched }).catch(() => null);
    const caseSnap = await masCollection(clientId, "mas_cases")
      .where("eventIds", "array-contains", ev.id).limit(1).get().catch(() => null);
    if (caseSnap && !caseSnap.empty) {
      await caseSnap.docs[0].ref.update({ subject: patched }).catch(() => null);
    }
    rematched++;
  }
  return { ok: true, checked, recorded, rematched };
}

// --- IMAP ------------------------------------------------------------------

function imapClient(acc) {
  return new ImapFlow({
    host: acc.imap.host,
    port: acc.imap.port || 993,
    secure: acc.imap.secure !== false,
    auth: { user: acc.imap.user, pass: acc.imapPassword },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
}

// Translate imapflow/socket errors into a clear, actionable German message so the
// UI shows *why* a connection failed instead of a cryptic "Command failed".
export function describeImapError(e) {
  const code = e?.code || e?.serverResponseCode || "";
  const txt = String(e?.responseText || e?.response || e?.message || e || "").trim();
  if (e?.authenticationFailed || code === "EAUTH" || code === "AUTHENTICATIONFAILED" || /authenticationfailed|invalid credentials|login failed|auth/i.test(txt) || /command failed/i.test(txt)) {
    return "Anmeldung fehlgeschlagen – Benutzername/Passwort prüfen. Viele Anbieter (z. B. Strato, IONOS) erwarten die vollständige E-Mail-Adresse als Benutzer; bei aktivierter 2FA ist ein App-Passwort nötig.";
  }
  if (code === "ENOTFOUND" || /ENOTFOUND/i.test(txt)) return "IMAP-Server nicht gefunden – Host prüfen (z. B. imap.strato.de, nicht imap-strato.de).";
  if (code === "ECONNREFUSED" || /ECONNREFUSED/i.test(txt)) return "Verbindung abgelehnt – Port/SSL prüfen (üblich: 993 mit SSL).";
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || /Zeitlimit|timed? ?out/i.test(txt)) return "Zeitüberschreitung – Host, Port oder Firewall prüfen.";
  if (/certificate|self.signed|tls/i.test(txt)) return "TLS-/Zertifikatsfehler – SSL-Einstellung und Port prüfen.";
  return txt || "Unbekannter IMAP-Fehler.";
}

export async function testImap(creds) {
  const acc = { imap: { host: creds.host, port: creds.port, secure: creds.secure, user: creds.user }, imapPassword: creds.password };
  if (!acc.imap.host || !acc.imap.user || !acc.imapPassword) throw new Error("IMAP Host, Benutzer und Passwort sind erforderlich.");
  const client = imapClient(acc);
  try {
    await withTimeout(client.connect(), 20000, "IMAP-Verbindung", () => { try { client.close(); } catch { /* */ } });
  } catch (e) {
    try { client.close(); } catch { /* */ }
    throw new Error(describeImapError(e));
  }
  try {
    const lock = await withTimeout(client.getMailboxLock("INBOX"), 10000, "IMAP-Postfachsperre", () => { try { client.close(); } catch { /* */ } });
    const count = client.mailbox?.exists ?? 0;
    lock.release();
    return { ok: true, messageCount: count };
  } catch (e) {
    throw new Error(describeImapError(e));
  } finally {
    try { await client.logout(); } catch { try { client.close(); } catch { /* */ } }
  }
}

/** Den Gesendet-Ordner des Servers finden: erst IMAP special-use (\Sent),
 *  dann uebliche Namen (Strato: "Sent Items"). null = keiner vorhanden. */
function findSentPath(boxes = []) {
  const byUse = boxes.find((b) => String(b.specialUse || "").toLowerCase() === "\\sent");
  if (byUse) return byUse.path;
  const names = new Set(["sent items", "sent", "sent messages", "gesendet", "gesendete objekte", "gesendete elemente", "inbox.sent"]);
  const hit = boxes.find((b) => names.has(String(b.path || "").toLowerCase()) || names.has(String(b.name || "").toLowerCase()));
  return hit?.path || null;
}

/**
 * Pull mail of one account into Firestore — INBOX (in) UND Gesendet-Ordner des
 * Servers (out, z. B. vom Handy/Outlook verschickt). Vorfall 07.07.2026:
 * "Postausgang" zeigte nur Nadines eigene Kopien, weil der Server-Gesendet-
 * Ordner nie synchronisiert wurde. inbox/sent sind einzeln schaltbar.
 *
 * INKREMENTELL (09.07.2026): Statt bei jedem Tick die letzten `limit` Mails
 * komplett neu herunterzuladen (und Anhänge/Klassifikation neu zu schreiben),
 * merkt sich der Sync pro Ordner die UIDVALIDITY + höchste bereits gespeicherte
 * UID (mas_mail_accounts.syncState). Existiert ein gültiger Cursor, wird nur
 * `UID > lastUid` geholt — meist NICHTS, wenn keine neue Mail da ist. So verhält
 * sich Nadine wie ein echter Mailclient (voller Bestand steht, es wird nur oben
 * aufgefrischt), statt bei jedem Aufruf "von null" zu laden.
 *
 * Erster Lauf (kein Cursor) oder geänderte UIDVALIDITY ⇒ SEED: die letzten
 * `limit` Mails per Sequenz-Fenster (wie bisher), damit der Posteingang sofort
 * gefüllt ist. `full: true` erzwingt IMMER das Sequenz-Fenster mit `limit`
 * (Historien-Backfill: pullt auch alte Mails UNTERHALB des Cursors).
 */
export async function syncAccount(clientId, accountId, { limit = 30, inbox = true, sent = true, full = false } = {}) {
  const acc = await getAccountWithSecrets(clientId, accountId);
  if (!acc) return { ok: false, reason: "not_found" };
  if (acc.active === false) return { ok: false, reason: "inactive" };
  if (!acc.imap?.host || !acc.imap?.user || !acc.imapPassword) return { ok: false, reason: "imap_not_configured" };

  const client = imapClient(acc);
  let fetched = 0, created = 0, failed = 0;
  try {
    await withTimeout(client.connect(), 20000, "IMAP-Verbindung", () => { try { client.close(); } catch { /* */ } });

    const jobs = [];
    if (inbox) jobs.push({ path: "INBOX", folder: "INBOX", direction: "in" });
    if (sent) {
      const boxes = await client.list().catch(() => []);
      const sentPath = findSentPath(boxes);
      if (sentPath) jobs.push({ path: sentPath, folder: "Sent", direction: "out" });
    }

    for (const job of jobs) {
      const lock = await withTimeout(client.getMailboxLock(job.path), 10000, "IMAP-Postfachsperre", () => { try { client.close(); } catch { /* */ } });
      try {
        const exists = Number(client.mailbox?.exists || 0);
        const uidValidity = client.mailbox?.uidValidity != null ? String(client.mailbox.uidValidity) : null;
        const uidNext = Number(client.mailbox?.uidNext || 0);
        const prior = acc.syncState?.[job.folder];
        const priorUid = Number(prior?.lastUid) || 0;
        // Inkrementell nur bei intaktem Cursor: gleiche UIDVALIDITY + bekannte
        // Obergrenze. Sonst (Erstlauf, Postfach neu aufgesetzt, full) SEED.
        const canIncrement = !full && !!uidValidity && prior?.uidValidity && String(prior.uidValidity) === uidValidity && priorUid > 0;

        if (exists < 1) {
          // Leeres Postfach: Cursor halten, damit ein späteres SEED unnötig bleibt.
          await saveSyncState(clientId, accountId, job.folder, { uidValidity, lastUid: priorUid });
          continue;
        }

        // Schnellpfad: nichts Neues seit dem letzten Sync (kein Fetch nötig).
        if (canIncrement && uidNext && priorUid + 1 >= uidNext) {
          await saveSyncState(clientId, accountId, job.folder, { uidValidity, lastUid: priorUid });
          continue;
        }

        // Range + Modus wählen: inkrementell per UID, sonst Sequenz-Fenster.
        const range = canIncrement ? `${priorUid + 1}:*` : `${Math.max(1, exists - (limit - 1))}:*`;
        const fetchOpts = canIncrement ? { uid: true } : undefined;
        let maxUid = priorUid;

        for await (const message of client.fetch(range, { uid: true, flags: true, source: true }, fetchOpts)) {
          const mUid = Number(message.uid) || 0;
          // UID FETCH "n:*" liefert immer die höchste UID mit, auch wenn keine
          // Mail qualifiziert — schon Gespeichertes überspringen (kein Refetch).
          if (canIncrement && mUid && mUid <= priorUid) continue;
          fetched++;
          // Per-message isolation: one malformed mail must not abort the whole
          // sync. Count it as failed and keep going.
          try {
            const parsed = await simpleParser(message.source);
            const seen = job.direction === "out" ? true : (message.flags?.has?.("\\Seen") ?? false);
            const r = await storeMessage(clientId, acc, { parsed, uid: message.uid, folder: job.folder, direction: job.direction, seen });
            if (r.created) created++;
          } catch (msgErr) {
            failed++;
            console.error(`[mail-sync] ${job.path} uid=${message.uid} skipped:`, msgErr?.message || msgErr);
          }
          if (mUid > maxUid) maxUid = mUid;
        }
        // Cursor fortschreiben (auch nach SEED), damit der nächste Tick inkrementell läuft.
        await saveSyncState(clientId, accountId, job.folder, { uidValidity, lastUid: maxUid });
      } finally {
        lock.release();
      }
    }
    await markSync(clientId, accountId, {});
    return { ok: true, fetched, created, failed };
  } catch (e) {
    const msg = describeImapError(e);
    await markSync(clientId, accountId, { error: msg });
    return { ok: false, reason: "imap_error", error: msg };
  } finally {
    try { await client.logout(); } catch { try { client.close(); } catch { /* */ } }
  }
}

export async function syncAll(clientId, opts = {}) {
  const { listAccounts } = await import("./accounts.js");
  const accounts = await listAccounts(clientId);
  const results = [];
  for (const a of accounts) {
    if (a.active === false || !a.imap?.host) continue;
    results.push({ accountId: a.id, ...(await syncAccount(clientId, a.id, opts)) });
  }
  return { ok: true, results };
}

// --- SMTP ------------------------------------------------------------------

// data:-Bilder im HTML (Logo/Unterschrift/Stempel aus dem Signatur-Editor) fuer
// den VERSAND in CID-Anhaenge umwandeln — Gmail/Outlook zeigen data:-URIs nicht
// an, cid:-referenzierte Inline-Anhaenge dagegen zuverlaessig. Die in Firestore
// gespeicherte Kopie behaelt die data:-URIs (Anzeige in Nadines Gesendet-Ordner).
function inlineImagesToCid(html) {
  if (!html || !/src=["']data:image\//i.test(html)) return { html, attachments: [] };
  const attachments = [];
  let i = 0;
  const out = String(html).replace(
    /src=(["'])data:(image\/[a-z0-9.+-]+);base64,([^"']+)\1/gi,
    (_m, q, mime, b64) => {
      i += 1;
      const cid = `inline-${i}@mas.local`;
      const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
      try {
        attachments.push({
          filename: `inline-${i}.${ext}`,
          content: Buffer.from(b64, "base64"),
          contentType: mime,
          cid,
          contentDisposition: "inline",
        });
      } catch {
        return `src=${q}data:${mime};base64,${b64}${q}`; // defektes base64: unveraendert lassen
      }
      return `src=${q}cid:${cid}${q}`;
    }
  );
  return { html: out, attachments };
}

/**
 * Send a message via an account's SMTP, store an outgoing copy, and return the
 * messageId. In DRY_RUN we skip the network but still persist the outgoing copy,
 * so the whole "Nadine sends -> case updated" loop is testable without a server.
 */
export async function sendMail(clientId, accountId, { to, cc, bcc, subject, text, html, replyToMessageId, attachments } = {}) {
  const acc = await getAccountWithSecrets(clientId, accountId);
  if (!acc) return { ok: false, reason: "not_found" };
  const toList = Array.isArray(to) ? to : (to ? [to] : []);
  if (!toList.length) return { ok: false, reason: "no_recipient" };

  const from = acc.email || acc.smtp?.user;
  const messageId = `<${randomUUID()}@${(from || "mas").split("@")[1] || "mas.local"}>`;
  let info = { messageId };

  // Append the practice e-mail signature (settings.emailSignature) to every
  // outgoing mail — covers Nadine's replies, manual sends and case sends.
  const settings = await getLetterSettings(clientId).catch(() => ({}));
  ({ text, html } = withSignature(text, html, { plain: settings?.emailSignature, htmlSig: settings?.emailSignatureHtml }));

  if (!DRY_RUN) {
    if (!acc.smtp?.host || !acc.smtp?.user || !acc.smtpPassword) {
      return { ok: false, reason: "smtp_not_configured" };
    }
    const transporter = nodemailer.createTransport({
      host: acc.smtp.host,
      port: acc.smtp.port || 587,
      secure: acc.smtp.secure === true,
      auth: { user: acc.smtp.user, pass: acc.smtpPassword },
    });
    try {
      // Eingebettete data:-Bilder nur fuer den Draht in CID-Anhaenge umwandeln;
      // die persistierte Kopie unten nutzt weiterhin das Original-HTML.
      const inline = inlineImagesToCid(html);
      const userAtts = attachments?.length
        ? attachments.map((a) => ({ filename: a.filename || "attachment", content: Buffer.from(a.content, "base64") }))
        : [];
      const allAtts = [...userAtts, ...inline.attachments];
      info = await transporter.sendMail({
        from,
        to: toList.join(", "),
        cc: cc?.length ? (Array.isArray(cc) ? cc.join(", ") : cc) : undefined,
        bcc: bcc?.length ? (Array.isArray(bcc) ? bcc.join(", ") : bcc) : undefined,
        subject,
        text: text || undefined,
        html: inline.html || undefined,
        messageId,
        inReplyTo: replyToMessageId || undefined,
        references: replyToMessageId || undefined,
        attachments: allAtts.length ? allAtts : undefined,
      });
    } catch (smtpErr) {
      // Don't throw — surface a clean failure so the route returns a useful body
      // and no outgoing copy is persisted for a mail that never left.
      console.error(`[mail-send] SMTP failed for ${accountId}:`, smtpErr?.message || smtpErr);
      return { ok: false, reason: "smtp_error", error: describeImapError(smtpErr) };
    }
  }

  // Persist an outgoing copy so it shows in the thread / sent view.
  const stored = await storeMessage(clientId, acc, {
    parsed: {
      messageId: info.messageId || messageId,
      inReplyTo: replyToMessageId || "",
      from: { value: [{ name: acc.label || "", address: from }] },
      to: toList.map((address) => ({ address })),
      cc: (cc || []).map((address) => ({ address })),
      subject,
      text: text || "",
      html: html || "",
      date: new Date(),
      // Auch die gesendete Kopie behält ihre Anhänge (Vorschau im Postausgang).
      attachments: (attachments || []).map((a) => ({
        filename: a.filename || "attachment",
        contentType: a.contentType || "application/octet-stream",
        content: Buffer.from(a.content, "base64"),
      })),
    },
    // "Sent" (nicht mehr "SENT"): derselbe Ordnername, den auch der Server-
    // Gesendet-Sync und der Kontenbaum (folderCounts) verwenden.
    folder: "Sent",
    direction: "out",
    seen: true,
  });

  return { ok: true, messageId: info.messageId || messageId, dryRun: DRY_RUN, storedId: stored.id };
}
