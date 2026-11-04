// Befundwahl durch die ganze Route (Chef 14.10.2026): Quelle fragen, Dampsoft-Befund uebernehmen, neuen
// Befund vorlesen, erst nach "ja" nach Dampsoft schreiben. PlanR ist hier ein lokaler Nachbau; HKPs
// landen in der Test-Praxis und werden wieder geloescht.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

const CID = "zzz-mas2-befundwahl";
process.env.PLANR_HKP_KEY = "k";
process.env.MAS_HKP_AUSFUEHRUNG_FRAGE = "0";

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const DAMPSOFT = Object.fromEntries([...OK, ...UK].map((z) => [z, ""]));
Object.assign(DAMPSOFT, { 18: "f", 28: "f", 15: "f", 16: "k", 36: "sk" });
const geschrieben = [];
const gelesen = [];
const vorgaenge = [];
const aenderungen = [];
const kurz = () => new Promise((r) => setTimeout(r, 80));

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
      : { id: "4711", vorname: "Anna", name: "Befundtest", geburtsdatum: "1972-03-05" }] });
  }
  if (u.pathname === "/api/intern/pvs/befund" && u.searchParams.get("patient") === "815") {
    return senden(502, { ok: false, pvs: "DS-Win", meldung: "Die PlanR-Bridge in der Praxis braucht ein Update." });
  }
  if (u.pathname === "/api/intern/befund/vorgang") {
    vorgaenge.push(JSON.parse(roh));
    return senden(200, { ok: true, vorgang: {} });
  }
  if (u.pathname === "/api/intern/befund/aenderung") {
    aenderungen.push(JSON.parse(roh));
    return senden(200, { ok: true, befund: {} });
  }
  if (u.pathname === "/api/intern/pvs/befund" && req.method === "POST") {
    const b = JSON.parse(roh);
    geschrieben.push(b);
    return senden(200, { ok: true, pvs: "Dampsoft", patient: b.patient, geschrieben: Object.keys(b.zaehne) });
  }
  if (u.pathname === "/api/intern/pvs/befund") {
    gelesen.push(Object.fromEntries(u.searchParams));
    return senden(200, { ok: true, pvs: "Dampsoft", patient: "4711", datum: "2026-10-12", zaehne: DAMPSOFT });
  }
  return senden(404, { ok: false });
});
await new Promise((r) => planr.listen(0, "127.0.0.1", r));
process.env.PLANR_URL = `http://127.0.0.1:${planr.address().port}`;

const { _setBillingLaden } = await import("../src/hkp/planrClara.js");
_setBillingLaden(async () => ({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }));
const { default: router } = await import("../src/routes/hkp.js");
const { hkpLesen, hkpLoeschenFuerTest } = await import("../src/hkp/store.js");

const app = express();
app.use(express.json());
app.use(router);
const mas = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
const angelegt = [];

async function rufe(body) {
  const r = await fetch(`http://127.0.0.1:${mas.address().port}/tools/hkp-create-draft`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": CID }, body: JSON.stringify({ name: "Anna Befundtest", ...body }),
  });
  const d = await r.json();
  if (d.hkpId) angelegt.push(d.hkpId);
  return d;
}

test.after(async () => {
  for (const id of angelegt) await hkpLoeschenFuerTest(CID, id).catch(() => {});
  _setBillingLaden(null);
  mas.close();
  planr.close();
});

test("aus Dampsoft: Clara fragt, uebernimmt den Befund unveraendert und schreibt nichts", async () => {
  const auftrag = "Brücke von 14 auf 16";
  const frage = await rufe({ auftrag });
  assert.equal(frage.rueckfrage, "befund_quelle", frage.message);
  assert.match(frage.message, /den aktuellen aus Dampsoft vom 12\.10\.2026/);
  assert.doesNotMatch(frage.message, /Lena/);
  assert.deepEqual(gelesen.at(-1), { clientId: CID, patient: "4711" });
  const vorschau = await rufe({ auftrag, befund: "aus Dampsoft" });
  assert.equal(vorschau.rueckfrage, "vorlesen", vorschau.message);
  assert.match(vorschau.message, /es fehlen 15, 18 und 28|es fehlen 18, 15 und 28|es fehlt/);
  const fertig = await rufe({ auftrag, bestaetigt: true });
  assert.ok(fertig.hkpId, fertig.message);
  assert.match(fertig.message, /Befund aus Dampsoft vom 12\.10\.2026/);
  const h = await hkpLesen(CID, fertig.hkpId);
  assert.deepEqual(h.befundQuelle, { art: "pvs", pvs: "Dampsoft", datum: "2026-10-12" });
  assert.equal(JSON.parse(h.befundJson)[36], "sk");
  assert.equal(JSON.parse(h.planJson).zaehne["16"].B, "k");
  assert.equal(geschrieben.length, 0);
});

