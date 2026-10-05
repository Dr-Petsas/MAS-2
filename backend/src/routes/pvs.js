// PVS-Schreibweg: Einstellungen (mandant) + Outbox fuer den lokalen Connector.
// pending-chart bleibt fuer den alten VDDS-Knopf (localhost).
import express from "express";
import { findPending, upsertPending } from "../pvs/pendingChart.js";
import {
  getWritePath,
  setWritePath,
  enqueueOutbox,
  listOutbox,
  markCollected,
  markPending,
  stripLinksForPvs,
  PATHS,
} from "../pvs/writePath.js";
import { DEFAULT_CLIENT_ID, resolveClientId } from "./_shared.js";
import { AUTH_ENFORCED } from "../auth.js";
import { identifyByDevice } from "../clara/devices.js";
import { log } from "../log.js";

const router = express.Router();

function isLoopback(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || "");
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function rejectRemote(req, res) {
  if (isLoopback(req)) return false;
  res.status(403).json({ ok: false, error: "localhost_only" });
  return true;
}

function queryIdentity(req) {
  const src = { ...req.query, ...req.body };
  return {
    patId: src.patId,
    lastName: src.lastName,
    firstName: src.firstName,
    birthday: src.birthday,
  };
}

function fail(res, err, fallback = 400) {
  const code = err?.code || "error";
  const status = code === "not_found" ? 404 : fallback;
  res.status(status).json({ ok: false, error: code, message: err?.message || code });
}

router.get("/pvs/paths", (_req, res) => {
  res.json({ ok: true, paths: PATHS });
});

router.get("/pvs/write-path", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    res.json({ ok: true, clientId, ...(await getWritePath(clientId)) });
  } catch (err) {
    fail(res, err, 500);
  }
});

router.put("/pvs/write-path", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const by = String(req.auth?.userId || req.auth?.kind || "").slice(0, 80);
    const next = await setWritePath(clientId, req.body || {}, by);
    log.info("pvs write-path gesetzt", { clientId, path: next.path });
    res.json({ ok: true, clientId, ...next });
  } catch (err) {
    fail(res, err, 500);
  }
});

router.get("/pvs/outbox", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    if (!req.auth?.kind && rejectRemote(req, res)) return;
    const status = String(req.query.status || "pending");
    const docs = await listOutbox(clientId, { status, limit: req.query.limit });
    res.json({ ok: true, clientId, docs });
  } catch (err) {
    fail(res, err, 500);
  }
});

router.post("/pvs/outbox", async (req, res) => {
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const kind = String(req.auth?.kind || "");
    if (kind !== "user" && kind !== "service") {
      const deviceId = String(req.body?.deviceId || "").trim();
      const deviceKey = String(req.body?.deviceKey || "").trim();
      const who = (deviceId && deviceKey)
        ? await identifyByDevice(clientId, deviceId, deviceKey).catch(() => null)
        : null;
      if (!who && AUTH_ENFORCED) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
    }
    const doc = await enqueueOutbox(clientId, req.body || {});
    log.info("pvs outbox", { clientId, id: doc.id, path: doc.path });
    res.json({ ok: true, clientId, doc });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/pvs/outbox/:id/collected", async (req, res) => {
  if (rejectRemote(req, res)) return;
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const doc = await markCollected(clientId, req.params.id, {
      dampsoftPatNr: req.body?.dampsoftPatNr || req.body?.patNr,
    });
    res.json({ ok: true, clientId, doc });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/pvs/outbox/:id/undo", async (req, res) => {
  if (rejectRemote(req, res)) return;
  try {
    const clientId = resolveClientId(req);
    if (!clientId) return res.status(400).json({ ok: false, error: "client_id_required" });
    const doc = await markPending(clientId, req.params.id);
    res.json({ ok: true, clientId, doc });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/pvs/pending-chart", async (req, res) => {
  if (rejectRemote(req, res)) return;
  const q = queryIdentity(req);
  const hit = findPending(q);
  if (hit) {
    res.json({
      ok: true,
      found: true,
      text: stripLinksForPvs(hit.text || ""),
      status: hit.status || "pending",
      patId: hit.patId || "",
      lastName: hit.lastName || "",
      firstName: hit.firstName || "",
      birthday: hit.birthday || "",
    });
    return;
  }
  try {
    // W-MANDANT-3: kein fest verdrahteter Mandant mehr — der Default kommt
    // zentral aus _shared.js (Env DEFAULT_CLIENT_ID, heute meddent).
    const clientId = resolveClientId(req) || DEFAULT_CLIENT_ID;
    const docs = await listOutbox(clientId, { status: "pending", limit: 80 });
    const last = String(q.lastName || "").trim().toLowerCase();
    const first = String(q.firstName || "").trim().toLowerCase();
    const row = docs.find((d) => {
      if (last && first) {
        return String(d.lastName || "").trim().toLowerCase() === last
          && String(d.firstName || "").trim().toLowerCase() === first;
      }
      return false;
    });
    if (!row) {
      res.json({ ok: true, found: false, text: "", status: "" });
      return;
    }
    res.json({
      ok: true,
      found: true,
      text: stripLinksForPvs(row.text || ""),
      status: row.status || "pending",
      patId: row.dampsoftPatNr || "",
      lastName: row.lastName || "",
      firstName: row.firstName || "",
      birthday: "",
    });
  } catch (err) {
    fail(res, err, 500);
  }
});

router.put("/pvs/pending-chart", (req, res) => {
  if (rejectRemote(req, res)) return;
  try {
    const saved = upsertPending({ ...queryIdentity(req), text: stripLinksForPvs(req.body?.text) });
    log.info("pvs pending-chart gespeichert", {
      patId: saved.patId,
      lastName: saved.lastName,
      firstName: saved.firstName,
    });
    res.json({ ok: true, found: true, ...saved });
  } catch (err) {
    const code = err?.code || "save_failed";
    res.status(400).json({ ok: false, error: code });
  }
});

export default router;
