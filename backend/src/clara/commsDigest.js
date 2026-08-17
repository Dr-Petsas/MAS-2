import { queryRecent } from "../brain/eventStore.js";
import { applyHumanReview } from "../brain/events.js";
import { todayBerlin, relativeDayLabel } from "./daySchedule.js";
import { ensureBerlinTz } from "./booking.js";
import { pick } from "./variation.js";
import { summarizeForSpeech } from "./summarize.js";
import { karteEingaenge } from "./karten.js";

// ============================================================================
// "Was ist heute reingekommen?" — EIN kombinierter Kommunikations-Digest
// (Chef 10.07.2026). Fasst die EINGEHENDE Kommunikation eines Tages zusammen:
// Anrufe (Bianca), E-Mails (Nadine), Briefe, Empfangs-Besuche. Anders als
// call_log (nur Telefon) oder read_email (eine Mail) gibt das hier den
// Gesamt-Ueberblick: Zaehlung + die wichtigsten Eingaenge mit kurzem Inhalt.
//
// Geerdet: Name, Uhrzeit und Kanal kommen deterministisch aus dem Ereignis;
// der Inhalt ist die attribuierte `summary` aus mas_events, bei sehr langen
// Eintraegen fluessig verdichtet (abgeschottetes LLM + Zahlen-Waechter,
// s. summarize.js). Nichts wird erfunden; faellt das LLM aus, wird gekappt.
//
// Bewusst NUR eingehend ("reingekommen") und NUR echte Kommunikation — keine
// Kalender-Automatik, keine ausgehenden Lisa-Anrufe.
// ============================================================================

const TZ = "Europe/Berlin";

// Kanal -> gesprochenes Etikett + ob die summary bereits selbstbeschreibend ist
// ("E-Mail von ..." traegt den Absender schon; ein Anruf-Extrakt nicht).
const INBOUND = new Map([
  ["bianca_call", { kind: "call", word: "Anruf", selfLabeled: false }],
  ["nadine_email", { kind: "email", word: "E-Mail", selfLabeled: true }],
  ["nadine_letter", { kind: "letter", word: "Brief", selfLabeled: true }],
  ["frontdesk", { kind: "frontdesk", word: "Empfang", selfLabeled: true }],
]);

function spokenTime(ms) {
  const parts = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return m === 0 ? `${h} Uhr` : `${h} Uhr ${m}`;
}

