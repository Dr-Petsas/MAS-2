// Anruf 06.11.2026 07:58: All-on-6 im Oberkiefer, Implantate stehen schon.
// planart impl darf daraus keine neue Implantation machen.
import test from "node:test";
import assert from "node:assert/strict";
import { befundMerken, planartKorrigieren, rueckfrageMerken } from "../src/hkp/mitdenken.js";

const OK = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const UK = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const befund = Object.fromEntries([...OK, ...UK].map((z) => [z, "f"]));
for (const z of ["13", "14", "16", "23", "24", "26"]) befund[z] = "i";

const ALLON = "All-on-Six-Prothese im Oberkiefer mit medentis ICX Implantaten";

test("All-on-6 auf vorhandenen Implantaten ist Zahnersatz, eine Frage", () => {
  const k = planartKorrigieren("impl", ALLON, befund);
  assert.match(k.antwort.message, /schon Implantate/);
  assert.match(k.antwort.message, /13, 14, 16, 23, 24 und 26/);
  assert.match(k.antwort.message, /über die Kasse oder privat/);
  assert.doesNotMatch(k.antwort.message, /hkp_|System|Position/);
  assert.equal(k.antwort.stimme, "daten");
  assert.match(k.hinweis, /planart impl/);
  assert.match(befundMerken(befund), /nicht sprechen/);
  assert.match(befundMerken(befund), /Implantat vorhanden: 16, 13, 14, 23, 24 und 26/);
});

test("Steht privat oder Kostenvoranschlag schon im Satz, wird mit privat gerechnet", () => {
  const k = planartKorrigieren("impl", `privater Kostenvoranschlag, ${ALLON}`, befund);
  assert.equal(k.planart, "privat");
  assert.equal(k.antwort, undefined);
});

test("Schon gesetzt ist keine neue Chirurgie", () => {
  const k = planartKorrigieren("impl", "All-on-6 im Oberkiefer auf den schon gesetzten Implantaten", befund);
  assert.match(k.antwort.message, /schon Implantate/);
});

test("Implantate neu setzen bleibt Chirurgie", () => {
  assert.equal(planartKorrigieren("impl", "sechs Implantate im Oberkiefer setzen", befund), null);
});

test("Setzen und All-on-6 ist ein Fall", () => {
  const k = planartKorrigieren("impl", "sechs Implantate im Oberkiefer setzen und später All-on-6", befund);
  assert.equal(k.antwort.rueckfrage, "fall");
  assert.match(k.antwort.message, /Implantation und danach die Versorgung/);
  assert.match(k.hinweis, /hkp_fall_rechnen/);
  assert.doesNotMatch(k.antwort.message, /hkp_/);
});

test("All-on-6 ohne Implantat im Kiefer setzt nichts ungefragt", () => {
  const leer = Object.fromEntries([...OK, ...UK].map((z) => [z, "f"]));
  const k = planartKorrigieren("impl", ALLON, leer);
  assert.match(k.antwort.message, /noch keine Implantate/);
});

test("planart privat und der Notaus bleiben unangetastet", () => {
  assert.equal(planartKorrigieren("privat", ALLON, befund), null);
  process.env.MAS_PLAN_MITDENKEN = "0";
  try {
    assert.equal(planartKorrigieren("impl", ALLON, befund), null);
  } finally {
    delete process.env.MAS_PLAN_MITDENKEN;
  }
});

// Gespräch 14.11.2026 (Appler): Brücke 17-15 bestellt, 26 muss laut Befund raus.
// Clara fragt nach der zweiten Brücke; das Modell bekommt den Weg für Ja und Nein.
test("weitere Lücke: Merkzettel nennt Vorschlag für Ja und erhalten für Nein", () => {
  const m = rueckfrageMerken("weitere_luecke", ["26"], "Brücke von 25 auf 27");
  assert.match(m, /nicht sprechen/);
  assert.ok(m.includes('"Brücke von 25 auf 27"'));
  assert.ok(m.includes('erhalten="26"'));
  assert.equal(rueckfrageMerken("weitere_luecke", [], "x"), "");
  assert.ok(rueckfrageMerken("restzaehne", ["13"]).includes('entfernen="13"'));
});