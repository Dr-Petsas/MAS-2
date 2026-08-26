import crypto from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { appendEvent } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";
import { upsertSharedContact } from "../brain/addressBook.js";
import { lisaDisclosurePrefix } from "../brain/aiDisclosure.js";
import { resolveOutboundRedirect } from "../clara/testRedirect.js";
import { ladeLisaIdentitaet, identitaetsRahmen } from "./identitaet.js";
import { summarizeForSpeech } from "../clara/summarize.js";
import { getOperator } from "../clara/sessions.js";
import { notifyOperator } from "../clara/devices.js";
import { getAssistantName } from "../shared/rufname.js";
import { log } from "../log.js";

// ============================================================================
// Lisa — outbound telephonist (SMS + phone calls), delegated by Clara.
//
// Clara (local LLM) understands the spoken order and extracts phone + content;
// this module only EXECUTES deterministically:
//   - SMS:   Twilio Messages API (alphanumeric sender, outbound-only)
//   - Call:  ElevenLabs ConvAI outbound call on Lisa's practice number.
//            The concrete instruction travels as `task_prompt` dynamic
//            variable into Lisa's agent prompt.
//
// Every delegation is written to the shared brain immediately (lisa_sms /
// lisa_call, direction out), and finished calls are finalised by a poller that
// fetches the transcript and appends an outcome observation. Tasks live in
// clients/{clientId}/mas_lisa_tasks — tenant-isolated, additive.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const TASKS = "mas_lisa_tasks";
// Basis-URL fuer oeffentliche Seiten (Lisa-Ergebnis-Push): gleiche Quelle wie
// slotClaim.js/_shared.js — Cloudflare-Tunnel bzw. lokaler Port.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4000").trim().replace(/\/+$/, "");

function tasksCol(clientId) {
  return masCollection(clientId, TASKS);
}

// --- L4 Anruf-Zeitfenster (Chef 29.07.2026) ---------------------------------
// Lisa rief im Livetest um 23:17-23:51 Uhr Patienten an. Im Echtbetrieb ein
// No-Go: Anrufe werden nur im Fenster gewaehlt (Standard 09-19 Uhr Berlin,
// konfigurierbar per MAS_LISA_CALL_START/_END). Ausserhalb wird der Anruf
// EINGEPLANT (Task-Status "scheduled") und vom Sweep beim naechsten
// Fensterstart gewaehlt. Ein aktiver Test-Redirect (Testlabor/Livetest aufs
// eigene Handy) uebersteuert das Fenster — Testlaeufe bleiben sofort moeglich.
const TZ_BERLIN = "Europe/Berlin";
export const CALL_WINDOW_START = Math.max(0, Math.min(23,
  Number(process.env.MAS_LISA_CALL_START ?? 9)));
export const CALL_WINDOW_END = Math.max(CALL_WINDOW_START + 1, Math.min(24,
  Number(process.env.MAS_LISA_CALL_END ?? 19)));

function berlinHourOf(ms = Date.now()) {
  // de-DE haengt "Uhr" an ("10 Uhr" -> NaN); deshalb Ziffern herausziehen.
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ_BERLIN, hour: "2-digit", hour12: false,
  }).format(new Date(ms));
  return Number((t.match(/\d+/) || ["-1"])[0]) % 24;
}

/** True, wenn zum Zeitpunkt `ms` gewaehlt werden darf (rein, testbar). */
export function imAnrufFenster(ms = Date.now()) {
  const h = berlinHourOf(ms);
  return h >= CALL_WINDOW_START && h < CALL_WINDOW_END;
}

/** Naechster Fensterstart (ms) ab `ms` — heute frueh oder morgen frueh. */
export function naechsterFensterStartMs(ms = Date.now()) {
  const fmtTag = (t) => new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_BERLIN, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(t));
  const h = berlinHourOf(ms);
  const tag = h < CALL_WINDOW_START ? fmtTag(ms) : fmtTag(ms + 86_400_000);
  // Sommer-/Winterzeit: beide Offsets probieren, der richtige ergibt die
  // gewuenschte Berlin-Stunde.
  for (const off of ["+02:00", "+01:00"]) {
    const t = Date.parse(`${tag}T${String(CALL_WINDOW_START).padStart(2, "0")}:00:00${off}`);
    if (Number.isFinite(t) && berlinHourOf(t) === CALL_WINDOW_START) return t;
  }
  return Date.parse(`${tag}T${String(CALL_WINDOW_START).padStart(2, "0")}:00:00+02:00`);
}

function env(name) {
  return (process.env[name] || "").trim();
}

function clip(s, n) {
  const v = String(s || "").trim();
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
}

/**
 * Normalise a spoken/typed German phone number to E.164.
 * "0177 600 46 00" -> "+491776004600", "0049…" -> "+49…", "+49…" stays.
 * Returns null when the result does not look like a dialable number.
 */
export function normalizePhoneE164(raw, defaultCc = "+49") {
  let v = String(raw || "").replace(/[^\d+]/g, "");
  if (!v) return null;
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (!v.startsWith("+")) {
    if (v.startsWith("0")) v = defaultCc + v.slice(1);
    else v = defaultCc + v;
  }
  // "+" followed by 8..15 digits (E.164)
  if (!/^\+\d{8,15}$/.test(v)) return null;
  return v;
}

/**
 * Super-GAU 14.08.2026 (Haila El-Otmani): Das LLM darf KEINE Nummer erfinden.
 * Steht ein Datensatz mit Nummer fest, wird NUR diese gewählt — eine andere
 * vom Modell gelieferte Nummer wird verworfen. Eine freie Nummer gilt nur,
 * wenn der Chef sie selbst gesagt hat und kein Datensatz existiert.
 */
export function chooseDialPhone({ recordPhone = "", claimedPhone = "", allowClaimed = false } = {}) {
  const rec = normalizePhoneE164(recordPhone) || "";
  const claim = normalizePhoneE164(claimedPhone) || "";
  if (rec) {
    return { phone: rec, source: "record", rejectedClaim: !!(claim && claim !== rec) };
  }
  if (allowClaimed && claim) return { phone: claim, source: "spoken", rejectedClaim: false };
  return { phone: "", source: claim ? "rejected_llm" : "none", rejectedClaim: !!claim };
}

/**
 * Wann darf eine vom Modell gelieferte Nummer überhaupt gelten?
 * Nie, wenn ein Name im Spiel ist oder die Suche noch mehrere Treffer hat.
 * Live 14.08.2026: uneindeutig Haila/Heldmann + phone=01776004600 (Chef).
 */
