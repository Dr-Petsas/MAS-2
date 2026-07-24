// Pure test (kein Firebase) fuer die Korrespondenz-/Kontakt-Namenszerlegung
// des STT-Bias (Chef 25.07.2026). Prueft: Anreden/Titel weg, Orgs raus,
// Vor-/Nachname-Split, Einzeltoken, unbrauchbares verworfen.
//
//   node backend/scripts/test-stt-memory-names.mjs

import { personNameToParts } from "../src/clara/sttPatientNames.js";

let failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  OK   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
}
function eq(name, got, want) {
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);
}

console.log("--- personNameToParts: Zerlegung");
eq("voller Name", personNameToParts("Anna Meier"), { last: "Meier", first: "Anna" });
eq("Anrede weg (Herr)", personNameToParts("Herr Sanasi"), { last: "Sanasi", first: "" });
eq("Anrede + Titel weg", personNameToParts("Herr Dr. Anna Meier"), { last: "Meier", first: "Anna" });
eq("Frau + Doppel-Vorname", personNameToParts("Frau Eva Maria Thrandorf"),
   { last: "Thrandorf", first: "Eva Maria" });
eq("Einzelname -> Nachname", personNameToParts("Kyriakidou"), { last: "Kyriakidou", first: "" });

console.log("--- personNameToParts: verworfen");
check("Organisation (GmbH) raus", personNameToParts("Flyeralarm GmbH") === null);
check("Labor raus", personNameToParts("Labor Müller") === null);
check("Krankenkasse raus", personNameToParts("AOK Krankenkasse") === null);
check("leer raus", personNameToParts("") === null);
check("einzelner Buchstabe raus", personNameToParts("A.") === null);
check("nur Anrede raus", personNameToParts("Herr") === null);

console.log("");
if (failed) {
  console.log(`FEHLGESCHLAGEN: ${failed}`);
  process.exit(1);
}
console.log("Alle STT-Memory-Namen-Checks bestanden.");
process.exit(0);
