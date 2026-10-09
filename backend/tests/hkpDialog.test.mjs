// HKP-Dialog per Sprache: Ja auf die Vorschau, Zahlen und Doppelung im Vorlesen, Bruecken (Gespraeche 06.10.2026).
// Start: node backend/tests/hkpDialog.test.mjs
import assert from "node:assert/strict";
const { vorschauPasst, vorschauFinden, doppelungHinweis, vetterAntwort, sindVettern, waehleHkp, vorschauGemeint } = await import("../src/routes/hkp.js");
const { nameAusHinweis, spokenLooksLikeNewPerson } = await import("../src/clara/patientCatalog.js");
const { vorleseSatz, befundSatz } = await import("../src/hkp/vorlesen.js");
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

t("Befund: zwei Zaehne im selben Quadranten aufsteigend", () => {
  assert.match(befundSatz({ 14: "f", 15: "f" }, ["OK"]), /es fehlen 14 und 15;/);
  assert.match(befundSatz({ 11: "f", 21: "f" }, ["OK"]), /es fehlen 11 und 21;/);
});

t("Namensvetter: genaue Schreibweise in der Antwort waehlt, der Auftragsname nicht", () => {
  const offen = { kandidaten: [
    { id: "a", firstName: "Michael", lastName: "Petzas" },
    { id: "b", firstName: "Michael", lastName: "Petsas", birthDate: "1972-01-01" },
  ] };
  assert.equal(vetterAntwort(offen, "Petsas. Michael Petzers", "Petsas.").wahl?.id, "b");
  assert.ok(vetterAntwort(offen, " Michael Petzas", "").erneut);
  assert.equal(vetterAntwort(offen, "den ersten", "den ersten").wahl?.id, "a");
  // Live 06.10.2026 17:23: "Nein, erstens, erstens."
  assert.equal(vetterAntwort(offen, "erstens, erstens.", "erstens, erstens.").wahl?.id, "a");
  assert.equal(vetterAntwort(offen, "Zweitens.", "Zweitens.").wahl?.id, "b");
  assert.equal(vetterAntwort(offen, "Eins.", "Eins.").wahl?.id, "a");
  // "zwei" im Satz ist eine Menge, keine Wahl
  assert.notEqual(vetterAntwort(offen, "Zwei Kronen auf 36 und 37 Michael Petzas", "Zwei Kronen auf 36 und 37")?.wahl?.id, "b");
});

t("Namensvetter: Vorname muss wirklich gleich sein (Tzannis/Zannas 06.10. 17:22)", () => {
  const p = (id, firstName, lastName) => ({ id, firstName, lastName });
  assert.equal(sindVettern(p("a", "Kiriakos", "Tzannis"), p("b", "Georgios", "Zannas")), false);
  assert.equal(sindVettern(p("a", "Michael", "Petsas"), p("b", "Michael", "Petzas")), true);
  assert.equal(sindVettern(p("a", "Kyriakos", "Tzannis"), p("b", "Kiriakos", "Tzanis")), true);
  assert.equal(sindVettern(p("a", "Christina", "Meier"), p("b", "Kristina", "Meyer")), true);
  assert.equal(sindVettern(p("a", "Anna", "Petsas"), p("b", "Michael", "Petzas")), false);
  process.env.MAS_HKP_VETTER_VORNAME = "0";
  assert.equal(sindVettern(p("a", "Kiriakos", "Tzannis"), p("b", "Georgios", "Zannas")), true);
  delete process.env.MAS_HKP_VETTER_VORNAME;
});

t("Hinweis-Satz ohne Namen ist keine neue Person (Ellen Amoyan 06.10. 17:22)", () => {
  const satz = "Ja, ich möchte einen heilen Kostenplan erstellen für den Patienten.";
  assert.equal(nameAusHinweis(satz), "");
  assert.equal(spokenLooksLikeNewPerson(satz, [{ firstName: "Kiriakos", lastName: "Tzannis" }]), false);
  assert.equal(nameAusHinweis("Nein, ich meinte Frau Muhamedjanowa von gestern"), "Muhamedjanowa");
  assert.equal(nameAusHinweis("Nein, nicht der, sondern Kiriakos Tzannis bitte"), "Kiriakos Tzannis");
  assert.equal(nameAusHinweis("Muhamedjanowa"), "Muhamedjanowa");
  assert.equal(spokenLooksLikeNewPerson("Nein, ich meinte Frau Muhamedjanowa von gestern",
    [{ firstName: "Amofa", lastName: "Karadavut" }]), true);
});

t("'Lies mir den Teleskop-HKP vor' waehlt unter mehreren nach Versorgungsart", () => {
  const hkps = [
    { id: "b", versorgungText: "Brücken-HKP", kiefer: "OK", status: "wartet_auf_freigabe" },
    { id: "t", versorgungText: "Teleskop-HKP", kiefer: "OK", status: "genehmigt" },
  ];
  assert.equal(waehleHkp(hkps, "Lies mir den Teleskop-HKP bitte vor.")?.id, "t");
  assert.equal(waehleHkp(hkps, "Lies mir die Brücke vor.")?.id, "b");
  assert.equal(waehleHkp(hkps, "Lies mir den Implantat-HKP vor."), null);
  assert.equal(waehleHkp(hkps, "Was steht im HKP?"), null);
});

