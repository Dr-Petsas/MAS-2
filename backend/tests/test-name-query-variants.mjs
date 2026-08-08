// Test der Suchvarianten fuer gesprochene Patientennamen.
//
// Anlass (Live-Anruf Dr. Petsas 04.08.2026): Die Suche nach "Ouafa El Hajjami"
// lieferte NULL Treffer — auch nach "El Hajjami" und "Hajjami". Nur der
// Vorname allein fand die Patientin. Clara drehte sich minutenlang im Kreis und
// bot immer wieder dieselben falschen "El"-Treffer an. Dieser Test haelt fest,
// dass aus einem gesprochenen Namen mehrere sinnvolle Zuschnitte entstehen.
//
// Aufruf: node backend/tests/test-name-query-variants.mjs

import { nameQueryVariants } from "../src/clara/agentBooking.js";

let ok = 0;
let fail = 0;

function check(name, cond, info = "") {
  if (cond) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

console.log("1) Mehrteiliger Nachname mit Namensteilchen");
const v1 = nameQueryVariants("Ouafa El Hajjami");
check("ganzer Name bleibt erste Variante", v1[0] === "Ouafa El Hajjami", JSON.stringify(v1));
check("Nachnamen-Kern wird eigene Variante", v1.includes("Hajjami"), JSON.stringify(v1));
check("Vorname wird eigene Variante", v1.includes("Ouafa"), JSON.stringify(v1));
check("hoechstens drei Abfragen", v1.length <= 3, JSON.stringify(v1));
check("Teilchen 'El' ist KEINE eigene Abfrage", !v1.includes("El"), JSON.stringify(v1));

console.log("2) Weitere Namensteilchen");
for (const [gesprochen, kern] of [
  ["Jan van der Berg", "Berg"],
  ["Maria de Souza", "Souza"],
  ["Hassana El Makhoukhi", "Makhoukhi"],
  ["Ali Ben Youssef", "Youssef"],
]) {
  const v = nameQueryVariants(gesprochen);
  check(`${gesprochen} -> Kern ${kern}`, v.includes(kern), JSON.stringify(v));
  check(`${gesprochen} -> kein Teilchen allein`,
    !v.some((x) => ["van", "der", "de", "el", "ben"].includes(x.toLowerCase())), JSON.stringify(v));
}

console.log("3) Einfache Faelle bleiben eine einzige Abfrage");
check("nur Nachname", JSON.stringify(nameQueryVariants("Thermos")) === JSON.stringify(["Thermos"]));
check("Vor- und Nachname liefert Zuschnitte",
  nameQueryVariants("Levi Tzannis").length === 3, JSON.stringify(nameQueryVariants("Levi Tzannis")));

console.log("4) Leere und unbrauchbare Eingaben");
check("leer", nameQueryVariants("").length === 0);
check("nur Leerzeichen", nameQueryVariants("   ").length === 0);
check("nur Satzzeichen", nameQueryVariants("?!.").length === 0);
check("ein Buchstabe", nameQueryVariants("A").length === 0);

console.log("5) Doppelte Zuschnitte werden nicht doppelt abgefragt");
const v5 = nameQueryVariants("Thermos Thermos");
check("keine Dubletten", new Set(v5.map((x) => x.toLowerCase())).size === v5.length, JSON.stringify(v5));

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
