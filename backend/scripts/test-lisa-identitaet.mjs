// Prueft Lisas Identitaet: Absendername und Identitaets-Rahmen (Chef 18.08.2026).
//
// Anforderung im Wortlaut: "lisa muss sich von der richtigen praxis unter dem
// richtigen doktor melden, die sms brauchen den praxisnamen als absender."
//
// Vorher war beides falsch: Lisas Agenten-Prompt trug eine FESTE Praxis
// ("Telefonassistentin von Dr. Petsas") und jede SMS ging unter einem globalen
// Absender aus der Umgebung raus. Dieser Test haelt die Korrektur fest — er
// braucht kein Firestore, keine Twilio-Zugaenge und kein Netz.
//
//   node scripts/test-lisa-identitaet.mjs

import {
  smsAbsenderAus, absenderSaeubern, umschrift, identitaetsRahmen,
} from "../src/lisa/identitaet.js";

let ok = 0;
let fehl = 0;
function pruef(name, bedingung, gefunden) {
  if (bedingung) { ok += 1; console.log(`  ok   ${name}`); }
  else { fehl += 1; console.log(`  FEHL ${name}${gefunden === undefined ? "" : ` -> ${JSON.stringify(gefunden)}`}`); }
}

console.log("1) Umschrift: Umlaute werden lesbar, nicht verstuemmelt");
pruef("Mueller statt Mller", umschrift("Müller") === "Mueller", umschrift("Müller"));
pruef("Oesterreich", umschrift("Österreich") === "Oesterreich", umschrift("Österreich"));
pruef("Strasse aus ss", umschrift("Straße") === "Strasse", umschrift("Straße"));
pruef("Leerwert bleibt leer", umschrift(null) === "");

console.log("2) SMS-Absender aus dem Praxisnamen");
const faelle = [
  ["Zahnarztpraxis Seeblick", "Seeblick"],
  ["Praxis Dr. Petsas", "Petsas"],
  ["Praxis Dr. Müller & Kollegen", "Mueller"],
  ["Dr. med. dent. Anna Bergmann", "Bergmann"],
  ["Zahnärzte am Marktplatz", "Marktplatz"],
  ["MVZ Zahnheilkunde Nord", "Nord"],
];
for (const [rein, raus] of faelle) {
  const wert = smsAbsenderAus(rein);
  pruef(`"${rein}" -> "${raus}"`, wert === raus, wert);
}

console.log("3) Absender haelt den SMS-Standard ein");
const lang = smsAbsenderAus("Zahnarztpraxis Wolkenkuckucksheimhausen");
pruef("nie mehr als 11 Zeichen", lang.length <= 11 && lang.length > 0, lang);
pruef("nur Buchstaben und Ziffern", /^[0-9A-Za-z]+$/.test(lang), lang);
pruef("Umlaut wird umgeschrieben, nicht geloescht",
  smsAbsenderAus("Praxis Zähne") === "Zaehne", smsAbsenderAus("Praxis Zähne"));
// Reine Ziffern wuerden von Twilio als Rufnummer gelesen und abgelehnt.
pruef("reine Ziffern ergeben keinen Absender", smsAbsenderAus("12345") === "", smsAbsenderAus("12345"));
pruef("leerer Name ergibt keinen Absender", smsAbsenderAus("") === "");
pruef("nur Fuellwoerter ergeben trotzdem Praxisbezug",
  smsAbsenderAus("Zahnarztpraxis") === "Zahnarztpra", smsAbsenderAus("Zahnarztpraxis"));

console.log("4) Eingestellte Absender bleiben stehen, statt umgedeutet zu werden");
// BEFUND 18.08.2026 an echten Daten: Die Live-Praxis heisst "med dent
// Zahnklinik", ihr eingestellter Absender ist "med dent". Wuerde ein
// eingestellter Wert durch die Wortsuche laufen, blieben davon nur "dent" —
// und der Absender aller laufenden Patienten-SMS haette sich ungefragt geaendert.
pruef("'med dent' bleibt 'med dent'", absenderSaeubern("med dent") === "med dent", absenderSaeubern("med dent"));
pruef("Wortsuche wuerde es verstuemmeln (deshalb getrennt)", smsAbsenderAus("med dent") !== "med dent");
pruef("Umlaut im eingestellten Namen wird umgeschrieben",
  absenderSaeubern("Zähne24") === "Zaehne24", absenderSaeubern("Zähne24"));
pruef("zu lang wird auf 11 Zeichen gekuerzt",
  absenderSaeubern("Praxisgemeinschaft").length === 11, absenderSaeubern("Praxisgemeinschaft"));
pruef("Sonderzeichen fliegen raus", absenderSaeubern("Dr.Müller!") === "Dr Mueller", absenderSaeubern("Dr.Müller!"));
pruef("nichts Brauchbares ergibt leer", absenderSaeubern("+++") === "");

console.log("5) Identitaets-Rahmen fuer den Anruf");
const mitArzt = identitaetsRahmen({ praxisName: "Zahnarztpraxis Seeblick", behandler: "Dr. Wieland" });
pruef("nennt die Praxis", mitArzt.includes("Zahnarztpraxis Seeblick"));
pruef("nennt den Behandler", mitArzt.includes("Dr. Wieland"));
pruef("verbietet eine andere Praxis", /NIE eine andere/.test(mitArzt));
pruef("ist als nicht vorzulesen gekennzeichnet", /NICHT vorlesen/.test(mitArzt));

const ohneArzt = identitaetsRahmen({ praxisName: "Praxis am Park" });
pruef("ohne Behandler wird kein Arzt erfunden", /erfinde keinen Arztnamen/.test(ohneArzt));
pruef("ohne Behandler steht kein 'undefined' drin", !/undefined|null/.test(ohneArzt), ohneArzt);

// Ohne Praxisnamen darf NICHTS behauptet werden: ein leerer Rahmen laesst den
// Auftrag unveraendert, statt Lisa eine erfundene Praxis in den Mund zu legen.
pruef("ohne Praxisname bleibt der Rahmen leer", identitaetsRahmen({}) === "");
pruef("ohne Argument bleibt der Rahmen leer", identitaetsRahmen(undefined) === "");

console.log("");
if (fehl) {
  console.log(`ERGEBNIS: ${ok} ok, ${fehl} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
