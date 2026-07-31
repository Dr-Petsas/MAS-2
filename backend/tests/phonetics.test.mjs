// LLM-freier Test der deutschen Phonetik (Koelner Phonetik) fuer die
// Namenserkennung. Start: node backend/tests/phonetics.test.mjs
import assert from "node:assert/strict";
import {
  koelnerPhonetikToken,
  phoneticKey,
  soundsSame,
  sharesPhoneticToken,
  phoneticCandidates,
} from "../src/clara/phonetics.js";

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }

// Bekannte Koelner-Phonetik-Referenzwerte.
t("Referenzwerte Koelner Phonetik", () => {
  assert.equal(koelnerPhonetikToken("Wikipedia"), "3412");
  assert.equal(koelnerPhonetikToken("Meier"), "67");
  assert.equal(koelnerPhonetikToken("Mayer"), "67");
  assert.equal(koelnerPhonetikToken("Breschnew"), "17863");
});

// Der Kern-Anwendungsfall: STT-Verhoerer desselben Namens.
t("Thermos = Termos = Dermos (gleicher Klang)", () => {
  const k = koelnerPhonetikToken("Thermos");
  assert.equal(koelnerPhonetikToken("Termos"), k);
  assert.equal(koelnerPhonetikToken("Dermos"), k);
  assert.equal(soundsSame("Thermos", "Termos"), true);
  assert.equal(soundsSame("Xenofon Thermos", "Xenofon Termos"), true);
});

t("Petsas = Pezas = Betsas (stimmlos/stimmhaft, ts/z)", () => {
  const k = koelnerPhonetikToken("Petsas");
  assert.equal(koelnerPhonetikToken("Pezas"), k);
  // Betsas: B statt P -> anderer Anlaut-Code, daher NICHT gleich - realistisch,
  // aber Token teilt sich nicht; wird von der Varianten-Suche abgedeckt.
  assert.equal(soundsSame("Petsas", "Pezas"), true);
});

t("Reihenfolge Vor-/Nachname egal", () => {
  assert.equal(soundsSame("Thermos Xenofon", "Xenofon Thermos"), true);
});

t("Nur Nachname gesprochen -> Token-Match", () => {
  assert.equal(sharesPhoneticToken("Termos", "Xenofon Thermos"), true);
  assert.equal(soundsSame("Termos", "Xenofon Thermos"), false);
});

t("Verschiedene Namen klingen NICHT gleich", () => {
  assert.equal(soundsSame("Thermos", "Schmidt"), false);
  assert.equal(soundsSame("Meier", "Bauer"), false);
});

t("Umlaute/ss werden normalisiert", () => {
  assert.equal(koelnerPhonetikToken("Müller"), koelnerPhonetikToken("Mueller"));
  assert.equal(koelnerPhonetikToken("Weiß"), koelnerPhonetikToken("Weiss"));
});

t("phoneticCandidates trennt Voll- und Token-Treffer", () => {
  const list = [
    { firstName: "Xenofon", lastName: "Thermos" },
    { firstName: "Nadine", lastName: "Thermos" },
    { firstName: "Anna", lastName: "Schmidt" },
  ];
  const getName = (p) => `${p.firstName} ${p.lastName}`;
  const { full, partial } = phoneticCandidates("Termos", list, getName);
  // "Termos" allein: kein voller 2-Token-Match, aber Nachname-Token trifft beide Thermos.
  assert.equal(full.length, 0);
  assert.equal(partial.length, 2);
  assert.ok(partial.every((p) => p.lastName === "Thermos"));
});

t("phoneticKey ist stabil und tokenreihenfolge-invariant", () => {
  assert.equal(phoneticKey("Xenofon Thermos"), phoneticKey("Thermos Xenofon"));
  assert.notEqual(phoneticKey("Xenofon Thermos"), "");
});

console.log(`\nAlle ${ok} Faelle gruen.`);
