// Prosa in die Karteikarte: erst abgleichen, dann den Text.
// Start: node backend/tests/akteDoku.test.mjs
import assert from "node:assert/strict";
import { frageBestaetigen, frageNachText, istNurBestaetigung, schritt, werAus } from "../src/clara/akteDoku.js";

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }

const anna = { firstName: "Anna", lastName: "Berger", birthDate: "1984-03-12" };

t("nennt Name und Geburtsdatum", () => {
  assert.equal(werAus(anna), "Anna Berger, geboren am 12.03.1984");
  assert.equal(werAus({ lastName: "Berger" }), "Berger");
});

t("ohne wartenden Patienten wird gesucht", () => {
  assert.equal(schritt({ text: "Patient klagt über Schmerzen" }).art, "suchen");
  assert.equal(schritt({}).art, "suchen");
});

t("nach dem Abgleich fragt sie nach dem Text", () => {
  const wartet = { wer: werAus(anna), patientId: "1", at: 1_000 };
  const r = schritt({ wartet, jetzt: 2_000 });
  assert.equal(r.art, "fragen");
  assert.equal(r.message, frageNachText(wartet.wer));
});

t("das Diktat danach wird eingetragen", () => {
  const wartet = { wer: werAus(anna), patientId: "1", lastName: "Berger", at: 1_000 };
  const r = schritt({ text: "Patientin klagt über klopfende Schmerzen an 26.", wartet, jetzt: 5_000 });
  assert.equal(r.art, "schreiben");
  assert.equal(r.text, "Patientin klagt über klopfende Schmerzen an 26.");
  assert.equal(r.patient.patientId, "1");
});

t("schon gesprochener Text wartet auf das Ja", () => {
  const wartet = { wer: werAus(anna), text: "Kontrolle unauffällig.", patientId: "1", at: 1_000 };
  assert.equal(schritt({ text: "Ja.", wartet, jetzt: 2_000 }).text, "Kontrolle unauffällig.");
  assert.equal(schritt({ confirm: true, wartet, jetzt: 2_000 }).text, "Kontrolle unauffällig.");
  assert.equal(istNurBestaetigung("eintragen"), true);
  assert.equal(istNurBestaetigung("ja, und der Zahn 26 ist klopfempfindlich"), false);
});

t("eine Korrektur ersetzt den gemerkten Text", () => {
  const wartet = { wer: werAus(anna), text: "alt", patientId: "1", at: 1_000 };
  const r = schritt({ text: "Neu: Zahn 26 ist klopfempfindlich.", wartet, jetzt: 2_000 });
  assert.equal(r.text, "Neu: Zahn 26 ist klopfempfindlich.");
});

t("nach einer Viertelstunde wird neu gesucht", () => {
  const wartet = { wer: werAus(anna), text: "alt", at: 1_000 };
  assert.equal(schritt({ text: "Ja", wartet, jetzt: 1_000 + 16 * 60 * 1000 }).art, "suchen");
});

t("Ja ohne Text fragt noch einmal", () => {
  const wartet = { wer: werAus(anna), at: 1_000 };
  const r = schritt({ text: "Ja", wartet, jetzt: 2_000 });
  assert.equal(r.art, "fragen");
  assert.equal(frageBestaetigen(wartet.wer).includes("Karteikarte"), true);
});

console.log(`akteDoku: ${ok} ok`);
