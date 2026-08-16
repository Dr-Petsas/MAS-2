// Endet eine erfolglose Namenssuche in einer Sackgasse oder in einem naechsten
// Schritt? Anlass (Live-Anruf 04.08.2026, Haila El-Otmani): Clara sagte "Kein
// Patient mit dem Namen ... gefunden." — Punkt. Der Chef wiederholte den Namen,
// das Spracherkennen verhoerte sich identisch, Clara sagte dasselbe. Sechs Zuege
// ohne Fortschritt.
//
// Aufruf: node backend/tests/test-nicht-gefunden.mjs
import fs from "node:fs";
import path from "node:path";
import { nichtGefundenFrage } from "../src/clara/patientDisambig.js";

let ok = 0;
let fail = 0;
function check(name, cond, info = "") {
  if (cond) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

console.log("1) Der Satz nennt den Namen und einen Ausweg");
const s = nichtGefundenFrage("Transauer");
check("der gesuchte Name kommt vor", s.includes("Transauer"), s);
check("bittet ums Buchstabieren", /buchstabieren/i.test(s), s);
check("nennt einen zweiten Weg (Vorname/Jahrgang)", /jahrgang/i.test(s), s);
check("endet nicht mit einem Punkt-Aus", /\?|buchstabieren|jahrgang/i.test(s), s);

console.log("2) Die Quelle wird ehrlich benannt");
const q = nichtGefundenFrage("Meier", { quelle: "im Praxisgedächtnis" });
check("Quelle steht im Satz", q.includes("Praxisgedächtnis"), q);
check("Name steht im Satz", q.includes("Meier"), q);
const q2 = nichtGefundenFrage("Kasper", { quelle: "in der Kartei, im Adressbuch, in E-Mails und Anrufen" });
check("lange Quelle bleibt lesbar", q2.includes("E-Mails") && q2.includes("Kasper"), q2);

console.log("3) Ohne Namen bleibt der Satz sprechbar");
for (const leer of ["", "   ", null, undefined]) {
  const l = nichtGefundenFrage(leer);
  check(`leerer Name (${JSON.stringify(leer)}) ergibt keinen Stolpersatz`,
    !/undefined|null|  /.test(l) && /buchstabieren/i.test(l), l);
}

console.log("4) KEIN Namensvorschlag — es wird nicht geraten");
// Gemessen 16.08.2026: "Transauer" liegt klanglich NAEHER an "Thermos" (0.80)
// als an der richtigen "Thrandorf" (0.67). Ein "Meinten Sie ...?" wuerde also
// die falsche Person anbieten — und Lisa koennte sie anrufen.
check("kein 'Meinten Sie'", !/meinten sie|meinen sie/i.test(s), s);

console.log("5) Keine zitierbare Beispielantwort");
// Das 4B-Modell uebernimmt Musterantworten woertlich statt die Frage zu stellen
// (dlg-korrektur-Regression, siehe disambiguationQuestion).
check("kein 'Sagen Sie:' / 'zum Beispiel'",
  !/sagen sie:|sag einfach|zum beispiel|z\. ?b\./i.test(s), s);

console.log("6) In den Tool-Routen ist keine Sackgasse mehr uebrig");
const quelle = fs.readFileSync(
  path.join(import.meta.dirname, "..", "src", "routes", "tools.js"), "utf8");
for (const sackgasse of [
  "Kein Patient mit dem Namen ${name} gefunden.",
  "Kein Patient mit dem Namen ${hint} gefunden.",
  "finde ich keinen Patienten im Praxisged",
]) {
  check(`kein '${sackgasse.slice(0, 42)}...' mehr`,
    !quelle.includes(sackgasse),
    "diese Antwort laesst den Anrufer ohne naechsten Schritt stehen");
}
check("der gemeinsame Satzbauer wird benutzt",
  (quelle.match(/nichtGefundenFrage\(/g) || []).length >= 7,
  `gefunden: ${(quelle.match(/nichtGefundenFrage\(/g) || []).length} von 7 Stellen`);

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
