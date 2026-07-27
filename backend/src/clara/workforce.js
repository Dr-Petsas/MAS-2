import admin from "../firebase.js";
import { loadBooking } from "./booking.js";
import { todayBerlin, relativeDayLabel } from "./daySchedule.js";
import { holidayName, isWeekend } from "./holidays.js";
import { notifyOperator } from "./devices.js";
import { log } from "../log.js";

// ============================================================================
// Clara ⇄ Marie: Dienstplan, Urlaub & Anwesenheit (read + 1 Aktion)
//
// Marie lebt in der Plattform-Firestore (NICHT in mas_*). Clara/MAS-2 liest sie
// read-only über das Admin-SDK (gleiches Projekt) und beantwortet daraus
// deterministisch Fragen wie:
//   • "Wie viele Urlaubstage hat Frau Sahin noch?"
//   • "Wer ist morgen Nachmittag da?" / "Wann arbeitet Helferin Yilmaz?"
//   • "Habe ich am 24.12. genug Helferinnen?"
//   • "Wer ist heute krank / im Urlaub?" / "Wann hatte Frau X frei?"
// Plus EINE Aktion: Betriebsferien eintragen + alle per Push informieren
// (Urlaubsabzug ergibt sich deterministisch aus dem Saldo).
//
// Quellen (gleiche Collections wie marieService.ts):
//   clients/{c}/users/{userId}                         — Namen, hidden
//   clients/{c}/locations/{l}/marieStaff/{userId}      — Kontingent, Schicht
//   clients/{c}/locations/{l}/marieAbsences/{id}       — Urlaub/Krank/…/Betriebsferien
//
// Designgrundsatz: ALLE Zahlen kommen aus den Daten. Kein Name gefunden ->
// das sagen. Mehrdeutig -> Kandidaten nennen und zurückfragen. Niemals raten.
// ============================================================================

const DEFAULT_WORK_START = "08:00";
const DEFAULT_WORK_END = "17:00";
const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];
const AFTERNOON_HOUR = 13; // ab 13:00 = "Nachmittag"

const ABSENCE_LABEL = {
  urlaub: "Urlaub", krank: "krank", fortbildung: "Fortbildung",
  betriebsferien: "Betriebsferien", sonstige: "abwesend",
};

function s(v) { return String(v ?? "").trim(); }
function db() { return admin.firestore(); }