export function decideDelegationDial({
  recordPhone = "",
  claimedPhone = "",
  hasName = false,
  candidateCount = 0,
  selected = false,
} = {}) {
  if (!selected && candidateCount > 1) {
    return {
      phone: "",
      source: "ambiguous",
      rejectedClaim: !!normalizePhoneE164(claimedPhone),
    };
  }
  const allowClaimed = !selected && !hasName && candidateCount === 0;
  return chooseDialPhone({ recordPhone, claimedPhone, allowClaimed });
}

/** Bestätigung gilt nur, wenn derselbe Auftrag schon einmal vorgelesen wurde. */
export function canConfirmLisaCall(pending, now = Date.now()) {
  if (!pending || typeof pending !== "object") return false;
  if (!normalizePhoneE164(pending.phone)) return false;
  if (!String(pending.instruction || "").trim()) return false;
  const at = Number(pending.at) || 0;
  if (!at || now - at > 10 * 60 * 1000) return false;
  return true;
}

export function nameTokensOverlap(spoken, recordName) {
  const norm = (s) => String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();
  const a = norm(spoken).split(/\s+/).filter((t) => t.length >= 3);
  const b = norm(recordName).split(/\s+/).filter((t) => t.length >= 3);
  if (!a.length || !b.length) return false;
  return a.some((t) => b.some((u) => u === t || u.includes(t) || t.includes(u)));
}

/** Erste wählbare Nummer aus einem Patienten-/Kontakt-Datensatz. */
export function phoneFromRecord(rec) {
  if (!rec || typeof rec !== "object") return "";
  const list = [
    rec.mobilePhoneNumber, rec.mobile, rec.phone, rec.phoneNumber,
    rec.tel, rec.handy,
  ];
  if (Array.isArray(rec.phones)) list.push(...rec.phones);
  for (const v of list) {
    const n = normalizePhoneE164(v);
    if (n) return n;
  }
  return "";
}

export function displayNameOf(rec) {
  if (!rec || typeof rec !== "object") return "";
  return String(rec.name || rec.contactName || `${rec.firstName || ""} ${rec.lastName || ""}`.trim()).trim();
}

// ----------------------------------------------------------------------------
// Idempotency guard (2026-06-10): the voice pipeline can dispatch the SAME
// spoken order twice (duplicate turn / barge-in chaos) -- a real SMS went out
// twice in a demo call. The brain may forget, the phone bill doesn't: identical
// SMS/call delegations within this window are suppressed server-side.
// ----------------------------------------------------------------------------
const DEDUPE_COL = "mas_lisa_dedupe";
const DEDUPE_WINDOW_MS = 3 * 60 * 1000;

/**
 * True when the same delegation key fired within DEDUPE_WINDOW_MS. Runs as a
 * transaction on a deterministic doc id so even two PARALLEL requests cannot
 * both pass. Fails open: a dedupe-store error never blocks the action.
 */
async function isDuplicateDelegation(clientId, kind, ...keyParts) {
  const hash = crypto.createHash("sha1").update(keyParts.join("|")).digest("hex").slice(0, 24);
  const ref = masCollection(clientId, DEDUPE_COL).doc(`${kind}_${hash}`);
  try {
    return await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const prev = snap.exists ? Number(snap.data()?.ts || 0) : 0;
      if (now - prev < DEDUPE_WINDOW_MS) return true;
      tx.set(ref, { ts: now, kind });
      return false;
    });
  } catch (e) {
    log.warn("lisa.dedupe_check_failed", { clientId, error: String(e?.message || e) });
    return false;
  }
}

export function smsConfigured() {
  return !!(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("LISA_SMS_SENDER"));
}

export function callConfigured() {
  return !!(env("ELEVENLABS_API_KEY") && env("LISA_AGENT_ID") && env("LISA_PHONE_NUMBER_ID"));
}

/** Twilio-Call-SID + Lisa-From aus der ElevenLabs-Conversation (auch nachtraeglich). */
export function extractPhoneCallMeta(conv) {
  const pc = conv?.metadata?.phone_call || conv?.phone_call || {};
  const callSid = String(
    pc.call_sid || pc.callSid || conv?.call_sid || conv?.callSid || "",
  ).trim();
  const voiceFrom = normalizePhoneE164(pc.agent_number || pc.agentNumber || "");
  return { callSid: callSid || "", voiceFrom: voiceFrom || "" };
}

