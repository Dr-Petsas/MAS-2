import admin from "./firebase.js";
import { timingSafeEqual } from "node:crypto";

// Authentication for the MAS-2 HTTP API.
//
// Two trusted callers exist:
//   1. Logged-in platform users (browser) — they carry a Firebase ID token whose
//      custom claims already pin them to a tenant: { clientId, isAdmin, role }.
//      We verify the token with firebase-admin and NEVER trust client-sent
//      identity headers (X-User-*) — those were spoofable.
//   2. Server-to-server callers (voice worker, agent tool webhooks, scheduled
//      jobs) — they present a shared secret in X-Service-Token and act as the
//      practice (admin scope) for an explicitly named clientId.
//
// A small set of routes is public: the phone "connect" page + QR landing run
// outside the authenticated app and are gated by PIN + entitlement instead, and
// /health is liveness only.

const SERVICE_TOKEN = (process.env.MAS_SERVICE_TOKEN || "").trim();

// Enforced by default in production. In dev it stays off unless MAS_REQUIRE_AUTH
// is set, so local tooling keeps working; set MAS_REQUIRE_AUTH=1 to test the
// production behaviour locally.
const AUTH_ENFORCED = (() => {
  const v = (process.env.MAS_REQUIRE_AUTH || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(v)) return false;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  return process.env.NODE_ENV === "production";
})();

function safeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function isPublic(req) {
  if (req.method === "OPTIONS") return true;
  const p = req.path || "";
  if (p === "/health" || p === "/health/ready") return true;
  // PIN-gated phone endpoints, opened on a device that is NOT logged into the
  // platform (e.g. the doctor's car). Protected by PIN + entitlement + throttle.
  if (p === "/clara/session" || p === "/clara/identify") return true;
  // Phone pairing + push (device is not logged in): register is gated by the
  // single-use QR token, refresh by the deviceKey, vapid-key is a public key.
  if (p === "/clara/devices/register" || p === "/clara/devices/refresh") return true;
  if (p === "/clara/devices/vapid-key" || p === "/clara/devices/self-test") return true;
  // Voice-Worker holt beim Verbinden den Anlass eines proaktiven Clara-Anrufs
  // ab (kurzer, PII-freier Sprechtext; einmalig konsumiert, 2h TTL).
  if (p === "/clara/pending-context") return true;
  // /clara/<clientId> (QR landing HTML) and /clara/<clientId>/connect (phone page).
  if (/^\/clara\/[^/]+(\/connect)?$/.test(p)) return true;
  return false;
}

export function authMiddleware() {
  return async function auth(req, res, next) {
    if (isPublic(req)) {
      req.auth = { kind: "public", isAdmin: true, userId: "", clientId: "" };
      return next();
    }

    // 1) Server-to-server shared secret.
    const svc = (req.header("X-Service-Token") || "").trim();
    if (SERVICE_TOKEN && svc && safeEq(svc, SERVICE_TOKEN)) {
      req.auth = { kind: "service", isAdmin: true, userId: "", clientId: "" };
      return next();
    }

    // 2) Firebase ID token — from the Authorization header, or a ?t= query param
    //    for browser-loaded <img>/<a> attachment URLs that cannot set headers.
    const hdr = req.header("Authorization") || "";
    const m = /^Bearer\s+(.+)$/i.exec(hdr);
    const token = (m && m[1]) || (typeof req.query?.t === "string" ? req.query.t : "");
    if (token) {
      try {
        const dec = await admin.auth().verifyIdToken(token);
        const role = String(dec.role || "").toLowerCase();
        req.auth = {
          kind: "user",
          uid: dec.uid,
          userId: dec.uid,
          clientId: String(dec.clientId || "").trim(),
          isAdmin: !!dec.isAdmin,
          role,
          superUser: role === "superuser",
        };
        return next();
      } catch {
        if (AUTH_ENFORCED) return res.status(401).json({ error: "invalid_token" });
        // dev (not enforced): fall through to anon below
      }
    }

    if (AUTH_ENFORCED) return res.status(401).json({ error: "unauthenticated" });

    // Dev transition mode only: act as practice admin so local testing keeps
    // working without a token. Never reached when AUTH_ENFORCED.
    req.auth = { kind: "anon", isAdmin: true, userId: "", clientId: "" };
    return next();
  };
}

export { AUTH_ENFORCED, SERVICE_TOKEN };
