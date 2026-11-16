import test from "node:test";
import assert from "node:assert/strict";
import { blickSaeubern, planKiLesen, planKiNachricht, planPruefung, tabelleFuer } from "../src/hkp/planKi.js";

const blick = blickSaeubern({
  planart: "implantologie", name: "Implantatplanung", gesperrt: false,
  kann: ["schalter", "hinzu", "setze", "weg", "zurueck", "fremd"], ebenen: ["GOZ", "GOAE"],
  positionen: [
    { id: "a1", ebene: "GOZ", nr: "9010", zahn: "16", anzahl: 1, faktor: 2.3, betrag: 199.6, text: "Implantat", auto: true },
    { id: "a2", ebene: "GOZ", nr: "9130", zahn: "16", anzahl: 1, faktor: 2.3, betrag: 50, text: "Bone Splitting" },
  ],
  schalter: [
    { name: "region.OK rechts.augmentation", text: "Knochenaufbau GOZ 9100", wert: false },
    { name: "global.bildgebung", text: "Bildgebung", wert: "opg", werte: ["opg", "dvt"] },
  ],
  summen: { gesamt: 249.6 }, angaben: { befund: "16 f" },
  hinweise: [{ stufe: "info", text: "x" }],
  patient: { name: "darf nicht durch" },
});

test("blickSaeubern: nur bekannte Felder und Schritt-Arten", () => {
  assert.deepEqual(blick.kann, ["schalter", "hinzu", "setze", "weg", "zurueck"]);
  assert.equal("patient" in blick, false);
  assert.equal(blick.positionen.length, 2);
});

test("planKiLesen: gueltige Schritte bleiben, fremde ids und Schalter fallen", () => {
  const r = planKiLesen(`<think>x</think>{"antwort":"Ich setze den Knochenaufbau an.","schritte":[
    {"op":"schalter","name":"region.OK rechts.augmentation","wert":true},
    {"op":"schalter","name":"gibt.es.nicht","wert":true},
    {"op":"schalter","name":"global.bildgebung","wert":"mrt"},
    {"op":"weg","id":"a2"},{"op":"weg","id":"zz"},
    {"op":"setze","id":"a1","faktor":"3,5"},
    {"op":"hinzu","ebene":"goz","nr":"9100","zahn":"16","anzahl":1,"faktor":2.3},
    {"op":"hinzu","ebene":"BEMA","nr":"01","zahn":""},
    {"op":"speichern"}]}`, blick);
  assert.equal(r.antwort, "Ich setze den Knochenaufbau an.");
  assert.deepEqual(r.schritte, [
    { op: "schalter", name: "region.OK rechts.augmentation", wert: true },
    { op: "weg", id: "a2" },
    { op: "setze", id: "a1", faktor: 3.5 },
    { op: "hinzu", ebene: "GOZ", nr: "9100", zahn: "16", anzahl: 1, faktor: 2.3 },
  ]);
  assert.equal(r.verworfen.length, 5);
});

test("planKiLesen: gesperrter Plan nimmt keinen Schritt, Unsinn wird null", () => {
  const zu = { ...blick, gesperrt: true };
  assert.deepEqual(planKiLesen('{"antwort":"ok","schritte":[{"op":"weg","id":"a2"}]}', zu).schritte, []);
  assert.equal(planKiLesen("kein JSON", blick), null);
  assert.equal(planKiLesen('{"schritte":[]}', blick), null);
});

test("Tabelle und Pruefung: 9130 neben 9100", () => {
  const saetze = tabelleFuer("kannst du die 9100 einbauen?", blick);
  assert.ok(saetze.some((s) => s.includes("9130") && s.includes("9100")), saetze.join(" | "));
  const m = planPruefung([{ ebene: "GOZ", nr: "9130", zahn: "16" }, { ebene: "GOZ", nr: "9100", zahn: "16" }]);
  assert.ok(m.length >= 1);
  assert.equal(m[0].stufe, "fehler");
  assert.deepEqual(planPruefung([{ ebene: "GOZ", nr: "9010", zahn: "16" }]), []);
});

test("planKiNachricht: Plan, Schalter und Satz stehen drin, kein Patient", () => {
  const n = planKiNachricht({ text: "geht 9100 noch?", blick, tabelle: ["T1"], wissen: "GOZ 9100: ..." });
  assert.ok(n.includes('"nr":"9010"') && n.includes("region.OK rechts.augmentation") && n.includes("geht 9100 noch?") && n.includes("- T1"));
  assert.equal(n.includes("darf nicht durch"), false);
});
