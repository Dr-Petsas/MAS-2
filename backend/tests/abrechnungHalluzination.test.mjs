// Halluzinations-Stop (Chef 06.11.2026): eine Gebührennummer, die weder in der Frage noch im Ausschnitt der
// Wissensbasis steht, verwirft die Modellantwort. Dann spricht der Wortlaut der Bestimmung.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { _setAbrechnung, abrechnungAntwort, nummernFremd } from "../src/hkp/antwortVerstehen.js";

test("nummernFremd: nur Nummern ohne Fundstelle", () => {
  const wissen = "BEMA Ä1: Beratung eines Kranken, auch fernmündlich (nicht neben 01)";
  assert.deepEqual(nummernFremd("Die Ä1 ist nicht neben der 01 abrechenbar.", "Geht 01 neben Ä1?", wissen), []);
  assert.deepEqual(nummernFremd("Rechnen Sie stattdessen die BEMA 105 ab.", "Geht 01 neben Ä1?", wissen), ["105"]);
});

test("erfundene Nummer: Modellantwort verworfen, Bestimmung im Wortlaut", async () => {
  _setAbrechnung(async () => ({ ok: true, text: "Nein, rechnen Sie stattdessen die BEMA 105 ab." }));
  try {
    const a = await abrechnungAntwort({ frage: "Kann ich die 01 und die Ä1 nebeneinander abrechnen?" });
    assert.equal(a.quelle, "wissen", a.message);
    assert.doesNotMatch(a.message, /105/);
    _setAbrechnung(async () => ({ ok: true, text: "Nein. Laut Leistungstext ist die Ä1 nicht neben der 01 abrechenbar." }));
    const b = await abrechnungAntwort({ frage: "Kann ich die 01 und die Ä1 nebeneinander abrechnen?" });
    assert.equal(b.quelle, "modell", b.message);
  } finally {
    _setAbrechnung(null);
  }
});
