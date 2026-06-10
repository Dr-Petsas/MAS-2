import { randomUUID, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { log } from "../log.js";

// ============================================================================
// Device registry — "Clara ruft aufs Handy".
//
// A doctor's phone is paired ONCE via QR code, then Clara can ring it any time
// with a Web-Push that looks like an incoming call. Design goals:
//
//   - Pairing is maximally easy: scan QR -> one tap -> done. The QR carries a
//     short-lived single-use token that is ALREADY bound to a team member
//     (operator), so the phone never has to type a PIN or log in.
//   - The phone gets a deviceKey (random secret, stored hashed). Subsequent
//     calls from the phone (/clara/session) authenticate with deviceId +
//     deviceKey instead of a PIN — Clara then knows WHO answers.
//   - The push payload never contains PII or medical content; just a short
//     neutral reason label ("Tagesbriefing") and the URL of the call page.
//
// Storage (per tenant):
//   clients/{clientId}/mas_pairing_tokens/{token}   — short-lived, single-use
//   clients/{clientId}/mas_devices/{deviceId}       — paired phones
// ============================================================================

const FieldValue = admin.firestore.FieldValue;

export const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000; // QR is valid for 10 minutes
const SECRET_PEPPER = "mas2.clara.device.v1";

// ── VAPID setup ─────────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY = (process.env.MAS_VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE_KEY = (process.env.MAS_VAPID_PRIVATE_KEY || "").trim();
const VAPID_SUBJECT = (process.env.MAS_VAPID_SUBJECT || "mailto:info@pickadoc.de").trim();

let vapidReady = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidReady = true;
  } catch (e) {
    log.warn("vapid setup failed", { error: String(e?.message || e) });
  }
}

export function pushConfigured() {
  return vapidReady;
}

export function vapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}

// ── Small helpers ───────────────────────────────────────────────────────────

function tokensCol(clientId) {
  return masCollection(clientId, "mas_pairing_tokens");
}
function devicesCol(clientId) {
  return masCollection(clientId, "mas_devices");
}

function hashSecret(clientId, secret) {
  return createHash("sha256").update(`${SECRET_PEPPER}:${clientId}:${String(secret)}`).digest("hex");
}

function safeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  try { return timingSafeEqual(ba, bb); } catch { return false; }
}

function s(v) { return String(v ?? "").trim(); }

/** Coarse platform from a User-Agent — for the device list UI only. */
export function platformFromUserAgent(ua = "") {
  const u = String(ua).toLowerCase();
  if (/iphone|ipad|ipod/.test(u)) return "ios";
  if (/android/.test(u)) return "android";
  if (/windows/.test(u)) return "windows";
  if (/macintosh|mac os/.test(u)) return "mac";
  return u ? "other" : "";
}

/** Validate the shape of a browser PushSubscription (endpoint + crypto keys). */
export function validateSubscription(sub) {
  if (!sub || typeof sub !== "object") return { ok: false, reason: "subscription_missing" };
  const endpoint = s(sub.endpoint);
  if (!/^https:\/\/.+/.test(endpoint)) return { ok: false, reason: "endpoint_invalid" };
  const p256dh = s(sub.keys?.p256dh);
  const auth = s(sub.keys?.auth);
  if (!p256dh || !auth) return { ok: false, reason: "keys_missing" };
  return { ok: true, subscription: { endpoint, keys: { p256dh, auth } } };
}

// ── Pairing tokens (the "new QR") ───────────────────────────────────────────

/**
 * Mint a short-lived, single-use pairing token bound to a team member. The
 * settings UI turns the returned URL into a QR code; whoever scans it within
 * the TTL becomes that operator's phone.
 */
