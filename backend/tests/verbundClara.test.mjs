// Praxis-Verbund (21.11.2026): die Gast-Praxis nutzt die Clara der Haupt-Praxis.
// Start: node backend/tests/verbundClara.test.mjs  (ohne Firestore, Verbund und Billing werden untergeschoben)
import assert from "node:assert/strict";
const V = await import("../src/hkp/verbund.js");
const C = await import("../src/hkp/verbundClara.js");

let ok = 0;
async function t(name, fn) { await fn(); ok += 1; console.log("  ok -", name); }

const BILLING = {
  mas: { subscriptions: { crew: { tier: "premium" } } },
  sprache: { subscriptions: { planr: { enabled: true, sprachsteuerung: true } } },
  ohne: { subscriptions: { planr: { enabled: true } } },
};

await t("pur: Haupt-Praxis mit Clara gilt fuer den Gast, sonst bleibt jede Praxis bei sich", () => {
  assert.deepEqual(C.claraPraxisAus({ clientId: "gast", haupt: "haupt", hauptBilling: BILLING.mas }), { praxis: "haupt", verbund: true, stufe: "voll" });
  assert.deepEqual(C.claraPraxisAus({ clientId: "gast", haupt: "haupt", hauptBilling: BILLING.sprache }), { praxis: "haupt", verbund: true, stufe: "planr" });
  // Haupt-Praxis ohne Sprach-KI: dem Gast wird nichts weggenommen
  assert.deepEqual(C.claraPraxisAus({ clientId: "gast", haupt: "haupt", hauptBilling: BILLING.ohne }), { praxis: "gast", verbund: false });
  assert.deepEqual(C.claraPraxisAus({ clientId: "gast", haupt: "haupt", hauptBilling: null }), { praxis: "gast", verbund: false });
  // kein Verbund, Haupt-Praxis selbst
  assert.deepEqual(C.claraPraxisAus({ clientId: "allein", haupt: "", hauptBilling: BILLING.mas }), { praxis: "allein", verbund: false });
  assert.deepEqual(C.claraPraxisAus({ clientId: "haupt", haupt: "haupt", hauptBilling: BILLING.mas }), { praxis: "haupt", verbund: false });
});

// ---- mit dem echten Verbund-Spiegel (hauptFuer) ----
const CLIENTS = {
  haupt: { name: "Haupt" },
  gast: { planrVerbund: { haupt: "haupt", register: "haupt" } },
  gastSprache: { planrVerbund: { haupt: "hauptSprache", register: "hauptSprache" } },
  gastOhne: { planrVerbund: { haupt: "hauptOhne", register: "hauptOhne" } },
  gastKaputt: { planrVerbund: { haupt: "billing-weg", register: "billing-weg" } },
  schief: { planrVerbund: { haupt: "../boese", register: "haupt" } },
  selbst: { planrVerbund: { haupt: "selbst", register: "selbst" } },
  allein: { name: "Allein" },
};
const BILLING_VON = { haupt: BILLING.mas, hauptSprache: BILLING.sprache, hauptOhne: BILLING.ohne, gast: BILLING.sprache, allein: BILLING.sprache };
let gelesen = [];
V._setVerbundLaden(async (id) => {
  if (id === "firestore-weg") throw new Error("weg");
  return CLIENTS[id] ?? null;
}, async () => []);
C._setVerbundClaraLaden({
  billing: async (id) => {
    gelesen.push(id);
    if (id === "billing-weg") throw new Error("weg");
    return BILLING_VON[id] ?? null;
  },
});

await t("hauptFuer: nur der Gast hat eine Haupt-Praxis", async () => {
  assert.equal(await V.hauptFuer("gast"), "haupt");
  assert.equal(await V.hauptFuer("haupt"), "");
  assert.equal(await V.hauptFuer("allein"), "");
  assert.equal(await V.hauptFuer("unbekannt"), "");
  assert.equal(await V.hauptFuer("schief"), "");
  assert.equal(await V.hauptFuer("selbst"), "");
  assert.equal(await V.hauptFuer("firestore-weg"), "");
  assert.equal(await V.hauptFuer(""), "");
});

await t("Gast einer MAS-Praxis: volle Clara der Haupt-Praxis", async () => {
  assert.deepEqual(await C.claraPraxisFuer("gast"), { praxis: "haupt", verbund: true, stufe: "voll" });
});

await t("Gast einer PlanR-Praxis mit Sprach-KI: deren HKP-Clara", async () => {
  assert.deepEqual(await C.claraPraxisFuer("gastSprache"), { praxis: "hauptSprache", verbund: true, stufe: "planr" });
});

await t("Haupt-Praxis ohne Sprach-KI: der Gast bleibt bei seiner eigenen Buchung", async () => {
  assert.deepEqual(await C.claraPraxisFuer("gastOhne"), { praxis: "gastOhne", verbund: false });
});

await t("ohne Verbund aendert sich nichts, und es wird kein Billing gelesen", async () => {
  gelesen = [];
  assert.deepEqual(await C.claraPraxisFuer("allein"), { praxis: "allein", verbund: false });
  assert.deepEqual(await C.claraPraxisFuer("haupt"), { praxis: "haupt", verbund: false });
  assert.deepEqual(await C.claraPraxisFuer("unbekannt"), { praxis: "unbekannt", verbund: false });
  assert.deepEqual(gelesen, []);
});

await t("Fehler beim Lesen: nie werfen, die Praxis selbst", async () => {
  assert.deepEqual(await C.claraPraxisFuer("gastKaputt"), { praxis: "gastKaputt", verbund: false });
  assert.deepEqual(await C.claraPraxisFuer("firestore-weg"), { praxis: "firestore-weg", verbund: false });
  assert.deepEqual(await C.claraPraxisFuer(""), { praxis: "", verbund: false });
});

await t("Notaus MAS_VERBUND_CLARA=0: jede Praxis hat wieder nur ihre eigene Clara", async () => {
  process.env.MAS_VERBUND_CLARA = "0";
  try {
    assert.deepEqual(await C.claraPraxisFuer("gast"), { praxis: "gast", verbund: false });
  } finally {
    delete process.env.MAS_VERBUND_CLARA;
  }
  assert.equal((await C.claraPraxisFuer("gast")).verbund, true);
});

await t("Notaus MAS_PLANR_VERBUND=0 schaltet auch die geliehene Clara ab", async () => {
  process.env.MAS_PLANR_VERBUND = "0";
  try {
    assert.equal(await V.hauptFuer("gast"), "");
    assert.deepEqual(await C.claraPraxisFuer("gast"), { praxis: "gast", verbund: false });
  } finally {
    delete process.env.MAS_PLANR_VERBUND;
  }
});

console.log(`verbundClara: ${ok} ok`);