test("Vorgang: PlanR erfaehrt Befund, Planung und Anlegen; das Handy zeigt das Zahnschema", async () => {
  vorgaenge.length = 0;
  const auftrag = "Brücke von 14 auf 16";
  const frage = await rufe({ auftrag });
  assert.equal(frage.card?.kind, "befund", JSON.stringify(frage.card));
  const url = new URL(frage.card.url);
  assert.equal(url.pathname, "/planer/hkp/");
  assert.deepEqual([url.searchParams.get("befund"), url.searchParams.get("c"), url.searchParams.get("ansicht")], ["4711", CID, "mobil"]);
  const [exp, sig] = url.searchParams.get("bt").split(".");
  const { createHmac } = await import("node:crypto");
  assert.equal(sig, createHmac("sha256", "k").update(`befund-flip:${CID}/4711:${exp}`).digest("base64url").slice(0, 24));
  assert.equal(frage.nummer, undefined);
  await kurz();
  assert.deepEqual(vorgaenge.at(-1), { patient: "4711", modul: "hkp", phase: "befund", auftrag });

  const vorschau = await rufe({ auftrag, befund: "aus Dampsoft" });
  assert.equal(vorschau.card?.kind, "befund");
  await kurz();
  const planung = vorgaenge.find((v) => v.phase === "planung");
  assert.ok(planung, JSON.stringify(vorgaenge));
  assert.deepEqual([planung.plan["14"]?.R, planung.plan["15"]?.R, planung.plan["16"]?.R], ["KV", "BV", "K"], JSON.stringify(planung.plan));
  assert.equal(planung.meldung, "");

  const fertig = await rufe({ auftrag, bestaetigt: true });
  angelegt.push(fertig.hkpId);
  assert.equal(fertig.card?.kind, "hkp");
  await kurz();
  assert.deepEqual([vorgaenge.at(-1).phase, vorgaenge.at(-1).hkpId], ["angelegt", fertig.hkpId]);
});

test("Befund zuerst: schon die Rueckfrage nach der Versorgung zeigt das Zahnschema und meldet PlanR den Befund", async () => {
  vorgaenge.length = 0;
  const auftrag = "ich möchte gern einen HKP erstellen";
  const frage = await rufe({ auftrag });
  assert.equal(frage.rueckfrage, "versorgung", frage.message);
  assert.equal(frage.card?.kind, "befund", JSON.stringify(frage));
  assert.equal(new URL(frage.card.url).searchParams.get("befund"), "4711");
  await kurz();
  assert.deepEqual(vorgaenge.at(-1), { patient: "4711", modul: "hkp", phase: "befund", auftrag });
  const bereit = await rufe({});
  assert.match(bereit.message, /Was soll ich für/);
  assert.equal(bereit.card?.kind, "befund");
});

test("Praxisprogramm nicht lesbar: PlanR legt den Befund aus dem Gespraech an, das Handy zeigt ihn trotzdem", async () => {
  vorgaenge.length = 0;
  const auftrag = "ich möchte gern einen HKP erstellen";
  const frage = await rufe({ name: "Bert Ohnebridge", auftrag });
  assert.equal(frage.rueckfrage, "versorgung", frage.message);
  assert.equal(new URL(frage.card?.url || "http://x").searchParams.get("befund"), "815", JSON.stringify(frage));
  await kurz();
  assert.deepEqual(vorgaenge.at(-1), {
    patient: "815", modul: "hkp", phase: "befund", auftrag, label: "Ohnebridge, Bert", geburt: "1950-01-02", pvs: "DS-Win",
    meldung: "Befund aus DS-Win nicht lesbar – Befund aus dem Gespräch",
  });
  const neu = await rufe({ name: "Bert Ohnebridge", auftrag: "Teleskopprothese im Oberkiefer auf 13 und 23" });
  assert.match(neu.message, /braucht ein Update/);
  assert.equal(neu.card?.kind, "befund");
});

