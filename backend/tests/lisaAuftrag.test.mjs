// Lisas Anruf mit Auftrag der Praxis: Bianca greift das Anliegen beim Rueckruf selbst auf.
// Feldnamen wie Lisa V8 sie schickt. Reine Funktionen, ohne Datenbank.
import test from "node:test";
import assert from "node:assert/strict";
import { pruefeAnruf, eintragAus, itemAus, lisaAnrufeFuerSeite, beimRueckrufVon, anliegenFuerKontext, wirdAufgegriffen } from "../src/brain/lisaAnrufe.js";
import { kontextZeile } from "../src/bianca/callerContext.js";

// Wortgleich das Beispiel aus Lisas Beschreibung (27.11.2026).
const AUFTRAG = {
  art: "recall",
  ziel: "Kontrolltermin vereinbaren",
  arzt: "Dr. Muster",
  behandlungsart: { id: "g1", name: "Kontrolluntersuchung" },
  kalender: [{ id: "k1", name: "Dr. Muster" }],
  letzter_besuch: { datum: "2026-10-14", grund: "Implantat-Besprechung" },
  kontrollgrund: "Kontrolle nach der Besprechung",
  anlass_quelle: "recall",
  kampagne: "Herbstaktion",
  zusatz: "freier Zusatz der Praxis aus der Maske",
  vorgegebene_zeiten: [{ datum: "2026-12-02", uhrzeit: "10:30", behandler: "Dr. Muster" }],
};
const LISAS_TEXT = "Den Termin selbst anbieten und buchen: Kontrolluntersuchung bei Dr. Muster. Letzter Besuch: Oktober 2026, Implantat-Besprechung.";

function anruf(mehr = {}) {
  return {
    anruf_id: "auftrag-1", nummer: "+491700000302", beginn: Date.UTC(2026, 10, 27, 0, 37), erreicht: "person", ausgang: "abgebrochen",
    anlass: "Kontrolluntersuchung", behandler: "Dr. Muster", patient: { vorname: "Michael", nachname: "Petsas" },
    gesagt: "Lisa hat sich vorgestellt, zum Anlass kam sie noch nicht.", angebot: [{ datum: "2026-12-02", uhrzeit: "10:30", behandler: "Dr. Muster" }],
    beim_rueckruf: LISAS_TEXT, auftrag: AUFTRAG, ...mehr,
  };
}

function eintrag(mehr) {
  const p = pruefeAnruf(anruf(mehr));
  assert.equal(p.ok, true, p.klartext);
  return eintragAus("zzz-ohne-datenbank", p.anruf);
}

test("der Auftrag wird mit Lisas Feldnamen gespeichert und an Bianca durchgereicht", () => {
  const e = eintrag();
  const { aufgreifen, letzter_besuch, ...rest } = itemAus(e).auftrag;
  const { letzter_besuch: lb, ...geschickt } = AUFTRAG;
  assert.deepEqual(rest, { ...geschickt, nachricht: "", vorgegebene_zeiten: [{ datum: "2026-12-02", uhrzeit: "10:30", behandler: "Dr. Muster", termin_id: "" }] });
  assert.deepEqual(letzter_besuch, { ...lb, datum_text: "14. Oktober 2026" });
  assert.equal(aufgreifen, true);
  assert.equal(itemAus(e).beim_rueckruf, LISAS_TEXT, "Lisas eigener Text gilt");
});

test("abgebrochen: im Text fuer Bianca steht, was die Praxis will, mit Hintergrund und dem schon Gesagten", () => {
  const zeile = kontextZeile(eintrag());
  for (const stueck of ["Das Gespräch brach ab", "Die Praxis möchte: Kontrolltermin vereinbaren (Kontrolluntersuchung) bei Dr. Muster.",
    "biete den Termin jetzt selbst an", "Letzter Besuch am 14. Oktober 2026 (Implantat-Besprechung).", "Grund für die Kontrolle: Kontrolle nach der Besprechung.",
    "Lisa hat sich vorgestellt, zum Anlass kam sie noch nicht.", "Lisa hat schon angeboten:", "10:30 Uhr"]) {
    assert.ok(zeile.includes(stueck), `context ohne "${stueck}": ${zeile}`);
  }
  assert.ok(!zeile.includes("Lisa hat schon gesagt: Lisa hat"), zeile);
});

