// Private Kons per Sprache (Chef 15.10.2026): hkp_create_draft mit planart=kons oder Kostenvoranschlag-Wortlaut zu
// Kons-Leistungen, gerechnet mit der Engine des Privat-Kons-Planers, Befund nur zur Pruefung, abgelegt fuer die
// PlanR-Uebersicht (planrEntwuerfe). PlanR ist ein lokaler Nachbau; Entwuerfe landen in der Test-Praxis und werden
// wieder geloescht.
import "dotenv/config";
// Die Saetze der Engine werden hier woertlich geprueft; der Modell-Mund hat einen eigenen Test.
process.env.MAS_HKP_FACH ??= "0";
process.env.MAS_HKP_MUND ??= "0";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

const CID = "zzz-mas2-kons";
process.env.PLANR_HKP_KEY = "k";
process.env.MAS_HKP_AUSFUEHRUNG_FRAGE = "0";

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const DAMPSOFT = Object.fromEntries([...OK, ...UK].map((z) => [z, ""]));
Object.assign(DAMPSOFT, { 18: "f", 28: "f", 46: "f", 36: "k" });
const vorgaenge = [];
const kurz = () => new Promise((r) => setTimeout(r, 80));

const planr = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://planr");
  let roh = "";
  for await (const c of req) roh += c;
  const senden = (status, d) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  if (req.headers["x-planr-key"] !== "k" || u.searchParams.get("clientId") !== CID) return senden(401, { ok: false });
  if (u.pathname === "/api/intern/pvs/patienten") {
    return senden(200, { ok: true, patienten: [{ id: "4714", vorname: "Petra", name: "Privattest", geburtsdatum: "1975-06-07" }] });
  }
  if (u.pathname === "/api/intern/befund/vorgang") {
    vorgaenge.push(JSON.parse(roh));
    return senden(200, { ok: true, vorgang: {} });
  }
  if (u.pathname === "/api/intern/befund/aenderung") return senden(200, { ok: true, befund: {} });
  if (u.pathname === "/api/intern/pvs/befund") {
    return senden(200, { ok: true, pvs: "Dampsoft", patient: "4714", datum: "2026-10-12", zaehne: DAMPSOFT });
  }
  return senden(404, { ok: false });
});
await new Promise((r) => planr.listen(0, "127.0.0.1", r));
process.env.PLANR_URL = `http://127.0.0.1:${planr.address().port}`;

const { _setBillingLaden } = await import("../src/hkp/planrClara.js");
_setBillingLaden(async () => ({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }));
const { default: router, konsGesagt, sprachFolgeText } = await import("../src/routes/hkp.js");
const { hkpListe } = await import("../src/hkp/store.js");
const { entwurfLesen, entwurfLoeschenFuerTest } = await import("../src/hkp/planrEntwuerfe.js");
const { zuruecknehmen } = await import("../src/clara/rueckgaengig.js");

const app = express();
app.use(express.json());
app.use(router);
const mas = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
const basis = `http://127.0.0.1:${mas.address().port}`;
const angelegt = [];

