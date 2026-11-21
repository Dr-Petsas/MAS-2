// Praxisstil: Regeln aus dem Fallkatalog, je Praxis, nur die passende Planart, nie Beträge.
import test from "node:test";
import assert from "node:assert/strict";
import { stilZeilen, praxisStilAbschnitt, _praxisStilSetzen, _praxisStilLeeren } from "../src/hkp/praxisStil.js";
import { wissenFuer } from "../src/hkp/wissen.js";

const REGELN = [
  { slot: "ze-krone-gleich", worte: ["krone", "gleichartig"], zeile: "Bei Krone, gleichartig: GOZ 2210 je Zahn, Faktor 2,3. Belegt in 3 von 3 Plänen.", ebene: "GOZ", nr: "2210", belegt: 3, von: 3 },
  { slot: "ze-krone-regel", worte: ["krone", "regelversorgung"], zeile: "Bei Krone, Regelversorgung: BEMA 20b je Zahn. Belegt in 4 von 4 Plänen.", ebene: "BEMA", nr: "20b", belegt: 4, von: 4 },
  { slot: "privat-krone", worte: ["private krone"], zeile: "Bei Private Krone: GOZ 2210 je Zahn, Faktor 3,5. Belegt in 2 von 2 Plänen.", ebene: "GOZ", nr: "2210", belegt: 2, von: 2 },
];

test("Praxisstil trifft die genaueste Planart", () => {
  assert.deepEqual(stilZeilen(REGELN, "Wie rechnet ihr eine Krone als Regelversorgung?"), [
    "Bei Krone, Regelversorgung: BEMA 20b je Zahn. Belegt in 4 von 4 Plänen.",
  ]);
  assert.deepEqual(stilZeilen(REGELN, "private Krone auf 16"), [
    "Bei Private Krone: GOZ 2210 je Zahn, Faktor 3,5. Belegt in 2 von 2 Plänen.",
  ]);
  assert.deepEqual(stilZeilen(REGELN, "Wie ist das Wetter?"), []);
});

test("Clara bekommt den Praxisstil dieser Praxis und keine Beträge", () => {
  _praxisStilSetzen("praxisA", REGELN);
  _praxisStilSetzen("praxisB", []);
  try {
    const a = wissenFuer("Krone gleichartig, welchen Faktor nehmt ihr?", { clientId: "praxisA", goz: [], eigenlabor: [], bel: [], komplexe: [] });
    const stil = a.slice(a.indexOf("[PRAXISSTIL"), a.indexOf("\n[", a.indexOf("[PRAXISSTIL") + 1));
    assert.match(stil, /PRAXISSTIL/);
    assert.match(stil, /GOZ 2210 je Zahn, Faktor 2,3/);
    assert.doesNotMatch(stil, /Regelversorgung|Private Krone|€|Euro/);
    assert.equal(praxisStilAbschnitt("praxisB", "Krone gleichartig"), "");
    assert.doesNotMatch(wissenFuer("Krone gleichartig", { clientId: "praxisB", goz: [], eigenlabor: [], bel: [], komplexe: [] }), /PRAXISSTIL|Faktor 2,3/);
  } finally {
    _praxisStilLeeren();
  }
});
