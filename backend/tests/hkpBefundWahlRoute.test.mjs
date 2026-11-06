// Befundwahl durch die ganze Route (Chef 14.10.2026): Quelle fragen, Dampsoft-Befund uebernehmen, neuen
// Befund vorlesen, erst nach "ja" nach Dampsoft schreiben. PlanR ist hier ein lokaler Nachbau; HKPs
// landen in der Test-Praxis und werden wieder geloescht.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

const CID = "zzz-mas2-befundwahl";
process.env.MAS_HKP_FACH ??= "0";
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
const verworfen = [];
// Offene Aenderungen in PlanR: 4712 ein nie freigegebener Vorschlag aus einem frueheren HKP-Gespraech,
// 4713 eine Aenderung aus dem Befund-Werkzeug ("gilt jetzt auch fuer den naechsten Plan")
const OFFEN = {
  4712: { offen: { 11: "", 12: "" }, offenWer: "Clara – HKP-Vorschlag", stand: "2026-11-04T20:33:12.406Z" },
  4713: { offen: { 17: "f" }, offenWer: "Clara", stand: "2026-11-04T20:33:12.406Z" },
};
const kurz = () => new Promise((r) => setTimeout(r, 80));

const planr = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://planr");
  let roh = "";
  for await (const c of req) roh += c;
  const senden = (status, d) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  if (req.headers["x-planr-key"] !== "k" || u.searchParams.get("clientId") !== CID) return senden(401, { ok: false });
  if (u.pathname === "/api/intern/pvs/patienten") {
    const q = [...u.searchParams.values()].join(" ");
    return senden(200, { ok: true, patienten: [q.includes("Ohnebridge")
      ? { id: "815", vorname: "Bert", name: "Ohnebridge", geburtsdatum: "1950-01-02" }
      : q.includes("Altvorschlag") ? { id: "4712", vorname: "Carla", name: "Altvorschlag", geburtsdatum: "1961-04-07" }
        : q.includes("Werkzeugrest") ? { id: "4713", vorname: "Dora", name: "Werkzeugrest", geburtsdatum: "1963-05-08" }
          : { id: "4711", vorname: "Anna", name: "Befundtest", geburtsdatum: "1972-03-05" }] });
  }
  if (u.pathname === "/api/intern/befund/verwerfen") {
    const nr = String(JSON.parse(roh).patient);
    verworfen.push(nr);
    delete OFFEN[nr];
    return senden(200, { ok: true, befund: {} });
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
    const nr = u.searchParams.get("patient") || "4711";
    return senden(200, { ok: true, pvs: "Dampsoft", patient: nr, datum: "2026-10-12", zaehne: DAMPSOFT, ...OFFEN[nr] });
  }
  return senden(404, { ok: false });
});
await new Promise((r) => planr.listen(0, "127.0.0.1", r));
process.env.PLANR_URL = `http://127.0.0.1:${planr.address().port}`;

