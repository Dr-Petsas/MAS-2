// Zurueckstellen eines Vorgangs ("spaeter, am Montag"): bis zu einem Zeitpunkt
// steht er nicht in der offenen Liste, danach wieder. Reine Rechnung, ohne Firestore.
//
// Gespeichert wird am Vorgang `zurueckgestellt: { bisMs, seitMs, by, anzahl }`.
// Ein neuer Kontakt nach `seitMs` (jemand ruft wieder an) hebt die Rueckstellung
// in der Anzeige von selbst auf. Not-Aus: MAS_ZURUECKSTELLEN=0.
import { holidayName, isWeekend } from "../clara/holidays.js";

const TZ = "Europe/Berlin";
const TAG_MS = 24 * 3_600_000;
export const HOECHSTENS_TAGE = 365;

export const zurueckstellenAktiv = () => process.env.MAS_ZURUECKSTELLEN !== "0";

const ymd = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** Berliner Wanduhr (JJJJ-MM-TT, Minuten seit Mitternacht) -> Zeitstempel. */
export function berlinMs(tag, minuten = 0) {
  const mittagUtc = new Date(`${tag}T12:00:00Z`).getTime();
  if (Number.isNaN(mittagUtc)) return NaN;
  const stunde = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(mittagUtc)));
  return new Date(`${tag}T00:00:00Z`).getTime() - (stunde - 12) * 3_600_000 + minuten * 60_000;
}

/** Der naechste Tag nach heute, der weder Wochenende noch Feiertag ist. */
export function naechsterArbeitstag(nowMs = Date.now()) {
  let ms = berlinMs(ymd(nowMs), 12 * 60);
  for (let i = 0; i < 14; i += 1) {
    ms += TAG_MS;
    const tag = ymd(ms);
    if (!isWeekend(tag) && !holidayName(tag)) return tag;
  }
  return ymd(nowMs + TAG_MS);
}

function minutenAus(zeit) {
  const teile = String(zeit || "").trim().replace(".", ":").split(":");
  if (!teile[0]) return null;
  const h = Number(teile[0]);
  const m = teile.length > 1 ? Number(teile[1]) : 0;
  return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : null;
}

/**
 * Bis wann? `date` (JJJJ-MM-TT) und `time` (HH:MM) sind beide freiwillig:
 * ohne Datum der naechste Arbeitstag, mit Uhrzeit allein heute zu dieser Uhrzeit.
 * @returns {{ok:true,bisMs:number,tag:string,mitUhrzeit:boolean}|{ok:false,reason:string}}
 */
export function bisAus({ date = "", time = "", nowMs = Date.now() } = {}) {
  const minuten = minutenAus(time);
  if (String(time || "").trim() && minuten == null) return { ok: false, reason: "uhrzeit_unlesbar" };
  let tag = String(date || "").trim();
  if (!tag) tag = minuten != null ? ymd(nowMs) : naechsterArbeitstag(nowMs);
  const bisMs = berlinMs(tag, minuten || 0);
  if (Number.isNaN(bisMs) || tag.length !== 10) return { ok: false, reason: "datum_unlesbar" };
  if (bisMs <= nowMs) return { ok: false, reason: "vergangen" };
  if (bisMs > nowMs + HOECHSTENS_TAGE * TAG_MS) return { ok: false, reason: "zu_weit" };
  return { ok: true, bisMs, tag, mitUhrzeit: minuten != null };
}

/** "morgen, Freitag, den 27. November" bzw. mit Uhrzeit "... um 14:30 Uhr". */
export function bisGesprochen(bisMs, { mitUhrzeit = false, nowMs = Date.now() } = {}) {
  const d = new Date(bisMs);
  const tag = ymd(bisMs);
  const wt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(d);
  const dm = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric", month: "long" }).format(d);
  const nah = tag === ymd(nowMs) ? "heute" : tag === ymd(nowMs + TAG_MS) ? `morgen, ${wt}, den ${dm}` : `${wt}, den ${dm}`;
  if (!mitUhrzeit) return nah;
  const zeit = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return `${nah} um ${zeit} Uhr`;
}

/**
 * Lage eines Vorgangs: `aktiv` = jetzt zurueckgestellt, `vorbei` = war es und liegt wieder vor.
 * @returns {null|{aktiv:boolean,bisMs:number,seitMs:number,wer:string,anzahl:number}}
 */
export function zurueckgestelltVon(c, nowMs = Date.now()) {
  const z = c?.zurueckgestellt;
  const bisMs = Number(z?.bisMs) || 0;
  if (!bisMs || !zurueckstellenAktiv()) return null;
  const seitMs = Number(z.seitMs) || 0;
  const neuerKontakt = (Number(c.lastContactAt) || 0) > seitMs;
  return { aktiv: bisMs > nowMs && !neuerKontakt, bisMs, seitMs, wer: String(z.by || "").trim(), anzahl: Number(z.anzahl) || 1, neuerKontakt };
}
