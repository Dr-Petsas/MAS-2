// Behandlungsart aus der Gebuehrennummer (27.11.2026). Reine Tabelle, erfundene Zeilen, kein Zugriff auf eine Praxis.
// Start: node --test backend/tests/gebuehrenArt.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const G = await import("../src/clara/gebuehrenArt.js");
const art = (kind, nr) => G.leistungsart(kind, nr).art;
const begleit = (kind, nr) => G.leistungsart(kind, nr).begleit;
const z = (kind, nr, text) => ({ kind, nr, text });

test("BEMA: Hauptleistungen nach Nummer", () => {
  for (const nr of ["01", "01k", "1", "FU1a", "FU2"]) assert.equal(art("bema", nr), "untersuchung", nr);
  for (const nr of ["13a", "13b", "13c", "13d", "13g"]) assert.equal(art("bema", nr), "fuellung", nr);
  for (const nr of ["28", "29", "31", "32", "34", "35", "54a"]) assert.equal(art("bema", nr), "wurzelbehandlung", nr);
  for (const nr of ["43", "44", "45", "47a", "48"]) assert.equal(art("bema", nr), "extraktion", nr);
  for (const nr of ["19", "20a", "91b", "96a", "98g", "100b"]) assert.equal(art("bema", nr), "zahnersatz", nr);
  for (const nr of ["ATG", "MHU", "AITa", "BEVb", "CPTa", "UPTc", "P200", "108", "111"]) assert.equal(art("bema", nr), "parodontitis", nr);
  assert.equal(art("bema", "K1"), "schiene");
  assert.equal(art("bema", "IP5"), "versiegelung");
});

test("BEMA: Begleitleistungen und Nummern ohne Art", () => {
  for (const nr of ["40", "41a", "41b", "8", "Ä925a", "ä925b", "Ä928", "Ä934a", "Ä935d"]) {
    assert.equal(begleit("bema", nr), true, nr);
    assert.equal(art("bema", nr), null, nr);
  }
  for (const nr of ["107", "12", "25", "10", "23", "47b", "04", "105", "106", "Ä1", "Ä161", "IP1", "IP4", "13zz", "", "x"]) {
    assert.equal(art("bema", nr), null, nr);
    assert.equal(begleit("bema", nr), false, nr);
  }
});

test("GOZ: nach den vier Ziffern am Anfang, Zusaetze der Praxis stoeren nicht", () => {
  assert.equal(art("goz", "0010"), "untersuchung");
  assert.equal(art("goz", "1040"), "zahnreinigung");
  assert.equal(art("goz", "2000"), "versiegelung");
  for (const nr of ["2050", "2060", "2080", "2100", "2100mk", "2120"]) assert.equal(art("goz", nr), "fuellung", nr);
  for (const nr of ["2200", "2210", "2220", "5000", "5120", "5220"]) assert.equal(art("goz", nr), "zahnersatz", nr);
  for (const nr of ["2360", "2390", "2410", "2440", "3110", "3120"]) assert.equal(art("goz", nr), "wurzelbehandlung", nr);
  for (const nr of ["3000", "3010", "3020", "3030", "3040", "3045"]) assert.equal(art("goz", nr), "extraktion", nr);
  for (const nr of ["4070", "4075", "4100", "4150"]) assert.equal(art("goz", nr), "parodontitis", nr);
  assert.equal(art("goz", "7010"), "schiene");
  for (const nr of ["9000", "9010", "9100"]) assert.equal(art("goz", nr), "implantat", nr);
  for (const nr of ["0070", "0080", "0090", "0100", "Ä5000", "Ä5004"]) assert.equal(begleit("goz", nr), true, nr);
  for (const nr of ["0030", "1000", "2030", "2197", "4050", "4055", "8000", "Ä1", "10", "PZR", ""]) assert.equal(art("goz", nr), null, nr);
});

test("andere Arten von Zeilen haben keine Behandlungsart", () => {
  assert.deepEqual(G.leistungsart("", "13b"), { begleit: false, art: null });
  assert.deepEqual(G.leistungsart("bel", "13b"), { begleit: false, art: null });
  assert.deepEqual(G.leistungsart(undefined, undefined), { begleit: false, art: null });
});

test("Hauptleistungen eines Tages: Begleitleistungen fallen weg, Untersuchung nur ohne andere Behandlung", () => {
  const tag = [z("bema", "01", "Untersuchung"), z("bema", "107", "Entfernen harter Zahnbeläge"), z("bema", "8", "Vitalitätsprüfung"),
    z("bema", "40", "Infiltrationsanästhesie"), z("bema", "13b", "Füllung zweiflächig"), z("bema", "13b", "Füllung zweiflächig")];
  const a = G.hauptleistungen(tag);
  assert.deepEqual([...a.arten], ["fuellung"]);
  assert.deepEqual(a.texte, ["Füllung zweiflächig"]);
  const b = G.hauptleistungen([z("bema", "01", "Untersuchung"), z("bema", "107", "Entfernen harter Zahnbeläge")]);
  assert.deepEqual([...b.arten], ["untersuchung"]);
  assert.deepEqual(b.texte, ["Untersuchung"]);
  const c = G.hauptleistungen([z("bema", "40", "Infiltrationsanästhesie"), z("bema", "107", "Entfernen harter Zahnbeläge")]);
  assert.deepEqual([...c.arten], []);
  assert.deepEqual(c.texte, ["Entfernen harter Zahnbeläge"]);
  const d = G.hauptleistungen([z("bema", "40", "Infiltrationsanästhesie")]);
  assert.deepEqual(d.texte, ["Infiltrationsanästhesie"]);
  const e = G.hauptleistungen([z("bema", "32", "Aufbereitung eines Wurzelkanals"), z("bema", "35", "Wurzelfüllung"), z("bema", "13b", "Füllung zweiflächig")]);
  assert.deepEqual([...e.arten].sort(), ["fuellung", "wurzelbehandlung"]);
  assert.deepEqual(G.hauptleistungen(null), { arten: new Set(), texte: [] });
});