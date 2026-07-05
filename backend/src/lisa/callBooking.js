import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { findSlots } from "../clara/booking.js";
import { commitBooking } from "../clara/agentBooking.js";
import { emitCommand } from "../clara/sessions.js";
import { addUpdate } from "../brain/caseStore.js";
import { appendEvent } from "../brain/eventStore.js";
import { log } from "../log.js";

// ============================================================================
// W-OUTREACH-2 — Lisa bucht LIVE im Gespräch (Auftrag Chef 05.07.2026):
// "Es werden keine Terminwünsche verneint. Jeder, der angerufen wird, darf
// einen Alternativtermin buchen — sofort, ohne Rückruf, ohne Mehrarbeit."
//
// Lisa (ElevenLabs-Agent) bekommt dafür zwei Webhook-Tools, die hier bedient
// werden (Route: src/routes/lisaTools.js):
//   offer_slots  -> echte freie Termine aus dem Plattform-Kalender
//                   (getFreeTimeSlots-CF — DIESELBE Quelle wie das Web-Widget),
//                   optional nach Patientenwunsch gefiltert ("Donnerstag
//                   nachmittags", "nächste Woche vormittags").
//   book_slot    -> bucht SOFORT fest über masBookAppointment (die CF prüft
//                   die Verfügbarkeit selbst — Doppelbuchung unmöglich).
//                   Ist der Slot inzwischen weg, kommen im selben Zug neue
//                   Alternativen zurück, Lisa bietet sie direkt an.
//
// Der Kontext (WEN buchen, WELCHE Behandlung, WELCHER Kalender) hängt am
// Lisa-Task (bookingContext, gesetzt von recallCoach/gapfill-call-patient).
// Ohne Kontext buchen die Tools NICHTS — sie antworten dann ehrlich, dass
// kein Kalenderzugriff besteht (Lisa bietet den Rückruf der Praxis an).
// ============================================================================

const TZ = "Europe/Berlin";
const TASKS = "mas_lisa_tasks";

function s(v) {
  return v == null ? "" : String(v).trim();
}

function tasksCol(clientId) {
  return masCollection(clientId, TASKS);
}

// ---------------------------------------------------------------------------
// Sprech-Formate
// ---------------------------------------------------------------------------

/** "2026-07-14T10:30:00+02:00" -> "Dienstag, 14. Juli um 10:30 Uhr". Pure. */
export function spokenSlot(iso) {
  const m = String(iso || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return s(iso);
  const d = new Date(`${m[1]}T12:00:00Z`);
  const day = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
  return `${day} um ${m[2]}:${m[3]} Uhr`;
}

// ---------------------------------------------------------------------------
// Patientenwunsch verstehen (pure, deterministisch — kein LLM nötig)
// ---------------------------------------------------------------------------

const WEEKDAYS = [
  { idx: 1, re: /\bmontags?\b/ },
  { idx: 2, re: /\bdienstags?\b/ },
  { idx: 3, re: /\bmittwochs?\b/ },
  { idx: 4, re: /\bdonnerstags?\b/ },
  { idx: 5, re: /\bfreitags?\b/ },
  { idx: 6, re: /\bsamstags?\b/ },
  { idx: 0, re: /\bsonntags?\b/ },
];

/**
 * Freitext-Wunsch -> Filterkriterien. Versteht Wochentage, Tageszeiten,
 * "nächste Woche", konkrete Uhrzeiten ("um 15 Uhr") und Daten ("14.07.").
 * Unbekanntes bleibt einfach leer (dann gelten nur "zukünftig, chronologisch").
 * Pure — testbar ohne Netz.
 */
export function parseSlotWish(text) {
  const t = ` ${s(text).toLowerCase()} `;
  const wish = { weekday: null, hourMin: null, hourMax: null, hour: null, minDaysAhead: 0, date: null };
  for (const wd of WEEKDAYS) {
    if (wd.re.test(t)) { wish.weekday = wd.idx; break; }
  }
  if (/vormittag|frueh|früh|morgens/.test(t)) { wish.hourMin = 7; wish.hourMax = 12; }
  else if (/nachmittag/.test(t)) { wish.hourMin = 12; wish.hourMax = 18; }
  else if (/abend|spaet|spät/.test(t)) { wish.hourMin = 16; wish.hourMax = 21; }
  if (/n[äa]chste woche|kommende woche/.test(t)) wish.minDaysAhead = 7;
  else if (/uebernaechste|übernächste/.test(t)) wish.minDaysAhead = 14;
  const hm = t.match(/\b(?:um|gegen)\s+(\d{1,2})(?::(\d{2}))?\s*uhr/);
  if (hm) wish.hour = Math.min(23, Number(hm[1]));
  const dm = t.match(/\b(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4}))?/);
  if (dm) {
    const year = dm[3] || String(new Date().getFullYear());
    wish.date = `${year}-${String(dm[2]).padStart(2, "0")}-${String(dm[1]).padStart(2, "0")}`;
  }
  return wish;
}