// ── Datum/Zeit-Helfer (alle YMD-Strings) ────────────────────────────────────

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysYmd(s0, n) { const d = new Date(`${s0}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); }
function weekdayOf(s0) { const n = new Date(`${s0}T12:00:00Z`).getUTCDay(); return n; } // 0=So..6=Sa
function hhmmToMin(t) { const m = String(t || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; }

/** Arbeitstage (laut workdays, ohne Wochenende/Feiertag) im inkl. Bereich. */
export function workdaysInRange(fromYmd, toYmd, workdays = DEFAULT_WORKDAYS, { skipHolidays = true } = {}) {
  if (!fromYmd || !toYmd || toYmd < fromYmd) return 0;
  const set = new Set(workdays);
  let n = 0;
  for (let d = fromYmd; d <= toYmd; d = addDaysYmd(d, 1)) {
    const wd = weekdayOf(d);
    if (!set.has(wd)) continue;
    if (skipHolidays && holidayName(d)) continue;
    n++;
    if (n > 1000) break; // Sicherung
  }
  return n;
}

// ── I/O: Team + Abwesenheiten laden ─────────────────────────────────────────

/** Team (alle nicht-versteckten Nutzer) + Marie-Profil (Kontingent/Schicht). */
export async function loadTeam(clientId) {
  const booking = await loadBooking(clientId).catch(() => null);
  const locationId = booking?.locationId;
  if (!locationId) return { ok: false, reason: "no_location", team: [], locationId: null };

  const [usersSnap, staffSnap] = await Promise.all([
    db().collection("clients").doc(clientId).collection("users").get(),
    db().collection("clients").doc(clientId).collection("locations").doc(locationId).collection("marieStaff").get(),
  ]);

  const profiles = {};
  staffSnap.forEach((doc) => { profiles[doc.id] = doc.data() || {}; });

  const team = [];
  usersSnap.forEach((doc) => {
    const u = doc.data() || {};
    // Gleicher Filter wie Maries Frontend-Team: keine Patienten, nicht versteckt.
    if (u.hidden === true || u.role === "patient") return;
    const p = profiles[doc.id] || {};
    const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || doc.id;
    team.push({
      id: doc.id,
      name,
      firstName: s(u.firstName),
      lastName: s(u.lastName),
      active: p.active !== false,
      vacationDaysPerYear: typeof p.vacationDaysPerYear === "number" ? p.vacationDaysPerYear : 0,
      workStart: s(p.workStart) || DEFAULT_WORK_START,
      workEnd: s(p.workEnd) || DEFAULT_WORK_END,
      workdays: Array.isArray(p.workdays) && p.workdays.length ? p.workdays.map(Number).filter((n) => n >= 0 && n <= 6) : DEFAULT_WORKDAYS,
      hasProfile: !!profiles[doc.id],
    });
  });
  team.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, locationId, team };
}

/** Abwesenheiten, die das Jahr berühren (wie marieService.listenAbsences). */
export async function loadAbsences(clientId, locationId, { year = new Date().getFullYear() } = {}) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const snap = await db().collection("clients").doc(clientId)
    .collection("locations").doc(locationId)
    .collection("marieAbsences").where("endDate", ">=", from).get();
  const list = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    const startDate = s(d.startDate);
    if (!startDate || startDate > to) return;
    if (d.status === "rejected") return; // abgelehnte zählen nicht
    list.push({
      id: doc.id,
      userId: s(d.userId),
      appliesToAll: d.appliesToAll === true,
      type: ABSENCE_LABEL[d.type] ? d.type : "urlaub",
      startDate,
      endDate: s(d.endDate) || startDate,
      allDay: d.allDay !== false,
      startTime: s(d.startTime),
      endTime: s(d.endTime),
      note: s(d.note),
      status: s(d.status) || "approved",
    });
  });
  return list;
}

// ── Reine Compute-Schicht (testbar) ─────────────────────────────────────────

function absenceCoversDay(a, day) {
  return a.startDate <= day && (a.endDate || a.startDate) >= day;
}

/** Urlaubssaldo je Mitarbeiter: Kontingent − genommen (Urlaub + Betriebsferien). */
export function vacationStats(staff, absences, year = new Date().getFullYear()) {
  const yStart = `${year}-01-01`, yEnd = `${year}-12-31`;
  const clip = (a) => ({ from: a.startDate < yStart ? yStart : a.startDate, to: (a.endDate || a.startDate) > yEnd ? yEnd : (a.endDate || a.startDate) });

  const ownUrlaub = absences.filter((a) => !a.appliesToAll && a.userId === staff.id && a.type === "urlaub");
  const betriebsferien = absences.filter((a) => a.appliesToAll && a.type === "betriebsferien");

  let takenUrlaub = 0;
  for (const a of ownUrlaub) { const c = clip(a); takenUrlaub += workdaysInRange(c.from, c.to, staff.workdays); }
  let takenBetrieb = 0;
  for (const a of betriebsferien) { const c = clip(a); takenBetrieb += workdaysInRange(c.from, c.to, staff.workdays); }

  const entitled = staff.vacationDaysPerYear || 0;
  const taken = takenUrlaub + takenBetrieb;
  return { entitled, takenUrlaub, takenBetrieb, taken, remaining: entitled - taken };
}

/** Wer ist an einem Tag da / abwesend / regulär eingeplant (nur aktive). */
export function presenceOn(team, absences, day) {
  const active = team.filter((m) => m.active);
  const teamClosed = absences.some((a) => a.appliesToAll && a.type === "betriebsferien" && absenceCoversDay(a, day));
  const wd = weekdayOf(day);
  const scheduled = active.filter((m) => m.workdays.includes(wd));

  const present = [], absent = [];
  for (const m of scheduled) {
    if (teamClosed) { absent.push({ ...m, type: "betriebsferien" }); continue; }
    const own = absences.find((a) => !a.appliesToAll && a.userId === m.id && absenceCoversDay(a, day));
    if (own) absent.push({ ...m, type: own.type, note: own.note, allDay: own.allDay, startTime: own.startTime, endTime: own.endTime });
    else present.push(m);
  }
  return { day, teamClosed, scheduled, present, absent, isHoliday: !!holidayName(day), isWeekend: isWeekend(day) };
}

/** Anwesende, die einen Tagesabschnitt abdecken (morning/afternoon/full). */
export function presentInPart(presence, part = "full") {
  if (part === "morning") return presence.present.filter((m) => hhmmToMin(m.workStart) < AFTERNOON_HOUR * 60);
  if (part === "afternoon") return presence.present.filter((m) => hhmmToMin(m.workEnd) > AFTERNOON_HOUR * 60);
  return presence.present;
}

/** Alle Abwesenheiten an einem Tag (für "wer ist heute krank/im Urlaub?"). */
export function absencesOnDay(team, absences, day) {
  const nameById = new Map(team.map((m) => [m.id, m.name]));
  const out = [];
  for (const a of absences) {
    if (!absenceCoversDay(a, day)) continue;
    if (a.appliesToAll) { out.push({ who: "Das ganze Team", type: a.type, note: a.note }); continue; }
    out.push({ who: nameById.get(a.userId) || "Unbekannt", type: a.type, note: a.note, allDay: a.allDay, startTime: a.startTime, endTime: a.endTime });
  }
  return out;
}

// ── Namens- & Datums-Auflösung aus Freitext ────────────────────────────────

const NAME_NOISE = /\b(frau|herr|hr|fr|helferin|kollegin|kollege|die|der|dr|doktor|von|noch|hat|ist|wie|viele|urlaubstage|urlaub|resturlaub)\b/gi;

/** Mitarbeiter aus dem Text bestimmen. -> {staff} | {candidates} | null. */
export function resolveStaffByName(team, text) {
  const cleaned = s(text).replace(NAME_NOISE, " ").replace(/[^\p{L}\s-]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!cleaned) return null;
  const tokens = cleaned.split(" ").filter((t) => t.length >= 2);
  if (!tokens.length) return null;

  const scored = team.map((m) => {
    const first = m.firstName.toLowerCase();
    const last = m.lastName.toLowerCase();
    const full = m.name.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (last === t || first === t) score += 3;
      else if (last.startsWith(t) || first.startsWith(t)) score += 2;
      else if (full.includes(t) && t.length >= 3) score += 1;
    }
    return { m, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored.length === 1 || scored[0].score > scored[1].score) return { staff: scored[0].m };
  // Gleichstand -> Kandidaten
  const top = scored.filter((x) => x.score === scored[0].score).map((x) => x.m);
  return top.length === 1 ? { staff: top[0] } : { candidates: top };
}

const WEEKDAYS = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6 };

/** Datum aus Text -> YMD oder null. heute/morgen/übermorgen, Wochentag, dd.mm(.yyyy). */
export function parseDateFromText(text, today = todayBerlin()) {
  const q = s(text).toLowerCase();
  if (/übermorgen|uebermorgen/.test(q)) return addDaysYmd(today, 2);
  if (/\bmorgen\b/.test(q)) return addDaysYmd(today, 1);
  if (/\bheute\b|\bheut\b/.test(q)) return today;

  // dd.mm. oder dd.mm.yyyy
  const dm = q.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})?/);
  if (dm) {
    const day = Number(dm[1]); const mon = Number(dm[2]);
    let year = dm[3] ? Number(dm[3]) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      let cand = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      // ohne Jahr: liegt das Datum in der Vergangenheit, nächstes Jahr nehmen
      if (!dm[3] && cand < today) cand = `${year + 1}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return cand;
    }
  }
  // Wochentag (nächstes Vorkommen)
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(q)) {
      const nextWeek = /(nächste|naechste|kommende)/.test(q);
      let d = today;
      for (let i = 0; i < 14; i++) { d = addDaysYmd(d, 1); if (weekdayOf(d) === wd) { if (!nextWeek) break; } }
      // simpler: erstes Vorkommen ab morgen
      d = today;
      for (let i = 1; i <= 14; i++) { const c = addDaysYmd(today, i); if (weekdayOf(c) === wd) { d = c; break; } }
      return d;
    }
  }
  return null;
}

