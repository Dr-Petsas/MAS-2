// Test des Einrastens von Abrechnungspassagen auf den echten Satz.
//
// Anlass (Testlauf 09.08.2026): Das Modell soll die Abrechnungsanweisung
// WOERTLICH zitieren, wich aber ab — aus "Berechne das privat mit Faktor 3,5."
// wurde "Berechne das privat mit Fakt-3,5.". Die woertliche Suche fand nichts,
// also blieb die Abrechnungsanweisung in der BEHANDLUNGSDOKUMENTATION stehen
// (§ 630f: dort gehoert sie nicht hin) und der Abrechnungstext war verstuemmelt.
//
// Dieser Test kommt OHNE Modell aus und ist damit reproduzierbar.
// Aufruf: node backend/tests/test-abrechnung-einrasten.mjs

import { satzZuPassage } from "../src/clara/dokuAbrechnung.js";

let ok = 0;
let fail = 0;
function check(name, cond, info = "") {
  if (cond) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

const memo = "Zahn 36 Fuellung zweiflaechig okklusal-distal mit Composite, Infiltration, keine Besonderheiten. Berechne das privat mit Faktor 3,5.";

console.log("1) Der Fall aus dem Testlauf");
check("verstuemmelte Passage rastet auf den Originalsatz ein",
  satzZuPassage("Berechne das privat mit Fakt-3,5.", memo) === "Berechne das privat mit Faktor 3,5.",
  JSON.stringify(satzZuPassage("Berechne das privat mit Fakt-3,5.", memo)));
check("woertliche Passage findet denselben Satz",
  satzZuPassage("Berechne das privat mit Faktor 3,5.", memo) === "Berechne das privat mit Faktor 3,5.");

console.log("2) Weitere typische Modell-Abweichungen");
for (const abweichung of [
  "berechne das privat mit faktor 3,5",
  "Berechne das privat, Faktor 3,5.",
  "Berechne privat mit Faktor 3,5",
]) {
  check(`"${abweichung}"`,
    satzZuPassage(abweichung, memo) === "Berechne das privat mit Faktor 3,5.",
    JSON.stringify(satzZuPassage(abweichung, memo)));
}

console.log("3) Klinik-Schutz: klinische Saetze werden NIE herausgeloest");
check("klinischer Satz rastet nicht ein",
  satzZuPassage("Zahn 36 Fuellung zweiflaechig mit Composite.", memo) === "");
check("Anaesthesie rastet nicht ein",
  satzZuPassage("Infiltration, keine Besonderheiten.", memo) === "");
const nurKlinik = "PZR gemacht, Zahnfleisch reizlos, naechste Kontrolle in sechs Monaten.";
check("Memo ganz ohne Abrechnung liefert nichts",
  satzZuPassage("Berechne das privat.", nurKlinik) === "");

console.log("4) Zu wenig Uebereinstimmung bleibt unangetastet");
check("fremde Passage rastet nicht ein",
  satzZuPassage("Setze die Ziffer 2197 an.", memo) === "",
  JSON.stringify(satzZuPassage("Setze die Ziffer 2197 an.", memo)));
check("leere Passage", satzZuPassage("", memo) === "");
check("leeres Memo", satzZuPassage("Berechne das privat.", "") === "");

console.log("5) Mehrere Abrechnungssaetze: der passende gewinnt");
const memo2 = "Wurzelbehandlung 46, drei Kanaele. Berechne das privat mit Faktor 2,3. Den Kostenvoranschlag bitte an die Kasse.";
check("Faktor-Satz",
  satzZuPassage("Berechne das privat mit Faktor 2,3.", memo2) === "Berechne das privat mit Faktor 2,3.",
  JSON.stringify(satzZuPassage("Berechne das privat mit Faktor 2,3.", memo2)));
check("Kostenvoranschlag-Satz",
  satzZuPassage("Kostenvoranschlag an die Kasse.", memo2) === "Den Kostenvoranschlag bitte an die Kasse.",
  JSON.stringify(satzZuPassage("Kostenvoranschlag an die Kasse.", memo2)));
check("klinischer Satz bleibt tabu",
  satzZuPassage("Wurzelbehandlung 46, drei Kanaele.", memo2) === "");

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
