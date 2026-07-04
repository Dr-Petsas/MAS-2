// Gemeinsame Tenant-/Zugriffs-Helfer fuer alle Router (W1.2-Split aus
// server.js, 04.07.2026). Hierher gehoert NUR, was mehrere Router (oder
// Router + Startup) teilen - domaenen-eigene Helfer leben in ihrer
// Router-Datei. Verhalten unveraendert aus server.js uebernommen.
import { assertAppEnabled } from "../entitlements.js";
import { getOperator } from "../clara/sessions.js";
import { getEvent, queryByPatient, resolveItem } from "../brain/eventStore.js";
import { resolvePatientSubject } from "../brain/identity.js";
import { listCases } from "../brain/caseStore.js";
import { TOPIC_LABELS } from "../brain/cases.js";
import { recordCommunication } from "../brain/record.js";
import { upsertSharedContact } from "../brain/addressBook.js";
import { listAccounts } from "../mail/accounts.js";
import { getMessage, linkMessageToCase } from "../mail/store.js";
import { deriveMailSignals } from "../mail/classify.js";
import { practiceFromClient } from "../mail/letter.js";
import { getLetterSettings } from "../mail/letterSettings.js";
import { getLetterheadBuffer } from "../mail/letterhead.js";
import { getLetterAssetBuffer } from "../mail/letterAssets.js";
import { AUTH_ENFORCED } from "../auth.js";


export const DEFAULT_CLIENT_ID = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
export const CLARA_PROFILE_ID = (process.env.CLARA_PROFILE_ID || "clara_meddent").trim();
export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4000").trim();

