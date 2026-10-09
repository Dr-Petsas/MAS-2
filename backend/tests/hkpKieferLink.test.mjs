// Kiefer-Waechter und SMS-Lese-Link fuer HKPs (Live 05.10.2026).
// Start: node backend/tests/hkpKieferLink.test.mjs
import assert from "node:assert/strict";
process.env.PLANR_HKP_KEY = "test-schluessel";
const {
  vergessenerKiefer, hkpLinkToken, hkpLinkOk, hkpLink, nurVornamePasst, namePasst,
  hkpFreigabeToken, hkpFreigabeOk, hkpMobilLink, hkpKarte, hkpBearbeitenToken, hkpBearbeitenOk,
} = await import("../src/routes/hkp.js");
const E = await import("../src/vendor/hkp-engine.mjs");
const { DEFAULT_CLIENT_ID } = await import("../src/routes/_shared.js");

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

t("Freigabe-Schluessel: eigener Zweck, kurze Frist, Lese-Link reicht nicht", () => {
  const f = hkpFreigabeToken("abc");
  assert.ok(hkpFreigabeOk("abc", f));
  assert.ok(!hkpFreigabeOk("abc", hkpLinkToken("abc")));
  assert.ok(!hkpLinkOk("abc", f));
  assert.ok(!hkpFreigabeOk("abc", f, Date.now() + 4 * 86400e3));
  assert.ok(!hkpLink("abc").includes("&f="));
  assert.ok(hkpMobilLink("abc").includes("&f=") && hkpMobilLink("abc").includes("ansicht=mobil"));
});

t("Bearbeiten-Schluessel (Uebersicht): eigener Zweck, ein Tag, nie in SMS- oder Handy-Link", () => {
  const b = hkpBearbeitenToken("abc");
  assert.ok(hkpBearbeitenOk("abc", b));
  assert.ok(!hkpBearbeitenOk("andere", b));
  assert.ok(!hkpBearbeitenOk("abc", hkpLinkToken("abc")));
  assert.ok(!hkpBearbeitenOk("abc", hkpFreigabeToken("abc")));
  assert.ok(!hkpFreigabeOk("abc", b) && !hkpLinkOk("abc", b));
  assert.ok(!hkpBearbeitenOk("abc", b, Date.now() + 2 * 86400e3));
  assert.ok(!hkpBearbeitenOk("abc", hkpBearbeitenToken("abc", Date.now(), "praxis2")));
  assert.ok(!hkpLink("abc").includes("&b=") && !hkpMobilLink("abc").includes("&b="));
});

t("Anderer Mandant: Schluessel gilt nur mit seinem clientId", () => {
  const tok = hkpLinkToken("abc", Date.now(), "praxis2");
  assert.ok(hkpLinkOk("abc", tok, Date.now(), "praxis2"));
  assert.ok(!hkpLinkOk("abc", tok));
  assert.ok(hkpMobilLink("abc", "praxis2").includes("&c=praxis2"));
  assert.ok(!hkpMobilLink("abc").includes("&c="));
});

t("Uebersicht-Link (Standard-Mandant ausdruecklich): gilt ohne c=", () => {
  const tok = hkpLinkToken("abc", Date.now(), DEFAULT_CLIENT_ID);
  assert.ok(hkpLinkOk("abc", tok, Date.now(), DEFAULT_CLIENT_ID));
});

t("HKP-Karte fuers Handy (Notaus MAS_HKP_KARTE=0)", () => {
  const h = { id: "abc", status: "wartet_auf_freigabe", versorgungText: "Teleskop-HKP", kiefer: "OK", patient: { label: "Michael Petsas" },
    summen: { gesamt: 4321.5, kassenanteil: 1200, festzuschuss: 1200, eigenanteil: 3121.5 } };
  const k = hkpKarte(h);
  assert.equal(k.kind, "hkp");
  assert.equal(k.subtitle, "Teleskop-HKP im Oberkiefer");
  assert.ok(k.items.some((i) => i.text === "Eigenanteil 3.121,50 €"));
  assert.ok(k.url.startsWith("https://") && !k.url.includes("test-schluessel"));
  process.env.MAS_HKP_KARTE = "0";
  assert.equal(hkpKarte(h), null);
  delete process.env.MAS_HKP_KARTE;
});

t("Nur-Vorname haelt den gemerkten Patienten (Live 05.10.2026 22:45)", () => {
  const petzas = { firstName: "Michael", lastName: "Petzas" };
  assert.ok(nurVornamePasst("Patienten Michael", petzas));
  assert.ok(nurVornamePasst("Michael", petzas));
  assert.ok(!nurVornamePasst("Thomas", petzas));
  assert.ok(!nurVornamePasst("Michael Braun", petzas));
  assert.equal(namePasst("Patienten Michael Petzers", petzas), 2);
});

console.log(`${ok} Tests ok`);
process.exit(0);