test("neu: vorlesen, Korrektur, erst nach ja nach Dampsoft – nur der Oberkiefer", async () => {
  const auftrag = "Brücke von 24 auf 26";
  const frage = await rufe({ auftrag, befund_quelle: "neu" });
  assert.equal(frage.rueckfrage, "befund_fehlt", frage.message);
  assert.match(frage.message, /im Oberkiefer/);
  assert.match(frage.message, /zur Freigabe vor/);
  aenderungen.length = 0;
  const pruefen = await rufe({ auftrag, befund: "es fehlen 25 und 17 und 24 ist überkront" });
  assert.equal(pruefen.rueckfrage, "befund_freigabe", pruefen.message);
  assert.match(pruefen.message, /überkront: 24/);
  assert.equal(geschrieben.length, 0);
  await kurz();
  // Gesagtes steht sofort offen in PlanR (rosa im Zahnschema), geschrieben wird erst nach dem Ja
  assert.equal(aenderungen.length, 1);
  assert.deepEqual([aenderungen[0].patient, aenderungen[0].zaehne[25], aenderungen[0].zaehne[24]], ["4711", "f", "k"]);
  const korrigiert = await rufe({ auftrag, befund: "17 ist vorhanden" });
  assert.equal(korrigiert.rueckfrage, "befund_freigabe", korrigiert.message);
  assert.doesNotMatch(korrigiert.message, /es fehlen 17/);
  assert.equal(geschrieben.length, 0);
  const frei = await rufe({ auftrag, befund: "ja, stimmt" });
  assert.equal(geschrieben.length, 1, frei.message);
  assert.deepEqual(geschrieben[0].kiefer, ["OK"]);
  assert.equal(geschrieben[0].patient, "4711");
  assert.equal(Object.keys(geschrieben[0].zaehne).length, 16);
  assert.deepEqual([geschrieben[0].zaehne[25], geschrieben[0].zaehne[24], geschrieben[0].zaehne[17], geschrieben[0].zaehne[18]], ["f", "k", "", "f"]);
  assert.equal(frei.rueckfrage, "vorlesen", frei.message);
  assert.match(frei.message, /^Der Befund ist in Dampsoft als geänderter Befund gespeichert, ohne 01 und ohne Abrechnung\./);
  assert.doesNotMatch(frei.message, /Befund Oberkiefer/);
  const fertig = await rufe({ auftrag, bestaetigt: true });
  assert.ok(fertig.hkpId, fertig.message);
  assert.equal(geschrieben.length, 1);
  const h = await hkpLesen(CID, fertig.hkpId);
  assert.equal(h.befundQuelle.art, "gesprochen");
  assert.equal(h.befundQuelle.uebertragen, "Dampsoft");
  assert.equal(JSON.parse(h.planJson).zaehne["24"].B, "k");
});

test("wie Clara ruft: Befund und Korrektur haengen am Auftrag, Freigabe per befund_freigegeben", async () => {
  geschrieben.length = 0;
  const auftrag = "Brücke von 24 auf 26";
  assert.equal((await rufe({ auftrag })).rueckfrage, "befund_quelle");
  assert.equal((await rufe({ auftrag, befund_quelle: "neu" })).rueckfrage, "befund_fehlt");
  const mitBefund = `${auftrag}. Es fehlen 25 und 17 und 24 ist überkront`;
  const pruefen = await rufe({ auftrag: mitBefund });
  assert.equal(pruefen.rueckfrage, "befund_freigabe", pruefen.message);
  assert.match(pruefen.message, /es fehlen 17, 18, 25 und 28; überkront: 24;/);
  const korrigiert = `${mitBefund}. 17 ist vorhanden`;
  const nochmal = await rufe({ auftrag: korrigiert });
  assert.equal(nochmal.rueckfrage, "befund_freigabe", nochmal.message);
  assert.match(nochmal.message, /es fehlen 18, 25 und 28; überkront: 24; vorhanden: 16 bis 23, 17|vorhanden: 17 bis/);
  assert.doesNotMatch(nochmal.message, /fehlen 17/);
  assert.equal(geschrieben.length, 0);
  const frei = await rufe({ auftrag: korrigiert, befund_freigegeben: true });
  assert.equal(geschrieben.length, 1, frei.message);
  assert.deepEqual([geschrieben[0].zaehne[25], geschrieben[0].zaehne[24], geschrieben[0].zaehne[17]], ["f", "k", ""]);
  assert.equal(frei.rueckfrage, "vorlesen", frei.message);
  const fertig = await rufe({ auftrag: korrigiert, bestaetigt: true });
  assert.ok(fertig.hkpId, fertig.message);
  assert.equal(geschrieben.length, 1);
});

