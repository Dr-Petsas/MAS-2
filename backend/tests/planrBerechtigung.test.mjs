// PlanR-Freischaltung (12.10.2026): in MAS enthalten, sonst nur mit PlanR-Abo; Clara-Umfang je Buchung.
// Start: node backend/tests/planrBerechtigung.test.mjs
import assert from "node:assert/strict";
const { planrAusBilling } = await import("../src/hkp/planrBerechtigung.js");

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }

t("ohne Billing kein PlanR", () => {
  assert.deepEqual(planrAusBilling(null), { mas: false, planr: false, erlaubt: false, clara: "aus", doku: false });
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

t("Dokumentation: bei Pickadoc enthalten, sonst nur mit Upgrade", () => {
  assert.equal(planrAusBilling({ subscriptions: { crew: { tier: "premium" } } }).doku, true);
  assert.equal(planrAusBilling({ subscriptions: { planr: { enabled: true } } }).doku, false);
  assert.equal(planrAusBilling({ subscriptions: { planr: { enabled: true, doku: true } } }).doku, true);
  assert.equal(planrAusBilling({ subscriptions: { planr: { enabled: false, doku: true } } }).doku, false);
});

t("abgeschlossenes Abo bleibt an, auch wenn ein altes Testende dasteht", () => {
  const alt = { subscriptions: { planr: { enabled: true, sprachsteuerung: true, doku: true, testabo: false, testaboBis: "2020-01-01T00:00:00.000Z" } } };
  assert.equal(planrAusBilling(alt).planr, true);
  assert.equal(planrAusBilling(alt).doku, true);
});

t("abgelaufenes Testabo schaltet PlanR aus, ein laufendes bleibt an", () => {
  const alt = { subscriptions: { planr: { enabled: true, sprachsteuerung: true, doku: true, testaboBis: "2020-01-01T00:00:00.000Z" } } };
  assert.equal(planrAusBilling(alt).planr, false);
  assert.equal(planrAusBilling(alt).erlaubt, false);
  assert.equal(planrAusBilling(alt).doku, false);
  const neu = { subscriptions: { planr: { enabled: true, sprachsteuerung: true, doku: true, testaboBis: "2099-01-01T00:00:00.000Z" } } };
  assert.equal(planrAusBilling(neu).planr, true);
  assert.equal(planrAusBilling(neu).clara, "planr");
  assert.equal(planrAusBilling(neu).doku, true);
});

t("Standalone: HKP-Clara nur mit Sprachsteuerung", () => {
  assert.equal(planrAusBilling({ subscriptions: { planr: { enabled: true } } }).clara, "aus");
  assert.equal(planrAusBilling({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }).clara, "planr");
  assert.equal(planrAusBilling({ subscriptions: { planr: { enabled: false, sprachsteuerung: true } } }).erlaubt, false);
});

console.log(`planrBerechtigung: ${ok} ok`);