t("offener Entwurf verdraengt den verlangten echten HKP nicht", () => {
  const vs = { versorgungText: "Brücken-HKP", at: 1000 };
  assert.equal(vorschauGemeint(vs, "", null), true);
  assert.equal(vorschauGemeint(vs, "Wie hoch ist der Festzuschuss?", { at: 500 }), true);
  assert.equal(vorschauGemeint(vs, "Lies mir den Teleskop-HKP bitte vor.", null), false);
  assert.equal(vorschauGemeint(vs, "Lies mir die Brücke vor.", null), true);
  assert.equal(vorschauGemeint(vs, "", { at: 2000 }), false);
  process.env.MAS_HKP_VORSCHAU_VORRANG = "0";
  assert.equal(vorschauGemeint(vs, "Lies mir den Teleskop-HKP bitte vor.", { at: 2000 }), true);
  delete process.env.MAS_HKP_VORSCHAU_VORRANG;
});

const { ausfuehrungFehlt, ausfuehrungFrage, ausfuehrungRueckfrage, implantatStandard, annahmenSatz } = await import("../src/routes/hkp.js");
const { detailSatz } = await import("../src/hkp/sprech.js");
const E = await import("../src/vendor/hkp-engine.mjs");
const BRUECKE = "Brücke von 14 auf 17 mit 15 und 16 als Brückenglied";
const entwurf = (text, befund = { 15: "f", 16: "f" }) => E.hkpEntwurf(text, befund, { implantatSystem: "medentis-icx" });

t("Ausfuehrung: fehlende Angaben je Versorgung (Chef 06.10.2026 20:15)", () => {
  const b = entwurf(BRUECKE);
  assert.deepEqual(ausfuehrungFehlt(E.auftragVerstehen(BRUECKE), b.zusammenfassung), ["werkstoff", "abformung", "labor"]);
  const voll = `${BRUECKE}. Zirkon, Intraoralscan, Eigenlabor`;
  assert.deepEqual(ausfuehrungFehlt(E.auftragVerstehen(voll), entwurf(voll).zusammenfassung), []);
  const impl = "Implantatkronen auf 14 und 15";
  assert.deepEqual(ausfuehrungFehlt(E.auftragVerstehen(impl), entwurf(impl, { 14: "f", 15: "f" }).zusammenfassung),
    ["werkstoff", "abformung", "labor", "implantatSystem"]);
  const total = "Totalprothese im Oberkiefer";
  assert.deepEqual(ausfuehrungFehlt(E.auftragVerstehen(total), entwurf(total, {}).zusammenfassung), ["labor"]);
});
t("Ausfuehrung: eine Frage mit allen offenen Punkten, Implantat-Standard medentis ICX", () => {
  assert.equal(implantatStandard({}), "medentis-icx");
  assert.equal(implantatStandard({ einstellungen: { implantatSystem: "camlog" } }), "camlog");
  const f = ausfuehrungFrage(["werkstoff", "abformung", "labor", "implantatSystem"], { system: "medentis-icx" });
  assert.equal(f, "Noch zur Ausführung: Welches Material – Nichtedelmetall, Zirkon, Presskeramik oder Gold? Intraoralscan oder konventioneller Abdruck? Eigenlabor oder Fremdlabor? Implantatsystem wie üblich medentis ICX oder ein anderes?");
  assert.match(ausfuehrungFrage(["werkstoff"], { nurTeleskope: true }), /Teleskope in Nichtedelmetall oder Gold\?/);
});
t("Ausfuehrung: je Patient nur EINMAL gefragt, 'wie immer' fragt nicht", () => {
  const p = { id: "ausf-1", label: "Test" };
  const b = entwurf(BRUECKE);
  const a = E.auftragVerstehen(BRUECKE);
  assert.equal(ausfuehrungRueckfrage("c1", p, BRUECKE, a, b, "medentis-icx")?.rueckfrage, "ausfuehrung");
  assert.equal(ausfuehrungRueckfrage("c1", p, `${BRUECKE}. Zirkon`, a, b, "medentis-icx"), null);
  assert.equal(ausfuehrungRueckfrage("c1", { id: "ausf-2" }, `${BRUECKE}, wie immer`, a, b, "medentis-icx"), null);
  process.env.MAS_HKP_AUSFUEHRUNG_FRAGE = "0";
  assert.equal(ausfuehrungRueckfrage("c1", { id: "ausf-3" }, BRUECKE, a, b, "medentis-icx"), null);
  delete process.env.MAS_HKP_AUSFUEHRUNG_FRAGE;
});
t("Ausfuehrung steht in Vorschau und Vorlesen; Annahmen nicht doppelt", () => {
  const s = vorleseSatz({ patient: abel, versorgungText: "Brücken-HKP", kiefer: ["OK"], zaehne: {}, versorgung: "Kronen auf 14",
    ausfuehrung: "Zirkon, Intraoralscan, Eigenlabor", summen: "Gesamtkosten eins Euro" });
  assert.match(s, /Geplant: Kronen auf 14\. Ausführung: Zirkon, Intraoralscan, Eigenlabor\. Voraussichtlich/);
  const b = entwurf(BRUECKE);
  assert.match(annahmenSatz(b.hinweise, b.zusammenfassung.warnungen), /konventioneller Abdruck/);
  assert.doesNotMatch(annahmenSatz(b.hinweise, b.zusammenfassung.warnungen, { ausfuehrungGesagt: true }), /Abdruck|Nichtedelmetall/);
  const d = detailSatz({ versorgungText: "Brücken-HKP", kiefer: "OK", patient: { label: "Herrn Tzannis" }, status: "wartet_auf_freigabe",
    erstellt: "2026-10-06T18:00:00Z", zusammenfassung: { kronen: ["14", "17"], glieder: ["15", "16"], ersetzt: ["15", "16"] } }, "Zirkon, Abdruck");
  assert.match(d, /Geplant: [^.]+\. Ausführung: Zirkon, Abdruck\./);
});
t("Ja auf die Vorschau gilt nicht, wenn sich die Ausfuehrung unterscheidet", () => {
  assert.equal(vorschauPasst(vs(`${BRUECKE}. Eigenlabor`), { auftrag: `${BRUECKE}. Fremdlabor` }), false);
  assert.equal(vorschauPasst(vs(`${BRUECKE}. Zirkon statt NEM`), { auftrag: `${BRUECKE}, nicht NEM, Zirkon` }), true);
  assert.equal(vorschauPasst(vs("Implantatkronen auf 14 und 15, Straumann"), { auftrag: "Implantatkronen auf 14 und 15, Camlog" }), false);
});
t("Ausfuehrung eines gespeicherten Plans aendern: Vorschlag mit neuen Summen", () => {
  const b = entwurf(BRUECKE);
  const e = E.ausfuehrungAendern(b.plan, E.ausfuehrungIn("Ich möchte bitte, dass du Zirkon nimmst"));
  assert.equal(e.ok, true);
  assert.equal(e.beschreibung, "Zirkon statt Nichtedelmetall");
  assert.notEqual(e.nachher.gesamt, e.vorher.gesamt);
  assert.equal(E.ausfuehrungAendern(b.plan, E.ausfuehrungIn("Wie spät ist es?")).grund, "nichts");
});