test("gemerkter Befund kommt bei jedem Aufruf wieder: die Korrektur im Auftrag gilt trotzdem", async () => {
  geschrieben.length = 0;
  const auftrag = "Brücke von 24 auf 26";
  const befund = "es fehlen 25 und 17 und 24 ist überkront";
  assert.equal((await rufe({ auftrag, befund_quelle: "neu" })).rueckfrage, "befund_fehlt");
  assert.equal((await rufe({ auftrag, befund })).rueckfrage, "befund_freigabe");
  const korrigiert = `${auftrag}. 17 ist vorhanden`;
  const nochmal = await rufe({ auftrag: korrigiert, befund });
  assert.equal(nochmal.rueckfrage, "befund_freigabe", nochmal.message);
  assert.doesNotMatch(nochmal.message, /fehlen 17/);
  const frei = await rufe({ auftrag: korrigiert, befund, befund_freigegeben: true });
  assert.equal(geschrieben.length, 1, frei.message);
  assert.equal(geschrieben[0].zaehne[17], "");
  const fertig = await rufe({ auftrag: korrigiert, befund, bestaetigt: true });
  assert.ok(fertig.hkpId, fertig.message);
});

test("aus Dampsoft mit spaeter genannter Aenderung: nur die Aenderung zur Freigabe, dann nach Dampsoft", async () => {
  geschrieben.length = 0;
  const auftrag = "Brücke von 14 auf 16";
  assert.equal((await rufe({ auftrag })).rueckfrage, "befund_quelle");
  const vorschau = await rufe({ auftrag, befund_quelle: "Dampsoft" });
  assert.equal(vorschau.rueckfrage, "vorlesen", vorschau.message);
  const geaendert = `${auftrag}. 17 fehlt`;
  const pruefen = await rufe({ auftrag: geaendert });
  assert.equal(pruefen.rueckfrage, "befund_freigabe", pruefen.message);
  assert.match(pruefen.message, /Gegenüber Dampsoft ändere ich: es fehlt 17\./);
  const frei = await rufe({ auftrag: geaendert, befund_freigegeben: true });
  assert.equal(geschrieben.length, 1, frei.message);
  assert.deepEqual(geschrieben[0].kiefer, ["OK"]);
  assert.deepEqual([geschrieben[0].zaehne[17], geschrieben[0].zaehne[16], geschrieben[0].zaehne[15]], ["f", "k", "f"]);
  const fertig = await rufe({ auftrag: geaendert, bestaetigt: true });
  assert.ok(fertig.hkpId, fertig.message);
  const h = await hkpLesen(CID, fertig.hkpId);
  assert.equal(h.befundQuelle.art, "gesprochen+pvs");
  assert.equal(h.befundQuelle.uebertragen, "Dampsoft");
});

// Demo 04.11.2026: Antworten kommen woertlich als chef_satz, das Modell setzt keine Felder; jedes Gespraech neu.
// Das Sprachverstehen ist hier ein fester Nachbau, die Route dahinter laeuft echt.
const { _setFragen, antwortPruefen } = await import("../src/hkp/antwortVerstehen.js");
const VERSTEHEN = {
  "den aktuellen": { art: "zustimmung", quelle: "pvs" },
  "Der Befund stimmt.": { art: "zustimmung" },
  "Ja, der Befund stimmt.": { art: "zustimmung" },
  "Legt den erst mal so an.": { art: "zustimmung" },
  "Ja, aber in Gold bitte.": { art: "angabe", angabe: "in Gold" },
  "Ich möchte eine Oberkieferprothese mit Teleskop auf 1,3 und 2,3, alle anderen Zähne werden ersetzt.":
    { art: "angabe", angabe: "Oberkieferprothese mit Teleskop auf 13 und 23, alle anderen Zähne werden ersetzt" },
};
_setFragen(async (messages) => {
  const satz = /Antwort des Zahnarztes: "([^"]*)"/.exec(messages.at(-1).content)?.[1] || "";
  return { ok: true, text: JSON.stringify({ quelle: "", entfernen: [], erhalten: [], angabe: "", art: "unklar", ...VERSTEHEN[satz] }) };
});
test.after(() => _setFragen(null));

