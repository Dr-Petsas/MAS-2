// Implantologie per Sprache (Chef 15.10.2026): hkp_create_draft mit planart=impl oder Implantat-Wortlaut ohne
// Prothetik, gerechnet mit der Engine des Implantologie-Planers, Befund nur zur Pruefung, abgelegt fuer die
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

const CID = "zzz-mas2-impl";
process.env.PLANR_HKP_KEY = "k";
process.env.MAS_HKP_AUSFUEHRUNG_FRAGE = "0";

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const DAMPSOFT = Object.fromEntries([...OK, ...UK].map((z) => [z, ""]));
Object.assign(DAMPSOFT, { 18: "f", 28: "f", 26: "f", 46: "f", 36: "x", 21: "i" });
const vorgaenge = [];
const kurz = () => new Promise((r) => setTimeout(r, 80));

const planr = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://planr");
  let roh = "";
  for await (const c of req) roh += c;
  const senden = (status, d) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  if (req.headers["x-planr-key"] !== "k" || u.searchParams.get("clientId") !== CID) return senden(401, { ok: false });
  if (u.pathname === "/api/intern/pvs/patienten") {
    return senden(200, { ok: true, patienten: [{ id: "4715", vorname: "Petra", name: "Privattest", geburtsdatum: "1975-06-07" }] });
  }
  if (u.pathname === "/api/intern/befund/vorgang") {
    vorgaenge.push(JSON.parse(roh));
    return senden(200, { ok: true, vorgang: {} });
  }
  if (u.pathname === "/api/intern/befund/aenderung") return senden(200, { ok: true, befund: {} });
  if (u.pathname === "/api/intern/pvs/befund") {
    return senden(200, { ok: true, pvs: "Dampsoft", patient: "4715", datum: "2026-10-12", zaehne: DAMPSOFT });
  }
  return senden(404, { ok: false });
});
await new Promise((r) => planr.listen(0, "127.0.0.1", r));
process.env.PLANR_URL = `http://127.0.0.1:${planr.address().port}`;

const { _setBillingLaden } = await import("../src/hkp/planrClara.js");
_setBillingLaden(async () => ({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }));
const { default: router, implGesagt, implantatStandard, sprachFolgeText } = await import("../src/routes/hkp.js");
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
    method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": CID }, body: JSON.stringify({ name: "Petra Privattest", ...body }),
  });
  const d = await r.json();
  if (d.entwurfId) angelegt.push(d.entwurfId);
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

test("Kostenvoranschlag Implantologie: vorlesen mit GOZ/GOÄ-Summe, nach dem Ja als privat-impl-Entwurf ohne Regler, kein HKP", async () => {
  vorgaenge.length = 0;
  const hkpsVorher = (await hkpListe(CID)).length;
  // Seit 10.11.2026 nimmt die Engine kein Material mehr still an, es steht im Auftrag oder wird erfragt.
  const auftrag = "Kostenvoranschlag Implantate 46 und 26 mit externem Sinuslift, xenogenes Knochenersatzmaterial";
  const vorschau = await rufe({ auftrag });
  assert.equal(vorschau.rueckfrage, "vorlesen", vorschau.message);
  assert.match(vorschau.message, /^Bevor ich anlege, bitte prüfen: Kostenvoranschlag Implantologie für (Frau )?Petra Privattest/);
  assert.match(vorschau.message, /Implantate an 26 und 46; dazu externer Sinuslift/);
  assert.match(vorschau.message, /insgesamt .+ Euro.* nach GOZ und GOÄ, davon .+ Material und Labor/);
  assert.doesNotMatch(vorschau.message, /Festzuschuss|Eigenanteil|Welchen Befund|Privatplan Zahnersatz/);
  assert.ok(vorschau.card, "Zahnschema auf dem Handy");
  const offen = await rufe({ frage: "Wie hoch ist der Betrag?" }, "/tools/hkp-details");
  assert.match(offen.message, /^Der Kostenvoranschlag Implantologie für (Frau )?Petra Privattest ist noch nicht angelegt/);
  const fertig = await rufe({ auftrag, bestaetigt: true });
  assert.ok(fertig.entwurfId, fertig.message);
  assert.match(fertig.message, /^Der Kostenvoranschlag Implantologie für .+ ist angelegt\. Er steht in PlanR im Planer Implantologie als Entwurf/);
  assert.equal(fertig.undo?.art, "planr_entwurf");
  const e = await entwurfLesen(CID, fertig.entwurfId);
  assert.equal(e.modul, "privat-impl");
  const plan = JSON.parse(e.planJson);
  assert.equal(plan.regler, undefined, "der Planer rechnet mit Faktoren und Stufen der Praxis");
  assert.deepEqual(plan.zaehne, { 26: { B: "", TP: "I" }, 46: { B: "", TP: "I" } });
  assert.equal(plan.implantate["46"].system, implantatStandard({ einstellungen: {} }));
  assert.equal(plan.regionen["OK-L"].sinusExtern, true);
  assert.equal(plan.regionen["UK-R"].sinusExtern, undefined);
  assert.ok(e.betrag > 2000);
  assert.equal((await hkpListe(CID)).length, hkpsVorher);
  await kurz();
  assert.ok(vorgaenge.length && vorgaenge.every((v) => v.modul === "privat-impl"), JSON.stringify(vorgaenge.map((v) => v.modul)));
  assert.deepEqual(vorgaenge.find((v) => v.phase === "angelegt")?.plan, { 26: { TP: "I", R: "" }, 46: { TP: "I", R: "" } });
});