const { _setBillingLaden } = await import("../src/hkp/planrClara.js");
_setBillingLaden(async () => ({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }));
const { default: router } = await import("../src/routes/hkp.js");
const { hkpDateiLesen, hkpLesen, hkpLoeschenFuerTest } = await import("../src/hkp/store.js");

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
  assert.equal(frage.rueckfrage, "befund_anzeige", frage.message);
  assert.match(frage.message, /steht auf dem Handy\. Stimmt er so\?/);
  assert.equal(frage.card?.kind, "befund");
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
  assert.equal(frage.rueckfrage, "befund_anzeige", frage.message);
  assert.match(frage.message, /steht auf dem Handy\. Stimmt er so\?/);
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
  assert.equal(frage.rueckfrage, "befund_anzeige", frage.message);
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
  assert.match(aenderungen[0].wer, / – HKP-Vorschlag$/, "PlanR erkennt den Vorschlag des Gespraechs");
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
  assert.match(frei.message, /^Der Befund ist in Dampsoft als geänderter Befund gespeichert, ohne Null-Eins und ohne Abrechnung\./);
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
  assert.equal((await rufe({ auftrag })).rueckfrage, "befund_anzeige");
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
  assert.equal((await rufe({ auftrag, befund_quelle: "neu" })).rueckfrage, "befund_anzeige");
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
  assert.equal((await rufe({ auftrag })).rueckfrage, "befund_anzeige");
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
const { _setFragen, antwortPruefen, planSatz } = await import("../src/hkp/antwortVerstehen.js");
const VERSTEHEN = {
  "den aktuellen": { art: "zustimmung", quelle: "pvs" },
  "Der Befund stimmt.": { art: "zustimmung" },
  "Ja, der Befund stimmt.": { art: "zustimmung" },
  "Legt den erst mal so an.": { art: "zustimmung" },
  "Ja, aber in Gold bitte.": { art: "angabe", angabe: "in Gold" },
  "Ich möchte eine Oberkieferprothese mit Teleskop auf 1,3 und 2,3, alle anderen Zähne werden ersetzt.":
    { art: "angabe", angabe: "Oberkieferprothese mit Teleskop auf 13 und 23, alle anderen Zähne werden ersetzt" },
  "Ich möchte bitte eine Oberkiefer-Totalprothese planen mit Teleskop auf den Zähnen 1,3 und 2,3.":
    { art: "angabe", angabe: "Oberkiefer-Totalprothese mit Teleskop auf den Zähnen 13 und 23" },
  "Wir nehmen einen neuen Befund auf.": { art: "angabe", quelle: "neu" },
  "Ballon im Oberkiefer und Unterkiefer": {
    art: "angabe", angabe: "Ballon", plan: { versorgung: "allon", n: 6, kiefer: "beide" },
  },
  "feste Brücke auf sechs Implantaten oben und unten": {
    art: "angabe", plan: { versorgung: "allon", n: 6, kiefer: "beide" },
  },
  "Mach oben eine Totalprothese.": {
    art: "angabe", plan: { versorgung: "totalprothese", kiefer: "OK" }, sagen: "Totalprothese im Oberkiefer.",
  },
  "Nein, der ist richtig.": { art: "ablehnung", sagen: "Der Befund bleibt so. Was soll ich planen?" },
  // Probe 05.11.2026 23:05 am echten Modell auf "… steht auf dem Handy. Stimmt er so?"
  "Ja, der ist richtig.": { art: "zustimmung", quelle: "pvs", sagen: "Der Befund ist bestätigt. Was soll als Versorgung erstellt werden?" },
  "Das ist richtig.": { art: "zustimmung" },
  "Okay, im Oberkiefer stehen der Zahn 1, 3 und 2, 3, alle anderen Zähne sind entfernt.":
    { art: "angabe", befund: { kiefer: "OK", zaehne: { 13: "vorhanden", 23: "vorhanden" }, rest: "fehlt" } },
  "Nein, der Befund stimmt nicht.": { art: "ablehnung" },
  "Ja, stimmt so.": { art: "zustimmung" },
  "16 und 26 fehlen.": { art: "angabe", befund: { kiefer: "OK", zaehne: { 16: "fehlt", 26: "fehlt" }, rest: "" } },
  // Probe 04.11.2026: "Es stehen nur zwei Zaehne" las das Modell einmal als beide Kiefer
  "Der Befund ist 1,3 ist vorhanden, 2, 3 ist vorhanden, alle anderen Zähne im Oberkiefer fehlen. Es stehen nur zwei Zähne, 1, 3 und 2, 3.":
    { art: "angabe", befund: { kiefer: "beide", zaehne: { 13: "vorhanden", 23: "vorhanden" }, rest: "fehlt" } },
};
// Live 05.11.2026 00:26-00:28 (Antworten wie das echte Modell sie gab)
const OK_FEHLEN = Object.fromEntries(OK.filter((z) => z !== "13" && z !== "23").map((z) => [z, "fehlt"]));
const DIKTAT_ZU_LANGSAM = "Gut, es fehlen die Zähne 1, 8, 1, 7, 1, 6, 1, 5, 1, 4, 1, 2, 1, 1, 2, 1, 2, 2 und 2, 4 bis 2, 8. Die Zähne 1, 3 und 2, 3 sind vorhanden. Im Unterkiefer sind alle Zähne vorhanden, auch die Weisheitszähne.";
Object.assign(VERSTEHEN, {
  "Wir müssen erst mal den Befund ändern. Die Zähne 1, 3 und 2, 3 stehen noch.":
    { art: "angabe", angabe: "Wir müssen erst mal den Befund ändern. Die Zähne 1, 3 und 2, 3 stehen noch.", befund: { kiefer: "beide", zaehne: { 13: "vorhanden", 23: "vorhanden" }, rest: "" } },
  "Eine Oberkieferprothese mit Teleskopkrone auf 1,3 und 2,3.": { art: "angabe", angabe: "Oberkieferprothese mit Teleskopkrone auf 13 und 23" },
  "Es fehlen die Zähne 18, 17, 16, 15, 14, 12, 11, 21, 22 und 24 bis 28, 13 und 23 sind vorhanden. Im Unterkiefer sind alle Zähne vorhanden.":
    { art: "angabe", quelle: "neu", befund: { kiefer: "beide", zaehne: { 13: "vorhanden", 23: "vorhanden", ...OK_FEHLEN }, rest: "vorhanden" } },
  "Nein, eins, drei und zwei, drei sind vorhanden, alle anderen Zähne im Oberkiefer fehlen, im Unterkiefer sind alle Zähne erhalten.":
    { art: "angabe", befund: { kiefer: "beide", zaehne: { 13: "vorhanden", 23: "vorhanden" }, rest: { OK: "fehlt", UK: "vorhanden" } } },
});
_setFragen(async (messages) => {
  const satz = /Antwort des Zahnarztes: "([^"]*)"/.exec(messages.at(-1).content)?.[1] || "";
  if (satz === DIKTAT_ZU_LANGSAM) return { ok: false, error: "timeout" };
  return { ok: true, text: JSON.stringify({ quelle: "", entfernen: [], erhalten: [], angabe: "", art: "unklar", ...VERSTEHEN[satz] }) };
});
test.after(() => _setFragen(null));

