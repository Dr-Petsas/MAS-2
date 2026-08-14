import express from "express";
import { log } from "../log.js";
import {
  twilioSignatureOk,
  parseTranscriptionPayload,
  appendTakeoverTranscript,
  onChefCallStatus,
  onConferenceStatus,
} from "../lisa/takeover.js";

// Twilio-Webhooks für Lisa-Gesprächsübernahme. Public in auth.js — die
// Prüfung ist die Twilio-Signatur (X-Twilio-Signature + AUTH_TOKEN).

const router = express.Router();
router.use("/lisa/twilio", express.urlencoded({ extended: false }));

function s(v) {
  return String(v ?? "").trim();
}

function webhookUrl(req) {
  const base = (process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4000").trim().replace(/\/+$/, "");
  return `${base}${req.originalUrl || req.url || ""}`;
}

function signed(req, res) {
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const sig = req.get("X-Twilio-Signature") || "";
  if (!twilioSignatureOk(token, webhookUrl(req), req.body || {}, sig)) {
    log.warn("lisa.twilio.bad_signature", { path: req.path });
    res.sendStatus(403);
    return false;
  }
  return true;
}

function ids(req) {
  return { clientId: s(req.params.clientId), taskId: s(req.params.taskId) };
}

router.post("/lisa/twilio/chef/:clientId/:taskId", async (req, res) => {
  if (!signed(req, res)) return;
  const { clientId, taskId } = ids(req);
  if (!clientId || !taskId) return res.sendStatus(400);
  try {
    await onChefCallStatus(clientId, taskId, req.body || {});
  } catch (e) {
    log.warn("lisa.twilio.chef_status_error", { error: String(e?.message || e) });
  }
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});

router.post("/lisa/twilio/conference/:clientId/:taskId", async (req, res) => {
  if (!signed(req, res)) return;
  const { clientId, taskId } = ids(req);
  if (!clientId || !taskId) return res.sendStatus(400);
  try {
    await onConferenceStatus(clientId, taskId, req.body || {});
  } catch (e) {
    log.warn("lisa.twilio.conference_error", { error: String(e?.message || e) });
  }
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});

router.post("/lisa/twilio/transcript/:clientId/:taskId", async (req, res) => {
  if (!signed(req, res)) return;
  const { clientId, taskId } = ids(req);
  if (!clientId || !taskId) return res.sendStatus(400);
  const parsed = parseTranscriptionPayload(req.body || {});
  const leg = s(req.query.leg || req.body?.leg);
  const role = leg === "chef" ? "chef" : leg === "lisa" ? "agent" : "user";
  if (parsed?.message) {
    await appendTakeoverTranscript(clientId, taskId, {
      role,
      message: parsed.message,
      partial: parsed.partial,
    });
  }
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});

export default router;
