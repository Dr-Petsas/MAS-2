// ============================================================================
// TOOL-STOERUNGEN (W-STABIL-4 "Fehler-als-Zustand", 28.07.2026)
//
// Faellt ein Clara-Werkzeug technisch aus (MAS-Route tot, Endpoint 500,
// Netzwerkfehler), meldet der Voice-Worker das hierher. Jede Stoerung wird
// als ROTER EINTRAG festgehalten und auf der Status-Seite sichtbar gemacht —
// statt wie frueher in einem "sanft leeren Ergebnis" zu verschwinden
// (Abwesenheits-Vorfall: wochenlang leise leer, niemand hat es gesehen).
// ============================================================================
import { masCollection } from "../tenant.js";
import { log } from "../log.js";

const COL = "mas_tool_errors";

function s(v) {
  return String(v == null ? "" : v).trim();
}

/** Eine Stoerung festhalten (roter Eintrag). */
export async function recordToolError(clientId, { tool = "", error = "", source = "worker" } = {}) {
  const doc = {
    tool: s(tool).slice(0, 80),
    error: s(error).slice(0, 300),
    source: s(source).slice(0, 40) || "worker",
    tsMs: Date.now(),
    ts: new Date().toISOString(),
  };
  await masCollection(clientId, COL).add(doc);
  log.warn("clara.tool_error", { clientId, tool: doc.tool, error: doc.error });
  return { ok: true };
}

/** Stoerungen seit `sinceMs` (neueste zuerst, gedeckelt). */
export async function recentToolErrors(clientId, { sinceMs, limit = 20 } = {}) {
  const cutoff = Number(sinceMs) || (Date.now() - 60 * 60_000);
  const snap = await masCollection(clientId, COL)
    .where("tsMs", ">=", cutoff)
    .orderBy("tsMs", "desc")
    .limit(Math.max(1, Math.min(50, limit)))
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
