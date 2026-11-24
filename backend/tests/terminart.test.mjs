// Terminart aus dem gesprochenen Namen (24.11.2026: "Kontrolle" fand "KCH Kontrolluntersuchung" nicht,
// die Slot-Suche meldete "alles belegt" bei zwanzig freien Zeiten). Ohne Firestore.
import assert from "node:assert/strict";
import { resolveVisitMotive } from "../src/clara/visitMotive.js";

const booking = {
  visitMotives: [
    { id: "k", name: "KCH Kontrolluntersuchung" },
    { id: "p", name: "PRO professionelle Zahnreinigung" },
    { id: "b", name: "Besprechung" },
    { id: "i1", name: "Implantat Beratung" },
    { id: "i2", name: "Implantat Kontrolle nach OP" },
  ],
};
const id = (name) => resolveVisitMotive(booking, name)?.id ?? null;

assert.equal(id("KCH Kontrolluntersuchung"), "k", "genauer Name");
assert.equal(id("Zahnreinigung"), "p", "Teil des Namens (wie bisher)");
assert.equal(id("Kontrolluntersuchung"), "k", "Teil des Namens (wie bisher)");
assert.equal(id("Kontrolltermin"), null, "zwei Terminarten beginnen so: keine Wahl");
assert.equal(id("Besprechungstermin"), "b", "gleicher Wortanfang");
assert.equal(id("Implantate"), null, "zwei Terminarten passen: keine Wahl");
assert.equal(id("Wurzelbehandlung"), null, "unbekannt bleibt unbekannt");
assert.equal(id(""), null, "leer");
// "Kontrolle" steckt woertlich in "Implantat Kontrolle nach OP" -> Teiltreffer gewinnt wie bisher.
assert.equal(id("Kontrolle"), "i2", "woertlicher Teiltreffer geht vor");
const ohneImpl = { visitMotives: booking.visitMotives.slice(0, 3) };
assert.equal(resolveVisitMotive(ohneImpl, "Kontrolle")?.id, "k", "Vorfall 24.11.: Kontrolle -> KCH Kontrolluntersuchung");
assert.equal(resolveVisitMotive(ohneImpl, "eine Kontrolle")?.id, "k", "mit Artikel");
assert.equal(resolveVisitMotive(ohneImpl, "Kontrolltermin")?.id, "k", "gleicher Wortanfang, genau eine Terminart");

console.log("terminart: alle Faelle gruen");
