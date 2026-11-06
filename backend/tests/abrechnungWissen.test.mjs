// Die Wissensbasis enthaelt jede gefuehrte Ziffer und das Mapping der Engine.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { wissenFuer } from "../src/hkp/wissen.js";

const PLANR = "F:/PlanR";
const basis = JSON.parse(fs.readFileSync(new URL("../src/hkp/wissen/abrechnung.json", import.meta.url), "utf8"));
const nummern = (katalog) => new Set(basis.ziffern.filter((z) => z.k === katalog).map((z) => z.n));

function eintraege(datei) {
  return JSON.parse(fs.readFileSync(datei, "utf8")).eintraege.map((e) => e.nr);
}

test("jeder Katalog steckt vollstaendig in der Wissensbasis, ohne Preise", () => {
  const paare = [
    ["GOZ", `${PLANR}/ZE/HKP/src/data/goz-2012.json`],
    ["BEMA", `${PLANR}/ZE/HKP/src/data/bema/bema-2026.json`],
    ["FZ", `${PLANR}/ZE/HKP/src/data/fz/fz-2026.json`],
    ["BEB", `${PLANR}/ZE/HKP/src/data/beb-itz-2024.json`],
    ["BEL", `${PLANR}/ZE/HKP/src/data/bel/bel2-bayern-2026.json`],
    ["BEMA", `${PLANR}/KB/Kassen-KB/src/data/bema-teil2.json`],
    ["BEMA", `${PLANR}/KFO/Kassen-KFO/src/data/bema-kfo.json`],
    ["GOÄ", `${PLANR}/Start/public/daten/goae-zahnarzt.json`],
  ];
  for (const [katalog, datei] of paare) {
    const da = nummern(katalog);
    const fehlt = eintraege(datei).filter((nr) => !da.has(nr));
    assert.deepEqual(fehlt, [], `${katalog} ${datei}`);
  }
  const par = fs.readFileSync(`${PLANR}/PAR/Kassen-PAR/src/data/bema-par.ts`, "utf8");
  const parNrs = [...par.matchAll(/nr:\s*'([^']+)'/g)].map((m) => m[1]);
  const bema = nummern("BEMA");
  assert.deepEqual(parNrs.filter((nr) => !bema.has(nr)), []);
  assert.ok(basis.ziffern.every((z) => !("preis" in z) && !("punkte" in z) && !/€|euro/i.test(z.t) && !/€|euro/i.test(z.h || "")));
  const goz9050 = basis.ziffern.find((z) => z.k === "GOZ" && z.n === "9050");
  assert.match(goz9050.h, /nicht neben/);
  assert.match(goz9050.h, /9040/);
  assert.ok(basis.ziffern.filter((z) => z.h).length >= 40);
  assert.ok(basis.befunde.length >= 30);
  assert.ok(basis.therapien.length >= 40);
  assert.ok(basis.therapien.some((t) => t.kuerzel === "SK" && t.goz === "2200" && t.anker === "5000"));
  assert.ok(basis.therapien.some((t) => t.kuerzel === "SB" && t.beb.includes("2362")));
});

test("der Ausschnitt trifft die gemeinte Situation und bleibt kurz", () => {
  const allon = wissenFuer("Ballon auf sechs Implantaten oben und unten");
  assert.match(allon, /All-on-4 oder All-on-6/);
  assert.match(allon, /GOZ 2200/);
  assert.match(allon, /5000/);
  assert.match(allon, /Implantate, die schon stehen, bleiben/);
  assert.ok(allon.length <= 8000, allon.length);

  const sitzung = wissenFuer("Gehen die 9040 und die 9050 in einer Sitzung?");
  assert.match(sitzung, /9040/);
  assert.match(sitzung, /9050/);
  assert.match(sitzung, /nicht neben/);
  assert.match(sitzung, /einmal je Sitzung/);
  assert.match(sitzung, /rekonstruktive Phase/);
  assert.doesNotMatch(sitzung, /€|punktwert/i);

  const praxis = wissenFuer("Nimm meine Analogposition zu 2200.", {
    pvs: "DS-Win",
    goz: [{ nr: "2200a", text: "Vollkrone Keramik Praxis", eigen: true, analogZu: "2200", kuerzel: "KM", punkte: 99, betrag: 120 }],
    eigenlabor: [{ nr: "3001", text: "Teleskopkrone Praxis", preis: 80, ersetzt: "3001" }],
  });
  assert.match(praxis, /analog zu GOZ 2200/);
  assert.match(praxis, /DS-Win/);
  assert.doesNotMatch(praxis, /120|99|80/);

  const ziffer = wissenFuer("Was ist die 2210?");
  assert.match(ziffer, /GOZ 2210/);
  assert.match(ziffer, /Vollkrone/);

  const befund = wissenFuer("13 fehlt");
  assert.match(befund, /Befund f:/);

  assert.equal(wissenFuer("Ja, der Befund stimmt."), "");
  assert.equal(wissenFuer("Ja"), "");
});