test("Demo-Ablauf Teleskop: woertliche Antworten, Pfeiler bleiben stehen, nur der Oberkiefer geht nach Dampsoft", async () => {
  geschrieben.length = 0;
  const start = "ich möchte für Herrn Anna Befundtest einen Heil- und Kostenplan erstellen.";
  const befund = "13, 23 vorhanden, 11, 12, 14, 15, 16, 17, 18, 21, 22, 24, 25, 26, 27, 28 fehlen";
  const s = { sitzung: "demo-1" };
  assert.equal((await rufe({ auftrag: start, ...s })).rueckfrage, "befund_anzeige");
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
  assert.equal(neu.rueckfrage, "befund_anzeige", neu.message);
});

test("Live 04.11.2026 21:32: diktierter neuer Befund wird der Befund, 'Nein' fragt nach der Korrektur", async () => {
  geschrieben.length = 0;
  const start = "Ich möchte einen Heil- und Kostenplan erstellen für den Herrn Anna Befundtest.";
  const s = { sitzung: "live-2132" };
  const ruf = (chef_satz) => rufe({ auftrag: start, name: "Anna Befundtest", chef_satz, ...s });
  assert.equal((await rufe({ auftrag: start, ...s })).rueckfrage, "befund_anzeige");
  assert.equal((await ruf("Ich möchte bitte eine Oberkiefer-Totalprothese planen mit Teleskop auf den Zähnen 1,3 und 2,3.")).rueckfrage, "befund_quelle");
  assert.equal((await ruf("Wir nehmen einen neuen Befund auf.")).rueckfrage, "befund_fehlt");
  const pruefen = await ruf("Okay, im Oberkiefer stehen der Zahn 1, 3 und 2, 3, alle anderen Zähne sind entfernt.");
  assert.equal(pruefen.rueckfrage, "befund_freigabe", pruefen.message);
  assert.doesNotMatch(pruefen.message, /vorhanden: 17 bis 27/, "nicht der Standardbefund");
  assert.match(pruefen.message, /vorhanden: 13 und 23/, pruefen.message);
  const nein = await ruf("Nein, der Befund stimmt nicht.");
  assert.equal(nein.rueckfrage, "befund_korrektur", nein.message);
  assert.equal(geschrieben.length, 0);
  const korr = await ruf("Der Befund ist 1,3 ist vorhanden, 2, 3 ist vorhanden, alle anderen Zähne im Oberkiefer fehlen. Es stehen nur zwei Zähne, 1, 3 und 2, 3.");
  assert.equal(korr.rueckfrage, "befund_freigabe", korr.message);
  assert.doesNotMatch(korr.message, /Unterkiefer|\b[34][1-8]\b/, "die Oberkiefer-Prothese aendert den Unterkiefer nicht");
  const frei = await ruf("Ja, stimmt so.");
  assert.equal(geschrieben.length, 1, frei.message);
  assert.deepEqual(geschrieben[0].kiefer, ["OK"]);
  assert.deepEqual([geschrieben[0].zaehne[13], geschrieben[0].zaehne[23], geschrieben[0].zaehne[12], geschrieben[0].zaehne[18]], ["", "", "f", "f"]);
  const fertig = await ruf("Legt den erst mal so an.");
  assert.ok(fertig.hkpId, fertig.message);
  await kurz();
  const diktat = JSON.parse((await hkpDateiLesen(CID, fertig.hkpId, "befund"))?.inhalt || "{}").quelle?.diktat || "";
  assert.match(diktat, /13 und 23 vorhanden/, diktat);
  assert.doesNotMatch(diktat, /\b[34][1-8]\b/, "kein Unterkieferzahn im Diktat");
});

