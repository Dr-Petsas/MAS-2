import test from "node:test";
import assert from "node:assert/strict";
import { _ohnePvsVergessen, _setHolen, alsPatient, bewerten, isoGeburt, passtGanz, pvsKennungAufloesen, sucheFuerPlan, sucheImPvs, sucheNurImPvsFuerPlan } from "../src/hkp/planrPvs.js";
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
  // Plaene/Befunde: auch die MAS-Praxis fragt das PVS; ohne Treffer weiter zur Kartei
  _ohnePvsVergessen();
  assert.equal((await pvsKennungAufloesen("masPraxis", { patient_nummer: "4711" }, { plan: true })).patient.id, "04711");
  assert.equal(await pvsKennungAufloesen("masPraxis", { patient_nummer: "999" }, { plan: true }), null);
  _setHolen(null);
});

test("sucheFuerPlan: MAS-Praxis mit Bridge zuerst im PVS, sonst Kartei (null)", async () => {
  process.env.PLANR_HKP_KEY = "k";
  _ohnePvsVergessen();
  let fragen = 0;
  _setHolen(async (url) => {
    fragen += 1;
    const q = new URL(url).searchParams.get("q");
    const patienten = q === "Prodromos Fanelas" ? [P("812", "Prodromos", "Fanelas")]
      : q === "Prodromos Kartei" ? [] : q === "prodromos" ? [P("813", "Prodromos", "Anders")] : [];
    return { ok: true, json: async () => ({ ok: true, patienten }) };
  });
  const r = await sucheFuerPlan("masPraxis", "Prodromos Fanelas");
  assert.equal(r.patients[0].id, "812");
  assert.equal(r.patients[0].quelle, "pvs");
  assert.equal(await sucheFuerPlan("masPraxis", "Niemand Da"), null);
  // im PVS nur ein anderer Prodromos: Teiltreffer zaehlt nicht, die Kartei sucht
  assert.equal(await sucheFuerPlan("masPraxis", "Prodromos Kartei"), null);
  assert.equal(passtGanz("Prodromos Fanelas", { firstName: "Prodromos", lastName: "Fanelas" }), true);
  assert.equal(passtGanz("Prodromos Fanelas", { firstName: "Prodromos", lastName: "Lagos" }), false);
  assert.equal(passtGanz("Prodromos Phanelas", { firstName: "Prodromos", lastName: "Fanelas" }), true);
  // PlanR-Praxis ohne MAS: searchPatient sucht dort ohnehin im PVS
  const vorher = fragen;
  assert.equal(await sucheFuerPlan("planrPraxis", "Prodromos Fanelas"), null);
  assert.equal(fragen, vorher);

  // Keine Bridge/kein PVS: ein paar Minuten nicht mehr fragen (keine Wartezeit vor jeder Kartei-Suche)
  _setHolen(async () => { fragen += 1; return { ok: false, json: async () => ({ ok: false, meldung: "Praxis unbekannt." }) }; });
  assert.equal(await sucheFuerPlan("ohneBridge", "Anna"), null);
  const danach = fragen;
  assert.equal(await sucheFuerPlan("ohneBridge", "Anna"), null);
  assert.equal(fragen, danach);

  process.env.MAS_PLAN_PVS_ZUERST = "0";
  _ohnePvsVergessen();
  assert.equal(await sucheFuerPlan("masPraxis", "Prodromos Fanelas"), null);
  delete process.env.MAS_PLAN_PVS_ZUERST;
  _setHolen(null);
});

