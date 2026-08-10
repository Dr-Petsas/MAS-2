/**
 * Test: Wiederholungslauf — aus dem Versprechen wird ein Nachweis.
 *
 * Bis zum 10.08.2026 stand im letzten Schritt der Improve-Seite nur eine
 * Ankuendigung ("sobald der Wiederholungslauf steht"). Jetzt gehen die
 * Aufnahmen des Anrufs erneut durch die heutige Erkennung, und damals steht
 * neben heute.
 *
 * Geprueft wird der reine Teil: der Vergleich zweier Hoerergebnisse, die
 * Frage "steckt der gemeinte Name heute drin?" und das Urteil in Worten.
 * Der Lauf selbst braucht Tonaufnahmen und den Erkennungsdienst und gehoert
 * deshalb nicht hierher.
 *
 * Aufruf:  node tests/test-wiederholung.mjs
 */
import { gleichGehoert, nameGetroffen, urteilWiederholung } from "../src/improve.js";

let ok = 0;
let fail = 0;
function pruefe(name, bedingung, info = "") {
  if (bedingung) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

console.log("1) Satzzeichen sind keine Aenderung");
// Real gemessen am Anruf vom 28.07.: Der Dienst setzt mal einen Punkt, mal
// ein Ausrufezeichen. Wuerde das als Aenderung gelten, waere der ganze
// Nachweis voller Fehlalarme.
pruefe("Punkt gegen Komma", gleichGehoert("Aus ZE bitte.", "Aus ZE, bitte."));
pruefe("Punkt gegen Ausrufezeichen",
  gleichGehoert("Ja, gib die Liste frei.", "Ja, gib die Liste frei!"));
pruefe("Gross- und Kleinschreibung", gleichGehoert("Morgen früh", "morgen FRÜH"));
pruefe("doppelte Leerzeichen", gleichGehoert("Aus  ZE bitte", "Aus ZE bitte"));

console.log("\n2) Echte Abweichungen werden erkannt");
pruefe("anderes Wort", gleichGehoert("Morgen früh", "Übermorgen früh") === false);
pruefe("fehlendes Wort", gleichGehoert("Bitte den Termin absagen", "Den Termin absagen") === false);
pruefe("leer gegen Text", gleichGehoert("Bitte", "") === false);

console.log("\n3) Steckt der gemeinte Name im Gehoerten?");
const richtig = nameGetroffen("Ouafa El Hajjami", "Ich möchte einen Termin für Ouafa El Hajjami");
pruefe("richtig gehoerter Name wird gefunden", richtig?.getroffen === true, JSON.stringify(richtig));
const falsch = nameGetroffen("Ouafa El Hajjami", "Hayla Elot Mani bitte");
pruefe("verhoerter Name wird NICHT als Treffer gewertet", falsch?.getroffen === false, JSON.stringify(falsch));
// Klangliche Naehe soll zaehlen — sonst faende der Nachweis nie eine Besserung.
const klang = nameGetroffen("Haila El Otmani", "Heyla El-Otmani am Telefon");
pruefe("klanglich gleicher Name zaehlt als Treffer", klang?.getroffen === true, JSON.stringify(klang));
pruefe("zu kurze Eingabe ergibt kein Urteil", nameGetroffen("ab", "irgendetwas") === null);
pruefe("ohne Namen kein Urteil", nameGetroffen("", "Ouafa El Hajjami") === null);

console.log("\n4) Das Urteil sagt die Wahrheit, auch die unbequeme");
const nichts = urteilWiederholung({ geprueft: 0 });
pruefe("nichts pruefbar", nichts.art === "nichts");

// Der wichtigste Fall: Es hat sich NICHTS gebessert. Das muss klar dastehen,
// sonst waere der Nachweis eine Beruhigungspille.
const gleich = urteilWiederholung({ geprueft: 8, anders: 0 });
pruefe("unveraendert wird als Fehler benannt", gleich.art === "unveraendert");
pruefe("und sagt, dass der Fehler noch da ist", gleich.text.includes("noch da"), gleich.text);

const teils = urteilWiederholung({ geprueft: 8, anders: 3 });
pruefe("Aenderungen werden gezaehlt", teils.art === "veraendert" && teils.text.includes("3 von 8"), teils.text);

// Damals kam der Name an, heute nicht mehr: Das ist ein echter Rueckschritt
// und muss offen heissen.
const offen = urteilWiederholung({ geprueft: 8, gemeinterName: "Ouafa El Hajjami", damalsSchonDa: true });
pruefe("Name weiterhin nicht getroffen -> offen", offen.art === "offen");
pruefe("und nennt den Namen", offen.text.includes("Ouafa El Hajjami"), offen.text);

// Der Anruf, an dem es aufgefallen ist: "Ouafa El Hajjami" kommt dort weder
// damals noch heute vor. Zu behaupten, der Fehler bestehe weiter, waere
// falsch — der Fall gehoert zu einem anderen Gespraech.
const fremd = urteilWiederholung({ geprueft: 8, anders: 3, gemeinterName: "Ouafa El Hajjami", nieVorgekommen: true });
pruefe("Name gar nicht im Anruf -> kein falscher Alarm", fremd.art === "nichts", fremd.art);
pruefe("und sagt, dass es ein anderes Gespraech ist",
  fremd.text.includes("anderen Gespräch"), fremd.text);

// Kam der Name schon damals richtig an, war das Hoeren nie das Problem.
const nieFehler = urteilWiederholung({
  geprueft: 8, gemeinterName: "Ouafa El Hajjami", damalsSchonDa: true,
  namensTreffer: { seq: 2, punkte: 16, heute: "Ouafa El Hajjami" },
});
pruefe("damals wie heute richtig -> kein Erfolg vortaeuschen",
  nieFehler.art === "unveraendert", nieFehler.art);

const geloest = urteilWiederholung({
  geprueft: 8, anders: 2, gemeinterName: "Ouafa El Hajjami",
  namensTreffer: { seq: 4, punkte: 16, heute: "Ouafa El Hajjami" },
});
pruefe("Name jetzt getroffen -> geloest", geloest.art === "geloest");
// Der Namenstreffer schlaegt die blosse Wortzaehlung: Darum ging es dem Kunden.
pruefe("Namenstreffer geht der Wortzaehlung vor", geloest.text.includes("richtig gehört"), geloest.text);

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
