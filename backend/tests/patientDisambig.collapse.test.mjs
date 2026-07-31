// LLM-freier Determinismus-Test fuer die Gleiche-Person-Zusammenfassung.
// Chef-Regel (31.07.2026): doppelt angelegte / nur minimal anders geschriebene
// Patienten NICHT als Auswahl anbieten, sondern einen nehmen. Nur wirklich
// verschiedene Personen bleiben als echte Rueckfrage uebrig.
//
// Start:  node backend/tests/patientDisambig.collapse.test.mjs
import assert from "node:assert/strict";
import {
  samePerson,
  collapseSamePerson,
} from "../src/clara/patientDisambig.js";

let ok = 0;
function t(name, fn) {
  fn();
  ok += 1;
  console.log("  ok -", name);
}

// Echte Thermos-Konstellation aus dem Account:
const nadine = { firstName: "Nadine", lastName: "Thermos", birthDate: "1985-04-02", phone: "+49 170 1111111" };
const xenoNoDob = { firstName: "Xenofon", lastName: "Thermos", birthDate: "", phone: "" };
const xeno1982 = { firstName: "Xenofon", lastName: "Thermos", birthDate: "1982-09-14", phone: "+49 171 2222222" };

t("Xenofon(ohne Dob) und Xenofon(1982) = dieselbe Person", () => {
  assert.equal(samePerson(xenoNoDob, xeno1982), true);
});

t("Nadine und Xenofon = verschiedene Personen", () => {
  assert.equal(samePerson(nadine, xeno1982), false);
});

t("Thermos-Trefferliste kollabiert auf 2 (Nadine + 1x Xenofon)", () => {
  const out = collapseSamePerson([xenoNoDob, nadine, xeno1982]);
  assert.equal(out.length, 2);
  // Der vollstaendigere Xenofon (mit Geburtsdatum) gewinnt.
  const xeno = out.find((p) => p.firstName === "Xenofon");
  assert.equal(xeno.birthDate, "1982-09-14");
  // Nadine bleibt eigenstaendig.
  assert.ok(out.some((p) => p.firstName === "Nadine"));
});

t("Nur zwei identische Xenofon -> genau einer bleibt (kein Loop)", () => {
  const out = collapseSamePerson([xenoNoDob, xeno1982]);
  assert.equal(out.length, 1);
  assert.equal(out[0].firstName, "Xenofon");
});

t("Tippfehler im Namen bei gleichem Jahr = dieselbe Person", () => {
  const a = { firstName: "Xenofon", lastName: "Thermos", birthDate: "1982-09-14" };
  const b = { firstName: "Xenofon", lastName: "Thermes", birthDate: "1982-09-14" }; // Thermes vs Thermos
  assert.equal(samePerson(a, b), true);
  assert.equal(collapseSamePerson([a, b]).length, 1);
});

t("Aehnlicher Name aber VERSCHIEDENE Jahre = verschiedene Personen", () => {
  const a = { firstName: "Xenofon", lastName: "Thermos", birthDate: "1982-09-14" };
  const b = { firstName: "Xenofon", lastName: "Thermes", birthDate: "1990-01-01" };
  assert.equal(samePerson(a, b), false);
  assert.equal(collapseSamePerson([a, b]).length, 2);
});

t("Aehnlicher Name OHNE Jahresbeleg bleibt getrennt (Meier/Meyer)", () => {
  const a = { firstName: "Stefan", lastName: "Meier", birthDate: "" };
  const b = { firstName: "Stefan", lastName: "Meyer", birthDate: "" };
  assert.equal(samePerson(a, b), false);
});

t("Verschiedene Personen bleiben unveraendert", () => {
  const out = collapseSamePerson([nadine, xeno1982]);
  assert.equal(out.length, 2);
});

console.log(`\nAlle ${ok} Faelle gruen.`);
