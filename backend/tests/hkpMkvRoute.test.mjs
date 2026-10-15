// Fuellungs-MKV per Sprache (Chef 15.10.2026): hkp_create_draft mit planart=mkv oder Fuellungs-Wortlaut, gerechnet mit
// der Engine des MKV-Planers, Befund nur zur Pruefung, abgelegt fuer die PlanR-Uebersicht (planrEntwuerfe).
// PlanR ist ein lokaler Nachbau; Entwuerfe landen in der Test-Praxis und werden wieder geloescht.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

const CID = "zzz-mas2-mkv";
process.env.PLANR_HKP_KEY = "k";
process.env.MAS_HKP_AUSFUEHRUNG_FRAGE = "0";

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const DAMPSOFT = Object.fromEntries([...OK, ...UK].map((z) => [z, ""]));
Object.assign(DAMPSOFT, { 18: "f", 28: "f", 46: "f", 16: "k", 36: "pw" });
const vorgaenge = [];
const kurz = () => new Promise((r) => setTimeout(r, 80));

const planr = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://planr");
  let roh = "";
  for await (const c of req) roh += c;
  const senden = (status, d) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  if (req.headers["x-planr-key"] !== "k" || u.searchParams.get("clientId") !== CID) return senden(401, { ok: false });
  if (u.pathname === "/api/intern/pvs/patienten") {
    return senden(200, { ok: true, patienten: [{ id: "4713", vorname: "Karl", name: "Kassentest", geburtsdatum: "1971-02-05" }] });
  }
  if (u.pathname === "/api/intern/befund/vorgang") {
    vorgaenge.push(JSON.parse(roh));
    return senden(200, { ok: true, vorgang: {} });
  }
  if (u.pathname === "/api/intern/befund/aenderung") return senden(200, { ok: true, befund: {} });
  if (u.pathname === "/api/intern/pvs/befund") {
    return senden(200, { ok: true, pvs: "Dampsoft", patient: "4713", datum: "2026-10-12", zaehne: DAMPSOFT });
  }
  return senden(404, { ok: false });
});
await new Promise((r) => planr.listen(0, "127.0.0.1", r));
process.env.PLANR_URL = `http://127.0.0.1:${planr.address().port}`;

const { _setBillingLaden } = await import("../src/hkp/planrClara.js");
_setBillingLaden(async () => ({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }));
const { default: router, mkvGesagt, sprachFolgeText } = await import("../src/routes/hkp.js");
const { hkpListe } = await import("../src/hkp/store.js");
const { entwurfLesen, entwurfLoeschenFuerTest } = await import("../src/hkp/planrEntwuerfe.js");
const { zuruecknehmen } = await import("../src/clara/rueckgaengig.js");

const app = express();
app.use(express.json());
app.use(router);
const mas = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
const basis = `http://127.0.0.1:${mas.address().port}`;
const angelegt = [];

