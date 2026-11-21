// Gekoppelte Konten (21.11.2026): ist ein MAS-Konto dabei, gilt dessen volle Clara fuer beide -
// egal, welches Konto den Kopplungscode erzeugt hat ("haupt" = das Konto, das den Code erzeugt hat).
// Start: node backend/tests/verbundClara.test.mjs  (ohne Firestore, Kopplung und Billing werden untergeschoben)
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
const SELBST = (id) => ({ praxis: id, verbund: false });

await t("pur: MAS-Konto hat den Code erzeugt - seine volle Clara gilt fuer das angehaengte Konto", () => {
  assert.deepEqual(C.claraPraxisAus({ clientId: "solo", eigen: BILLING.sprache, haupt: "mas", hauptBilling: BILLING.mas }), { praxis: "mas", verbund: true, stufe: "voll" });
  assert.deepEqual(C.claraPraxisAus({ clientId: "solo", eigen: null, haupt: "mas", hauptBilling: BILLING.mas }), { praxis: "mas", verbund: true, stufe: "voll" });
  // zwei MAS-Konten: es bleibt bei dem, das den Code erzeugt hat
  assert.deepEqual(C.claraPraxisAus({ clientId: "mas2", eigen: BILLING.mas, haupt: "mas", hauptBilling: BILLING.mas }), { praxis: "mas", verbund: true, stufe: "voll" });
});

await t("pur: Standalone hat den Code erzeugt, MAS-Konto haengt daran - die volle Clara gilt trotzdem fuer beide", () => {
  // das MAS-Konto behaelt seine eigene volle Clara
  assert.deepEqual(C.claraPraxisAus({ clientId: "mas", eigen: BILLING.mas, haupt: "solo", hauptBilling: BILLING.sprache }), SELBST("mas"));
  // das Standalone-Konto bekommt die volle Clara des MAS-Kontos, auch ohne eigenes Sprachpaket
  assert.deepEqual(C.claraPraxisAus({ clientId: "solo", eigen: BILLING.sprache, gaeste: [{ id: "mas", billing: BILLING.mas }] }), { praxis: "mas", verbund: true, stufe: "voll" });
  assert.deepEqual(C.claraPraxisAus({ clientId: "solo", eigen: BILLING.ohne, gaeste: [{ id: "mas", billing: BILLING.mas }] }), { praxis: "mas", verbund: true, stufe: "voll" });
  // ein drittes Konto ohne MAS am selben Standalone ebenso
  assert.deepEqual(
    C.claraPraxisAus({ clientId: "dritt", eigen: BILLING.ohne, haupt: "solo", hauptBilling: BILLING.sprache, gaeste: [{ id: "mas", billing: BILLING.mas }, { id: "dritt", billing: BILLING.ohne }] }),
    { praxis: "mas", verbund: true, stufe: "voll" },
  );
});

await t("pur: zwei angehaengte MAS-Konten - es wird nicht geraten", () => {
  const gaeste = [{ id: "mas1", billing: BILLING.mas }, { id: "mas2", billing: BILLING.mas }];
  assert.deepEqual(C.claraPraxisAus({ clientId: "solo", eigen: BILLING.sprache, gaeste }), SELBST("solo"));
  assert.deepEqual(C.claraPraxisAus({ clientId: "mas1", eigen: BILLING.mas, haupt: "solo", hauptBilling: BILLING.sprache, gaeste }), SELBST("mas1"));
});

await t("pur: kein MAS dabei - die kleine Assistentin des Kontos, das den Code erzeugt hat; ohne Sprachpaket bleibt jeder bei sich", () => {
  assert.deepEqual(C.claraPraxisAus({ clientId: "b", eigen: BILLING.ohne, haupt: "a", hauptBilling: BILLING.sprache }), { praxis: "a", verbund: true, stufe: "planr" });
  assert.deepEqual(C.claraPraxisAus({ clientId: "b", eigen: BILLING.sprache, haupt: "a", hauptBilling: BILLING.ohne }), SELBST("b"));
  assert.deepEqual(C.claraPraxisAus({ clientId: "b", eigen: BILLING.sprache, haupt: "a", hauptBilling: null }), SELBST("b"));
  assert.deepEqual(C.claraPraxisAus({ clientId: "a", eigen: BILLING.sprache, gaeste: [{ id: "b", billing: BILLING.sprache }] }), SELBST("a"));
});

