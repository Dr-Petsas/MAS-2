// Privater Zahnersatz per Sprache (Chef 15.10.2026): gleiche Gespraechsfuehrung wie der HKP, gerechnet mit der
// Privat-Engine, abgelegt fuer die PlanR-Uebersicht (planrEntwuerfe) statt im HKP-Register. PlanR ist ein
// lokaler Nachbau; Entwuerfe landen in der Test-Praxis und werden wieder geloescht.
import "dotenv/config";
// Die Saetze der Engine werden hier woertlich geprueft; der Modell-Mund hat einen eigenen Test.
process.env.MAS_HKP_FACH ??= "0";
process.env.MAS_HKP_MUND ??= "0";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

const CID = "zzz-mas2-privatze";
process.env.PLANR_HKP_KEY = "k";
process.env.MAS_HKP_AUSFUEHRUNG_FRAGE = "0";

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const DAMPSOFT = Object.fromEntries([...OK, ...UK].map((z) => [z, ""]));
Object.assign(DAMPSOFT, { 18: "f", 28: "f", 15: "f", 16: "k" });
const vorgaenge = [];
const kurz = () => new Promise((r) => setTimeout(r, 80));

const planr = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://planr");
  let roh = "";
  for await (const c of req) roh += c;
  const senden = (status, d) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  if (req.headers["x-planr-key"] !== "k" || u.searchParams.get("clientId") !== CID) return senden(401, { ok: false });
  if (u.pathname === "/api/intern/pvs/patienten") {
    return senden(200, { ok: true, patienten: [{ id: "4712", vorname: "Paula", name: "Privattest", geburtsdatum: "1968-04-03" }] });
  }
  if (u.pathname === "/api/intern/befund/vorgang") {
    vorgaenge.push(JSON.parse(roh));
    return senden(200, { ok: true, vorgang: {} });
  }
  if (u.pathname === "/api/intern/befund/aenderung") return senden(200, { ok: true, befund: {} });
  if (u.pathname === "/api/intern/pvs/befund") {
    return senden(200, { ok: true, pvs: "Dampsoft", patient: "4712", datum: "2026-10-12", zaehne: DAMPSOFT });
  }
  return senden(404, { ok: false });
});
await new Promise((r) => planr.listen(0, "127.0.0.1", r));
process.env.PLANR_URL = `http://127.0.0.1:${planr.address().port}`;

const { _setBillingLaden } = await import("../src/hkp/planrClara.js");
_setBillingLaden(async () => ({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }));
const { default: router } = await import("../src/routes/hkp.js");
const { hkpListe } = await import("../src/hkp/store.js");
const { entwurfLesen, entwurfLoeschenFuerTest } = await import("../src/hkp/planrEntwuerfe.js");
const { zuruecknehmen } = await import("../src/clara/rueckgaengig.js");

const app = express();
app.use(express.json());
app.use(router);
const mas = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
const basis = `http://127.0.0.1:${mas.address().port}`;
const angelegt = [];

async function rufe(body) {
  const r = await fetch(`${basis}/tools/hkp-create-draft`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": CID }, body: JSON.stringify({ name: "Paula Privattest", ...body }),
  });
  const d = await r.json();
  if (d.entwurfId) angelegt.push(d.entwurfId);
  if (d.rueckfrage === "befund_anzeige" && !body.chef_satz) return rufe({ ...body, chef_satz: "Ja, stimmt." });
  return d;
}
const planrRuf = (pfad, init = {}) => fetch(`${basis}/planr${pfad}${pfad.includes("?") ? "&" : "?"}clientId=${CID}`, {
  ...init, headers: { "X-PlanR-Key": "k", "Content-Type": "application/json" },
}).then(async (r) => ({ status: r.status, d: await r.json() }));