// Tenant context. A logged-in platform user is BOUND to the tenant in their
// verified token (claims.clientId) and cannot read another practice by changing
// a header. Superusers and trusted service/anon callers may target a tenant
// explicitly via X-Client-Id / query / body. Identity comes from auth.js — never
// from spoofable headers.
export function resolveClientId(req) {
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
export function resolveUser(req) {
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
export async function mailAccess(clientId, req) {
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

// Wer hat gehandelt? Für Audit-Spuren (Versand, Frist-Dokumentation): explizit
// mitgegebener Name > eingeloggter Benutzer (Name/E-Mail) > Fallback ("Nadine").
export function actorName(req, fallback = "Nadine") {
  const explicit = String(req.body?.by || "").trim();
  if (explicit && explicit !== "Nadine") return explicit;
  return req.auth?.name || req.auth?.email || explicit || fallback;
}

// Darf der Aufrufer die KONFIGURATION eines Kontos ändern/löschen?
//   private ⇒ nur der Inhaber. praxis ⇒ nur Admins.
export async function canManageAccount(req, account) {
  const a = req.auth || {};
  if (a.kind !== "user") return true; // Service/Dev
  if (!account) return false;
  if (account.visibility === "private") return !!a.userId && account.ownerUserId === a.userId;
  return !!a.isAdmin;
}

// Guard a single message against the caller's mailbox scope. Returns true when
// the caller may touch it (admin, or the message belongs to an allowed mailbox).
export function canSeeMessage(access, msg) {
  if (!access || access.allowedIds == null) return true;
  return !!msg && access.allowedIds.has(msg.accountId);
}

// Postfach-Scope für die SPRACH-Tools: Das gekoppelte Handy gehört EINEM
// Operator. Dessen Sicht = eigene Postfächer (ownerUserId === Operator-User)
// plus geteilte Praxis-Postfächer (ohne Owner) — analog zu mailAccess, nur
// dass die Identität hier aus der Geräte-Kopplung kommt, nicht aus dem Login.
// Liefert undefined (= alles) wenn kein Operator bekannt ist oder ohnehin
// keine Postfächer einem Besitzer zugeordnet sind.
export async function operatorMailAccountIds(clientId) {
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


// ===========================================================================
// QM (Julia) — Anforderungs-Engine, Bücher/Doku, Jobs/Kalender, Personal, Push
// und Claras read-only Auskunft. Alle Daten unter clients/{clientId}/mas_qm_*.
// ===========================================================================

// Kleiner Wrapper: Tenant + Clara-Entitlement, dann handler(clientId, req, res).
export function qmRoute(handler) {
  return async (req, res) => {
    try {
      const clientId = resolveClientId(req);
      if (!clientId) return res.status(400).json({ error: "client_id_required" });
      if (!(await assertAppEnabled(clientId, "clara"))) {
        return res.status(403).json({ error: "clara_not_entitled", clientId });
      }
      await handler(clientId, req, res);
    } catch (e) {
      res.status(400).json({ error: String(e?.message || e) });
    }
  };
}


// ---------------------------------------------------------------------------
// Frist-Dokumentation beim Antworten.
// Geht eine selbst geschriebene Antwort auf ein Schreiben mit erkannter Frist
// (oder ein kritisches Ereignis) raus, wird im Gedächtnis festgehalten, WANN
// und durch WEN reagiert wurde — z. B. "Frist 20.06.2026 eingehalten —
// beantwortet am 12.06.2026 durch Dr. Petsas". Das offene Eingangs-Ereignis
// wird dabei als erledigt markiert (Audit-Event inklusive), sodass rote Liste
// und Fristenliste sich selbst aufräumen und die Einhaltung belegbar bleibt.
// ---------------------------------------------------------------------------
export const fmtDay = (ms) =>
  new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

// Fristen zählen als ganze Tage: eine Antwort am Fristtag selbst ist pünktlich.
export function deadlineKept(deadlineMs, sentTs) {
  const end = new Date(deadlineMs);
  end.setHours(23, 59, 59, 999);
  return sentTs <= end.getTime();
}

export function complianceNote(ev, { by = "Nadine", sentTs = Date.now() } = {}) {
  if (!ev?.deadlineMs) return `Per E-Mail beantwortet am ${fmtDay(sentTs)} durch ${by}`;
  return deadlineKept(ev.deadlineMs, sentTs)
    ? `Frist ${fmtDay(ev.deadlineMs)} eingehalten — beantwortet am ${fmtDay(sentTs)} durch ${by}`
    : `Beantwortet am ${fmtDay(sentTs)} durch ${by} — Frist ${fmtDay(ev.deadlineMs)} war bereits verstrichen`;
}

/**
 * Dokumentiert die Antwort auf ein Eingangs-Ereignis und erledigt es, wenn es
 * offen + fristbehaftet/kritisch war. Liefert einen Zusatz für die Zusammen-
 * fassung des Ausgangs-Events (leer, wenn keine Frist bekannt). Best-effort.
 */
export async function resolveAnsweredEvent(clientId, inboundEventId, { by = "Nadine", sentTs = Date.now() } = {}) {
  const ev = await getEvent(clientId, inboundEventId).catch(() => null);
  if (!ev) return { suffix: "", resolved: false };
  const suffix = ev.deadlineMs ? ` — ${complianceNote(ev, { by, sentTs })}` : "";
  let resolved = false;
  if (ev.status === "open" && (ev.deadlineMs || ev.signals?.critical)) {
    const r = await resolveItem(clientId, ev.id, { actor: by, note: complianceNote(ev, { by, sentTs }), ts: sentTs }).catch(() => null);
    resolved = !!r?.ok;
  }
  return { suffix, resolved };
}

/**
 * Log an outbound mail into the shared brain. When it answers an inbound message
 * (replyToMessageId) we reuse that mail's sender identity + classification so the
 * exchange threads onto the RIGHT patient/topic; otherwise we resolve the primary
 * recipient by e-mail. Threads a case for replies and for patient recipients;
 * non-patient one-off sends are logged append-only (no junk ticket).
 * `by` = wer wirklich gesendet hat (Mensch oder Nadine) — für die Audit-Spur.
 */
export async function logOutboundMail(clientId, { storedId, body, by = "Nadine" }) {
  const clip = (s, n) => { const t = String(s || "").trim(); return t.length > n ? t.slice(0, n) + " …" : t; };
  const toList = Array.isArray(body.to) ? body.to : (body.to ? [body.to] : []);
  const toAddr = String(toList[0] || "").trim();
  const replyToMessageId = String(body.replyToMessageId || "").trim();

  let subject = { name: "", matchStatus: "unmatched", matchMethod: null };
  let isPatient = false;
  let counterpartyName = toAddr || "Empfänger";
  let counterpartyRef = toAddr || null;
  let signals = deriveMailSignals({ subject: body.subject, text: body.text || body.html || "" });

  let complianceSuffix = "";
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
    // Frist-Dokumentation: das beantwortete Eingangs-Ereignis erledigen und die
    // Einhaltung (oder Überschreitung) der Frist im Ausgangs-Event festhalten.
    const comp = await resolveAnsweredEvent(clientId, `mail-in:${replyToMessageId}`, { by });
    complianceSuffix = comp.suffix;
  } else if (toAddr) {
    const subj = await resolvePatientSubject(clientId, { email: toAddr }).catch(() => null);
    if (subj?.patientId) { subject = { patientId: subj.patientId, name: subj.name || toAddr, matchStatus: "matched", matchMethod: subj.matchMethod || "email" }; isPatient = true; counterpartyName = subj.name || toAddr; }
  }

  const summary = `E-Mail gesendet${by && by !== "Nadine" ? ` durch ${by}` : ""} an ${counterpartyName} — Betreff „${body.subject || "(kein Betreff)"}“: ${clip(body.text || body.html, 600) || "(kein Text)"}${complianceSuffix}`;
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
  }, { by, link });

  // Cross-link the sent mail to its case so the thread stays retrievable.
  if (result?.caseId && storedId) {
    try { await linkMessageToCase(clientId, storedId, result.caseId); } catch { /* non-blocking */ }
  }

  // Wem wir schreiben, den kennen wir: Empfänger ins geteilte Adressbuch.
  if (toAddr && toAddr.includes("@")) {
    await upsertSharedContact(clientId, {
      name: counterpartyName !== toAddr ? counterpartyName : "",
      email: toAddr, source: "nadine_mail_out", subject: body.subject || "",
    });
  }

  return result;
}


// Resolve the practice letterhead: explicit settings doc, falling back to the
// tenant's client doc. Shared by every letter route so the look is consistent.
export async function resolveLetterhead(clientId) {
  const settings = await getLetterSettings(clientId);
  const hasAny = Object.values(settings).some((v) => String(v || "").trim());
  if (hasAny) return settings;
  const practice = await practiceFromClient(clientId);
  return { ...settings, senderName: practice.name, senderAddress: practice.address, contactBlock: practice.contact };
}

// Everything buildLetterPdf needs: typeset settings + (if "asset" mode) the
// uploaded letterhead bytes to use as background/overlay.
export async function renderArgs(clientId) {
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


// ============================================================================
// Jawdropper (15.06.2026, Chef-Wunsch):
//   1) Patienten-Zeitstrahl auf Zuruf  -> /tools/patient-timeline
//   2) Sprach-Notiz wird zum Vorgang    -> /tools/remember-note
//   3) Verzugs-Retter (Lagebild als Push) -> /tools/running-late
// Alle drei docken an die bestehende Infrastruktur an (Shared Memory: events +
// cases, Patientensuche, Push via notifyOperator) — nichts Neues erfunden.
// ============================================================================

// Gesprochene Zeitspanne ("heute"/"gestern"/"vor 3 Tagen") fuer den Zeitstrahl.
export function agoLabel(ms) {
  if (!ms) return "";
  const dayOf = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  const diff = Math.round((Date.parse(`${dayOf(Date.now())}T12:00:00Z`) - Date.parse(`${dayOf(ms)}T12:00:00Z`)) / 86400000);
  if (diff <= 0) return "heute";
  if (diff === 1) return "gestern";
  if (diff === 2) return "vorgestern";
  if (diff <= 14) return `vor ${diff} Tagen`;
  if (diff <= 60) return `vor ${Math.round(diff / 7)} Wochen`;
  return `vor ${Math.round(diff / 30)} Monaten`;
}

// Stunde/Minute in Berliner Zeit robust extrahieren. WICHTIG: de-DE mit NUR
// `hour` liefert "11 Uhr" -> Number(...) = NaN. Daher en-GB + formatToParts.
export function berlinHM(ms) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value || "0");
  return { h, m };
}

