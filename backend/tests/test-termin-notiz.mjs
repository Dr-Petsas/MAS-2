// Notiz ins Notizfeld des Termins (Chef-Wunsch 11.08.2026).
//
// Geprueft wird die Regel, mit der die Notiz an das vorhandene Notizfeld
// angehaengt wird. Sie ist bewusst als reine Funktion gebaut, damit sie ohne
// Datenbank und ohne Termine pruefbar ist.
//
// Das Wichtigste zuerst: Was die Praxis dort selbst eingetragen hat, darf NIE
// verschwinden. Ein ueberschriebenes Notizfeld waere schlimmer als gar keine
// Notiz.
import assert from "node:assert/strict";

import { notizAnhaengen, terminLabel } from "../src/clara/terminNotiz.js";

let fehler = 0;
function pruefe(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
  } catch (e) {
    console.log(`FEHL ${name}  -> ${e.message}`);
    fehler += 1;
  }
}

pruefe("leeres Feld: Notiz steht allein da", () => {
  assert.equal(notizAnhaengen("", "Braucht eine neue Schiene"),
    "Braucht eine neue Schiene (Clara)");
});

pruefe("vorhandener Text bleibt vollstaendig erhalten", () => {
  const alt = "Patient kommt mit Begleitung.";
  const neu = notizAnhaengen(alt, "Braucht eine neue Schiene");
  assert.ok(neu.startsWith(alt), "der alte Eintrag wurde angetastet");
  assert.ok(neu.includes("Braucht eine neue Schiene"), "die Notiz fehlt");
  assert.equal(neu.split("\n").length, 2, "die Notiz steht nicht in einer eigenen Zeile");
});

pruefe("mehrere Notizen sammeln sich, sie ersetzen sich nicht", () => {
  let feld = notizAnhaengen("", "Erste Sache");
  feld = notizAnhaengen(feld, "Zweite Sache");
  assert.ok(feld.includes("Erste Sache") && feld.includes("Zweite Sache"));
});

pruefe("dieselbe Notiz zweimal gesprochen ergibt keinen Doppeleintrag", () => {
  const einmal = notizAnhaengen("", "Braucht eine neue Schiene");
  const zweimal = notizAnhaengen(einmal, "Braucht eine neue Schiene");
  assert.equal(zweimal, einmal);
});

pruefe("Herkunft ist erkennbar", () => {
  assert.ok(notizAnhaengen("", "Test").includes("(Clara)"),
    "im Team muss erkennbar sein, woher der Eintrag stammt");
});

pruefe("leere Notiz aendert nichts", () => {
  assert.equal(notizAnhaengen("Bestand", "   "), "Bestand");
});

pruefe("Termin wird sprechbar benannt", () => {
  const d = new Date(2026, 8, 3, 9, 40); // 3. September 2026, 09:40
  assert.equal(terminLabel(d.getTime()), "3. September um 09:40 Uhr");
});

pruefe("ohne Zeitangabe kein erfundenes Datum", () => {
  assert.equal(terminLabel(0), "");
});

if (fehler) {
  console.log(`FAZIT: ${fehler} Fehler`);
  process.exit(1);
}
console.log("FAZIT: alles gruen");
