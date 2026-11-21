// Schlanke Planungswerkzeuge (W-PLANR-FREI, Chef 06.11.2026): plan-rechnen rechnet auf dem Befund vom Handy und liest
// vor, plan-ablegen legt nur mit freigabe=true an. Keine Wortregeln: die Planart kommt von Clara.
// PlanR ist ein lokaler Nachbau; Entwuerfe landen in der Test-Praxis und werden wieder geloescht.
import "dotenv/config";
process.env.MAS_HKP_MUND ??= "0";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

const CID = "zzz-mas2-planwerkzeuge";
process.env.PLANR_HKP_KEY = "k";
process.env.MAS_HKP_AUSFUEHRUNG_FRAGE = "0";

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const DAMPSOFT = Object.fromEntries([...OK, ...UK].map((z) => [z, ""]));
Object.assign(DAMPSOFT, { 18: "f", 28: "f", 46: "f", 16: "i", 13: "i", 14: "i", 23: "i", 24: "i", 26: "i", 36: "pw" });
const OFFEN_START = { 45: "ww" };
let offen = { ...OFFEN_START };
const aenderungen = [];

const planr = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://planr");
  let roh = "";
  for await (const teil of req) roh += teil;
  const senden = (status, d) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  if (req.headers["x-planr-key"] !== "k" || u.searchParams.get("clientId") !== CID) return senden(401, { ok: false });
  if (u.pathname === "/api/intern/pvs/patienten") {
    return senden(200, { ok: true, patienten: [{ id: "4713", vorname: "Karl", name: "Kassentest", geburtsdatum: "1971-02-05" }] });
  }
  if (u.pathname === "/api/intern/befund/vorgang") return senden(200, { ok: true, vorgang: {} });
  if (u.pathname === "/api/intern/befund/aenderung") {
    const body = JSON.parse(roh || "{}");
    aenderungen.push(body.zaehne);
    offen = { ...offen, ...body.zaehne };
    return senden(200, { ok: true, befund: { ...DAMPSOFT, ...offen } });
  }
  if (u.pathname === "/api/intern/pvs/befund") {
    return senden(200, { ok: true, pvs: "Dampsoft", patient: "4713", datum: "2026-10-12", zaehne: DAMPSOFT, offen });
  }
  return senden(404, { ok: false });
});
await new Promise((r) => planr.listen(0, "127.0.0.1", r));
process.env.PLANR_URL = `http://127.0.0.1:${planr.address().port}`;

const { _setBillingLaden } = await import("../src/hkp/planrClara.js");
_setBillingLaden(async () => ({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }));
const { default: router } = await import("../src/routes/hkp.js");
const { hkpLesen } = await import("../src/hkp/store.js");
const { entwurfLesen, entwurfLoeschenFuerTest } = await import("../src/hkp/planrEntwuerfe.js");

const app = express();
app.use(express.json());
app.use(router);
const mas = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
const basis = `http://127.0.0.1:${mas.address().port}`;
const angelegt = [];

