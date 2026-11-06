// Praxis-Wissen: Positionen aus dem PVS der Praxis ohne Preise, je Mandant getrennt.
import test from "node:test";
import assert from "node:assert/strict";
import { istAnalog, praxisZeilen } from "../src/hkp/praxisWissen.js";
import { wissenFuer } from "../src/hkp/wissen.js";

const MEDDENT = {
  pvs: "DS-Win", clientId: "praxisA",
  goz: [
    { nr: "9040a", eigen: true, text: "Parodontologisches Aufklärungs- und Therapiegespräch", punkte: 300, betrag: 45.5 },
    { nr: "2330a", eigen: true, text: "2330 analog - Kariesdetektor, je Kavität", punkte: 120 },
    { nr: "vm005", eigen: true, text: "Alginat", betrag: 7.9 },
    { nr: "0010", eigen: false, text: "Eingehende Untersuchung", punkte: 100 },
  ],
  eigenlabor: [
    { nr: "FADEN", text: "Nahtmaterial pro Faden", preis: 6.5, material: "f" },
    { nr: "0001", text: "Modell", preis: 12.34, ersetzt: "0001" },
  ],
  bel: [{ nr: "4012", text: "Knirscherschiene", preis: 88.77 }],
  komplexe: [{ kuerzel: "+PET", text: "Parodontale Erhaltungstherapie", positionen: [{ ebene: "GOZ", nr: "1020", anzahl: 2 }] }],
};

test("Praxiszeilen: Analog per a-Endung, Eigenlabor, BEL, Kette – nie Preise oder Punkte", () => {
  const z = praxisZeilen(MEDDENT);
  const text = z.map((x) => x.zeile).join("\n");
  assert.match(text, /Analogposition dieser Praxis 9040a: Parodontologisches/);
  assert.match(text, /Analogposition dieser Praxis 2330a/);
  assert.match(text, /Eigene GOZ-Position dieser Praxis vm005: Alginat/);
  assert.doesNotMatch(text, /0010/);
  assert.match(text, /Eigenlabor-Position dieser Praxis FADEN: Nahtmaterial/);
  assert.match(text, /Kassen-Eigenlabor dieser Praxis BEL 4012: Knirscherschiene/);
  assert.match(text, /Leistungskette \+PET dieser Praxis: .*GOZ 1020 ×2/);
  assert.doesNotMatch(text, /45|300|120|7,9|7\.9|6,5|6\.5|12,34|12\.34|88|€/);
  assert.ok(z.every((x) => x.such && !x.such.includes("dieser Praxis")));
  assert.equal(istAnalog({ nr: "6070a" }), true);
  assert.equal(istAnalog({ nr: "6070" }), false);
  assert.equal(istAnalog({ nr: "x1", analogZu: "2200" }), true);
});

test("Wissensausschnitt: Praxispositionen nur aus dem Katalog der fragenden Praxis", () => {
  const sinnA = { praxis: [{ zeile: praxisZeilen(MEDDENT).find((x) => x.nr === "2330a").zeile, sim: 0.65 }] };
  const a = wissenFuer("Welche Analogposition haben wir für den Kariesdetektor?", MEDDENT, sinnA);
  assert.match(a, /PRAXISPOSITIONEN: Positionen dieser Praxis aus DS-Win/);
  assert.match(a, /2330a: 2330 analog - Kariesdetektor/);

  const B = { pvs: "Z1", clientId: "praxisB", goz: [{ nr: "2330a", eigen: true, text: "Fluoreszenz-Kariesdiagnostik je Zahn" }], eigenlabor: [], bel: [], komplexe: [] };
  const b = wissenFuer("Was ist bei uns 2330a?", B);
  assert.match(b, /Fluoreszenz-Kariesdiagnostik/);
  assert.doesNotMatch(b, /Kariesdetektor|DS-Win/);

  assert.doesNotMatch(wissenFuer("Was ist bei uns 2330a?", null), /PRAXISPOSITIONEN/);
});

test("Genaue Kennung trifft ohne Bedeutungssuche: Nummer und Kürzel", () => {
  assert.match(wissenFuer("Was ist die 9040a?", MEDDENT), /9040a: Parodontologisches/);
  assert.match(wissenFuer("Setz die +PET", MEDDENT), /Leistungskette \+PET/);
  assert.match(wissenFuer("Was haben wir zur GOZ 2330?", MEDDENT), /2330a/);
});
