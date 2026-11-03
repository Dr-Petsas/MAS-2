import { findSlots } from "../clara/booking.js";
import { parseSlotWish, pickSlots } from "./callBooking.js";

// ============================================================================
// Termin-Auftraege an Lisa mit fertig geprueften Terminen (Live 03.11.2026):
// Auftrag "Termin fuer heute zwischen 12 und 15 Uhr" — heute war reichlich frei,
// Lisa suchte in der TelefonKI aber unter einem anderen Besuchsgrund, fand fuer
// heute nichts und buchte den 09.11. MAS sucht die passenden freien Termine
// deshalb selbst (dieselbe Quelle wie Clara, getFreeTimeSlots) und gibt sie im
// Auftrag und als freeTimeSlots mit.
// ============================================================================

const TZ = "Europe/Berlin";
const DEFAULT_MOTIV = "Kontrolluntersuchung";

const BUCHUNG_RE = /\btermin\w*\b[^.!?]{0,80}\b(?:buch\w*|vereinbar\w*|mach\w*|ausmach\w*|anbiet\w*|geben|finden|ausmachen)\b|\b(?:buch\w*|vereinbar\w*|mach\w*|anbiet\w*)\b[^.!?]{0,60}\btermin\w*\b/i;
const NICHT_BUCHUNG_RE = /\b(?:absag\w*|abgesagt|storn\w*|f(?:ä|ae)llt\s+aus|ausf(?:ä|ae)llt|sp(?:ä|ae)ter\s+kommen)\b/i;

const MOTIV_WORTE = [
  [/zahnreinigung|\bpzr\b|prophylaxe/i, "professionelle Zahnreinigung"],
  [/schmerz|notfall|akut/i, "akute Beschwerden"],
  [/implantat/i, "IMP Besprechung"],
  [/zahnersatz|krone|br(?:ü|ue)cke|prothese/i, "ZE Besprechung"],
  [/kontroll|recall|vorsorge|nachsorge/i, DEFAULT_MOTIV],
];

function s(v) {
  return v == null ? "" : String(v).trim();
}

function berlinTag(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(ms));
}

/** Will der Auftrag einen Termin VEREINBAREN (nicht absagen/verschieben)? Pure. */
export function istBuchungsAuftrag(text) {
  const t = s(text);
  return BUCHUNG_RE.test(t) && !NICHT_BUCHUNG_RE.test(t);
}

/** Besuchsgrund aus dem Auftrag, sonst Kontrolluntersuchung. Pure. */
export function motivAusAuftrag(text) {
  const t = s(text);
  for (const [re, name] of MOTIV_WORTE) if (re.test(t)) return name;
  return DEFAULT_MOTIV;
}

/**
 * Tag und Zeitfenster aus dem Auftrag. "heute"/"morgen"/"uebermorgen" setzen das
 * Datum, "zwischen 12 und 15 Uhr" / "ab 14 Uhr" / "bis 11 Uhr" das Fenster
 * (Minuten ab Mitternacht). Pure.
 */
export function wunschAusAuftrag(text, nowMs = Date.now()) {
  const t = ` ${s(text).toLowerCase()} `;
  const wish = parseSlotWish(t);
  if (/\b(?:ü|ue)bermorgen\b/.test(t)) wish.date = berlinTag(nowMs + 2 * 86400000);
  else if (/\bmorgen\b/.test(t)) wish.date = berlinTag(nowMs + 86400000);
  else if (/\bheute\b/.test(t)) wish.date = berlinTag(nowMs);

  let von = null;
  let bis = null;
  const zw = t.match(/\bzwischen\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr\s*)?und\s+(\d{1,2})(?:[:.](\d{2}))?/);
  if (zw) {
    von = Number(zw[1]) * 60 + Number(zw[2] || 0);
    bis = Number(zw[3]) * 60 + Number(zw[4] || 0);
  } else {
    const ab = t.match(/\bab\s+(\d{1,2})(?:[:.](\d{2}))?\s*uhr/);
    const bm = t.match(/\bbis\s+(\d{1,2})(?:[:.](\d{2}))?\s*uhr/);
    if (ab) von = Number(ab[1]) * 60 + Number(ab[2] || 0);
    if (bm) bis = Number(bm[1]) * 60 + Number(bm[2] || 0);
  }
  if (von != null || bis != null) {
    wish.hour = null;
    wish.hourMin = null;
    wish.hourMax = null;
  }
  const hatWunsch = !!(wish.date || wish.weekday != null || wish.minDaysAhead || wish.hour != null
    || wish.hourMin != null || von != null || bis != null);
  return { wish: hatWunsch ? wish : null, von, bis };
}

