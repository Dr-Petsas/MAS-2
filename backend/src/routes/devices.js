// Geraete-Kopplung (/clara/devices*): Pairing, Push-Registrierung, Selbsttest.
// Mechanischer W1.2-Split aus server.js (04.07.2026): Pfade und Handler
// byte-identisch uebernommen, nur app. -> router. Kein Verhalten geaendert.
import express from "express";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { assertAppEnabled } from "../entitlements.js";
import { listOperators, normalizeRole } from "../clara/operators.js";
import { createPairingToken, redeemPairingToken, redeemPairingCode, listDevices, removeDevice, removeOwnDevice, identifyByDevice, refreshSubscription, callDevice, vapidPublicKey, pushConfigured } from "../clara/devices.js";
import { log } from "../log.js";
import { PUBLIC_BASE_URL, resolveClientId } from "./_shared.js";

const router = express.Router();


// ── Clara ruft aufs Handy: Geräte-Pairing + Web-Push ────────────────────────
// Pairing: settings UI mints a single-use QR token bound to a team member; the
// phone scans it, subscribes to Web-Push and registers. From then on Clara can
// ring that phone with a call-style notification, and the phone authenticates
// PIN-less via deviceId+deviceKey. NOTE: these routes must stay ABOVE the
// GET /clara/:clientId catch-all.

// Public: the phone needs the VAPID public key to subscribe.
router.get("/clara/devices/vapid-key", (req, res) => {
  if (!pushConfigured()) return res.status(503).json({ ok: false, error: "push_not_configured" });
  res.json({ ok: true, key: vapidPublicKey() });
});


// Authenticated (settings UI): mint a pairing token + QR for one team member.
router.post("/clara/devices/pairing-token", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    if (!pushConfigured()) return res.status(503).json({ ok: false, error: "push_not_configured" });
    // The person can be an existing team/PIN operator (operatorId) OR any
    // practice member by name — pairing must not require a separate team setup.
    const operatorId = (req.body?.operatorId || "").trim();
    const name = (req.body?.name || "").trim();
    const members = await listOperators(clientId);
    let op = operatorId ? members.find((m) => m.id === operatorId) : null;
    if (!op && name) {
      op = members.find((m) => m.name.toLowerCase() === name.toLowerCase()) || {
        id: `usr_${(req.body?.userId || "").trim() || randomUUID().slice(0, 8)}`,
        name,
        role: normalizeRole(req.body?.role),
        doctorName: null,
      };
    }
    if (!op) return res.status(400).json({ ok: false, error: "operator_unknown" });
    const t = await createPairingToken(clientId, op, { createdBy: req.auth?.userId || "" });
    const url = `${PUBLIC_BASE_URL}/m/pair.html?c=${encodeURIComponent(clientId)}&t=${encodeURIComponent(t.token)}`;
    let qrDataUrl = "";
    try { qrDataUrl = await QRCode.toDataURL(url, { width: 280, margin: 1 }); } catch { qrDataUrl = ""; }
    res.json({ ok: true, token: t.token, code: t.code, url, qrDataUrl, expiresAtMs: t.expiresAtMs, operator: { id: op.id, name: op.name, role: op.role } });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Public (token-gated): the phone redeems the QR token with its push subscription.
router.post("/clara/devices/register", async (req, res) => {
  try {
    const clientId = (req.body?.clientId || req.query?.clientId || "").trim();
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    if (!(await assertAppEnabled(clientId, "clara"))) {
      return res.status(403).json({ error: "clara_not_entitled", clientId });
    }
    const r = await redeemPairingToken(clientId, req.body?.token, {
      subscription: req.body?.subscription,
      userAgent: req.header("User-Agent") || "",
      label: req.body?.label || "",
    });
    if (!r.ok) return res.status(400).json({ ok: false, error: r.reason });
    log.info("device paired", { requestId: req.requestId, clientId, deviceId: r.deviceId, operatorId: r.operator?.id });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Public (code-gated): iOS-sicherer Weg — die App schickt nur den getippten
// Code + ihre Push-Subscription. Den Mandanten loest der Code selbst auf
// (collectionGroup), also braucht das Handy weder clientId noch Link/Manifest.
router.post("/clara/devices/register-code", async (req, res) => {
  try {
    const code = (req.body?.code || "").trim();
    if (!code) return res.status(400).json({ ok: false, error: "code_required" });
    const r = await redeemPairingCode(code, {
      subscription: req.body?.subscription,
      userAgent: req.header("User-Agent") || "",
      label: req.body?.label || "",
    });
    if (!r.ok) {
      const gone = ["token_unknown", "token_used", "token_expired", "code_missing"].includes(r.reason);
      return res.status(gone ? 410 : 400).json({ ok: false, error: r.reason });
    }
    if (!(await assertAppEnabled(r.clientId, "clara"))) {
      return res.status(403).json({ ok: false, error: "clara_not_entitled" });
    }
    log.info("device paired (code)", { requestId: req.requestId, clientId: r.clientId, deviceId: r.deviceId, operatorId: r.operator?.id });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Public (deviceKey-gated): subscriptions rotate; the phone re-registers its own.
router.post("/clara/devices/refresh", async (req, res) => {
  try {
    const clientId = (req.body?.clientId || "").trim();
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const r = await refreshSubscription(clientId, req.body?.deviceId, req.body?.deviceKey, req.body?.subscription);
    if (!r.ok) return res.status(401).json({ ok: false, error: r.reason });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Public (deviceKey-gated): the phone unpairs ITSELF — deletes its server-side
// registration so Clara stops ringing it. The phone additionally unsubscribes
// its own browser PushSubscription (see /m/pair.html). Without this route the
// phone-side "Entfernen" only cleared local storage while the device kept
// ringing from the server.
router.post("/clara/devices/unpair", async (req, res) => {
  try {
    const clientId = (req.body?.clientId || "").trim();
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const r = await removeOwnDevice(clientId, req.body?.deviceId, req.body?.deviceKey);
    if (!r.ok) return res.status(401).json({ ok: false, error: r.reason });
    log.info("device unpaired (self)", { requestId: req.requestId, clientId, deviceId: req.body?.deviceId });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Authenticated: device list for the settings UI (no secrets, no endpoints).
router.get("/clara/devices", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const devices = await listDevices(clientId, { operatorId: (req.query?.operatorId || "").trim() });
    res.json({ ok: true, devices, pushConfigured: pushConfigured() });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


router.delete("/clara/devices/:id", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const r = await removeDevice(clientId, req.params.id);
    log.info("device removed", { requestId: req.requestId, clientId, deviceId: req.params.id });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Public (deviceKey-gated): the phone rings ITSELF — onboarding self-test.
router.post("/clara/devices/self-test", async (req, res) => {
  try {
    const clientId = (req.body?.clientId || "").trim();
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const who = await identifyByDevice(clientId, req.body?.deviceId, req.body?.deviceKey);
    if (!who) return res.status(401).json({ ok: false, error: "device_auth_failed" });
    const r = await callDevice(clientId, who.deviceId, {
      reason: "Probeanruf – so klingt es, wenn Clara dich anruft",
      publicBaseUrl: PUBLIC_BASE_URL,
    });
    res.status(r.ok ? 200 : 502).json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});


// Authenticated: ring one device ("Probeanruf" from the settings UI).
router.post("/clara/devices/:id/test-call", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    const reason = (req.body?.reason || "Probeanruf aus den Einstellungen").trim();
    const r = await callDevice(clientId, req.params.id, { reason, publicBaseUrl: PUBLIC_BASE_URL });
    res.status(r.ok ? 200 : 502).json(r);
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

export default router;