test("ohne Lisas Text baut MAS den Auftrag an Bianca: Termin anbieten, nicht klaeren", () => {
  for (const erreicht of ["niemand", "mailbox"]) {
    const e = eintrag({ erreicht, ausgang: "", gesagt: "", angebot: [], beim_rueckruf: "" });
    assert.equal(wirdAufgegriffen(e.anruf), true, erreicht);
    const br = beimRueckrufVon(e.anruf);
    assert.ok(br.startsWith("Den Termin jetzt selbst anbieten und buchen: Kontrolltermin vereinbaren (Kontrolluntersuchung) bei Dr. Muster."), br);
    assert.ok(br.includes("Letzter Besuch am 14. Oktober 2026 (Implantat-Besprechung).") && !br.includes("klären"), br);
    assert.ok(anliegenFuerKontext(e.anruf).includes("biete den Termin jetzt selbst an"));
  }
  const n = eintrag({ erreicht: "niemand", ausgang: "", gesagt: "", angebot: [], beim_rueckruf: "",
    auftrag: { art: "nachricht", ziel: "eine Nachricht der Praxis ausrichten", nachricht: "Ihr Zahnersatz ist da." } });
  assert.equal(beimRueckrufVon(n.anruf), "Die Nachricht der Praxis jetzt selbst ausrichten: „Ihr Zahnersatz ist da.“");
  assert.ok(anliegenFuerKontext(n.anruf).includes("Richte sie jetzt selbst aus"), anliegenFuerKontext(n.anruf));
});

test("erledigte Ausgaenge tragen den Auftrag nur als Angabe", () => {
  for (const ausgang of ["kein_interesse", "nicht_mehr_anrufen", "falsche_person", "anderes_anliegen"]) {
    const e = eintrag({ ausgang, beim_rueckruf: "" });
    assert.equal(wirdAufgegriffen(e.anruf), false, ausgang);
    assert.equal(anliegenFuerKontext(e.anruf), "", ausgang);
    assert.equal(itemAus(e).auftrag.aufgreifen, false, ausgang);
    assert.ok(!beimRueckrufVon(e.anruf).includes("anbieten"), ausgang);
  }
});

test("die Clara-Seite zeigt, was die Praxis wollte", () => {
  const e = eintrag();
  const zeile = lisaAnrufeFuerSeite([e], { startOfDayMs: 0 }).offen[0];
  assert.equal(zeile.auftrag.ziel, "Kontrolltermin vereinbaren (Kontrolluntersuchung) bei Dr. Muster");
  assert.ok(zeile.auftrag.hintergrund.includes("Letzter Besuch am 14. Oktober 2026"), zeile.auftrag.hintergrund);
  assert.equal(zeile.beimRueckruf, LISAS_TEXT);
});

test("ohne auftrag bleibt alles wie bisher", () => {
  const e = eintrag({ auftrag: undefined, beim_rueckruf: "Das Anliegen klären." });
  assert.equal(e.anruf.auftrag, null);
  const item = itemAus(e);
  assert.equal(item.auftrag, null);
  assert.equal(item.beim_rueckruf, "Das Anliegen klären.");
  assert.ok(kontextZeile(e).endsWith("(noch offen)"), kontextZeile(e));
  assert.equal(lisaAnrufeFuerSeite([e], { startOfDayMs: 0 }).offen[0].auftrag, null);
  assert.equal(eintrag({ auftrag: {} }).anruf.auftrag, null, "leerer Auftrag zaehlt nicht");
  assert.equal(eintrag({ auftrag: "Kontrolle" }).anruf.auftrag, null, "nur ein Objekt zaehlt");
});
