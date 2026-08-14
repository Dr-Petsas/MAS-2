// Regressionstests Patienten-Disambiguierung ("Stefan-Meier-Loop", 2026-06-11).
// Pure Funktionen, kein Firebase/LLM noetig: node scripts/test-patient-disambig.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distinctPatientLabels,
  disambiguationQuestion,
  ordinalPick,
  narrowByPhoneFragment,
  narrowByExactName,
  narrowByNearName,
  isOrdinalChoice,
  patientLabel,
} from "../src/clara/patientDisambig.js";

const meier1 = { firstName: "Stefan", lastName: "Meier", birthDate: "1980-04-12", mobilePhoneNumber: "01776004600" };
const meier2 = { firstName: "Stefan", lastName: "Meier", birthDate: null, mobilePhoneNumber: "" };
const meierhoefer = { firstName: "Stefanie", lastName: "Meierhoefer", birthDate: "1987-01-03", mobilePhoneNumber: "015253904756" };

test("patientLabel: Name + Jahrgang", () => {
  assert.equal(patientLabel(meier1), "Stefan Meier (Jahrgang 1980)");
  assert.equal(patientLabel(meier2), "Stefan Meier");
});

test("distinctPatientLabels: nie zwei identische Labels (Stefan-Meier-Loop)", () => {
  const labels = distinctPatientLabels([meier1, meier2]);
  assert.equal(labels.length, 2);
  assert.notEqual(labels[0], labels[1]);
  assert.match(labels[0], /Jahrgang 1980/);
  assert.match(labels[1], /ohne Telefonnummer/);
});

test("distinctPatientLabels: identische Namen ohne Merkmale -> Ordinal", () => {
  const a = { firstName: "Anna", lastName: "Klein" };
  const b = { firstName: "Anna", lastName: "Klein" };
  const labels = distinctPatientLabels([a, b]);
  assert.notEqual(labels[0], labels[1]);
});

test("disambiguationQuestion: unterscheidbare Kandidaten, Ordinal-Frage, keine zitierbare Beispielantwort", () => {
  const q = disambiguationQuestion([meier1, meier2]);
  assert.match(q, /den ersten oder den zweiten/);
  assert.match(q, /Jahrgang 1980/);
  assert.doesNotMatch(q, /Stefan Meier oder Stefan Meier/);
  // "Sagen Sie zum Beispiel: der erste" wurde vom 4B-Modell woertlich als
  // eigene Antwort uebernommen (dlg-korrektur) - darf nicht zurueckkommen.
  assert.doesNotMatch(q, /Sagen Sie/);
});

test("ordinalPick: der erste / nummer zwei / der letzte", () => {
  const c = [meier1, meier2, meierhoefer];
  assert.equal(ordinalPick("der erste", c), meier1);
  assert.equal(ordinalPick("nehmen wir nummer zwei", c), meier2);
  assert.equal(ordinalPick("der letzte bitte", c), meierhoefer);
  assert.equal(ordinalPick("stefan meier", c), null);
});

test("narrowByPhoneFragment: unvollstaendig gesprochene Nummer trifft per Praefix", () => {
  // Chef sagte "0177 600 467", hinterlegt ist 01776004600 -> 9 Ziffern Praefix gemeinsam.
  const hits = narrowByPhoneFragment("telefonnummer 0177 600 467", [meier1, meier2, meierhoefer]);
  assert.deepEqual(hits, [meier1]);
});

test("narrowByPhoneFragment: Endungs-Match (endet auf 600)", () => {
  const hits = narrowByPhoneFragment("die nummer endet auf 600", [meier1, meier2]);
  assert.deepEqual(hits, [meier1]);
});

test("narrowByPhoneFragment: +49-Schreibweise in der DB trifft gesprochene 0177", () => {
  const intl = { ...meier1, mobilePhoneNumber: "+49 177 6004600" };
  const hits = narrowByPhoneFragment("telefonnummer 0177 600 467", [intl, meier2]);
  assert.deepEqual(hits, [intl]);
});

test("narrowByExactName: Stefan Meier trifft NICHT Stefanie Meierhoefer", () => {
  const hits = narrowByExactName("stefan meier", [meier1, meierhoefer]);
  assert.deepEqual(hits, [meier1]);
});

test("narrowByExactName: kein Fortschritt wenn alle gleich heissen", () => {
  assert.deepEqual(narrowByExactName("stefan meier", [meier1, meier2]), []);
});

// Live 14.08.2026: "Haila El-Otmani" + Bindestrich vs. "Haila El Otmani",
// zweiter Treffer Theresa Heldmann, dann "Den ersten Eintrag" -> Bitter.
const haila = { firstName: "Haila", lastName: "El Otmani" };
const heldmann = { firstName: "Theresa", lastName: "Heldmann" };
const bitter = { firstName: "Philipp-Moritz", lastName: "Bitter" };

test("narrowByExactName: Bindestrich zaehlt nicht (El-Otmani == El Otmani)", () => {
  const hits = narrowByExactName("haila el-otmani", [haila, heldmann]);
  assert.deepEqual(hits, [haila]);
});

test("narrowByNearName: Haila El-Otmani wirft Heldmann raus", () => {
  const hits = narrowByNearName("Haila El-Otmani", [haila, heldmann, bitter]);
  assert.deepEqual(hits, [haila]);
});

test("narrowByNearName: nur Partikel allein grenzt nicht ein", () => {
  assert.deepEqual(narrowByNearName("El", [haila, heldmann]), []);
});

test("isOrdinalChoice: Den ersten Eintrag bitte", () => {
  assert.equal(isOrdinalChoice("Den ersten Eintrag bitte"), true);
  assert.equal(isOrdinalChoice("der erste"), true);
  assert.equal(isOrdinalChoice("nimm den zweiten Treffer"), true);
  assert.equal(isOrdinalChoice("Haila El-Otmani"), false);
  assert.equal(isOrdinalChoice("Naomi die erste"), false);
});

test("ordinalPick: Den ersten Eintrag bitte trifft den ersten Kandidaten", () => {
  assert.equal(ordinalPick("den ersten eintrag bitte", [haila, heldmann]), haila);
});
