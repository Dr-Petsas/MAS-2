// Kontaktkarte: Nummer und Mail sind antippbar (tel:/mailto), Text bleibt Ziffern.
// Anlass: Chef 14.08.2026, Flip-Rueckseite nach contact_card.

import { karteKontakt } from "../src/clara/karten.js";

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
check("Mobil bleibt als Ziffern lesbar", mobil?.text === "Mobil: 0171 1234567");
check("Mobil ist anrufbar", mobil?.href === "tel:01711234567");
check("Festnetz ist anrufbar", fest?.href === "tel:+49211123456");
check("E-Mail ist oeffenbar", mail?.href === "mailto:lydia@example.com");

const leer = karteKontakt({ name: "Ohne Daten" });
check("ohne Daten kein Link", leer.items.every((i) => !i.href));
check("Schrott-Mail kein Link", !karteKontakt({ email: "nicht-anmailen" }).items.some((i) => i.href));

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