async function lisaVoiceFrom() {
  const envFrom = normalizePhoneE164(env("TWILIO_VOICE_FROM") || env("LISA_VOICE_FROM"));
  if (envFrom) return envFrom;
  const id = env("LISA_PHONE_NUMBER_ID");
  const key = env("ELEVENLABS_API_KEY");
  if (!id || !key) return "";
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/phone-numbers/${encodeURIComponent(id)}`, {
      headers: { "xi-api-key": key },
    });
    const data = await r.json().catch(() => ({}));
    return normalizePhoneE164(data.phone_number || data.number || data.phoneNumber || "") || "";
  } catch {
    return "";
  }
}

// ----------------------------------------------------------------------------
// SMS
// ----------------------------------------------------------------------------

/**
 * Send one SMS via Twilio. Sender is alphanumeric (no reply channel — outbound
 * notifications only, which is exactly Lisa's job).
 *
 * @param {{to:string, body:string, from?:string}} input `from` = Absendername
 *        der Praxis; ohne Angabe die globale Umgebungsvariable.
 * @returns {Promise<{ok:boolean, sid?:string, error?:string, from?:string}>}
 */
async function twilioSendEinmal({ to, body, from }) {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams({ To: to, From: from, Body: body });

  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { ok: false, error: data?.message || `twilio_http_${r.status}`, from };
  }
  return { ok: true, sid: data?.sid || null, from };
}

async function twilioSendSms({ to, body, from }) {
  const global = env("LISA_SMS_SENDER");
  const wunsch = String(from || "").trim() || global;
  const erst = await twilioSendEinmal({ to, body, from: wunsch });
  if (erst.ok || !global || wunsch === global) return erst;
  // NETZ (18.08.2026): Der Absendername der Praxis ist neu; ob Twilio einen
  // frei gewaehlten alphanumerischen Absender annimmt, haengt am Konto und am
  // Zielland. Wird er abgelehnt, darf die Nachricht NICHT verloren gehen —
  // dann geht sie wie bisher unter dem globalen Absender raus. Schlechter
  // Absender ist ein Schoenheitsfehler, eine nicht angekommene Terminabsage
  // ist ein Praxisproblem.
  log.warn("lisa.sms.absender_abgelehnt", { to, absender: wunsch, error: erst.error });
  return twilioSendEinmal({ to, body, from: global });
}

/**
 * Lisa sends an SMS, ordered by Clara/the team. Validates, sends, records the
 * fact in the shared brain and in mas_lisa_tasks (audit).
 *
 * @param {string} clientId
 * @param {{phone:string, message:string, recipientName?:string, by?:string}} input
 * @returns {Promise<{ok:boolean, message:string, taskId?:string}>} `message` is speakable.
 */
export async function lisaSendSms(clientId, { phone, message, recipientName, by, absender } = {}) {
  if (!smsConfigured()) {
    return { ok: false, message: "SMS-Versand ist nicht konfiguriert." };
  }
  // Testlabor (W-LABOR WP6) + Livetest-Fenster (28.07.2026): Laeuft der Aufruf
  // in einem Testlauf ODER im befristeten Livetest des Mandanten, geht die SMS
  // an den hinterlegten Testpatienten statt an den echten. Der Haken sitzt hier
  // und nicht in der Route, weil auch recallCoach und absencePlanner hier
  // hereinlaufen — genau die indirekten Wege, die ein Routen-Haken uebersieht.
  const redirected = await resolveOutboundRedirect(clientId, { phone, text: message, recipientName });
  if (redirected) {
    log.warn("lisa.sms.test_redirect", {
      clientId, from: redirected.originalPhone, to: redirected.phone, mode: redirected.mode,
    });
    phone = redirected.phone;
    message = redirected.text;
    recipientName = redirected.recipientName;
  }
  const to = normalizePhoneE164(phone);
  if (!to) return { ok: false, message: "Die Telefonnummer habe ich nicht verstanden. Bitte noch einmal nennen." };
  // Umgeleitete Test-SMS tragen den [TESTLAUF]-Vorspann ZUSAETZLICH zum
  // regulaeren Inhalt — mit hartem 480er-Clip wuerde dann ausgerechnet der
  // Zusage-Link am Ende abgeschnitten. Nur im Testfall mehr Platz geben.
  const body = clip(message, redirected ? 600 : 480);
  if (!body) return { ok: false, message: "Was soll in der SMS stehen?" };

  const name = String(recipientName || "").trim();

  if (await isDuplicateDelegation(clientId, "sms", to, body)) {
    log.warn("lisa.sms.duplicate_suppressed", { clientId, to });
    return { ok: true, message: `Die SMS an ${name || to} wurde bereits gesendet — ich schicke sie nicht doppelt.` };
  }

  const taskRef = tasksCol(clientId).doc();
  const now = Date.now();

  // ABSENDER = PRAXISNAME (Chef 18.08.2026). Vorher trug jede Lisa-SMS den
  // globalen Absender aus der Umgebung; auf dem Handy des Patienten stand damit
  // ein fremder Name, obwohl im Text "hier ist <Praxis>" steht. Quelle ist die
  // Einstellung der Praxis selbst (siehe identitaet.js), sonst aus dem
  // Praxisnamen abgeleitet. `absender` uebersteuert: die Erlebnis-Demo kennt die
  // Praxis des Besuchers, bevor es zu ihr einen Mandanten gibt.
  const ident = absender ? null : await ladeLisaIdentitaet(clientId).catch(() => null);

  const send = await twilioSendSms({ to, body, from: absender || ident?.absender });
  if (!send.ok) {
    log.warn("lisa.sms.failed", { clientId, error: send.error });
    return { ok: false, message: "Die SMS konnte nicht gesendet werden. Bitte später erneut versuchen." };
  }

  await taskRef.set({
    id: taskRef.id,
    kind: "sms",
    status: "done",
    phone: to,
    contactName: name || null,
    body,
    providerSid: send.sid || null,
    senderName: send.from || null,
    assignedBy: by || "Team",
    createdAt: FieldValue.serverTimestamp(),
    ts: now,
  });

  try {
    await appendEvent(clientId, {
      channel: CHANNELS.LISA_SMS,
      direction: DIRECTIONS.OUT,
      type: EVENT_TYPES.INTERACTION,
      // ref = Rufnummer: darüber findet der Rückrufer-Kontext (Bianca) das
      // Event wieder, wenn die Person zurückruft.
      counterparty: { kind: "unknown", name: name || to, ref: to },
      subject: { name },
      summary: `Lisa hat im Auftrag von ${by || "dem Team"} eine SMS an ${name || to} gesendet: "${body}"`,
      payloadRef: { kind: "lisa_task", id: taskRef.id },
      extractor: "lisa@outbound",
      tags: ["lisa", "sms"],
    });
  } catch (e) {
    log.warn("lisa.sms.brain_write_failed", { clientId, error: String(e?.message || e) });
  }
  await upsertSharedContact(clientId, { name, phone: to, source: "lisa_sms" });

  const spokenTo = name ? `${name}` : `die Nummer ${to.replace("+49", "0")}`;
  return {
    ok: true,
    taskId: taskRef.id,
    phone: to,
    contactName: name,
    body,
    message: `Erledigt — die SMS an ${spokenTo} ist raus.`,
  };
}

// ----------------------------------------------------------------------------
// Outbound call (ElevenLabs ConvAI agent "Lisa" on the practice Twilio number)
// ----------------------------------------------------------------------------

async function elevenOutboundCall({ to, dynamicVariables }) {
  const r = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound_call", {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": env("ELEVENLABS_API_KEY") },
    body: JSON.stringify({
      agent_id: env("LISA_AGENT_ID"),
      agent_phone_number_id: env("LISA_PHONE_NUMBER_ID"),
      to_number: to,
      conversation_initiation_client_data: { dynamic_variables: dynamicVariables },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { ok: false, error: data?.detail?.message || data?.detail || `elevenlabs_http_${r.status}` };
  }
  const phone = data?.phone_call || data?.phoneCall || data?.metadata?.phone_call || {};
  return {
    ok: true,
    conversationId: data?.conversation_id || data?.conversationId || null,
    callSid: data?.callSid || data?.call_sid || data?.twilio_call_sid
      || phone.call_sid || phone.callSid || null,
  };
}

async function elevenGetConversation(conversationId) {
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    headers: { "xi-api-key": env("ELEVENLABS_API_KEY") },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail?.message || `elevenlabs_http_${r.status}`);
  return data;
}

/**
 * Delegate an outbound call to Lisa. The spoken instruction ("sag ihm, dass er
 * 20 Minuten später drankommt") goes verbatim into Lisa's agent prompt as
 * task_prompt. One active call per number (guard against double delegation).
 *
 * bookingContext (optional, W-OUTREACH-2): hängt den Kalender-Kontext an den
 * Task ({patientId, patientName, visitMotiveId, visitMotiveName, calendarId,
 * calendarName, caseId, slotIso}). NUR mit diesem Kontext dürfen Lisas
 * Kalender-Webhook-Tools (offer_slots/book_slot) für diesen Anruf buchen.
 *
 * @param {string} clientId
 * @param {{phone:string, instruction:string, contactName?:string, by?:string, callLanguage?:string, bookingContext?:object}} input
 * @returns {Promise<{ok:boolean, message:string, taskId?:string}>}
 */
// 27.07.2026 (Live 19:57): Auftrag war "Es ist gleich 20 Uhr." — Lisa sagte am
// Telefon stattdessen wortgleich das TERMIN-BEISPIEL aus ihrem Agenten-Prompt
// ("Ich rufe an, weil wir Ihren Termin gerne vorverlegen würden ..."). Ursache:
// der Agenten-Prompt verlangt 3-7 ausformulierte Sätze und ein konkretes
// Termin-Verb; ein kurzer, termin-freier Auftrag bietet dafür keinen Stoff, also
// griff das Modell zum naechstliegenden Vorbild. Termin-freie Auftraege bekommen
// deshalb einen ausdruecklichen Rahmen mit. Recall-/Termin-Auftraege (die die
// Terminlogik brauchen) bleiben unberuehrt.
const TERMIN_WORT_RE =
  /\b(termin\w*|verschieb\w*|vorverleg\w*|verleg\w*|absag\w*|abgesagt|storn\w*|recall\w*|kontrolle|prophylaxe|nachsorge|buch\w*|umbuch\w*|erinner\w*|slot\w*|sprechstunde\w*|zahnreinigung)\b/i;

export function rahmeAuftrag(prompt) {
  const text = String(prompt || "").trim();
  if (!text || TERMIN_WORT_RE.test(text)) return text;
  // Die Regel steht als Regieanweisung DAHINTER und ist ausdruecklich nicht
  // zum Vorlesen: ohne diesen Hinweis sprach Lisa im Test die Regel selbst
  // aus ("eine Information, die nichts mit einem Termin zu tun hat") statt der
  // Nachricht.
  return `${text}

[Regieanweisung, NICHT vorlesen und NICHT erwaehnen: Dieser Anruf hat nichts `
    + `mit Terminen zu tun. Sage in eigenen Worten genau die Nachricht, die oben `
    + `steht. Frage NICHT nach Terminwuenschen, biete KEINEN Termin an, nenne `
    + `keinen Terminanlass. Eine kurze Nachricht darf in ein bis zwei Saetzen `
    + `erledigt sein. Fragt der Angerufene nach dem WARUM und die Nachricht `
    + `oben nennt keinen Grund: sage ehrlich, dass dir dazu keine Einzelheiten `
    + `vorliegen, und biete an, dass die Praxis zurueckruft — niemals mauern `
    + `oder einen Grund erfinden.]`;
}

export async function lisaStartCall(clientId, { phone, instruction, contactName, by, callLanguage, bookingContext, taskId, identitaet, sofort } = {}) {
  if (!callConfigured()) {
    return { ok: false, message: "Outbound-Anrufe sind nicht konfiguriert." };
  }
  // Testlabor (W-LABOR WP6) + Livetest-Fenster — siehe lisaSendSms. Der
  // Testempfaenger hoert am Anfang, dass es ein Testlauf ist, und fuer wen der
  // Anruf gedacht war.
  const redirected = await resolveOutboundRedirect(clientId, { phone, text: instruction, recipientName: contactName });
  if (redirected) {
    log.warn("lisa.call.test_redirect", {
      clientId, from: redirected.originalPhone, to: redirected.phone, mode: redirected.mode,
    });
    phone = redirected.phone;
    instruction = redirected.text;
    contactName = redirected.recipientName;
    // Bucht Lisa in diesem Gespraech live (book_slot), muss der Termin auf den
    // TESTPATIENTEN laufen — nie auf den echten Patienten, der von dem Test
    // nichts weiss. Der Fall-Bezug (caseId) bleibt erhalten.
    if (bookingContext && redirected.target?.patientId) {
      bookingContext = {
        ...bookingContext,
        patientId: redirected.target.patientId,
        patientName: redirected.target.name || "Testpatient",
        testRedirect: true,
      };
    }
  }
  const to = normalizePhoneE164(phone);
  if (!to) return { ok: false, message: "Die Telefonnummer habe ich nicht verstanden. Bitte noch einmal nennen." };
  // 2200: motivspezifische Recall-Instruktionen (W-OUTREACH, outreachTemplates
  // CALL_INSTRUCTION_LIMIT=2100) brauchen Platz für Anlass + Hintergrund +
  // Sicherheits- + Live-Buchungs-Regeln. ElevenLabs-Dynamic-Vars vertragen das.
  const prompt = clip(instruction, 2200);
  if (!prompt) return { ok: false, message: "Was soll Lisa am Telefon ausrichten?" };

  // L4 (Chef 29.07.2026): Ausserhalb des Anruf-Fensters wird NICHT gewaehlt,
  // sondern eingeplant. Test-Redirect (eigenes Handy) uebersteuert; die
  // Wiedervorlage eines eingeplanten Anrufs (taskId gesetzt) laeuft ohnehin
  // nur im Fenster los.
  // `sofort`: der Angerufene hat den Anruf selbst und gerade eben angefordert
  // (Erlebnis-Demo: "Lisa soll mich jetzt anrufen"). Das Anruf-Fenster schuetzt
  // Patienten vor ungefragten Anrufen zur Unzeit — hier gibt es niemanden zu
  // schuetzen, und ein "ich habe den Anruf fuer morgen 9 Uhr eingeplant" waere
  // in einer Vorfuehrung das Ende.
  if (!redirected && !taskId && !sofort && !imAnrufFenster()) {
    const wannMs = naechsterFensterStartMs();
    // Kein Doppel-Einplanen: gleicher Empfaenger + gleicher Auftrag wartet schon.
    const schedSnap = await tasksCol(clientId)
      .where("kind", "==", "call").where("status", "==", "scheduled").limit(25).get();
    const schonGeplant = schedSnap.docs.map((d) => d.data())
      .find((t) => t.phone === to && String(t.prompt || "") === prompt);
    const wannTxt = new Intl.DateTimeFormat("de-DE", {
      timeZone: TZ_BERLIN, weekday: "long", hour: "2-digit", minute: "2-digit",
    }).format(new Date(wannMs));
    if (schonGeplant) {
      return {
        ok: true, scheduled: true, taskId: schonGeplant.id, scheduledForText: `${wannTxt} Uhr`,
        message: `Dieser Anruf ist bereits für ${wannTxt} Uhr eingeplant.`,
      };
    }
    const ref = tasksCol(clientId).doc();
    await ref.set({
      id: ref.id,
      kind: "call",
      status: "scheduled",
      scheduledForMs: wannMs,
      phone: to,
      contactName: String(contactName || "").trim() || null,
      prompt,
      assignedBy: by || "Team",
      callLanguage: (callLanguage || "de").toLowerCase(),
      bookingContext: bookingContext && typeof bookingContext === "object" ? bookingContext : null,
      outcome: null,
      resultSummary: null,
      transcriptText: null,
      createdAt: FieldValue.serverTimestamp(),
      ts: Date.now(),
    });
    log.info("lisa.call.scheduled_window", { clientId, taskId: ref.id, wannMs, fenster: `${CALL_WINDOW_START}-${CALL_WINDOW_END}` });
    return {
      ok: true, scheduled: true, taskId: ref.id, scheduledForText: `${wannTxt} Uhr`,
      message: `Es ist gerade außerhalb der Anrufzeiten (${CALL_WINDOW_START} bis ${CALL_WINDOW_END} Uhr) — ich habe den Anruf für ${wannTxt} Uhr eingeplant. Lisa ruft dann an.`,
    };
  }

  // Guard: never two parallel Lisa calls to the same number.
  const activeSnap = await tasksCol(clientId)
    .where("kind", "==", "call").where("status", "==", "calling").limit(25).get();
  const active = activeSnap.docs.map((d) => d.data()).find((t) => t.phone === to);
  if (active) {
    return {
      ok: false,
      alreadyRunning: true,
      taskId: active.id,
      message: "Lisa telefoniert bereits mit dieser Nummer. Ich starte keinen zweiten Anruf.",
    };
  }

  if (await isDuplicateDelegation(clientId, "call", to, prompt)) {
    log.warn("lisa.call.duplicate_suppressed", { clientId, to });
    return { ok: true, message: "Diesen Anruf habe ich bereits an Lisa delegiert — ich starte keinen zweiten." };
  }

  const name = String(contactName || "").trim();
  // Wiedervorlage (L4): Ein eingeplanter Anruf behaelt seine Task-Id — so
  // bleiben Recall-Sweep-Zuordnung (candidate.taskId) und Audit konsistent.
  const taskRef = taskId ? tasksCol(clientId).doc(String(taskId)) : tasksCol(clientId).doc();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // DSGVO: KI-Ansage nur, wenn der Schalter im Cockpit AN ist (Default aus).
  const disclosure = await lisaDisclosurePrefix(clientId).catch(() => "");

  // RICHTIGE PRAXIS, RICHTIGER BEHANDLER (Chef 18.08.2026). Lisas Agenten-Prompt
  // bei ElevenLabs nannte eine feste Praxis ("Telefonassistentin von Dr. Petsas")
  // — fuer jeden anderen Mandanten und fuer die Erlebnis-Demo ist das der falsche
  // Name am Telefon. Die Identitaet reist deshalb IM AUFTRAG mit: das ist die
  // einzige Angabe, die pro Anruf sicher ankommt. Kalendername aus dem Anlass
  // gewinnt (beim Recall haengt der Termin an genau diesem Behandler).
  // `identitaet` uebersteuert: die Erlebnis-Demo kennt Praxis und Behandler des
  // Besuchers aus dem Lead-Tor, bevor es dazu einen Mandanten gibt.
  const ident = identitaet || await ladeLisaIdentitaet(clientId, {
    calendarName: bookingContext?.calendarName,
  }).catch(() => null);

  // Same dynamic-variable contract as Lisa's agent prompt expects.
  // client_id geht mit, damit die Kalender-Webhook-Tools (offer_slots/
  // book_slot) den Mandanten sicher auflösen — NIE vom LLM erfunden, sondern
  // von ElevenLabs als Dynamic Variable in den Tool-Request eingesetzt.
  const dynamicVariables = {
    task_id: taskRef.id,
    client_id: clientId,
    assigned_by: by || "Team",
    delegated_to: "Lisa",
    contact_name: name || to,
    phone_number: to,
    task_prompt: rahmeAuftrag(disclosure ? `${disclosure}${prompt}` : prompt)
      + identitaetsRahmen(ident),
    patient_name: name || "",
    doctor: by || "",
    scheduled_for: "",
    created_at: nowIso,
    call_language: (callLanguage || "de").toLowerCase(),
  };

  const call = await elevenOutboundCall({ to, dynamicVariables });
  if (!call.ok) {
    log.warn("lisa.call.failed", { clientId, error: String(call.error) });
    return { ok: false, message: "Der Anruf konnte nicht gestartet werden. Bitte später erneut versuchen." };
  }
  const voiceFrom = await lisaVoiceFrom();

  await taskRef.set({
    id: taskRef.id,
    kind: "call",
    status: "calling",
    phone: to,
    contactName: name || null,
    prompt,
    conversationId: call.conversationId,
    callSid: call.callSid || null,
    voiceFrom: voiceFrom || null,
    assignedBy: by || "Team",
    // Unter welchem Namen hat Lisa sich gemeldet? Gehoert ins Protokoll: bei
    // einer Beschwerde ("wer hat mich da angerufen?") muss das nachweisbar sein.
    praxisName: ident?.praxisName || null,
    behandler: ident?.behandler || null,
    outcome: null,
    resultSummary: null,
    transcriptText: null,
    // Kalender-Kontext für Lisas Live-Buchungs-Tools (nur wenn übergeben).
    bookingContext: bookingContext && typeof bookingContext === "object" ? bookingContext : null,
    // Testlauf-Stempel: der Outcome-Sweep bucht Zusagen dann auf den
    // Testpatienten statt auf den echten (recallCoach.bookAcceptedCandidate).
    testRedirect: redirected?.target?.patientId
      ? { patientId: redirected.target.patientId, name: redirected.target.name || "Testpatient" }
      : null,
    createdAt: FieldValue.serverTimestamp(),
    ts: now,
  });

  try {
    await appendEvent(clientId, {
      channel: CHANNELS.LISA_CALL,
      direction: DIRECTIONS.OUT,
      type: EVENT_TYPES.INTERACTION,
      // ref = Rufnummer: macht den Anruf für den Rückrufer-Kontext auffindbar.
      counterparty: { kind: "unknown", name: name || to, ref: to },
      subject: { name },
      summary: `Lisa ruft im Auftrag von ${by || "dem Team"} ${name || to} an. Auftrag: "${prompt}"`,
      payloadRef: { kind: "lisa_task", id: taskRef.id },
      extractor: "lisa@outbound",
      tags: ["lisa", "call"],
    });
  } catch (e) {
    log.warn("lisa.call.brain_write_failed", { clientId, error: String(e?.message || e) });
  }
  await upsertSharedContact(clientId, { name, phone: to, source: "lisa_call" });

  const spokenTo = name ? `${name}` : `die Nummer ${to.replace("+49", "0")}`;
  return {
    ok: true,
    taskId: taskRef.id,
    message: `Erledigt — Lisa ruft ${spokenTo} jetzt an und richtet es aus. Ich melde mich, sobald das Ergebnis vorliegt.`,
  };
}

// ----------------------------------------------------------------------------
// Finalizer — fetch transcripts of finished calls and write the outcome to the
// shared brain. Invoked periodically from the server (cheap no-op when idle).
// ----------------------------------------------------------------------------

function transcriptToLines(conv) {
  const raw = Array.isArray(conv?.transcript) ? conv.transcript : [];
  return raw
    .map((m) => ({ role: m.role || "unknown", text: String(m.message || m.text || "").trim() }))
    .filter((m) => m.text);
}

function inferOutcome(conv, lines) {
  const status = String(conv?.status || "").toLowerCase();
  if (status === "failed") return "failed";
  const full = lines.map((l) => l.text).join(" ").toLowerCase();
  if (/(mailbox|voicemail|anrufbeantworter|signalton)/.test(full)) return "voicemail";
  if (/(keine antwort|nicht erreichbar|besetzt|busy|no answer)/.test(full)) return "no_answer";
  return status === "done" ? "reached" : "failed";
}

const OUTCOME_SPOKEN = {
  reached: "erreicht",
  voicemail: "auf die Mailbox gesprochen",
  no_answer: "nicht erreicht",
  failed: "nicht erreicht (Fehler)",
};

/**
 * Den GESAMTEN Gespraechsverlauf zu wenigen Saetzen verdichten (Chef
 * 27.07.2026: "sie gibt keine Rueckmeldung ueber den Gespraechsverlauf").
 * Die letzten Lisa-Saetze (resultSummary) sagen oft nur "Auf Wiederhoeren" —
 * der Chef will wissen, WAS besprochen wurde, von beiden Seiten.
 * Faellt das LLM aus, bleibt es beim deterministischen Rohtext (nie schlechter
 * als vorher). Erfundene Zahlen faengt der Waechter in summarize.js ab.
 */
async function dialogZusammenfassung(transcriptText, who, fallback) {
  const src = String(transcriptText || "").trim();
  if (!src) return fallback || "";
  try {
    const r = await summarizeForSpeech("call", src, {
      subject: who ? `Anruf bei ${who}` : "",
      sender: "Lisa (Praxis)",
      maxSentences: 3,
      timeoutMs: 20000,
    });
    if (r.ok && r.text) return r.text;
  } catch { /* Zusammenfassung ist Komfort, nie Bedingung */ }
  return fallback || "";
}

/**
 * Ergebnis eines erledigten Auftrags aufs Handy melden. Der Chef hat den
 * Anruf selbst in Auftrag gegeben — die Rueckmeldung ist die Einloesung des
 * Versprechens aus delegate_call ("Ich melde mich, sobald das Ergebnis
 * vorliegt") und laeuft deshalb bewusst NICHT ueber das Spontan-Budget der
 * proaktiven Meldungen. Best-effort: wirft nie.
 */
async function meldeErgebnis(clientId, { who, outcome, summary, taskId, transcriptText }) {
  try {
    const op = await getOperator(clientId);
    if (!op?.id) return { ok: false, reason: "no_operator" };
    // B (Chef 29.07.2026): "Die Push-Nachrichten über die Lisa-Telefonate
    // lassen sich nicht öffnen, es fehlt auch die Hälfte der Zusammenfassung."
    // Vorher: url="" (Antippen schloss die Meldung nur) und body auf 240
    // gekappt. Jetzt: eigene Ergebnis-Seite /m/lisa-ergebnis.html mit
    // Zusammenfassung + Gesprächsauszug in der URL (wie die Kontaktkarte:
    // selbsttragend, kein Login nötig) und 480 Zeichen im Push-Text.
    // WebPush-Payloads sind hart auf ~4 KB begrenzt; Umlaute blaehen die URL
    // beim Encoden auf das Dreifache. Deshalb Kaskade: langer Auszug ->
    // kurzer Auszug -> ohne Auszug. Die Zusammenfassung bleibt immer drin.
    const bauUrl = (trLimit) => {
      const qp = new URLSearchParams({
        w: String(who || ""),
        o: OUTCOME_SPOKEN[outcome] || String(outcome || ""),
        ts: String(Date.now()),
      });
      if (summary) qp.set("s", clip(summary, 700));
      if (trLimit > 0 && transcriptText) qp.set("tr", clip(transcriptText, trLimit));
      if (taskId) qp.set("t", String(taskId));
      return `${PUBLIC_BASE_URL}/m/lisa-ergebnis.html?${qp.toString()}`;
    };
    let url = bauUrl(2400);
    if (url.length > 1900) url = bauUrl(900);
    if (url.length > 1900) url = bauUrl(0);
    const r = await notifyOperator(clientId, op.id, {
      title: `Lisa: ${who} ${OUTCOME_SPOKEN[outcome] || outcome}`,
      body: clip(summary, 480) || `Frag ${await getAssistantName(clientId)} nach dem Gesprächsverlauf.`,
      url,
    });
    return { ok: !!r?.ok, sent: r?.sent || 0 };
  } catch (e) {
    log.warn("lisa.call.notify_failed", { clientId, error: String(e?.message || e) });
    return { ok: false };
  }
}

let finalizeBusy = false;

/**
 * Check all "calling" Lisa tasks; when the conversation has ended, persist
 * transcript + outcome and append an observation event to the brain.
 * Safe to call on an interval — overlapping runs are skipped.
 */
export async function finalizeLisaCalls(clientId) {
  if (finalizeBusy || !callConfigured()) return { checked: 0, finalized: 0 };
  finalizeBusy = true;
  try {
    const snap = await tasksCol(clientId).where("status", "==", "calling").limit(25).get();
    let finalized = 0;

    for (const doc of snap.docs) {
      const task = doc.data();
      if (!task.conversationId) continue;
      try {
        // Chef hat übernommen: EL-Conversation stirbt oft beim Umlegen in
        // die Konferenz — Task bleibt calling, bis die Konferenz endet.
        const takeSt = String(task.takeover?.status || "");
        if (takeSt === "ringing" || takeSt === "joined") continue;

        const conv = await elevenGetConversation(task.conversationId);
        const status = String(conv?.status || "").toLowerCase();
        if (!["done", "failed"].includes(status)) continue; // still running

        const lines = transcriptToLines(conv);
        const outcome = inferOutcome(conv, lines);
        const transcriptText = lines.map((l) => `${l.role}: ${l.text}`).join("\n");
        const agentTail = lines
          .filter((l) => ["agent", "assistant"].includes(String(l.role).toLowerCase()))
          .slice(-3).map((l) => l.text).join(" ");

        const who = task.contactName || task.phone;
        const dialogSummary = await dialogZusammenfassung(transcriptText, who, agentTail);

        await doc.ref.update({
          status: status === "done" ? "done" : "failed",
          outcome,
          resultSummary: clip(agentTail, 320) || null,
          dialogSummary: clip(dialogSummary, 700) || null,
          // B (29.07.2026): 8000 schnitt laengere Gespraeche ab ("Die
          // Transkripte sind unvollstaendig") — 20000 traegt auch ein langes
          // Beratungsgespraech; Firestore-Limit (1 MB/Dokument) bleibt fern.
          transcriptText: clip(transcriptText, 20000) || null,
          endedAt: FieldValue.serverTimestamp(),
        });

        await appendEvent(clientId, {
          id: `lisa-result-${task.id}`,
          channel: CHANNELS.LISA_CALL,
          direction: DIRECTIONS.OUT,
          type: EVENT_TYPES.OBSERVATION,
          counterparty: { kind: "unknown", name: who, ref: task.phone || null },
          subject: { name: task.contactName || "" },
          summary:
            `Lisas Anruf bei ${who} ist beendet: ${OUTCOME_SPOKEN[outcome] || outcome}.` +
            (dialogSummary ? ` Aus dem Gespräch: ${clip(dialogSummary, 400)}` : ""),
          signals: outcome === "reached" ? {} : { unresolvedByAI: true },
          payloadRef: { kind: "lisa_task", id: task.id },
          extractor: "lisa@outbound",
          tags: ["lisa", "call", "result"],
        });

        const push = await meldeErgebnis(clientId, {
          who, outcome, summary: dialogSummary,
          taskId: task.id, transcriptText,
        });

        finalized += 1;
        log.info("lisa.call.finalized", { clientId, taskId: task.id, outcome, gemeldet: !!push.ok });
      } catch (e) {
        log.warn("lisa.call.finalize_error", { clientId, taskId: task.id, error: String(e?.message || e) });
      }
    }
    return { checked: snap.size, finalized };
  } finally {
    finalizeBusy = false;
  }
}

let scheduledBusy = false;

/**
 * L4 (Chef 29.07.2026): Eingeplante Anrufe (Status "scheduled", ausserhalb
 * des Anruf-Fensters entgegengenommen) im Fenster tatsaechlich waehlen.
 * Laeuft im selben Takt wie der Finalizer; billig im Leerlauf (eine Abfrage).
 * Die Task-Id bleibt erhalten (lisaStartCall mit taskId) — Recall-Sweep und
 * Audit finden den Anruf unter derselben Id wieder.
 */
export async function startScheduledLisaCalls(clientId) {
  if (scheduledBusy || !callConfigured() || !imAnrufFenster()) return { started: 0 };
  scheduledBusy = true;
  try {
    const snap = await tasksCol(clientId)
      .where("kind", "==", "call").where("status", "==", "scheduled").limit(10).get();
    let started = 0;
    for (const doc of snap.docs) {
      const t = doc.data();
      if (Number(t.scheduledForMs || 0) > Date.now()) continue;
      // Vor dem Waehlen markieren — ein zweiter Sweep-Lauf darf denselben
      // Anruf nicht noch einmal anfassen.
      await doc.ref.update({ status: "promoting" });
      const out = await lisaStartCall(clientId, {
        phone: t.phone,
        instruction: t.prompt,
        contactName: t.contactName,
        by: t.assignedBy,
        callLanguage: t.callLanguage,
        bookingContext: t.bookingContext || null,
        taskId: doc.id,
      }).catch((e) => ({ ok: false, message: String(e?.message || e) }));
      if (out?.ok === false) {
        await doc.ref.update({
          status: "failed",
          outcome: "failed",
          resultSummary: clip(`Eingeplanter Anruf konnte nicht gestartet werden: ${out?.message || ""}`, 300),
        }).catch(() => {});
      } else {
        started += 1;
      }
      log.info("lisa.call.scheduled_started", { clientId, taskId: doc.id, ok: out?.ok !== false });
    }
    return { started };
  } finally {
    scheduledBusy = false;
  }
}

/**
 * Ausgang und Verlauf eines delegierten Anrufs nachschlagen (Chef 27.07.2026).
 * Ohne Angabe: der ZULETZT delegierte Anruf. Mit `contactName`: der letzte
 * Anruf bei dieser Person (Teilstring, gross/klein egal). Laeuft der Anruf noch,
 * wird das ehrlich gemeldet statt ein Ergebnis zu erfinden.
 *
 * @returns {Promise<{ok:boolean, state:"done"|"running"|"none", task?:object}>}
 */
export async function findLisaCallResult(clientId, { taskId = "", contactName = "" } = {}) {
  if (taskId) {
    const doc = await tasksCol(clientId).doc(String(taskId)).get();
    if (!doc.exists) return { ok: false, state: "none" };
    const t = doc.data();
    return { ok: true, state: t.status === "calling" ? "running" : "done", task: t };
  }

  const snap = await tasksCol(clientId).orderBy("ts", "desc").limit(25).get();
  const wanted = String(contactName || "").trim().toLowerCase();
  const passt = (t) => {
    if (t.kind && t.kind !== "call") return false;
    if (!wanted) return true;
    const name = `${t.contactName || ""} ${t.phone || ""}`.toLowerCase();
    return wanted.split(/\s+/).some((teil) => teil.length >= 3 && name.includes(teil));
  };
  const treffer = snap.docs.map((d) => d.data()).filter(passt);
  if (!treffer.length) return { ok: false, state: "none" };
  const fertig = treffer.find((t) => t.status !== "calling");
  if (fertig) return { ok: true, state: "done", task: fertig };
  return { ok: true, state: "running", task: treffer[0] };
}

/**
 * Zusammenfassung nachziehen (27.07.2026). Wird ein Anruf abgeschlossen,
 * BEVOR es dieses Feature gab — oder war das LLM in genau dieser Sekunde nicht
 * erreichbar — steht am Task nur `resultSummary`: die letzten Lisa-Saetze,
 * roh und mitten im Satz abgeschnitten. Fragt der Chef spaeter nach dem
 * Gespraech, verdichten wir das gespeicherte Transkript dann eben JETZT und
 * schreiben das Ergebnis zurueck, damit es beim naechsten Mal sofort da ist.
 * Best-effort: schlaegt die Verdichtung fehl, bleibt alles wie es war.
 */
export async function ensureDialogSummary(clientId, task) {
  if (!task || task.dialogSummary || !task.transcriptText) return task;
  const zus = await dialogZusammenfassung(
    task.transcriptText, task.contactName || task.phone, "");
  if (!zus) return task;
  const gekuerzt = clip(zus, 700);
  if (task.id) {
    try {
      await tasksCol(clientId).doc(String(task.id)).update({ dialogSummary: gekuerzt });
    } catch (e) {
      log.warn("lisa.summary.backfill_failed", { clientId, taskId: task.id, error: String(e?.message || e) });
    }
  }
  return { ...task, dialogSummary: gekuerzt };
}

/** Recent Lisa tasks for the monitor UI (newest first). */
export async function listLisaTasks(clientId, limit = 25) {
  const snap = await tasksCol(clientId).orderBy("ts", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data());
}

// ----------------------------------------------------------------------------
// Gesprächs-Popup im Lisa-Arbeitsplatz (05.07.2026): EIN Anruf mit
// strukturiertem Transkript (Zeitmarken) + Audio — gleiche Erfahrung wie
// Biancas Anrufe-Seite. Das Transkript wird nach dem ersten Abruf am Task
// gecacht, damit wiederholtes Öffnen ElevenLabs nicht erneut trifft.
// ----------------------------------------------------------------------------

function transcriptRole(role) {
  const r = String(role || "").toLowerCase();
  if (["agent", "assistant", "lisa"].includes(r)) return "agent";
  if (["chef", "doctor", "operator"].includes(r)) return "chef";
  return "user";
}

function normalizeTranscriptItems(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((m) => ({
      role: transcriptRole(m.role),
      message: String(m.message || m.text || "").trim(),
      timeInCallSecs: Number.isFinite(Number(m.time_in_call_secs ?? m.timeInCallSecs))
        ? Number(m.time_in_call_secs ?? m.timeInCallSecs)
        : -1,
    }))
    .filter((m) => m.message);
}

/**
 * Detail for ONE Lisa call: structured transcript with per-turn time offsets,
 * duration and audio availability. Falls back to the flat transcriptText
 * ("role: text" per line, no time marks) for tasks recorded before this
 * feature or when the provider is unreachable.
 */
export async function getLisaTaskDetail(clientId, taskId) {
  const doc = await tasksCol(clientId).doc(String(taskId)).get();
  if (!doc.exists) return { ok: false, reason: "not_found" };
  const task = doc.data();

  let transcript = Array.isArray(task.transcriptItems) && task.transcriptItems.length ? task.transcriptItems : null;
  let durationSecs = Number(task.durationSecs || 0) || null;
  // Alt-Tasks haben das Flag nicht: optimistisch, solange eine Conversation existiert.
  let hasAudio = task.hasAudio === undefined ? true : task.hasAudio !== false;

  if (!transcript && task.conversationId && callConfigured()) {
    try {
      const conv = await elevenGetConversation(task.conversationId);
      const convStatus = String(conv?.status || "").toLowerCase();
      transcript = normalizeTranscriptItems(conv?.transcript);
      durationSecs = Number(conv?.metadata?.call_duration_secs || 0) || durationSecs;
      hasAudio = conv?.has_audio !== false;
      const meta = extractPhoneCallMeta(conv);
      const patch = {};
      if (meta.callSid && !task.callSid) patch.callSid = meta.callSid;
      if (meta.voiceFrom && !task.voiceFrom) patch.voiceFrom = meta.voiceFrom;
      // Laufende Gespraeche cachen, sobald Zeilen da sind — sonst bleibt
      // die Live-Ansicht leer, bis der Finalizer nach dem Auflegen schreibt.
      if (transcript.length) {
        patch.transcriptItems = transcript;
        if (durationSecs) patch.durationSecs = durationSecs;
        if (["done", "failed"].includes(convStatus)) patch.hasAudio = hasAudio;
      }
      if (Object.keys(patch).length) await doc.ref.update(patch).catch(() => {});
    } catch (e) {
      log.warn("lisa.task_detail.provider_failed", { clientId, taskId, error: String(e?.message || e) });
    }
  }

  if ((!transcript || !transcript.length) && task.transcriptText) {
    transcript = String(task.transcriptText)
      .split("\n")
      .map((line) => {
        const m = /^([A-Za-z_]+):\s*(.+)$/.exec(line.trim());
        if (!m) return null;
        return {
          role: transcriptRole(m[1]),
          message: m[2].trim(),
          timeInCallSecs: -1,
        };
      })
      .filter(Boolean);
  }

  const extra = normalizeTranscriptItems(task.takeoverTranscript);
  if (extra.length) {
    const seen = new Set((transcript || []).map((r) => `${r.role}|${r.message}`));
    transcript = [...(transcript || []), ...extra.filter((r) => !seen.has(`${r.role}|${r.message}`))];
  }

  return {
    ok: true,
    task,
    transcript: transcript || [],
    durationSecs: durationSecs || null,
    hasAudio: !!(task.kind === "call" && task.conversationId && hasAudio),
  };
}

/**
 * Audio bytes of a Lisa call, proxied from ElevenLabs so the API key never
 * reaches the browser. Loaded by the <audio> element in the popup.
 */
export async function getLisaTaskAudio(clientId, taskId) {
  const doc = await tasksCol(clientId).doc(String(taskId)).get();
  if (!doc.exists) return { ok: false, reason: "not_found" };
  const task = doc.data();
  if (!task.conversationId) return { ok: false, reason: "no_conversation" };
  if (!callConfigured()) return { ok: false, reason: "not_configured" };

  const r = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(task.conversationId)}/audio`,
    { headers: { "xi-api-key": env("ELEVENLABS_API_KEY") } }
  );
  if (!r.ok) return { ok: false, reason: `elevenlabs_http_${r.status}` };
  const buffer = Buffer.from(await r.arrayBuffer());
  return { ok: true, buffer, contentType: r.headers.get("content-type") || "audio/mpeg" };
}