// Uhrzeit gesprochen ("14 Uhr 30") in Berliner Zeit.
export function spokenClockBerlin(ms) {
  const { h, m } = berlinHM(ms);
  return m ? `${h} Uhr ${m}` : `${h} Uhr`;
}

// Uhrzeit als HH:MM (fuer den Push-Text aufs Handy — Ziffern lesen sich dort
// besser als ausgesprochene Zeiten).
export function clockHHMM(ms) {
  const { h, m } = berlinHM(ms);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Den kompletten Spur-Verlauf eines Patienten aus dem Shared Memory sprechen:
// offene Vorgaenge zuerst (das Wichtigste), dann die juengsten Ereignisse
// (Anruf/E-Mail/Termin) in Zeitreihenfolge. Best-effort — jede Quelle darf
// leer sein.
export async function buildSpokenPatientTimeline(clientId, p) {
  const pid = String(p?.id || "").trim();
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const who = `${p?.firstName || ""} ${p?.lastName || ""}`.trim() || "der Patient";

  const [events, activeCases] = await Promise.all([
    pid ? queryByPatient(clientId, pid, 40).catch(() => []) : [],
    pid ? listCases(clientId, { patientId: pid, activeOnly: true, limit: 10 }).catch(() => []) : [],
  ]);

  if (!events.length && !activeCases.length) {
    return `Zu ${who} habe ich im Praxisgedächtnis noch keine Einträge.`;
  }

  const parts = [`Zu ${who} im Praxisgedächtnis:`];
  const norm = (t) => String(t || "").replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, who).replace(/\s+/g, " ").trim();
  const seen = []; // bereits gesprochene Fakten — gegen Echo im Verlauf

  // 1) Offene Vorgaenge — was noch nicht erledigt ist (das Wichtigste zuerst).
  for (const c of activeCases.slice(0, 3)) {
    const updates = Array.isArray(c.updates) ? c.updates : [];
    const lastContact = [...updates].reverse().find((u) => u.kind === "contact") || updates[updates.length - 1];
    const lastMs = c.lastContactAt?.toMillis?.() ?? (typeof c.lastContactAt === "number" ? c.lastContactAt : 0);
    let line = `Offener Vorgang, Thema ${TOPIC_LABELS[c.topic] || c.topic || "Allgemein"}`;
    const when = agoLabel(lastMs || lastContact?.ts);
    if (when) line += ` (letzter Kontakt ${when})`;
    if (c.assignee) line += `, liegt bei ${c.assignee}`;
    const snippet = norm(lastContact?.text);
    if (snippet) {
      line += `: ${snippet.length > 160 ? `${snippet.slice(0, 157)}...` : snippet}`;
      seen.push(snippet.toLowerCase());
    }
    parts.push(`${line}.`);
  }

  // 2) Juengste Ereignisse als Verlauf — aber NICHT doppeln, was die offenen
  // Vorgaenge oben schon gesagt haben (Echo vermeiden). Neueste zuerst.
  let told = 0;
  for (const e of events) {
    if (told >= 4) break;
    const sum = norm(e.summary);
    if (!sum) continue;
    const low = sum.toLowerCase();
    if (seen.some((s) => s.includes(low) || low.includes(s))) continue;
    const when = agoLabel(e.ts);
    parts.push(`${when ? `${cap(when)}: ` : ""}${sum}`);
    seen.push(low);
    told++;
  }

  if (parts.length === 1) parts.push("nichts Offenes, und keine nennenswerten Einträge.");
  return parts.join(" ");
}
