// Prueft das Tor zur Erlebnis-Demo (Chef 18.08.2026): Handynummer, E-Mail,
// Behandlername. Reine Logik, kein Firestore, kein Netz, keine SMS.
//
//   node scripts/test-demo-tor.mjs

import { handyE164, istEmail, behandlerVorschlag, websiteHaltbar } from "../src/demo/tor.js";
import { smsAbsenderAus, absenderSaeubern, identitaetsRahmen } from "../src/lisa/identitaet.js";

let ok = 0;
let fehl = 0;
function pruef(name, bedingung, gefunden) {
  if (bedingung) { ok += 1; console.log(`  ok   ${name}`); }
  else { fehl += 1; console.log(`  FEHL ${name}${gefunden === undefined ? "" : ` -> ${JSON.stringify(gefunden)}`}`); }
}

console.log("1) Handynummern werden erkannt und vereinheitlicht");
const gut = [
  ["0151 234 5678", "+491512345678"],
  ["+49 151 2345678", "+491512345678"],
  ["0049 176 12345678", "+4917612345678"],
  ["0176-1234567", "+491761234567"],
  ["(0170) 123 45 67", "+491701234567"],
  ["+43 664 1234567", "+436641234567"],
  ["+41 79 123 45 67", "+41791234567"],
];
for (const [rein, raus] of gut) {
  const wert = handyE164(rein);
  pruef(`"${rein}" -> ${raus}`, wert === raus, wert);
}

console.log("2) Was KEIN Handy ist, wird abgelehnt");
// Festnetz muss durchfallen: eine SMS dorthin kommt nie an, und der Besucher
// haelt danach die Demo fuer kaputt statt die Nummer fuer falsch.
const schlecht = ["030 123456", "0211 30293029", "+1 555 0100", "abc", "", null, "01512", "+4915"];
for (const rein of schlecht) {
  pruef(`abgelehnt: ${JSON.stringify(rein)}`, handyE164(rein) === "", handyE164(rein));
}

console.log("3a) Praxiswebseite");
pruef("www.praxis.de gilt", websiteHaltbar("www.praxis.de").includes("praxis.de"));
pruef("https://zahnarzt-berlin.de gilt", websiteHaltbar("https://zahnarzt-berlin.de").includes("zahnarzt-berlin.de"));
pruef("ohne Punkt faellt durch", websiteHaltbar("praxis") === "");
pruef("leer faellt durch", websiteHaltbar("") === "");

console.log("3) E-Mail-Plausibilitaet");
pruef("normale Adresse", istEmail("dr.petsas@pickadoc.de"));
pruef("ohne Punkt in der Domain faellt durch", !istEmail("chef@localhost"));
pruef("ohne @ faellt durch", !istEmail("pickadoc.de"));
pruef("leer faellt durch", !istEmail(""));

console.log("4) Behandlername — niemand soll ihn tippen muessen");
pruef("aus Vor- und Nachname wird Dr. Nachname",
  behandlerVorschlag({ vorname: "Michael", name: "Petsas" }) === "Dr. Petsas",
  behandlerVorschlag({ vorname: "Michael", name: "Petsas" }));
pruef("vorhandener Titel bleibt unangetastet",
  behandlerVorschlag({ name: "Dr. Anna Bergmann" }) === "Dr. Anna Bergmann");
pruef("eigene Eingabe gewinnt immer",
  behandlerVorschlag({ name: "Petsas", behandler: "Frau Dr. Klein" }) === "Frau Dr. Klein");
pruef("ohne Namen wird nichts erfunden", behandlerVorschlag({}) === "");

// Der Kern der Anforderung, an einer Stelle nachgerechnet: "lisa muss sich von
// der richtigen praxis unter dem richtigen doktor melden, die sms brauchen den
// praxisnamen als absender." Hier wird genau die Kette geprueft, die
// routes/demo.js fuer einen Besucher durchlaeuft — vom eingetippten Praxisnamen
// bis zu dem Satz, mit dem Lisa beauftragt wird.
console.log("5) Was der Besucher eintippt, kommt bei Lisa an");
const besucher = [
  { praxis: "Zahnärzte am Löwentor", vorname: "Nikolaos", name: "Özdemir" },
  { praxis: "Praxis für Zahnheilkunde Groß & Partner", vorname: "Eva", name: "Groß" },
  { praxis: "MVZ Süd", name: "Weiß", behandler: "Frau Dr. Weiß" },
];
for (const lead of besucher) {
  // Genau die Reihenfolge aus routes/demo.js -> absenderFuer().
  const absender = smsAbsenderAus(lead.praxis) || absenderSaeubern(lead.praxis) || "Pickadoc";
  const behandler = lead.behandler || behandlerVorschlag(lead);
  const rahmen = identitaetsRahmen({ praxisName: lead.praxis, behandler });

  pruef(`"${lead.praxis}" -> Absender "${absender}"`,
    absender.length > 0 && absender.length <= 11, absender);
  pruef("  Absender ohne Umlaute und Sonderzeichen",
    /^[A-Za-z0-9]+$/.test(absender), absender);
  pruef(`  Behandler "${behandler}"`, behandler.length > 0, behandler);
  pruef("  Auftrag nennt die Praxis des Besuchers", rahmen.includes(lead.praxis));
  pruef("  Auftrag nennt den Behandler", rahmen.includes(behandler));
  // Der Grund fuer die ganze Uebung: im Agenten-Prompt stand fest "Dr. Petsas".
  pruef("  keine fremde Praxis im Auftrag", !/Petsas/.test(rahmen));
}

console.log("");
if (fehl) {
  console.log(`ERGEBNIS: ${ok} ok, ${fehl} FEHLGESCHLAGEN`);
  process.exitCode = 1;
} else {
  console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
}
