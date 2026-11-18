// Die KI-Zeile per Sprache (Chef 18.11.2026): Clara fragt, ändert und löscht an Plänen der Planer.
// PlanR ist hier ein lokaler Nachbau, das Modell ein fester Zug; gerechnet wird mit der echten Sprach-Engine.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const CID = "zzz-mas2-sprache";
process.env.PLANR_HKP_KEY = "k";

const S = await import("../src/vendor/plan-ki-engine.mjs");
const lager = new Map();
const neuerPlan = () => ({ karte: { modul: "privat-par", nummer: "PAR-2026-0007", patient: "Petra Privattest", betrag: 900, status: "entwurf", geaendert: "2026-11-17T10:00:00.000Z" }, plan: S.neu("privat-par"), stand: "2026-11-17T10:00:00.000Z", weg: false });
// Der Betrag an der Karte ist der, den der Planer gerechnet hat.
const passend = (e, modul) => { e.karte.betrag = S.bewerten(modul, e.plan).betrag; return e; };
lager.set("privat-par|PAR-2026-0007", passend(neuerPlan(), "privat-par"));
const preise = new Map();
lager.set("privat-kb|KB-2026-0002", { karte: { modul: "privat-kb", nummer: "KB-2026-0002", patient: "Petra Privattest", betrag: 400, status: "freigegeben", geaendert: "2026-11-10T10:00:00.000Z" }, plan: S.neu("privat-kb"), stand: "2026-11-10T10:00:00.000Z", weg: false });
passend(lager.get("privat-kb|KB-2026-0002"), "privat-kb");

const planr = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://planr");
  let roh = "";
  for await (const c of req) roh += c;
  const senden = (status, d) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  if (req.headers["x-planr-key"] !== "k" || u.searchParams.get("clientId") !== CID) return senden(401, { ok: false });
  if (u.pathname === "/api/intern/plaene") return senden(200, { ok: true, plaene: [...lager.values()].filter((e) => !e.weg).map((e) => ({ ...e.karte, inhalt: true })) });
  if (u.pathname === "/api/intern/plan" && req.method === "GET") {
    const e = lager.get(`${u.searchParams.get("modul")}|${u.searchParams.get("nummer")}`);
    return e ? senden(200, { ok: true, karte: e.karte, plan: e.plan, stand: e.stand, einst: preise.get(e.karte.modul) ?? null }) : senden(404, { ok: false });
  }
  const b = JSON.parse(roh || "{}");
  const e = lager.get(`${b.modul}|${b.nummer}`);
  if (!e) return senden(404, { ok: false });
  if (u.pathname === "/api/intern/plan/loeschen") { e.weg = true; return senden(200, { ok: true }); }
  if (u.pathname === "/api/intern/plan/zurueck") { e.weg = false; return senden(200, { ok: true }); }
  if (u.pathname === "/api/intern/plan") {
    if (b.basis !== e.stand) return senden(409, { ok: false, veraltet: true });
    e.plan = b.plan; e.karte.betrag = b.betrag; e.stand = new Date(new Date(e.stand).getTime() + 1000).toISOString();
    return senden(200, { ok: true, stand: e.stand });
  }
  return senden(404, { ok: false });
});
await new Promise((r) => planr.listen(0, "127.0.0.1", r));
process.env.PLANR_URL = `http://127.0.0.1:${planr.address().port}`;
test.after(() => planr.close());

const { planSprache, planAenderungZurueck, planWiederholen, _setzen } = await import("../src/hkp/planSprache.js");
const { mitUndo, zuruecknehmen } = await import("../src/clara/rueckgaengig.js");

const gefragt = [];
/** Modell: bei "Faktor" den Regler auf 3,5, sonst eine Auskunft. */
const zug = async (b) => {
  gefragt.push(b);
  if (b.nachlauf) return { ok: true, antwort: "Geprüft.", schritte: [], pruefung: true };
  if (b.text.includes("Faktor")) return { ok: true, antwort: "Ich stelle den Faktor auf 3,5.", schritte: [{ op: "schalter", name: "faktor", wert: 3.5 }], pruefung: false };
  return { ok: true, antwort: `Der Plan hat ${b.blick.positionen.length} Positionen.`, schritte: [], pruefung: false };
};
const namePasst = (g, p) => (String(g).toLowerCase().includes(String(p.lastName).toLowerCase()) ? 1 : 0);
const d = { namePasst, mitUndo };
_setzen({ zug });
const faktor = () => S.blick("privat-par", lager.get("privat-par|PAR-2026-0007").plan).schalter.find((s) => s.name === "faktor").wert;

test("mehrere Pläne desselben Patienten: Clara fragt, welcher gemeint ist", async () => {
  const r = await planSprache(CID, { name: "Frau Privattest", text: "Was kostet das?" }, d);
  assert.match(r.message, /Welchen Plan meinen Sie/);
  assert.match(r.message, /Parodontologie/);
  assert.match(r.message, /Schiene/);
});