function joinNatural(list) {
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} und ${list[list.length - 1]}`;
}

/** Eingehende Kommunikations-Ereignisse EINES Berlin-Tages. */
export async function dayInboundComms(clientId, { date } = {}) {
  const day = (date || "").trim() || todayBerlin();
  const startMs = new Date(ensureBerlinTz(`${day}T00:00:00`)).getTime();
  const endMs = new Date(ensureBerlinTz(`${day}T23:59:59`)).getTime();
  if (isNaN(startMs) || isNaN(endMs)) return { day, events: [] };
  const recent = await queryRecent(clientId, startMs, 1000);
  const events = recent
    .map(applyHumanReview)
    .filter((e) => INBOUND.has(e.channel)
      && (e.direction || "in") === "in"
      && Number(e.ts) >= startMs && Number(e.ts) <= endMs)
    .sort((a, b) => Number(a.ts) - Number(b.ts));
  return { day, events };
}

function noteworthy(e) {
  const s = e?.signals || {};
  return Boolean(e.status === "open" || s.critical || s.complaintStated || s.callbackRequested || s.needsHuman);
}

/** Eine gesprochene Zeile pro Eingang: Zeit + Kanal/Absender + kurzer Inhalt. */
async function itemLine(e) {
  const t = spokenTime(e.ts);
  const raw = String(e.summary || "").replace(/\s+/g, " ").trim();
  const meta = INBOUND.get(e.channel);
  const who = e.counterparty?.name || e.subject?.name || "";

  // Anruf: summary ("Laut Anruf: ...") traegt den Namen NICHT — Absender
  // deterministisch voranstellen, Inhalt ggf. verdichten.
  if (meta.kind === "call") {
    let gist = raw;
    if (raw.length > 220) {
      const sum = await summarizeForSpeech("call", raw, { maxSentences: 2, timeoutMs: 9000 });
      gist = sum.ok ? sum.text : `${raw.slice(0, 197)}...`;
    }
    return `Um ${t}: Anruf von ${who || "unbekannt"}${gist ? ` — ${gist}` : ""}`;
  }

  // E-Mail/Brief/Empfang: summary ist selbstbeschreibend ("E-Mail von X — ...").
  // Kurz -> woertlich; lang -> verdichten, dabei Kanal/Absender deterministisch
  // wieder voranstellen (die Verdichtung laesst die Einleitung weg).
  if (raw.length <= 220) return `Um ${t}: ${raw}`;
  const sum = await summarizeForSpeech(meta.kind === "email" ? "email" : "call", raw, { maxSentences: 2, timeoutMs: 9000 });
  if (!sum.ok) return `Um ${t}: ${raw.slice(0, 197)}...`;
  return `Um ${t}: ${meta.word}${who ? ` von ${who}` : ""} — ${sum.text}`;
}

/**
 * Reiner Sprechtext aus einer Liste eingehender Kommunikations-Ereignisse
 * (bereits gefiltert/sortiert). Getrennt von der I/O-Huelle, damit testbar.
 * @param {object[]} events
 * @param {{day:string}} opts
 * @returns {Promise<string>}
 */
export async function buildSpokenComms(events, { day }) {
  const rel = relativeDayLabel(day);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  if (!events.length) {
    return cap(pick([
      `${rel} ist noch nichts reingekommen — kein Anruf, keine E-Mail.`,
      `${rel} ist bislang nichts eingegangen, weder Anruf noch Post.`,
      `${rel} ist der Eingang leer — keine Anrufe, keine E-Mails.`,
    ]));
  }

  const byKind = (k) => events.filter((e) => INBOUND.get(e.channel).kind === k);
  const calls = byKind("call");
  const mails = byKind("email");
  const letters = byKind("letter");
  const front = byKind("frontdesk");

  const bits = [];
  if (calls.length) bits.push(calls.length === 1 ? "ein Anruf" : `${calls.length} Anrufe`);
  if (mails.length) bits.push(mails.length === 1 ? "eine E-Mail" : `${mails.length} E-Mails`);
  if (letters.length) bits.push(letters.length === 1 ? "ein Brief" : `${letters.length} Briefe`);
  if (front.length) bits.push(front.length === 1 ? "ein Besuch am Empfang" : `${front.length} Besuche am Empfang`);

  const parts = [];
  const verb = events.length === 1 ? "ist" : "sind";
  parts.push(cap(`${rel} ${verb} ${joinNatural(bits)} reingekommen.`));

  // Bei vielen Eingaengen die wichtigsten (offen/kritisch) sicher zeigen, den
  // Rest nur zaehlen. Anzeige chronologisch.
  const MAX = 6;
  let shown;
  if (events.length <= MAX) {
    shown = events;
  } else {
    const important = events.filter(noteworthy);
    const rest = events.filter((e) => !noteworthy(e));
    shown = [...important, ...rest].slice(0, MAX).sort((a, b) => Number(a.ts) - Number(b.ts));
  }

  // Die Zeilen NEBENEINANDER bauen (17.08.2026): jede lange Mail/Notiz laeuft
  // durch summarizeForSpeech (bis 9 s). Nacheinander summierte sich das live
  // auf 24 s Wartezeit fuer EINE Antwort. Die Zeilen haengen nicht voneinander
  // ab, die Reihenfolge bleibt durch Promise.all erhalten.
  parts.push(...await Promise.all(shown.map((e) => itemLine(e))));
  if (events.length > shown.length) {
    parts.push(`Und ${events.length - shown.length} weitere — Details stehen im Monitor.`);
  }

  const open = events.filter((e) => e.status === "open");
  if (open.length) {
    parts.push(open.length === 1 ? "Ein Anliegen ist noch offen." : `${open.length} Anliegen sind noch offen.`);
  }

  return parts.join(" ");
}

/**
 * Gesprochener Kommunikations-Digest eines Tages. I/O-Huelle: liest die
 * eingehenden Ereignisse und rendert sie. Best-effort und geerdet.
 * @param {string} clientId
 * @param {{date?:string}} [opts]
 * @returns {Promise<string>}
 */
export async function spokenCommsDigest(clientId, { date } = {}) {
  const { day, events } = await dayInboundComms(clientId, { date });
  return buildSpokenComms(events, { day });
}

/**
 * Eingaenge-KARTE (W-FLIP-TIEFE WP8) aus denselben Ereignissen — DETERMINISTISCH
 * (kein LLM): Zaehlung + alle Eingaenge mit vollem Inhalt fuer die Vertiefung.
 * Additiv; die gesprochene Zusammenfassung (buildSpokenComms) bleibt unberuehrt.
 */
export function cardInboundComms(events, { day }) {
  const rel = relativeDayLabel(day);
  const dateLabel = rel.charAt(0).toUpperCase() + rel.slice(1);
  const byKind = (k) => events.filter((e) => INBOUND.get(e.channel)?.kind === k);
  const entries = events.map((e) => {
    const meta = INBOUND.get(e.channel) || {};
    return {
      startMs: Number(e.ts) || 0,
      kind: meta.kind || "email",
      word: meta.word || "Eingang",
      who: e.counterparty?.name || e.subject?.name || "",
      text: String(e.summary || "").replace(/\s+/g, " ").trim(),
      open: e.status === "open",
    };
  });
  return karteEingaenge({
    dateLabel,
    total: events.length,
    calls: byKind("call").length,
    mails: byKind("email").length,
    letters: byKind("letter").length,
    front: byKind("frontdesk").length,
    open: events.filter((e) => e.status === "open").length,
    entries,
  });
}
