// Praxis-Verbund aus PlanR (30.10.2026): Register-Aufloesung fuer HKP-Register, Praxis-Standard, Sprach-Entwuerfe, Live.
// Start: node backend/tests/planrVerbund.test.mjs  (ohne Firestore, der Client-Stand wird untergeschoben)
import assert from "node:assert/strict";
const V = await import("../src/hkp/verbund.js");

let ok = 0;
async function t(name, fn) { await fn(); ok += 1; console.log("  ok -", name); }

let aufrufe = 0;
const CLIENTS = {
  haupt: { name: "med dent" },
  gast: { name: "Dr. Petsas", planrVerbund: { haupt: "haupt", register: "haupt", seit: "2026-10-30T12:00:00Z" } },
  kaputt: { planrVerbund: { haupt: "x", register: "../boese" } },
  allein: { name: "Allein" },
};
V._setVerbundLaden(async (id) => {
  aufrufe += 1;
  if (id === "firestore-weg") throw new Error("weg");
  return CLIENTS[id] ?? null;
}, async () => []);

await t("Gast schreibt ins Register der Haupt-Praxis, alle anderen in ihr eigenes", async () => {
  assert.equal(await V.registerFuer("gast"), "haupt");
  assert.equal(await V.registerFuer("haupt"), "haupt");
  assert.equal(await V.registerFuer("allein"), "allein");
  assert.equal(await V.registerFuer("unbekannt"), "unbekannt");
});

await t("ungueltiges Register im Spiegel zaehlt nicht", async () => {
  assert.equal(await V.registerFuer("kaputt"), "kaputt");
});

await t("Firestore weg: nie werfen, die Praxis selbst", async () => {
  assert.equal(await V.registerFuer("firestore-weg"), "firestore-weg");
  assert.equal(await V.registerFuer(""), "");
});

await t("Cache: zweiter Aufruf ohne Firestore, Live-Ansicht kennt das Register synchron", async () => {
  const vorher = aufrufe;
  assert.equal(await V.registerFuer("gast"), "haupt");
  assert.equal(aufrufe, vorher);
  assert.equal(V.registerBekannt("gast"), "haupt");
  assert.equal(V.registerBekannt("nie-gefragt"), "nie-gefragt");
});

await t("Notaus MAS_PLANR_VERBUND=0: jede Praxis wieder fuer sich", async () => {
  process.env.MAS_PLANR_VERBUND = "0";
  try {
    assert.equal(await V.registerFuer("gast"), "gast");
    assert.equal(V.registerBekannt("gast"), "gast");
  } finally {
    delete process.env.MAS_PLANR_VERBUND;
  }
});

await t("Koppeln prueft ohne zu schreiben: selbst, unbekannt, Kette, Doppelkopplung", async () => {
  assert.equal((await V.verbundSetzen("gast", { haupt: "gast" })).status, 409);
  assert.equal((await V.verbundSetzen("allein", { haupt: "unbekannt" })).status, 404);
  assert.match((await V.verbundSetzen("allein", { haupt: "gast" })).message, /dritte/);
  assert.match((await V.verbundSetzen("gast", { haupt: "allein" })).message, /schon mit einer anderen/);
  assert.equal((await V.verbundSetzen("a/b", { haupt: "haupt" })).status, 400);
  V._setVerbundLaden(async (id) => CLIENTS[id] ?? null, async (id) => (id === "haupt" ? ["gast"] : []));
  assert.match((await V.verbundSetzen("haupt", { haupt: "allein" })).message, /schon andere gekoppelt/);
});

console.log(`planrVerbund: ${ok} ok`);
