// Vorschlaege nur fuer Patienten mit Akte (27.11.2026): eine geloeschte Dublette mit alten
// Recall-Terminen wurde vorgeschlagen, die Plattform fand die Akte nicht. Erfundene Daten.
// Start: node --test backend/tests/lueckeAkteVorhanden.test.mjs
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

const L = await import("../src/clara/lueckeFuellen.js");

test("nur Kandidaten mit vorhandener Akte bleiben, Reihenfolge unveraendert", () => {
  const k = [{ patientId: "weg", name: "A" }, { patientId: "da1", name: "B" }, { patientId: "", name: "C" }, { patientId: "da2", name: "D" }];
  assert.deepEqual(L.nurMitAkte(k, new Set(["da1", "da2"])).map((c) => c.name), ["B", "D"]);
  assert.deepEqual(L.nurMitAkte(k, new Set()), []);
  assert.deepEqual(L.nurMitAkte(null, new Set(["da1"])), []);
});

test("aktenVorhanden fragt jede Kennung einmal und merkt auch fehlende Akten", async () => {
  L._akteCacheLeeren();
  const gefragt = [];
  const holen = async (c, l, ids) => { gefragt.push(ids); return ids.filter((id) => id.startsWith("da")); };
  const da = await L.aktenVorhanden("praxisX", "ortX", ["da1", "weg", "da1", "", "da2"], { holen, jetzt: 1000 });
  assert.deepEqual([...da].sort(), ["da1", "da2"]);
  assert.deepEqual(gefragt, [["da1", "weg", "da2"]]);
  const nochmal = await L.aktenVorhanden("praxisX", "ortX", ["weg", "da2"], { holen, jetzt: 2000 });
  assert.deepEqual([...nochmal], ["da2"]);
  assert.equal(gefragt.length, 1);
});

test("nach fuenf Minuten wird neu gefragt, und je Praxis getrennt", async () => {
  L._akteCacheLeeren();
  let n = 0;
  const holen = async (c, l, ids) => { n += 1; return c === "praxisX" ? ids : []; };
  assert.equal((await L.aktenVorhanden("praxisX", "ortX", ["a"], { holen, jetzt: 0 })).has("a"), true);
  assert.equal((await L.aktenVorhanden("praxisY", "ortX", ["a"], { holen, jetzt: 0 })).has("a"), false);
  await L.aktenVorhanden("praxisX", "ortX", ["a"], { holen, jetzt: 5 * 60 * 1000 + 1 });
  assert.equal(n, 3);
});

test("grosse Listen gehen in Teilen an die Kartei", async () => {
  L._akteCacheLeeren();
  const teile = [];
  const ids = Array.from({ length: 650 }, (_, i) => `p${i}`);
  const da = await L.aktenVorhanden("praxisX", "ortX", ids, { holen: async (c, l, t) => { teile.push(t.length); return t; }, jetzt: 0 });
  assert.equal(da.size, 650);
  assert.deepEqual(teile, [300, 300, 50]);
});

test("ist die Kartei nicht lesbar, wirft die Pruefung und merkt sich nichts", async () => {
  L._akteCacheLeeren();
  await assert.rejects(L.aktenVorhanden("praxisX", "ortX", ["a"], { holen: async () => { throw new Error("aus"); }, jetzt: 0 }));
  const da = await L.aktenVorhanden("praxisX", "ortX", ["a"], { holen: async (c, l, t) => t, jetzt: 1 });
  assert.equal(da.has("a"), true);
});

test("Sprechtext nennt die nicht lesbare Kartei", () => {
  assert.match(L.passendSatz({ ok: false, reason: "kartei_nicht_lesbar", gruppen: [], gesamt: 0 }), /Kartei/);
});

test.after(() => setTimeout(() => process.exit(0), 50));