function partFromText(text) {
  const q = s(text).toLowerCase();
  if (/nachmittag|mittag|nachmittags/.test(q)) return "afternoon";
  if (/vormittag|morgens|früh|frueh|vormittags/.test(q)) return "morning";
  return "full";
}

// ── Gesprochene Antworten (Deutsch) ─────────────────────────────────────────

const cap = (s0) => (s0 ? s0.charAt(0).toUpperCase() + s0.slice(1) : s0);
function joinDe(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`;
}
function hoursPhrase(m) { return `von ${m.workStart.replace(":", " Uhr ").replace(" Uhr 00", " Uhr")} bis ${m.workEnd.replace(":", " Uhr ").replace(" Uhr 00", " Uhr")}`; }

export function spokenVacation(staff, stats, year) {
  if (!staff.hasProfile && !stats.entitled) {
    return `Für ${staff.name} ist im Dienstplan noch kein Urlaubskontingent hinterlegt. Sobald Marie die Urlaubstage einträgt, kann ich den Resturlaub ausrechnen.`;
  }
  if (!stats.entitled) return `Für ${staff.name} sind keine Jahres-Urlaubstage hinterlegt; genommen wurden bisher ${stats.taken} Tage in ${year}.`;
  const parts = [`${staff.name} hat ${stats.entitled} Urlaubstage im Jahr ${year}`];
  if (stats.taken === 0) parts.push(`und davon noch keinen genommen — also alle ${stats.remaining} offen`);
  else {
    const detail = stats.takenBetrieb ? ` (davon ${stats.takenBetrieb} durch Betriebsferien)` : "";
    parts.push(`davon ${stats.taken} genommen${detail}, also noch ${stats.remaining} übrig`);
  }
  return cap(`${parts.join(", ")}.`);
}

export function spokenVacationAll(rows, year) {
  const withQuota = rows.filter((r) => r.stats.entitled > 0);
  if (!withQuota.length) return `Im Dienstplan ist für ${year} noch kein Urlaubskontingent hinterlegt.`;
  const lines = withQuota.map((r) => `${r.staff.name}: noch ${r.stats.remaining} von ${r.stats.entitled}`);
  return `Resturlaub ${year} — ${joinDe(lines)}.`;
}

export function spokenPresence(presence, { part = "full", operatorAsksWho = true } = {}) {
  const rel = relativeDayLabel(presence.day);
  if (presence.teamClosed) return cap(`${rel} sind Betriebsferien — niemand ist im Dienst.`);
  if (presence.isHoliday) return cap(`${rel} ist ein Feiertag — die Praxis ist zu.`);
  if (presence.isWeekend && !presence.scheduled.length) return cap(`${rel} ist Wochenende — niemand ist regulär eingeplant.`);

  const list = presentInPart(presence, part);
  const partWord = part === "afternoon" ? " am Nachmittag" : part === "morning" ? " am Vormittag" : "";
  if (!list.length) return cap(`${rel}${partWord} ist niemand im Dienst.`);
  const names = list.map((m) => part === "full" ? `${m.name} (${hoursPhrase(m)})` : m.name);
  const head = list.length === 1 ? `ist ${names[0]} da` : `sind ${list.length} im Dienst: ${joinDe(names)}`;
  let msg = cap(`${rel}${partWord} ${head}.`);
  if (presence.absent.length) {
    const abs = presence.absent.map((m) => `${m.name} (${ABSENCE_LABEL[m.type] || "abwesend"})`);
    msg += ` Abwesend: ${joinDe(abs)}.`;
  }
  return msg;
}

export function spokenCoverage(presence, { threshold = 0 } = {}) {
  const rel = relativeDayLabel(presence.day);
  if (presence.teamClosed) return cap(`${rel} sind Betriebsferien eingetragen — die Praxis ist geschlossen.`);
  if (presence.isHoliday) return cap(`${rel} ist ein Feiertag — die Praxis ist zu.`);
  const present = presence.present.length;
  const scheduled = presence.scheduled.length;
  const morning = presentInPart(presence, "morning").length;
  const afternoon = presentInPart(presence, "afternoon").length;
  let msg = `${cap(rel)} sind ${present} von ${scheduled} regulär eingeplanten Helferinnen da (Vormittag ${morning}, Nachmittag ${afternoon}).`;
  if (presence.absent.length) msg += ` Es fehlen: ${joinDe(presence.absent.map((m) => `${m.name} (${ABSENCE_LABEL[m.type] || "abwesend"})`))}.`;
  if (threshold > 0) msg += present >= threshold ? ` Das reicht für ${threshold}.` : ` Das ist knapp — für ${threshold} fehlt Personal.`;
  else if (present === 0) msg += " Achtung: niemand ist da.";
  else if (present < scheduled) msg += " Es ist also dünner besetzt als üblich.";
  return msg;
}

export function spokenSchedule(staff) {
  const wdNames = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const days = staff.workdays.slice().sort((a, b) => a - b).map((d) => wdNames[d]);
  if (!days.length) return `Für ${staff.name} sind keine Arbeitstage hinterlegt.`;
  return `${staff.name} arbeitet ${joinDe(days)}, jeweils ${hoursPhrase(staff)}.`;
}

export function spokenAbsencesOnDay(list, day) {
  const rel = relativeDayLabel(day);
  if (!list.length) return cap(`${rel} ist niemand abwesend gemeldet.`);
  const phrases = list.map((a) => `${a.who} (${ABSENCE_LABEL[a.type] || a.type})`);
  return cap(`${rel} ${list.length === 1 ? "ist" : "sind"} abwesend: ${joinDe(phrases)}.`);
}

export function spokenAbsenceHistory(staff, absences) {
  const own = absences.filter((a) => !a.appliesToAll && a.userId === staff.id)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1)).slice(0, 6);
  if (!own.length) return `Für ${staff.name} sind keine Abwesenheiten eingetragen.`;
  const entry = (a) => {
    const range = a.startDate === a.endDate ? relativeDayLabel(a.startDate) : `${relativeDayLabel(a.startDate)} bis ${relativeDayLabel(a.endDate)}`;
    return `${ABSENCE_LABEL[a.type] || a.type} ${range}`;
  };
  return `${staff.name}: ${joinDe(own.map(entry))}.`;
}

// ── Intent-Router: eine Frage, eine Antwort ─────────────────────────────────

/**
 * Beantwortet eine Dienstplan-/Urlaubs-Frage deterministisch.
 * @returns {{ok:true, intent:string, spoken:string}}
 */
export async function askWorkforce(clientId, query) {
  const q = s(query);
  const t = await loadTeam(clientId);
  if (!t.ok) return { ok: true, intent: "no_location", spoken: "Ich kann den Dienstplan gerade nicht laden — am Standort ist nichts hinterlegt." };
  const year = Number(todayBerlin().slice(0, 4));
  const absences = await loadAbsences(clientId, t.locationId, { year });

  const lower = q.toLowerCase();
  const named = resolveStaffByName(t.team, q);
  const date = parseDateFromText(q);
  const part = partFromText(q);

  // Historie-Phrasierung ("wann hatte X Urlaub/frei?") vom Saldo abgrenzen.
  const asksWhenOff = /wann.*(frei|urlaub|abwesend)|frei genommen|frei gehabt|frei war|urlaub gemacht|urlaub gehabt|hatte.*(urlaub|frei)/.test(lower);

  // 1) Urlaubssaldo (wie viele Tage noch) — NICHT bei Historie-Fragen.
  if (/(urlaub|resturlaub|urlaubstage|urlaubsanspruch)/.test(lower) && !/betriebsferien/.test(lower) && !asksWhenOff) {
    if (named?.candidates) return { ok: true, intent: "vacation", spoken: `Wen genau meinen Sie? Ich habe ${joinDe(named.candidates.map((m) => m.name))}.` };
    if (named?.staff) return { ok: true, intent: "vacation", spoken: spokenVacation(named.staff, vacationStats(named.staff, absences, year), year) };
    const rows = t.team.filter((m) => m.active).map((m) => ({ staff: m, stats: vacationStats(m, absences, year) }));
    return { ok: true, intent: "vacation_all", spoken: spokenVacationAll(rows, year) };
  }

  // 2) Abwesenheits-Historie einer Person ("wann hatte X frei/Urlaub?")
  if (named?.staff && asksWhenOff) {
    return { ok: true, intent: "absence_history", spoken: spokenAbsenceHistory(named.staff, absences) };
  }

  // 3) Besetzung / "genug Helferinnen?"
  if (/(genug|besetzt|besetzung|unterbesetzt|reicht|reichen|wie viele.*(da|im dienst))/.test(lower)) {
    const day = date || todayBerlin();
    const m = lower.match(/für\s+(\d+)/);
    const threshold = m ? Number(m[1]) : 0;
    return { ok: true, intent: "coverage", spoken: spokenCoverage(presenceOn(t.team, absences, day), { threshold }) };
  }

  // 4) Person-Arbeitszeit ("wann arbeitet/ist X da?") ohne konkreten Tag
  if (named?.staff && !date && /(wann|arbeitszeit|arbeitet|dienst|schicht|da)/.test(lower)) {
    // mit Tagesabschnitt -> Anwesenheit an Werktagen, sonst Regelplan
    return { ok: true, intent: "schedule", spoken: spokenSchedule(named.staff) };
  }

  // 5) Wer ist krank/im Urlaub/abwesend (an einem Tag)
  if (/(krank|abwesend|im urlaub|fehlt|fehlen)/.test(lower)) {
    const day = date || todayBerlin();
    return { ok: true, intent: "absences_day", spoken: spokenAbsencesOnDay(absencesOnDay(t.team, absences, day), day) };
  }

  // 6) Wer ist da / arbeitet (Anwesenheit, ggf. Tagesabschnitt) — auch personenbezogen mit Tag
  if (/(wer|wieviel|wie viele).*(da|arbeitet|im dienst|anwesend|dienst)|wer ist da|anwesen/.test(lower) || (date && /(da|dienst|arbeit)/.test(lower))) {
    const day = date || todayBerlin();
    const presence = presenceOn(t.team, absences, day);
    if (named?.staff) {
      // "Ist X am ... / nachmittags da?"
      const inPart = presentInPart(presence, part).some((m) => m.id === named.staff.id);
      const absent = presence.absent.find((m) => m.id === named.staff.id);
      const rel = relativeDayLabel(day);
      const pw = part === "afternoon" ? " am Nachmittag" : part === "morning" ? " am Vormittag" : "";
      if (absent) return { ok: true, intent: "person_presence", spoken: cap(`${rel} ist ${named.staff.name} nicht da (${ABSENCE_LABEL[absent.type] || "abwesend"}).`) };
      if (inPart) return { ok: true, intent: "person_presence", spoken: cap(`${rel}${pw} ist ${named.staff.name} da, ${hoursPhrase(named.staff)}.`) };
      return { ok: true, intent: "person_presence", spoken: cap(`${rel}${pw} ist ${named.staff.name} nicht eingeplant.`) };
    }
    return { ok: true, intent: "presence", spoken: spokenPresence(presence, { part }) };
  }

  // 7) Fallback: Tagesüberblick Anwesenheit für heute (oder genannten Tag)
  const day = date || todayBerlin();
  return { ok: true, intent: "presence", spoken: spokenPresence(presenceOn(t.team, absences, day), { part }) };
}

// ── Aktion: Betriebsferien eintragen + alle informieren ─────────────────────

/**
 * Trägt Betriebsferien (ganzes Team) in Maries Kalender ein, informiert alle
 * aktiven Mitarbeiter per Push und liefert den deterministischen Urlaubsabzug
 * je Person. Idempotenz-Schutz: identischer Zeitraum wird nicht doppelt angelegt.
 */
export async function setBetriebsferien(clientId, { fromYmd, toYmd, note = "", by = "Clara", notify = true } = {}) {
  const from = s(fromYmd);
  const to = s(toYmd) || from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false, reason: "bad_dates" };
  if (to < from) return { ok: false, reason: "end_before_start" };

  const t = await loadTeam(clientId);
  if (!t.ok) return { ok: false, reason: "no_location" };
  const locRef = db().collection("clients").doc(clientId).collection("locations").doc(t.locationId);

  // Idempotenz: gleicher Betriebsferien-Zeitraum schon vorhanden?
  const existing = await locRef.collection("marieAbsences")
    .where("endDate", ">=", from).get();
  const dup = existing.docs.find((d) => { const x = d.data() || {}; return x.appliesToAll === true && x.type === "betriebsferien" && s(x.startDate) === from && s(x.endDate || x.startDate) === to; });
  let absenceId = dup?.id || null;

  if (!absenceId) {
    const ref = locRef.collection("marieAbsences").doc();
    await ref.set({
      userId: "", appliesToAll: true, type: "betriebsferien",
      startDate: from, endDate: to, allDay: true, startTime: "", endTime: "",
      note: s(note), status: "approved", createdBy: s(by), approvedBy: s(by),
      createdAt: new Date(),
    });
    absenceId = ref.id;
  }

  // Deterministischer Urlaubsabzug je aktiver Person (Arbeitstage im Zeitraum).
  const active = t.team.filter((m) => m.active);
  const deductions = active.map((m) => ({ name: m.name, days: workdaysInRange(from, to, m.workdays) }));

  // Push an alle aktiven Mitarbeiter (best effort, je gekoppeltes Gerät).
  let notified = 0, noDevice = 0;
  if (notify) {
    const title = "Betriebsferien";
    const body = `Die Praxis ist von ${deDate(from)} bis ${deDate(to)} geschlossen (Betriebsferien).${note ? ` ${note}` : ""}`;
    for (const m of active) {
      const r = await notifyOperator(clientId, m.id, { title, body }).catch(() => ({ ok: false }));
      if (r.ok && r.sent > 0) notified += 1; else noDevice += 1;
    }
  }

  log.info("workforce.betriebsferien", { clientId, from, to, notified, noDevice });
  return { ok: true, absenceId, from, to, affected: active.length, notified, noDevice, deductions };
}

function deDate(ymdStr) {
  const m = String(ymdStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ymdStr;
}

export function spokenBetriebsferien(result) {
  if (!result.ok) {
    if (result.reason === "bad_dates") return "Dafür brauche ich ein gültiges Von- und Bis-Datum.";
    if (result.reason === "end_before_start") return "Das Enddatum liegt vor dem Startdatum — bitte noch einmal.";
    return "Ich konnte die Betriebsferien nicht eintragen.";
  }
  const parts = [`Betriebsferien von ${deDate(result.from)} bis ${deDate(result.to)} sind eingetragen.`];
  if (result.notified) parts.push(`${result.notified} von ${result.affected} Mitarbeitern wurden per Push informiert${result.noDevice ? ` (${result.noDevice} ohne gekoppeltes Handy)` : ""}.`);
  else if (result.affected) parts.push(`Push war nicht möglich — kein Mitarbeiter hat ein gekoppeltes Handy.`);
  const maxD = result.deductions.reduce((a, b) => Math.max(a, b.days), 0);
  if (maxD > 0) parts.push(`Jeder bekommt bis zu ${maxD} Urlaubstage abgezogen, je nach Arbeitstagen im Zeitraum.`);
  return parts.join(" ");
}
