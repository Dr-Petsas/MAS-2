import crypto from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { appendEvent } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";
import { log } from "../log.js";
import { normalizePhoneE164 } from "./outbound.js";

// ============================================================================
// Lisa — Gespräch übernehmen (Chef 14.08.2026)
//
// Der Chef tippt auf dem Flip „Gespräch übernehmen“. Lisa legt NICHT auf.
// Ablauf:
//   1. Twilio ruft das Chef-Handy an (LISA_TAKEOVER_PHONE / Gerät / Anfrage).
//   2. Sobald der Chef rangeht, wandern die laufenden Leitungen in eine
//      Konferenz `lisa-{taskId}`. Lisas Bein ist stumm, Patient + Chef hören
//      einander. Task bleibt `calling`, damit Poll + Transkript weiterlaufen.
//   3. ElevenLabs-Transkript so lange es lebt; parallel Twilio-Realtime-
//      Transkription (Webhook), damit nach dem Mute nichts abreißt.
//   4. Chef legt auf → Konferenz endet → Task done / outcome taken_over.
//
// LISA_SMS_SENDER ist alphanumerisch und KEIN Voice-From.
// ============================================================================

const FieldValue = admin.firestore.FieldValue;
const TASKS = "mas_lisa_tasks";
const LIVE_STATUSES = new Set(["queued", "ringing", "in-progress"]);
const CHEF_FAIL = new Set(["busy", "failed", "no-answer", "canceled"]);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4000").trim().replace(/\/+$/, "");

function env(name) {
  return (process.env[name] || "").trim();
}

function tasksCol(clientId) {
  return masCollection(clientId, TASKS);
}

function conferenceName(taskId) {
  return `lisa-${String(taskId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80)}`;
}

function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Ziffernvergleich: +49177… und 0177… und 0049… treffen sich. */
export function phoneDigits(raw) {
  const e164 = normalizePhoneE164(raw);
  if (e164) return e164.replace(/\D/g, "");
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = `49${d.slice(1)}`;
  return d;
}

export function phonesMatch(a, b) {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const short = da.length < db.length ? da : db;
  const long = da.length < db.length ? db : da;
  return short.length >= 8 && long.endsWith(short);
}

export function classifyCallLeg(call, patientPhone) {
  if (!call) return "lisa";
  if (phonesMatch(call.to, patientPhone) || phonesMatch(call.from, patientPhone)) return "patient";
  return "lisa";
}

export function conferenceTwiml({
  name,
  muted = false,
  endOnExit = false,
  transcribeUrl = "",
  label = "",
  statusCallback = "",
} = {}) {
  const confAttrs = [
    `beep="false"`,
    `muted="${muted ? "true" : "false"}"`,
    `startConferenceOnEnter="true"`,
    `endConferenceOnExit="${endOnExit ? "true" : "false"}"`,
  ];
  if (label) confAttrs.push(`participantLabel="${xmlEscape(label)}"`);
  if (statusCallback) {
    confAttrs.push(`statusCallback="${xmlEscape(statusCallback)}"`);
    confAttrs.push(`statusCallbackEvent="start end join leave"`);
    confAttrs.push(`statusCallbackMethod="POST"`);
  }
  const start = transcribeUrl
    ? `<Start><Transcription statusCallbackUrl="${xmlEscape(transcribeUrl)}" languageCode="de-DE" track="inbound_track" partialResults="true"/></Start>`
    : "";
  return `<Response>${start}<Dial><Conference ${confAttrs.join(" ")}>${xmlEscape(name)}</Conference></Dial></Response>`;
}

export function parseTranscriptionPayload(body = {}) {
  const event = String(body.TranscriptionEvent || body.transcriptionEvent || "").toLowerCase();
  if (event && event !== "transcription-content") return null;
  let data = body.TranscriptionData || body.transcriptionData || "";
  if (typeof data === "string" && data.trim().startsWith("{")) {
    try { data = JSON.parse(data); } catch { data = {}; }
  }
  if (!data || typeof data !== "object") data = {};
  const message = String(data.transcript || data.text || body.TranscriptionText || "").trim();
  if (!message) return null;
  const finalFlag = data.is_final ?? data.isFinal ?? body.Final ?? body.final;
  const partial = finalFlag === false || finalFlag === "false" || data.partial === true;
  return { message, partial };
}

