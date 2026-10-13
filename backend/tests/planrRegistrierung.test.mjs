import test from "node:test";
import assert from "node:assert/strict";
import { praxisRegistrieren, RegistrierungFehler } from "../src/hkp/planrRegistrierung.js";

function falscheDb() {
  const daten = new Map();
  let n = 0;
  const ref = (pfad) => ({
    id: pfad.split("/").pop(),
    pfad,
    set: async (d) => { daten.set(pfad, d); },
    delete: async () => { daten.delete(pfad); },
    collection: (c) => sammlung(`${pfad}/${c}`),
  });
  const sammlung = (pfad) => ({ doc: (id) => ref(`${pfad}/${id ?? `auto${++n}`}`) });
  return { daten, collection: (c) => sammlung(c) };
}

function falscheAuth({ vorhanden = [], claimsFehler = false } = {}) {
  const konten = new Map(vorhanden.map((e) => [e, { uid: `alt-${e}` }]));
  const claims = new Map();
  return {
    konten, claims,
    getUserByEmail: async (e) => { if (konten.has(e)) return konten.get(e); const err = new Error("nf"); err.code = "auth/user-not-found"; throw err; },
    createUser: async ({ email }) => { const u = { uid: `uid-${konten.size + 1}` }; konten.set(email, u); return u; },
    setCustomUserClaims: async (uid, c) => { if (claimsFehler) throw new Error("claims kaputt"); claims.set(uid, c); },
    deleteUser: async (uid) => { for (const [e, u] of konten) if (u.uid === uid) konten.delete(e); },
  };
}

const eingabe = {
  email: "Chefin@Praxis-Test.de", passwort: "geheim123", vorname: "Anna", nachname: "Muster", titel: "Dr.",
  praxis: { name: "Zahnarztpraxis Muster", strasse: "Weg 1", plz: "40235", ort: "Düsseldorf" },
  sprachsteuerung: true, paket: "planr_clara", buchung: "B-20261013-ABC", mandatsreferenz: "PLANR-X",
};

test("legt Praxis, Admin-Konto und PlanR-Abo an", async () => {
  const db = falscheDb(), auth = falscheAuth();
  const r = await praxisRegistrieren(eingabe, { db, auth, jetzt: new Date("2026-10-13T08:00:00Z") });
  assert.ok(auth.konten.has("chefin@praxis-test.de"));
  assert.deepEqual(auth.claims.get(r.uid), { role: "admin", isAdmin: true, clientId: r.clientId });
  const billing = db.daten.get(`clients/${r.clientId}/settings/billing`);
  assert.equal(billing.subscriptions.planr.enabled, true);
  assert.equal(billing.subscriptions.planr.sprachsteuerung, true);
  assert.equal(billing.locationPackages[r.locationId].mas.enabled, false);
  const nutzer = db.daten.get(`clients/${r.clientId}/users/${r.uid}`);
  assert.equal(nutzer.isAdmin, true);
  assert.equal(db.daten.get(`clients/${r.clientId}`).name, "Zahnarztpraxis Muster");
});

test("vorhandenes Konto wird nicht angefasst", async () => {
  const db = falscheDb(), auth = falscheAuth({ vorhanden: ["chefin@praxis-test.de"] });
  await assert.rejects(praxisRegistrieren(eingabe, { db, auth }), (e) => e instanceof RegistrierungFehler && e.status === 409);
  assert.equal(db.daten.size, 0);
});

test("kurzes Passwort und Notaus", async () => {
  await assert.rejects(praxisRegistrieren({ ...eingabe, passwort: "kurz" }, { db: falscheDb(), auth: falscheAuth() }), (e) => e.code === "passwort");
  process.env.MAS_PLANR_REGISTRIEREN = "0";
  try {
    await assert.rejects(praxisRegistrieren(eingabe, { db: falscheDb(), auth: falscheAuth() }), (e) => e.code === "abgeschaltet");
  } finally {
    delete process.env.MAS_PLANR_REGISTRIEREN;
  }
});

test("Fehler mittendrin räumt Konto und Dokumente wieder ab", async () => {
  const db = falscheDb(), auth = falscheAuth({ claimsFehler: true });
  await assert.rejects(praxisRegistrieren(eingabe, { db, auth }), /claims kaputt/);
  assert.equal(auth.konten.size, 0);
  assert.equal(db.daten.size, 0);
});
