import { createHmac, timingSafeEqual } from "node:crypto";

// ============================================================================
// QM-Handy-Portal: signierter Ein-Job-Link fuer die Push-Nachricht.
//
// Der Link (/m/qm.html?c=<client>&job=<id>&k=<token>) traegt einen HMAC-Token,
// der clientId+jobId bindet. Die oeffentlichen Portal-Endpunkte (routes/qm.js)
// pruefen NUR diesen Token — kein Login noetig (die zustaendige Helferin oeffnet
// den Link vom Sperrbildschirm). Gleiche Idee wie die unerratbaren QR-/Proof-
// Links: der signierte Link IST das Ticket, gibt aber nur GENAU EINEN Job frei.
// ============================================================================

// Ableitung aus dem Server-Secret. Ohne MAS_SERVICE_TOKEN (nur Dev) faellt ein
// fester Pepper ein — Tokens sind dann in Prod trotzdem an das echte Secret
// gebunden und nicht faelschbar.
const SECRET = (process.env.MAS_SERVICE_TOKEN || process.env.MAS_VAPID_PRIVATE_KEY || "mas2.qm.portal.dev.secret").trim();
const PEPPER = "mas2.qm.portal.v1";

/** Deterministischer, nicht faelschbarer Token fuer genau (clientId, jobId). */
export function portalToken(clientId, jobId) {
  return createHmac("sha256", SECRET)
    .update(`${PEPPER}:${String(clientId)}:${String(jobId)}`)
    .digest("hex")
    .slice(0, 24);
}

/** Timing-sicherer Vergleich gegen den erwarteten Token. */
export function verifyPortalToken(clientId, jobId, token) {
  const want = portalToken(clientId, jobId);
  const got = String(token || "");
  if (got.length !== want.length) return false;
  try {
    return timingSafeEqual(Buffer.from(want), Buffer.from(got));
  } catch {
    return false;
  }
}
