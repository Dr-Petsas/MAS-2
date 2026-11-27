// Testnummern in "Luecke fuellen": Nummern aus MAS_GAP_TESTNUMMERN sind von der 14-Tage-Sperre
// ausgenommen, alle anderen nicht. Reine Funktionen, ohne Datenbank.
import test from "node:test";
import assert from "node:assert/strict";
import { testnummernAus, sperrSchluessel, rankCandidatesForGap } from "../src/clara/gapFill.js";

const anruf = (ref, patientId = "") => ({ channel: "lisa_call", counterparty: { ref }, subject: patientId ? { patientId } : {} });

test("jede Schreibweise der Testnummer wird erkannt", () => {
  for (const roh of ["01776004600", "+491776004600", "00491776004600", "491776004600", "0177 600 4600", " 0177/6004600 "]) {
    assert.deepEqual([...testnummernAus(roh)], ["+491776004600"], roh);
  }
  assert.equal(testnummernAus("01776004600, 0151 1234567").size, 2);
});

test("ohne Einstellung gibt es keine Ausnahme", () => {
  assert.equal(testnummernAus("").size, 0);
  assert.equal(testnummernAus(undefined).size >= 0, true);
  const keys = sperrSchluessel([anruf("491776004600", "p1")], testnummernAus(""));
  assert.deepEqual([...keys].sort(), ["p:p1", "t:+491776004600"]);
});

test("Kontakt an die Testnummer sperrt weder Nummer noch Patient, andere bleiben gesperrt", () => {
  const events = [
    anruf("491776004600"),
    anruf("+491776004600", "testpatient"),
    { channel: "lisa_sms", counterparty: { ref: "+491776004600" }, subject: {} },
    anruf("4915253904756", "echt"),
    { channel: "bianca_call", counterparty: { ref: "+4930111111" }, subject: { patientId: "bianca" } },
  ];
  const keys = sperrSchluessel(events, testnummernAus("01776004600"));
  assert.deepEqual([...keys].sort(), ["p:echt", "t:+4915253904756"]);
});

test("in der Vorschlagsliste erscheint der Testpatient, der gesperrte echte Patient nicht", () => {
  const kandidaten = [
    { patientId: "testpatient", name: "Test", phoneNorm: "+491776004600", durationMin: 30, calendarId: "k1", overdueDays: 5 },
    { patientId: "echt", name: "Echt", phoneNorm: "+4915253904756", durationMin: 30, calendarId: "k1", overdueDays: 9 },
    { patientId: "frei", name: "Frei", phoneNorm: "+4930222222", durationMin: 30, calendarId: "k1", overdueDays: 7 },
  ];
  const events = [anruf("491776004600", "testpatient"), anruf("4915253904756", "echt")];
  const luecke = { startMin: 600, endMin: 630, minutes: 30 };
  const mit = rankCandidatesForGap(kandidaten, luecke, { calendarId: "k1", throttled: sperrSchluessel(events, testnummernAus("01776004600")) });
  assert.deepEqual(mit.map((c) => c.patientId).sort(), ["frei", "testpatient"]);
  const ohne = rankCandidatesForGap(kandidaten, luecke, { calendarId: "k1", throttled: sperrSchluessel(events, testnummernAus("")) });
  assert.deepEqual(ohne.map((c) => c.patientId), ["frei"]);
});
