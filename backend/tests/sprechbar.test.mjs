import { test } from "node:test";
import assert from "node:assert/strict";
import { sprechbar } from "../src/clara/sprechbar.js";
import { namensTreffer } from "../src/clara/kontaktPruefung.js";
import { faelligSeit } from "../src/clara/gapFill.js";

test("Recall-Faelligkeit vs. letzter Besuch bei Kampagnen", () => {
  assert.equal(faelligSeit(20), "seit 20 Tagen fällig");
  assert.equal(faelligSeit(200), "seit etwa 7 Monaten fällig");
  assert.equal(faelligSeit(1920, "campaign"), "zuletzt vor etwa 5 Jahren da");
  assert.equal(faelligSeit(0, "campaign"), "");
});

test("Gespraechs-Report der TelefonKI wird sprechbar", () => {
  assert.equal(
    sprechbar("Heiko Reuber — Laut Anruf (Bianca): Heiko Reuber — Gespräch ohne Kalenderänderung."),
    "Heiko Reuber.");
  assert.equal(sprechbar("Laut Anruf (Bianca): Michael Petsas —"), "Michael Petsas");
  assert.equal(
    sprechbar("Um 9 Uhr: Laut Anruf (Lisa): Termin vereinbart am Montag."),
    "Um 9 Uhr: Termin vereinbart am Montag.");
});

test("Normale Saetze bleiben unveraendert", () => {
  const s = "Herr Reuber hat angerufen — er bittet um Rückruf. Die Rechnung über 29 Euro ist da.";
  assert.equal(sprechbar(s), s);
});

test("Betraege fliegen nur aus Uebersichten", () => {
  assert.equal(
    sprechbar("Rechnung von Anthropic über $25.00 ist eingegangen.", { ohneBetraege: true }),
    "Rechnung von Anthropic ist eingegangen.");
  assert.equal(sprechbar("Offen: 120,50 EUR Mahnung.", { ohneBetraege: true }), "Offen: Mahnung.");
  assert.equal(
    sprechbar("Ein Zahlungsbeleg von LiveKit im Betrag von $50.00. Bezahlt am Montag.", { ohneBetraege: true }),
    "Ein Zahlungsbeleg von LiveKit. Bezahlt am Montag.");
  assert.equal(sprechbar("Zahlung von 12 Euro erhalten.", { ohneBetraege: true }), "Zahlung erhalten.");
});

test("Firmenname getrennt oder zusammen geschrieben", () => {
  const e = { counterparty: { name: "smsflatrate.net" }, summary: "Rechnung" };
  assert.equal(namensTreffer("Firma SMS-Flatrate", e), 2);
  assert.equal(namensTreffer("SMS Flatrate", e), 2);
  assert.equal(namensTreffer("Signpeople", e), 0);
});
