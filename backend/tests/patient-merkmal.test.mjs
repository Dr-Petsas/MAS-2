// Merkmal-Frage statt Namensliste ab vier Treffern (06.10.2026).
// Start: node backend/tests/patient-merkmal.test.mjs
import assert from "node:assert/strict";
const { disambiguationQuestion, merkmalFrage, merkmalEingrenzen } = await import("../src/clara/patientDisambig.js");

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }

const p = (firstName, lastName, birthDate = "") => ({ firstName, lastName, birthDate });
const meiers = [
  p("Stefan", "Meier", "1965-03-01"), p("Petra", "Meier", "1971-05-02"),
  p("Stefan", "Meier", "1988-07-03"), p("Jens", "Meier", "1990-01-04"),
];
const michaels = [
  p("Michael", "Böhl", "1959-01-01"), p("Michael", "Braun", "1966-01-01"),
  p("Michael", "Bulitz", "1972-01-01"), p("Michael", "Petsas", "1965-01-01"), p("Michael", "Petzas"),
];

t("bis drei Treffer bleibt die nummerierte Liste", () => {
  const q = disambiguationQuestion(meiers.slice(0, 3));
  assert.match(q, /^Es gibt mehrere Treffer — erste: Stefan Meier/);
});

t("ab vier Treffern: gleicher Nachname -> Vorname oder Jahrgang", () => {
  assert.equal(disambiguationQuestion(meiers), "Zu Meier finde ich vier Patienten. Nennen Sie mir bitte den Vornamen oder den Jahrgang.");
});

t("gleicher Vorname -> Nachname, gern buchstabiert", () => {
  assert.equal(merkmalFrage(michaels), "Ich finde fünf Patienten mit dem Vornamen Michael. Wie lautet der Nachname — gern auch buchstabiert?");
});

t("gleicher Vor- und Nachname -> Jahrgang", () => {
  const gleich = [1960, 1970, 1980, 1990].map((y) => p("Anna", "Schulz", `${y}-01-01`));
  assert.match(merkmalFrage(gleich), /mit gleichem Vornamen\. Welcher Jahrgang ist es\?$/);
});

t("ab 13 Treffern steht die Ziffer (Sprech-Schicht macht das Wort)", () => {
  const viele = Array.from({ length: 20 }, (_, i) => p(`V${i}`, "Müller"));
  assert.match(merkmalFrage(viele), /^Zu Müller finde ich 20 Patienten\. Nennen Sie mir bitte den Vornamen\.$/);
});

t("Vorname grenzt ein", () => {
  assert.deepEqual(merkmalEingrenzen("Petra", meiers), [meiers[1]]);
  assert.deepEqual(merkmalEingrenzen("Stefan", meiers), [meiers[0], meiers[2]]);
});

t("Jahrgang zwei- und vierstellig, auch '65er'", () => {
  assert.deepEqual(merkmalEingrenzen("Jahrgang 65", meiers), [meiers[0]]);
  assert.deepEqual(merkmalEingrenzen("Stefan, 1988", meiers), [meiers[2]]);
  assert.deepEqual(merkmalEingrenzen("der 65er", meiers), [meiers[0]]);
});

t("Nachname knapp verhoert bleibt bei beiden Klang-Nachbarn", () => {
  assert.deepEqual(merkmalEingrenzen("Petsas", michaels), [michaels[3], michaels[4]]);
  assert.deepEqual(merkmalEingrenzen("Braun", michaels), [michaels[1]]);
});

t("fremdes Wort = andere Person -> keine Eingrenzung", () => {
  assert.deepEqual(merkmalEingrenzen("Michael Schneider", michaels), []);
  assert.deepEqual(merkmalEingrenzen("Jahrgang 77", meiers), []);
  assert.deepEqual(merkmalEingrenzen("Meier", meiers), []);
});

t("Notaus MAS_MERKMAL_FRAGE=0", () => {
  process.env.MAS_MERKMAL_FRAGE = "0";
  try {
    assert.match(disambiguationQuestion(meiers), /^Es gibt mehrere Treffer/);
    assert.deepEqual(merkmalEingrenzen("Petra", meiers), []);
  } finally {
    delete process.env.MAS_MERKMAL_FRAGE;
  }
});

console.log(`patient-merkmal: ${ok} ok`);
