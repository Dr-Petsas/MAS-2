import assert from "node:assert/strict";
import { test } from "node:test";
import { regioZaehne, fallRechnen } from "../src/hkp/coach.js";

const SATZ = "Implantatversorgung OK mit 6 Implantaten regio 2, 4, 6 auf beiden Quadranten mit externem Sinuslift rechts und internem Sinuslift beim 4er und 6er links inklusive der späteren All-on-6-Prothetik";

test("regio 2, 4, 6 auf beiden Quadranten im Oberkiefer", () => {
  assert.deepEqual(regioZaehne(SATZ), ["12", "14", "16", "22", "24", "26"]);
  assert.deepEqual(regioZaehne("Implantat regio 6 rechts im Oberkiefer"), ["16"]);
  assert.deepEqual(regioZaehne("Implantat regio 6 links im Unterkiefer"), ["36"]);
  assert.deepEqual(regioZaehne("Sinuslift rechts und internem links, regio 4"), []);
});

test("Referenzfall: Implantation und All-on-6, Beträge nur auf der Karte", () => {
  const x = fallRechnen({ versorgung: SATZ, prothese: "kasse" }, { muster: true, befund: {} });
  assert.equal(x.status, "ok", x.frage || "");
  const impl = x.teile.find((t) => t.planart === "impl");
  const kasse = x.teile.find((t) => t.planart === "kasse");
  assert.ok(impl && kasse);
  assert.deepEqual(impl.r.plan.zaehne ? Object.keys(impl.r.plan.zaehne).sort() : [], ["12", "14", "16", "22", "24", "26"]);
  assert.equal(impl.r.plan.regionen["OK-R"].sinusExtern, true);
  assert.equal(impl.r.plan.regionen["OK-L"].sinusIntern, true);
  assert.equal(impl.r.plan.regionen["OK-F"]?.sinusExtern, undefined);
  assert.equal(impl.r.plan.regionen["OK-F"]?.sinusIntern, undefined);
  const goz = impl.zeilen.filter((z) => z.ebene === "GOZ").map((z) => `${z.nr}@${z.zahn}`);
  assert.deepEqual(goz.filter((z) => z.startsWith("9120")), ["9120@OK-R"]);
  assert.deepEqual(goz.filter((z) => z.startsWith("9110")), ["9110@OK-L"]);
  assert.match(kasse.titel, /All-on-6/);
  assert.doesNotMatch(x.message, /€|\beuro\b/i);
  assert.match(x.message, /Soll ich den Entwurf so anlegen\?|Musterrechnung/);
  assert.ok(x.card.items.some((i) => /9120/.test(i.text) && /externe/.test(i.text) && !/Knochenf/.test(i.text)));
  assert.ok(x.card.items.some((i) => /2160/.test(i.text) && /Implantatplanung/.test(i.text)));
  assert.ok(x.card.items.some((i) => /9110/.test(i.text) && /€/.test(i.text)));
  assert.ok(x.card.items.some((i) => /€/.test(i.text) && /Kassenplan/.test(i.text)));
  assert.ok(x.card.items.some((i) => /Kassenplan · GOZ 5000 Versorgung/.test(i.text)), "Kassenzeilen tragen den Leistungsnamen");
  assert.equal(x.card.tag, "Musterrechnung");
});

test("Prothese ohne Kasse oder Privat bleibt eine Frage", () => {
  const x = fallRechnen({ versorgung: SATZ }, { muster: true, befund: {} });
  assert.equal(x.status, "rueckfrage");
  assert.match(x.frage, /Kasse/);
  assert.equal(x.card, undefined);
});