test("Probe 04.11.2026: 'Wir nehmen einen neuen Befund auf' auf die Befundfrage laesst neu diktieren", async () => {
  geschrieben.length = 0;
  vorgaenge.length = 0;
  const start = "Ich möchte einen Heil- und Kostenplan erstellen für den Herrn Anna Befundtest.";
  const s = { sitzung: "neu-auf-frage" };
  const ruf = (chef_satz) => rufe({ auftrag: start, chef_satz, ...s });
  assert.equal((await rufe({ auftrag: start, ...s })).rueckfrage, "befund_anzeige");
  assert.equal((await ruf("Ich möchte bitte eine Oberkiefer-Totalprothese planen mit Teleskop auf den Zähnen 1,3 und 2,3.")).rueckfrage, "befund_quelle");
  assert.equal((await ruf("Wir nehmen einen neuen Befund auf.")).rueckfrage, "befund_fehlt");
  assert.equal((await ruf("Okay, im Oberkiefer stehen der Zahn 1, 3 und 2, 3, alle anderen Zähne sind entfernt.")).rueckfrage, "befund_freigabe");
  const neu = await ruf("Wir nehmen einen neuen Befund auf.");
  assert.equal(neu.rueckfrage, "befund_fehlt", neu.message);
  assert.match(neu.message, /^Gut\. Dann nehme ich den Befund jetzt neu auf: Welche Zähne fehlen im Oberkiefer/);
  const pruefen = await ruf("16 und 26 fehlen.");
  assert.equal(pruefen.rueckfrage, "befund_freigabe", pruefen.message);
  assert.match(pruefen.message, /es fehlen 18, 16, 26 und 28; vorhanden: 17, 15 bis 25 und 27\./, "der vorige Befund gilt nicht mehr");
  const frei = await ruf("Ja, stimmt so.");
  assert.equal(geschrieben.length, 1, frei.message);
  assert.deepEqual([geschrieben[0].zaehne[16], geschrieben[0].zaehne[12], geschrieben[0].zaehne[13]], ["f", "", ""]);
  await kurz();
  assert.ok(!vorgaenge.some((v) => /neuen Befund/.test(v.auftrag || "")), JSON.stringify(vorgaenge.map((v) => v.auftrag)));
});

