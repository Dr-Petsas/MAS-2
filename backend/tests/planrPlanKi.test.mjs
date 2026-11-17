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

test("Pruefmodul: Art, ids und Begruendung erreichen das Modell, fremde ids nicht", () => {
  const b = blickSaeubern({
    planart: "privat-impl", kann: ["setze", "weg"],
    positionen: [
      { id: "p1", ebene: "GOZ", nr: "9010", zahn: "16", anzahl: 1, faktor: 3.5, betrag: 100, text: "Implantat", begruendung: "Erschwerter Zugang." },
      { id: "p2", ebene: "GOZ", nr: "9100", zahn: "16", anzahl: 1, faktor: 3.5, betrag: 100, text: "Augmentation" },
    ],
    hinweise: [
      { stufe: "warnung", text: "9100 ueber 2,3 ohne Begruendung", art: "begruendung_fehlt", ids: ["p2", "fremd"] },
      { stufe: "fehler", text: "x", art: "erfunden", ids: ["fremd"] },
    ],
  });
  assert.equal(b.positionen[0].begruendung, "Erschwerter Zugang.");
  assert.deepEqual(b.hinweise[0], { stufe: "warnung", text: "9100 ueber 2,3 ohne Begruendung", art: "begruendung_fehlt", ids: ["p2"] });
  assert.deepEqual(b.hinweise[1], { stufe: "fehler", text: "x" });
  const n = planKiNachricht({ text: "pruefe und korrigiere den plan", blick: b, nachlauf: { runde: 2, getan: ["9010: Faktor 3,5"], nicht: ["9100: geht nicht"] } });
  assert.ok(n.includes("- [warnung] art=begruendung_fehlt ids=p2(hand): 9100"), n);
  assert.ok(n.includes("NACH DEINEN SCHRITTEN") && n.includes("- 9100: geht nicht"));
  assert.equal(planKiNachricht({ text: "x", blick: b }).includes("NACH DEINEN SCHRITTEN"), false);
});

test("planKiLesen: viele Begruendungen in einem Zug, pruefung-Kennzeichen", () => {
  const pos = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, ebene: "GOZ", nr: "9010", zahn: "16", anzahl: 1, faktor: 3.5, betrag: 1, text: "t" }));
  const b = blickSaeubern({ planart: "privat-impl", kann: ["setze"], positionen: pos });
  const r = planKiLesen(JSON.stringify({ antwort: "Begruendungen ergaenzt.", pruefung: false, schritte: pos.map((p) => ({ op: "setze", id: p.id, begruendung: "Erhoehter Zeitaufwand." })) }), b);
  assert.equal(r.schritte.length, 30);
  assert.equal(r.pruefung, false);
  assert.equal(planKiLesen('{"antwort":"ok","schritte":[]}', b).pruefung, false);
});

test("Korrekturlauf: nur was eine Meldung verlangt, kein Faktor nach oben, nichts an entfernten Positionen", () => {
  const z = { ebene: "GOZ", nr: "0090", zahn: "16", anzahl: 1, betrag: 10, text: "Infiltration" };
  const b = blickSaeubern({
    planart: "privat-impl", kann: ["setze", "weg", "schalter", "hinzu"], ebenen: ["GOZ"],
    positionen: [{ ...z, id: "hoch", faktor: 4.2 }, { ...z, id: "auto", faktor: 2.3, auto: true }, { ...z, id: "ohne", nr: "9100", faktor: 3.5 }, { ...z, id: "fremd", nr: "9010", faktor: 2.3 }],
    schalter: [{ name: "s", text: "S", wert: true }],
    hinweise: [
      { stufe: "fehler", text: "f", art: "faktor_ueber_35", ids: ["hoch"] },
      { stufe: "warnung", text: "d", art: "doppelt", ids: ["hoch", "auto"] },
      { stufe: "warnung", text: "b", art: "begruendung_fehlt", ids: ["ohne"] },
    ],
  });
  const lesen = (schritte) => planKiLesen(JSON.stringify({ antwort: "a", pruefung: true, schritte }), b);
  const r = lesen([
    { op: "setze", id: "hoch", faktor: 3.5, begruendung: "Erhoehter Aufwand." },
    { op: "setze", id: "auto", faktor: 3.5 },
    { op: "setze", id: "fremd", faktor: 3.5, begruendung: "x" },
    { op: "setze", id: "ohne", faktor: 2.3, begruendung: "Erhoehter Zeitaufwand." },
    { op: "weg", id: "fremd" },
    { op: "schalter", name: "s", wert: false },
    { op: "hinzu", ebene: "GOZ", nr: "9100", zahn: "16" },
  ]);
  assert.deepEqual(r.schritte, [
    { op: "setze", id: "hoch", faktor: 3.5, begruendung: "Erhoehter Aufwand." },
    { op: "setze", id: "ohne", begruendung: "Erhoehter Zeitaufwand." },
  ]);
  assert.equal(r.verworfen.length, 5);
  // Doppelte Position: ohne Entscheidung der Praxis wird nichts entfernt, das Programm fragt.
  const weg = lesen([{ op: "weg", id: "hoch" }, { op: "setze", id: "hoch", faktor: 3.5 }]);
  assert.deepEqual(weg.schritte, [{ op: "setze", id: "hoch", faktor: 3.5 }]);
  assert.match(weg.frage, /Hier entscheiden Sie: d\. Welche Position/);
  // Hat der Arzt entschieden, wird genau das ausgefuehrt und nicht noch einmal gefragt.
  const ja = planKiLesen(JSON.stringify({ antwort: "a", pruefung: true, entschieden: true, schritte: [{ op: "weg", id: "hoch" }, { op: "setze", id: "hoch", faktor: 3.5 }, { op: "weg", id: "fremd" }] }), b);
  assert.deepEqual(ja.schritte, [{ op: "weg", id: "hoch" }]);
  assert.equal(ja.frage, "");
});

