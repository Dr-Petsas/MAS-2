import { queryRecent, resolveItem } from "../brain/eventStore.js";
import { applyHumanReview } from "../brain/events.js";
import { findContactsByPhone } from "../brain/addressBook.js";
import { listCases, setStatus } from "../brain/caseStore.js";
import { CASE_STATUS } from "../brain/cases.js";

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
//
// Nur OFFENE Einträge (Team-Notiz, nicht erreichte Anrufe). Erledigte bleiben
// in der Akte, Bianca erzählt sie nicht bei jedem nächsten Anruf noch einmal.
// ============================================================================

const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 3;

// Rufnummern auf nationale Ziffernform falten: +49 177 600... == 0177600...
export function canonDigits(raw) {
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

export function eventMatchesPhone(event, phone) {
  const digits = canonDigits(phone);
  if (digits.length < 7) return false;
  const tail = digits.slice(-7);
  const ref = canonDigits(event?.counterparty?.ref || "");
  if (ref && (ref === digits || ref.endsWith(tail) || digits.endsWith(ref.slice(-7)))) return true;
  const sum = canonDigits(event?.summary || "");
  return sum.includes(tail);
}

/** Offene Treffer zur Nummer, neueste zuerst — erledigte nie. */
export function openCallerHits(events, phone) {
  const digits = canonDigits(phone);
  if (digits.length < 7) return [];
  return (events || [])
    .map((e) => applyHumanReview(e))
    .filter((e) => e && e.status === "open" && eventMatchesPhone(e, digits))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, MAX_ITEMS);
}

/**
 * Compact German context for an inbound caller, from the shared brain.
 *
 * @param {string} clientId
 * @param {string} phone caller id, any format
 * @returns {Promise<{found: boolean, name: string, context: string, openEventIds: string[]}>}
 */
export async function buildCallerContext(clientId, phone) {
  const digits = canonDigits(phone);
  if (digits.length < 7) return { found: false, name: "", context: "", openEventIds: [] };

  const events = await queryRecent(clientId, Date.now() - LOOKBACK_MS, 800);
  const hits = openCallerHits(events, digits);

  // Geteiltes Adressbuch: kennt die Nummer auch dann, wenn (noch) kein Event
  // passt — z.B. ein Lieferant, der bisher nur per E-Mail Kontakt hatte und
  // dessen Nummer aus der Signatur stammt.
  const bookHit = (await findContactsByPhone(clientId, phone))[0] || null;

  if (!hits.length) {
    if (!bookHit?.name) return { found: false, name: "", context: "", openEventIds: [] };
    const aboutLast = bookHit.lastSubject ? ` Zuletzt ging es um: „${bookHit.lastSubject}“.` : "";
    return {
      found: true,
      name: bookHit.name,
      context:
        `Die Rufnummer steht im Adressbuch der Praxis: ${bookHit.name}` +
        `${bookHit.category ? ` (${bookHit.category})` : ""}.${aboutLast} ` +
        "Sprich die Person entsprechend an, statt nach dem Namen zu fragen.",
      openEventIds: [],
    };
  }

  const name =
    hits.map((e) => String(e?.counterparty?.name || e?.subject?.name || "").trim())
        .find((n) => n && !/^\+?\d/.test(n)) ||
    String(bookHit?.name || "").trim() || "";

  const lines = hits.map((e) => {
    const when = fmtWhen(e.ts);
    const summary = String(e.summary || "").trim();
    return `- ${when}: ${summary} (noch offen)`;
  });

  const context =
    `Praxisgedächtnis zu dieser Rufnummer${name ? ` (vermutlich ${name})` : ""}:\n` +
    lines.join("\n") +
    "\nNutze das aktiv: erkenne den Zusammenhang an, statt bei Null anzufangen. " +
    "Wenn die Praxis versucht hat, die Person zu erreichen, sprich es direkt an. " +
    "Sobald der Anrufer nach dem Grund des Anrufs fragt und der Grund mitgeteilt ist, gilt es als erledigt — nicht in jedem Folgegespräch wiederholen.";

  return {
    found: true,
    name,
    context,
    openEventIds: hits.map((e) => e.id).filter(Boolean),
  };
}

/**
 * Offene Rückruf-/Team-Notizen zu einer Nummer schließen — Bianca in der
 * Sekunde, in der der Rückrufer nach dem Grund fragt (mitgeteilt), oder
 * das Team per Löschen. Schließt auch Vorgänge, die NUR diese Events tragen.
 */
export async function resolveOpenCallerItems(clientId, phone, { actor = "Bianca", note = "" } = {}) {
  const digits = canonDigits(phone);
  if (digits.length < 7) return { ok: true, resolved: [], cases: [] };
  const events = await queryRecent(clientId, Date.now() - LOOKBACK_MS, 800);
  const hits = openCallerHits(events, digits);
  const resolved = [];
  for (const e of hits) {
    const out = await resolveItem(clientId, e.id, { actor, note });
    if (out?.ok) resolved.push(e.id);
  }
  const idSet = new Set(resolved);
  const cases = [];
  if (idSet.size) {
    const openCases = await listCases(clientId, { activeOnly: true, limit: 120 }).catch(() => []);
    for (const c of openCases || []) {
      const linked = Array.isArray(c.eventIds) ? c.eventIds : [];
      if (!linked.length) continue;
      if (!linked.every((id) => idSet.has(id))) continue;
      const st = await setStatus(clientId, c.id, CASE_STATUS.RESOLVED, {
        by: actor,
        note: note || "Am Telefon erledigt",
      }).catch(() => null);
      if (st?.ok) cases.push(c.id);
    }
  }
  return { ok: true, resolved, cases };
}