export function mergeTakeoverLine(rows, { role, message, partial = false } = {}) {
  const cur = Array.isArray(rows) ? rows.slice() : [];
  const item = {
    role: role === "chef" || role === "agent" ? role : "user",
    message: String(message || "").trim(),
    timeInCallSecs: -1,
    source: "twilio",
    partial: !!partial,
  };
  if (!item.message) return cur;
  const last = cur[cur.length - 1];
  if (last && last.role === item.role && last.source === "twilio" && (last.partial || item.partial || last.message === item.message)) {
    cur[cur.length - 1] = { ...item, partial: !!partial };
    return cur;
  }
  cur.push(item);
  return cur.slice(-200);
}

export function twilioSignatureExpected(authToken, url, params) {
  const data = Object.keys(params || {}).sort().reduce((acc, k) => acc + k + String(params[k] ?? ""), String(url || ""));
  return crypto.createHmac("sha1", String(authToken || "")).update(data, "utf8").digest("base64");
}

export function twilioSignatureOk(authToken, url, params, signature) {
  const token = String(authToken || "");
  const got = String(signature || "");
  if (!token || !got) return false;
  const expected = twilioSignatureExpected(token, url, params);
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

function twilioConfigured() {
  return !!(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN"));
}

function twilioAuthHeader() {
  return `Basic ${Buffer.from(`${env("TWILIO_ACCOUNT_SID")}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64")}`;
}

function twilioUrl(path, query = "") {
  const sid = encodeURIComponent(env("TWILIO_ACCOUNT_SID"));
  const q = query ? `?${query}` : "";
  return `https://api.twilio.com/2010-04-01/Accounts/${sid}${path}${q}`;
}

async function twilioGet(path, query = "") {
  const r = await fetch(twilioUrl(path, query), { headers: { Authorization: twilioAuthHeader() } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: data?.message || `twilio_http_${r.status}`, data };
  return { ok: true, data };
}

async function twilioPost(path, fields) {
  const r = await fetch(twilioUrl(path), {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: data?.message || `twilio_http_${r.status}`, data };
  return { ok: true, data };
}

function asCall(data) {
  if (!data) return null;
  return {
    sid: String(data.sid || ""),
    to: String(data.to || data.To || ""),
    from: String(data.from || data.From || ""),
    status: String(data.status || data.Status || "").toLowerCase(),
    parent: String(data.parent_call_sid || data.parentCallSid || ""),
  };
}

async function getCall(callSid) {
  const r = await twilioGet(`/Calls/${encodeURIComponent(callSid)}.json`);
  if (!r.ok) return null;
  return asCall(r.data);
}

async function listChildCalls(parentSid) {
  const r = await twilioGet("/Calls.json", `ParentCallSid=${encodeURIComponent(parentSid)}&PageSize=20`);
  if (!r.ok) return [];
  const list = Array.isArray(r.data?.calls) ? r.data.calls : [];
  return list.map(asCall).filter((c) => c?.sid);
}

async function findLiveCallSid(patientPhone) {
  const to = normalizePhoneE164(patientPhone);
  if (!to) return "";
  for (const status of ["in-progress", "ringing"]) {
    const r = await twilioGet("/Calls.json", `To=${encodeURIComponent(to)}&Status=${status}&PageSize=5`);
    const list = Array.isArray(r.data?.calls) ? r.data.calls : [];
    const hit = list.map(asCall).find((c) => c?.sid);
    if (hit) return hit.sid;
  }
  return "";
}

export async function collectCallLegs(rootSid) {
  const found = new Map();
  const add = (c) => { if (c?.sid && !found.has(c.sid)) found.set(c.sid, c); };
  const root = await getCall(rootSid);
  add(root);
  if (root?.parent) add(await getCall(root.parent));
  for (const sid of [rootSid, root?.parent].filter(Boolean)) {
    for (const child of await listChildCalls(sid)) add(child);
  }
  return [...found.values()];
}

let cachedVoiceFrom = { at: 0, value: "" };

async function elevenVoiceFrom() {
  const now = Date.now();
  if (cachedVoiceFrom.value && now - cachedVoiceFrom.at < 10 * 60 * 1000) return cachedVoiceFrom.value;
  const id = env("LISA_PHONE_NUMBER_ID");
  const key = env("ELEVENLABS_API_KEY");
  if (!id || !key) return "";
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/phone-numbers/${encodeURIComponent(id)}`, {
      headers: { "xi-api-key": key },
    });
    const data = await r.json().catch(() => ({}));
    const n = normalizePhoneE164(data.phone_number || data.number || data.phoneNumber || "");
    if (n) cachedVoiceFrom = { at: now, value: n };
    return n || "";
  } catch {
    return "";
  }
}

async function resolveVoiceFrom(legs = []) {
  const envFrom = normalizePhoneE164(env("TWILIO_VOICE_FROM") || env("LISA_VOICE_FROM"));
  if (envFrom) return envFrom;
  for (const leg of legs) {
    const from = normalizePhoneE164(leg.from);
    if (from) return from;
  }
  return (await elevenVoiceFrom()) || "";
}

export function resolveChefPhone({ requested, stored, envPhone } = {}) {
  const fromEnv = envPhone !== undefined
    ? envPhone
    : (env("LISA_TAKEOVER_PHONE") || env("CHEF_TAKEOVER_PHONE"));
  return normalizePhoneE164(requested)
    || normalizePhoneE164(stored)
    || normalizePhoneE164(fromEnv);
}

function webhookBase() {
  return `${PUBLIC_BASE_URL}/lisa/twilio`;
}

function transcribeUrl(clientId, taskId, leg) {
  return `${webhookBase(clientId, taskId)}/transcript/${encodeURIComponent(clientId)}/${encodeURIComponent(taskId)}?leg=${encodeURIComponent(leg)}`;
}

function chefStatusUrl(clientId, taskId) {
  return `${webhookBase(clientId, taskId)}/chef/${encodeURIComponent(clientId)}/${encodeURIComponent(taskId)}`;
}

function conferenceStatusUrl(clientId, taskId) {
  return `${webhookBase(clientId, taskId)}/conference/${encodeURIComponent(clientId)}/${encodeURIComponent(taskId)}`;
}

/**
 * Startet die Übernahme: Chef-Handy klingelt. Die laufenden Leitungen
 * werden erst umgelegt, wenn der Chef rangeht (sonst sitzt der Patient
 * in einer leeren Konferenz).
 */
export async function takeoverLisaCall(clientId, taskId, { chefPhone } = {}) {
  if (!twilioConfigured()) return { ok: false, reason: "twilio_not_configured" };
  const doc = await tasksCol(clientId).doc(String(taskId)).get();
  if (!doc.exists) return { ok: false, reason: "not_found" };
  const task = doc.data() || {};
  if (task.kind !== "call") return { ok: false, reason: "not_a_call" };
  if (task.status !== "calling") {
    return { ok: true, alreadyEnded: true, phone: task.phone || "", contactName: task.contactName || "" };
  }

  const take = task.takeover && typeof task.takeover === "object" ? task.takeover : {};
  if (take.status === "joined") {
    return { ok: true, joined: true, phone: task.phone || "", contactName: task.contactName || "" };
  }
  if (take.status === "ringing" && take.chefCallSid) {
    return { ok: true, ringing: true, phone: task.phone || "", contactName: task.contactName || "" };
  }

  const toChef = resolveChefPhone({ requested: chefPhone, stored: take.chefPhone });
  if (!toChef) return { ok: false, reason: "need_phone" };

  const callSid = String(task.callSid || "").trim() || await findLiveCallSid(task.phone);
  if (!callSid) return { ok: false, reason: "no_call_sid" };
  if (!task.callSid && callSid) {
    await doc.ref.update({ callSid }).catch(() => {});
  }

  const legs = await collectCallLegs(callSid);
  const from = await resolveVoiceFrom(legs);
  if (!from) return { ok: false, reason: "no_voice_from" };
  if (phonesMatch(from, toChef)) {
    return { ok: false, reason: "chef_is_from" };
  }

  const name = conferenceName(taskId);
  const twiml = conferenceTwiml({
    name,
    muted: false,
    endOnExit: true,
    label: "chef",
    transcribeUrl: transcribeUrl(clientId, taskId, "chef"),
    statusCallback: conferenceStatusUrl(clientId, taskId),
  });

  const created = await twilioPost("/Calls.json", {
    To: toChef,
    From: from,
    Twiml: twiml,
    Timeout: "25",
    StatusCallback: chefStatusUrl(clientId, taskId),
    StatusCallbackEvent: "initiated ringing answered completed",
    StatusCallbackMethod: "POST",
  });
  if (!created.ok) {
    log.warn("lisa.takeover.chef_dial_failed", { clientId, taskId, error: created.error });
    return { ok: false, reason: "chef_dial_failed", error: created.error };
  }

  const chefCallSid = String(created.data?.sid || "");
  await doc.ref.update({
    takeover: {
      status: "ringing",
      conferenceName: name,
      chefPhone: toChef,
      chefCallSid,
      voiceFrom: from,
      startedAtMs: Date.now(),
    },
  });

  log.info("lisa.takeover.chef_ringing", { clientId, taskId, chefCallSid: chefCallSid.slice(-8) });
  return {
    ok: true,
    ringing: true,
    phone: task.phone || "",
    contactName: task.contactName || "",
  };
}

export async function joinLisaConference(clientId, taskId) {
  const doc = await tasksCol(clientId).doc(String(taskId)).get();
  if (!doc.exists) return { ok: false, reason: "not_found" };
  const task = doc.data() || {};
  const take = task.takeover || {};
  if (take.status === "joined") return { ok: true, already: true };
  if (take.status === "ended") return { ok: false, reason: "already_ended" };

  const name = take.conferenceName || conferenceName(taskId);
  const callSid = String(task.callSid || "").trim() || await findLiveCallSid(task.phone);
  if (!callSid) return { ok: false, reason: "no_call_sid" };

  const legs = await collectCallLegs(callSid);
  const skip = new Set([take.chefCallSid].filter(Boolean));
  let redirected = 0;
  for (const leg of legs) {
    if (!leg.sid || skip.has(leg.sid) || !LIVE_STATUSES.has(leg.status)) continue;
    const kind = classifyCallLeg(leg, task.phone);
    const twiml = conferenceTwiml({
      name,
      muted: kind !== "patient",
      endOnExit: false,
      label: kind,
      transcribeUrl: transcribeUrl(clientId, taskId, kind),
      statusCallback: conferenceStatusUrl(clientId, taskId),
    });
    const upd = await twilioPost(`/Calls/${encodeURIComponent(leg.sid)}.json`, { Twiml: twiml });
    if (upd.ok) redirected += 1;
    else log.warn("lisa.takeover.redirect_failed", { clientId, taskId, error: upd.error, tail: leg.sid.slice(-6) });
  }

  await doc.ref.update({
    "takeover.status": "joined",
    "takeover.joinedAtMs": Date.now(),
    "takeover.redirected": redirected,
    "takeover.conferenceName": name,
  });
  log.info("lisa.takeover.joined", { clientId, taskId, redirected });
  return { ok: true, redirected };
}

export async function onChefCallStatus(clientId, taskId, body = {}) {
  const status = String(body.CallStatus || body.CallStatusEvent || "").toLowerCase();
  const sid = String(body.CallSid || "");
  if (status === "in-progress" || status === "answered") {
    return joinLisaConference(clientId, taskId);
  }
  if (CHEF_FAIL.has(status)) {
    const doc = await tasksCol(clientId).doc(String(taskId)).get();
    if (!doc.exists) return { ok: false };
    const take = doc.data()?.takeover || {};
    if (take.status === "joined" || take.status === "ended") return { ok: true, ignored: true };
    await doc.ref.update({
      "takeover.status": "failed",
      "takeover.failReason": status,
      "takeover.failedAtMs": Date.now(),
    }).catch(() => {});
    log.warn("lisa.takeover.chef_missed", { clientId, taskId, status, tail: sid.slice(-6) });
    return { ok: true, failed: true };
  }
  if (status === "completed") {
    const doc = await tasksCol(clientId).doc(String(taskId)).get();
    const take = doc.exists ? (doc.data()?.takeover || {}) : {};
    if (take.status === "joined") return finalizeTakeover(clientId, taskId, "chef_hangup");
  }
  return { ok: true, status };
}

export async function onConferenceStatus(clientId, taskId, body = {}) {
  const event = String(body.StatusCallbackEvent || body.EventName || body.FriendlyName || "").toLowerCase();
  if (/(^|-)end$/.test(event) || event === "conference-end" || event.includes("conference-end")) {
    return finalizeTakeover(clientId, taskId, "conference_end");
  }
  return { ok: true, ignored: true };
}

export async function appendTakeoverTranscript(clientId, taskId, { role, message, partial } = {}) {
  const ref = tasksCol(clientId).doc(String(taskId));
  try {
    await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const next = mergeTakeoverLine(snap.data()?.takeoverTranscript, { role, message, partial });
      tx.update(ref, { takeoverTranscript: next });
    });
    return { ok: true };
  } catch (e) {
    log.warn("lisa.takeover.transcript_write_failed", { clientId, taskId, error: String(e?.message || e) });
    return { ok: false };
  }
}

export async function finalizeTakeover(clientId, taskId, reason = "ended") {
  const doc = await tasksCol(clientId).doc(String(taskId)).get();
  if (!doc.exists) return { ok: false, reason: "not_found" };
  const task = doc.data() || {};
  if (task.status !== "calling") return { ok: true, alreadyEnded: true };
  const take = task.takeover || {};
  if (take.status === "ended") return { ok: true, alreadyEnded: true };

  const extra = Array.isArray(task.takeoverTranscript) ? task.takeoverTranscript : [];
  const extraText = extra.map((l) => `${l.role}: ${l.message}`).join("\n");
  const transcriptText = [task.transcriptText, extraText].filter(Boolean).join("\n").slice(0, 20000);
  const who = task.contactName || task.phone || "Kontakt";

  await doc.ref.update({
    status: "done",
    outcome: "taken_over",
    resultSummary: "Der Chef hat das Gespräch übernommen.",
    dialogSummary: task.dialogSummary || "Gespräch vom Chef übernommen.",
    transcriptText: transcriptText || task.transcriptText || null,
    endedAt: FieldValue.serverTimestamp(),
    "takeover.status": "ended",
    "takeover.endedReason": reason,
    "takeover.endedAtMs": Date.now(),
  });

  try {
    await appendEvent(clientId, {
      id: `lisa-takeover-${task.id}`,
      channel: CHANNELS.LISA_CALL,
      direction: DIRECTIONS.OUT,
      type: EVENT_TYPES.OBSERVATION,
      counterparty: { kind: "unknown", name: who, ref: task.phone || null },
      subject: { name: task.contactName || "" },
      summary: `Der Chef hat das Gespräch mit ${who} übernommen und beendet.`,
      payloadRef: { kind: "lisa_task", id: task.id },
      extractor: "lisa@takeover",
      tags: ["lisa", "call", "takeover"],
    });
  } catch (e) {
    log.warn("lisa.takeover.brain_write_failed", { clientId, taskId, error: String(e?.message || e) });
  }

  log.info("lisa.takeover.finalized", { clientId, taskId, reason });
  return { ok: true };
}

export function takeoverInProgress(task) {
  const st = String(task?.takeover?.status || "");
  return st === "ringing" || st === "joined";
}
