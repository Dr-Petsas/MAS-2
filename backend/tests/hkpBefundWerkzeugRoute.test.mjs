// Befund-Werkzeug durch die Route (Chef 15.10.2026): Befund vorlesen, Zahn aendern (offen in PlanR), erst nach "ja"
// nach Dampsoft. PlanR ist ein lokaler Nachbau, der sich die offenen Aenderungen merkt wie der echte Server.
import "dotenv/config";
// Die Saetze der Engine werden hier woertlich geprueft; der Modell-Mund hat einen eigenen Test.
process.env.MAS_HKP_FACH ??= "0";
process.env.MAS_HKP_MUND ??= "0";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

const CID = "zzz-mas2-befundwerkzeug";
process.env.PLANR_HKP_KEY = "k";

const ZAEHNE = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28",
  "48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const dampsoft = Object.fromEntries(ZAEHNE.map((z) => [z, ""]));
Object.assign(dampsoft, { 18: "f", 16: "k" });
let offen = {};
const geschrieben = [];
const vorgaenge = [];

const planr = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://planr");
  let roh = "";
  for await (const c of req) roh += c;
  const senden = (status, d) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  if (req.headers["x-planr-key"] !== "k" || u.searchParams.get("clientId") !== CID) return senden(401, { ok: false });
  if (u.pathname === "/api/intern/pvs/patienten") {
    const ohne = [...u.searchParams.values()].join(" ").includes("Ohnebridge");
    return senden(200, { ok: true, patienten: [ohne
      ? { id: "815", vorname: "Bert", name: "Ohnebridge", geburtsdatum: "1950-01-02" }
      : { id: "4711", vorname: "Anna", name: "Werkzeugtest", geburtsdatum: "1972-03-05" }] });
  }
  if (u.pathname === "/api/intern/pvs/befund" && u.searchParams.get("patient") === "815") {
    return senden(502, { ok: false, pvs: "DS-Win", meldung: "Die PlanR-Bridge in der Praxis braucht ein Update." });
  }
  if (u.pathname === "/api/intern/befund/vorgang") {
    vorgaenge.push(JSON.parse(roh));
    return senden(200, { ok: true, vorgang: {} });
  }
  if (u.pathname === "/api/intern/befund/aenderung") {
    const b = JSON.parse(roh);
    offen = { ...offen, ...b.zaehne };
    return senden(200, { ok: true, befund: { patient: b.patient, offen } });
  }
  if (u.pathname === "/api/intern/pvs/befund" && req.method === "POST") {
    const b = JSON.parse(roh);
    geschrieben.push(b);
    Object.assign(dampsoft, b.zaehne);
    offen = {};
    return senden(200, { ok: true, pvs: "Dampsoft", patient: b.patient, geschrieben: Object.keys(b.zaehne) });
  }
  if (u.pathname === "/api/intern/pvs/befund") {
    return senden(200, { ok: true, pvs: "Dampsoft", patient: "4711", datum: "2026-10-12", zaehne: dampsoft, offen });
  }
  return senden(404, { ok: false });
});
await new Promise((r) => planr.listen(0, "127.0.0.1", r));
process.env.PLANR_URL = `http://127.0.0.1:${planr.address().port}`;

const { _setBillingLaden } = await import("../src/hkp/planrClara.js");
_setBillingLaden(async () => ({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }));
const { default: router } = await import("../src/routes/hkp.js");

const app = express();
app.use(express.json());
app.use(router);
const mas = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });

async function rufe(body) {
  const r = await fetch(`http://127.0.0.1:${mas.address().port}/tools/hkp-befund`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": CID }, body: JSON.stringify({ name: "Anna Werkzeugtest", ...body }),
  });
  return r.json();
}

test.after(() => {
  _setBillingLaden(null);
  mas.close();
  planr.close();
});

test("Praxisprogramm nicht lesbar: ehrliche Ansage, leeres Zahnschema auf dem Handy, Eintrag in PlanR", async () => {
  const r = await rufe({ name: "Bert Ohnebridge" });
  assert.match(r.message, /^Befund aus DS-Win gerade nicht da\. Schema ist auf dem Handy\./);
  assert.equal(new URL(r.card?.url || "http://x").searchParams.get("befund"), "815");
  await new Promise((ok) => setTimeout(ok, 80));
  assert.equal(vorgaenge.at(-1).label, "Ohnebridge, Bert");
  assert.equal(r.pvsOhne, undefined);
});

test("aufs Handy, aendern, erst nach der Freigabe nach Dampsoft – nur der geaenderte Kiefer", async () => {
  const lesen = await rufe({});
  assert.match(lesen.message, /Befund von .*Anna Werkzeugtest aus Dampsoft vom 12\.10\.2026 steht auf dem Handy\. Stimmt er so\?/);
  assert.equal(lesen.rueckfrage, "befund_anzeige");
  // Zahnschema auf dem Handy und Eintrag "Befund · noch nichts geplant" in PlanR
  assert.equal(lesen.card?.kind, "befund");
  assert.equal(new URL(lesen.card.url).searchParams.get("befund"), "4711");
  assert.equal(lesen.nummer, undefined);
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(vorgaenge.at(-1), { patient: "4711", phase: "befund", neu: "1" });

  const aendern = await rufe({ aenderung: "36 fehlt" });
  assert.equal(aendern.rueckfrage, "befund_anzeige", aendern.message);
  assert.match(aendern.message, /Auf dem Handy steht jetzt für .*: .*36.*Stimmt der Befund so\?/);
  assert.deepEqual(offen, { 36: "f" });
  assert.equal(geschrieben.length, 0);

  // Ohne Freigabe geht nichts ins Praxisprogramm, auch nicht beim erneuten Zeigen
  await rufe({});
  assert.equal(geschrieben.length, 0);

  const ja = await rufe({ uebernehmen: true });
  assert.match(ja.message, /in Dampsoft als geänderter Befund gespeichert, ohne Null-Eins und ohne Abrechnung/, ja.message);
  assert.equal(geschrieben.length, 1);
  assert.deepEqual(geschrieben[0].kiefer, ["UK"]);
  assert.equal(geschrieben[0].zaehne[36], "f");
  assert.equal(Object.keys(geschrieben[0].zaehne).length, 16);
});
