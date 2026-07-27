// ============================================================================
// Praxis-Verzeichnis: Kollegen werden gefunden (Chef-Vorfall 27.07.2026).
//
// "Wieso findet Clara die Kontaktdaten von Dr. Petsas nicht???" — weil es sie
// nirgends fest gab. Die Patientenkartei enthaelt gleichnamige Alt-Datensaetze
// ("Michael Petsas", "Dr. Petsas", "Michael Petsassss"), also fragte Clara
// zurueck statt zu antworten. Seitdem liegen die Aerzte im gepflegten
// Verzeichnis (mas_config/directory), und find_contact/contact_card lesen es
// VOR der Kartei — aber nur bei Titel-Anrede, damit ein Patient desselben
// Nachnamens weiterhin normal gefunden wird.
//
// Reine Logik-Pruefung ohne Firestore/Netz.
// ============================================================================
import { foldName, hasColleagueTitle, spokenDirectoryEntry } from "../src/clara/directory.js";

let fehler = 0;
function check(name, cond, detail = "") {
  if (cond) { console.log(`PASS  ${name}${detail ? "  -> " + detail : ""}`); return; }
  fehler += 1;
  console.log(`FEHL  ${name}${detail ? "  -> " + detail : ""}`);
}

// --- Namensfaltung: Titel und Anrede duerfen nicht stoeren -------------------
check("'Dr. Petsas' faltet auf 'petsas'", foldName("Dr. Petsas") === "petsas", foldName("Dr. Petsas"));
check("'Doktor Petsas' faltet gleich", foldName("Doktor Petsas") === "petsas");
check("'Herrn Dr. Patrikis' faltet auf 'patrikis'", foldName("Herrn Dr. Patrikis") === "patrikis", foldName("Herrn Dr. Patrikis"));
check("Vor- und Nachname bleiben erhalten", foldName("Dr. Michael Petsas") === "michael petsas", foldName("Dr. Michael Petsas"));
check("Umlaute werden gefaltet", foldName("Dr. Müller") === "mueller", foldName("Dr. Müller"));

// --- Titel-Erkennung: nur Kollegen bekommen Vorrang --------------------------
check("'Dr. Petsas' ist eine Kollegen-Anrede", hasColleagueTitle("Ruf Dr. Petsas an"));
check("'Doktor Patrikis' ist eine Kollegen-Anrede", hasColleagueTitle("Kontaktkarte von Doktor Patrikis"));
check("'Kollege Nikolaou' ist eine Kollegen-Anrede", hasColleagueTitle("Frag mal Kollege Nikolaou"));
check("Patient ohne Titel bekommt KEINEN Vorrang", !hasColleagueTitle("Kontaktkarte von Andreas Schumann"));
check("Nackter Nachname bekommt KEINEN Vorrang", !hasColleagueTitle("Petsas"));

// --- Gesprochene Kurzform ----------------------------------------------------
const petsas = { name: "Dr. Petsas", mobile: "0177 600 46 00", phone: "", email: "dr.petsas@med-dent.clinic" };
const gesprochen = spokenDirectoryEntry(petsas);
check("Mobilnummer wird genannt", gesprochen.includes("0177 600 46 00"), gesprochen);
check("E-Mail wird genannt", gesprochen.includes("dr.petsas@med-dent.clinic"));
check("Kein leeres Festnetz im Satz", !/Festnetz/.test(gesprochen));

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
process.exitCode = fehler === 0 ? 0 : 1;
