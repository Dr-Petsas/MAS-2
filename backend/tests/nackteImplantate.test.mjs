import assert from "node:assert/strict";
import test from "node:test";
import { befundListe, nackteNichtEntfernen } from "../src/hkp/antwortVerstehen.js";

const befund = { 46: "i", 44: "i", 43: "i", 33: "i", 34: "i", 36: "i", 41: "f" };

test("Implantat steht als i", () => {
  assert.match(befundListe(befund), /Implantat ohne Suprakonstruktion: 46, 44, 43, 33, 34, 36/);
  assert.doesNotMatch(befundListe(befund), /\bj\b/);
});

test("Entfernungsfrage über nackte Implantate wird zur Planung", () => {
  const d = nackteNichtEntfernen({
    befund: { 46: "x", 44: "" },
    plan: "Totalprothese im Unterkiefer, 46 und 44 und 43 und 33 und 34 und 36 werden entfernt",
    sagen: "Im Unterkiefer stehen noch 46, 44, 43, 33, 34 und 36. Sollen die alle entfernt werden, oder bleiben welche stehen?",
    rechnen: false,
  }, befund, "ja der stimmt so die implantate tragen noch keine abutments du kannst direkt die prothese planen");
  assert.deepEqual(d.befund, {});
  assert.equal(d.plan, "Totalprothese im Unterkiefer");
  assert.equal(d.rechnen, true);
  assert.match(d.sagen, /bleiben liegen/);
});

test("Ausdrückliches Entfernen bleibt unangetastet", () => {
  const d = nackteNichtEntfernen({
    befund: { 46: "ix" }, plan: "Totalprothese im Unterkiefer, 46 wird entfernt", sagen: "Ich trage die Explantation ein.", rechnen: true,
  }, befund, "das Implantat 46 bitte entfernen");
  assert.deepEqual(d.befund, { 46: "ix" });
  assert.match(d.plan, /entfernt/);
});