await t("pur: ohne Kopplung bleibt jedes Konto bei sich", () => {
  assert.deepEqual(C.claraPraxisAus({ clientId: "allein", eigen: BILLING.mas }), SELBST("allein"));
  assert.deepEqual(C.claraPraxisAus({ clientId: "allein", eigen: BILLING.sprache }), SELBST("allein"));
  assert.deepEqual(C.claraPraxisAus({ clientId: "a", eigen: BILLING.sprache, haupt: "a", hauptBilling: BILLING.mas }), SELBST("a"));
  assert.deepEqual(C.claraPraxisAus({ clientId: "a", eigen: BILLING.sprache, gaeste: [{ id: "a", billing: BILLING.mas }] }), SELBST("a"));
});

await t("Hinweistexte nennen MAS-Konto bzw. Standalone-Konto", () => {
  assert.equal(C.kopplungHinweis("voll"), "Sie nutzen die Assistentin aus dem gekoppelten MAS-Konto.");
  assert.equal(C.kopplungHinweis("planr"), "Sie nutzen die Assistentin aus dem gekoppelten Standalone-Konto.");
  assert.match(C.kopplungName("voll"), /MAS-Konto/);
  assert.match(C.kopplungName("planr"), /Standalone-Konto/);
});

// ---- mit dem echten Kopplungs-Spiegel (hauptFuer, gaesteFuer) ----
const CLIENTS = {
  mas: { name: "MAS" },
  soloAnMas: { planrVerbund: { haupt: "mas", register: "mas" } },
  solo: { name: "Standalone" },
  masAnSolo: { planrVerbund: { haupt: "solo", register: "solo" } },
  drittAnSolo: { planrVerbund: { haupt: "solo", register: "solo" } },
  soloOhne: { name: "ohne Sprachpaket" },
  anOhne: { planrVerbund: { haupt: "soloOhne", register: "soloOhne" } },
  soloZwei: { name: "Standalone mit zwei MAS" },
  mas1: { planrVerbund: { haupt: "soloZwei", register: "soloZwei" } },
  mas2: { planrVerbund: { haupt: "soloZwei", register: "soloZwei" } },
  anKaputt: { planrVerbund: { haupt: "billing-weg", register: "billing-weg" } },
  schief: { planrVerbund: { haupt: "../boese", register: "mas" } },
  selbst: { planrVerbund: { haupt: "selbst", register: "selbst" } },
  allein: { name: "Allein" },
  alleinMas: { name: "Allein mit MAS" },
};
const BILLING_VON = {
  mas: BILLING.mas, soloAnMas: BILLING.sprache,
  solo: BILLING.sprache, masAnSolo: BILLING.mas, drittAnSolo: BILLING.ohne,
  soloOhne: BILLING.ohne, anOhne: BILLING.sprache,
  soloZwei: BILLING.sprache, mas1: BILLING.mas, mas2: BILLING.mas,
  allein: BILLING.sprache, alleinMas: BILLING.mas,
};
let gelesen = [];
let gesucht = [];
V._setVerbundLaden(async (id) => {
  if (id === "firestore-weg") throw new Error("weg");
  return CLIENTS[id] ?? null;
}, async (haupt) => {
  gesucht.push(haupt);
  if (haupt === "suche-weg") throw new Error("weg");
  return Object.entries(CLIENTS).filter(([, d]) => d.planrVerbund?.haupt === haupt).map(([id]) => id);
});
C._setVerbundClaraLaden({
  billing: async (id) => {
    gelesen.push(id);
    if (id === "billing-weg") throw new Error("weg");
    return BILLING_VON[id] ?? null;
  },
});

await t("hauptFuer: nur das angehaengte Konto hat eins", async () => {
  assert.equal(await V.hauptFuer("soloAnMas"), "mas");
  assert.equal(await V.hauptFuer("mas"), "");
  assert.equal(await V.hauptFuer("allein"), "");
  assert.equal(await V.hauptFuer("unbekannt"), "");
  assert.equal(await V.hauptFuer("schief"), "");
  assert.equal(await V.hauptFuer("selbst"), "");
  assert.equal(await V.hauptFuer("firestore-weg"), "");
  assert.equal(await V.hauptFuer(""), "");
});

await t("gaesteFuer: die angehaengten Konten, sortiert, mit Zwischenspeicher, wirft nie", async () => {
  gesucht = [];
  assert.deepEqual(await V.gaesteFuer("solo"), ["drittAnSolo", "masAnSolo"]);
  assert.deepEqual(await V.gaesteFuer("solo"), ["drittAnSolo", "masAnSolo"]);
  assert.deepEqual(gesucht, ["solo"]);
  assert.deepEqual(await V.gaesteFuer("allein"), []);
  assert.deepEqual(await V.gaesteFuer("suche-weg"), []);
  assert.deepEqual(await V.gaesteFuer("../boese"), []);
  assert.deepEqual(await V.gaesteFuer(""), []);
});