test("Live 05.11.2026: Diktat ohne Modell wird nicht geraten, Korrektur ohne Aenderung ist keine Schleife", async () => {
  geschrieben.length = 0;
  aenderungen.length = 0;
  const start = "Können wir für Herrn Anna Befundtest einen Heilung Kostenplan erstellen, bitte?";
  const s = { sitzung: "live-0526" };
  const ruf = (chef_satz) => rufe({ auftrag: start, chef_satz, ...s });
  assert.equal((await rufe({ auftrag: start, ...s })).rueckfrage, "befund_anzeige");
  const zuerst = await ruf("Wir müssen erst mal den Befund ändern. Die Zähne 1, 3 und 2, 3 stehen noch.");
  assert.equal(zuerst.rueckfrage, "befund_anzeige", zuerst.message);
  assert.match(zuerst.message, /Auf dem Handy steht jetzt/);
  assert.doesNotMatch(zuerst.message, /Dampsoft|übernehmen/);
  assert.equal(aenderungen.length, 1, "die genannten Zähne stehen auf dem Handy");
  aenderungen.length = 0;
  assert.equal((await ruf("Eine Oberkieferprothese mit Teleskopkrone auf 1,3 und 2,3.")).rueckfrage, "befund_quelle");
  assert.equal((await ruf("Wir nehmen einen neuen Befund auf.")).rueckfrage, "befund_fehlt");

  const langsam = await ruf(DIKTAT_ZU_LANGSAM);
  assert.equal(langsam.rueckfrage, "befund_fehlt", langsam.message);
  assert.match(langsam.message, /nicht sicher verstanden\. Können Sie ihn mir bitte noch einmal sagen\?$/);
  await kurz();
  assert.equal(aenderungen.length, 0, "kein geratener Befund im Zahnschema");

  const pruefen = await ruf("Es fehlen die Zähne 18, 17, 16, 15, 14, 12, 11, 21, 22 und 24 bis 28, 13 und 23 sind vorhanden. Im Unterkiefer sind alle Zähne vorhanden.");
  assert.equal(pruefen.rueckfrage, "befund_freigabe", pruefen.message);
  assert.match(pruefen.message, /vorhanden: 13 und 23/, pruefen.message);
  assert.doesNotMatch(pruefen.message, /Unterkiefer|\b[34][1-8]\b/);

  const gleich = await ruf("Nein, eins, drei und zwei, drei sind vorhanden, alle anderen Zähne im Oberkiefer fehlen, im Unterkiefer sind alle Zähne erhalten.");
  assert.equal(gleich.rueckfrage, "befund_korrektur", gleich.message);
  assert.match(gleich.message, /^Das hat am vorgelesenen Befund nichts geändert\. Welche Zähne sind anders\?/);
  assert.equal(geschrieben.length, 0);

  assert.equal((await ruf("Ja, stimmt so.")).rueckfrage, "befund_freigabe");
  const frei = await ruf("Ja, stimmt so.");
  assert.equal(geschrieben.length, 1, frei.message);
  assert.deepEqual(geschrieben[0].kiefer, ["OK"]);
  assert.deepEqual([geschrieben[0].zaehne[13], geschrieben[0].zaehne[23], geschrieben[0].zaehne[12], geschrieben[0].zaehne[24]], ["", "", "f", "f"]);
});

test("Befund mit Rest je Kiefer: oben fehlen die anderen, unten stehen alle", () => {
  const r = antwortPruefen({ art: "angabe", befund: { kiefer: "beide", zaehne: { 13: "vorhanden", 23: "vorhanden" }, rest: { OK: "fehlt", UK: "vorhanden" } } });
  assert.deepEqual(r.befund.rest, { OK: "fehlt", UK: "vorhanden" });
  assert.deepEqual(antwortPruefen({ art: "angabe", befund: { kiefer: "", zaehne: {}, rest: { OK: "fehlt", UK: "quatsch" } } }).befund,
    { kiefer: "", zaehne: {}, rest: { OK: "fehlt" } });
  assert.equal(antwortPruefen({ art: "angabe", befund: { kiefer: "", zaehne: {}, rest: { OK: "weg" } } }).befund, null);
  return import("../src/hkp/antwortVerstehen.js").then(({ befundSatz }) => {
    assert.equal(befundSatz(r.befund, ["OK"]), "18, 17, 16, 15, 14, 12, 11, 21, 22, 24, 25, 26, 27 und 28 fehlen, 13 und 23 vorhanden");
    assert.match(befundSatz(r.befund, ["OK", "UK"]), /fehlen, 13, 23, 48, 47, .* und 38 vorhanden$/);
  });
});