async function anlegen(auftrag) {
  // Befund auf dem Handy bestätigt: keine zweite Frage nach der Quelle
  const frage = await rufe({ auftrag, privat: true });
  assert.equal(frage.rueckfrage, "vorlesen", frage.message);
  // Folgezug ohne privat=true: der laufende Privatplan gilt weiter
  const vorschau = await rufe({ auftrag, befund: "aus Dampsoft" });
  assert.equal(vorschau.rueckfrage, "vorlesen", vorschau.message);
  const fertig = await rufe({ auftrag, bestaetigt: true });
  assert.ok(fertig.entwurfId, fertig.message);
  return { vorschau, fertig };
}

test.after(async () => {
  for (const id of angelegt) await entwurfLoeschenFuerTest(CID, id).catch(() => {});
  _setBillingLaden(null);
  mas.close();
  planr.close();
});

test("Privatplan: vorlesen ohne Festzuschuss, nach dem Ja abgelegt mit Plan des Privat-Planers, kein HKP", async () => {
  vorgaenge.length = 0;
  const hkpsVorher = (await hkpListe(CID)).length;
  const { vorschau, fertig } = await anlegen("Brücke von 14 auf 16 Vollkeramik");
  assert.match(vorschau.message, /^Bevor ich anlege, bitte prüfen: Privatplan Zahnersatz für Frau Paula Privattest|Privatplan Zahnersatz für Paula Privattest/);
  assert.match(vorschau.message, /Honorar/);
  assert.doesNotMatch(vorschau.message, /Festzuschuss|Eigenanteil/);
  assert.match(fertig.message, /Planer Zahnersatz privat als Entwurf/);
  assert.match(fertig.message, /Befund aus Dampsoft vom 12\.10\.2026/);
  assert.equal(fertig.hkpId, undefined);
  assert.equal(fertig.undo?.art, "planr_entwurf");
  const e = await entwurfLesen(CID, fertig.entwurfId);
  assert.equal(e.modul, "privat-kv");
  assert.equal(e.status, "offen");
  const plan = JSON.parse(e.planJson);
  assert.deepEqual([plan.zaehne["14"].TP, plan.zaehne["15"].TP, plan.zaehne["16"].TP], ["KM", "BM", "KM"]);
  assert.equal(plan.zaehne["16"].B, "k");
  assert.equal(plan.nummer, "");
  assert.deepEqual([plan.patient.name, plan.patient.vorname, plan.patient.geburtsdatum], ["Privattest", "Paula", "1968-04-03"]);
  assert.ok(e.betrag > 0);
  assert.equal((await hkpListe(CID)).length, hkpsVorher);
  await kurz();
  assert.ok(vorgaenge.length && vorgaenge.every((v) => v.modul === "privat-kv"), JSON.stringify(vorgaenge.map((v) => v.modul)));
  assert.ok(vorgaenge.some((v) => v.phase === "angelegt"));
});

test("PlanR holt ab: Liste, abgeholt genau einmal, danach weg; Rueckgaengig verweist auf PlanR", async () => {
  const { fertig } = await anlegen("Brücke von 14 auf 16");
  assert.match(fertig.message, /Angenommen habe ich konventioneller Abdruck und Nichtedelmetall als Kronenmaterial/);
  const liste = await planrRuf("/entwuerfe");
  assert.equal(liste.status, 200);
  const da = liste.d.entwuerfe.find((x) => x.id === fertig.entwurfId);
  assert.ok(da, JSON.stringify(liste.d));
  assert.equal(da.modul, "privat-kv");
  assert.equal(da.patient, "Paula Privattest");
  assert.deepEqual([da.plan.zaehne["14"].TP, da.plan.zaehne["15"].TP, da.plan.zaehne["16"].TP], ["KV", "BV", "K"]);
  const ab = await planrRuf(`/entwuerfe/${fertig.entwurfId}/abgeholt`, { method: "POST", body: JSON.stringify({ nummer: "KV-2026-C001" }) });
  assert.equal(ab.status, 200, JSON.stringify(ab.d));
  const nochmal = await planrRuf(`/entwuerfe/${fertig.entwurfId}/abgeholt`, { method: "POST", body: JSON.stringify({ nummer: "KV-2026-C002" }) });
  assert.equal(nochmal.status, 409);
  assert.ok(!(await planrRuf("/entwuerfe")).d.entwuerfe.some((x) => x.id === fertig.entwurfId));
  const u = await zuruecknehmen(CID, fertig.undo);
  assert.match(u.message, /liegt schon als Entwurf KV-2026-C001 in PlanR/);
  assert.equal((await planrRuf("/entwuerfe/x/abgeholt", { method: "POST", body: "{}" })).status, 400);
});