/** "heute um 12:45 Uhr" / "morgen um ..." / "Donnerstag, 5. November um ...". Pure. */
export function terminSprech(iso, nowMs = Date.now()) {
  const m = String(iso || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return s(iso);
  const zeit = `${m[2]}:${m[3]} Uhr`;
  if (m[1] === berlinTag(nowMs)) return `heute um ${zeit}`;
  if (m[1] === berlinTag(nowMs + 86400000)) return `morgen um ${zeit}`;
  const tag = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${m[1]}T12:00:00Z`));
  return `${tag} um ${zeit}`;
}

/** Freie Slots auf Wunschtag und Zeitfenster eingrenzen, max. drei. Pure. */
export function waehleTermine(isoSlots, { wish, von, bis }, { nowMs = Date.now(), max = 3 } = {}) {
  const imFenster = (iso) => {
    const m = String(iso).match(/T(\d{2}):(\d{2})/);
    if (!m) return false;
    const min = Number(m[1]) * 60 + Number(m[2]);
    return (von == null || min >= von) && (bis == null || min < bis);
  };
  const zukunft = (isoSlots || []).map(String)
    .filter((iso) => new Date(iso).getTime() >= nowMs + 60 * 60000)
    .sort();
  let pool = zukunft.filter(imFenster);
  if (wish && pool.length) {
    const p = pickSlots(pool, { wish, nowMs, max: pool.length });
    pool = p.wishMatched ? p.slots.map((x) => x.iso).sort() : [];
  }
  if (pool.length) return { slots: pool.slice(0, max), wishMatched: true };
  return { slots: zukunft.slice(0, max), wishMatched: !wish && von == null && bis == null };
}

/** Regieanweisung fuer Lisa mit den geprueften Terminen. Pure. */
export function termineRegie(res, nowMs = Date.now()) {
  if (!res?.slots?.length) return "";
  const liste = res.slots.map((iso) => terminSprech(iso, nowMs)).join("; ");
  const wer = [res.visitMotiveName, res.calendarName ? `bei ${res.calendarName}` : ""].filter(Boolean).join(" ");
  if (res.wishMatched) {
    return `\n\n[Regieanweisung, NICHT vorlesen: Diese Termine hat die Praxis eben im Kalender geprüft, sie sind frei${wer ? ` (${wer})` : ""}: ${liste}. `
      + "Biete GENAU diese Termine an und buche den, den der Patient wählt. Sage NIE, dass im gewünschten Zeitraum nichts frei ist. "
      + "Nur wenn der Patient keinen davon kann, suche nach anderen Zeiten.]";
  }
  return `\n\n[Regieanweisung, NICHT vorlesen: Im gewünschten Zeitraum ist laut Kalender nichts mehr frei. Sage das ehrlich und biete die nächsten freien Termine an${wer ? ` (${wer})` : ""}: ${liste}.]`;
}

/**
 * Passende freie Termine fuer einen Termin-Auftrag. null, wenn der Auftrag kein
 * Buchungsauftrag ist oder der Kalender nichts liefert.
 */
export async function termineFuerAuftrag(clientId, auftrag, { nowMs = Date.now(), find = findSlots } = {}) {
  if (!istBuchungsAuftrag(auftrag)) return null;
  const { wish, von, bis } = wunschAusAuftrag(auftrag, nowMs);
  const visitMotiveName = motivAusAuftrag(auftrag);
  const startDate = wish?.date && wish.date >= berlinTag(nowMs) ? wish.date : berlinTag(nowMs);
  const found = await find(clientId, { visitMotiveName, startDate });
  if (!found?.ok || !Array.isArray(found.slots) || !found.slots.length) return null;
  const pick = waehleTermine(found.slots, { wish, von, bis }, { nowMs });
  if (!pick.slots.length) return null;
  return {
    slots: pick.slots,
    wishMatched: pick.wishMatched,
    calendarId: found.calendarId || "",
    calendarName: found.calendarName || "",
    visitMotiveName: found.visitMotiveName || visitMotiveName,
  };
}