function weekdayOfIso(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

/**
 * Freie ISO-Slots nach Wunsch filtern und die besten (max.) drei wählen.
 * Regeln: nur Zukunft (>= nowMs + 60 min Vorlauf), Wunsch-Kriterien hart
 * anwenden, aber NIE mit leeren Händen dastehen: passt nichts zum Wunsch,
 * kommen die nächsten freien Termine überhaupt (ehrlich gekennzeichnet).
 * Ohne Wunsch: Vielfalt — möglichst verschiedene Tage. Pure.
 *
 * @returns {{slots:{iso:string,date:string,time:string}[], wishMatched:boolean}}
 */
export function pickSlots(isoSlots, { wish = null, nowMs = Date.now(), excludeIso = "", max = 3 } = {}) {
  const parsed = (Array.isArray(isoSlots) ? isoSlots : [])
    .map((iso) => {
      const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
      return m ? { iso: String(iso), date: m[1], time: `${m[2]}:${m[3]}`, hour: Number(m[2]), ms: new Date(iso).getTime() } : null;
    })
    .filter((p) => p && Number.isFinite(p.ms) && p.ms >= nowMs + 60 * 60000)
    .filter((p) => !excludeIso || p.iso !== excludeIso);
  parsed.sort((a, b) => a.ms - b.ms);

  const applyWish = (pool) => {
    if (!wish) return pool;
    let out = pool;
    if (wish.date) out = out.filter((p) => p.date === wish.date);
    if (wish.weekday != null) out = out.filter((p) => weekdayOfIso(p.date) === wish.weekday);
    if (wish.minDaysAhead > 0) out = out.filter((p) => p.ms >= nowMs + wish.minDaysAhead * 86400000);
    if (wish.hour != null) out = out.filter((p) => Math.abs(p.hour - wish.hour) <= 1);
    else if (wish.hourMin != null) out = out.filter((p) => p.hour >= wish.hourMin && p.hour < wish.hourMax);
    return out;
  };

  let pool = applyWish(parsed);
  const wishMatched = !wish || pool.length > 0;
  if (!pool.length) pool = parsed; // nie ablehnen: dann eben die nächsten freien

  // Vielfalt: erst je Tag der früheste Slot, aufgefüllt mit den restlichen.
  const byDay = [];
  const seenDays = new Set();
  for (const p of pool) {
    if (seenDays.has(p.date)) continue;
    seenDays.add(p.date);
    byDay.push(p);
    if (byDay.length >= max) break;
  }
  for (const p of pool) {
    if (byDay.length >= max) break;
    if (!byDay.includes(p)) byDay.push(p);
  }
  byDay.sort((a, b) => a.ms - b.ms);
  return { slots: byDay.map(({ iso, date, time }) => ({ iso, date, time })), wishMatched };
}

/** Sprechfertige Angebots-Ansage für Lisa. Pure. */
export function spokenSlotOffer(slots, { wishMatched = true } = {}) {
  if (!slots.length) {
    return "Im Kalender ist aktuell leider kein freier Termin eingetragen. Sage dem Patienten, dass sich die Praxis kurzfristig mit einem Termin meldet, und bedanke dich.";
  }
  const list = slots.map((x) => spokenSlot(x.iso)).join("; oder ");
  const prefix = wishMatched
    ? "Frei ist:"
    : "Zum genauen Wunsch ist nichts frei — die nächsten freien Termine sind:";
  return `${prefix} ${list}. Frage, welcher Termin passt, und buche ihn dann SOFORT mit book_slot (Feld slot_iso).`;
}

// ---------------------------------------------------------------------------
// Task-Kontext
// ---------------------------------------------------------------------------

/**
 * Buchungskontext eines laufenden Lisa-Anrufs. Nur Tasks der Art "call" mit
 * hinterlegtem bookingContext dürfen die Kalender-Tools nutzen — und nur
 * zeitnah zum Anruf (Schutz gegen verspätete/wiederholte Webhook-Zustellung).
 */
const TASK_MAX_AGE_MS = 6 * 3600000;

export async function taskBookingContext(clientId, taskId) {
  if (!s(clientId) || !s(taskId)) return { ok: false, reason: "missing_ids" };
  const snap = await tasksCol(clientId).doc(s(taskId)).get().catch(() => null);
  if (!snap?.exists) return { ok: false, reason: "task_not_found" };
  const task = snap.data();
  if (task.kind !== "call") return { ok: false, reason: "not_a_call", task };
  // "done": das Gespräch kann Sekunden vor dem Tool-Callback enden (Race mit
  // dem Finalizer) — die im Gespräch getroffene Zusage gilt trotzdem.
  if (!["calling", "done"].includes(String(task.status || ""))) {
    return { ok: false, reason: "call_not_active", task };
  }
  if (Number(task.ts) && Date.now() - Number(task.ts) > TASK_MAX_AGE_MS) {
    return { ok: false, reason: "task_too_old", task };
  }
  const ctx = task.bookingContext;
  if (!ctx || !s(ctx.patientId) || !s(ctx.visitMotiveId)) {
    return { ok: false, reason: "no_booking_context", task };
  }
  return { ok: true, task, ctx };
}

const NO_CONTEXT_SPOKEN =
  "Für dieses Gespräch habe ich keinen Kalenderzugriff. Biete dem Patienten an, dass die Praxis zeitnah mit konkreten Terminvorschlägen zurückruft, und bedanke dich freundlich.";

// ---------------------------------------------------------------------------
// Tool 1: Alternativen anbieten
// ---------------------------------------------------------------------------

/**
 * Freie Termine für den Kontext des Anrufs finden (echter Plattform-Kalender).
 * @returns {{ok:boolean, spoken:string, slots?:{iso:string,spoken:string}[]}}
 */
export async function offerSlotsForTask(clientId, taskId, { wishText = "", excludeIso = "" } = {}) {
  const t = await taskBookingContext(clientId, taskId);
  if (!t.ok) {
    log.warn("lisa.tool.offer_slots_no_context", { clientId, taskId, reason: t.reason });
    return { ok: false, spoken: NO_CONTEXT_SPOKEN };
  }
  const { ctx } = t;
  const wish = s(wishText) ? parseSlotWish(wishText) : null;

  // Startdatum: Wunschdatum > "nächste Woche" > heute. getFreeTimeSlots
  // liefert ab dort chronologisch — den Rest filtert pickSlots.
  let startDate = "";
  if (wish?.date) startDate = wish.date;
  else if (wish?.minDaysAhead) {
    const d = new Date(Date.now() + wish.minDaysAhead * 86400000);
    startDate = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }

  let found;
  try {
    found = await findSlots(clientId, {
      calendarId: ctx.calendarId,
      doctorName: ctx.calendarName,
      visitMotiveId: ctx.visitMotiveId,
      visitMotiveName: ctx.visitMotiveName,
      startDate,
    });
  } catch (e) {
    found = { ok: false, error: String(e?.message || e) };
  }
  if (!found?.ok) {
    log.warn("lisa.tool.offer_slots_failed", { clientId, taskId, error: found?.error });
    return {
      ok: false,
      spoken: "Der Kalender ist gerade nicht erreichbar. Sage dem Patienten, dass sich die Praxis kurzfristig mit Terminvorschlägen meldet, und bedanke dich freundlich.",
    };
  }

  const picked = pickSlots(found.slots, { wish, excludeIso });
  const slots = picked.slots.map((x) => ({ iso: x.iso, spoken: spokenSlot(x.iso) }));

  // Audit-Spur am Vorgang (best-effort): Wunsch + Angebot nachvollziehbar.
  if (s(ctx.caseId)) {
    addUpdate(clientId, ctx.caseId, {
      by: "Lisa",
      kind: "note",
      text: `Im Gespräch mit ${ctx.patientName || "dem Patienten"}: Alternativtermine angefragt${s(wishText) ? ` (Wunsch: „${s(wishText)}“)` : ""} — angeboten: ${slots.map((x) => x.spoken).join("; ") || "keine (Kalender leer)"}.`,
    }).catch(() => {});
  }

  return { ok: true, spoken: spokenSlotOffer(picked.slots, { wishMatched: picked.wishMatched }), slots };
}

// ---------------------------------------------------------------------------
// Tool 2: Fest buchen (mit Sofort-Alternativen, wenn der Slot weg ist)
// ---------------------------------------------------------------------------

/**
 * Bucht den gewünschten Slot FEST für den Patienten des Anrufs.
 * masBookAppointment prüft die Verfügbarkeit serverseitig — bei "inzwischen
 * vergeben" kommen sofort neue Alternativen zurück (Lisa bietet sie direkt an).
 */
export async function bookSlotForTask(clientId, taskId, { slotIso } = {}) {
  const t = await taskBookingContext(clientId, taskId);
  if (!t.ok) {
    log.warn("lisa.tool.book_slot_no_context", { clientId, taskId, reason: t.reason });
    return { ok: false, spoken: NO_CONTEXT_SPOKEN };
  }
  const { ctx } = t;
  // Ohne slot_iso wird der im Auftrag angebotene Termin gebucht (Kontext ist
  // die Autorität — das LLM muss keinen Zeitstempel fehlerfrei abschreiben).
  let iso = s(slotIso);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) iso = s(ctx.slotIso);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) {
    return { ok: false, spoken: "Mir fehlt der genaue Zeitpunkt. Rufe zuerst offer_slots auf und übergib dann das iso-Feld des gewählten Termins als slot_iso." };
  }

  // Halluzinations-Wache: Ein ANDERER Slot als der angebotene wird nur
  // gebucht, wenn er WIRKLICH im Kalender frei ist (das LLM darf sich keine
  // Uhrzeit ausdenken — Sprechzeiten/Belegung entscheidet die Plattform).
  if (iso.slice(0, 16) !== s(ctx.slotIso).slice(0, 16)) {
    const check = await findSlots(clientId, {
      calendarId: ctx.calendarId,
      doctorName: ctx.calendarName,
      visitMotiveId: ctx.visitMotiveId,
      visitMotiveName: ctx.visitMotiveName,
      startDate: iso.slice(0, 10),
    }).catch(() => null);
    const free = (check?.ok ? check.slots : []).some((x) => String(x).slice(0, 16) === iso.slice(0, 16));
    if (!free) {
      const alt = await offerSlotsForTask(clientId, taskId, { excludeIso: iso });
      return {
        ok: true,
        booked: false,
        slotTaken: true,
        slots: alt.ok ? alt.slots : [],
        spoken: `Der Termin ${spokenSlot(iso)} ist nicht mehr frei — entschuldige dich kurz dafür.${alt.ok && alt.slots?.length ? ` ${alt.spoken}` : " Sage dem Patienten, dass sich die Praxis kurzfristig mit einem passenden Termin meldet."}`,
      };
    }
  }

  let r;
  try {
    r = await commitBooking(clientId, {
      patientId: ctx.patientId,
      calendarId: ctx.calendarId,
      visitMotiveId: ctx.visitMotiveId,
      slotIso: iso,
    });
  } catch (e) {
    r = { ok: false, error: String(e?.message || e) };
  }

  const when = spokenSlot(iso);

  if (r.ok && r.booked) {
    // Task markieren — der Recall-Sweep erkennt daran die Live-Buchung.
    await tasksCol(clientId).doc(s(taskId)).set({
      bookedSlotIso: iso,
      bookedAppointmentId: r.appointmentId || null,
      bookedAt: Date.now(),
    }, { merge: true }).catch(() => {});

    // Kalender-Quittung + Praxisgedächtnis (wie beim Sweep-Buchen).
    emitCommand(clientId, {
      type: "appointment_created",
      date: iso.slice(0, 10),
      slotIso: iso,
      calendarId: ctx.calendarId,
      calendarName: ctx.calendarName || null,
      patient: { firstName: "", lastName: ctx.patientName || "" },
      visitMotiveName: ctx.visitMotiveName || null,
    }).catch(() => {});
    appendEvent(clientId, {
      channel: "lisa_call",
      direction: "outbound",
      type: "interaction",
      counterparty: { kind: "patient", name: ctx.patientName || "Patient", ref: t.task?.phone || null },
      subject: { patientId: ctx.patientId, name: ctx.patientName || "", matchStatus: "matched" },
      summary: `Lisa hat im Gespräch einen Termin FEST gebucht: ${when}${ctx.calendarName ? ` bei ${ctx.calendarName}` : ""}${ctx.visitMotiveName ? ` (${ctx.visitMotiveName})` : ""}.`,
      extractor: "lisa@live-booking",
      tags: ["lisa", "recall", "booked"],
    }).catch(() => {});
    if (s(ctx.caseId)) {
      addUpdate(clientId, ctx.caseId, {
        by: "Lisa",
        kind: "note",
        text: `GEBUCHT im Gespräch: ${ctx.patientName || "Patient"} — ${when}${ctx.calendarName ? ` bei ${ctx.calendarName}` : ""} ist fest eingetragen.`,
      }).catch(() => {});
    }
    log.info("lisa.tool.booked", { clientId, taskId, slotIso: iso });
    return {
      ok: true,
      booked: true,
      spoken: `Gebucht: ${when}${ctx.calendarName ? ` bei ${ctx.calendarName}` : ""}. Bestätige dem Patienten den Termin jetzt verbindlich und verabschiede dich freundlich.`,
    };
  }

  // Patient ohne hinterlegte Handynummer: Plattform bucht nicht automatisch.
  // Ehrlich bleiben, Mensch übernimmt — Patient bekommt trotzdem seinen Termin.
  if (r.ok && r.needsPhone) {
    if (s(ctx.caseId)) {
      addUpdate(clientId, ctx.caseId, {
        by: "Lisa",
        kind: "note",
        text: `ACHTUNG: ${ctx.patientName || "Patient"} möchte ${when} — automatische Buchung nicht möglich (keine Handynummer am Patienten hinterlegt). BITTE MANUELL EINTRAGEN und Nummer ergänzen.`,
      }).catch(() => {});
    }
    return {
      ok: true,
      booked: false,
      spoken: `Der Termin ${when} ist für den Patienten vorgemerkt; die Praxis trägt ihn gleich ein und bestätigt noch einmal persönlich. Sage das dem Patienten zu und verabschiede dich freundlich.`,
    };
  }

  // Slot ist inzwischen weg (oder Buchung abgelehnt): SOFORT Alternativen —
  // genau hier entsteht "keiner wird abgewiesen" auch im Wettlauf um die Lücke.
  log.info("lisa.tool.book_slot_unavailable", { clientId, taskId, slotIso: iso, error: r.error || "" });
  const alt = await offerSlotsForTask(clientId, taskId, { excludeIso: iso });
  const altSpoken = alt.ok && alt.slots?.length
    ? ` ${spokenSlotOffer(alt.slots.map((x) => ({ iso: x.iso })), { wishMatched: true })}`
    : " Sage dem Patienten, dass sich die Praxis kurzfristig mit einem passenden Termin meldet.";
  return {
    ok: true,
    booked: false,
    slotTaken: true,
    slots: alt.ok ? alt.slots : [],
    spoken: `Der Termin ${when} ist gerade eben vergeben worden — entschuldige dich kurz dafür.${altSpoken}`,
  };
}
