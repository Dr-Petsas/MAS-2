// Pure Unit-Test fuer den Zeitraum-Parser (clara/dateRange.js). Ohne Firestore,
// ohne Netz. Fixer Bezugstag 2026-07-09 (Donnerstag) -> alle Grenzen stabil.
// Teil von `npm test` (run-tests.mjs entdeckt test-*.mjs); Exit 0 = gruen.

import { resolveDateRange } from "../src/clara/dateRange.js";

const TODAY = "2026-07-09"; // Donnerstag; Montag dieser Woche = 2026-07-06
let failed = 0;

function eq(name, phrase, expFrom, expTo) {
  const r = resolveDateRange(phrase, TODAY);
  const ok = r && r.from === expFrom && r.to === expTo;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${name} :: ${JSON.stringify(r)}`);
  if (!ok) { failed++; console.log(`       erwartet from=${expFrom} to=${expTo}`); }
}

function isNull(name, phrase) {
  const r = resolveDateRange(phrase, TODAY);
  const ok = r === null;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${name} :: ${JSON.stringify(r)}`);
  if (!ok) failed++;
}

console.log("--- Woche");
eq("diese Woche", "Wie voll ist diese Woche?", "2026-07-06", "2026-07-12");
eq("letzte Woche", "Wie war letzte Woche?", "2026-06-29", "2026-07-05");
eq("nächste Woche", "Was steht nächste Woche an?", "2026-07-13", "2026-07-19");
eq("kommende Woche", "kommende Woche", "2026-07-13", "2026-07-19");
eq("vorletzte Woche", "und vorletzte Woche?", "2026-06-22", "2026-06-28");
eq("vergangene Woche", "vergangene Woche", "2026-06-29", "2026-07-05");

console.log("--- Monat");
eq("dieser Monat", "Wie sieht dieser Monat aus?", "2026-07-01", "2026-07-31");
eq("letzter Monat", "Wie war der letzte Monat?", "2026-06-01", "2026-06-30");
eq("nächster Monat", "Was kommt nächsten Monat?", "2026-08-01", "2026-08-31");

console.log("--- Quartal");
eq("dieses Quartal", "Wie läuft dieses Quartal?", "2026-07-01", "2026-09-30");
eq("letztes Quartal", "Zahlen vom letzten Quartal", "2026-04-01", "2026-06-30");
eq("nächstes Quartal", "nächstes Quartal", "2026-10-01", "2026-12-31");

console.log("--- Jahr");
eq("dieses Jahr", "wie voll ist dieses Jahr", "2026-01-01", "2026-12-31");
eq("letztes Jahr", "letztes Jahr", "2025-01-01", "2025-12-31");
eq("nächstes Jahr", "nächstes Jahr", "2027-01-01", "2027-12-31");

console.log("--- N Einheiten");
eq("letzte 7 Tage", "wie war es in den letzten 7 Tagen", "2026-07-03", "2026-07-09");
eq("letzte drei Tage (Wort)", "die letzten drei Tage", "2026-07-07", "2026-07-09");
eq("nächste 3 Tage", "die nächsten 3 Tage", "2026-07-09", "2026-07-11");
eq("letzte 2 Wochen", "letzte 2 Wochen", "2026-06-26", "2026-07-09");

console.log("--- Jahreszeit");
eq("im Sommer", "wie voll ist es im Sommer", "2026-06-01", "2026-08-31");
eq("im Winter", "im Winter", "2026-12-01", "2027-02-28");
eq("Herbst", "was ist im Herbst los", "2026-09-01", "2026-11-30");

console.log("--- KEINE Zeiträume (null)");
isNull("heute", "wie sieht mein Tag heute aus");
isNull("morgen", "was habe ich morgen");
isNull("kein Zeitbezug", "wer hat angerufen");
isNull("Einzelwochentag", "was ist am Montag");

// letzte N Monate: rollierendes Fenster, endet heute (nur to prüfen)
const m2 = resolveDateRange("letzte 2 Monate", TODAY);
const okM2 = m2 && m2.to === TODAY && m2.from < TODAY;
console.log(`  ${okM2 ? "OK  " : "FAIL"} letzte 2 Monate (rollierend) :: ${JSON.stringify(m2)}`);
if (!okM2) failed++;

console.log(failed === 0 ? "\nAlle Zeitraum-Parser-Checks bestanden." : `\n${failed} FEHLER im Zeitraum-Parser.`);
process.exit(failed ? 1 : 0);
