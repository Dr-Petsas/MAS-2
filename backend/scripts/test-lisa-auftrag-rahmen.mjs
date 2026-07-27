// Auftrags-Rahmen fuer Lisa (27.07.2026).
//
// Vorfall (Live 19:57): Auftrag "Es ist gleich 20 Uhr." — Lisa sagte am Telefon
// das TERMIN-BEISPIEL aus ihrem Agenten-Prompt ("Ich rufe an, weil wir Ihren
// Termin gerne vorverlegen würden ..."). Termin-freie Auftraege bekommen jetzt
// eine Regieanweisung mit; Termin-/Recall-Auftraege bleiben unangetastet, damit
// die Terminlogik des Agenten weiter greift.
import { rahmeAuftrag } from "../src/lisa/outbound.js";

let fehler = 0;
function check(name, ok, info = "") {
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${info ? "  -> " + info : ""}`);
  if (!ok) fehler += 1;
}

const kurz = rahmeAuftrag("Es ist gleich 20 Uhr.");
check("termin-freier Auftrag bekommt die Regieanweisung",
  /Regieanweisung/.test(kurz) && /nichts.*mit Terminen/i.test(kurz));
check("der Auftragstext steht unveraendert vorn",
  kurz.startsWith("Es ist gleich 20 Uhr."), kurz.slice(0, 40));
check("Regieanweisung ist als nicht vorzulesen markiert",
  /NICHT vorlesen/.test(kurz));

for (const terminauftrag of [
  "Sag ihm, dass wir seinen Termin am Donnerstag verschieben muessen.",
  "Bitte den Recall-Termin zur Kontrolle anbieten.",
  "Der Termin morgen ist abgesagt.",
  "Erinnere ihn an die Prophylaxe naechste Woche.",
]) {
  check(`Termin-Auftrag bleibt unberuehrt: ${terminauftrag.slice(0, 34)}…`,
    rahmeAuftrag(terminauftrag) === terminauftrag);
}

check("leerer Auftrag bleibt leer", rahmeAuftrag("") === "");
check("private Besorgung bekommt den Rahmen",
  /Regieanweisung/.test(rahmeAuftrag("Herr Petsas holt gleich zwei Kilo Lammkoteletts ab.")));

console.log(fehler ? `\n${fehler} Pruefung(en) fehlgeschlagen.` : "\nAlle Pruefungen bestanden.");
process.exitCode = fehler ? 1 : 0;