test("Korrekturlauf: bei Ausschluss schaltet das Modell nichts ab, bevor die Praxis entschieden hat", () => {
  const z = { ebene: "GOZ", zahn: "16", anzahl: 1, faktor: 2.3, betrag: 10, text: "x" };
  const b = blickSaeubern({
    planart: "privat-impl", kann: ["setze", "weg", "schalter"], ebenen: ["GOZ"],
    positionen: [{ ...z, id: "a", nr: "3300" }, { ...z, id: "b", nr: "3060", auto: true }],
    schalter: [{ name: "s", text: "S", wert: true }],
    hinweise: [{ stufe: "fehler", text: "GOZ 3300 und 3060 schliessen sich aus", art: "ausschluss", ids: ["a", "b"] }],
  });
  const r = planKiLesen(JSON.stringify({ antwort: "a", pruefung: true, schritte: [{ op: "weg", id: "a" }, { op: "schalter", name: "s", wert: false }] }), b);
  assert.deepEqual(r.schritte, []);
  assert.match(r.frage, /3300 und 3060 schliessen sich aus\. Welche Position/);
  // Ein gewoehnlicher Aenderungsauftrag ("nimm die 3300 raus") bleibt unberuehrt.
  const n = planKiLesen(JSON.stringify({ antwort: "a", schritte: [{ op: "weg", id: "a" }] }), b);
  assert.deepEqual(n.schritte, [{ op: "weg", id: "a" }]);
  assert.equal(n.frage, "");
});

test("Zahnschema: Schritt zahn nur mit gemeldeten Feldern und Werten", () => {
  const b = blickSaeubern({
    planart: "privat-hkp", kann: ["zahn", "zurueck"], positionen: [], schalter: [],
    zahnfelder: [
      { name: "befund", text: "Befund", werte: { "": "leer", f: "fehlt", kw: "Krone erneuern" } },
      { name: "planung", text: "Planung", werte: { "": "leer", I: "Implantat", KM: "Krone" } },
      { name: "laenge", text: "Länge", von: 4, bis: 20 },
      { name: "cpt", text: "CPT", ja: true },
      { name: "kaputt" },
    ],
  });
  assert.equal(b.zahnfelder.length, 4);
  assert.ok(planKiNachricht({ text: "16 fehlt", blick: b }).includes("ZAHNSCHEMA"));
  const r = planKiLesen(JSON.stringify({ antwort: "Ich trage das ein.", schritte: [
    { op: "zahn", zahn: "16", felder: { befund: "F", planung: "I", laenge: "11,5", cpt: true } },
    { op: "zahn", zahn: "26", felder: { planung: "" } },
    { op: "zahn", zahn: "19", felder: { befund: "f" } },
    { op: "zahn", zahn: "36", felder: { befund: "gibtsnicht" } },
    { op: "zahn", zahn: "36", felder: { fremd: "x" } },
    { op: "zahn", zahn: "36", felder: { laenge: 40 } },
    { op: "zahn", zahn: "36", felder: { cpt: "vielleicht" } },
    { op: "zahn", zahn: "36", felder: {} },
  ] }), b);
  assert.deepEqual(r.schritte, [
    { op: "zahn", zahn: "16", felder: { befund: "f", planung: "I", laenge: 11.5, cpt: true } },
    { op: "zahn", zahn: "26", felder: { planung: "" } },
  ]);
  assert.equal(r.verworfen.filter((v) => v === "zahn").length, 6);
  // Ohne "zahn" in kann und im Korrekturlauf fällt der Schritt.
  assert.deepEqual(planKiLesen('{"antwort":"x","schritte":[{"op":"zahn","zahn":"16","felder":{"befund":"f"}}]}', blick).schritte, []);
  assert.deepEqual(planKiLesen('{"antwort":"x","pruefung":true,"schritte":[{"op":"zahn","zahn":"16","felder":{"befund":"f"}}]}', b).schritte, []);
});