await t("MAS-Konto hat den Code erzeugt: das Standalone-Konto nutzt die volle Clara", async () => {
  assert.deepEqual(await C.claraPraxisFuer("soloAnMas"), { praxis: "mas", verbund: true, stufe: "voll" });
  assert.deepEqual(await C.claraPraxisFuer("mas"), SELBST("mas"));
});

await t("Standalone hat den Code erzeugt: beide nutzen die volle Clara des MAS-Kontos", async () => {
  assert.deepEqual(await C.claraPraxisFuer("masAnSolo"), SELBST("masAnSolo"));
  assert.deepEqual(await C.claraPraxisFuer("solo"), { praxis: "masAnSolo", verbund: true, stufe: "voll" });
  assert.deepEqual(await C.claraPraxisFuer("drittAnSolo"), { praxis: "masAnSolo", verbund: true, stufe: "voll" });
});

await t("zwei MAS-Konten am selben Standalone: nicht raten", async () => {
  assert.deepEqual(await C.claraPraxisFuer("soloZwei"), SELBST("soloZwei"));
  assert.deepEqual(await C.claraPraxisFuer("mas1"), SELBST("mas1"));
});

await t("kein MAS und kein Sprachpaket beim Code-Konto: das angehaengte Konto bleibt bei seiner Buchung", async () => {
  assert.deepEqual(await C.claraPraxisFuer("anOhne"), SELBST("anOhne"));
});

await t("ohne Kopplung aendert sich nichts, und es wird kein Billing gelesen", async () => {
  gelesen = [];
  assert.deepEqual(await C.claraPraxisFuer("allein"), SELBST("allein"));
  assert.deepEqual(await C.claraPraxisFuer("alleinMas"), SELBST("alleinMas"));
  assert.deepEqual(await C.claraPraxisFuer("unbekannt"), SELBST("unbekannt"));
  assert.deepEqual(gelesen, []);
});

await t("schon geladenes Billing: ein MAS-Konto ohne Kopplung loest keine Suche aus, ein gekoppeltes liest sich nicht doppelt", async () => {
  gesucht = [];
  gelesen = [];
  assert.deepEqual(await C.claraPraxisFuer("mas-neu", { eigen: BILLING.mas }), SELBST("mas-neu"));
  assert.deepEqual(gesucht, []);
  assert.deepEqual(await C.claraPraxisFuer("masAnSolo", { eigen: BILLING.mas }), SELBST("masAnSolo"));
  assert.deepEqual(gelesen, ["solo"]);
});

await t("Fehler beim Lesen: nie werfen, das Konto selbst", async () => {
  assert.deepEqual(await C.claraPraxisFuer("anKaputt"), SELBST("anKaputt"));
  assert.deepEqual(await C.claraPraxisFuer("firestore-weg"), SELBST("firestore-weg"));
  assert.deepEqual(await C.claraPraxisFuer("suche-weg"), SELBST("suche-weg"));
  assert.deepEqual(await C.claraPraxisFuer(""), SELBST(""));
});

await t("Notaus MAS_VERBUND_CLARA=0: jedes Konto hat wieder nur seine eigene Clara", async () => {
  process.env.MAS_VERBUND_CLARA = "0";
  try {
    assert.deepEqual(await C.claraPraxisFuer("soloAnMas"), SELBST("soloAnMas"));
    assert.deepEqual(await C.claraPraxisFuer("solo"), SELBST("solo"));
  } finally {
    delete process.env.MAS_VERBUND_CLARA;
  }
  assert.equal((await C.claraPraxisFuer("soloAnMas")).verbund, true);
});

await t("Notaus MAS_PLANR_VERBUND=0 schaltet auch die mitgenutzte Clara ab", async () => {
  process.env.MAS_PLANR_VERBUND = "0";
  try {
    assert.equal(await V.hauptFuer("soloAnMas"), "");
    assert.deepEqual(await V.gaesteFuer("solo"), []);
    assert.deepEqual(await C.claraPraxisFuer("soloAnMas"), SELBST("soloAnMas"));
    assert.deepEqual(await C.claraPraxisFuer("solo"), SELBST("solo"));
  } finally {
    delete process.env.MAS_PLANR_VERBUND;
  }
});

console.log(`verbundClara: ${ok} ok`);