export async function createPairingToken(clientId, operator, { createdBy = "" } = {}) {
  if (!s(clientId)) throw new Error("client_id_required");
  const opId = s(operator?.id);
  const opName = s(operator?.name);
  if (!opId || !opName) throw new Error("operator_required");
  // URL-safe, unguessable, short enough for a friendly QR.
  const token = randomBytes(18).toString("base64url");
  const now = Date.now();
  const doc = {
    token,
    operatorId: opId,
    operatorName: opName,
    role: s(operator?.role) || "frontdesk",
    doctorName: s(operator?.doctorName) || null,
    createdBy: s(createdBy) || null,
    createdAtMs: now,
    expiresAtMs: now + PAIRING_TOKEN_TTL_MS,
    usedAtMs: null,
    createdAt: FieldValue.serverTimestamp(),
  };
  await tokensCol(clientId).doc(token).set(doc);
  return doc;
}

/**
 * Redeem a pairing token: validates (exists, unused, unexpired), registers the
 * device and burns the token in one transaction. Returns the device plus the
 * one-time deviceKey the phone must store.
 */
export async function redeemPairingToken(clientId, token, { subscription, userAgent = "", label = "" } = {}) {
  if (!s(clientId) || !s(token)) return { ok: false, reason: "token_missing" };
  const v = validateSubscription(subscription);
  if (!v.ok) return { ok: false, reason: v.reason };

  const deviceId = `dev_${randomUUID().slice(0, 12)}`;
  const deviceKey = randomBytes(24).toString("base64url");
  const now = Date.now();

  const db = admin.firestore();
  const tokenRef = tokensCol(clientId).doc(s(token));
  const deviceRef = devicesCol(clientId).doc(deviceId);

  try {
    const operator = await db.runTransaction(async (tx) => {
      const snap = await tx.get(tokenRef);
      if (!snap.exists) throw Object.assign(new Error("token_unknown"), { code: "token_unknown" });
      const t = snap.data();
      if (t.usedAtMs) throw Object.assign(new Error("token_used"), { code: "token_used" });
      if (now > (t.expiresAtMs || 0)) throw Object.assign(new Error("token_expired"), { code: "token_expired" });

      tx.update(tokenRef, { usedAtMs: now, usedByDeviceId: deviceId });
      tx.set(deviceRef, {
        id: deviceId,
        operatorId: t.operatorId,
        operatorName: t.operatorName,
        role: t.role,
        doctorName: t.doctorName || null,
        label: s(label).slice(0, 80) || null,
        platform: platformFromUserAgent(userAgent),
        userAgent: s(userAgent).slice(0, 240) || null,
        subscription: v.subscription,
        secretHash: hashSecret(clientId, deviceKey),
        createdAtMs: now,
        lastSeenAtMs: now,
        lastPushAtMs: null,
        lastPushOk: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { id: t.operatorId, name: t.operatorName, role: t.role, doctorName: t.doctorName || null };
    });
    return { ok: true, deviceId, deviceKey, operator };
  } catch (e) {
    return { ok: false, reason: e?.code || String(e?.message || e) };
  }
}

// ── Device store ────────────────────────────────────────────────────────────

function publicDevice(d) {
  // Strip subscription + secret — neither belongs in any UI/API response.
  const { subscription, secretHash, userAgent, ...pub } = d;
  return pub;
}

export async function listDevices(clientId, { operatorId = "" } = {}) {
  let q = devicesCol(clientId);
  if (s(operatorId)) q = q.where("operatorId", "==", s(operatorId));
  const snap = await q.get();
  return snap.docs
    .map((d) => publicDevice(d.data()))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

export async function removeDevice(clientId, deviceId) {
  if (!s(deviceId)) return { ok: false, reason: "device_id_required" };
  await devicesCol(clientId).doc(s(deviceId)).delete();
  return { ok: true };
}

/**
 * Authenticate a phone by deviceId + deviceKey (the PIN-less path). On success
 * returns the operator identity and bumps lastSeen.
 */
export async function identifyByDevice(clientId, deviceId, deviceKey) {
  if (!s(deviceId) || !s(deviceKey)) return null;
  const snap = await devicesCol(clientId).doc(s(deviceId)).get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (!safeEq(hashSecret(clientId, s(deviceKey)), d.secretHash || "")) return null;
  snap.ref.update({ lastSeenAtMs: Date.now() }).catch(() => {});
  return { id: d.operatorId, name: d.operatorName, role: d.role, doctorName: d.doctorName || null, deviceId: d.id };
}

/**
 * The phone re-subscribes (push subscriptions can rotate, e.g. after browser
 * updates). Authenticated by deviceKey, updates the stored subscription.
 */
export async function refreshSubscription(clientId, deviceId, deviceKey, subscription) {
  const who = await identifyByDevice(clientId, deviceId, deviceKey);
  if (!who) return { ok: false, reason: "device_auth_failed" };
  const v = validateSubscription(subscription);
  if (!v.ok) return { ok: false, reason: v.reason };
  await devicesCol(clientId).doc(s(deviceId)).update({ subscription: v.subscription, lastSeenAtMs: Date.now() });
  return { ok: true };
}

// ── Ringing the phone ───────────────────────────────────────────────────────

/**
 * Build the (PII-free) push payload. The service worker turns this into a
 * call-style notification; tapping it opens the /m/call page which dials in.
 */
export function buildCallPayload({ publicBaseUrl, clientId, deviceId, reason = "", kind = "clara_call" } = {}) {
  const cleanReason = s(reason).slice(0, 90) || "Clara möchte dich sprechen";
  const url = `${String(publicBaseUrl || "").replace(/\/+$/, "")}/m/call.html` +
    `?c=${encodeURIComponent(clientId)}&d=${encodeURIComponent(deviceId)}&reason=${encodeURIComponent(cleanReason)}`;
  return { kind, title: "Clara ruft an", reason: cleanReason, url, ts: Date.now() };
}

/**
 * Send a call push to ONE device. 404/410 from the push service means the
 * subscription is dead (app uninstalled, permission revoked) -> device doc is
 * removed so the registry never accumulates corpses.
 */
export async function sendCallToDevice(clientId, device, { reason = "", publicBaseUrl = "" } = {}) {
  if (!vapidReady) return { ok: false, reason: "push_not_configured" };
  const sub = device?.subscription;
  if (!sub?.endpoint) return { ok: false, reason: "no_subscription" };
  const payload = buildCallPayload({ publicBaseUrl, clientId, deviceId: device.id, reason });
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      TTL: 90,            // a "call" older than 90s must not ring anymore
      urgency: "high",    // wake the device radio immediately
      topic: "clara-call", // collapse multiple pending calls into the latest
    });
    await devicesCol(clientId).doc(device.id).update({ lastPushAtMs: Date.now(), lastPushOk: true }).catch(() => {});
    return { ok: true };
  } catch (e) {
    const status = e?.statusCode || 0;
    if (status === 404 || status === 410) {
      await devicesCol(clientId).doc(device.id).delete().catch(() => {});
      log.info("push subscription gone, device removed", { clientId, deviceId: device.id, status });
      return { ok: false, reason: "subscription_gone", removed: true };
    }
    await devicesCol(clientId).doc(device.id).update({ lastPushAtMs: Date.now(), lastPushOk: false }).catch(() => {});
    log.warn("push send failed", { clientId, deviceId: device.id, status, error: String(e?.message || e).slice(0, 200) });
    return { ok: false, reason: `push_failed_${status || "unknown"}` };
  }
}

