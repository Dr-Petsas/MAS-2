import crypto from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { appendEvent } from "../brain/eventStore.js";
import { CHANNELS, EVENT_TYPES, DIRECTIONS } from "../brain/events.js";
import { log } from "../log.js";
import { normalizePhoneE164 } from "./outbound.js";

// ============================================================================
// Lisa — Gespräch übernehmen (Chef 14.08.2026, Ein-Klick 14.08. abends)
//
// Ein Tipp auf dem Flip. Keine Nummer, kein Rückruf. Der Chef spricht
// auf demselben Gerät weiter (Twilio Voice JS). Lisa bleibt in der Leitung
// und wird stumm.
// Ablauf:
//   1. Gerät holt ein kurzes Voice-Token (deviceKey-gesichert).
//   2. Browser verbindet per WebRTC. TwiML legt den Chef in die Konferenz
//      `lisa-{taskId}` und zieht Patient + Lisa nach (Lisa stumm).
//   3. Task bleibt `calling`, Poll + Transkript laufen weiter.
//   4. Chef legt auf / Zurück → Konferenz endet → Task done / taken_over.
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

async function resolveVoiceFrom(legs = [], task = {}) {
  const fromTask = normalizePhoneE164(task.voiceFrom);
  if (fromTask) return fromTask;
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

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlRaw(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Twilio Voice Access Token (HS256, ohne das twilio-npm-Paket). */
export function mintVoiceToken({
  accountSid,
  apiKey,
  apiSecret,
  identity,
  applicationSid,
  ttlSec = 300,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${apiKey}-${now}`,
    iss: apiKey,
    sub: accountSid,
    exp: now + Math.max(60, Number(ttlSec) || 300),
    grants: {
      identity: String(identity || "chef"),
      voice: {
        outgoing: { application_sid: String(applicationSid || "") },
        incoming: { allow: false },
      },
    },
  };
  const head = b64urlJson(header);
  const body = b64urlJson(payload);
  const sig = crypto.createHmac("sha256", String(apiSecret || "")).update(`${head}.${body}`).digest();
  return `${head}.${body}.${b64urlRaw(sig)}`;
}

export function decodeVoiceToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

let voiceInfraCache = null;

async function findOrCreateTwimlApp() {
  const voiceUrl = `${PUBLIC_BASE_URL}/lisa/twilio/browser-join`;
  const fromEnv = env("TWILIO_TWIML_APP_SID");
  let sid = fromEnv;
  if (!sid) {
    const listed = await twilioGet("/Applications.json", "FriendlyName=lisa-browser-takeover&PageSize=5");
    const hit = Array.isArray(listed.data?.applications) ? listed.data.applications[0] : null;
    sid = String(hit?.sid || "");
  }
  if (!sid) {
    const created = await twilioPost("/Applications.json", {
      FriendlyName: "lisa-browser-takeover",
      VoiceUrl: voiceUrl,
      VoiceMethod: "POST",
    });
    if (!created.ok) return { ok: false, reason: "voice_app_failed", error: created.error };
    sid = String(created.data?.sid || "");
  }
  if (!sid) return { ok: false, reason: "voice_app_failed" };
  await twilioPost(`/Applications/${encodeURIComponent(sid)}.json`, {
    VoiceUrl: voiceUrl,
    VoiceMethod: "POST",
  }).catch(() => {});
  return { ok: true, sid };
}

async function findOrCreateApiKey() {
  const key = env("TWILIO_API_KEY");
  const secret = env("TWILIO_API_SECRET");
  if (key && secret) return { ok: true, key, secret };
  const created = await twilioPost("/Keys.json", { FriendlyName: "lisa-browser-takeover" });
  if (!created.ok || !created.data?.sid || !created.data?.secret) {
    return { ok: false, reason: "voice_key_failed", error: created.error };
  }
  log.warn("lisa.takeover.api_key_created", {
    sid: created.data.sid,
    hint: "TWILIO_API_KEY / TWILIO_API_SECRET in .env setzen, sonst entsteht beim Neustart ein neuer Key.",
  });
  return { ok: true, key: String(created.data.sid), secret: String(created.data.secret) };
}

export async function ensureVoiceInfra() {
  if (voiceInfraCache?.ok) return voiceInfraCache;
  if (!twilioConfigured()) return { ok: false, reason: "twilio_not_configured" };
  const key = await findOrCreateApiKey();
  if (!key.ok) return key;
  const app = await findOrCreateTwimlApp();
  if (!app.ok) return app;
  voiceInfraCache = {
    ok: true,
    accountSid: env("TWILIO_ACCOUNT_SID"),
    apiKey: key.key,
    apiSecret: key.secret,
    applicationSid: app.sid,
  };
  return voiceInfraCache;
}

export const TAKEOVER_REASON_DE = {
  twilio_not_configured: "Übernahme ist hier nicht eingerichtet.",
  not_found: "Diesen Anruf finde ich nicht mehr.",
  not_a_call: "Das ist kein Telefonat.",
  need_phone: "Bitte Ihre Nummer eintragen — wir rufen Sie an.",
  no_call_sid: "Die Leitung ist noch nicht greifbar. Gleich noch einmal.",
  no_voice_from: "Die Praxisnummer zum Zurückrufen fehlt.",
  chef_is_from: "Das ist Lisas Nummer. Bitte Ihre eigene eintragen.",
  chef_dial_failed: "Ihr Telefon war nicht erreichbar.",
  voice_app_failed: "Die Direktleitung ist nicht eingerichtet.",
  voice_key_failed: "Die Direktleitung ist nicht eingerichtet.",
  voice_token_failed: "Verbindungstoken fehlgeschlagen. Noch einmal tippen.",
};

/**
 * Ein Klick: Token für das Gerät. Die Leitungen werden umgelegt, sobald
 * der Browser die TwiML-Konferenz betritt (onBrowserJoin).
 */
export async function takeoverLisaCall(clientId, taskId, { deviceId } = {}) {
  if (!twilioConfigured()) {
    log.warn("lisa.takeover.denied", { clientId, taskId, reason: "twilio_not_configured" });
    return { ok: false, reason: "twilio_not_configured" };
  }
  const doc = await tasksCol(clientId).doc(String(taskId)).get();
  if (!doc.exists) return { ok: false, reason: "not_found" };
  const task = doc.data() || {};
  if (task.kind !== "call") return { ok: false, reason: "not_a_call" };
  if (task.status !== "calling") {
    return { ok: true, alreadyEnded: true, phone: task.phone || "", contactName: task.contactName || "" };
  }

  const take = task.takeover && typeof task.takeover === "object" ? task.takeover : {};
  if (take.status === "joined" && take.via === "browser" && take.tokenFresh === false) {
    return { ok: true, joined: true, phone: task.phone || "", contactName: task.contactName || "" };
  }

  const callSid = String(task.callSid || "").trim() || await findLiveCallSid(task.phone);
  if (!callSid) {
    log.warn("lisa.takeover.denied", { clientId, taskId, reason: "no_call_sid" });
    return { ok: false, reason: "no_call_sid" };
  }
  if (!task.callSid && callSid) {
    await doc.ref.update({ callSid }).catch(() => {});
  }

  const infra = await ensureVoiceInfra();
  if (!infra.ok) {
    log.warn("lisa.takeover.denied", { clientId, taskId, reason: infra.reason });
    return { ok: false, reason: infra.reason };
  }

  const identity = `lisa-${String(taskId).replace(/[^A-Za-z0-9]/g, "").slice(0, 20)}-${String(deviceId || "chef").replace(/[^A-Za-z0-9]/g, "").slice(0, 8)}`;
  const token = mintVoiceToken({
    accountSid: infra.accountSid,
    apiKey: infra.apiKey,
    apiSecret: infra.apiSecret,
    identity,
    applicationSid: infra.applicationSid,
  });
  if (!token || token.split(".").length !== 3) {
    return { ok: false, reason: "voice_token_failed" };
  }

  const name = conferenceName(taskId);
  await doc.ref.update({
    takeover: {
      status: take.status === "joined" ? "joined" : "ringing",
      via: "browser",
      conferenceName: name,
      identity,
      startedAtMs: take.startedAtMs || Date.now(),
    },
  });

  log.info("lisa.takeover.browser_token", { clientId, taskId, identity });
  return {
    ok: true,
    via: "browser",
    token,
    identity,
    conferenceName: name,
    ringing: take.status !== "joined",
    joined: take.status === "joined",
    phone: task.phone || "",
    contactName: task.contactName || "",
  };
}

/** TwiML für den Browser-Chef + Leitungen umlegen. */
export function onBrowserJoin(clientId, taskId) {
  const name = conferenceName(taskId);
  joinLisaConference(clientId, taskId).catch((e) => {
    log.warn("lisa.takeover.browser_redirect_failed", {
      clientId,
      taskId,
      error: String(e?.message || e),
    });
  });
  return conferenceTwiml({
    name,
    muted: false,
    endOnExit: true,
    label: "chef",
    transcribeUrl: transcribeUrl(clientId, taskId, "chef"),
    statusCallback: conferenceStatusUrl(clientId, taskId),
  });
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
