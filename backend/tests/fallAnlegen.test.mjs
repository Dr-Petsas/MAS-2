// Abrechnungscoach mit Patient (W-COACH, Chef 06.11.2026): fall-rechnen rechnet auf dem 01 aus dem PVS,
// plan-ablegen legt Implantation und Prothese als EINEN Fall an, "doch nicht" verwirft beide Teile.
// Musterrechnung ohne Patient legt nie etwas an. PlanR ist ein lokaler Nachbau, alles landet in der Test-Praxis.
import "dotenv/config";
process.env.MAS_HKP_MUND ??= "0";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

const CID = "zzz-mas2-fallanlegen";
process.env.PLANR_HKP_KEY = "k";
process.env.MAS_HKP_AUSFUEHRUNG_FRAGE = "0";
process.env.MAS_RUECKGAENGIG = "1";

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const ZAEHNE = Object.fromEntries([...OK.map((z) => [z, "f"]), ...UK.map((z) => [z, ""])]);

const SATZ = "Implantatversorgung OK mit 6 Implantaten regio 2, 4, 6 auf beiden Quadranten mit externem Sinuslift rechts und internem Sinuslift beim 4er und 6er links inklusive der späteren All-on-6-Prothetik, xenogenes Knochenersatzmaterial";

const planr = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://planr");
  for await (const _ of req);
  const senden = (status, d) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  if (req.headers["x-planr-key"] !== "k" || u.searchParams.get("clientId") !== CID) return senden(401, { ok: false });
  if (u.pathname === "/api/intern/pvs/patienten") {
    return senden(200, { ok: true, patienten: [{ id: "4720", vorname: "Olga", name: "Oberkiefertest", geburtsdatum: "1958-04-11" }] });
  }
  if (u.pathname === "/api/intern/befund/vorgang") return senden(200, { ok: true, vorgang: {} });
  if (u.pathname === "/api/intern/pvs/befund") {
    return senden(200, { ok: true, pvs: "Dampsoft", patient: "4720", datum: "2026-10-12", zaehne: ZAEHNE, offen: {} });
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
const { zuruecknehmen } = await import("../src/clara/rueckgaengig.js");

const app = express();
app.use(express.json());
app.use(router);
const mas = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
const basis = `http://127.0.0.1:${mas.address().port}`;
const entwuerfe = [];

async function rufe(pfad, body) {
  const r = await fetch(`${basis}${pfad}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": CID }, body: JSON.stringify(body),
  });
  const d = await r.json();
  if (d.entwurfId) entwuerfe.push(d.entwurfId);
  for (const id of d.undo?.weitereEntwuerfe || []) entwuerfe.push(id);
  return d;
}

test.after(async () => {
  for (const id of entwuerfe) await entwurfLoeschenFuerTest(CID, id).catch(() => {});
  _setBillingLaden(null);
  mas.close();
  planr.close();
});

test("Musterrechnung ohne Patient: Karte mit Beträgen, Ablegen verweigert", async () => {
  const v = await rufe("/tools/fall-rechnen", { versorgung: SATZ, prothese: "kasse" });
  assert.equal(v.rueckfrage, "muster", v.message);
  assert.doesNotMatch(v.message, /€|\beuro\b/i);
  assert.ok(v.cards?.[0]?.items?.some((i) => /9120/.test(i.text)));
  const ab = await rufe("/tools/plan-ablegen", { freigabe: true });
  assert.equal(ab.ok, false);
  assert.match(ab.message, /Musterrechnung/);
  assert.equal(ab.entwurfId, undefined);
  assert.equal(ab.hkpId, undefined);
});

test("mit Patient: ein Fall aus Implantation und Kassen-HKP, doch nicht verwirft beide", async () => {
  const v = await rufe("/tools/fall-rechnen", { name: "Olga Oberkiefertest", versorgung: SATZ, prothese: "kasse", bonus: "70" });
  assert.equal(v.rueckfrage, "freigabe", v.message);
  assert.match(v.message, /Soll ich den Entwurf so anlegen\?/);
  assert.doesNotMatch(v.message, /€|\beuro\b/i);

  const ohne = await rufe("/tools/plan-ablegen", { name: "Olga Oberkiefertest" });
  assert.equal(ohne.rueckfrage, "freigabe");
  assert.equal(ohne.hkpId, undefined);

  const f = await rufe("/tools/plan-ablegen", { name: "Olga Oberkiefertest", freigabe: true });
  assert.ok(f.fallId, f.message);
  assert.match(f.message, /ist angelegt/);
  assert.match(f.message, /PlanR: die Implantation .* und die Prothese als HKP\./);
  assert.match(f.message, /Implantation/);
  assert.match(f.message, /HKP/);
  assert.ok(f.hkpId, "Kassenteil als HKP");
  assert.equal(f.undo?.art, "hkp");
  assert.equal(f.undo.weitereEntwuerfe?.length, 1, "Implantation als Entwurf am selben Fall");

  const h = await hkpLesen(CID, f.hkpId);
  assert.equal(h.status, "wartet_auf_freigabe");
  assert.equal(h.fallId, f.fallId);
  const implId = f.undo.weitereEntwuerfe[0];
  const e = await entwurfLesen(CID, implId);
  assert.equal(e.fallId, f.fallId);
  assert.match(e.anzeige || "", /^Fall /);

  const z = await zuruecknehmen(CID, f.undo);
  assert.equal(z.ok, true, z.message);
  assert.equal((await hkpLesen(CID, f.hkpId)).status, "verworfen");
  assert.equal((await entwurfLesen(CID, implId)).status, "verworfen");
  assert.equal((await rufe("/tools/plan-ablegen", { name: "Olga Oberkiefertest", freigabe: true })).ok, false, "Fall nur einmal");
});