test("Rueckgaengig vor dem Abholen verwirft; PlanR bekommt ihn nicht mehr", async () => {
  const { fertig } = await anlegen("Brücke von 14 auf 16 Vollkeramik");
  const u = await zuruecknehmen(CID, fertig.undo);
  assert.equal(u.ok, true, u.message);
  assert.equal((await entwurfLesen(CID, fertig.entwurfId)).status, "verworfen");
  assert.ok(!(await planrRuf("/entwuerfe")).d.entwuerfe.some((x) => x.id === fertig.entwurfId));
  assert.equal((await planrRuf(`/entwuerfe/${fertig.entwurfId}/abgeholt`, { method: "POST", body: JSON.stringify({ nummer: "KV-2026-C009" }) })).status, 409);
});

test("Wortlaut 'privat'/'Kostenvoranschlag' reicht; 'HKP' schaltet zurueck auf die Kasse", async () => {
  const { privatGesagt, kasseGesagt } = await import("../src/routes/hkp.js");
  assert.equal(privatGesagt("Privater Zahnersatz, Brücke 14 bis 16"), true);
  assert.equal(privatGesagt("Kostenvoranschlag Brücke 14 bis 16"), true);
  assert.equal(privatGesagt("HKP Brücke 14 bis 16 mit Privatstufe zwei"), false);
  assert.equal(privatGesagt("Kasse oder privat? Kasse."), false);
  assert.equal(privatGesagt("Einen privaten HKP für Frau Muster"), true);
  assert.equal(kasseGesagt("Einen privaten HKP für Frau Muster"), false);
  assert.equal(kasseGesagt("HKP Brücke 14 bis 16"), true);
  assert.equal(kasseGesagt("Brücke 14 bis 16"), false);
  const frage = await rufe({ auftrag: "Kostenvoranschlag Brücke von 14 auf 16 Vollkeramik" });
  assert.equal(frage.rueckfrage, "vorlesen", frage.message);
  const vorschau = await rufe({ auftrag: "Kostenvoranschlag Brücke von 14 auf 16 Vollkeramik", befund: "aus Dampsoft" });
  assert.match(vorschau.message, /Privatplan Zahnersatz/);
  const kasse = await rufe({ auftrag: "Doch als HKP über die Kasse: Brücke von 14 auf 16", befund: "aus Dampsoft" });
  assert.equal(kasse.rueckfrage, "vorlesen", kasse.message);
  assert.match(kasse.message, /Brücken-HKP/);
  assert.match(kasse.message, /Festzuschuss|Eigenanteil/);
  const weiter = await rufe({ auftrag: "Brücke von 14 auf 16", befund: "aus Dampsoft" });
  assert.match(weiter.message, /Brücken-HKP/, "nach 'HKP' bleibt es beim Kassenplan");
});

test("Rueckfragen wie beim HKP, Notaus MAS_PRIVAT_ZE=0", async () => {
  const leer = await rufe({ privat: true });
  assert.match(leer.message, /Was soll ich für .*Paula Privattest planen\?/);
  process.env.MAS_PRIVAT_ZE = "0";
  try {
    const aus = await rufe({ auftrag: "Brücke von 14 auf 16", privat: true });
    assert.match(aus.message, /nicht per Sprache anlegen/);
    assert.equal(aus.entwurfId, undefined);
  } finally {
    delete process.env.MAS_PRIVAT_ZE;
  }
});