test("Rueckfragen: Zeitpunkt beim nicht erhaltungswuerdigen Zahn, vorhandenes Implantat, Sinuslift-Art, Material", async () => {
  const z = await rufe({ auftrag: "Implantat 36" });
  assert.equal(z.rueckfrage, "zeitpunkt", z.message);
  assert.equal(z.message, "Laut Befund ist 36 nicht erhaltungswürdig. Soll ich sofort implantieren oder später nach der Entfernung?");
  const sofort = await rufe({ auftrag: "Sofort." });
  assert.equal(sofort.rueckfrage, "vorlesen", sofort.message);
  assert.match(sofort.message, /Kostenvoranschlag Implantologie/);
  assert.match(sofort.message, /Sofortimplantat an 36/);
  const konflikt = await rufe({ auftrag: "Implantat 21", planart: "impl" });
  assert.equal(konflikt.rueckfrage, "befund_konflikt");
  assert.equal(konflikt.message, "Laut Befund steht an 21 schon ein Implantat. Welchen Zahn meinen Sie?");
  const richtig = await rufe({ auftrag: "28" });
  assert.match(richtig.message, /Implantat an 28/);
  const sinus = await rufe({ auftrag: "Implantat 26 mit Sinuslift" });
  assert.equal(sinus.rueckfrage, "sinus", sinus.message);
  assert.equal(sinus.message, "Interner oder externer Sinuslift?");
  const intern = await rufe({ auftrag: "intern" });
  assert.equal(intern.rueckfrage, "material", intern.message);
  assert.equal(intern.message, "Knochenersatzmaterial oder Eigenknochen?");
  const material = await rufe({ auftrag: "xenogenes Knochenersatzmaterial" });
  assert.equal(material.rueckfrage, "vorlesen", material.message);
  assert.match(material.message, /Implantat an 26; dazu interner Sinuslift/);
});

test("Wortlaut und planart: Implantat ohne Prothetik ist Implantologie, Implantatkrone bleibt Zahnersatz", async () => {
  assert.equal(implGesagt("Kostenvoranschlag Implantat 26"), true);
  assert.equal(implGesagt("Sinuslift regio 16 und Implantat"), true);
  assert.equal(implGesagt("Implantatkrone auf 36"), false);
  assert.equal(implGesagt("Brücke 14 auf 16 mit Implantat 16"), false);
  assert.equal(implGesagt("Erstelle einen HKP mit Implantat 36"), false);
  assert.equal(implGesagt("Mehrkostenvereinbarung Komposit 36 mo"), false);
  const mitPrivat = await rufe({ auftrag: "Implantat 46", privat: true });
  assert.match(mitPrivat.message, /Kostenvoranschlag Implantologie/);
  assert.equal(sprachFolgeText({ teilAuftrag: "Implantat 36", teilGrund: "zeitpunkt", teilKonflikt: "36" }, "Sofort.", "impl"), "Implantat 36. Sofort.");
  assert.equal(sprachFolgeText({ teilAuftrag: "Implantat 21", teilGrund: "befund_konflikt", teilKonflikt: "21" }, "28", "impl"), "Implantat 28");
  assert.equal(sprachFolgeText({ teilAuftrag: "Implantat 26 mit Sinuslift", teilGrund: "sinus" }, "Implantat 16 und 26 mit Knochenaufbau", "impl"), "Implantat 16 und 26 mit Knochenaufbau");
});

test("PlanR holt den Implantologie-Entwurf ab; Rueckgaengig vorher verwirft; Notaus MAS_IMPL=0", async () => {
  const auftrag = "Implantat 46 mit Knochenaufbau, xenogenes Knochenersatzmaterial";
  await rufe({ auftrag });
  const fertig = await rufe({ auftrag, bestaetigt: true });
  assert.ok(fertig.entwurfId, fertig.message);
  const da = (await planrRuf("/entwuerfe")).d.entwuerfe.find((x) => x.id === fertig.entwurfId);
  assert.equal(da?.modul, "privat-impl");
  assert.equal(da.plan.zaehne["46"].TP, "I");
  assert.equal(da.plan.regionen["UK-R"].augmentation, true);
  const u = await zuruecknehmen(CID, fertig.undo);
  assert.equal(u.ok, true, u.message);
  assert.equal((await entwurfLesen(CID, fertig.entwurfId)).status, "verworfen");
  process.env.MAS_IMPL = "0";
  try {
    const aus = await rufe({ auftrag: "Kostenvoranschlag Implantat 46" });
    assert.match(aus.message, /Kostenvoranschlag Implantologie kann ich gerade nicht per Sprache anlegen/);
    assert.equal(aus.entwurfId, undefined);
  } finally {
    delete process.env.MAS_IMPL;
  }
});
