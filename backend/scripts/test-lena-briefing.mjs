// W-LENA-8d: Gewichtung / Kuerze ohne Firestore/LLM.
import assert from "node:assert/strict";
import {
  pickWeightedFacts,
  buildWeightedVisitBriefing,
  FIELD_WEIGHTS,
} from "../src/lena/lenaBriefing.js";

function testPicksHighestWeights() {
  const fields = {
    values: {
      befund: "Langer Befund mit vielen Details die niemand vorlesen soll weil das ein Roman waere",
      diagnose: "Pulpitis 36",
      therapie: "Trepanation und Medikamenteneinlage",
      komplikationen: "keine",
      procedere: "Wiedervorstellung in einer Woche zur Fortsetzung",
      anlass: "Schmerz",
    },
    openBlocks: ["endo"],
  };
  const facts = pickWeightedFacts(fields, { maxFacts: 2 });
  assert.equal(facts.length, 2);
  assert.ok(facts.every((f) => f.key !== "komplikationen"), "keine Komplikationen nicht sprechen");
  assert.ok(facts.every((f) => f.key !== "befund"), "Befund weicht Diagnose/Therapie");
  assert.ok(facts.some((f) => f.key === "therapie" || f.key === "diagnose"));
  assert.ok(facts.every((f) => f.text.length <= 55));
}

function testPlanChangePriority() {
  const fields = {
    values: {
      plan_geplant: "Implantation 36",
      plan_durchgefuehrt: "Schmerzbehandlung zuerst",
      therapie: "Trepanation 36",
      befund: "Perkussionsempfindlich",
    },
    openBlocks: ["planwechsel", "endo"],
  };
  const facts = pickWeightedFacts(fields, { maxFacts: 2 });
  assert.ok(facts[0].key === "plan_durchgefuehrt" || facts[0].key === "therapie");
  const b = buildWeightedVisitBriefing({ lastFields: fields, lastMotive: "Implantation" });
  assert.equal(b.source, "template");
  assert.ok(b.spoken.length <= 140);
  assert.ok(!/Perkussionsempfindlich/.test(b.spoken), "Befund nicht im Kurz-Briefing");
  assert.match(b.spoken, /gemacht:|Trepanation|Schmerzbehandlung/i);
}

function testNoTemplateFallsBackEmpty() {
  const b = buildWeightedVisitBriefing({ lastMotive: "PZR" });
  assert.equal(b.source, "none");
  assert.equal(b.spoken, "");
}

function testSnippetBudget() {
  const fields = {
    values: {
      therapie: "A".repeat(200),
      diagnose: "B".repeat(200),
      procedere: "C".repeat(200),
    },
    openBlocks: [],
  };
  const b = buildWeightedVisitBriefing({ lastFields: fields });
  assert.ok(b.spoken.length <= 140);
  assert.ok((b.spoken.match(/…/g) || []).length >= 1);
}

function testWeightsCoverClinicalKeys() {
  for (const k of ["therapie", "diagnose", "procedere", "plan_durchgefuehrt", "komplikationen"]) {
    assert.ok(FIELD_WEIGHTS[k] > 50, k);
  }
  assert.ok(FIELD_WEIGHTS.befund < FIELD_WEIGHTS.diagnose);
  assert.ok(FIELD_WEIGHTS.anlass < FIELD_WEIGHTS.therapie);
}

testPicksHighestWeights();
testPlanChangePriority();
testNoTemplateFallsBackEmpty();
testSnippetBudget();
testWeightsCoverClinicalKeys();
console.log("test-lena-briefing: ok");
