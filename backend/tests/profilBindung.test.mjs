// Profil-Bindung fuer /clara/session (21.11.2026): das Standardprofil geht nur an die Standardpraxis.
// Start: node backend/tests/profilBindung.test.mjs  (ohne Firestore, Billing und Booking werden untergeschoben)
import assert from "node:assert/strict";
const B = await import("../src/clara/profilBindung.js");
const P = await import("../src/hkp/planrClara.js");

let ok = 0;
async function t(name, fn) { await fn(); ok += 1; console.log("  ok -", name); }

const STANDARD = "standardpraxis";
const gestern = new Date(Date.now() - 864e5).toISOString();
const morgen = new Date(Date.now() + 864e5).toISOString();

const BILLING = {
  [STANDARD]: { subscriptions: { crew: { tier: "premium" } } },
  praxis2: null,
  abgelaufen: { subscriptions: { planr: { enabled: true, testabo: true, testaboBis: gestern, sprachsteuerung: true } } },
  gekuendigt: { subscriptions: { planr: { enabled: false, sprachsteuerung: true } } },
  planrSprache: { subscriptions: { planr: { enabled: true, testabo: true, testaboBis: morgen, sprachsteuerung: true } } },
  planrOhne: { subscriptions: { planr: { enabled: true, testabo: false } } },
  masOhneProfil: { subscriptions: { crew: { tier: "premium" } } },
};
const BOOKING = {
  [STANDARD]: { calendars: [] },
  praxis2: { claraProfileId: "clara_praxis2" },
};
let bookingGelesen = 0;
const ladeBooking = async (id) => {
  bookingGelesen += 1;
  if (id === "firestoreWeg") throw new Error("firestore weg");
  if (!BOOKING[id]) throw new Error(`no mas_config/booking config for client ${id}`);
  return BOOKING[id];
};
P._setBillingLaden(async (id) => BILLING[id] ?? null);

const frage = (clientId, gewuenscht) => B.sitzungsEntscheidung({
  clientId, gewuenscht, planrProfil: P.sitzungsProfil, ladeBooking,
  standardClient: STANDARD, standardProfil: "clara_meddent",
});

console.log("profilBindung");

await t("Standardpraxis bekommt das Standardprofil", async () => {
  assert.deepEqual(await frage(STANDARD), { profileId: "clara_meddent" });
});

await t("Standardpraxis: ausdruecklicher Wunsch gilt wie bisher, ohne Booking zu lesen", async () => {
  bookingGelesen = 0;
  assert.deepEqual(await frage(STANDARD, "pickadoc_demo"), { profileId: "pickadoc_demo" });
  assert.equal(bookingGelesen, 0);
});

await t("Praxis mit eigenem Profil bekommt ihr eigenes", async () => {
  assert.deepEqual(await frage("praxis2"), { profileId: "clara_praxis2" });
});

await t("Praxis mit eigenem Profil: fremder Wunsch aendert nichts", async () => {
  assert.deepEqual(await frage("praxis2", "clara_meddent"), { profileId: "clara_praxis2" });
});

for (const [name, id] of [
  ["PlanR-Probe abgelaufen", "abgelaufen"],
  ["PlanR gekuendigt", "gekuendigt"],
  ["erfundene Praxis-ID ohne Billing", "zzz-probe-abgelaufen"],
  ["MAS gebucht, aber kein eigenes Profil", "masOhneProfil"],
  ["Booking nicht lesbar", "firestoreWeg"],
]) {
  await t(`${name}: keine Sitzung, nie das Standardprofil`, async () => {
    const a = await frage(id);
    assert.equal(a.gesperrt, true);
    assert.equal(a.error, "clara_nicht_eingerichtet");
    assert.equal(a.message, B.NICHT_EINGERICHTET);
    assert.equal(a.profileId, undefined);
  });
  await t(`${name}: auch mit Wunsch clara_meddent keine Sitzung`, async () => {
    const a = await frage(id, "clara_meddent");
    assert.equal(a.gesperrt, true);
    assert.equal(a.profileId, undefined);
  });
}

