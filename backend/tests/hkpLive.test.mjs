// Live-Ansicht im PlanR-Planer: Vorgaenge, Stand fuer neue Hoerer, Server-Sent Events, Notaus.
// Start: node backend/tests/hkpLive.test.mjs
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
process.env.MAS_HKP_LIVE_OEFFNEN = "0";
const { liveMelden, liveStand, liveAbonnieren, liveHoerer, livePatient, _liveZuruecksetzen } = await import("../src/hkp/live.js");

let ok = 0;
function t(name, fn) { _liveZuruecksetzen(); delete process.env.MAS_HKP_LIVE; fn(); ok += 1; console.log("  ok -", name); }

function antwort() {
  const res = { kopf: null, text: "", writeHead(s, k) { this.kopf = { s, k }; }, write(x) { this.text += x; } };
  return { req: new EventEmitter(), res };
}
const daten = (text) => text.split("\n").filter((z) => z.startsWith("data: ")).map((z) => JSON.parse(z.slice(6)));

const mustermann = livePatient({ id: 2, anredeLabel: "Herrn Mustermann", lastName: "Mustermann", firstName: "Helmut", birthDate: "1952-05-13" });

t("Patientendaten fuer den Planer", () => {
  assert.deepEqual(mustermann, { id: "2", label: "Herrn Mustermann", name: "Mustermann", vorname: "Helmut", geburtsdatum: "1952-05-13" });
  assert.equal(livePatient(null), null);
});

t("Schritte eines Vorgangs ergaenzen sich", () => {
  const a = liveMelden("c1", { patient: mustermann, meldung: "" });
  assert.equal(a.phase, "patient");
  liveMelden("c1", { phase: "befund", befund: { 16: "f" } });
  const c = liveMelden("c1", { meldung: "Welche Versorgung?" });
  assert.equal(c.vorgang, a.vorgang);
  assert.equal(c.seq, 3);
  assert.deepEqual(c.befund, { 16: "f" });
  assert.equal(c.patient.id, "2");
  assert.equal(c.meldung, "Welche Versorgung?");
});

t("anderer Patient oder nach dem Anlegen: neuer Vorgang ohne alte Daten", () => {
  const a = liveMelden("c1", { patient: mustermann, befund: { 16: "f" } });
  const b = liveMelden("c1", { patient: { ...mustermann, id: "3" } });
  assert.notEqual(b.vorgang, a.vorgang);
  assert.equal(b.befund, null);
  liveMelden("c1", { phase: "angelegt", hkpId: "h1" });
  const c = liveMelden("c1", { patient: { ...mustermann, id: "3" } });
  assert.notEqual(c.vorgang, b.vorgang);
  assert.equal(c.hkpId, "");
});

t("Mandanten getrennt", () => {
  liveMelden("c1", { patient: mustermann });
  assert.equal(liveStand("c2"), null);
});

t("Hoerer bekommt den aktuellen Stand sofort und dann jeden Schritt", () => {
  liveMelden("c1", { patient: mustermann });
  const { req, res } = antwort();
  liveAbonnieren("c1", req, res);
  assert.equal(res.kopf.k["Content-Type"], "text/event-stream; charset=utf-8");
  assert.equal(liveHoerer("c1"), 1);
  liveMelden("c1", { phase: "befund", befund: { 46: "f" } });
  const d = daten(res.text);
  assert.equal(d.length, 2);
  assert.equal(d[1].phase, "befund");
  req.emit("close");
  assert.equal(liveHoerer("c1"), 0);
  liveMelden("c1", { meldung: "x" });
  assert.equal(daten(res.text).length, 2);
});

t("Notaus MAS_HKP_LIVE=0: nichts gemerkt, nichts gesendet", () => {
  process.env.MAS_HKP_LIVE = "0";
  assert.equal(liveMelden("c1", { patient: mustermann }), null);
  assert.equal(liveStand("c1"), null);
});

console.log(`hkpLive: ${ok} ok`);
