import { test } from "node:test";
import assert from "node:assert/strict";
import { istAbgesagt } from "../src/clara/daySchedule.js";
import { berlinWanduhr } from "../src/clara/agentBooking.js";
import { mitUndo, zuruecknehmen } from "../src/clara/rueckgaengig.js";

// 24.11.2026: Termin von Michael Petsas abgesagt, danach hiess es weiter
// "naechster Besuch morgen um 9 Uhr 15". Die Plattform loescht bei einer Absage
// nicht, sie setzt patientStatus 5 (abwesend entschuldigt).
test("abgesagt ist ein Termin mit patientStatus 4 oder 5", () => {
  assert.equal(istAbgesagt({ patientStatus: 5 }), true);
  assert.equal(istAbgesagt({ patientStatus: 4 }), true);
  for (const s of [0, 1, 2, 3, null, undefined]) assert.equal(istAbgesagt({ patientStatus: s }), false, String(s));
  assert.equal(istAbgesagt(null), false);
});

test("eine Verschiebung laesst sich zuruecknehmen: Termin wandert auf den alten Beginn", async () => {
  const { undo } = mitUndo("termin_verschoben", { id: "t1", vorher: "2026-11-25T09:15", label: "der Termin von Michael Petsas" });
  assert.equal(undo.art, "termin_verschoben");
  const rufe = [];
  const deps = { terminVerschieben: async (c, id, iso) => { rufe.push([c, id, iso]); return { ok: true }; } };
  const out = await zuruecknehmen("praxis", undo, deps);
  assert.equal(out.ok, true);
  assert.equal(out.undoErledigt, true);
  assert.deepEqual(rufe, [["praxis", "t1", "2026-11-25T09:15"]]);
});

// 24.11.2026, echter Lauf: "2026-11-25T14:00:00+01:00" landete bei der Plattform
// auf 13 Uhr, 09:45 wurde als "nicht frei" abgelehnt. Sie will die Wanduhrzeit.
test("zum Verschieben geht die Berliner Wanduhrzeit ohne Offset an die Plattform", () => {
  assert.equal(berlinWanduhr("2026-11-25T14:00:00+01:00"), "2026-11-25 14:00");
  assert.equal(berlinWanduhr("2026-11-25T08:15:00.000Z"), "2026-11-25 09:15");
  assert.equal(berlinWanduhr("2026-07-01T09:45:00+02:00"), "2026-07-01 09:45");
  assert.equal(berlinWanduhr("kein Datum"), "");
});

test("scheitert das Zurueckverschieben, bleibt der Eintrag fuer einen zweiten Anlauf stehen", async () => {
  const { undo } = mitUndo("termin_verschoben", { id: "t1", vorher: "2026-11-25T09:15", label: "der Termin" });
  const out = await zuruecknehmen("praxis", undo, { terminVerschieben: async () => ({ ok: false, error: "The slot is not available." }) });
  assert.equal(out.ok, false);
  assert.equal(out.undoErledigt, false);
});
