// HKP-Dialog per Sprache: Ja auf die Vorschau, Zahlen und Doppelung im Vorlesen, Bruecken (Gespraeche 06.10.2026).
// Start: node backend/tests/hkpDialog.test.mjs
import assert from "node:assert/strict";
const { vorschauPasst, vorschauFinden, doppelungHinweis, vetterAntwort } = await import("../src/routes/hkp.js");
const { vorleseSatz } = await import("../src/hkp/vorlesen.js");
const { versorgungSatz, nurSummenFrage, summenAntwort } = await import("../src/hkp/sprech.js");

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }

const abel = { id: "p1", firstName: "Holger", lastName: "Abel", anredeLabel: "Herrn Holger Abel", birthDate: "1960-03-02" };
const vs = (auftragText) => ({ patient: abel, auftragText, at: Date.now() });

t("Ja mit STT-Wortlaut gilt fuer die vorgelesene Umschreibung (Abel 15:01)", () => {
  assert.equal(vorschauPasst(vs("Oberkiefer-Totalprothese, alle Zähne fehlen"),
    { auftrag: "Ja, erstell bitte eine Heilung kostenplan, Oberkäfertotalprothese, alle Zähne fehlen", name: "Holger Abel" }), true);
});
t("neuer Inhalt beim Ja gilt nicht", () => {
  assert.equal(vorschauPasst(vs("Oberkiefer-Totalprothese, alle Zähne fehlen"), { auftrag: "Unterkiefer-Totalprothese" }), false);
  assert.equal(vorschauPasst(vs("Brücke von 14 auf 16"), { auftrag: "Brücke von 14 auf 17" }), false);
});
t("anderer Patient gilt nicht, leerer Auftrag gilt", () => {
  assert.equal(vorschauPasst(vs("Totalprothese OK"), { name: "Michael Petsas" }), false);
  assert.equal(vorschauPasst(vs("Totalprothese OK"), {}), true);
});
t("mehrere offene Vorschauen: das Ja trifft die mit passendem Auftrag bzw. Namen", () => {
  const greisinger = { id: "p2", firstName: "Isabella", lastName: "Greisinger", anredeLabel: "Frau Isabella Greisinger" };
  const a = vs("Totalprothese OK");
  const g = { patient: greisinger, auftragText: "Implantatkronen auf 14 und 15", at: Date.now() };
  const liste = [g, a];
  assert.equal(vorschauFinden(liste, { auftrag: "Totalprothese OK", bestaetigt: true }), a);
  assert.equal(vorschauFinden(liste, { name: "Isabella Greisinger" }), g);
  assert.equal(vorschauFinden(liste, { name: "Holger Abel" }), a);
  assert.equal(vorschauFinden(liste, {}), g);
  assert.equal(vorschauFinden(liste, { auftrag: "Brücke von 34 auf 37" }), null);
});
t("Summenfrage bekommt nur die Summen (06.10. 15:40, vorher 40 s Vorlesen)", () => {
  assert.equal(nurSummenFrage("Wie hoch ist der Festzuschuss?"), true);
  assert.equal(nurSummenFrage("Was ist der Status vom HKP?"), false);
  const s = summenAntwort({ versorgungText: "Implantat-HKP", kiefer: "OK", patient: { label: "Frau Greisinger" },
    summen: { gesamt: 1429.99, festzuschuss: 869.48, eigenanteil: 560.51 } });
  assert.match(s, /^Beim Implantat-HKP im Oberkiefer für Frau Greisinger: Gesamtkosten eintausendvierhundertneunundzwanzig Euro neunundneunzig/);
});

const alt = { id: "h1", status: "wartet_auf_freigabe", versorgungText: "Teleskop-HKP", kiefer: "OK", erstellt: "2026-10-06T10:00:00Z" };
t("Doppelung steht als Hinweis in der Vorschau, mit Angebot zum Verwerfen", () => {
  const s = doppelungHinweis([alt]);
  assert.match(s, /schon einen Teleskop-HKP im Oberkiefer/);
  assert.match(s, /alten verwerfen/);
  assert.match(doppelungHinweis([alt], true), /verwerfe ich dabei/);
  assert.doesNotMatch(doppelungHinweis([{ ...alt, status: "freigegeben" }]), /verwerfen/);
});
t("Vorschau nennt die Zahlen und die Doppelung vor der Frage", () => {
  const s = vorleseSatz({
    patient: abel, versorgungText: "Brücken-HKP", kiefer: ["OK"], zaehne: { 15: { B: "f" } },
    versorgung: "Kronen auf 14", summen: "Gesamtkosten eins Euro", doppelt: "Achtung, es gibt schon einen.",
  });
  assert.match(s, /Voraussichtlich Gesamtkosten eins Euro\. Achtung, es gibt schon einen\. Soll ich den Entwurf so anlegen\?$/);
});
t("Bruecke wird als Bruecke vorgelesen", () => {
  assert.equal(versorgungSatz({ kronen: ["16", "14"], ersetzt: ["15"], glieder: ["15"] }), "Brückenanker-Kronen auf 14 und 16, Brückenglied 15");
  assert.equal(versorgungSatz({ teleskope: ["14", "24"], ersetzt: ["17"] }), "Teleskope auf 14 und 24, ein ersetzter Zahn");
});
t("Implantatkronen werden als Implantatkronen vorgelesen (06.10. Greisinger)", () => {
  assert.equal(versorgungSatz({ implantatkronen: ["15", "14"], kronen: [], ersetzt: [] }), "Implantatkronen auf 14 und 15");
});

t("Namensvetter: genaue Schreibweise in der Antwort waehlt, der Auftragsname nicht", () => {
  const offen = { kandidaten: [
    { id: "a", firstName: "Michael", lastName: "Petzas" },
    { id: "b", firstName: "Michael", lastName: "Petsas", birthDate: "1972-01-01" },
  ] };
  assert.equal(vetterAntwort(offen, "Petsas. Michael Petzers", "Petsas.").wahl?.id, "b");
  assert.ok(vetterAntwort(offen, " Michael Petzas", "").erneut);
  assert.equal(vetterAntwort(offen, "den ersten", "den ersten").wahl?.id, "a");
});

console.log(`hkpDialog: ${ok} Tests ok`);