async function post(body, pfad = "/tools/hkp-create-draft") {
  const r = await fetch(`${basis}${pfad}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": CID }, body: JSON.stringify({ name: "Petra Privattest", ...body }),
  });
  const d = await r.json();
  if (d.entwurfId) angelegt.push(d.entwurfId);
  return d;
}
async function rufe(body, pfad = "/tools/hkp-create-draft") {
  const d = await post(body, pfad);
  if (d.rueckfrage === "befund_anzeige" && !body.chef_satz) return rufe({ ...body, chef_satz: "Ja, stimmt." }, pfad);
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

test("jede Planart: erst die 01 auf dem Handy, dann der Plan", async () => {
  const faelle = [
    ["art-kons", { auftrag: "Privater Kons-Plan, Keramikinlay 47 mod", sitzung: "art-kons" }],
    ["art-mkv", { auftrag: "Mehrkostenvereinbarung Komposit an 24 o", sitzung: "art-mkv" }],
    ["art-impl", { auftrag: "Kostenvoranschlag Implantat 26", sitzung: "art-impl" }],
    ["art-privat", { auftrag: "Privater Zahnersatz, Brücke von 14 auf 16", sitzung: "art-privat" }],
    ["art-ukps", { auftrag: "Privaten KB-Plan für eine UKPS", sitzung: "art-ukps" }],
  ];
  for (const [name, body] of faelle) {
    const gezeigt = await post(body);
    assert.equal(gezeigt.rueckfrage, "befund_anzeige", `${name}: ${gezeigt.message}`);
    assert.match(gezeigt.message, /steht auf dem Handy\. Stimmt er so\?/);
    assert.equal(gezeigt.card?.kind, "befund", name);
    const weiter = await post({ ...body, chef_satz: "Ja, stimmt." });
    assert.notEqual(weiter.rueckfrage, "befund_anzeige", `${name}: ${weiter.message}`);
  }
  await kurz();
  vorgaenge.length = 0;
});

test("Kostenvoranschlag Kons: vorlesen mit GOZ-Summe, nach dem Ja als privat-kons-Entwurf ohne Regler, kein HKP", async () => {
  vorgaenge.length = 0;
  const hkpsVorher = (await hkpListe(CID)).length;
  const auftrag = "Kostenvoranschlag: Keramikinlay 47 mod und Wurzelbehandlung 36 dreikanalig";
  const vorschau = await rufe({ auftrag });
  assert.equal(vorschau.rueckfrage, "vorlesen", vorschau.message);
  assert.match(vorschau.message, /^Bevor ich anlege, bitte prüfen: Kostenvoranschlag Kons für (Frau )?Petra Privattest/);
  assert.match(vorschau.message, /Einlagefüllung, dreiflächig an 47; Wurzelkanalbehandlung, 3 Kanäle, vital an 36/);
  assert.match(vorschau.message, /insgesamt .+ Euro.* nach GOZ/);
  assert.match(vorschau.message, /Zahn 36: laut 01 .*Zugang durch die Krone/);
  assert.doesNotMatch(vorschau.message, /Festzuschuss|Eigenanteil|Welchen Befund|Privatplan Zahnersatz/);
  assert.ok(vorschau.card, "Zahnschema auf dem Handy");
  const offen = await rufe({ frage: "Wie hoch ist der Betrag?" }, "/tools/hkp-details");
  assert.match(offen.message, /^Der Kostenvoranschlag Kons für (Frau )?Petra Privattest ist noch nicht angelegt/);
  const fertig = await rufe({ auftrag, bestaetigt: true });
  assert.ok(fertig.entwurfId, fertig.message);
  assert.match(fertig.message, /^Der Kostenvoranschlag Kons für .+ ist angelegt\. Er steht in PlanR im Planer Privat-Kons als Entwurf/);
  assert.equal(fertig.undo?.art, "planr_entwurf");
  const e = await entwurfLesen(CID, fertig.entwurfId);
  assert.equal(e.modul, "privat-kons");
  const plan = JSON.parse(e.planJson);
  assert.equal(plan.regler, undefined, "der Planer rechnet mit Faktor und Stufe der Praxis");
  assert.equal(plan.vereinbarung, "pkv");
  assert.deepEqual(plan.zaehne["36"], { therapie: "endo", kanaele: 3, vital: true });
  assert.deepEqual(plan.zaehne["47"], { therapie: "inlay", flaechen: 3, labor: "keramik" });
  assert.ok(e.betrag > 300);
  assert.equal((await hkpListe(CID)).length, hkpsVorher);
  await kurz();
  assert.ok(vorgaenge.length && vorgaenge.every((v) => v.modul === "privat-kons"), JSON.stringify(vorgaenge.map((v) => v.modul)));
  assert.deepEqual(vorgaenge.find((v) => v.phase === "angelegt")?.plan, { 47: { TP: "I3", R: "" }, 36: { TP: "W3", R: "" } });
});

test("Rueckfragen: bloße Zahl auf die Kanal-Frage, Befund-Konflikt, Folgezug mit 'privat' bleibt Kons", async () => {
  const k = await rufe({ auftrag: "Kostenvoranschlag Wurzelbehandlung an 37" });
  assert.equal(k.rueckfrage, "kanaele", k.message);
  assert.equal(k.message, "Wie viele Kanäle an 37?");
  const drei = await rufe({ auftrag: "drei" });
  assert.equal(drei.rueckfrage, "vorlesen", drei.message);
  assert.match(drei.message, /Wurzelkanalbehandlung, 3 Kanäle, vital an 37/);
  const konflikt = await rufe({ auftrag: "Aufbau an 46", planart: "kons" });
  assert.equal(konflikt.rueckfrage, "befund_konflikt");
  assert.equal(konflikt.message, "Laut Befund ist 46 ein fehlender Zahn, dort geht kein Aufbau. Welchen Zahn meinen Sie?");
  const richtig = await rufe({ auftrag: "45" });
  assert.match(richtig.message, /Plastischer Aufbau an 45/);
  const fl = await rufe({ auftrag: "Inlays an 16 und 17", planart: "kons" });
  assert.equal(fl.rueckfrage, "flaechen");
  const privat = await rufe({ auftrag: "als Privatpatientin, jeweils drei" });
  assert.equal(privat.rueckfrage, "vorlesen", privat.message);
  assert.match(privat.message, /Kostenvoranschlag Kons/);
  assert.match(privat.message, /Einlagefüllung, dreiflächig an 17 und 16/);
});

test("Wortlaut und planart: Kons, nicht Zahnersatz oder MKV; Kassenpatient komplett privat", async () => {
  assert.equal(konsGesagt("Kostenvoranschlag Inlay 46 mod"), true);
  assert.equal(konsGesagt("Privater Kons-Plan, Wurzelbehandlung 36"), true);
  assert.equal(konsGesagt("Kostenvoranschlag Brücke 14 bis 16"), false);
  assert.equal(konsGesagt("Mehrkostenvereinbarung Komposit 36 mo"), false);
  assert.equal(konsGesagt("Komposit 36 mo"), false, "ohne privat-Wort ist es die Fuellungs-MKV");
  const mitPrivat = await rufe({ auftrag: "Inlay 26 mod", privat: true });
  assert.match(mitPrivat.message, /Kostenvoranschlag Kons/);
  const kasse = await rufe({ auftrag: "Kassenpatientin, komplett privat: Veneer an 11 und 21", planart: "kons" });
  assert.match(kasse.message, /Direktes Kompositveneer an 11 und 21/);
  assert.match(kasse.message, /Vereinbarung: Kassenpatient, komplett privat nach Paragraph 8 Absatz 7/);
  assert.equal(sprachFolgeText({ teilAuftrag: "Wurzelbehandlung an 37", teilGrund: "kanaele" }, "drei", "kons"), "Wurzelbehandlung an 37. drei Kanäle");
  assert.equal(sprachFolgeText({ teilAuftrag: "Inlay an 37", teilGrund: "flaechen" }, "mod", "kons"), "Inlay an 37. mod");
  assert.equal(sprachFolgeText({ teilAuftrag: "Inlay an 37", teilGrund: "flaechen" }, "Wurzelbehandlung 36 dreikanalig", "kons"), "Wurzelbehandlung 36 dreikanalig");
});

test("PlanR holt den Kons-Entwurf ab; Rueckgaengig vorher verwirft; Notaus MAS_KONS=0", async () => {
  await rufe({ auftrag: "Kostenvoranschlag Versiegelung an 17 und 27" });
  const fertig = await rufe({ auftrag: "Kostenvoranschlag Versiegelung an 17 und 27", bestaetigt: true });
  assert.ok(fertig.entwurfId, fertig.message);
  const da = (await planrRuf("/entwuerfe")).d.entwuerfe.find((x) => x.id === fertig.entwurfId);
  assert.equal(da?.modul, "privat-kons");
  assert.deepEqual(da.plan.zaehne["17"], { therapie: "versiegelung" });
  const u = await zuruecknehmen(CID, fertig.undo);
  assert.equal(u.ok, true, u.message);
  assert.equal((await entwurfLesen(CID, fertig.entwurfId)).status, "verworfen");
  process.env.MAS_KONS = "0";
  try {
    const aus = await rufe({ auftrag: "Kostenvoranschlag Inlay 47 mod" });
    assert.match(aus.message, /Kostenvoranschlag Kons kann ich gerade nicht per Sprache anlegen/);
    assert.equal(aus.entwurfId, undefined);
  } finally {
    delete process.env.MAS_KONS;
  }
});
