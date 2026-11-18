// Schiene privat im Abrechnungscoach (Chef 18.11.2026): "Wie rechne ich eine Knirscherschiene ab?" ergibt eine
// Musterrechnung, die Vorlage kommt als Werkzeugfeld vom Modell. Beträge nur auf der Karte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fallRechnen, teileAufloesen } from "../src/hkp/coach.js";
import { KB_VORLAGEN } from "../src/vendor/privat-kb-engine.mjs";

test("Musterrechnung Knirscherschiene: Positionen auf der Karte, kein Betrag im Satz", () => {
  const x = fallRechnen({ planart: "schiene", schienen: ["knirscher"], versorgung: "Knirscherschiene" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  assert.equal(x.teile.length, 1);
  const t = x.teile[0];
  assert.equal(t.sprachPlan, "schiene");
  assert.ok(t.zeilen.some((z) => z.ebene === "GOZ" && z.nr === "7010"));
  assert.ok(t.zeilen.some((z) => z.ebene === "LABOR"));
  assert.ok(t.summen.summe > 0);
  assert.match(x.fallTitel, /Knirscherschiene/);
  assert.doesNotMatch(x.message, /€|\beuro\b/i);
  assert.ok(x.card.items.some((i) => /Gesamt/.test(i.text)));
});

test("ohne Vorlage fragt die Engine nach der Schiene", () => {
  const x = fallRechnen({ planart: "schiene", versorgung: "eine Schiene" }, { muster: true, befund: {} });
  assert.equal(x.status, "rueckfrage");
  assert.match(x.frage, /Welche Schiene/);
});

test("Schiene als Teil eines Falls neben einer Kons", () => {
  const a = teileAufloesen({ teile: [{ planart: "schiene", schienen: ["michigan"], abformung: "scan" }, { planart: "kons", versorgung: "Kompositfüllung an 36 mod" }] });
  assert.equal(a.frage, "");
  assert.deepEqual(a.teile.map((t) => t.planart), ["schiene", "kons"]);
  assert.deepEqual(a.teile[0].schienen, ["michigan"]);
});

test("jede Vorlage des Privat-KB-Planers rechnet", () => {
  for (const v of KB_VORLAGEN) {
    const x = fallRechnen({ planart: "schiene", schienen: [v.id] }, { muster: true, befund: {} });
    assert.equal(x.status, "ok", `${v.id}: ${x.frage || ""}`);
  }
});
