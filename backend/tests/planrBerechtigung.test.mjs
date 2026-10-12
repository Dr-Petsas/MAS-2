// PlanR-Freischaltung (12.10.2026): in MAS enthalten, sonst nur mit PlanR-Abo; Clara-Umfang je Buchung.
// Start: node backend/tests/planrBerechtigung.test.mjs
import assert from "node:assert/strict";
const { planrAusBilling } = await import("../src/hkp/planrBerechtigung.js");

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }

t("ohne Billing kein PlanR", () => {
  assert.deepEqual(planrAusBilling(null), { mas: false, planr: false, erlaubt: false, clara: "aus" });
});

t("MAS ueber crew premium oder Standort", () => {
  assert.equal(planrAusBilling({ subscriptions: { crew: { tier: "premium" } } }).erlaubt, true);
  assert.equal(planrAusBilling({ locationPackages: { a: { mas: { enabled: true } } } }).mas, true);
  assert.equal(planrAusBilling({ subscriptions: { crew: { tier: "telefon" } } }).erlaubt, false);
});

t("MAS-Kunden bekommen immer die volle Clara", () => {
  const b = planrAusBilling({ subscriptions: { crew: { tier: "premium" }, planr: { enabled: true, sprachsteuerung: true } } });
  assert.equal(b.clara, "voll");
});

t("Standalone: HKP-Clara nur mit Sprachsteuerung", () => {
  assert.equal(planrAusBilling({ subscriptions: { planr: { enabled: true } } }).clara, "aus");
  assert.equal(planrAusBilling({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }).clara, "planr");
  assert.equal(planrAusBilling({ subscriptions: { planr: { enabled: false, sprachsteuerung: true } } }).erlaubt, false);
});

console.log(`planrBerechtigung: ${ok} ok`);