await t("PlanR mit Sprachpaket: weiter die HKP-Clara, auch gegen einen Wunsch", async () => {
  assert.deepEqual(await frage("planrSprache"), { profileId: P.planrProfilId() });
  assert.deepEqual(await frage("planrSprache", "clara_meddent"), { profileId: P.planrProfilId() });
});

await t("PlanR ohne Sprachpaket: weiter 'nicht gebucht'", async () => {
  const a = await frage("planrOhne");
  assert.equal(a.gesperrt, true);
  assert.equal(a.error, "clara_nicht_gebucht");
  assert.equal(a.message, P.NICHT_GEBUCHT);
});

await t("leere Praxis-ID: keine Sitzung", async () => {
  assert.equal((await frage("")).gesperrt, true);
  assert.equal((await B.sitzungsEntscheidung({
    clientId: "", gewuenscht: "", planrProfil: P.sitzungsProfil, ladeBooking, standardClient: "", standardProfil: "clara_meddent",
  })).gesperrt, true);
});

await t("Notaus MAS_PROFIL_BINDUNG=0: Verhalten wie vorher", async () => {
  process.env.MAS_PROFIL_BINDUNG = "0";
  try {
    assert.deepEqual(await frage("abgelaufen"), { profileId: "clara_meddent" });
    assert.deepEqual(await frage("abgelaufen", "irgendwas"), { profileId: "irgendwas" });
    assert.deepEqual(await frage("praxis2"), { profileId: "clara_praxis2" });
    assert.deepEqual(await frage(STANDARD), { profileId: "clara_meddent" });
  } finally {
    delete process.env.MAS_PROFIL_BINDUNG;
  }
});

await t("Notaus MAS_PLANR_SPERRE=0 hebt die Profil-Bindung nicht auf", async () => {
  process.env.MAS_PLANR_SPERRE = "0";
  try {
    assert.equal((await frage("abgelaufen")).gesperrt, true);
    assert.deepEqual(await frage(STANDARD), { profileId: "clara_meddent" });
  } finally {
    delete process.env.MAS_PLANR_SPERRE;
  }
});

// Handy-Kopplung aus PlanR (/planr/clara/kopplung): erst "gebucht?", dann "kann die Praxis ueberhaupt sprechen?"
const kopplung = async (clientId) => {
  if (!P.kopplungErlaubt(BILLING[clientId] ?? null)) return { error: "nicht_gebucht" };
  return (await B.gespraechSperre({ clientId, planrProfil: P.sitzungsProfil, ladeBooking, standardClient: STANDARD })) || { ok: true };
};

await t("Kopplung: PlanR mit Sprachpaket bekommt den QR-Code", async () => {
  assert.deepEqual(await kopplung("planrSprache"), { ok: true });
});

await t("Kopplung: Standardpraxis mit voller Clara bekommt den QR-Code", async () => {
  assert.deepEqual(await kopplung(STANDARD), { ok: true });
});

await t("Kopplung: volle Clara ohne eigenes Profil -> 'nicht eingerichtet' statt QR-Code ins Leere", async () => {
  assert.deepEqual(await kopplung("masOhneProfil"), { error: "clara_nicht_eingerichtet", message: B.NICHT_EINGERICHTET });
});

await t("Kopplung: PlanR ohne Sprachpaket und abgelaufenes PlanR bleiben 'nicht gebucht'", async () => {
  assert.deepEqual(await kopplung("planrOhne"), { error: "nicht_gebucht" });
  assert.deepEqual(await kopplung("abgelaufen"), { error: "nicht_gebucht" });
});

await t("Kopplung: Notaus MAS_PROFIL_BINDUNG=0 gibt den QR-Code wie vorher", async () => {
  process.env.MAS_PROFIL_BINDUNG = "0";
  try {
    assert.deepEqual(await kopplung("masOhneProfil"), { ok: true });
  } finally {
    delete process.env.MAS_PROFIL_BINDUNG;
  }
});

P._setBillingLaden(null);
console.log(`profilBindung: ${ok} Pruefungen bestanden`);
process.exit(0);