test("planKiLesen: die Schrittliste zaehlt auch unter einem verschriebenen Feldnamen", () => {
  const r = planKiLesen(`{"aendert":true,"schsteps":[{"op":"weg","id":"a2"}],"antwort":"Ich nehme die 9130 heraus.","pruefung":false}`, blick);
  assert.deepEqual(r.schritte, [{ op: "weg", id: "a2" }]);
});

test("planKiForm: nur ids, Schalter und Schritt-Arten dieses Plans", async () => {
  const { planKiForm } = await import("../src/hkp/planKiZug.js");
  const f = planKiForm(blick);
  const arten = f.properties.schritte.items.anyOf;
  const von = (op) => arten.find((a) => a.properties.op.enum[0] === op);
  assert.deepEqual(arten.map((a) => a.properties.op.enum[0]), ["schalter", "hinzu", "setze", "weg", "zurueck"]);
  assert.deepEqual(von("weg").properties.id.enum, ["a1", "a2"]);
  assert.deepEqual(von("schalter").properties.name.enum, ["region.OK rechts.augmentation", "global.bildgebung"]);
  assert.deepEqual(von("hinzu").properties.ebene.enum, ["GOZ", "GOAE"]);
  assert.deepEqual(f.required, ["art", "aendert", "schritte", "antwort", "pruefung"]);
  const zu = planKiForm({ ...blick, gesperrt: true });
  assert.equal(zu.properties.schritte.maxItems, 0);
  const mitZahn = planKiForm({ ...blick, kann: [...blick.kann, "zahn"], zahnfelder: [{ name: "planung", werte: { "": "leer", I: "Implantat" } }, { name: "sofort", ja: true }, { name: "laenge", von: 6, bis: 16 }] });
  const felder = mitZahn.properties.schritte.items.anyOf.find((a) => a.properties.op.enum[0] === "zahn").properties.felder.properties;
  assert.deepEqual(felder, { planung: { type: "string", enum: ["", "I"] }, sofort: { type: "boolean" }, laenge: { type: "number", minimum: 6, maximum: 16 } });
});

test("Schritt zahn: wer den Eintrag herausnimmt, scheitert nicht an einem ungueltigen Nebenfeld; sonst nennt der Server den Grund", () => {
  const b = { ...blick, kann: ["zahn"], zahnfelder: [{ name: "therapie", werte: { "": "Zahn aus dem Plan nehmen", endo: "Wurzelbehandlung" } }, { name: "kanaele", von: 1, bis: 5 }] };
  const weg = planKiLesen('{"aendert":true,"schritte":[{"op":"zahn","zahn":"37","felder":{"therapie":"","kanaele":0}}],"antwort":"Zahn 37 ist heraus.","pruefung":false}', b);
  assert.deepEqual(weg.schritte, [{ op: "zahn", zahn: "37", felder: { therapie: "" } }]);
  const falsch = planKiLesen('{"aendert":true,"schritte":[{"op":"zahn","zahn":"37","felder":{"kanaele":9}}],"antwort":"Neun Kanaele.","pruefung":false}', b);
  assert.deepEqual(falsch.schritte, []);
  assert.match(falsch.gruende[0], /kanaele.*von 1 bis 5/);
  const null0 = planKiLesen('{"aendert":true,"schritte":[{"op":"setze","id":"a2","anzahl":0}],"antwort":"Die 9130 ist heraus.","pruefung":false}', blick);
  assert.deepEqual(null0.schritte, []);
  assert.match(null0.gruende[0], /Anzahl 0 gibt es nicht/);
});

test("planKiLesen: geht_nicht verwirft Ersatzschritte", () => {
  const blick = { planart: "kassen-par", kann: ["zahn"], ebenen: [], positionen: [], schalter: [], hinweise: [], zahnfelder: [{ name: "stMesial", text: "Sondierungstiefe", von: 0, bis: 15 }] };
  const mit = (art) => planKiLesen(JSON.stringify({ art, aendert: true, schritte: [{ op: "zahn", zahn: "36", felder: { stMesial: 4 } }], antwort: "x", pruefung: false }), blick);
  assert.equal(mit("geht_nicht").schritte.length, 0);
  assert.equal(mit("geht_nicht").aendert, false);
  assert.equal(mit("aenderung").schritte.length, 1);
});