// ── Info-Push (Kontaktkarte & Co.) ──────────────────────────────────────────
// Anders als der Anruf-Push: normale Benachrichtigung statt "Clara ruft an",
// eigener Topic (verdrängt keine Anrufe), längere TTL. Achtung: hier KANN
// bewusst PII drinstehen (z.B. Patientenname + Telefonnummer auf Wunsch des
// Behandlers) — der Inhalt geht nur an dessen eigene gekoppelte Geräte.
export async function sendNoteToDevice(clientId, device, { title = "", body = "", url = "" } = {}) {
  if (!vapidReady) return { ok: false, reason: "push_not_configured" };
  const sub = device?.subscription;
  if (!sub?.endpoint) return { ok: false, reason: "no_subscription" };
  const payload = {
    kind: "clara_note",
    title: s(title).slice(0, 60) || "Clara",
    reason: s(body).slice(0, 180),
    url: s(url),
    ts: Date.now(),
  };
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      TTL: 6 * 3600,        // eine Info darf auch später noch ankommen
      urgency: "high",
      topic: "clara-note",  // mehrere Infos kollabieren zur letzten
    });
    await devicesCol(clientId).doc(device.id).update({ lastPushAtMs: Date.now(), lastPushOk: true }).catch(() => {});
    return { ok: true };
  } catch (e) {
    const status = e?.statusCode || 0;
    if (status === 404 || status === 410) {
      await devicesCol(clientId).doc(device.id).delete().catch(() => {});
      return { ok: false, reason: "subscription_gone", removed: true };
    }
    log.warn("note push failed", { clientId, deviceId: device.id, status, error: String(e?.message || e).slice(0, 200) });
    return { ok: false, reason: `push_failed_${status || "unknown"}` };
  }
}

