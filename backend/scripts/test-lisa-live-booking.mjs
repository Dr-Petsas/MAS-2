// ============================================================================
// W-OUTREACH-2 Tests — Lisa bucht live im Gespräch.
// Läuft PUR (ohne Firestore/Netz): Wunsch-Parser, Slot-Auswahl, Sprech-
// Formate und die Live-Buchungs-Instruktionen sind pure Funktionen.
// ============================================================================

import { parseSlotWish, pickSlots, spokenSlot, spokenSlotOffer } from "../src/lisa/callBooking.js";
import { composeRecallCallInstruction, CALL_INSTRUCTION_LIMIT } from "../src/clara/outreachTemplates.js";
import { composeInviteInstruction, inviteReadback } from "../src/clara/gapInvite.js";

let failed = 0;
let passed = 0;

function check(name, cond, detail = "") {
  if (cond) { passed++; return; }
  failed++;
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// 1) Wunsch-Parser (Patient sagt, wann er kann)
// ---------------------------------------------------------------------------

const w1 = parseSlotWish("Donnerstag nachmittags wäre gut");
check("Wunsch: Donnerstag erkannt", w1.weekday === 4, String(w1.weekday));
check("Wunsch: nachmittags erkannt", w1.hourMin === 12 && w1.hourMax === 18);

const w2 = parseSlotWish("nächste Woche vormittags");
check("Wunsch: nächste Woche erkannt", w2.minDaysAhead === 7);
check("Wunsch: vormittags erkannt", w2.hourMin === 7 && w2.hourMax === 12);

const w3 = parseSlotWish("gerne um 15 Uhr");
check("Wunsch: Uhrzeit erkannt", w3.hour === 15, String(w3.hour));

const w4 = parseSlotWish("am 14.07. bitte");
check("Wunsch: Datum erkannt", /(\d{4})-07-14/.test(String(w4.date)), String(w4.date));

const w5 = parseSlotWish("");
check("Wunsch: leer -> keine Kriterien", w5.weekday === null && w5.hour === null && w5.minDaysAhead === 0);

// ---------------------------------------------------------------------------
// 2) Slot-Auswahl (nie mit leeren Händen dastehen)
// ---------------------------------------------------------------------------

// Feste Referenz-Zeit: Mo 2026-07-06 08:00 Berlin (06:00Z).
const NOW = new Date("2026-07-06T06:00:00Z").getTime();
const SLOTS = [
  "2026-07-06T09:00:00+02:00", // Montag
  "2026-07-07T10:30:00+02:00", // Dienstag vormittag
  "2026-07-07T15:00:00+02:00", // Dienstag nachmittag
  "2026-07-09T14:30:00+02:00", // Donnerstag nachmittag
  "2026-07-10T08:15:00+02:00", // Freitag früh
  "2026-07-16T11:00:00+02:00", // Do nächste Woche vormittag
];

const p1 = pickSlots(SLOTS, { nowMs: NOW });
check("Auswahl: max 3 Slots", p1.slots.length === 3, String(p1.slots.length));
check("Auswahl: verschiedene Tage bevorzugt", new Set(p1.slots.map((x) => x.date)).size === 3);
check("Auswahl: chronologisch", p1.slots[0].iso.includes("2026-07-06"));

const p2 = pickSlots(SLOTS, { wish: parseSlotWish("Donnerstag nachmittags"), nowMs: NOW });
check("Auswahl: Donnerstag-nachmittag-Wunsch trifft", p2.wishMatched === true && p2.slots[0]?.iso.includes("2026-07-09T14:30"));

const p3 = pickSlots(SLOTS, { wish: parseSlotWish("sonntags um 22 Uhr"), nowMs: NOW });
check("Auswahl: unerfüllbarer Wunsch -> trotzdem Angebote", p3.slots.length === 3);
check("Auswahl: unerfüllbarer Wunsch -> ehrlich markiert", p3.wishMatched === false);

const p4 = pickSlots(SLOTS, { nowMs: NOW, excludeIso: "2026-07-06T09:00:00+02:00" });
check("Auswahl: vergebener Slot ausgeschlossen", !p4.slots.some((x) => x.iso === "2026-07-06T09:00:00+02:00"));

const p5 = pickSlots(["2026-07-06T06:30:00+02:00"], { nowMs: NOW });
check("Auswahl: zu kurzfristig (unter 60 min) fällt raus", p5.slots.length === 0);

const p6 = pickSlots(SLOTS, { wish: parseSlotWish("nächste Woche vormittags"), nowMs: NOW });
check("Auswahl: nächste Woche vormittags", p6.slots[0]?.iso.includes("2026-07-16T11:00"), p6.slots[0]?.iso || "leer");

// ---------------------------------------------------------------------------
// 3) Sprech-Formate
// ---------------------------------------------------------------------------

check("Sprechformat: Wochentag + Uhrzeit", spokenSlot("2026-07-14T10:30:00+02:00") === "Dienstag, 14. Juli um 10:30 Uhr", spokenSlot("2026-07-14T10:30:00+02:00"));

const offer = spokenSlotOffer(p1.slots, { wishMatched: true });
check("Angebots-Ansage: nennt book_slot", offer.includes("book_slot"));
check("Angebots-Ansage: leere Liste bleibt ehrlich", spokenSlotOffer([], {}).includes("meldet"));
const offerMiss = spokenSlotOffer(p3.slots, { wishMatched: false });
check("Angebots-Ansage: verfehlter Wunsch wird benannt", offerMiss.includes("Zum genauen Wunsch ist nichts frei"));

// ---------------------------------------------------------------------------
// 4) Anruf-Instruktion mit Live-Buchung (kein Terminwunsch wird abgelehnt)
// ---------------------------------------------------------------------------

const baseArgs = {
  practiceName: "Praxis MedDent Bonn",
  patientName: "Helena Brandt",
  date: "2026-07-08",
  timeLabel: "10:30",
  calendarName: "Dr. Petsas",
  visitMotiveName: "PRO Professionelle Zahnreinigung",
  overdueDays: 210,
  source: "campaign",
};

const live = composeRecallCallInstruction({ ...baseArgs, liveBooking: true });
check("Live-Anruf: book_slot enthalten", live.includes("book_slot"));
check("Live-Anruf: offer_slots enthalten", live.includes("offer_slots"));
check("Live-Anruf: nie ablehnen", live.includes("lehnst NIE ab") || live.includes("kein Terminwunsch wird abgelehnt"));
check("Live-Anruf: erst nach Werkzeug bestätigen", live.includes("Werkzeug-Bestätigung"));
check("Live-Anruf: Länge <= Limit", live.length <= CALL_INSTRUCTION_LIMIT, `${live.length}`);
check("Live-Anruf: Sicherheitsregeln bleiben", live.includes("keine Diagnosen") && live.includes("keine Preise"));

const nolive = composeRecallCallInstruction({ ...baseArgs, liveBooking: false });
check("Fallback-Anruf: keine Werkzeug-Namen", !nolive.includes("book_slot") && !nolive.includes("offer_slots"));
check("Fallback-Anruf: nichts fest versprechen", nolive.includes("zur Bestätigung meldet"));
check("Fallback-Anruf: Terminwunsch -> Rückruf mit Vorschlägen", nolive.includes("Vorschlägen zurückruft"));

// Monster-Kampagnen-Prompt: Live-Regeln überleben die Kappung
const liveLong = composeRecallCallInstruction({ ...baseArgs, liveBooking: true, campaignPrompt: "Sehr wichtig! ".repeat(300) });
check("Live-Anruf: Überlänge gekappt", liveLong.length <= CALL_INSTRUCTION_LIMIT, `${liveLong.length}`);
check("Live-Anruf: Werkzeug-Regeln überleben Kappung", liveLong.includes("book_slot") && liveLong.includes("offer_slots"));

// ---------------------------------------------------------------------------
// 5) Gezieltes Einbestellen (Invite) mit Live-Buchung
// ---------------------------------------------------------------------------

const inviteArgs = {
  patientName: "Jonas Kupper",
  practiceName: "Praxis MedDent Bonn",
  date: "2026-07-09",
  time: "14:30",
  calendarName: "Dr. Petsas",
  message: "Laut Erinnerungssystem ist wieder ein Termin fällig: Kontrolle.",
};

const invLive = composeInviteInstruction({ ...inviteArgs, liveBooking: true });
check("Invite live: book_slot + offer_slots", invLive.includes("book_slot") && invLive.includes("offer_slots"));
check("Invite live: kein Terminwunsch abgelehnt", invLive.includes("kein Terminwunsch wird abgelehnt"));
check("Invite live: Länge <= 1200", invLive.length <= 1200, `${invLive.length}`);

const invOld = composeInviteInstruction({ ...inviteArgs, liveBooking: false });
check("Invite Fallback: keine Werkzeug-Namen", !invOld.includes("book_slot"));
check("Invite Fallback: Rückruf mit Vorschlägen", invOld.includes("Vorschlägen zurückruft"));

const rbLive = inviteReadback({ ...inviteArgs, liveBooking: true });
check("Readback live: sagt 'bucht direkt fest'", rbLive.includes("bucht Lisa den Termin direkt fest"));
const rbOld = inviteReadback({ ...inviteArgs, liveBooking: false });
check("Readback Fallback: sagt 'bucht nichts fest'", rbOld.includes("bucht nichts fest"));

// ---------------------------------------------------------------------------

console.log(`\n${passed} Checks bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed ? 1 : 0);