test("Planung sucht nur im PVS (Chef 04.11.2026): kein Treffer bleibt leer, PVS aus ist ein Fehler, nie Kartei", async () => {
  process.env.PLANR_HKP_KEY = "k";
  _ohnePvsVergessen();
  _setHolen(async (url) => {
    const q = new URL(url).searchParams.get("q");
    const patienten = q === "Maria Partheni" ? [P("8787", "Maria", "Partheni", "1968-07-12")]
      : q === "maria" ? [P("900", "Maria", "Anders")] : [];
    return { ok: true, json: async () => ({ ok: true, patienten }) };
  });
  const r = await sucheNurImPvsFuerPlan("masPraxis", "Maria Partheni");
  assert.deepEqual(r.patients.map((p) => [p.id, p.quelle]), [["8787", "pvs"]]);
  const leer = await sucheNurImPvsFuerPlan("masPraxis", "Maria Niemand");
  assert.equal(leer.ok, true);
  assert.deepEqual(leer.patients, []);
  _setHolen(async () => ({ ok: false, json: async () => ({ ok: false, meldung: "Bridge offline." }) }));
  const aus = await sucheNurImPvsFuerPlan("masPraxis", "Maria Partheni");
  assert.equal(aus.ok, false);
  assert.match(aus.error, /Bridge offline/);
  // auch direkt danach (frueher 3 Minuten Kartei) wieder das PVS gefragt
  assert.equal((await sucheNurImPvsFuerPlan("masPraxis", "Maria Partheni")).ok, false);
  assert.equal(await sucheNurImPvsFuerPlan("planrPraxis", "Maria Partheni"), null);
  process.env.MAS_PLAN_PVS_ZUERST = "0";
  assert.equal(await sucheNurImPvsFuerPlan("masPraxis", "Maria Partheni"), null);
  delete process.env.MAS_PLAN_PVS_ZUERST;
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

test("sucheImPvs: verhoerter Name findet den DS-Win-Patienten (live 04.11.2026 'Prodomos Phanelas')", async () => {
  process.env.PLANR_HKP_KEY = "k";
  _ohnePvsVergessen();
  const kartei = [P("812", "Prodromos", "Fanelas"), P("813", "Prodromos", "Anders"), P("814", "Fanny", "Lasse")];
  const gefragt = [];
  // wie die Bridge: Teilwort-Suche ohne Klang
  _setHolen(async (url) => {
    const q = String(new URL(url).searchParams.get("q") || "").toLowerCase();
    gefragt.push(q);
    const patienten = kartei.filter((p) => `${p.vorname} ${p.name}`.toLowerCase().includes(q));
    return { ok: true, json: async () => ({ ok: true, patienten }) };
  });
  const r = await sucheFuerPlan("masPraxis", "Prodomos Phanelas");
  assert.deepEqual(r.patients.map((p) => p.id), ["812"]);
  assert.ok(gefragt.length <= 13, gefragt.join(","));
  assert.equal(passtGanz("Prodomos Phanelas", { firstName: "Prodromos", lastName: "Fanelas" }), true);
  assert.equal(passtGanz("Prodromos Fanela", { firstName: "Prodromos", lastName: "Fanelas" }), true);
  // kein Raten: ein Wort passt gar nicht -> nicht derselbe Patient
  assert.equal(passtGanz("Prodomos Lagos", { firstName: "Prodromos", lastName: "Fanelas" }), false);
  assert.equal(passtGanz("Anna Meier", { firstName: "Anna", lastName: "Maier" }), true);
  assert.equal(passtGanz("Anna Bauer", { firstName: "Anna", lastName: "Mauer" }), false);
  // treffsicherer Name: keine zweite Runde
  gefragt.length = 0;
  await sucheFuerPlan("masPraxis", "Prodromos Fanelas");
  assert.deepEqual(gefragt, ["prodromos fanelas"]);
  _setHolen(null);
});

test("Planung: verschluckter Anlaut findet den DS-Win-Patienten (live 04.11.2026 'Prodromus Anelas')", async () => {
  process.env.PLANR_HKP_KEY = "k";
  _ohnePvsVergessen();
  const kartei = [P("812", "Prodromos", "Fanelas"), P("820", "Prodromos", "Kallidis"),
    P("821", "Prodromos", "Paschalidis"), P("822", "Prodromos", "Liakos")];
  _setHolen(async (url) => {
    const q = String(new URL(url).searchParams.get("q") || "").toLowerCase();
    const patienten = kartei.filter((p) => `${p.vorname} ${p.name}`.toLowerCase().includes(q));
    return { ok: true, json: async () => ({ ok: true, patienten }) };
  });
  const r = await sucheNurImPvsFuerPlan("masPraxis", "Prodromus Anelas");
  assert.deepEqual(r.patients.map((p) => p.id), ["812"]);
  const fanelas = { firstName: "Prodromos", lastName: "Fanelas" };
  assert.equal(passtGanz("Prodromus Anelas", fanelas), true);
  for (const lastName of ["Kallidis", "Paschalidis", "Liakos"]) {
    assert.equal(passtGanz("Prodromus Anelas", { firstName: "Prodromos", lastName }), false, lastName);
  }
  // nur genau der erste Buchstabe, nur bei langen Woertern, sonst kein Raten
  assert.equal(passtGanz("Prodromus Nelas", fanelas), false);
  assert.equal(passtGanz("Prodromus Anelis", fanelas), false);
  assert.equal(passtGanz("Anna Eier", { firstName: "Anna", lastName: "Meier" }), false);
  assert.equal(passtGanz("Anna Bauer", { firstName: "Anna", lastName: "Mauer" }), false);
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
