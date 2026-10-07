// HKP-Registerfragen mit Zeitbezug (Anruf 07.10.2026 19:18: "Welche HKPs haben wir heute
// noch geschrieben?" ergab nur "Insgesamt ist ein HKP in Bearbeitung").
// Start: node backend/tests/hkpZeitraum.test.mjs
import assert from "node:assert/strict";
const { berlinTag, zeitraumAus, ereignisAus, imZeitraum } = await import("../src/hkp/zeitraum.js");
const { zeitraumSatz, uebersichtSatz } = await import("../src/hkp/sprech.js");

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }

const JETZT = new Date("2026-10-07T17:30:00Z"); // Mittwoch, 19:30 deutsche Zeit
const hkp = (id, label, versorgungText, status, erstellt, extra = {}) => ({
  id, patient: { label }, versorgungText, kiefer: "UK", status, erstellt, aktualisiert: erstellt, ...extra,
});
const tzannis = hkp("a", "Herrn Kiriakos Tzannis", "Brücken-HKP", "freigegeben", "2026-10-07T17:13:40Z",
  { freigegeben: "2026-10-07T17:16:00Z" });
const petsas = hkp("b", "Herrn Michael Petsas", "Totalprothesen-HKP", "wartet_auf_freigabe", "2026-10-07T06:10:00Z");
const alt = hkp("c", "Frau Isabella Greisinger", "Implantat-HKP", "wartet_auf_freigabe", "2026-10-06T13:40:00Z");
const verworfen = hkp("d", "Herrn Michael Petsas", "Brücken-HKP", "verworfen", "2026-10-07T07:00:00Z");
const nachMitternacht = hkp("e", "Frau Ute Abel", "Kronen-HKP", "wartet_auf_freigabe", "2026-10-06T22:30:00Z");
const alle = [tzannis, petsas, alt, verworfen];

t("Kalendertag in deutscher Zeit (00:30 MESZ zaehlt zum neuen Tag)", () => {
  assert.equal(berlinTag("2026-10-06T22:30:00Z"), "2026-10-07");
  assert.equal(berlinTag("kaputt"), "");
});
t("Zeitraeume: heute, gestern, vorgestern, Woche, Monat, letzte N Tage", () => {
  assert.deepEqual(zeitraumAus("Welche HKPs haben wir heute noch geschrieben?", JETZT), { von: "2026-10-07", bis: "2026-10-07", vorsatz: "Heute" });
  assert.equal(zeitraumAus("und gestern?", JETZT).von, "2026-10-06");
  assert.equal(zeitraumAus("vorgestern", JETZT).von, "2026-10-05");
  assert.deepEqual(zeitraumAus("Was wurde diese Woche erstellt?", JETZT), { von: "2026-10-05", bis: "2026-10-07", vorsatz: "Diese Woche" });
  assert.equal(zeitraumAus("letzte Woche", JETZT).vorsatz, "Letzte Woche");
  assert.equal(zeitraumAus("diesen Monat", JETZT).von, "2026-10-01");
  assert.equal(zeitraumAus("in den letzten drei Tagen", JETZT).vorsatz, "In den letzten drei Tagen");
});
t("kein Zeitraum: ohne Zeitwort, Zukunft, Jahreszeit", () => {
  assert.equal(zeitraumAus("Welche HKPs warten auf Freigabe?", JETZT), null);
  assert.equal(zeitraumAus("naechste Woche", JETZT), null);
  assert.equal(zeitraumAus("im Sommer", JETZT), null);
});
t("Ereignis: erstellt / freigegeben / verworfen / Zustand", () => {
  assert.equal(ereignisAus("Welche HKPs haben wir heute geschrieben?"), "erstellt");
  assert.equal(ereignisAus("Was wurde heute freigegeben?"), "freigegeben");
  assert.equal(ereignisAus("Welche HKPs wurden heute verworfen?"), "verworfen");
  assert.equal(ereignisAus("Was wartet heute noch auf Freigabe?"), null);
  assert.equal(ereignisAus("Welche sind heute noch nicht freigegeben?"), null);
});
t("heute erstellt: Patient, Art und Status, verworfene als Nachsatz", () => {
  const zr = zeitraumAus("heute", JETZT);
  const treffer = imZeitraum([...alle, nachMitternacht], zr, "erstellt");
  assert.deepEqual(treffer.map((h) => h.id), ["a", "d", "b", "e"]);
  assert.equal(zeitraumSatz(treffer, { vorsatz: zr.vorsatz, ereignis: "erstellt" }),
    "Heute wurden drei HKPs erstellt: erstens der Brücken-HKP im Unterkiefer für Herrn Kiriakos Tzannis, freigegeben; "
    + "zweitens der Totalprothesen-HKP im Unterkiefer für Herrn Michael Petsas, wartet auf Freigabe; "
    + "drittens der Kronen-HKP im Unterkiefer für Frau Ute Abel, wartet auf Freigabe. Dazu ein verworfener Entwurf.");
});
t("ein Treffer und kein Treffer", () => {
  assert.equal(zeitraumSatz([tzannis], { vorsatz: "Heute", ereignis: "freigegeben" }),
    "Heute wurde ein HKP freigegeben: der Brücken-HKP im Unterkiefer für Herrn Kiriakos Tzannis.");
  assert.equal(zeitraumSatz([], { vorsatz: "Gestern", ereignis: "freigegeben" }), "Gestern wurde kein HKP freigegeben.");
  assert.equal(zeitraumSatz([verworfen, verworfen], { vorsatz: "Gestern", ereignis: "erstellt" }),
    "Gestern wurden zwei HKP-Entwürfe erstellt, beide sind inzwischen verworfen.");
});
t("Freigabe zaehlt nach Freigabetag, nicht nach Erstellung", () => {
  const zr = zeitraumAus("heute", JETZT);
  assert.deepEqual(imZeitraum(alle, zr, "freigegeben").map((h) => h.id), ["a"]);
  assert.deepEqual(imZeitraum(alle, zeitraumAus("gestern", JETZT), "erstellt").map((h) => h.id), ["c"]);
});
t("mehr als sechs: die neuesten sechs und der Rest als Zahl", () => {
  const viele = Array.from({ length: 8 }, (_, i) => hkp(`v${i}`, `Patient ${i}`, "Kronen-HKP", "wartet_auf_freigabe", "2026-10-07T08:00:00Z"));
  const s = zeitraumSatz(viele, { vorsatz: "Heute", ereignis: "erstellt" });
  assert.match(s, /^Heute wurden acht HKPs erstellt: erstens /);
  assert.match(s, /sechstens der Kronen-HKP im Unterkiefer für Patient 5, wartet auf Freigabe; und zwei weitere\.$/);
});
t("allgemeine Uebersicht nennt freigegebene HKPs mit Namen statt 'in Bearbeitung'", () => {
  assert.equal(uebersichtSatz([tzannis]),
    "Kein HKP wartet auf Freigabe. Außerdem im Register: Herrn Kiriakos Tzannis, Brücken-HKP im Unterkiefer, freigegeben.");
  assert.equal(uebersichtSatz([petsas]), "Ein HKP wartet auf Freigabe: Herrn Michael Petsas, Totalprothesen-HKP im Unterkiefer.");
});

console.log(`${ok} HKP-Zeitraum-Pruefungen gruen.`);
