import { listCases } from "../brain/caseStore.js";
import { queryRecent } from "../brain/eventStore.js";
import { findContactsByPhone } from "../brain/addressBook.js";

// ============================================================================
// Caller-ID lookup for the INBOUND phone AI (Bianca) and Clara.
//
// "Anna Ackermann ruft zurück, weil Lisa ihr auf den AB gesprochen hat" — the
// inbound agent must greet KNOWING. The static inbound prompt never changes;
// the knowledge comes from the shared brain at call time: open Gesprächsauftrag
// call lists (gap-fill candidates carry phone numbers) and recent events whose
// counterparty ref is a phone number.
// ============================================================================

function s(v) {
  return v == null ? "" : String(v).trim();
}

/**
 * Normalise a phone number to a comparable +E.164-ish form (German default).
 * "0171 1234567" -> "+491711234567", "0049 171..." -> "+49171...". Returns ""
 * when there are not enough digits to be a real number.
 */
export function normalizePhone(raw) {
  let v = String(raw || "").replace(/[^\d+]/g, "");
  if (!v) return "";
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  else if (v.startsWith("0")) v = `+49${v.slice(1)}`;
  else if (!v.startsWith("+")) v = `+${v}`;
  // strip any stray '+' beyond the first
  v = `+${v.slice(1).replace(/\+/g, "")}`;
  const digits = v.slice(1);
  if (digits.length < 8 || digits.length > 15) return "";
  return v;
}

/** Loose match: identical normalised form OR same last-8-digits suffix. */
export function phonesMatch(a, b) {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.slice(-8) === nb.slice(-8);
}

function fmtDay(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

const CHANNEL_PHRASE = {
  lisa_call: "Lisa hat angerufen",
  lisa_sms: "Lisa hat eine SMS geschickt",
  bianca_call: "hat hier angerufen",
  nadine_email: "E-Mail-Kontakt mit Nadine",
};

/**
 * Who is calling and why did we contact them?
 * Sources: (1) candidates on active gap-fill call lists, (2) recent brain
 * events with a matching counterparty phone ref. Returns structured matches +
 * a compact German context block for the inbound agent.
 *
 * @returns {Promise<{found:boolean, phone:string, matches:object[], message:string}>}
 */
export async function lookupCaller(clientId, { phone, name } = {}) {
  const norm = normalizePhone(phone);
  if (!norm) {
    return { found: false, phone: "", matches: [], message: "Keine verwertbare Rufnummer übermittelt — bitte regulär nach dem Namen fragen." };
  }

  const matches = [];

  // 1) Active call lists: is this number on a Gesprächsauftrag?
  const cases = await listCases(clientId, { activeOnly: true, assignee: "Lisa", limit: 100 }).catch(() => []);
  for (const c of cases) {
    const cands = c.callList?.candidates || [];
    const hit = cands.find((cand) => phonesMatch(cand.phone || cand.phoneNorm, norm));
    if (hit) {
      matches.push({
        kind: "call_list",
        caseId: c.id,
        patientId: hit.patientId || null,
        patientName: hit.name || "",
        reason: hit.reason || c.title,
        slot: c.callList?.slot?.label || "",
        date: c.callList?.date || "",
        calendarName: c.callList?.calendarName || "",
        approved: !!c.callList?.approvedBy,
      });
    }
  }

  // 2) Recent events with this counterparty (e.g. Lisa's AB message logged).
  const since = Date.now() - 30 * 86400000;
  const events = await queryRecent(clientId, since, 1000).catch(() => []);
  for (const e of events) {
    if (!phonesMatch(e.counterparty?.ref || "", norm)) continue;
    matches.push({
      kind: "event",
      eventId: e.id,
      ts: e.ts,
      channel: e.channel,
      patientId: e.subject?.patientId || null,
      patientName: e.subject?.name || e.counterparty?.name || "",
      summary: e.summary || "",
    });
    if (matches.length >= 8) break;
  }

  // 3) Geteiltes Adressbuch: kennt die Nummer auch ohne offene Vorgänge
  // (z.B. Lieferant, dessen Nummer aus der Mail-Signatur stammt).
  const bookHit = (await findContactsByPhone(clientId, norm).catch(() => []))[0] || null;

  if (!matches.length) {
    if (bookHit?.name) {
      const aboutLast = bookHit.lastSubject ? ` Zuletzt ging es um: „${bookHit.lastSubject}“.` : "";
      return {
        found: true, phone: norm, matches: [],
        message: `Die Nummer gehört laut Adressbuch zu ${bookHit.name}${bookHit.category ? ` (${bookHit.category})` : ""}.${aboutLast} Offene Vorgänge gibt es dazu keine.`,
      };
    }
    return { found: false, phone: norm, matches: [], message: "Zu dieser Nummer ist kein offener Vorgang bekannt — regulär begrüßen und nach dem Anliegen fragen." };
  }

  // Compose the spoken context block (best/known name first).
  const knownName = matches.find((m) => m.patientName)?.patientName || s(name) || s(bookHit?.name);
  const lines = [];
  lines.push(knownName ? `Die Nummer gehört vermutlich zu ${knownName}.` : "Zu dieser Nummer gibt es offene Vorgänge, der Name ist nicht hinterlegt.");
  for (const m of matches.slice(0, 3)) {
    if (m.kind === "call_list") {
      lines.push(`Offener Gesprächsauftrag: ${m.reason}. Vorgeschlagener Slot: ${m.date} ${m.slot} bei ${m.calendarName}.${m.approved ? "" : " (Liste noch nicht freigegeben.)"}`);
    } else {
      const phrase = CHANNEL_PHRASE[m.channel] || `Kontakt (${m.channel})`;
      lines.push(`${fmtDay(m.ts)}: ${phrase}${m.summary ? ` — ${m.summary}` : ""}.`);
    }
  }
  lines.push("Knüpfe wissend daran an, ohne medizinische Details zu nennen, bevor die Identität bestätigt ist.");

  return { found: true, phone: norm, matches, message: lines.join(" ") };
}
