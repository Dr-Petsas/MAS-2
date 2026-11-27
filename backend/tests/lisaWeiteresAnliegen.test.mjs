// Ein Anliegen neben dem Auftrag (`weiteres_anliegen`): der Eintrag bleibt fuer die Praxis offen, auch bei `termin`.
// Reine Funktionen, ohne Datenbank.
import test from "node:test";
import assert from "node:assert/strict";
import { pruefeAnruf, eintragAus, itemAus, istOffen, lisaAnrufeFuerSeite } from "../src/brain/lisaAnrufe.js";
import { kontextZeile } from "../src/bianca/callerContext.js";

const WUNSCH = "Ich brauche noch ein Rezept für meine Schmerztabletten.";
const AUFTRAG = { art: "recall", ziel: "Kontrolltermin vereinbaren", arzt: "Dr. Muster", behandlungsart: { id: "g1", name: "Kontrolluntersuchung" } };

function eintrag(mehr = {}) {
  const p = pruefeAnruf({
    anruf_id: "weiter-1", nummer: "+491700000302", beginn: Date.UTC(2026, 10, 27, 1, 0), erreicht: "person", ausgang: "termin",
    anlass: "Kontrolluntersuchung", behandler: "Dr. Muster", patient: { vorname: "Michael", nachname: "Petsas" },
    termin: { datum: "2026-12-02", uhrzeit: "10:30", behandler: "Dr. Muster" }, auftrag: AUFTRAG, ...mehr,
  });
  assert.equal(p.ok, true, p.klartext);
  return { id: p.anruf.kennung, ...eintragAus("zzz-ohne-datenbank", p.anruf) };
}

test("Termin mit weiterem Anliegen: der Eintrag bleibt offen, das Anliegen steht im Item, aufgreifen bleibt false", () => {
  const e = eintrag({ weiteres_anliegen: WUNSCH });
  assert.equal(e.status, "open");
  assert.equal(istOffen(e.anruf), true);
  const item = itemAus(e);
  assert.equal(item.ausgang, "termin");
  assert.equal(item.weiteres_anliegen, WUNSCH);
  assert.equal(item.auftrag.aufgreifen, false);
  assert.equal(item.beim_rueckruf, "");
});

test("ohne das Feld bleibt alles wie bisher: Termin ist nicht offen", () => {
  for (const mehr of [{}, { weiteres_anliegen: "" }, { weiteres_anliegen: "   " }, { weiteres_anliegen: null }]) {
    const e = eintrag(mehr);
    assert.notEqual(e.status, "open");
    assert.equal(itemAus(e).weiteres_anliegen, "");
    assert.equal(kontextZeile(e).includes("weiteres Anliegen"), false);
  }
});

test("im Text an Bianca steht das weitere Anliegen als Tatsache, ohne Auftrag zum Termin", () => {
  const zeile = kontextZeile(eintrag({ weiteres_anliegen: WUNSCH }));
  assert.ok(zeile.includes(`Dabei kam ein weiteres Anliegen zur Sprache, das die Praxis noch klären muss: „${WUNSCH}“`), zeile);
  assert.equal(zeile.includes("biete den Termin jetzt selbst an"), false);
});

test("abgebrochen mit weiterem Anliegen: Auftrag wird aufgegriffen und das Anliegen steht daneben", () => {
  const e = eintrag({ ausgang: "abgebrochen", termin: undefined, weiteres_anliegen: WUNSCH });
  const item = itemAus(e);
  assert.equal(item.auftrag.aufgreifen, true);
  assert.equal(item.weiteres_anliegen, WUNSCH);
  const zeile = kontextZeile(e);
  assert.ok(zeile.includes("biete den Termin jetzt selbst an") && zeile.includes(WUNSCH), zeile);
});

test("die Clara-Seite zeigt den Termin-Eintrag unter offen, mit dem Anliegen", () => {
  const { offen } = lisaAnrufeFuerSeite([eintrag({ weiteres_anliegen: WUNSCH }), eintrag({ anruf_id: "weiter-2" })]);
  assert.equal(offen.length, 1);
  assert.equal(offen[0].weiteresAnliegen, WUNSCH);
  assert.equal(offen[0].ausgang, "termin");
  assert.equal(offen[0].offen, true);
});

test("das Anliegen wird auf 400 Zeichen gekuerzt", () => {
  assert.equal(itemAus(eintrag({ weiteres_anliegen: "x".repeat(900) })).weiteres_anliegen.length, 400);
});