import { queryRecent } from "../brain/eventStore.js";
import { applyHumanReview } from "../brain/events.js";

// ============================================================================
// Rückrufer-Kontext für Bianca (Telefon-Loop 2/2, Nacht 11./12.06.2026).
//
// Szenario: Lisa erreicht jemanden nicht und spricht auf die Mailbox. Die
// Person ruft ZURÜCK und landet bei Bianca — die bisher keine Ahnung hatte,
// worum es geht ("Wie kann ich helfen?" statt "Ah, wir hatten versucht Sie zu
// erreichen!"). Dieses Modul beantwortet die eine Frage: WAS weiß die Praxis
// über diese Rufnummer aus den letzten Tagen?
//
// Der Kontext wird beim Klingeln von der Plattform-Cloud-Function
// (onInboundPhoneCall) abgeholt und als dynamic_variable `caller_context` in
// Biancas Agent-Prompt gereicht. Kompakt (sprechbar), deutsch, PII-minimal:
// nur Ereignis-Zusammenfassungen, keine Transkripte.
// ============================================================================

const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 3;

// Rufnummern auf nationale Ziffernform falten: +49 177 600... == 0177600...
function canonDigits(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("49") && d.length >= 10) d = `0${d.slice(2)}`;
  return d;
}

function fmtWhen(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString("de-DE", {
      timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long",
    });
  } catch {
    return "";
  }
}

/**
 * Compact German context for an inbound caller, from the shared brain.
 *
 * @param {string} clientId
 * @param {string} phone caller id, any format
 * @returns {Promise<{found: boolean, name: string, context: string}>}
 */
export async function buildCallerContext(clientId, phone) {
  const digits = canonDigits(phone);
  if (digits.length < 7) return { found: false, name: "", context: "" };
  const tail = digits.slice(-7);

  const events = await queryRecent(clientId, Date.now() - LOOKBACK_MS, 800);
  const hits = events
    .map((e) => applyHumanReview(e))
    .filter((e) => {
      const ref = canonDigits(e?.counterparty?.ref || "");
      if (ref && (ref === digits || ref.endsWith(tail) || digits.endsWith(ref.slice(-7)))) return true;
      // Fallback: Nummer steht im Zusammenfassungstext (z.B. Lisa-Delegation
      // "an die Nummer 0177...").
      const sum = canonDigits(e?.summary || "");
      return sum.includes(tail);
    })
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, MAX_ITEMS);

  if (!hits.length) return { found: false, name: "", context: "" };

  const name =
    hits.map((e) => String(e?.counterparty?.name || e?.subject?.name || "").trim())
        .find((n) => n && !/^\+?\d/.test(n)) || "";

  const lines = hits.map((e) => {
    const when = fmtWhen(e.ts);
    const summary = String(e.summary || "").trim();
    const open = e.status === "open" ? " (noch offen)" : "";
    return `- ${when}: ${summary}${open}`;
  });

  const context =
    `Praxisgedächtnis zu dieser Rufnummer${name ? ` (vermutlich ${name})` : ""}:\n` +
    lines.join("\n") +
    "\nNutze das aktiv: erkenne den Zusammenhang an, statt bei Null anzufangen. " +
    "Wenn die Praxis versucht hat, die Person zu erreichen, sprich es direkt an.";

  return { found: true, name, context };
}
