import { test } from "node:test";
import assert from "node:assert/strict";
import {
  istBuchungsAuftrag, motivAusAuftrag, wunschAusAuftrag, waehleTermine, termineRegie, termineFuerAuftrag,
} from "../src/lisa/auftragTermine.js";
import { telefonkiBundle } from "../src/lisa/outbound.js";

// Dienstag, 03.11.2026, 09:00 Berlin
const JETZT = Date.parse("2026-11-03T08:00:00Z");
const FREI = [
  "2026-11-03T09:30:00+01:00",
  "2026-11-03T11:45:00+01:00",
  "2026-11-03T12:00:00+01:00",
  "2026-11-03T12:45:00+01:00",
  "2026-11-03T13:20:00+01:00",
  "2026-11-03T13:35:00+01:00",
  "2026-11-03T15:30:00+01:00",
  "2026-11-04T12:15:00+01:00",
];

test("Buchungsauftrag erkennen, Absage/Verschieben nicht", () => {
  assert.equal(istBuchungsAuftrag("Bitte buchen Sie einen Termin für heute zwischen 12 und 15 Uhr."), true);
  assert.equal(istBuchungsAuftrag("Lass einen Termin für heute zwischen 12 und 15 Uhr bitte buchen."), true);
  assert.equal(istBuchungsAuftrag("Mach einen Termin für heute."), true);
  assert.equal(istBuchungsAuftrag("Bitte vereinbaren Sie heute einen Termin."), true);
  assert.equal(istBuchungsAuftrag("Ihr Termin morgen ist abgesagt."), false);
  assert.equal(istBuchungsAuftrag("Bitte kommen Sie eine halbe Stunde später als geplant."), false);
  assert.equal(istBuchungsAuftrag("Die Brille ist fertig."), false);
});

test("Besuchsgrund aus dem Auftrag, Standard Kontrolle", () => {
  assert.equal(motivAusAuftrag("Termin für heute buchen"), "Kontrolluntersuchung");
  assert.equal(motivAusAuftrag("Termin zur Zahnreinigung vereinbaren"), "professionelle Zahnreinigung");
});

test("Live 03.11.: heute zwischen 12 und 15 Uhr -> genau diese freien Termine", () => {
  const w = wunschAusAuftrag("Bitte buchen Sie einen Termin für heute zwischen 12 und 15 Uhr.", JETZT);
  assert.equal(w.wish.date, "2026-11-03");
  assert.equal(w.von, 720);
  assert.equal(w.bis, 900);
  const p = waehleTermine(FREI, w, { nowMs: JETZT });
  assert.equal(p.wishMatched, true);
  assert.deepEqual(p.slots, ["2026-11-03T12:00:00+01:00", "2026-11-03T12:45:00+01:00", "2026-11-03T13:20:00+01:00"]);
  const regie = termineRegie({ ...p, visitMotiveName: "KCH Kontrolluntersuchung", calendarName: "Dr. Petsas" }, JETZT);
  assert.match(regie, /heute um 12:00 Uhr; heute um 12:45 Uhr; heute um 13:20 Uhr/);
  assert.match(regie, /Sage NIE, dass im gewünschten Zeitraum nichts frei ist/);
});

test("morgen ohne Uhrzeit -> Termine am morgigen Tag", () => {
  const w = wunschAusAuftrag("Mach einen Termin für morgen.", JETZT);
  assert.equal(w.wish.date, "2026-11-04");
  assert.deepEqual(waehleTermine(FREI, w, { nowMs: JETZT }).slots, ["2026-11-04T12:15:00+01:00"]);
});

test("nichts im Fenster -> ehrlich die naechsten freien", () => {
  const w = wunschAusAuftrag("Termin für heute zwischen 17 und 18 Uhr buchen", JETZT);
  const p = waehleTermine(FREI, w, { nowMs: JETZT });
  assert.equal(p.wishMatched, false);
  assert.equal(p.slots[0], "2026-11-03T11:45:00+01:00");
  assert.match(termineRegie(p, JETZT), /nichts mehr frei/);
});

test("termineFuerAuftrag sucht ab Wunschtag mit Kontrolle; kein Termin-Auftrag -> null", async () => {
  let gefragt = null;
  const find = async (_cid, args) => {
    gefragt = args;
    return { ok: true, slots: FREI, calendarId: "cal1", calendarName: "Dr. Michael Petsas" };
  };
  const r = await termineFuerAuftrag("c1", "Bitte buchen Sie einen Termin für heute zwischen 12 und 15 Uhr.", { nowMs: JETZT, find });
  assert.deepEqual(gefragt, { visitMotiveName: "Kontrolluntersuchung", startDate: "2026-11-03" });
  assert.equal(r.slots.length, 3);
  assert.equal(r.calendarId, "cal1");
  assert.equal(await termineFuerAuftrag("c1", "Die Brille ist fertig.", { nowMs: JETZT, find }), null);
});

test("TelefonKI-Buendel traegt freeTimeSlots und Kalender", () => {
  const b = telefonkiBundle({
    clientId: "c1", taskId: "t1", to: "+491700000000", fromDid: "+492110000000", auftrag: "x", name: "Michael Petsas",
    vorab: { slots: ["2026-11-03T12:00:00+01:00"], calendarId: "cal1" },
  });
  assert.equal(b.calendarId, "cal1");
  assert.equal(b.freeTimeSlots[0].iso, "2026-11-03T12:00:00+01:00");
  assert.match(b.freeTimeSlots[0].spoken, /um 12:00 Uhr/);
  const ohne = telefonkiBundle({ clientId: "c1", taskId: "t1", to: "+491700000000", fromDid: "+49211", auftrag: "x", name: "A B" });
  assert.equal("freeTimeSlots" in ohne, false);
});
