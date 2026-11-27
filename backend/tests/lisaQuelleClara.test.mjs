// Lisa V8 waehlt samstags nur Anrufe, die Clara bestellt hat (Feld quelle: "clara" im Buendel der alten Strecke)
// oder deren Praxis samstags geoeffnet hat. Clara V8 (Aktion anruf) und Clara dev (delegate_call, dictate) rufen
// /tools/delegate-call bzw. /tools/dictate; nur diese beiden Wege geben die Herkunft mit. Reiner Test, kein Anruf.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { telefonkiBundle } from "../src/lisa/outbound.js";

const GRUND = { clientId: "c1", taskId: "t1", to: "+491700000000", fromDid: "+492110000000", auftrag: "x", name: "Anna Muster" };
const quelltext = (pfad) => readFileSync(new URL(`../src/${pfad}`, import.meta.url), "utf8").replace(/\r/g, "");

test("Buendel: quelle steht nur darin, wenn Clara den Anruf bestellt hat", () => {
  assert.equal(telefonkiBundle({ ...GRUND, quelle: "clara" }).quelle, "clara");
  for (const q of [undefined, "", "recall", "Clara ", "team", null]) {
    assert.equal("quelle" in telefonkiBundle({ ...GRUND, quelle: q }), false, `quelle=${JSON.stringify(q)}`);
  }
  // Alles andere im Buendel bleibt, wie es war.
  const mit = telefonkiBundle({ ...GRUND, quelle: "clara" });
  const ohne = telefonkiBundle(GRUND);
  delete mit.quelle;
  assert.deepEqual({ ...mit, currentTime: "" }, { ...ohne, currentTime: "" });
});

test("nur Claras Wege geben die Herkunft mit: delegate-call und dictate, sonst niemand", () => {
  const routen = quelltext("routes/tools.js");
  const stellen = [...routen.matchAll(/^router\.post\("(\/tools\/[^"]+)"/gm)];
  const mitHerkunft = [];
  stellen.forEach((m, i) => {
    const koerper = routen.slice(m.index, i + 1 < stellen.length ? stellen[i + 1].index : routen.length);
    if (/lisaStartCall\(/.test(koerper) && /quelle: "clara"/.test(koerper)) mitHerkunft.push(m[1]);
  });
  assert.deepEqual(mitHerkunft.sort(), ["/tools/delegate-call", "/tools/dictate"]);
  for (const datei of ["clara/recallCoach.js", "clara/absencePlanner.js", "routes/demo.js"]) {
    assert.equal(/quelle:\s*"clara"/.test(quelltext(datei)), false, datei);
  }
});

test("ein eingeplanter Anruf behaelt die Herkunft bis zur Wiedervorlage", () => {
  const q = quelltext("lisa/outbound.js");
  // Beim Einplanen ausserhalb der Anrufzeiten gespeichert, bei der Wiedervorlage wieder mitgegeben.
  assert.match(q, /status: "scheduled"[\s\S]{0,900}\.\.\.\(vonClara \? \{ quelle: "clara" \} : \{\}\)/);
  assert.match(q, /taskId: doc\.id,\n\s+quelle: t\.quelle,/);
});