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

export const PAIRING_TOKEN_TTL_MS = 30 * 60 * 1000; // QR/Code 30 Min gueltig (getippter Code braucht Luft)
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

// ── Arbeitsplatz-Felder (Gerätetyp + erlaubte Apps) ─────────────────────────
// Additiv zum bestehenden Handy-Pairing: ein Gerät traegt jetzt optional einen
// Typ (Handy/iPad) und die Apps, die es zeigen darf. Bestandsgeraete OHNE diese
// Felder gelten als "phone"/["clara"] — byte-identisch zum Alt-Verhalten.
export const WORKPLACE_APPS = ["clara", "lena", "sophie"];

function normalizeDeviceType(v) {
  return s(v).toLowerCase() === "ipad" ? "ipad" : "phone";
}

/** Erlaubte Apps saeubern; leere/ungueltige Eingabe -> sinnvoller Default je Typ. */
function normalizeApps(apps, deviceType = "phone") {
  if (Array.isArray(apps)) {
    const clean = Array.from(new Set(
      apps.map((a) => s(a).toLowerCase()).filter((a) => WORKPLACE_APPS.includes(a)),
    ));
    if (clean.length) return clean;
  }
  return deviceType === "ipad" ? ["clara", "lena", "sophie"] : ["clara"];
}

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

// Kurzer, EINTIPPBARER Kopplungscode (zusaetzlich zum QR-Token). Auf iOS ist die
// QR-/Link-Kopplung fragil: Apple gibt der installierten PWA einen vom Safari
// getrennten Speicher UND cached das Manifest aggressiv — der per Link/QR
// uebergebene Token kann daher in der App verloren gehen ("kein Verbindungscode
// gefunden"). Der getippte Code laeuft komplett ohne Link/Speicher/Manifest:
// der Code steht auf dem Bildschirm, der Nutzer tippt ihn in die App. Alphabet
// ohne verwechselbare Zeichen (kein 0/O/1/I).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(n = 6) {
  const b = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) out += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return out;
}

// Root-Lookup Code -> {clientId, token}. Bewusst KEINE mas_-Collection und KEIN
// collectionGroup: ein einzelner Dokument-Get per Code-ID, ganz ohne Index. So
// loest das Handy den Mandanten allein aus dem getippten Code auf.
function codesCol() {
  return admin.firestore().collection("clara_pairing_codes");
}

// Freien, noch nicht (gueltig) vergebenen Kurzcode finden.
async function reserveCode() {
  const now = Date.now();
  for (let i = 0; i < 6; i++) {
    const code = genCode(6);
    const snap = await codesCol().doc(code).get();
    if (!snap.exists) return code;
    const d = snap.data() || {};
    if (now > (d.expiresAtMs || 0)) return code; // abgelaufen -> wiederverwendbar
  }
  return genCode(8); // extrem unwahrscheinlich: laenger -> praktisch kollisionsfrei
}

/**
 * Mint a short-lived, single-use pairing token bound to a team member. The
 * settings UI turns the returned URL into a QR code; whoever scans it within
 * the TTL becomes that operator's phone. Additionally carries a short, typeable
 * ``code`` for the iOS-safe manual pairing path.
 */
export async function createPairingToken(clientId, operator, { createdBy = "", deviceType = "", apps = null, userId = "" } = {}) {
  if (!s(clientId)) throw new Error("client_id_required");
  const opId = s(operator?.id);
  const opName = s(operator?.name);
  if (!opId || !opName) throw new Error("operator_required");
  // URL-safe, unguessable, short enough for a friendly QR.
  const token = randomBytes(18).toString("base64url");
  const code = await reserveCode();
  const now = Date.now();
  const expiresAtMs = now + PAIRING_TOKEN_TTL_MS;
  const dtype = normalizeDeviceType(deviceType);
  const doc = {
    token,
    code,
    operatorId: opId,
    operatorName: opName,
    role: s(operator?.role) || "frontdesk",
    doctorName: s(operator?.doctorName) || null,
    // Arbeitsplatz: Gerätetyp + erlaubte Apps + verknuepfter Plattform-User.
    deviceType: dtype,
    apps: normalizeApps(apps, dtype),
    userId: s(userId) || s(operator?.userId) || null,
    createdBy: s(createdBy) || null,
    createdAtMs: now,
    expiresAtMs,
    usedAtMs: null,
    createdAt: FieldValue.serverTimestamp(),
  };
  await tokensCol(clientId).doc(token).set(doc);
  // Root-Lookup fuer den getippten Code (iOS-sicher, ohne Index/collectionGroup).
  await codesCol().doc(code).set({ clientId, token, expiresAtMs, createdAtMs: now });
  return doc;
}

/**
 * Redeem by the short typed CODE — resolves the tenant itself (collectionGroup),
 * so the phone needs nothing but the code + its push subscription. Bulletproof
 * on iOS: no link, no manifest, no cross-context storage involved.
 */
