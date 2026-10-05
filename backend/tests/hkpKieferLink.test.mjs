// Kiefer-Waechter und SMS-Lese-Link fuer HKPs (Live 05.10.2026).
// Start: node backend/tests/hkpKieferLink.test.mjs
import assert from "node:assert/strict";
process.env.PLANR_HKP_KEY = "test-schluessel";
const { vergessenerKiefer, hkpLinkToken, hkpLinkOk, hkpLink } = await import("../src/routes/hkp.js");
const E = await import("../src/vendor/hkp-engine.mjs");

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }
const pruef = (s) => vergessenerKiefer(s, E.auftragVerstehen(s));

t("beide Kiefer genannt und geplant: kein Eingriff", () => {
  assert.equal(pruef("Es fehlen alle Zähne, ich möchte totale Oberkieferprothese und totale Unterkieferprothese geplant haben"), "");
  assert.equal(pruef("Totalprothese für beide Kiefer"), "");
});
t("UK genannt, aber nur OK geplant: Waechter greift", () => {
  assert.equal(vergessenerKiefer("Totalprothese im Oberkiefer und im Unterkiefer", { teile: [{ kiefer: "OK", versorgung: "totalprothese" }] }), "UK");
});
t("Befund zum anderen Kiefer: kein Eingriff", () => {
  assert.equal(pruef("Im Oberkiefer eine Totalprothese, unten bleibt alles wie es ist"), "");
});
t("Notaus", () => {
  process.env.MAS_HKP_KIEFER_CHECK = "0";
  assert.equal(vergessenerKiefer("Oberkiefer und Unterkiefer", { kiefer: "OK" }), "");
  delete process.env.MAS_HKP_KIEFER_CHECK;
});
t("Lese-Link: gueltig nur fuer seine ID und nicht abgelaufen", () => {
  const tok = hkpLinkToken("abc");
  assert.ok(hkpLinkOk("abc", tok));
  assert.ok(!hkpLinkOk("andere", tok));
  assert.ok(!hkpLinkOk("abc", tok.replace(/.$/, (c) => (c === "A" ? "B" : "A"))));
  assert.ok(!hkpLinkOk("abc", tok, Date.now() + 15 * 86400e3));
  assert.ok(!hkpLink("abc").includes("test-schluessel"));
});

console.log(`${ok} Tests ok`);
process.exit(0);