test("Frage zum Plan: Antwort des Modells, nichts geschrieben", async () => {
  const vorher = lager.get("privat-par|PAR-2026-0007").stand;
  const r = await planSprache(CID, { name: "Privattest", planart: "privat-par", text: "Wie viele Positionen hat der Plan?" }, d);
  assert.equal(r.ok, true);
  assert.match(r.message, /15 Positionen/);
  assert.equal(r.geaendert, undefined);
  assert.equal(lager.get("privat-par|PAR-2026-0007").stand, vorher);
});

test("Änderung ohne Namen trifft den zuletzt besprochenen Plan, wird gespeichert und lässt sich zurücknehmen", async () => {
  const vorher = faktor();
  const r = await planSprache(CID, { text: "Faktor auf 3,5" }, d);
  assert.equal(r.geaendert, true, r.message);
  assert.match(r.message, /Im Plan geändert/);
  assert.match(r.message, /Der Plan liegt jetzt bei/);
  assert.equal(faktor(), 3.5);
  assert.equal(r.undo.art, "plan_ki");
  // der Verlauf geht in den nächsten Zug mit
  await planSprache(CID, { text: "Und warum?" }, d);
  assert.ok(gefragt.at(-1).verlauf.some((v) => v.text.includes("Faktor")));
  const u = await zuruecknehmen(CID, r.undo, { planAenderungZurueck: (c, id) => planAenderungZurueck(c, id, d) });
  assert.equal(u.ok, true, u.message);
  assert.equal(faktor(), vorher);
});

test("freigegebener Plan: gesperrt für das Modell, Löschen abgelehnt", async () => {
  await planSprache(CID, { name: "Privattest", planart: "privat-kb", text: "Was steht drin?" }, d);
  assert.equal(gefragt.at(-1).blick.gesperrt, true);
  const r = await planSprache(CID, { name: "Privattest", planart: "privat-kb", loeschen: true, bestaetigt: true }, d);
  assert.match(r.message, /freigegeben/);
  assert.equal(lager.get("privat-kb|KB-2026-0002").weg, false);
});

test("Löschen: erst Frage, auf Ja gelöscht, Rückgängig holt zurück", async () => {
  const z = { name: "Privattest", planart: "privat-par", loeschen: true };
  const direkt = await planSprache(CID, { ...z, bestaetigt: true }, d);
  assert.equal(direkt.needsConfirm, true, "bestaetigt ohne vorherige Frage löscht nicht");
  assert.equal(lager.get("privat-par|PAR-2026-0007").weg, false);
  const r = await planSprache(CID, { ...z, bestaetigt: true }, d);
  assert.equal(r.geloescht, true);
  assert.equal(lager.get("privat-par|PAR-2026-0007").weg, true);
  const u = await zuruecknehmen(CID, r.undo, { planWiederholen: (c, id) => planWiederholen(c, id, d) });
  assert.equal(u.ok, true);
  assert.equal(lager.get("privat-par|PAR-2026-0007").weg, false);
});

test("in PlanR inzwischen geändert: nichts überschrieben, ehrliche Antwort", async () => {
  const e = lager.get("privat-par|PAR-2026-0007");
  const echt = zug;
  _setzen({ zug: async (b) => { const a = await echt(b); if (!b.nachlauf) e.stand = "2026-11-18T09:00:00.000Z"; return a; } });
  const r = await planSprache(CID, { name: "Privattest", planart: "privat-par", text: "Faktor auf 3,5" }, d);
  assert.equal(r.ok, false);
  assert.match(r.message, /gerade in PlanR geändert/);
});

test("unbekannter Name: keine Erfindung", async () => {
  const r = await planSprache(CID, { name: "Herr Niemand", text: "Was kostet das?" }, d);
  assert.match(r.message, /finde ich keinen Plan/);
});

test("Summe in PlanR weicht ab und die Praxispreise fehlen: Hinweis bei der Auskunft, keine Änderung", async () => {
  const e = lager.get("privat-par|PAR-2026-0007");
  const echt = e.karte.betrag;
  e.karte.betrag = echt - 31.02;
  _setzen({ zug });
  const f = await planSprache(CID, { name: "Privattest", planart: "privat-par", text: "Wie viele Positionen hat der Plan?" }, d);
  assert.match(f.message, /In PlanR steht der Plan mit/);
  assert.match(f.message, /liegen mir noch nicht vor/);
  const vorher = e.stand;
  const r = await planSprache(CID, { text: "Faktor auf 3,5" }, d);
  assert.equal(r.geaendert, undefined);
  assert.match(r.message, /Geändert habe ich nichts/);
  assert.equal(e.stand, vorher);
  assert.equal(e.karte.betrag, echt - 31.02);
  e.karte.betrag = echt;
});

test("Summe weicht ab, Praxispreise liegen vor: Änderung wird gespeichert und der alte Betrag genannt", async () => {
  const e = lager.get("privat-par|PAR-2026-0007");
  preise.set("privat-par", {});
  e.karte.betrag = S.bewerten("privat-par", e.plan, {}).betrag - 10;
  _setzen({ zug });
  const r = await planSprache(CID, { name: "Privattest", planart: "privat-par", text: "Faktor auf 3,5" }, d);
  assert.equal(r.geaendert, true, r.message);
  assert.match(r.message, /Vorher stand er in PlanR mit/);
  assert.equal(e.karte.betrag, S.bewerten("privat-par", e.plan, {}).betrag);
  preise.clear();
});
