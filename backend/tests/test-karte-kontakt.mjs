// Kontaktkarte: Nummer und Mail sind antippbar (tel:/mailto), Text bleibt Ziffern.
// Anlass: Chef 14.08.2026, Flip-Rueckseite nach contact_card.

import { karteKontakt, karteLisaSms, nummerAnzeige, nummerImText } from "../src/clara/karten.js";

let ok = 0;
let fail = 0;
function check(name, cond, info = "") {
  if (cond) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

const k = karteKontakt({
  name: "Lydia Muhamedjanowa",
  mobile: "0171 1234567",
  phone: "+49 211 123456",
  email: "lydia@example.com",
  pushed: true,
});

const mobil = k.items.find((i) => String(i.text).startsWith("Mobil"));
const fest = k.items.find((i) => String(i.text).startsWith("Festnetz"));
const mail = k.items.find((i) => String(i.text).includes("@"));

check("Titel ist der Name", k.title.includes("Muhamedjanowa"));
check("Mobil bleibt als Ziffern lesbar, in Gruppen", mobil?.text === "Mobil: 0171 123 45 67", mobil?.text);
check("Festnetz +49 wird zur Null", fest?.text === "Festnetz: 0211 123 456", fest?.text);
check("Unterzeile sagt, was der Tipp tut", k.subtitle.includes("antippen"));
check("Mobil ist anrufbar", mobil?.href === "tel:01711234567");
check("Festnetz ist anrufbar", fest?.href === "tel:+49211123456");
check("E-Mail ist oeffenbar", mail?.href === "mailto:lydia@example.com");

// Gespraech 26.11.2026: die Nummer stand als +4917661520421 auf der Karte.
check("Anzeige +49 Mobil", nummerAnzeige("+4917661520421") === "0176 615 204 21", nummerAnzeige("+4917661520421"));
check("Anzeige Festnetz mit Schraegstrich", nummerAnzeige("030/1234567") === "030 123 45 67", nummerAnzeige("030/1234567"));
check("Anzeige Ausland behaelt Plus", nummerAnzeige("+43 660 1234567").startsWith("+43 "), nummerAnzeige("+43 660 1234567"));
check("Anzeige laesst Unklares stehen", nummerAnzeige("intern 12") === "intern 12");
check("Nummer im Text", nummerImText("Rückruf erbeten. Tel: +4915758270888. (Anmeldung)") === "+4915758270888");
check("Nummer im Text mit Leerzeichen", nummerImText("Mobil 0176 615 204 21, abends") === "017661520421");
check("Datum ist keine Nummer", nummerImText("geboren 03.05.1971, Termin 09:15") === "");
check("Betrag ist keine Nummer", nummerImText("Gesamt 1.234,50 Euro, 28 Zähne, 2026-11-27") === "");
const sms = karteLisaSms({ contactName: "Erika Beispiel", phone: "+4917661520421", body: "Bitte melden." });
const smsZeile = sms.items.find((i) => String(i.text).startsWith("Nummer"));
check("Lisa-SMS-Karte: Nummer anwaehlbar", smsZeile?.href === "tel:+4917661520421", JSON.stringify(smsZeile));
check("Zeile ohne Nummer bleibt ohne Link", sms.items.filter((i) => i.href).length === 1);

const leer = karteKontakt({ name: "Ohne Daten" });
check("ohne Daten kein Link", leer.items.every((i) => !i.href));
check("Schrott-Mail kein Link", !karteKontakt({ email: "nicht-anmailen" }).items.some((i) => i.href));

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
