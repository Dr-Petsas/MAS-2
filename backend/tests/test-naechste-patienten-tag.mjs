// Redet die Patienten-Vorschau vom RICHTIGEN Tag?
//
// Anlass (Live-Anrufe 11.08. und 14.08.2026):
//   * "Was sind denn die ersten Patienten am Dienstag?" -> das Werkzeug lief
//     korrekt mit date=Dienstag, antwortete aber "Für heute stehen keine
//     weiteren Patienten mehr an." Der Satz war fest verdrahtet.
//   * "Wann habe ich meinen ersten Patienten wieder nach dem Urlaub?" -> derselbe
//     Satz, 18 Sekunden nachdem Clara selbst gesagt hatte, dass der Urlaub bis
//     zum 17.08. laeuft.
// Dazu kam ein zweiter Fehler: der Filter "nur was noch kommt" (startMs >= jetzt)
// lief ueber JEDEN Tag. Bei einer Frage nach einem vergangenen Tag fiel damit
// alles weg und Clara meldete "keine Patienten", obwohl der Tag voll war.
//
// Aufruf: node backend/tests/test-naechste-patienten-tag.mjs
import { nurAbJetzt, leerSatzFuerTag } from "../src/clara/nextPatientsBriefing.js";
import { todayBerlin } from "../src/clara/daySchedule.js";

let ok = 0;
let fail = 0;
function check(name, cond, info = "") {
  if (cond) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

const heute = todayBerlin();
const tage = (n) => {
  const d = new Date(`${heute}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

console.log("1) Der Jetzt-Blick gilt nur heute");
check("heute -> ab jetzt", nurAbJetzt(heute) === true);
check("ohne Datum -> ab jetzt (Standard bleibt heute)", nurAbJetzt(undefined) === true);
check("morgen -> ganzer Tag", nurAbJetzt(tage(1)) === false);
check("gestern -> ganzer Tag", nurAbJetzt(tage(-1)) === false, "sonst filtert 'jetzt' den Tag leer");
check("in einer Woche -> ganzer Tag", nurAbJetzt(tage(7)) === false);

console.log("2) Heute bleibt wortgleich wie bisher");
check("heutiger Satz unveraendert",
  leerSatzFuerTag(heute) === "Für heute stehen keine weiteren Patienten mehr an.",
  leerSatzFuerTag(heute));

console.log("3) Ein anderer Tag wird BENANNT (der eigentliche Fehler)");
for (const n of [1, 2, 3, 5, 9, 16]) {
  const satz = leerSatzFuerTag(tage(n));
  check(`+${n} Tage nennt nicht faelschlich heute`, !/für heute/i.test(satz), satz);
  check(`+${n} Tage ist ein ganzer Satz`, /^[A-ZÄÖÜ].*\.$/.test(satz), satz);
  check(`+${n} Tage spricht in der Gegenwart`, /stehen keine Patienten an/.test(satz), satz);
}

console.log("4) Vergangene Tage sprechen in der Vergangenheit");
for (const n of [-1, -2, -4, -11]) {
  const satz = leerSatzFuerTag(tage(n));
  check(`${n} Tage nicht 'für heute'`, !/für heute/i.test(satz), satz);
  check(`${n} Tage in der Vergangenheitsform`, /waren keine Patienten eingetragen/.test(satz), satz);
}

console.log("5) Kein ISO-Datum im gesprochenen Satz");
// Clara spricht Datumsangaben relativ; ein "2026-08-18" waere unsprechbar.
for (const n of [1, 4, 30, -3]) {
  check(`+${n}: kein JJJJ-MM-TT im Satz`, !/\d{4}-\d{2}-\d{2}/.test(leerSatzFuerTag(tage(n))),
    leerSatzFuerTag(tage(n)));
}

console.log("6) Der alte, fest verdrahtete Satz ist wirklich weg");
const quelle = await (await import("node:fs")).promises.readFile(
  new URL("../src/clara/nextPatientsBriefing.js", import.meta.url), "utf8");
const treffer = quelle.match(/"Für heute stehen keine weiteren Patienten mehr an\."/g) || [];
check("nur noch EINE Stelle mit dem heute-Satz (in leerSatzFuerTag)",
  treffer.length === 1, `gefunden: ${treffer.length}`);
check("der Rueckgabe-Zweig nutzt den Satzbauer",
  /message:\s*leerSatzFuerTag\(theDate\)/.test(quelle));
check("der Jetzt-Filter fragt nach dem Tag",
  /nurAbJetzt\(theDate\)\s*\?\s*a\.startMs\s*>=\s*nowMs/.test(quelle));

console.log(`\n${ok} ok, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
