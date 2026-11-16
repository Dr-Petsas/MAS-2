import test from "node:test";
import assert from "node:assert/strict";
import { einordnungLesen } from "../src/hkp/probeEinordnen.js";

test("einordnungLesen: gueltige Antwort, auch mit Denkblock und Zaun", () => {
  assert.deepEqual(einordnungLesen('{"art":"par","kasse":true,"grund":"PAR-Status"}'), { art: "par", kasse: true, grund: "PAR-Status" });
  assert.deepEqual(
    einordnungLesen('<think>{"art":"hkp"}</think>```json\n{"art":"Implantation","kasse":false,"grund":"GOZ 9010"}\n```'),
    { art: "implantation", kasse: false, grund: "GOZ 9010" },
  );
});

test("einordnungLesen: unbekannt wird leer, Fremdes wird null", () => {
  assert.deepEqual(einordnungLesen('{"art":"unbekannt","kasse":false}'), { art: "", kasse: false, grund: "" });
  assert.equal(einordnungLesen('{"art":"rechnung"}'), null);
  assert.equal(einordnungLesen("kein JSON"), null);
  assert.equal(einordnungLesen(""), null);
});
