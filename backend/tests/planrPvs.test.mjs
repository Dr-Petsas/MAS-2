import test from "node:test";
import assert from "node:assert/strict";
import { _setHolen, alsPatient, bewerten, isoGeburt, pvsKennungAufloesen, sucheImPvs } from "../src/hkp/planrPvs.js";
import { _setBillingLaden } from "../src/hkp/planrClara.js";

_setBillingLaden(async (id) => (id === "planrPraxis"
  ? { subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }
  : { subscriptions: { crew: { tier: "premium" }, planr: { enabled: true, sprachsteuerung: true } } }));

test("Geburtsdatum in den gesprochenen Formen", () => {
  const heute = new Date("2026-10-12T12:00:00Z");
  assert.equal(isoGeburt("1972-03-05", heute), "1972-03-05");
  assert.equal(isoGeburt("5.3.1972", heute), "1972-03-05");
  assert.equal(isoGeburt("05.03.72", heute), "1972-03-05");
  assert.equal(isoGeburt("1.2.15", heute), "2015-02-01");
  assert.equal(isoGeburt("5. März 1972", heute), "1972-03-05");
  assert.equal(isoGeburt("12 mai 1980", heute), "1980-05-12");
  assert.equal(isoGeburt("31.02.1972", heute), null);
  assert.equal(isoGeburt("1.1.2030", heute), null);
  assert.equal(isoGeburt("1972", heute), null);
});

test("pvsKennungAufloesen: Nummer genau, Datum mit Name, nur fuer PlanR-Praxen", async () => {
  process.env.PLANR_HKP_KEY = "k";
  const gefragt = [];
  _setHolen(async (url) => {
    const u = new URL(url);
    gefragt.push(Object.fromEntries(u.searchParams));
    const nr = u.searchParams.get("nummer"), geb = u.searchParams.get("geburt");
    let patienten = [];
    if (nr === "4711") patienten = [P("04711", "Anna", "Müller")];
    if (geb === "1972-03-05") patienten = [P("1", "Anna", "Müller"), P("2", "Hans", "Berg")];
    return { ok: true, json: async () => ({ ok: true, patienten }) };
  });
  const a = await pvsKennungAufloesen("planrPraxis", { patient_nummer: "47 11", name: "Anna Myller" });
  assert.equal(a.patient.id, "04711");
  assert.equal(a.patient.identifiziert, "nummer");
  assert.equal(gefragt.at(-1).nummer, "4711");

  const b = await pvsKennungAufloesen("planrPraxis", { geburtsdatum: "5.3.72", name: "Anna" });
  assert.equal(b.patient.id, "1");
  const c = await pvsKennungAufloesen("planrPraxis", { geburtsdatum: "1972-03-05" }, { mehrfach: (l) => `${l.length} Kandidaten` });
  assert.equal(c.kandidaten.length, 2);
  assert.match(c.message, /mehrere\. 2 Kandidaten/);
  const d = await pvsKennungAufloesen("planrPraxis", { patient_nummer: "999" });
  assert.deepEqual(d.kandidaten, []);
  assert.match(d.message, /Patientennummer 999/);

  // ohne Merkmal oder MAS-Praxis: nicht zustaendig, Namenssuche wie bisher
  assert.equal(await pvsKennungAufloesen("planrPraxis", { name: "Anna" }), null);
  assert.equal(await pvsKennungAufloesen("masPraxis", { patient_nummer: "4711" }), null);
  _setHolen(null);
});

const P = (id, vorname, name, geburtsdatum = "1972-03-05") => ({ id, vorname, name, geburtsdatum, ort: "" });

test("PVS-Treffer haben dieselbe Form wie Kartei-Treffer und sind als pvs markiert", () => {
  const p = alsPatient(P("123", "Anna", "Müller", "05.03.1972"));
  assert.equal(p.id, "123");
  assert.equal(p.firstName, "Anna");
  assert.equal(p.lastName, "Müller");
  assert.equal(p.birthDate, "1972-03-05");
  assert.equal(p.quelle, "pvs");
  assert.equal(isoGeburt("1980-01-02T00:00:00Z"), "1980-01-02");
  assert.equal(isoGeburt(""), null);
});

test("bewerten: alle Woerter vor einzelnen, gleich vor Klang", () => {
  const liste = [P("1", "Anna", "Müller"), P("2", "Hans", "Müller"), P("3", "Anna", "Schmidt"), P("4", "Anna", "Mueller-Lang")]
  // Doppelname passt auch -> Clara fragt nach
  assert.deepEqual(bewerten("Anna Müller", liste).map((p) => p.id), ["1", "4"]);
  assert.deepEqual(bewerten("Anna Müller-Lang", liste).map((p) => p.id), ["4"]);
  assert.deepEqual(bewerten("Hans", liste).map((p) => p.id), ["2"]);
  // falsch verstanden: "Myller" klingt wie Müller
  assert.deepEqual(bewerten("Anna Myller", liste.slice(0, 3)).map((p) => p.id), ["1"]);
  assert.deepEqual(bewerten("Zorro", liste), []);
});

test("sucheImPvs: ganzer Name, sonst einzelne Woerter; Schluessel und clientId gehen mit", async () => {
  process.env.PLANR_HKP_KEY = "k";
  process.env.PLANR_URL = "https://planr.test";
  const gefragt = [];
  _setHolen(async (url, init) => {
    const u = new URL(url);
    gefragt.push(u.searchParams.get("q"));
    assert.equal(u.origin + u.pathname, "https://planr.test/api/intern/pvs/patienten");
    assert.equal(u.searchParams.get("clientId"), "praxisA");
    assert.equal(init.headers["X-PlanR-Key"], "k");
    const q = u.searchParams.get("q");
    const patienten = q === "Hanna Myller" ? [] : q === "myller" ? [] : q === "hanna" ? [P("7", "Hanna", "Müller"), P("8", "Hanna", "Berg")] : [];
    return { ok: true, json: async () => ({ ok: true, patienten }) };
  });
  const r = await sucheImPvs("praxisA", "Hanna Myller");
  assert.equal(r.ok, true);
  assert.equal(r.quelle, "pvs");
  assert.deepEqual(r.patients.map((p) => p.id), ["7"]);
  assert.deepEqual(gefragt.sort(), ["Hanna Myller", "hanna", "myller"].sort());
  _setHolen(null);
});

test("sucheImPvs: Bridge aus -> verstaendlicher Fehler statt leerer Liste", async () => {
  process.env.PLANR_HKP_KEY = "k";
  _setHolen(async () => ({ ok: false, json: async () => ({ ok: false, meldung: "" }) }));
  const r = await sucheImPvs("praxisA", "Anna Müller");
  assert.equal(r.ok, false);
  assert.match(r.error, /PlanR-Bridge/);
  _setHolen(async () => { throw new Error("netz"); });
  assert.equal((await sucheImPvs("praxisA", "Anna")).ok, false);
  _setHolen(null);
});