test("Vorschlag aus einem frueheren Gespraech gilt nicht: verworfen, die Quelle wird gefragt", async () => {
  verworfen.length = 0;
  const frage = await rufe({ name: "Carla Altvorschlag", auftrag: "Brücke von 14 auf 16", sitzung: "alt-1" });
  assert.equal(frage.rueckfrage, "befund_anzeige", frage.message);
  assert.deepEqual(verworfen, ["4712"]);
});

test("Aenderung aus dem Befund-Werkzeug gilt weiter fuer den naechsten Plan", async () => {
  verworfen.length = 0;
  assert.equal((await rufe({ name: "Dora Werkzeugrest", auftrag: "Brücke von 14 auf 16", sitzung: "werkzeug-1" })).rueckfrage, "befund_anzeige");
  const frage = await rufe({ name: "Dora Werkzeugrest", auftrag: "Brücke von 14 auf 16", sitzung: "werkzeug-1", chef_satz: "Ja, stimmt." });
  assert.equal(frage.rueckfrage, "befund_freigabe", frage.message);
  assert.match(frage.message, /Gegenüber Dampsoft ändere ich: es fehlt 17\./);
  assert.deepEqual(verworfen, []);
});

test("Befundsatz aus dem Verstandenen: fester Wortlaut, Rest nur im genannten Kiefer", async () => {
  const { befundSatz } = await import("../src/hkp/antwortVerstehen.js");
  assert.equal(befundSatz({ kiefer: "OK", zaehne: { 13: "vorhanden", 23: "vorhanden" }, rest: "fehlt" }),
    "18, 17, 16, 15, 14, 12, 11, 21, 22, 24, 25, 26, 27 und 28 fehlen, 13 und 23 vorhanden");
  // Probe 04.11.2026: das Modell las "im Oberkiefer ... alle anderen entfernt" einmal als beide Kiefer
  assert.equal(befundSatz({ kiefer: "beide", zaehne: { 13: "vorhanden", 23: "vorhanden" }, rest: "fehlt" }, ["OK"]),
    "18, 17, 16, 15, 14, 12, 11, 21, 22, 24, 25, 26, 27 und 28 fehlen, 13 und 23 vorhanden");
  assert.equal(befundSatz({ kiefer: "", zaehne: { 16: "ueberkront", 36: "nicht_erhaltungswuerdig" }, rest: "" }),
    "16 überkront, 36 nicht erhaltungswürdig");
  assert.equal(befundSatz(null), "");
  const r = antwortPruefen({ art: "zustimmung", befund: { kiefer: "OK", zaehne: { 13: "vorhanden", 99: "fehlt", 23: "kaputt" }, rest: "weg" } });
  assert.equal(r.art, "angabe", "ein genannter Befund ist nie eine blosse Zustimmung");
  assert.deepEqual(r.befund, { kiefer: "OK", zaehne: { 13: "vorhanden" }, rest: "" });
  assert.equal(antwortPruefen({ art: "neustart", quelle: "neu" }).art, "angabe", "neuer Befund ist kein neuer Plan");
  assert.equal(antwortPruefen({ art: "neustart", quelle: "" }).art, "neustart");
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

test("Live 05.11.2026: Befund-Antwort ersetzt den All-on-Plan nicht, die Quelle wird nicht erneut gefragt", async () => {
  const s = { sitzung: "schleife-allon" };
  const start = "Ich möchte einen HKP erstellen";
  assert.equal((await rufe({ auftrag: start, ...s })).rueckfrage, "befund_anzeige");
  const plan = "All on Six im Oberkiefer und im Unterkiefer planen";
  const quelle = await rufe({ auftrag: plan, ...s });
  assert.equal(quelle.rueckfrage, "befund_quelle", quelle.message);
  const weiter = await rufe({ auftrag: "Wir nehmen diesen Befund aus DS Win.", befund_quelle: "pvs", ...s });
  assert.notEqual(weiter.rueckfrage, "versorgung", weiter.message);
  assert.notEqual(weiter.rueckfrage, "befund_quelle", weiter.message);
  assert.match(weiter.message, /All-on-6/);
  const ballon = await rufe({ auftrag: "Ballon im Oberkiefer und Unterkiefer", befund_quelle: "pvs", ...s });
  assert.notEqual(ballon.rueckfrage, "versorgung", ballon.message);
  assert.notEqual(ballon.rueckfrage, "befund_quelle", ballon.message);
});

test("Intent liest die Versorgung aus der Wissensbasis, die Engine bekommt den kanonischen Satz", async () => {
  assert.equal(planSatz({ versorgung: "allon", n: 6, kiefer: "beide" }),
    "All-on-6-Prothese im Oberkiefer und All-on-6-Prothese im Unterkiefer");
  assert.equal(planSatz({ versorgung: "allon", n: 4, kiefer: "OK" }), "All-on-4-Prothese im Oberkiefer");
  assert.equal(planSatz({ versorgung: "locator", kiefer: "UK" }), "Locator-Prothese im Unterkiefer");
  assert.equal(planSatz({ versorgung: "allon", kiefer: "beide" }), "");
  assert.equal(planSatz({ versorgung: "erfunden", kiefer: "OK" }), "");
  // 06.11.2026: "Ja, stimmt." wurde zu "Brücke im Unterkiefer" und ersetzte "Brücke von 14 auf 16"
  assert.equal(planSatz({ versorgung: "bruecke", kiefer: "UK" }), "");
  assert.equal(planSatz({ versorgung: "kronen", kiefer: "OK" }), "");
  const verstanden = antwortPruefen({ art: "angabe", plan: { versorgung: "allon", n: 6, kiefer: "beide" } });
  assert.equal(verstanden.plan, "All-on-6-Prothese im Oberkiefer und All-on-6-Prothese im Unterkiefer");
  assert.equal(antwortPruefen({ art: "zustimmung", plan: { versorgung: "allon", n: 6, kiefer: "beide" } }).plan, undefined);

  const s = { sitzung: "intent-ballon" };
  const start = "Ich möchte einen HKP erstellen";
  assert.equal((await rufe({ auftrag: start, ...s })).rueckfrage, "befund_anzeige");
  const ballon = await rufe({ auftrag: start, chef_satz: "Ballon im Oberkiefer und Unterkiefer", ...s });
  assert.equal(ballon.rueckfrage, "befund_quelle", ballon.message);
  const geplant = await rufe({ auftrag: start, befund_quelle: "pvs", ...s });
  assert.notEqual(geplant.rueckfrage, "versorgung", geplant.message);
  assert.match(geplant.message, /All-on-6/);

  const roh = "feste Brücke auf sechs Implantaten oben und unten";
  const u = { sitzung: "intent-umschrieben" };
  assert.equal((await rufe({ auftrag: roh, ...u })).rueckfrage, "befund_anzeige");
  const gelesen = await rufe({ auftrag: roh, ...u });
  assert.equal(gelesen.rueckfrage, "befund_quelle", gelesen.message);
  const fest = await rufe({ auftrag: roh, befund_quelle: "pvs", ...u });
  assert.notEqual(fest.rueckfrage, "versorgung", fest.message);
  assert.match(fest.message, /All-on-6/);
});

test("Live 05.11.2026 17:48: richtiger Befund bleibt, der naechste Plan fragt nicht noch einmal nach der Quelle", async () => {
  const s = { sitzung: "befund-bleibt" };
  const start = "Ich möchte einen HKP erstellen";
  assert.equal((await rufe({ auftrag: start, ...s })).rueckfrage, "befund_anzeige");
  const bleibt = await rufe({ auftrag: start, chef_satz: "Ja, der ist richtig.", ...s });
  assert.doesNotMatch(bleibt.message, /Welche Zähne soll ich|Welchen Befund nehme ich/, bleibt.message);
  assert.notEqual(bleibt.rueckfrage, "befund_anzeige", bleibt.message);
  assert.notEqual(bleibt.rueckfrage, "befund_quelle", bleibt.message);
  const plan = await rufe({ auftrag: start, chef_satz: "Mach oben eine Totalprothese.", ...s });
  assert.notEqual(plan.rueckfrage, "befund_quelle", plan.message);
  assert.doesNotMatch(plan.message, /Welchen Befund nehme ich/, plan.message);
});

test("Freies Gespraech: der Satz des Modells steht vor der offenen Entscheidung", async () => {
  const s = { sitzung: "frei-sagen" };
  const start = "Ich möchte einen HKP erstellen";
  assert.equal((await rufe({ auftrag: start, ...s })).rueckfrage, "befund_anzeige");
  const q = await rufe({ auftrag: start, chef_satz: "Mach oben eine Totalprothese.", ...s });
  assert.match(q.message, /^Totalprothese im Oberkiefer\./, q.message);
});

test("Modell spricht: eigene Worte, die Fakten der Engine bleiben, ohne Modell gilt die Engine", async () => {
  const { _setMund, mundPruefen } = await import("../src/hkp/antwortVerstehen.js");
  const fakten = "Ich nehme den aktuellen Befund aus DS-Win. Im Oberkiefer stehen noch 16, 14, 13, 23, 24 und 26. Sollen die alle entfernt werden, oder bleiben welche stehen?";
  const gut = "Gut, dann arbeite ich mit dem DS-Win-Befund. Oben stehen noch 16, 14, 13, 23, 24 und 26 – kommen die raus, oder bleiben welche?";
  assert.equal(mundPruefen(gut, fakten), gut);
  assert.equal(mundPruefen("Oben stehen noch 16, 14 und 13. Kommen die raus?", fakten), "", "Zahn verloren");
  assert.equal(mundPruefen("Oben stehen 16, 14, 13, 23, 24 und 26.", fakten), "", "Frage verloren");
  assert.equal(mundPruefen("Das kostet 16, 14, 13, 23, 24 und 26 Euro?", fakten), "");
  assert.equal(mundPruefen('{"art":"unklar"}', fakten), "");

  const s = { sitzung: "mund-1" };
  const start = "Ich möchte einen HKP erstellen";
  let gesehen = "";
  _setMund(async (messages) => {
    gesehen = messages.at(-1).content;
    const f = /ERGEBNIS der Software: «([^»]*)»/.exec(gesehen)?.[1] || "";
    return { ok: true, text: `Alles klar. ${f}` };
  });
  try {
    const q = await rufe({ auftrag: start, ...s });
    assert.equal(q.stimme, "modell", q.message);
    assert.match(q.message, /^Alles klar\. /);
    assert.equal(`Alles klar. ${q.fakten}`, q.message);
    assert.match(gesehen, /Satz des Zahnarztes: «Ich möchte einen HKP erstellen»/);
    _setMund(async () => ({ ok: true, text: "Passt, ich lege los." }));
    const r = await rufe({ auftrag: start, chef_satz: "Mach oben eine Totalprothese.", ...s });
    assert.equal(r.stimme, "daten", "Modell hat die offene Frage verloren -> Engine spricht");
    assert.match(r.message, /^Totalprothese im Oberkiefer\./);
  } finally {
    _setMund(null);
  }
});

test("Sprachverstehen: nur gueltiges JSON zaehlt, Zaehne nur aus der Frage", () => {
  assert.equal(antwortPruefen({ art: "vielleicht" }), null);
  assert.equal(antwortPruefen(null), null);
  const r = antwortPruefen({ art: "zustimmung", entfernen: ["12", "99", 13, "12"], quelle: "dampsoft", angabe: "x" }, ["12", "13"]);
  assert.deepEqual(r, { art: "zustimmung", quelle: "", entfernen: ["12", "13"], erhalten: [], angabe: "", befund: null });
  assert.equal(antwortPruefen({ art: "angabe", sagen: "Totalprothese im Oberkiefer. Den Befund so lassen?" }).sagen,
    "Totalprothese im Oberkiefer. Den Befund so lassen?");
  assert.equal(antwortPruefen({ art: "angabe", sagen: "Das macht 500 Euro." }).sagen, undefined);
  assert.match(antwortPruefen({ art: "gegenfrage", sagen: "Die 9050 geht nicht neben der 9040, einmal je Sitzung." }).sagen, /9040/);
});