test("Demo-Ablauf Teleskop: woertliche Antworten, Pfeiler bleiben stehen, nur der Oberkiefer geht nach Dampsoft", async () => {
  geschrieben.length = 0;
  const start = "ich möchte für Herrn Anna Befundtest einen Heil- und Kostenplan erstellen.";
  const befund = "13, 23 vorhanden, 11, 12, 14, 15, 16, 17, 18, 21, 22, 24, 25, 26, 27, 28 fehlen";
  const s = { sitzung: "demo-1" };
  assert.equal((await rufe({ auftrag: start, ...s })).rueckfrage, "versorgung");
  const satz = "Ich möchte eine Oberkieferprothese mit Teleskop auf 1,3 und 2,3, alle anderen Zähne werden ersetzt.";
  const q = await rufe({ auftrag: start, befund, chef_satz: satz, ...s });
  assert.equal(q.rueckfrage, "befund_quelle", q.message);
  const pruefen = await rufe({ auftrag: start, befund, chef_satz: "den aktuellen", ...s });
  assert.equal(pruefen.rueckfrage, "befund_freigabe", pruefen.message);
  assert.doesNotMatch(pruefen.message, /\b(13|23)\b[^.]*\?|fehl\w* [^.]*\b(13|23)\b/);
  const frei = await rufe({ auftrag: start, befund, chef_satz: "Der Befund stimmt.", ...s });
  assert.equal(geschrieben.length, 1, frei.message);
  assert.deepEqual(geschrieben[0].kiefer, ["OK"]);
  assert.equal(geschrieben[0].zaehne[13], "");
  assert.equal(geschrieben[0].zaehne[23], "");
  assert.ok(!Object.keys(geschrieben[0].zaehne).some((z) => /^[34]/.test(z)));
  assert.equal(frei.rueckfrage, "vorlesen", frei.message);
  const gold = await rufe({ auftrag: "Teleskop-HKP für Anna Befundtest", befund, chef_satz: "Ja, aber in Gold bitte.", bestaetigt: true, ...s });
  assert.ok(!gold.hkpId, "Korrektur zur Vorschau legt nichts an");
  assert.equal(gold.rueckfrage, "vorlesen", gold.message);
  assert.match(gold.message, /gold/i);
  const fertig = await rufe({ auftrag: "Teleskop-HKP für Anna Befundtest, geboren am ...", befund, chef_satz: "Legt den erst mal so an.", ...s });
  assert.ok(fertig.hkpId, fertig.message);
  // Neues Gespraech: nichts vom alten Versuch gilt, die Quelle wird wieder gefragt
  const neu = await rufe({ auftrag: `${start} ${satz}`, befund, sitzung: "demo-2" });
  assert.equal(neu.rueckfrage, "befund_quelle", neu.message);
});

test("Oberkiefer-Totalprothese aendert den Unterkiefer nicht; alte Vorschau gilt im neuen Gespraech nicht", async () => {
  geschrieben.length = 0;
  const auftrag = "Ich möchte eine Oberkäfertotalprothese planen";
  const v = await rufe({ auftrag, befund: "es fehlen 31 und 32", befund_quelle: "pvs", sitzung: "tp-1" });
  assert.notEqual(v.rueckfrage, "befund_freigabe", v.message);
  assert.doesNotMatch(v.message, /\b3[12]\b/);
  assert.equal(geschrieben.length, 0);
  const fremd = await rufe({ auftrag, befund_quelle: "pvs", chef_satz: "Ja, der Befund stimmt.", sitzung: "tp-2" });
  assert.ok(!fremd.hkpId);
  assert.ok(geschrieben.every((g) => !Object.keys(g.zaehne).some((z) => /^[34]/.test(z))));
});

test("Sprachverstehen: nur gueltiges JSON zaehlt, Zaehne nur aus der Frage", () => {
  assert.equal(antwortPruefen({ art: "vielleicht" }), null);
  assert.equal(antwortPruefen(null), null);
  const r = antwortPruefen({ art: "zustimmung", entfernen: ["12", "99", 13, "12"], quelle: "dampsoft", angabe: "x" }, ["12", "13"]);
  assert.deepEqual(r, { art: "zustimmung", quelle: "", entfernen: ["12", "13"], erhalten: [], angabe: "" });
});
