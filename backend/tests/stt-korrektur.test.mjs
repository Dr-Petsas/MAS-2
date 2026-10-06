// Gelernte Namens-Verhoerer ("Ich meinte Petsas", 06.10.2026).
// Start: node backend/tests/stt-korrektur.test.mjs
import assert from "node:assert/strict";
const { paarPruefen, paarEinfuegen, namensWoerter, MAX_PAARE } = await import("../src/clara/sttKorrekturen.js");

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }

const woerter = namensWoerter([
  { f: "Michael", l: "Petsas" }, { f: "Kiriakos", l: "Tzannis" }, { f: "Anna", l: "Peters" }, { f: "Jörg", l: "Müller-Lüdenscheidt" },
]);

t("Kartei-Woerter normalisiert (Umlaute, Bindestrich)", () => {
  assert.ok(woerter.has("petsas"));
  assert.ok(woerter.has("joerg"));
  assert.ok(woerter.has("luedenscheidt"));
});

t("gueltiges Paar", () => {
  assert.deepEqual(paarPruefen({ falsch: "Betsis", richtig: "Petsas" }, woerter), { ok: true, falsch: "Betsis", richtig: "Petsas" });
});

t("falsches Wort ist selbst ein Patient -> abgelehnt", () => {
  assert.equal(paarPruefen({ falsch: "Peters", richtig: "Petsas" }, woerter).grund, "falsch_ist_name");
});

t("richtiges Wort nicht in der Kartei -> abgelehnt", () => {
  assert.equal(paarPruefen({ falsch: "Betsis", richtig: "Pezold" }, woerter).grund, "richtig_unbekannt");
});

t("Muell und gleiche Woerter -> abgelehnt", () => {
  assert.equal(paarPruefen({ falsch: "B3", richtig: "Petsas" }, woerter).grund, "kein_wort");
  assert.equal(paarPruefen({ falsch: "petsas", richtig: "Petsas" }, woerter).grund, "gleich");
  assert.equal(paarPruefen({ falsch: "", richtig: "Petsas" }, woerter).grund, "kein_wort");
});

t("gleiches falsches Wort wird ueberschrieben, Zaehler steigt nur bei gleichem Ziel", () => {
  let l = paarEinfuegen([], { falsch: "Betsis", richtig: "Petsas" }, 1);
  l = paarEinfuegen(l, { falsch: "betsis", richtig: "Petsas" }, 2);
  assert.equal(l.length, 1);
  assert.equal(l[0].n, 2);
  l = paarEinfuegen(l, { falsch: "Betsis", richtig: "Tzannis" }, 3);
  assert.equal(l.length, 1);
  assert.equal(l[0].richtig, "Tzannis");
  assert.equal(l[0].n, 1);
});

t("Obergrenze: Aelteste fallen raus", () => {
  let l = [];
  for (let i = 0; i < MAX_PAARE + 5; i++) l = paarEinfuegen(l, { falsch: `Wort${"abcdefghij"[i % 10]}${i}`.replace(/\d/g, (d) => "klmnopqrst"[d]), richtig: "Petsas" }, i);
  assert.equal(l.length, MAX_PAARE);
  assert.equal(l[0].at, MAX_PAARE + 4);
});

console.log(`stt-korrektur: ${ok} ok`);
