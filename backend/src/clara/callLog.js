import { queryRecent } from "../brain/eventStore.js";
import { applyHumanReview } from "../brain/events.js";
import { todayBerlin, relativeDayLabel } from "./daySchedule.js";
import { ensureBerlinTz } from "./booking.js";
import { pick } from "./variation.js";
import { callLogQuip } from "./humor.js";
import { summarizeForSpeech } from "./summarize.js";

// ============================================================================
// Gesprochenes Anruf-Protokoll — "Waren heute Anrufe für mich da?"
//
// Hintergrund (11.06.2026): Auf genau diese Frage hat Clara OHNE Tool-Aufruf
// "Heute gab es keine Anrufe" halluziniert. Dieses Read-Model beantwortet die
// Frage ehrlich aus dem Praxisgedächtnis: eingehende Anrufe (Bianca),
// ausgehende Anrufe und SMS (Lisa). Gibt es für den Tag keine Einträge, sagt
// Clara GENAU DAS ("im Praxisgedächtnis ist nichts verzeichnet") — und
// behauptet nicht, es habe keine Anrufe gegeben.
// ============================================================================

const TZ = "Europe/Berlin";

const PHONE_CHANNELS = new Set(["bianca_call", "lisa_call", "lisa_sms"]);

function hhmm(ms) {
  if (!ms) return "";
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

function spokenTime(ms) {
  const parts = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return m === 0 ? `${h} Uhr` : `${h} Uhr ${m}`;
}

/** Telefon-Ereignisse EINES Berlin-Tages aus dem Praxisgedächtnis. */
export async function dayPhoneEvents(clientId, { date } = {}) {
  const day = (date || "").trim() || todayBerlin();
  const startMs = new Date(ensureBerlinTz(`${day}T00:00:00`)).getTime();
  const endMs = new Date(ensureBerlinTz(`${day}T23:59:59`)).getTime();
  if (isNaN(startMs) || isNaN(endMs)) return { day, events: [] };
  const recent = await queryRecent(clientId, startMs, 800);
  const events = recent
    .map(applyHumanReview)
    .filter((e) => PHONE_CHANNELS.has(e.channel) && Number(e.ts) >= startMs && Number(e.ts) <= endMs)
    .sort((a, b) => Number(a.ts) - Number(b.ts));
  return { day, events };
}

/** Natürlich gesprochene Zusammenfassung der Anrufe eines Tages. */
export async function spokenCallLog(clientId, { date } = {}) {
  const { day, events } = await dayPhoneEvents(clientId, { date });
  const rel = relativeDayLabel(day);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const inbound = events.filter((e) => e.channel === "bianca_call");
  const outCalls = events.filter((e) => e.channel === "lisa_call");
  const outSms = events.filter((e) => e.channel === "lisa_sms");

  if (!events.length) {
    return cap(pick([
      `${rel} ist im Praxisgedächtnis kein Anruf verzeichnet — weder eingehend noch von Lisa.`,
      `${rel} war es am Telefon ruhig — im Praxisgedächtnis steht kein einziger Anruf.`,
      `${rel} ist nichts im Anruf-Protokoll gelandet, weder eingehend noch ausgehend.`,
    ]));
  }

  const parts = [];
  const who = (e) => e.counterparty?.name || e.subject?.name || "ein unbekannter Anrufer";
  // Name + Uhrzeit bleiben IMMER deterministisch aus dem Ereignis. Nur der
  // freie Anliegen-Text wird bei sehr langen Notizen fluessig verdichtet
  // (Chef 10.07.2026, abgeschottetes LLM + Zahlen-Waechter); kurze Notizen
  // bleiben unveraendert, lange fallen bei LLM-Ausfall auf harte Kappung zurueck.
  const short = async (e) => {
    const s = String(e.summary || "").trim();
    if (!s) return "";
    if (s.length <= 220) return s;
    const sum = await summarizeForSpeech("call", s, { maxSentences: 2, timeoutMs: 9000 });
    if (sum.ok) return sum.text;
    return `${s.slice(0, 197)}...`;
  };

  if (inbound.length) {
    parts.push(cap(pick([
      `${rel} ${inbound.length === 1 ? "gab es einen Anruf" : `gab es ${inbound.length} Anrufe`}.`,
      `${rel} ${inbound.length === 1 ? "kam ein Anruf rein" : `kamen ${inbound.length} Anrufe rein`}.`,
      `${rel} ${inbound.length === 1 ? "hat es einmal geklingelt" : `hat es ${inbound.length} Mal geklingelt`}.`,
    ])));
    // Verdichtung der Notizen NEBENEINANDER (17.08.2026): jede lange Notiz
    // kostet bis 9 s, nacheinander wartet der Chef ein Vielfaches. Reihenfolge
    // bleibt durch Promise.all erhalten.
    const zeilen = await Promise.all(inbound.slice(0, 6).map(async (e) => {
      const s = await short(e);
      return `Um ${spokenTime(e.ts)}: ${who(e)}${s ? ` — ${s}` : ""}`;
    }));
    parts.push(...zeilen);
    if (inbound.length > 6) parts.push(`Und ${inbound.length - 6} weitere — Details stehen im Monitor.`);
  } else {
    parts.push(cap(`${rel} ist kein eingehender Anruf im Praxisgedächtnis verzeichnet.`));
  }

  if (outCalls.length) {
    parts.push(`Lisa hat ${outCalls.length === 1 ? "einen Anruf" : `${outCalls.length} Anrufe`} geführt${outCalls.length <= 3 ? `: ${outCalls.map((e) => who(e)).join(", ")}.` : "."}`);
  }
  if (outSms.length) {
    parts.push(`Außerdem ${outSms.length === 1 ? "ging eine SMS" : `gingen ${outSms.length} SMS`} raus.`);
  }

  const open = events.filter((e) => e.status === "open");
  if (open.length) {
    parts.push(`${open.length === 1 ? "Ein Anliegen ist" : `${open.length} Anliegen sind`} noch offen.`);
  }

  // Lockerer Schlusskommentar (Wunsch 12.06.: "kommentiere ruhig Telefonate").
  // Nur wenn nichts mehr offen ist — bei offenen Anliegen bleibt es ernst.
  if (!open.length) parts.push(callLogQuip());

  return parts.join(" ");
}
