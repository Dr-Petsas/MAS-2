// Test: Lena-Abrechnungswissen (deterministische Schicht, ohne LLM/Firestore).
// Prueft, dass die nach MAS portierte Wissensbasis (src/lena/billingKnowledge.js)
// die Kataloge laedt, Jargon erkennt, Ziffern gegen den Katalog validiert und
// die deterministische Expansion plausible BEMA/GOZ-Vorschlaege liefert —
// das ist der Fallback-Pfad, wenn das lokale LLM nicht antwortet.

import {
  loadBema,
  loadGoz,
  loadJargon,
  loadChains,
  detectJargon,
  detectChains,
  expandBillingFromText,
  validateCatalogCodes,
  buildGroundingContext,
} from "../src/lena/billingKnowledge.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("[test-lena-billing] Kataloge");
const bema = loadBema(true);
const goz = loadGoz(true);
const jargon = loadJargon(true);
const chains = loadChains(true);
check("BEMA-Katalog geladen (>50 Positionen)", bema.length > 50, `nur ${bema.length}`);
check("GOZ-Katalog geladen (>50 Positionen)", goz.length > 50, `nur ${goz.length}`);
check("Jargon geladen (>20 Eintraege)", jargon.length > 20, `nur ${jargon.length}`);
check("Ketten geladen (>3)", chains.length > 3, `nur ${chains.length}`);

console.log("[test-lena-billing] Jargon-/Ketten-Erkennung");
const memo = "Zahn 36 Fuellung zweiflaechig okklusal-distal mit Composite, Infiltration gesetzt, keine Besonderheiten.";
const j = detectJargon(memo);
check("Fuellungs-Memo trifft Jargon", j.length > 0);
const c = detectChains(memo);
check("Fuellungs-Memo aktiviert eine Kette", c.length > 0);

console.log("[test-lena-billing] Deterministische Expansion");
const exp = expandBillingFromText(memo);
check("Expansion liefert BEMA-Vorschlaege", exp.bema.length > 0);
check("Expansion liefert GOZ-Vorschlaege", exp.goz.length > 0);
const bemaCodes = exp.bema.map((x) => x.code);
const gozCodes = exp.goz.map((x) => x.code);
check("zweiflaechige Fuellung -> BEMA 13b", bemaCodes.includes("13b"), bemaCodes.join(","));
check("zweiflaechige Fuellung -> GOZ 2080", gozCodes.includes("2080"), gozCodes.join(","));
const anaesthesie = bemaCodes.includes("40") || bemaCodes.includes("41a");
check("Anaesthesie (Infiltration) wird mit angesetzt", anaesthesie, bemaCodes.join(","));

console.log("[test-lena-billing] Katalog-Validierung");
const validated = validateCatalogCodes("bema", [
  { code: "13b", label: "" },
  { code: "9999xyz", label: "erfunden" },
]);
check("erfundene Ziffern werden verworfen", validated.length === 1 && validated[0].code === "13b");
check("Label wird aus dem Katalog angereichert", !!validated[0].label);

console.log("[test-lena-billing] Grounding-Kontext");
const g = buildGroundingContext(memo);
check("Kontext enthaelt zulaessige BEMA-Liste", g.context.includes("ALLE ZULAESSIGEN BEMA-POSITIONEN"));
check("Kontext enthaelt erkannten Jargon", g.matchedTerms.length > 0);

console.log(failures === 0 ? "[test-lena-billing] PASS" : `[test-lena-billing] ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
