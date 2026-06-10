import { createHash } from "node:crypto";
import admin from "../firebase.js";
import { masCollection } from "../tenant.js";
import { loadBooking, ensureBerlinTz } from "./booking.js";
import { todayBerlin } from "./daySchedule.js";
import { recordCommunication } from "../brain/record.js";

// ============================================================================
// Clara's calendar watch — the "lückenlos beobachten" half of the shared brain
// contract: EVERY meaningful calendar change (new appointment, cancellation,
// reschedule, appointment note, document traffic light) becomes an immutable
// observation event on the patient's timeline and is threaded onto their case.
// No matter WHO made the change (online booking, front desk, another AI) —
// Clara sees it because she watches the calendar itself, not the actors.
//
// Mechanics: per tenant we keep a compact snapshot of the next N days in
// mas_config/calendar_watch and diff it against the live calendar on every
// scheduler tick. Events use deterministic ids (appt-watch:<id>:<kind>:…), so
// re-running a tick is a no-op. The FIRST run only records the baseline —
// otherwise a fresh install would flood the brain with "new appointment"
// events for the whole existing calendar.
// ============================================================================

const TZ = "Europe/Berlin";
const SNAPSHOT_DOC = "calendar_watch";
const DEFAULT_HORIZON_DAYS = 14;

