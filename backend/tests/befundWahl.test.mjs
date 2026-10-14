import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../src/vendor/hkp-engine.mjs";
import {
  _setHolen, auftragsKiefer, befundErmitteln, befundInsPvs, kieferBefund, lenaFreigeschaltet, pvsBefund, quelleAus,
} from "../src/hkp/befundQuelle.js";
import { befundSatz, zahnBefundSatz } from "../src/hkp/vorlesen.js";
import { _setBillingLaden } from "../src/hkp/planrClara.js";

_setBillingLaden(async (id) => (id === "planrPraxis"
  ? { subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }
  : { subscriptions: { crew: { tier: "premium" } } }));

const PATIENT = { id: "4711", quelle: "pvs", label: "Anna Müller", firstName: "Anna", lastName: "Müller", birthDate: "1972-03-05" };
const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const DAMPSOFT = Object.fromEntries([...OK, ...UK].map((z) => [z, ""]));
Object.assign(DAMPSOFT, { 18: "f", 16: "k", 15: "t1", 26: "i", 36: "sk" });
const pvsOk = async () => ({ ok: true, pvs: "Dampsoft", datum: "2026-10-12", befund: { ...DAMPSOFT }, nummer: "4711" });
const pvsWeg = async () => ({ ok: false, pvs: "Dampsoft", meldung: "Die PlanR-Bridge der Praxis ist nicht verbunden." });
const keiner = async () => null;
const lenaDa = async () => ({ teeth: {}, datum: new Date().toISOString(), appointmentId: "a1" });

test("Antwort auf die Quellen-Frage", () => {
  assert.equal(quelleAus("aus Dampsoft"), "pvs");
  assert.equal(quelleAus("den aus dem Praxisprogramm"), "pvs");
  assert.equal(quelleAus("den von Lena"), "lena");
  assert.equal(quelleAus("neu aufnehmen"), "neu");
  assert.equal(quelleAus("neu"), "neu");
  assert.equal(quelleAus("ja, stimmt"), "");
  assert.equal(quelleAus("Krone erneuerungsbedürftig"), "");
});

test("Kiefer des Auftrags und neuer Befund ueber den ganzen Kiefer", () => {
  assert.deepEqual(auftragsKiefer(E.auftragVerstehen("Brücke von 14 auf 16")), ["OK"]);
  assert.deepEqual(auftragsKiefer(E.auftragVerstehen("Teleskopprothese im Unterkiefer auf 33 und 43")), ["UK"]);
  assert.deepEqual(auftragsKiefer(E.auftragVerstehen("Im Oberkiefer eine Totalprothese und im Unterkiefer eine Teleskopprothese auf 33 und 43")), ["OK", "UK"]);
  const b = kieferBefund({ 16: "f", 15: "k" }, ["OK"]);
  assert.equal(Object.keys(b).length, 16);
  assert.deepEqual([b[18], b[17], b[16], b[15], b[28]], ["f", "", "f", "k", "f"]);
  assert.equal(b[36], undefined);
});

test("ohne Quelle: Clara fragt und nennt das Praxisprogramm mit Datum, Lena nur mit MAS", async () => {
  const a = await befundErmitteln("x", PATIENT, { kiefer: "OK", pvs: pvsOk, lena: lenaDa });
  assert.equal(a.ok, false);
  assert.equal(a.grund, "befund_quelle");
  assert.match(a.frage, /den aktuellen aus Dampsoft vom 12\.10\.2026/);
  assert.match(a.frage, /Lenas Erstuntersuchung/);
  assert.match(a.frage, /neuen Befund/);
  const b = await befundErmitteln("x", PATIENT, { kiefer: "OK", pvs: pvsOk, lena: lenaDa, lenaErlaubt: false });
  assert.doesNotMatch(b.frage, /Lena/);
  assert.equal(await lenaFreigeschaltet("planrPraxis"), false);
  assert.equal(await lenaFreigeschaltet("masPraxis"), true);
});

test("aus Dampsoft: Befund genau wie dort, fremde Kuerzel mit Hinweis, Auftrag ueberschreibt nichts", async () => {
  const r = await befundErmitteln("x", PATIENT, { kiefer: "OK", quelle: "pvs", ausAuftrag: "15 fehlt", pvs: pvsOk, lena: keiner });
  assert.equal(r.ok, true);
  assert.deepEqual(r.befund, DAMPSOFT);
  assert.deepEqual(r.quelle, { art: "pvs", pvs: "Dampsoft", datum: "2026-10-12" });
  assert.equal(r.neu, undefined);
  assert.ok(r.hinweise.some((h) => /15 t1/.test(h)));
});

test("aus Dampsoft mit genannter Aenderung: nur der geaenderte Kiefer geht zur Freigabe", async () => {
  const r = await befundErmitteln("x", PATIENT, { kiefer: "OK", quelle: "pvs", gesprochen: "16 fehlt", pvs: pvsOk, lena: keiner });
  assert.equal(r.befund[16], "f");
  assert.equal(r.befund[36], "sk");
  assert.equal(r.quelle.art, "gesprochen+pvs");
  assert.deepEqual(r.neu.kiefer, ["OK"]);
  assert.deepEqual(r.neu.geaendert, { 16: "f" });
  assert.equal(Object.keys(r.neu.zaehne).length, 16);
  assert.equal(r.pvs.nummer, "4711");
});

