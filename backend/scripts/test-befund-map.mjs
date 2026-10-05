import assert from "node:assert/strict";
import {
  mapTooth,
  mapTeeth,
  mapBoth,
  toSchemaText,
  toothLine,
  fromTeethRaw,
} from "../src/pvs/befundMap.js";

function tooth(fdi, extra = {}) {
  return {
    [fdi]: {
      missing: false,
      mark: {},
      surfaces: { okklusal: [], mesial: [], distal: [], vestibulaer: [], lingual_palatinal: [] },
      rootMarkers: [],
      pocket: { m: 1, d: 1 },
      ...extra,
    },
  };
}

function testKariesSurfaces() {
  const raw = tooth(36, {
    surfaces: {
      okklusal: ["karies"],
      mesial: ["karies"],
      distal: [],
      vestibulaer: ["karies"],
      lingual_palatinal: [],
    },
  });
  const ds = mapTeeth(raw, "dampsoft")[0];
  const dens = mapTeeth(raw, "dens")[0];
  assert.equal(ds.huk, "k");
  assert.deepEqual(ds.hukSurfaces, ["O", "M", "B"]);
  assert.equal(dens.huk, "k");
  assert.deepEqual(dens.hukSurfaces, ["O", "M", "V"]);
  assert.equal(toothLine(ds), "36: kOMB");
  assert.equal(toothLine(dens), "36: kOMV");
}

function testMissingAndCrown() {
  const raw = {
    ...tooth(14, { missing: true }),
    ...tooth(26, { mark: { krone: true } }),
  };
  const rows = mapTeeth(raw, "dampsoft");
  assert.equal(rows.find((r) => r.fdi === 14).huk, "f");
  assert.equal(rows.find((r) => r.fdi === 26).huk, "kw");
}

function testRootAndImplant() {
  const raw = {
    ...tooth(46, { rootMarkers: ["wurzelfuellung", "wurzelstift"] }),
    ...tooth(16, { mark: { implantat: true } }),
  };
  const both = mapBoth(raw);
  assert.equal(both.dampsoft.find((r) => r.fdi === 46).huk, "st");
  assert.equal(both.dens.find((r) => r.fdi === 46).huk, "st");
  assert.equal(both.dampsoft.find((r) => r.fdi === 16).huk, "ix");
  assert.equal(both.dens.find((r) => r.fdi === 16).huk, "ix");
}

function testFillingBesideCaries() {
  const raw = tooth(25, {
    surfaces: {
      okklusal: ["karies", "fuellung"],
      mesial: [],
      distal: [],
      vestibulaer: [],
      lingual_palatinal: [],
    },
  });
  const ds = mapTeeth(raw, "dampsoft")[0];
  assert.equal(ds.huk, "k");
  assert.ok(ds.extras.some((e) => e.code === "F" && e.surfaces.includes("O")));
}

function testUnmappedNote() {
  const raw = tooth(11, { mark: { leukoplakie: true } });
  const ds = mapTeeth(raw, "dens")[0];
  assert.equal(ds.huk, "");
  assert.ok(ds.notes.includes("Leukoplakie"));
}

function testSchemaText() {
  const raw = tooth(36, {
    surfaces: {
      okklusal: ["karies"],
      mesial: [],
      distal: [],
      vestibulaer: [],
      lingual_palatinal: [],
    },
  });
  const txt = toSchemaText(raw, "dens", "Max Muster");
  assert.match(txt, /01-SCHEMA DENS/);
  assert.match(txt, /Patient: Max Muster/);
  assert.match(txt, /36: kO/);
}

function testFromRawEmptySkipped() {
  assert.equal(fromTeethRaw({}).length, 0);
  assert.equal(mapTeeth(tooth(21), "dampsoft").length, 0);
}

testKariesSurfaces();
testMissingAndCrown();
testRootAndImplant();
testFillingBesideCaries();
testUnmappedNote();
testSchemaText();
testFromRawEmptySkipped();
console.log("test-befund-map: ok");
