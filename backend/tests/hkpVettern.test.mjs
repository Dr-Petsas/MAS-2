import test from "node:test";
import assert from "node:assert/strict";
import { vetternFrage } from "../src/hkp/vorlesen.js";
import { vetterAntwort } from "../src/routes/hkp.js";

// Live 04.11.2026: zweimal "Maria Partheni, Jahrgang 1968" - nicht unterscheidbar.
const a = { id: "811", quelle: "pvs", firstName: "Maria", lastName: "Partheni", birthDate: "1968-03-02" };
const b = { id: "1204", quelle: "pvs", firstName: "Maria", lastName: "Partheni", birthDate: "1968-03-02" };
const c = { id: "77", quelle: "pvs", firstName: "Maria", lastName: "Partheni", birthDate: "1968-09-14" };

test("gleicher Jahrgang: volles Geburtsdatum, gleiches Datum: Patientennummer", () => {
  const f1 = vetternFrage([a, c]);
  assert.match(f1, /zweiten März/);
  assert.match(f1, /vierzehnten September/);
  assert.doesNotMatch(f1, /Patientennummer/);
  const f2 = vetternFrage([a, b]);
  assert.match(f2, /Patientennummer 8 1 1/);
  assert.match(f2, /Patientennummer 1 2 0 4/);
  assert.match(vetternFrage([a, { ...c, birthDate: "1972-01-01" }]), /Jahrgang neunzehnhundertachtundsechzig/);
});

test("'Die Erste.' als chef_satz waehlt den ersten Eintrag", () => {
  const offen = { kandidaten: [a, b] };
  assert.equal(vetterAntwort(offen, "Die Erste. Parteni-Maria", "Die Erste.")?.wahl?.id, "811");
  assert.equal(vetterAntwort(offen, "Den zweiten bitte. Parteni-Maria", "Den zweiten bitte.")?.wahl?.id, "1204");
});