async function rufe(pfad, body) {
  const r = await fetch(`${basis}${pfad}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": CID }, body: JSON.stringify({ name: "Karl Kassentest", ...body }),
  });
  const d = await r.json();
  if (d.entwurfId) angelegt.push(d.entwurfId);
  return d;
}

test.after(async () => {
  for (const id of angelegt) await entwurfLoeschenFuerTest(CID, id).catch(() => {});
  _setBillingLaden(null);
  mas.close();
  planr.close();
});

test("ohne Planart oder Versorgung: nichts gerechnet, Clara bekommt die Luecke genannt", async () => {
  assert.equal((await rufe("/tools/plan-rechnen", { versorgung: "Komposit 37 o" })).fehlt, "planart");
  assert.equal((await rufe("/tools/plan-rechnen", { planart: "mkv" })).fehlt, "versorgung");
  const nichts = await rufe("/tools/plan-ablegen", { freigabe: true });
  assert.equal(nichts.ok, false);
  assert.match(nichts.message, /noch keinen gerechneten Plan/);
});

test("MKV: rechnen liest vor, ablegen ohne Freigabe legt nichts an, mit Freigabe als Entwurf", async () => {
  const v = await rufe("/tools/plan-rechnen", { planart: "mkv", versorgung: "Komposit an 36 mo und 37 okklusal" });
  assert.equal(v.rueckfrage, "freigabe", v.message);
  assert.match(v.message, /Füllungs-Mehrkostenvereinbarung/);
  assert.ok(v.card, "Zahnschema auf dem Handy");
  const ohne = await rufe("/tools/plan-ablegen", {});
  assert.equal(ohne.entwurfId, undefined);
  assert.equal(ohne.rueckfrage, "freigabe");
  const fertig = await rufe("/tools/plan-ablegen", { freigabe: true });
  assert.ok(fertig.entwurfId, fertig.message);
  assert.equal((await entwurfLesen(CID, fertig.entwurfId)).modul, "kons-mkv");
  assert.equal((await rufe("/tools/plan-ablegen", { freigabe: true })).ok, false, "dieselbe Vorschau nur einmal");
});

test("Engine-Rueckfrage kommt als Satz zurueck, ohne Gespraechszustand", async () => {
  const fl = await rufe("/tools/plan-rechnen", { planart: "mkv", versorgung: "Kompositfüllung an 36 und 37" });
  assert.equal(fl.rueckfrage, "flaechen", fl.message);
  const v = await rufe("/tools/plan-rechnen", { planart: "mkv", versorgung: "Kompositfüllung an 36 und 37, beide mod" });
  assert.equal(v.rueckfrage, "freigabe", v.message);
});

test("Kassen-HKP auf dem Befund vom Handy (offene Aenderung 45 ww gilt), Freigabe legt den HKP an", async () => {
  const ohne = await rufe("/tools/plan-rechnen", { planart: "kasse", versorgung: "Brücke von 45 auf 47" });
  // Seit 18.11.2026 keine Bonus-Frage mehr: ohne Besuche im Kalender rechnet der Plan ohne Bonus und sagt das.
  assert.equal(ohne.rueckfrage, "freigabe", ohne.message);
  assert.ok(ohne.message.startsWith("Ohne Bonus."), ohne.message);
  const v = await rufe("/tools/plan-rechnen", { planart: "kasse", versorgung: "Brücke von 45 auf 47, ohne Bonus" });
  assert.equal(v.rueckfrage, "freigabe", v.message);
  // Kurze Vorschau seit 18.11.2026: Plan, Patient, Preisspanne, "Anlegen?"
  assert.ok(v.message.startsWith("Brücken-HKP für Karl Kassentest.") && v.message.endsWith("Anlegen?"), v.message);
  const fertig = await rufe("/tools/plan-ablegen", { freigabe: true });
  assert.ok(fertig.hkpId, fertig.message);
  const h = await hkpLesen(CID, fertig.hkpId);
  assert.equal(h.art, "kasse");
  assert.equal(JSON.parse(h.befundJson)["45"], "ww");
});

test("Wunsch-Eigenanteil beim Ablegen: das Feld eigenanteil stellt die Regler (Anruf 18.11.2026)", async () => {
  const v = await rufe("/tools/plan-rechnen", { planart: "kasse", versorgung: "Brücke von 45 auf 47, ohne Bonus" });
  assert.equal(v.rueckfrage, "freigabe", v.message);
  assert.doesNotMatch(v.message, /\.\s*\./, "kein doppelter Punkt vor Anlegen");
  const fertig = await rufe("/tools/plan-ablegen", { freigabe: true, eigenanteil: 600, alte_verwerfen: true });
  assert.ok(fertig.hkpId, fertig.message);
  assert.match(fertig.message, /Regler|Wunsch/, fertig.message);
});

test("Privatplan: planart privat rechnet mit der Privat-Engine", async () => {
  const v = await rufe("/tools/plan-rechnen", { planart: "privat", versorgung: "Brücke von 45 auf 47" });
  assert.equal(v.rueckfrage, "freigabe", v.message);
  const fertig = await rufe("/tools/plan-ablegen", { freigabe: true });
  assert.ok(fertig.entwurfId, fertig.message);
  assert.equal((await entwurfLesen(CID, fertig.entwurfId)).modul, "privat-kv");
});

test("Stehende Zaehne: Rueckfrage gibt die Zahnliste still mit, entfernen markiert sie auf dem Handy (Anruf 06.11.2026 08:38)", async () => {
  const allOn = "All-on-6 im Oberkiefer auf den Implantaten 16, 13, 14, 23, 24 und 26, festsitzende Prothese, ohne Bonus";
  try {
    const frage = await rufe("/tools/plan-rechnen", { planart: "kasse", versorgung: allOn });
    assert.equal(frage.rueckfrage, "engine", frage.message);
    assert.match(frage.message, /Werden sie vorher entfernt\?/);
    assert.match(frage.merken, /entfernen="15, 12, 11, 21, 22, 25"/);
    assert.doesNotMatch(frage.message, /entfernen=/, "die Zahnliste fuers Modell wird nicht gesprochen");

    const weiter = await rufe("/tools/plan-rechnen", { planart: "kasse", versorgung: allOn, entfernen: "15, 12, 11, 21, 22 und 25" });
    assert.deepEqual(aenderungen.at(-1), { 15: "x", 12: "x", 11: "x", 21: "x", 22: "x", 25: "x" });
    assert.match(weiter.message, /^Auf dem Handy steht jetzt: nicht erhaltungswürdig/);
    assert.match(weiter.merken, /entfernen="17, 27"/, "danach nur noch die Restzaehne");

    const fertig = await rufe("/tools/plan-rechnen", { planart: "kasse", versorgung: allOn, entfernen: "17, 27" });
    assert.equal(fertig.rueckfrage, "freigabe", fertig.message);
    assert.deepEqual(aenderungen.at(-1), { 17: "x", 27: "x" });
    const nochmal = await rufe("/tools/plan-rechnen", { planart: "kasse", versorgung: allOn, entfernen: "17, 27" });
    assert.equal(aenderungen.length, 2, "schon markierte Zaehne gehen nicht noch einmal ans Praxisprogramm");
    assert.equal(nochmal.rueckfrage, "freigabe", nochmal.message);
  } finally {
    offen = { ...OFFEN_START };
  }
});

test("Schiene privat: das Modell nennt die Vorlage als Feld, ohne Vorlage kommt die Frage, Freigabe legt im Privat-KB-Planer ab", async () => {
  const frage = await rufe("/tools/plan-rechnen", { planart: "schiene", versorgung: "ich will einen privatplan für eine schiene" });
  assert.equal(frage.rueckfrage, "vorlage", frage.message);
  assert.match(frage.message, /Welche Schiene/);
  const v = await rufe("/tools/plan-rechnen", { planart: "schiene", schienen: ["knirscher"], versorgung: "Knirscherschiene" });
  assert.equal(v.rueckfrage, "freigabe", v.message);
  assert.match(v.message, /Kostenvoranschlag Schiene/);
  assert.match(v.message, /Knirscherschiene/);
  assert.doesNotMatch(v.message, /Befund aus dem Praxisprogramm/);
  const fertig = await rufe("/tools/plan-ablegen", { freigabe: true });
  assert.ok(fertig.entwurfId, fertig.message);
  assert.match(fertig.message, /Privat-KB/);
  const e = await entwurfLesen(CID, fertig.entwurfId);
  assert.equal(e.modul, "privat-kb");
  const plan = JSON.parse(e.planJson);
  assert.ok(plan.positionen.some((x) => x.nr === "7010"));
  assert.equal(plan.regler, undefined);
});

test("Schiene privat: Intraoralscan und mehrere Vorlagen in einem Plan", async () => {
  const v = await rufe("/tools/plan-rechnen", { planart: "schiene", schienen: ["michigan", "fal", "gibtsnicht"], abformung: "scan" });
  assert.equal(v.rueckfrage, "freigabe", v.message);
  assert.match(v.message, /Intraoralscan/);
});
