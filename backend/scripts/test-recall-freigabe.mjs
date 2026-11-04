import test from "node:test";
import assert from "node:assert/strict";
import { merkeAufruf, pruefeRecallFreigabe, _zuruecksetzen } from "../src/clara/recallFreigabe.js";

const C = "praxisX";

test("Vorfall 04.11.: Ja auf Lisa-Einzelanruf gibt die Recall-Liste NICHT frei", () => {
  _zuruecksetzen();
  merkeAufruf(C, "/tools/gap-briefing", 1_000);
  merkeAufruf(C, "/tools/delegate-call", 600_000);
  const r = pruefeRecallFreigabe(C, 604_000);
  assert.equal(r.ok, false);
  assert.match(r.message, /NICHT freigegeben/);
  assert.equal(pruefeRecallFreigabe(C, 605_000).ok, false, "zweiter Aufruf im selben Zug");
  assert.equal(pruefeRecallFreigabe(C, 615_000).ok, true, "Ja auf Claras Rueckfrage");
  assert.equal(pruefeRecallFreigabe(C, 630_000).ok, false, "Rueckfrage gilt nur einmal");
});

test("direkt nach dem Recall-Gespraech geht die Freigabe durch", () => {
  _zuruecksetzen();
  merkeAufruf(C, "/tools/gap-briefing", 1_000);
  assert.equal(pruefeRecallFreigabe(C, 30_000).ok, true);
});

test("ohne Recall-Gespraech (z. B. nach Neustart) fragt Clara einmal nach", () => {
  _zuruecksetzen();
  const r = pruefeRecallFreigabe(C, 1_000);
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.message, /Einzelauftrag/);
  assert.equal(pruefeRecallFreigabe(C, 10_000).ok, true);
});

test("Einzelanruf nach der Rueckfrage macht sie ungueltig", () => {
  _zuruecksetzen();
  pruefeRecallFreigabe(C, 1_000);
  merkeAufruf(C, "/tools/delegate-call", 5_000);
  assert.equal(pruefeRecallFreigabe(C, 9_000).ok, false);
});

test("altes Recall-Gespraech (>15 min) zaehlt nicht", () => {
  _zuruecksetzen();
  merkeAufruf(C, "/tools/recall-candidates", 0);
  assert.equal(pruefeRecallFreigabe(C, 16 * 60_000).ok, false);
});

test("Mandanten getrennt", () => {
  _zuruecksetzen();
  merkeAufruf("A", "/tools/gap-briefing", 1_000);
  merkeAufruf("B", "/tools/delegate-call", 2_000);
  assert.equal(pruefeRecallFreigabe("A", 3_000).ok, true);
});