/**
 * Notaus: Lisa auflegen (Twilio Call complete). Die Live-Taste „Gespräch
 * übernehmen“ geht über takeover.js — diese Funktion bleibt für den Fall,
 * dass keine Konferenz zustande kommt.
 */
export async function hangupLisaCall(clientId, taskId) {
  const doc = await tasksCol(clientId).doc(String(taskId)).get();
  if (!doc.exists) return { ok: false, reason: "not_found" };
  const task = doc.data() || {};
  if (task.status !== "calling") {
    return { ok: true, alreadyEnded: true, phone: task.phone || "", contactName: task.contactName || "" };
  }

  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const callSid = String(task.callSid || "").trim();
  if (sid && token && callSid) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls/${encodeURIComponent(callSid)}.json`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Status: "completed" }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      log.warn("lisa.call.hangup_failed", { clientId, taskId, error: data?.message || r.status });
    }
  } else {
    log.warn("lisa.call.hangup_no_sid", { clientId, taskId, hasCallSid: !!callSid });
  }

  await doc.ref.update({
    status: "failed",
    outcome: "taken_over",
    resultSummary: "Der Chef hat das Gespräch übernommen — Lisa hat aufgelegt.",
    endedAt: FieldValue.serverTimestamp(),
  }).catch((e) => {
    log.warn("lisa.call.hangup_write_failed", { clientId, taskId, error: String(e?.message || e) });
  });

  return { ok: true, phone: task.phone || "", contactName: task.contactName || "" };
}