function tsToMs(v) {
  if (v == null) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function hash8(v) {
  return createHash("sha256").update(String(v || "")).digest("hex").slice(0, 8);
}

function fmtDayTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${day}, ${time} Uhr`;
}

function spokenName(it) {
  const last = it.pl || "";
  if (it.pg === "f" && last) return `Frau ${last}`;
  if (it.pg === "m" && last) return `Herrn ${last}`;
  return it.pn || last || "unbekannter Patient";
}

function creatorLabel(createdBy) {
  const c = String(createdBy || "").trim();
  if (!c) return "";
  if (c === "online") return "online durch den Patienten";
  if (c === "callr") return "durch die Telefon-KI";
  return "durch das Team";
}

// --- snapshot shape ---------------------------------------------------------
// Compact per-appointment entry (short keys — the doc holds up to a few hundred
// of these and must stay well under Firestore's 1 MiB doc limit).
function toItem(o, id) {
  return {
    s: tsToMs(o.start),
    e: tsToMs(o.end),
    c: o.calendar?.id || o.resourceId || "",
    cn: o.calendar?.name || "",
    st: String(o.status || ""),
    d: String(o.patientDocsStatus || "").toLowerCase(),
    cm: String(o.comments || "").trim().slice(0, 200),
    p: o.patient?.id || "",
    pn: `${o.patient?.firstName || ""} ${o.patient?.lastName || ""}`.trim(),
    pl: (o.patient?.lastName || "").trim(),
    pg: String(o.patient?.gender || "").toLowerCase(),
    vm: o.visitMotive?.name || "",
    cb: String(o.createdBy || ""),
    _id: id,
  };
}

async function fetchWindow(clientId, horizonDays) {
  const booking = await loadBooking(clientId).catch(() => null);
  if (!booking?.locationId) return null;
  const today = todayBerlin();
  const start = new Date(ensureBerlinTz(`${today}T00:00:00`));
  const end = new Date(start.getTime() + horizonDays * 86400000);

  const snap = await admin.firestore()
    .collection("clients").doc(clientId)
    .collection("locations").doc(booking.locationId)
    .collection("appointments")
    .where("start", ">=", start)
    .where("start", "<=", end)
    .get();

  const items = {};
  for (const d of snap.docs) {
    const o = d.data();
    if (o.isMultiDay === true || o.calendarItemType === "absence") continue;
    if (!o.patient?.id) continue; // temporary holds — not patient facts
    items[d.id] = toItem(o, d.id);
  }
  return { items, calendars: booking.calendars || [] };
}

// --- pure diff ---------------------------------------------------------------

/**
 * Diff two snapshot maps into observation descriptors. Pure + unit-testable.
 * Returns [{ kind, eventId, summary, item, signals }].
 */
export function diffCalendarSnapshots(prev = {}, next = {}) {
  const out = [];
  const dayKey = todayBerlin();

  for (const [id, n] of Object.entries(next)) {
    const p = prev[id];
    const who = spokenName(n);
    if (!p) {
      const by = creatorLabel(n.cb);
      out.push({
        kind: "created",
        eventId: `appt-watch:${id}:created`,
        item: n,
        signals: { appointmentRequest: true },
        summary: `Neuer Termin: ${who} am ${fmtDayTime(n.s)}${n.cn ? ` bei ${n.cn}` : ""}${n.vm ? ` (${n.vm})` : ""}${by ? `, angelegt ${by}` : ""}.${n.cm ? ` Notiz: ${n.cm}` : ""}`,
      });
      // A brand-new appointment can already carry a yellow/red docs light.
      if (n.d === "yellow" || n.d === "red") {
        out.push(docsObservation(id, n, who, dayKey));
      }
      continue;
    }
    if (p.s !== n.s) {
      out.push({
        kind: "moved",
        eventId: `appt-watch:${id}:moved:${n.s}`,
        item: n,
        signals: { appointmentRequest: true },
        summary: `Termin verschoben: ${who} von ${fmtDayTime(p.s)} auf ${fmtDayTime(n.s)}${n.cn ? ` (${n.cn})` : ""}.`,
      });
    }
    if (p.st !== n.st && /cancel|abgesagt|storno/i.test(n.st)) {
      out.push({
        kind: "cancelled",
        eventId: `appt-watch:${id}:cancelled`,
        item: n,
        signals: { appointmentRequest: true },
        summary: `Termin abgesagt: ${who}, war ${fmtDayTime(n.s)}${n.cn ? ` bei ${n.cn}` : ""}.`,
      });
    }
    if (p.d !== n.d && (n.d === "yellow" || n.d === "red" || ((p.d === "yellow" || p.d === "red") && n.d === "green"))) {
      out.push(docsObservation(id, n, who, dayKey));
    }
    if (p.cm !== n.cm && n.cm) {
      out.push({
        kind: "note",
        eventId: `appt-watch:${id}:note:${hash8(n.cm)}`,
        item: n,
        signals: {},
        summary: `Terminnotiz für ${who} (${fmtDayTime(n.s)}): ${n.cm}`,
      });
    }
  }

  for (const [id, p] of Object.entries(prev)) {
    if (next[id]) continue;
    // Vanished from the window while its start was still ahead -> deleted/cancelled.
    if (p.s > Date.now()) {
      out.push({
        kind: "removed",
        eventId: `appt-watch:${id}:removed`,
        item: p,
        signals: { appointmentRequest: true },
        summary: `Termin entfernt: ${spokenName(p)}, war ${fmtDayTime(p.s)}${p.cn ? ` bei ${p.cn}` : ""}.`,
      });
    }
  }
  return out;
}

function docsObservation(id, n, who, dayKey) {
  const text = n.d === "yellow"
    ? "GELB — die Unterlagen sind noch nicht vollständig ausgefüllt"
    : n.d === "red"
      ? "ROT — die Unterlagen fehlen"
      : "GRÜN — die Unterlagen sind jetzt vollständig";
  return {
    kind: "docs",
    eventId: `appt-watch:${id}:docs:${n.d}:${dayKey}`,
    item: n,
    signals: { documentRelated: true },
    summary: `Dokumenten-Ampel für ${who} (Termin ${fmtDayTime(n.s)}): ${text}.`,
  };
}

// --- the sweep ---------------------------------------------------------------

/**
 * One watch tick for one tenant: diff the live calendar window against the
 * stored snapshot, record every change as a brain observation (idempotent),
 * then persist the new snapshot. First run records the baseline only.
 */
export async function watchCalendarOnce(clientId, { horizonDays = DEFAULT_HORIZON_DAYS } = {}) {
  const win = await fetchWindow(clientId, horizonDays);
  if (!win) return { ok: false, reason: "no_location" };

  const ref = masCollection(clientId, "mas_config").doc(SNAPSHOT_DOC);
  const prevDoc = await ref.get();
  const prev = prevDoc.exists ? (prevDoc.data().items || {}) : null;

  let recorded = 0;
  let changes = [];
  if (prev !== null) {
    changes = diffCalendarSnapshots(prev, win.items);
    const eventsCol = masCollection(clientId, "mas_events");
    for (const ch of changes) {
      // Skip facts an action path already recorded with richer context
      // (e.g. Clara's own booking writes appt-action:<id>:booked).
      if (ch.kind === "created") {
        const action = await eventsCol.doc(`appt-action:${ch.item._id}:booked`).get();
        if (action.exists) continue;
      }
      const exists = await eventsCol.doc(ch.eventId).get();
      if (exists.exists) continue;
      const r = await recordCommunication(clientId, {
        id: ch.eventId,
        channel: "system",
        direction: "internal",
        type: "observation",
        counterparty: { kind: "system", name: "Kalender", ref: null },
        subject: ch.item.p
          ? { patientId: ch.item.p, name: ch.item.pn, matchStatus: "matched", matchMethod: "calendar" }
          : { name: ch.item.pn, matchStatus: "unmatched", matchMethod: null },
        signals: ch.signals,
        summary: ch.summary,
        extractor: "clara@calendar-watch",
        payloadRef: { kind: "appointment", id: ch.item._id },
      }, { by: "Clara" }).catch(() => null);
      if (r?.ok) recorded++;
    }
  }

  await ref.set({
    items: win.items,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtMs: Date.now(),
    horizonDays,
  });
  return { ok: true, baseline: prev === null, tracked: Object.keys(win.items).length, changes: changes.length, recorded };
}