async function rufe(body, pfad = "/tools/hkp-create-draft") {
  const r = await fetch(`${basis}${pfad}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": CID }, body: JSON.stringify({ name: "Karl Kassentest", ...body }),
  });
  const d = await r.json();
  if (d.entwurfId) angelegt.push(d.entwurfId);
  return d;
}
const planrRuf = (pfad, init = {}) => fetch(`${basis}/planr${pfad}${pfad.includes("?") ? "&" : "?"}clientId=${CID}`, {
  ...init, headers: { "X-PlanR-Key": "k", "Content-Type": "application/json" },
}).then(async (r) => ({ status: r.status, d: await r.json() }));

test.after(async () => {
  for (const id of angelegt) await entwurfLoeschenFuerTest(CID, id).catch(() => {});
  _setBillingLaden(null);
  mas.close();
  planr.close();
});

test("Fuellungs-Wortlaut: ohne Quellen-Frage vorlesen, nach dem Ja als MKV-Entwurf ohne Regler abgelegt, kein HKP", async () => {
  vorgaenge.length = 0;
  const hkpsVorher = (await hkpListe(CID)).length;
  const vorschau = await rufe({ auftrag: "Komposit an 36 mo und 37 okklusal" });
  assert.equal(vorschau.rueckfrage, "vorlesen", vorschau.message);
  assert.match(vorschau.message, /^Bevor ich anlege, bitte prüfen: Füllungs-Mehrkostenvereinbarung für (Herrn )?Karl Kassentest/);
  assert.match(vorschau.message, /Kompositfüllung in Adhäsivtechnik, zweiflächig an 36/);
  assert.match(vorschau.message, /Mehrkosten für den Patienten .+ Euro.*, die Kasse trägt .+ Euro/);
  assert.match(vorschau.message, /Zahn 36: laut 01 partieller Substanzdefekt/);
  assert.doesNotMatch(vorschau.message, /Festzuschuss|Eigenanteil|Welchen Befund/);
  assert.ok(vorschau.card, "Zahnschema auf dem Handy");
  const offen = await rufe({ frage: "Wie hoch sind die Mehrkosten?" }, "/tools/hkp-details");
  assert.match(offen.message, /^Die Füllungs-Mehrkostenvereinbarung für (Herrn )?Karl Kassentest ist noch nicht angelegt/);
  const fertig = await rufe({ auftrag: "Komposit an 36 mo und 37 okklusal", bestaetigt: true });
  assert.ok(fertig.entwurfId, fertig.message);
  assert.match(fertig.message, /im Planer Füllungs-MKV als Entwurf/);
  assert.equal(fertig.undo?.art, "planr_entwurf");
  const e = await entwurfLesen(CID, fertig.entwurfId);
  assert.equal(e.modul, "kons-mkv");
  const plan = JSON.parse(e.planJson);
  assert.equal(plan.regler, undefined, "der Planer rechnet mit dem Mehrkosten-Modell der Praxis");
  assert.deepEqual(plan.zaehne["36"], { therapie: "komposit", flaechen: 2 });
  assert.deepEqual([plan.patient.name, plan.patient.vorname, plan.patient.geburtsdatum], ["Kassentest", "Karl", "1971-02-05"]);
  assert.ok(e.betrag > 0);
  assert.equal((await hkpListe(CID)).length, hkpsVorher);
  await kurz();
  assert.ok(vorgaenge.length && vorgaenge.every((v) => v.modul === "kons-mkv"), JSON.stringify(vorgaenge.map((v) => v.modul)));
  assert.deepEqual(vorgaenge.find((v) => v.phase === "angelegt")?.plan, { 36: { TP: "K2", R: "" }, 37: { TP: "K1", R: "" } });
});

test("Rueckfrage Flaechen: die Antwort ohne Fuellungswort ergaenzt den Auftrag; Befund-Konflikt fragt nach", async () => {
  const fl = await rufe({ auftrag: "Kompositfüllung an 36 und 37" });
  assert.equal(fl.rueckfrage, "flaechen", fl.message);
  assert.equal(fl.message, "Wie viele Flächen jeweils an 36 und 37?");
  const vorschau = await rufe({ auftrag: "beide mod" });
  assert.equal(vorschau.rueckfrage, "vorlesen", vorschau.message);
  assert.match(vorschau.message, /dreiflächig an 36 und 37/);
  const konflikt = await rufe({ auftrag: "Komposit an 46 mo", planart: "mkv" });
  assert.equal(konflikt.rueckfrage, "befund_konflikt");
  assert.match(konflikt.message, /Laut Befund ist 46 ein fehlender Zahn/);
  const richtig = await rufe({ auftrag: "47 natürlich" });
  assert.equal(richtig.rueckfrage, "vorlesen", richtig.message);
  assert.match(richtig.message, /zweiflächig an 47\./);
  assert.doesNotMatch(richtig.message, /an 46/);
  const inlay = await rufe({ auftrag: "47 mod Keramikinlay mit Provisorium", planart: "mkv" });
  assert.match(inlay.message, /Einlagefüllung \(Inlay\), dreiflächig an 47/);
  assert.match(inlay.message, /Abdruck angenommen/);
});

test("sprachFolgeText: Teilantwort ergaenzt, Konfliktzahn wird ersetzt, neuer vollstaendiger Auftrag gilt allein", () => {
  assert.equal(sprachFolgeText({}, "Komposit 36 mo"), "Komposit 36 mo");
  assert.equal(sprachFolgeText({ teilAuftrag: "Komposit an 36 und 37." }, "beide mod"), "Komposit an 36 und 37. beide mod");
  assert.equal(sprachFolgeText({ teilAuftrag: "Komposit an 46 mo", teilKonflikt: "46" }, "47"), "Komposit an 47 mo");
  assert.equal(sprachFolgeText({ teilAuftrag: "Komposit an 46 mo", teilKonflikt: "46" }, "nein, 47 mod"), "Komposit an 47 mo. 47 mod");
  assert.equal(sprachFolgeText({ teilAuftrag: "Komposit an 46 mo" }, "Inlay 47 mod"), "Inlay 47 mod");
  assert.equal(sprachFolgeText({ teilAuftrag: "Komposit an 36" }, "Komposit an 36 mod"), "Komposit an 36 mod");
});

test("PlanR holt den MKV-Entwurf ab; Rueckgaengig vorher verwirft", async () => {
  await rufe({ auftrag: "Mehrkostenvereinbarung Komposit 37 o" });
  const fertig = await rufe({ auftrag: "Mehrkostenvereinbarung Komposit 37 o", bestaetigt: true });
  assert.ok(fertig.entwurfId, fertig.message);
  const da = (await planrRuf("/entwuerfe")).d.entwuerfe.find((x) => x.id === fertig.entwurfId);
  assert.equal(da?.modul, "kons-mkv");
  assert.deepEqual(da.plan.zaehne["37"], { therapie: "komposit", flaechen: 1 });
  const u = await zuruecknehmen(CID, fertig.undo);
  assert.equal(u.ok, true, u.message);
  assert.equal((await entwurfLesen(CID, fertig.entwurfId)).status, "verworfen");
});

test("Waehrend eines Zahnersatz-Plans schaltet das Wort 'Fuellung' nicht auf MKV; mkvGesagt; Notaus MAS_MKV=0", async () => {
  assert.equal(mkvGesagt("Komposit 36 mo"), true);
  assert.equal(mkvGesagt("MKV für Herrn Kassentest"), true);
  assert.equal(mkvGesagt("Aufbau an 46 dreiflächig mit Glasfaserstift"), true);
  assert.equal(mkvGesagt("Krone auf 36 mit Aufbaufüllung"), false);
  assert.equal(mkvGesagt("Brücke von 14 auf 16"), false);
  const hkp = await rufe({ auftrag: "Brücke von 45 auf 47", befund: "aus Dampsoft" });
  assert.equal(hkp.rueckfrage, "vorlesen", hkp.message);
  const weiter = await rufe({ auftrag: "die Füllung an 36 lassen wir so" });
  assert.doesNotMatch(weiter.message, /Füllungs-Mehrkostenvereinbarung/);
  process.env.MAS_MKV = "0";
  try {
    const aus = await rufe({ auftrag: "Komposit an 37 o", planart: "mkv" });
    assert.match(aus.message, /nicht per Sprache anlegen/);
    assert.equal(aus.entwurfId, undefined);
  } finally {
    delete process.env.MAS_MKV;
  }
});