export async function redeemPairingCode(codeRaw, { subscription, userAgent = "", label = "" } = {}) {
  const code = s(codeRaw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4) return { ok: false, reason: "code_missing" };
  const now = Date.now();
  const snap = await codesCol().doc(code).get();
  if (!snap.exists) return { ok: false, reason: "token_unknown" };
  const m = snap.data() || {};
  if (now > (m.expiresAtMs || 0)) return { ok: false, reason: "token_expired" };
  if (!m.clientId || !m.token) return { ok: false, reason: "token_unknown" };
  const r = await redeemPairingToken(m.clientId, m.token, { subscription, userAgent, label });
  if (r.ok) {
    await codesCol().doc(code).delete().catch(() => {}); // verbraucht -> aufraeumen
    return { ...r, clientId: m.clientId };
  }
  return r;
}

/**
 * Redeem a pairing token: validates (exists, unused, unexpired), registers the
 * device and burns the token in one transaction. Returns the device plus the
 * one-time deviceKey the phone must store.
 */
export async function redeemPairingToken(clientId, token, { subscription, userAgent = "", label = "" } = {}) {
  if (!s(clientId) || !s(token)) return { ok: false, reason: "token_missing" };

  const db = admin.firestore();
  const tokenRef = tokensCol(clientId).doc(s(token));

  // Peek at the token to learn the device type. Console devices (iPad launcher)
  // may pair WITHOUT a web-push subscription — they are a display, not something
  // Clara rings. Phones (and any device that DOES send a subscription) keep the
  // strict validation, so the "Clara ruft aufs Handy"-path is byte-identical.
  const peek = await tokenRef.get().catch(() => null);
  const isConsole = peek?.exists && normalizeDeviceType(peek.data()?.deviceType) === "ipad";
  let sub = null;
  if (subscription || !isConsole) {
    const v = validateSubscription(subscription);
    if (!v.ok) return { ok: false, reason: v.reason };
    sub = v.subscription;
  }

  const deviceId = `dev_${randomUUID().slice(0, 12)}`;
  const deviceKey = randomBytes(24).toString("base64url");
  const now = Date.now();

  const deviceRef = devicesCol(clientId).doc(deviceId);

  try {
    const operator = await db.runTransaction(async (tx) => {
      const snap = await tx.get(tokenRef);
      if (!snap.exists) throw Object.assign(new Error("token_unknown"), { code: "token_unknown" });
      const t = snap.data();
      if (t.usedAtMs) throw Object.assign(new Error("token_used"), { code: "token_used" });
      if (now > (t.expiresAtMs || 0)) throw Object.assign(new Error("token_expired"), { code: "token_expired" });

      tx.update(tokenRef, { usedAtMs: now, usedByDeviceId: deviceId });
      const dtype = normalizeDeviceType(t.deviceType);
      tx.set(deviceRef, {
        id: deviceId,
        operatorId: t.operatorId,
        operatorName: t.operatorName,
        role: t.role,
        doctorName: t.doctorName || null,
        // Arbeitsplatz-Felder aus dem Token uebernehmen (Bestand ohne Token-
        // Felder => "phone"/["clara"], byte-identisch zum Alt-Verhalten).
        deviceType: dtype,
        apps: normalizeApps(t.apps, dtype),
        userId: t.userId || null,
        label: s(label).slice(0, 80) || null,
        platform: platformFromUserAgent(userAgent),
        userAgent: s(userAgent).slice(0, 240) || null,
        subscription: sub,
        secretHash: hashSecret(clientId, deviceKey),
        createdAtMs: now,
        lastSeenAtMs: now,
        lastPushAtMs: null,
        lastPushOk: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { id: t.operatorId, name: t.operatorName, role: t.role, doctorName: t.doctorName || null, apps: normalizeApps(t.apps, dtype), deviceType: dtype, userId: t.userId || null };
    });
    // Same phone, fresh pairing: now that the NEW registration is committed,
    // drop any earlier docs that used this exact push endpoint. Each redeem
    // mints a brand-new deviceId, so without this the registry accumulated
    // duplicates of ONE device — and removing "the" device in the UI left
    // older duplicates that kept ringing. Runs AFTER the transaction so a
    // failed re-redeem (token_used/expired) never deletes the good device.
    // Only relevant for push devices (an endpoint identifies one physical phone).
    if (sub?.endpoint) await deleteDevicesByEndpoint(clientId, sub.endpoint, { exceptId: deviceId }).catch(() => {});
    return { ok: true, deviceId, deviceKey, operator, apps: operator.apps, deviceType: operator.deviceType };
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

/**
 * Delete every device doc for this tenant whose push subscription shares the
 * given endpoint. One physical phone == one endpoint, so this keeps the
 * registry free of duplicates and makes both re-pairing and unpairing
 * idempotent. Returns the number of docs removed.
 */
async function deleteDevicesByEndpoint(clientId, endpoint, { exceptId = "" } = {}) {
  const ep = s(endpoint);
  if (!ep) return 0;
  const snap = await devicesCol(clientId).where("subscription.endpoint", "==", ep).get();
  let removed = 0;
  await Promise.all(snap.docs.map((d) => {
    if (exceptId && d.id === s(exceptId)) return null;
    removed++;
    return d.ref.delete().catch(() => {});
  }));
  return removed;
}

/**
 * Update the workplace metadata of a paired device (label, device type, allowed
 * apps) from the settings UI. Never touches the push subscription or secret.
 */
export async function updateDevice(clientId, deviceId, { label, apps, deviceType } = {}) {
  if (!s(deviceId)) return { ok: false, reason: "device_id_required" };
  const ref = devicesCol(clientId).doc(s(deviceId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "device_unknown" };
  const cur = snap.data() || {};
  const patch = {};
  if (label !== undefined) patch.label = s(label).slice(0, 80) || null;
  if (deviceType !== undefined) patch.deviceType = normalizeDeviceType(deviceType);
  if (apps !== undefined) {
    patch.apps = normalizeApps(apps, patch.deviceType || cur.deviceType || "phone");
  }
  if (Object.keys(patch).length === 0) return { ok: true, unchanged: true };
  patch.updatedAtMs = Date.now();
  await ref.update(patch);
  return { ok: true, device: publicDevice({ ...cur, ...patch }) };
}

export async function removeDevice(clientId, deviceId) {
  if (!s(deviceId)) return { ok: false, reason: "device_id_required" };
  const ref = devicesCol(clientId).doc(s(deviceId));
  const snap = await ref.get();
  const endpoint = snap.exists ? s(snap.data()?.subscription?.endpoint) : "";
  await ref.delete();
  // Belt-and-suspenders: also drop any legacy sibling docs sharing this phone's
  // push endpoint, so the phone truly stops ringing after a single "Entfernen".
  const siblingsRemoved = endpoint
    ? await deleteDevicesByEndpoint(clientId, endpoint, { exceptId: s(deviceId) }).catch(() => 0)
    : 0;
  return { ok: true, siblingsRemoved };
}

/**
 * Phone-initiated unpair: the phone deletes its OWN registration, authenticated
 * by deviceKey (same PIN-less trust as refresh/self-test), and clears sibling
 * duplicates sharing its push endpoint. The phone additionally unsubscribes its
 * browser PushSubscription locally — server-side we can only drop the record.
 */
export async function removeOwnDevice(clientId, deviceId, deviceKey) {
  if (!s(deviceId) || !s(deviceKey)) return { ok: false, reason: "device_auth_failed" };
  const ref = devicesCol(clientId).doc(s(deviceId));
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, alreadyGone: true };
  const d = snap.data();
  if (!safeEq(hashSecret(clientId, s(deviceKey)), d.secretHash || "")) {
    return { ok: false, reason: "device_auth_failed" };
  }
  const endpoint = s(d.subscription?.endpoint);
  await ref.delete();
  if (endpoint) await deleteDevicesByEndpoint(clientId, endpoint, { exceptId: s(deviceId) }).catch(() => {});
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
export async function sendNoteToDevice(clientId, device, { title = "", body = "", url = "", image = "" } = {}) {
  if (!vapidReady) return { ok: false, reason: "push_not_configured" };
  const sub = device?.subscription;
  if (!sub?.endpoint) return { ok: false, reason: "no_subscription" };
  const payload = {
    kind: "clara_note",
    title: s(title).slice(0, 60) || "Clara",
    reason: s(body).slice(0, 180),
    url: s(url),
    image: s(image),
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

/** Termin-/Abwesenheits-Bildbeleg an alle gekoppelten Handys (best effort, kein Anruf-Push). */
export async function notifyProofToDevices(clientId, proof) {
  const snap = await devicesCol(clientId).get();
  if (snap.empty) return { ok: false, reason: "no_devices", sent: 0, failed: 0 };
  const defaultTitle = proof?.kind === "absence" ? "Abwesenheit eingetragen" : "Termin eingetragen";
  const title = s(proof?.title).slice(0, 60) || defaultTitle;
  const body = proof?.kind === "absence"
    ? [
        proof?.dateLabel && `${proof.dateLabel}`,
        proof?.windowLabel && `${proof.windowLabel}`,
        proof?.calendarName && `bei ${proof.calendarName}`,
      ].filter(Boolean).join(" · ").slice(0, 180)
    : [
        proof?.patient && `${proof.patient}`,
        proof?.slotLabel && `${proof.slotLabel}`,
        proof?.calendarName && `bei ${proof.calendarName}`,
      ].filter(Boolean).join(" · ").slice(0, 180);
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const url = proof?.proofId
    ? `${base}/m/call.html?c=${encodeURIComponent(clientId)}&proof=${encodeURIComponent(proof.proofId)}`
    : `${base}/m/call.html?c=${encodeURIComponent(clientId)}`;
  let sent = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const r = await sendNoteToDevice(clientId, doc.data(), {
      title,
      body,
      url,
      image: s(proof?.imageUrl),
    });
    if (r.ok) sent++; else failed++;
  }
  return { ok: sent > 0, sent, failed };
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
