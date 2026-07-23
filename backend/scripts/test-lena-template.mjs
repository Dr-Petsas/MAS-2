// W-LENA-8b: Merge-/Gap-/Planwechsel-Regeln ohne LLM.
import assert from "node:assert/strict";
import {
  mergeTemplateFields,
  computeGaps,
  serializeTemplateFields,
  toStructuredTextFromFields,
  billingHintsFromFields,
  composeStructuredFromTemplate,
  ALL_KEYS,
  TEMPLATE_ID,
} from "../src/lena/templateZahn.js";

function testPrefillAnlass() {
  const m = mergeTemplateFields(null, { values: {}, openBlocks: [] }, { anlass: "Füllung 36" });
  assert.equal(m.anlass, "Füllung 36");
  assert.equal(m.values.anlass, "Füllung 36");
  assert.equal(m.values.plan_geplant, "Füllung 36");
  assert.equal(m.templateId, TEMPLATE_ID);
}

function testPlanGeplantAdditive() {
  const existing = {
    values: { plan_geplant: "Implantation 36", therapie: "" },
    openBlocks: [],
    teeth: [],
  };
  const incoming = {
    values: {
      plan_geplant: "Endodontie", // darf NICHT gewinnen
      plan_durchgefuehrt: "Schmerzbehandlung zuerst",
      therapie: "Trepanation 36",
    },
    openBlocks: ["planwechsel", "endo"],
    teeth: [36],
  };
  const m = mergeTemplateFields(existing, incoming, { anlass: "Implantation 36" });
  assert.equal(m.values.plan_geplant, "Implantation 36");
  assert.equal(m.values.plan_durchgefuehrt, "Schmerzbehandlung zuerst");
  assert.ok(m.openBlocks.includes("planwechsel"));
  assert.ok(m.openBlocks.includes("endo"));
  assert.deepEqual(m.teeth, [36]);
}

function testLongerWins() {
  const existing = { values: { befund: "Karies" }, openBlocks: [], teeth: [] };
  const incoming = { values: { befund: "Karies mesial 36, perkussionsempfindlich" }, openBlocks: [], teeth: [36] };
  const m = mergeTemplateFields(existing, incoming);
  assert.match(m.values.befund, /perkussionsempfindlich/);
}

function testGaps() {
  const { status, gapCount } = computeGaps(
    { befund: "", diagnose: "Caries", therapie: "Komposit", komplikationen: "", procedere: "" },
    ["fuellung"],
  );
  assert.equal(status.befund, "gap");
  assert.equal(status.diagnose, "live");
  assert.equal(status.komplikationen, "gap");
  assert.ok(gapCount >= 3);
}

function testPlanwechselNeedsConsentGap() {
  const m = mergeTemplateFields(null, {
    values: {
      plan_geplant: "Implantat",
      plan_durchgefuehrt: "Endo zuerst",
      plan_zustimmung: "",
    },
    openBlocks: ["planwechsel"],
  }, { anlass: "Implantat" });
  assert.equal(m.status.plan_zustimmung, "gap");
}

function testSerialize() {
  const m = mergeTemplateFields(null, {
    values: { befund: "ok", therapie: "Füllung" },
    openBlocks: ["fuellung"],
    teeth: [16],
  }, { anlass: "Füllung" });
  const s = serializeTemplateFields(m, { model: "test", updatedBy: "unit" });
  assert.equal(s.templateId, TEMPLATE_ID);
  assert.equal(s.model, "test");
  assert.ok(ALL_KEYS.every((k) => k in s.values));
  assert.ok(Array.isArray(s.openBlocks));
}

function testStructuredFromTemplate() {
  const fields = mergeTemplateFields(null, {
    values: {
      anlass: "Füllung 36",
      befund: "Karies mesial",
      diagnose: "Caries 36",
      therapie: "Kompositfüllung",
      fuellung_material: "Komposit",
      fuellung_flaechen: "M",
      komplikationen: "keine",
      procedere: "Kontrolle in 6 Monaten",
    },
    openBlocks: ["fuellung", "la"],
    teeth: [36],
  }, { anlass: "Füllung 36" });
  const text = toStructuredTextFromFields(fields, { nachdiktatLines: ["Okklusion kontrolliert"] });
  assert.match(text, /DOKU-TEMPLATE ZAHNMEDIZIN/);
  assert.match(text, /Befund: Karies mesial/);
  assert.match(text, /FÜLLUNG/);
  assert.match(text, /NACHDIKTAT/);
  assert.match(text, /Okklusion kontrolliert/);
  assert.doesNotMatch(text, /Arzt:/); // kein Dialog-Bubble
}

function testBillingHintsNoCodesAsRows() {
  const fields = mergeTemplateFields(null, {
    values: {
      therapie: "Extraktion 48",
      ex_zahn: "Zahn 48",
      la_mittel: "Ultracain",
      plan_durchgefuehrt: "Extraktion statt Implantat",
    },
    openBlocks: ["extraktion", "la", "planwechsel"],
  }, { anlass: "Implantation" });
  const hints = billingHintsFromFields(fields);
  assert.ok(hints.some((h) => /Extraktion/i.test(h)));
  assert.ok(hints.some((h) => /Lokalanästhesie|LA/i.test(h)));
  assert.ok(hints.some((h) => /Planänderung/i.test(h)));
  // Hinweise duerfen Code-Familien nennen, aber compose bleibt Plaintext
  const composed = composeStructuredFromTemplate(fields, { includeHints: true });
  assert.match(composed.structuredText, /ABRECHNUNGSHINWEISE/);
  assert.match(composed.structuredText, /Sophie entscheidet/);
  assert.equal(composed.source, "template");
  assert.ok(composed.billingHints.length >= 2);
}

testPrefillAnlass();
testPlanGeplantAdditive();
testLongerWins();
testGaps();
testPlanwechselNeedsConsentGap();
testSerialize();
testStructuredFromTemplate();
testBillingHintsNoCodesAsRows();
console.log("test-lena-template: ok (" + ALL_KEYS.length + " keys, 8b+8c)");
