/**
 * Test: Wann gilt ein Katalog-Treffer als EINDEUTIG?
 *
 * Anlass (09.08.2026): Die neue Hoerprobe hat an echtem Anrufton einen
 * gefaehrlichen Fehler zutage gefoerdert. Wird die Wortgrenze verhoert
 * ("Hayla Elot Mani" statt "Haila El Otmani"), erreichte die voellig fremde
 * Patientin "Ahlam El Mouhmouh" durch einen Klang-Zufall 10 Punkte, die
 * naechsten Kandidaten 8 — und das galt als eindeutig. Clara haette ohne
 * jede Rueckfrage bei der falschen Person gehandelt.
 *
 * Regel seit diesem Test: Gewissheit braucht Abstand. Ein knapper Vorsprung
 * ist Rauschen, kein Wissen.
 *
 * Aufruf:  node tests/test-eindeutigkeit.mjs
 */
import { katalogtrefferIstEindeutig } from "../src/clara/agentBooking.js";

let ok = 0;
let fail = 0;
function pruefe(name, bedingung, info = "") {
  if (bedingung) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

console.log("1) Der echte Fehlerfall vom 04.08. darf NIE eindeutig sein");
// So sah es wirklich aus, nachgestellt aus dem Katalog:
const fehlfall = [
  { f: "Ahlam", l: "El Mouhmouh", score: 10 },
  { f: "Mina", l: "El Baroudi", score: 8 },
  { f: "Ilias", l: "El Hajjami", score: 8 },
  { f: "Naima", l: "El Kirate", score: 8 },
];
pruefe("knapper Vorsprung gilt nicht als Gewissheit",
  katalogtrefferIstEindeutig(fehlfall) === false);

console.log("\n2) Die echten Volltreffer bleiben eindeutig");
// Beide an echtem Anrufton geprueft — hier darf Clara NICHT nachfragen,
// sonst kehrt die Rueckfragerei zurueck, ueber die sich der Chef beschwert hat.
pruefe("Haila El Otmani (16 Punkte, kein Verfolger)",
  katalogtrefferIstEindeutig([{ l: "El Otmani", score: 16 }]) === true);
pruefe("Ouafa El Hajjami (16 Punkte, kein Verfolger)",
  katalogtrefferIstEindeutig([{ l: "El Hajjami", score: 16 }]) === true);
pruefe("klarer Vorsprung von 16 auf 8",
  katalogtrefferIstEindeutig([{ score: 16 }, { score: 8 }]) === true);

console.log("\n3) Die Grenze liegt bei vier Punkten");
pruefe("Abstand 4 reicht", katalogtrefferIstEindeutig([{ score: 13 }, { score: 9 }]) === true);
pruefe("Abstand 3 reicht nicht", katalogtrefferIstEindeutig([{ score: 12 }, { score: 9 }]) === false);
pruefe("Abstand 2 reicht nicht", katalogtrefferIstEindeutig([{ score: 10 }, { score: 8 }]) === false);
// Erreichen ZWEI Kandidaten die Schwelle, sind es zwei ernsthaft moegliche
// Personen — dann wird gefragt, auch wenn einer vorn liegt.
pruefe("zwei starke Kandidaten trotz Abstand nicht eindeutig",
  katalogtrefferIstEindeutig([{ score: 14 }, { score: 10 }]) === false);

console.log("\n4) Namensvettern fuehren zur Rueckfrage");
// Zwei echte Personen mit gleichem Namen: Da MUSS Clara fragen.
pruefe("zwei gleich starke Treffer sind nicht eindeutig",
  katalogtrefferIstEindeutig([{ score: 16 }, { score: 16 }]) === false);
pruefe("zwei starke Treffer, auch bei kleinem Unterschied",
  katalogtrefferIstEindeutig([{ score: 16 }, { score: 14 }]) === false);

console.log("\n5) Schwache Treffer sind nie eindeutig");
pruefe("bester Treffer unter der Schwelle",
  katalogtrefferIstEindeutig([{ score: 9 }, { score: 5 }]) === false);
pruefe("nur schwache Treffer", katalogtrefferIstEindeutig([{ score: 8 }]) === false);

console.log("\n6) Grenzfaelle stuerzen nicht ab");
pruefe("leere Liste", katalogtrefferIstEindeutig([]) === false);
pruefe("null", katalogtrefferIstEindeutig(null) === false);
pruefe("Eintrag ohne Punkte", katalogtrefferIstEindeutig([{}]) === false);

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
