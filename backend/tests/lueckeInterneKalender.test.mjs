// Chef 26.11.2026: "interne Kalender kriegen keinen Lueckenfuell-Mechanismus (bei uns Labor,
// bei Blessing z. B. Blessing OP)". Intern ist, was die Praxis im Kalender als intern
// gekennzeichnet hat (Plattform-Feld `internal`), nicht der Name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ohneInterneKalender, interneKalenderAus } from "../src/clara/gapFill.js";

const kalender = [
  { id: "pet", name: "Dr. Petsas" },
  { id: "lab", name: "Labor" },
  { id: "op", name: "Dr.Blessing (OP)" },
];

test("interne Kalender fallen aus der Lueckensuche, die anderen bleiben", () => {
  const rest = ohneInterneKalender(kalender, new Set(["lab", "op"]));
  assert.deepEqual(rest.map((c) => c.id), ["pet"]);
});

test("ohne Kennzeichen bleibt jeder Kalender", () => {
  assert.equal(ohneInterneKalender(kalender, new Set()).length, 3);
  assert.equal(ohneInterneKalender(kalender, null).length, 3);
});

test("intern zaehlt nur das gesetzte Kennzeichen der Plattform, geloeschte Kalender nicht", () => {
  const ids = interneKalenderAus([
    { id: "lab", internal: true, isDeleted: false },
    { id: "op", internal: true },
    { id: "pet", internal: false },
    { id: "alt", internal: true, isDeleted: true },
    { id: "ohne" },
  ]);
  assert.deepEqual([...ids].sort(), ["lab", "op"]);
});
