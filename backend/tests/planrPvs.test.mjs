import test from "node:test";
import assert from "node:assert/strict";
import { _setHolen, alsPatient, bewerten, isoGeburt, sucheImPvs } from "../src/hkp/planrPvs.js";

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
