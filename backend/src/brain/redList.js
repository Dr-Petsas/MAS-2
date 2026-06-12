import { queryRecent } from "./eventStore.js";
import { applyHumanReview } from "./events.js";
import { SPOKEN_CATEGORY } from "./critical.js";

// ============================================================================
// Rote Liste + Fristenliste — die Lese-Modelle des Eskalations-Radars.
//
// "Rote Liste" = alle OFFENEN Events mit signals.critical (Anwalt, Kammer,
// Mahnung, Pfändung, eskalierende Patienten) der letzten Wochen, neueste
// zuerst. "Fristenliste" = alle nicht erledigten Events mit erkannter Frist,
// nach Fälligkeit sortiert und in Warnstufen eingeteilt:
//
//   overdue  -> Frist verstrichen (lauteste Warnung)
//   today    -> heute fällig
//   soon     -> fällig in <= 3 Tagen
//   later    -> weiter weg (im Cockpit sichtbar, im Briefing nur gezählt)
//
// Beide speisen das Cockpit (Dashboard), den Morgen-Moment ("first thing to
// do") und den Abend-Moment. Bewusst OHNE Statistik und OHNE Umsatzzahlen.
// ============================================================================

const LOOKBACK_MS = 21 * 24 * 60 * 60 * 1000; // 3 Wochen reichen: Älteres ist entweder erledigt oder längst eskaliert.

function categoryOf(event) {
  const tags = Array.isArray(event.tags) ? event.tags : [];
  return tags.find((t) => t !== "kritisch") || null;
}

export function deadlineStage(deadlineMs, now = Date.now()) {
  const days = Math.floor((deadlineMs - now) / 86400000);
  if (deadlineMs < now - 3600000) return "overdue";
  if (days <= 0) return "today";
  if (days <= 3) return "soon";
  return "later";
}

/**
 * Rote Liste + Fristenliste in einem Rutsch (eine Firestore-Query).
 * @param {string} clientId
 * @returns {Promise<{critical: object[], deadlines: object[]}>}
 */
export async function buildRedList(clientId, { lookbackMs = LOOKBACK_MS } = {}) {
  const now = Date.now();
  const raw = await queryRecent(clientId, now - lookbackMs, 2000);
  const events = raw.map(applyHumanReview);

  const critical = events
    .filter((e) => e.status === "open" && e.signals?.critical)
    .sort((a, b) => b.ts - a.ts)
    .map((e) => ({
      eventId: e.id,
      ts: e.ts,
      channel: e.channel,
      who: e.counterparty?.name || "Unbekannt",
      aboutPatient: e.subject?.name || "",
      category: categoryOf(e),
      summary: e.summary,
      deadlineMs: e.deadlineMs || null,
    }));

  const deadlines = events
    .filter((e) => e.deadlineMs && e.status !== "resolved")
    .sort((a, b) => a.deadlineMs - b.deadlineMs)
    .map((e) => ({
      eventId: e.id,
      ts: e.ts,
      channel: e.channel,
      who: e.counterparty?.name || "Unbekannt",
      summary: e.summary,
      critical: !!e.signals?.critical,
      category: categoryOf(e),
      deadlineMs: e.deadlineMs,
      stage: deadlineStage(e.deadlineMs, now),
    }));

  return { critical, deadlines };
}

function fmtDate(ms) {
  // Ohne Punkt am Ende ("20.06." -> "20.06"), sonst entstehen im Satz "..".
  return new Date(ms)
    .toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" })
    .replace(/\.$/, "");
}

function spokenItem(item) {
  const what = SPOKEN_CATEGORY[item.category] || "einen kritischen Vorgang";
  const who = item.who && item.who !== "Unbekannt" ? ` von ${item.who}` : "";
  const frist = item.deadlineMs ? `, Frist ${fmtDate(item.deadlineMs)}` : "";
  return `${what}${who}${frist}`;
}

/**
 * Gesprochene rote Liste für Morgen-/Abend-Moment: maximal `max` Punkte
 * ausformuliert, der Rest gezählt. Leerer String, wenn nichts brennt.
 * Mit `bare: true` kommt nur die Aufzählung (ohne Einleitung und ohne
 * Schlusspunkt) — für Briefings, die ihre eigene Einleitung sprechen.
 */
export function spokenRedList({ critical = [], deadlines = [] }, { max = 3, bare = false } = {}) {
  const urgentDeadlines = deadlines.filter(
    (d) => !d.critical && (d.stage === "overdue" || d.stage === "today" || d.stage === "soon")
  );
  const total = critical.length + urgentDeadlines.length;
  if (!total) return "";

  const spoken = [];
  for (const item of critical.slice(0, max)) spoken.push(spokenItem(item));
  for (const d of urgentDeadlines.slice(0, Math.max(0, max - spoken.length))) {
    const when = d.stage === "overdue" ? "Frist verstrichen" : d.stage === "today" ? "heute fällig" : `fällig am ${fmtDate(d.deadlineMs)}`;
    spoken.push(`${d.who !== "Unbekannt" ? d.who : "ein Vorgang"} — ${when}`);
  }

  const rest = total - spoken.length;
  const items = `${spoken.join("; ")}${rest > 0 ? `; dazu ${rest === 1 ? "ein weiterer Punkt" : `${rest} weitere Punkte`}` : ""}`;
  if (bare) return items;
  const lead = total === 1 ? "Ein Punkt gehört auf die rote Liste" : `${total} Punkte gehören auf die rote Liste`;
  return `${lead}: ${items}.`;
}
