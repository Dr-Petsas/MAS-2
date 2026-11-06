// Ausschluss-Tabelle (Chef 06.11.2026: "bei Konflikt gewinnt die Tabelle"). Gebaut aus den Bestimmungstexten der
// Wissensbasis; jedes Paar traegt Originalsatz und Fundstelle. Geprueft werden Aufbau, Antwort und Planpruefung.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { _ausschlussAus, ausschlussSatz, ausschlussTabelle, ausschluesseZwischen, planPruefen, positionenVon } from "../src/hkp/ausschluss.js";
import { _setAbrechnung, abrechnungAntwort } from "../src/hkp/antwortVerstehen.js";

const paar = (k, a, b) => ausschlussTabelle().find((e) => e.k === k && [e.a, e.b].sort().join() === [a, b].sort().join());

test("Tabelle aus den Bestimmungen: bekannte Ausschluesse mit Fundstelle", () => {
  const t = ausschlussTabelle();
  assert.ok(t.length >= 100, `nur ${t.length} Paare`);
  for (const [k, a, b, bei] of [["GOZ", "0030", "0040", "0040"], ["GOZ", "4060", "1040", "1040"], ["GOZ", "3300", "3310", "3300"],
    ["GOZ", "2180", "2190", "2195"], ["GOZ", "5040", "5080", "5040"], ["GOZ", "9100", "9130", "9100"], ["BEMA", "121", "119", "121"]]) {
    const e = paar(k, a, b);
    assert.ok(e, `${k} ${a}/${b} fehlt`);
    assert.equal(e.bei, bei, `${k} ${a}/${b}: Fundstelle`);
    assert.match(e.satz, /neben/i);
  }
  // Bereich "2050 bis 2130" ausgeschrieben, "2195 neben 2180" ist erlaubt
  assert.ok(paar("GOZ", "2200", "2080"));
  assert.equal(paar("GOZ", "2195", "2180"), undefined);
  // Erlaubnisse, Halbierungen und Begruendungspflichten sind keine Ausschluesse
  assert.equal(paar("GOZ", "4060", "4150"), undefined);
  assert.equal(paar("GOZ", "9100", "9110"), undefined);
  assert.equal(paar("GOZ", "0050", "0060"), undefined);
  // zahngebunden
  assert.equal(paar("GOZ", "9110", "9120").art, "zahn");
});

test("Satzformen: ohne Leerzeichen geklebt, Klammern, Kurzhinweis", () => {
  const t = _ausschlussAus({ ziffern: [
    { k: "GOZ", n: "1000", t: "a", h: "Erster Satz.Die Leistung nach der Nummer 1000 ist neben der Leistung nach der Nummer 1010 nicht berechnungsfähig." },
    { k: "GOZ", n: "1010", t: "b", h: "Nicht neben 1020 (zahn-/sitzungsgleich); neben 1000 möglich (BZÄK 2026)." },
    { k: "GOZ", n: "1020", t: "c" },
  ] });
  const keys = t.map((e) => [e.a, e.b].sort().join("/")).sort();
  assert.deepEqual(keys, ["1000/1010", "1010/1020"]);
  const kurz = t.find((e) => e.a === "1010");
  assert.equal(kurz.art, "zahn");
  assert.equal(kurz.quelle, "Hinweis der BZÄK");
});

test("Satz mit Fundstelle, ohne Preise", () => {
  const s = ausschlussSatz(paar("GOZ", "4060", "1040"));
  assert.match(s, /Abrechnungsbestimmung zur GOZ 1040/);
  assert.match(s, /nicht neben/);
  assert.doesNotMatch(s, /€|Euro/);
});

test("Abrechnungsfrage: Tabelle gewinnt gegen das Modell", async () => {
  _setAbrechnung(async () => ({ ok: true, text: "Ja, die GOZ 4060 können Sie neben der GOZ 1040 berechnen." }));
  try {
    const a = await abrechnungAntwort({ frage: "Geht die 4060 neben der 1040?" });
    assert.equal(a.quelle, "tabelle", a.message);
    assert.match(a.message, /nicht neben/);
    _setAbrechnung(async () => ({ ok: true, text: "Nein, die GOZ 4060 ist neben der GOZ 1040 nicht berechnungsfähig." }));
    const b = await abrechnungAntwort({ frage: "Geht die 4060 neben der 1040?" });
    assert.equal(b.quelle, "modell", b.message);
  } finally {
    _setAbrechnung(null);
  }
});

test("Planpruefung: Treffer nur fuer Paare im Plan, zahngebunden nur am selben Zahn", () => {
  const plan = [{ ebene: "GOZ", nr: "1040", zahn: "" }, { ebene: "GOZ", nr: "4060", zahn: "16" }, { ebene: "GOZ", nr: "5010", zahn: "14" }];
  const t = planPruefen(plan);
  assert.equal(t.length, 1);
  assert.match(t[0].hinweis, /4060/);
  assert.deepEqual(planPruefen([{ ebene: "GOZ", nr: "9110", zahn: "16" }, { ebene: "GOZ", nr: "9120", zahn: "26" }]), []);
  assert.equal(planPruefen([{ ebene: "GOZ", nr: "9110", zahn: "16" }, { ebene: "GOZ", nr: "9120", zahn: "16" }]).length, 1);
  // Kassen-Ergebnis und Plan tragen dieselben Positionen: nicht doppelt zaehlen
  const r = { ergebnis: { positionen: plan }, plan: { positionen: plan } };
  assert.equal(positionenVon(r).length, 3);
  assert.equal(ausschluesseZwischen(["4060", "1040"]).length, 1);
});