test("neu: erst die Frage mit Freigabe-Hinweis, dann der ganze Kiefer fuer Dampsoft", async () => {
  const frage = await befundErmitteln("x", PATIENT, { kiefer: "OK", quelle: "neu", pvs: pvsOk, lena: keiner, ausAuftrag: "15 fehlt" });
  assert.equal(frage.grund, "befund_fehlt");
  assert.match(frage.frage, /im Oberkiefer/);
  assert.match(frage.frage, /nach Dampsoft übertrage, lese ich ihn Ihnen zur Freigabe vor/);
  const r = await befundErmitteln("x", PATIENT, {
    kiefer: "OK", kieferListe: ["OK"], quelle: "neu", gesprochen: "es fehlen 16 und 17 und 15 ist überkront", pvsName: "Dampsoft", lena: keiner, pvs: keiner,
  });
  assert.equal(r.ok, true);
  assert.equal(r.quelle.art, "gesprochen");
  assert.deepEqual(r.neu.kiefer, ["OK"]);
  assert.deepEqual([r.neu.zaehne[17], r.neu.zaehne[16], r.neu.zaehne[15], r.neu.zaehne[14], r.neu.zaehne[18]], ["f", "f", "k", "", "f"]);
  const korrektur = await befundErmitteln("x", PATIENT, {
    kiefer: "OK", kieferListe: ["OK"], quelle: "neu", gesprochen: "15 ist vorhanden", bisher: r.gesagt, pvsName: "Dampsoft", lena: keiner, pvs: keiner,
  });
  assert.deepEqual([korrektur.neu.zaehne[16], korrektur.neu.zaehne[15]], ["f", ""]);
});

test("ohne gespeicherten Befund: gleich die Befundfrage; Bridge weg wird genannt", async () => {
  const ohne = await befundErmitteln("x", PATIENT, { kiefer: "OK", pvs: keiner, lena: keiner });
  assert.equal(ohne.grund, "befund_fehlt");
  assert.match(ohne.frage, /im Oberkiefer/);
  assert.match(ohne.frage, /überkront/);
  assert.match(ohne.frage, /zur Kontrolle vor/);
  const weg = await befundErmitteln("x", PATIENT, { kiefer: "OK", pvs: pvsWeg, lena: keiner });
  assert.equal(weg.grund, "befund_fehlt");
  assert.match(weg.frage, /Den Befund aus Dampsoft kann ich gerade nicht lesen/);
  const gewaehlt = await befundErmitteln("x", PATIENT, { kiefer: "OK", quelle: "pvs", pvs: pvsWeg, lena: lenaDa });
  assert.equal(gewaehlt.grund, "befund_quelle");
  assert.match(gewaehlt.frage, /Lenas Erstuntersuchung/);
});

test("PlanR: lesen per Nummer oder Name+Geburtsdatum, schreiben nur die genannten Kiefer", async () => {
  process.env.PLANR_HKP_KEY = "k";
  const aufrufe = [];
  _setHolen(async (url, init) => {
    const u = new URL(url);
    aufrufe.push({ q: Object.fromEntries(u.searchParams), init });
    if (u.searchParams.get("clientId") === "fremd") return { ok: false, status: 404, json: async () => ({ ok: false, meldung: "Praxis unbekannt." }) };
    if (init.method === "POST") return { ok: true, status: 200, json: async () => ({ ok: true, pvs: "Dampsoft", geschrieben: ["16"] }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, pvs: "Dampsoft", patient: "4711", datum: "2026-10-12", zaehne: DAMPSOFT }) };
  });
  const p = await pvsBefund("praxis", PATIENT);
  assert.equal(p.ok, true);
  assert.equal(p.befund[36], "sk");
  assert.equal(aufrufe.at(-1).q.patient, "4711");
  assert.equal(aufrufe.at(-1).init.headers["X-PlanR-Key"], "k");
  await pvsBefund("praxis", { id: "abc", firstName: "Anna", lastName: "Müller", birthDate: "1972-03-05" });
  assert.deepEqual([aufrufe.at(-1).q.name, aufrufe.at(-1).q.geburt, aufrufe.at(-1).q.patient], ["Müller", "1972-03-05", undefined]);
  assert.equal(await pvsBefund("fremd", PATIENT), null);
  const w = await befundInsPvs("praxis", PATIENT, { kiefer: ["OK"], zaehne: { 16: "f" }, nummer: "4711" });
  assert.deepEqual(w, { ok: true, pvs: "Dampsoft", geschrieben: ["16"] });
  assert.deepEqual(JSON.parse(aufrufe.at(-1).init.body), { patient: "4711", kiefer: ["OK"], zaehne: { 16: "f" } });
  _setHolen(null);
});

test("Vorlesen und Verstehen: jedes Kuerzel kommt so zurueck, wie es vorgelesen wurde", () => {
  const codes = [...Object.keys(E.BEFUND_KUERZEL), "i"];
  const sitze = OK.filter((z) => !z.endsWith("8"));
  for (let i = 0; i < codes.length; i += sitze.length) {
    const b = Object.fromEntries(OK.map((z) => [z, z.endsWith("8") ? "f" : ""]));
    codes.slice(i, i + sitze.length).forEach((c, j) => { b[sitze[j]] = c; });
    const satz = befundSatz(b, ["OK"]);
    assert.deepEqual(E.befundVerstehen(satz, "OK"), b, satz);
  }
  const mehrere = Object.fromEntries(OK.map((z) => [z, ""]));
  Object.assign(mehrere, { 17: "k", 15: "k", 13: "k", 18: "f", 28: "f" });
  assert.deepEqual(E.befundVerstehen(befundSatz(mehrere, ["OK"]), "OK"), mehrere);
  assert.equal(zahnBefundSatz({ 16: "f", 15: "k", 36: "sk" }), "es fehlt 16; überkront: 15; Implantatkrone: 36");
});
