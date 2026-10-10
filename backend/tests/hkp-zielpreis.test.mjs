// Wunsch-Eigenanteil beim HKP (10.10.2026): Spanne beim Vorlesen, Regler auf den Wunsch, Summen erst beim Anlegen.
// Start: node backend/tests/hkp-zielpreis.test.mjs
import assert from "node:assert/strict";
const E = await import("../src/vendor/hkp-engine.mjs");
const { reglerSatz, spanneSatz, zielpreisAus } = await import("../src/hkp/zielpreis.js");
const { vorleseSatz } = await import("../src/hkp/vorlesen.js");

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }

t("Wunschpreis aus Ziffern und Zahlwoertern", () => {
  assert.equal(zielpreisAus("3.000 Euro"), 3000);
  assert.equal(zielpreisAus("so um die 2500"), 2500);
  assert.equal(zielpreisAus("dreitausend"), 3000);
  assert.equal(zielpreisAus("drei tausend fünf hundert Euro"), 3500);
  assert.equal(zielpreisAus("zweieinhalbtausend"), 2500);
  assert.equal(zielpreisAus("ungefähr 2,5 tausend"), 2500);
  assert.equal(zielpreisAus("achthundertfünfzig"), 850);
  assert.equal(zielpreisAus(1800), 1800);
  assert.equal(zielpreisAus("ja bitte"), null);
  assert.equal(zielpreisAus(""), null);
  assert.equal(zielpreisAus(undefined), null);
});

t("Vorlesen mit Spanne nennt keine Summen und fragt nach dem Wunsch", () => {
  const s = vorleseSatz({
    patient: { anredeLabel: "Herrn Mustermann", firstName: "Helmut", lastName: "Mustermann", birthDate: "1952-05-13" },
    versorgungText: "Brücke", kiefer: ["OK"], zaehne: {}, versorgung: "Brücke 14 bis 17",
    summen: "Gesamtkosten tausend Euro", spanne: spanneSatz({ min: 812.4, max: 2950.6 }),
  });
  assert.match(s, /zwischen achthundertzwölf Euro und zweitausendneunhunderteinundfünfzig Euro/);
  assert.doesNotMatch(s, /Gesamtkosten|Voraussichtlich/);
  assert.match(s, /Wo soll der Eigenanteil ungefähr landen – oder soll ich den Entwurf so anlegen\?$/);
  assert.match(s, /^Bevor ich anlege/);
});

t("Vorlesen ohne Spanne wie bisher", () => {
  const s = vorleseSatz({ patient: { firstName: "A", lastName: "B" }, versorgungText: "HKP", kiefer: [], summen: "Gesamtkosten zehn Euro" });
  assert.match(s, /Voraussichtlich Gesamtkosten zehn Euro\. Soll ich den Entwurf so anlegen\?$/);
});

const r = E.hkpEntwurf("Brücke von 14 auf 17 mit 15 und 16 als Brücke", { 15: "f", 16: "f" }, { labor: "praxis" });
assert.equal(r.status, "ok");
const spanne = E.preisSpanne(r.plan);

t("Engine: Regler auf den Wunsch, Plan traegt den Reglerstand", () => {
  const ziel = Math.round((spanne.min + spanne.max) / 2);
  const z = E.aufZielpreis(r.plan, ziel);
  assert.ok(Math.abs(z.eigenanteil - ziel) < (spanne.max - spanne.min) / 10);
  assert.equal(z.plan.einstellungen.honorarFaktor, z.stand.honorarFaktor);
  assert.equal(z.plan.einstellungen.eigenKasseProzent, z.stand.eigenKasseProzent);
  const satz = reglerSatz(z);
  assert.match(satz, /^Für Ihren Wunsch von .+ habe ich die Regler gestellt: /);
});

t("Reglersatz: unter dem billigsten und ueber dem teuersten Stand", () => {
  assert.match(reglerSatz(E.aufZielpreis(r.plan, 1)), /liegt unter dem billigsten Stand, deshalb stehen alle Regler unten: Eigenlabor Kasse fünfzig Prozent\./);
  const oben = reglerSatz(E.aufZielpreis(r.plan, 20000));
  assert.match(oben, /^Ihr Wunsch von zwanzigtausend Euro liegt über dem teuersten Stand/);
  assert.match(oben, /GOZ-Faktor drei Komma fünf/);
  assert.match(oben, /BEB-Aufschlag einhundert Prozent/);
  assert.match(oben, /Begründung in PlanR/);
  assert.match(oben, /Mehrkostenvereinbarung/);
});

console.log(`${ok} ok`);