/** Info-Push an ALLE Geräte eines Teammitglieds. */
export async function notifyOperator(clientId, operatorId, { title = "", body = "", url = "" } = {}) {
  const snap = await devicesCol(clientId).where("operatorId", "==", s(operatorId)).get();
  if (snap.empty) return { ok: false, reason: "no_devices", sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const r = await sendNoteToDevice(clientId, doc.data(), { title, body, url });
    if (r.ok) sent++; else failed++;
  }
  return { ok: sent > 0, sent, failed };
}

/** Ring one specific device by id. */
export async function callDevice(clientId, deviceId, { reason = "", publicBaseUrl = "" } = {}) {
  const snap = await devicesCol(clientId).doc(s(deviceId)).get();
  if (!snap.exists) return { ok: false, reason: "device_unknown" };
  return sendCallToDevice(clientId, snap.data(), { reason, publicBaseUrl });
}

// ── Pending call context ("WARUM ruft Clara an?") ───────────────────────────
//
// Wenn Clara den Behandler proaktiv per Push anruft (z.B. Recall-Initiative),
// wird der Anlass hier persistiert. Verbindet sich der Behandler daraufhin,
// holt der Voice-Worker den Kontext EINMALIG ab und eröffnet das Gespräch
// thematisch ("Ich habe dich angerufen: morgen sind 3 Stunden frei ...").

const PENDING_CONTEXT_TTL_MS = 2 * 60 * 60 * 1000; // nach 2h ist der Anlass kalt

function pendingContextRef(clientId) {
  return masCollection(clientId, "mas_config").doc("pending_call_context");
}

/** Anlass eines proaktiven Clara-Anrufs hinterlegen (überschreibt den alten). */
export async function setPendingCallContext(clientId, { kind = "", reason = "", spoken = "", instruction = "", date = "" } = {}) {
  await pendingContextRef(clientId).set({
    kind: s(kind),
    reason: s(reason),
    spoken: s(spoken),
    instruction: s(instruction),
    date: s(date),
    createdAtMs: Date.now(),
    consumedAtMs: null,
  });
  return { ok: true };
}

/** Kontext einmalig abholen (markiert ihn als verbraucht). Null wenn keiner/zu alt. */
export async function consumePendingCallContext(clientId) {
  const ref = pendingContextRef(clientId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const c = snap.data();
  if (c.consumedAtMs) return null;
  if (Date.now() - (c.createdAtMs || 0) > PENDING_CONTEXT_TTL_MS) return null;
  await ref.update({ consumedAtMs: Date.now() });
  return c;
}

/** Kontext verwerfen (z.B. wenn die Initiative per Sprache beantwortet wurde). */
export async function clearPendingCallContext(clientId) {
  await pendingContextRef(clientId).set({ consumedAtMs: Date.now() }, { merge: true }).catch(() => {});
  return { ok: true };
}

/** Ring ALL phones of one team member (a person can pair more than one). */
export async function callOperator(clientId, operatorId, { reason = "", publicBaseUrl = "" } = {}) {
  const snap = await devicesCol(clientId).where("operatorId", "==", s(operatorId)).get();
  if (snap.empty) return { ok: false, reason: "no_devices", sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const r = await sendCallToDevice(clientId, doc.data(), { reason, publicBaseUrl });
    if (r.ok) sent++; else failed++;
  }
  return { ok: sent > 0, sent, failed };
}
