import crypto from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { appendEvent } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";
import { upsertSharedContact } from "../brain/addressBook.js";
import { lisaDisclosurePrefix } from "../brain/aiDisclosure.js";
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

function tasksCol(clientId) {
  return masCollection(clientId, TASKS);
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

// ----------------------------------------------------------------------------
// SMS
// ----------------------------------------------------------------------------

/**
 * Send one SMS via Twilio. Sender is the alphanumeric LISA_SMS_SENDER (no
 * reply channel — outbound notifications only, which is exactly Lisa's job).
 *
 * @returns {Promise<{ok:boolean, sid?:string, error?:string}>}
 */
async function twilioSendSms({ to, body }) {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = env("LISA_SMS_SENDER");
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
    return { ok: false, error: data?.message || `twilio_http_${r.status}` };
  }
  return { ok: true, sid: data?.sid || null };
}

/**
 * Lisa sends an SMS, ordered by Clara/the team. Validates, sends, records the
 * fact in the shared brain and in mas_lisa_tasks (audit).
 *
 * @param {string} clientId
 * @param {{phone:string, message:string, recipientName?:string, by?:string}} input
 * @returns {Promise<{ok:boolean, message:string, taskId?:string}>} `message` is speakable.
 */
export async function lisaSendSms(clientId, { phone, message, recipientName, by } = {}) {
  if (!smsConfigured()) {
    return { ok: false, message: "SMS-Versand ist nicht konfiguriert." };
  }
  const to = normalizePhoneE164(phone);
  if (!to) return { ok: false, message: "Die Telefonnummer habe ich nicht verstanden. Bitte noch einmal nennen." };
  const body = clip(message, 480);
  if (!body) return { ok: false, message: "Was soll in der SMS stehen?" };

  const name = String(recipientName || "").trim();

  if (await isDuplicateDelegation(clientId, "sms", to, body)) {
    log.warn("lisa.sms.duplicate_suppressed", { clientId, to });
    return { ok: true, message: `Die SMS an ${name || to} wurde bereits gesendet — ich schicke sie nicht doppelt.` };
  }

  const taskRef = tasksCol(clientId).doc();
  const now = Date.now();

  const send = await twilioSendSms({ to, body });
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
  return { ok: true, taskId: taskRef.id, message: `Erledigt — die SMS an ${spokenTo} ist raus.` };
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
  return { ok: true, conversationId: data?.conversation_id || null, callSid: data?.callSid || null };
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
 * @param {string} clientId
 * @param {{phone:string, instruction:string, contactName?:string, by?:string, callLanguage?:string}} input
 * @returns {Promise<{ok:boolean, message:string, taskId?:string}>}
 */
export async function lisaStartCall(clientId, { phone, instruction, contactName, by, callLanguage } = {}) {
  if (!callConfigured()) {
    return { ok: false, message: "Outbound-Anrufe sind nicht konfiguriert." };
  }
  const to = normalizePhoneE164(phone);
  if (!to) return { ok: false, message: "Die Telefonnummer habe ich nicht verstanden. Bitte noch einmal nennen." };
  const prompt = clip(instruction, 800);
  if (!prompt) return { ok: false, message: "Was soll Lisa am Telefon ausrichten?" };

  // Guard: never two parallel Lisa calls to the same number.
  const activeSnap = await tasksCol(clientId)
    .where("kind", "==", "call").where("status", "==", "calling").limit(25).get();
  const active = activeSnap.docs.map((d) => d.data()).find((t) => t.phone === to);
  if (active) {
    return { ok: false, message: "Lisa telefoniert bereits mit dieser Nummer. Ich starte keinen zweiten Anruf." };
  }

  if (await isDuplicateDelegation(clientId, "call", to, prompt)) {
    log.warn("lisa.call.duplicate_suppressed", { clientId, to });
    return { ok: true, message: "Diesen Anruf habe ich bereits an Lisa delegiert — ich starte keinen zweiten." };
  }

  const name = String(contactName || "").trim();
  const taskRef = tasksCol(clientId).doc();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // DSGVO: KI-Ansage nur, wenn der Schalter im Cockpit AN ist (Default aus).
  const disclosure = await lisaDisclosurePrefix(clientId).catch(() => "");

  // Same dynamic-variable contract as Lisa's agent prompt expects.
  const dynamicVariables = {
    task_id: taskRef.id,
    assigned_by: by || "Team",
    delegated_to: "Lisa",
    contact_name: name || to,
    phone_number: to,
    task_prompt: disclosure ? `${disclosure}${prompt}` : prompt,
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

  await taskRef.set({
    id: taskRef.id,
    kind: "call",
    status: "calling",
    phone: to,
    contactName: name || null,
    prompt,
    conversationId: call.conversationId,
    callSid: call.callSid || null,
    assignedBy: by || "Team",
    outcome: null,
    resultSummary: null,
    transcriptText: null,
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
        const conv = await elevenGetConversation(task.conversationId);
        const status = String(conv?.status || "").toLowerCase();
        if (!["done", "failed"].includes(status)) continue; // still running

        const lines = transcriptToLines(conv);
        const outcome = inferOutcome(conv, lines);
        const transcriptText = lines.map((l) => `${l.role}: ${l.text}`).join("\n");
        const agentTail = lines
          .filter((l) => ["agent", "assistant"].includes(String(l.role).toLowerCase()))
          .slice(-3).map((l) => l.text).join(" ");

        await doc.ref.update({
          status: status === "done" ? "done" : "failed",
          outcome,
          resultSummary: clip(agentTail, 320) || null,
          transcriptText: clip(transcriptText, 8000) || null,
          endedAt: FieldValue.serverTimestamp(),
        });

        const who = task.contactName || task.phone;
        await appendEvent(clientId, {
          id: `lisa-result-${task.id}`,
          channel: CHANNELS.LISA_CALL,
          direction: DIRECTIONS.OUT,
          type: EVENT_TYPES.OBSERVATION,
          counterparty: { kind: "unknown", name: who, ref: task.phone || null },
          subject: { name: task.contactName || "" },
          summary:
            `Lisas Anruf bei ${who} ist beendet: ${OUTCOME_SPOKEN[outcome] || outcome}.` +
            (agentTail ? ` Laut Gespräch: "${clip(agentTail, 240)}"` : ""),
          signals: outcome === "reached" ? {} : { unresolvedByAI: true },
          payloadRef: { kind: "lisa_task", id: task.id },
          extractor: "lisa@outbound",
          tags: ["lisa", "call", "result"],
        });

        finalized += 1;
        log.info("lisa.call.finalized", { clientId, taskId: task.id, outcome });
      } catch (e) {
        log.warn("lisa.call.finalize_error", { clientId, taskId: task.id, error: String(e?.message || e) });
      }
    }
    return { checked: snap.size, finalized };
  } finally {
    finalizeBusy = false;
  }
}

/** Recent Lisa tasks for the monitor UI (newest first). */
export async function listLisaTasks(clientId, limit = 25) {
  const snap = await tasksCol(clientId).orderBy("ts", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data());
}