const { befundDateiBauen } = await import("../src/routes/hkp.js");
t("diktierter Befund wird Datei mit KZBV-Kuerzeln (Chef 09.10.2026)", () => {
  const befundDiktat = "15 und 16 fehlen, 17 ist erneuerungsbedürftig";
  const r = entwurf(BRUECKE, { 15: "f", 16: "f", 17: "kw" });
  const d = { befund: { quelle: { art: "gesprochen" } }, befundDiktat, auftrag: { kiefer: "OK" }, r };
  const datei = befundDateiBauen("h1", d);
  assert.equal(datei.id, "befund");
  assert.equal(datei.typ, "application/json");
  const j = JSON.parse(datei.inhalt);
  assert.equal(j.format, "planr-zahnbefund");
  assert.equal(j.quelle.diktat, befundDiktat);
  assert.deepEqual(j.zaehne.filter((z) => z.diktiert).map((z) => `${z.zahn}:${z.kuerzel}`), ["17:kw", "16:f", "15:f"]);
  assert.equal(j.legende.kw, "erneuerungsbedürftige Krone");
});
t("Befund nur aus Lena-01 wird genauso Datei, ohne Diktat", () => {
  const r = entwurf(BRUECKE, { 15: "f", 16: "f", 17: "kw" });
  const quelle = { art: "lena01", datum: "2026-09-01T10:00:00.000Z", appointmentId: "a1" };
  const j = JSON.parse(befundDateiBauen("h1", { befund: { quelle }, befundDiktat: "15 fehlt", auftrag: { kiefer: "OK" }, r }).inhalt);
  assert.deepEqual(j.quelle, { ...quelle, diktat: "" });
  assert.deepEqual(j.zaehne.map((z) => `${z.zahn}:${z.kuerzel}`).filter((x) => /^1[5-7]/.test(x)), ["17:kw", "16:f", "15:f"]);
  assert.equal(j.zaehne.some((z) => z.diktiert), false);
});
t("keine Befund-Datei ohne jeden Befund (Totalprothese) oder mit Notaus", () => {
  const r = entwurf(BRUECKE);
  assert.equal(befundDateiBauen("h1", { befund: { quelle: { art: "keiner" } }, befundDiktat: "", r }), null);
  process.env.MAS_HKP_BEFUND_DATEI = "0";
  assert.equal(befundDateiBauen("h1", { befund: { quelle: { art: "gesprochen" } }, befundDiktat: "15 fehlt", r }), null);
  delete process.env.MAS_HKP_BEFUND_DATEI;
});

console.log(`hkpDialog: ${ok} Tests ok`);
