// Lisas Anruf mit Auftrag der Praxis: Bianca greift das Anliegen beim Rueckruf selbst auf.
// Reine Funktionen, ohne Datenbank.
import test from "node:test";
import assert from "node:assert/strict";
import { pruefeAnruf, eintragAus, itemAus, beimRueckrufVon, anliegenFuerKontext, wirdAufgegriffen } from "../src/brain/lisaAnrufe.js";
import { kontextZeile } from "../src/bianca/callerContext.js";

const AUFTRAG = {
  art: "recall",
  behandler: "Dr. Beispiel",
  behandlungsart: { id: "vm-kontrolle", name: "Kontrolluntersuchung" },
  kalender_id: "kal-1",
  letzter_besuch: { datum: "2026-05-12", grund: "Füllung" },
  kontrollgrund: { quelle: "recall", text: "halbjährliche Kontrolle ist fällig" },
};

function anruf(mehr = {}) {
  return {
    anruf_id: "auftrag-1", nummer: "+491700000302", beginn: Date.UTC(2026, 10, 27, 0, 37), erreicht: "person", ausgang: "abgebrochen",
    anlass: "Kontrolluntersuchung", behandler: "Dr. Beispiel", patient: { vorname: "Michael", nachname: "Petsas" },
    gesagt: "Dass die Kontrolle ansteht.", angebot: [{ datum: "2026-12-01", uhrzeit: "10:30", behandler: "Dr. Beispiel" }],
    auftrag: AUFTRAG, ...mehr,
  };
}

function eintrag(mehr) {
  const p = pruefeAnruf(anruf(mehr));
  assert.equal(p.ok, true, p.klartext);
  return eintragAus("zzz-ohne-datenbank", p.anruf);
}

test("abgebrochen mit Auftrag: Bianca bekommt den Auftrag, den Termin selbst anzubieten", () => {
  const e = eintrag();
  const item = itemAus(e);
  assert.equal(item.auftrag.ziel, "termin_vereinbaren");
  assert.equal(item.auftrag.ziel_text, "einen Termin für Kontrolluntersuchung bei Dr. Beispiel vereinbaren");
  assert.equal(item.auftrag.aufgreifen, true);
  assert.equal(item.auftrag.behandler, "Dr. Beispiel");
  assert.equal(item.auftrag.behandlungsart, "Kontrolluntersuchung");
  assert.equal(item.auftrag.behandlungsart_id, "vm-kontrolle");
  assert.equal(item.auftrag.kalender_id, "kal-1");
  assert.deepEqual(item.auftrag.letzter_besuch, { datum: "2026-05-12", grund: "Füllung", datum_text: "12. Mai 2026" });
  assert.equal(item.auftrag.kontrollgrund, "halbjährliche Kontrolle ist fällig");

  const br = item.beim_rueckruf;
  for (const stueck of ["brach ab", "Jetzt selbst einen Termin für Kontrolluntersuchung bei Dr. Beispiel vereinbaren", "freie Zeiten anbieten",
    "Behandlungsart „Kontrolluntersuchung“", "Letzter Besuch am 12. Mai 2026 (Füllung)", "halbjährliche Kontrolle ist fällig",
    "Lisa hat schon gesagt: Dass die Kontrolle ansteht.", "Lisa hat schon angeboten:", "10:30 Uhr"]) {
    assert.ok(br.includes(stueck), `beim_rueckruf ohne "${stueck}": ${br}`);
  }
  assert.ok(!br.includes("klären"), br);

  const zeile = kontextZeile(e);
  for (const stueck of ["Das Gespräch brach ab", "Die Praxis möchte einen Termin für Kontrolluntersuchung bei Dr. Beispiel vereinbaren",
    "biete den Termin jetzt selbst an", "Letzter Besuch am 12. Mai 2026 (Füllung)", "Lisa hat schon angeboten:"]) {
    assert.ok(zeile.includes(stueck), `context ohne "${stueck}": ${zeile}`);
  }
});

test("nicht erreicht und Anrufbeantworter greifen das Anliegen ebenso auf, erledigte Ausgaenge nicht", () => {
  for (const erreicht of ["niemand", "mailbox"]) {
    const e = eintrag({ erreicht, ausgang: "", gesagt: "", angebot: [] });
    assert.equal(wirdAufgegriffen(e.anruf), true, erreicht);
    assert.ok(beimRueckrufVon(e.anruf).includes("Jetzt selbst einen Termin"), beimRueckrufVon(e.anruf));
    assert.ok(!beimRueckrufVon(e.anruf).includes("Lisa hat schon"), "nichts gesagt, nichts angeboten");
    assert.ok(anliegenFuerKontext(e.anruf).includes("biete den Termin jetzt selbst an"));
  }
  for (const ausgang of ["kein_interesse", "nicht_mehr_anrufen", "falsche_person", "anderes_anliegen"]) {
    const e = eintrag({ ausgang });
    assert.equal(wirdAufgegriffen(e.anruf), false, ausgang);
    assert.equal(anliegenFuerKontext(e.anruf), "", ausgang);
    assert.equal(itemAus(e).auftrag.aufgreifen, false, ausgang);
  }
});

test("Lisas eigener Hinweis bleibt als Hinweis stehen; eine Nachricht wird ausgerichtet statt ein Termin angeboten", () => {
  const mitHinweis = eintrag({ beim_rueckruf: "Erst ab 16 Uhr erreichbar." });
  assert.ok(beimRueckrufVon(mitHinweis.anruf).endsWith("Hinweis von Lisa: Erst ab 16 Uhr erreichbar."), beimRueckrufVon(mitHinweis.anruf));

  const n = eintrag({ erreicht: "niemand", ausgang: "", gesagt: "", angebot: [], auftrag: { art: "nachricht", nachricht: "Ihr Zahnersatz ist da." } });
  assert.equal(itemAus(n).auftrag.ziel, "nachricht_ausrichten");
  assert.ok(beimRueckrufVon(n.anruf).includes("Die Nachricht der Praxis jetzt selbst ausrichten: „Ihr Zahnersatz ist da.“"), beimRueckrufVon(n.anruf));
  assert.ok(!beimRueckrufVon(n.anruf).includes("Termin"), beimRueckrufVon(n.anruf));
});

test("ohne auftrag bleibt alles wie bisher", () => {
  const e = eintrag({ auftrag: undefined, beim_rueckruf: "Das Anliegen klären." });
  assert.equal(e.anruf.auftrag, null);
  const item = itemAus(e);
  assert.equal(item.auftrag, null);
  assert.equal(item.beim_rueckruf, "Das Anliegen klären.");
  assert.ok(kontextZeile(e).endsWith("(noch offen)"), kontextZeile(e));
  assert.equal(eintrag({ auftrag: {} }).anruf.auftrag, null, "leerer Auftrag zaehlt nicht");
  assert.equal(eintrag({ auftrag: "Kontrolle" }).anruf.auftrag, null, "nur ein Objekt zaehlt");
});
