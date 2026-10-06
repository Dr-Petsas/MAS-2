// LLM-freier Test fuer die Botschafts-Regel delegierter Anrufe (L3b).
// Leere Einbestellung bleibt gesperrt (Live 29.07.2026 23:17), Absage oder
// Verschiebung ist eine Botschaft (Register reg-05, 06.10.2026).
//
// Start:  node backend/tests/lisaBotschaft.test.mjs
import assert from "node:assert/strict";
import { botschaftFehlt } from "../src/clara/lisaBotschaft.js";

let ok = 0;
function t(name, fn) {
  fn();
  ok += 1;
  console.log("  ok -", name);
}

for (const satz of [
  "Bitte kommen Sie morgen früh in die Praxis.",
  "Kommen Sie bitte mal vorbei.",
  "Kommen Sie in die Praxis, nicht vergessen.",
  "Hallo",
  "",
]) {
  t(`leer -> nachfragen: ${JSON.stringify(satz)}`, () => assert.equal(botschaftFehlt(satz), true));
}

for (const satz of [
  "Sie müssen morgen, am Mittwoch, nicht in die Praxis kommen.",
  "Sie muessen morgen nicht kommen.",
  "Er braucht morgen nicht zu kommen.",
  "Kommen Sie morgen bitte nicht, wir haben geschlossen.",
  "Bitte kommen Sie morgen erst eine Stunde später.",
  "Die Besprechung fällt morgen aus, Sie müssen nicht in die Praxis.",
  "Ihr Zahnersatz ist da, bitte kommen Sie zur Eingliederung.",
  "Bitte kommen Sie morgen um neun, Ihr Termin wurde vorgezogen.",
  "Die Besprechung beginnt um acht.",
]) {
  t(`Botschaft vorhanden: ${JSON.stringify(satz)}`, () => assert.equal(botschaftFehlt(satz), false));
}

console.log(`\nAlle ${ok} Faelle gruen.`);
