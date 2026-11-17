import test from "node:test";
import assert from "node:assert/strict";
import { EINRICHTUNG_KI_SYSTEM, einrichtungKiLesen, einrichtungKiNachricht, lageSaeubern } from "../src/hkp/einrichtungKi.js";

test("lageSaeubern: nur bekannte Felder, Aktionen gefiltert, Details gekürzt", () => {
  const l = lageSaeubern({ schritt: "Öffnen", praxisprogramm: "DS-Win", moeglich: ["weiter", "loeschen", "keine", "herunterladen"],
    fremd: "x", verbunden: "ja", setup: { schritt: 3, text: "DS-Win nicht gefunden", fehler: true, details: "a".repeat(5000), vor: 12 } });
  assert.deepEqual(l.moeglich, ["weiter", "herunterladen"]);
  assert.equal(l.verbunden, false);
  assert.equal("fremd" in l, false);
  assert.equal(l.setup.details.length, 1200);
  assert.equal(l.setup.stummSeitSekunden, 12);
  assert.equal(lageSaeubern(null).setup, null);
});

test("einrichtungKiNachricht: Lage, Verlauf und Frage stehen drin", () => {
  const n = einrichtungKiNachricht({ text: "Da kommt ein blaues Fenster", lage: lageSaeubern({ schritt: "Öffnen" }),
    verlauf: [{ wer: "ich", text: "Hallo, ich bin neu" }, { wer: "ki", text: "Guten Tag, ich helfe Ihnen." }] });
  assert.ok(n.includes('"schritt": "Öffnen"'));
  assert.ok(n.includes("Praxis: Hallo, ich bin neu"));
  assert.ok(n.includes("Du: Guten Tag"));
  assert.ok(n.includes("DIE PRAXIS SCHREIBT:\nDa kommt ein blaues Fenster"));
  assert.ok(n.endsWith('{"antwort":"…","aktion":"…"}'));
});

test("einrichtungKiLesen: Aktion nur, wenn sie gerade möglich ist", () => {
  const lage = lageSaeubern({ moeglich: ["weiter"] });
  assert.deepEqual(einrichtungKiLesen('<think>x</think>{"antwort":"Ich gehe für Sie weiter.","aktion":"weiter"}', lage),
    { antwort: "Ich gehe für Sie weiter.", aktion: "weiter" });
  assert.equal(einrichtungKiLesen('{"antwort":"Ich lade es.","aktion":"herunterladen"}', lage).aktion, "keine");
  assert.equal(einrichtungKiLesen('{"antwort":"Gern.","aktion":"formatieren"}', lage).aktion, "keine");
  assert.equal(einrichtungKiLesen('{"antwort":"Gern."}', lage).aktion, "keine");
  assert.deepEqual(einrichtungKiLesen("Klicken Sie auf Weiter.", lage), { antwort: "Klicken Sie auf Weiter.", aktion: "keine" });
  assert.equal(einrichtungKiLesen("  ", lage), null);
  assert.equal(einrichtungKiLesen('{"antwort":"abgeschnitten', lage), null);
  assert.equal(einrichtungKiLesen('{"antwort":""}', lage), null);
});

test("Auftrag nennt Telefon, verbietet Kennwörter und verlangt JSON", () => {
  assert.ok(EINRICHTUNG_KI_SYSTEM.includes("0211 3029 3035"));
  assert.ok(EINRICHTUNG_KI_SYSTEM.includes("Frag nie nach Kennwörtern"));
  assert.ok(EINRICHTUNG_KI_SYSTEM.includes('{"antwort":"…","aktion":"keine"}'));
});
