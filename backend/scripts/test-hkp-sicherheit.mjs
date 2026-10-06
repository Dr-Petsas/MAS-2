// HKP-Anlage nur auf den richtigen Patienten und mit vorgelesenem, bestaetigtem
// Befund (Chef 06.10.2026: HKP landete auf der Dublette "Michael Petzas").
import "dotenv/config";
import { befundErmitteln } from "../src/hkp/befundQuelle.js";
import { befundSatz, geburtSprech, jahrgangWahl, vetternFrage, vorleseSatz, zahnBereiche } from "../src/hkp/vorlesen.js";
import { bestePassung, sindVettern, vetterAntwort, vetterSchonGewaehlt, vorschauPasst } from "../src/routes/hkp.js";
import { eintraegeNachtragen } from "../src/clara/patientCatalog.js";

let fehler = 0;
function check(name, ok, info = "") {
  console.log(`${ok ? "OK  " : "FEHL"} ${name}${info ? ` - ${info}` : ""}`);
  if (!ok) fehler += 1;
}

const PETSAS = { id: "neu", firstName: "Michael", lastName: "Petsas", birthDate: "1968-03-14", gender: "male" };
const PETZAS = { id: "alt", firstName: "Michael", lastName: "Petzas", birthDate: null, createdAt: "2024-10-16T10:32:52.035Z" };
const PETERS = { id: "x", firstName: "Michael", lastName: "Peters", birthDate: "1980-01-01" };
const ANNA = { id: "y", firstName: "Anna", lastName: "Petsas", birthDate: "1975-01-01" };

// --- Namensvettern ---
check("Vettern: Petsas/Petzas", sindVettern(PETSAS, PETZAS) && sindVettern(PETZAS, PETSAS));
check("Vettern: Peters ist kein Vetter", !sindVettern(PETSAS, PETERS));
check("Vettern: anderer Vorname ist kein Vetter", !sindVettern(PETSAS, ANNA));
check("Vettern: derselbe Datensatz ist kein Vetter", !sindVettern(PETSAS, { ...PETSAS }));
check("Beste Passung: genaue Schreibung gewinnt", JSON.stringify(bestePassung("Michael Petsas", [PETZAS, PETSAS]).map((p) => p.id)) === '["neu"]');
const hoerfehler = bestePassung("Michael Petzers", [PETZAS, PETSAS]);
check("Beste Passung: Hoerfehler trifft die Dublette, die Vetter-Pruefung faengt sie",
  hoerfehler.length === 1 && hoerfehler[0].id === "alt" && sindVettern(hoerfehler[0], PETSAS));

const offen = { kandidaten: [PETSAS, PETZAS], at: Date.now() };
check("Antwort: der erste", vetterAntwort(offen, "der erste")?.wahl?.id === "neu");
check("Antwort: der zweite", vetterAntwort(offen, "Den zweiten bitte")?.wahl?.id === "alt");
check("Antwort: Jahrgang", vetterAntwort(offen, "Der von 1968")?.wahl?.id === "neu");
check("Antwort: Jahrgang zweistellig", vetterAntwort(offen, "Jahrgang 68")?.wahl?.id === "neu");
check("Antwort: ohne Geburtsdatum", vetterAntwort(offen, "der ohne Geburtsdatum")?.wahl?.id === "alt");
check("Antwort: genaue Schreibweise waehlt (Vorlesen mit Geburtsdatum folgt)", vetterAntwort(offen, "Michael Petsas")?.wahl?.id === "neu");
check("Antwort: nur gleich klingender Name -> erneut fragen", !!vetterAntwort(offen, "Michael Petzers")?.erneut);
check("Antwort: ganz anderer Name -> neue Suche", vetterAntwort(offen, "Hans Mueller") === null);
check("Jahrgang passt auf keinen -> keine Wahl", jahrgangWahl("von 1990", [PETSAS, PETZAS]) === null);
const wahl = { id: PETSAS.id, at: Date.now() };
check("Wahl gilt fuer den Folgeschritt (keine zweite Vetter-Frage)", vetterSchonGewaehlt(wahl, PETSAS));
check("Wahl gilt nicht fuer den anderen Datensatz", !vetterSchonGewaehlt(wahl, PETZAS));
check("Wahl verfaellt nach 10 min", !vetterSchonGewaehlt(wahl, PETSAS, Date.now() + 11 * 60 * 1000));

const frage = vetternFrage([PETSAS, PETZAS]);
check("Rueckfrage nennt Jahrgang und fehlendes Geburtsdatum",
  frage.includes("Jahrgang neunzehnhundertachtundsechzig") && frage.includes("ohne Geburtsdatum") && frage.includes("Welchen meinen Sie?"), frage);

// --- Vorlesen ---
const zaehne = Object.fromEntries(["14", "15", "16", "17", "18", "24", "25", "26", "27", "28"].map((z) => [z, { B: "f" }]));
check("Bereiche: 14 bis 18, 13 bis 23", JSON.stringify(zahnBereiche(["13", "12", "11", "21", "22", "23"], "OK")) === '["13 bis 23"]'
  && JSON.stringify(zahnBereiche(["18", "17", "16", "15", "14"], "OK")) === '["14 bis 18"]');
const bs = befundSatz(zaehne, ["OK"]);
check("Befundsatz: fehlend und vorhanden vollstaendig", bs === "Oberkiefer: es fehlen 14 bis 18 und 24 bis 28; vorhanden: 13 bis 23.", bs);
const uk = befundSatz({ 36: { B: "k" }, 37: { B: "x" }, 46: { B: "f" } }, ["UK"]);
check("Befundsatz: Krone und nicht erhaltungswuerdig", uk.includes("es fehlt 46") && uk.includes("nicht erhaltungswürdig: 37") && uk.includes("überkront: 36"), uk);
check("Befundsatz: zahnlos", befundSatz({}, ["OK"]) === "Oberkiefer: alle Zähne vorhanden."
  && befundSatz(Object.fromEntries(["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"].map((z) => [z, "f"])), ["OK"]) === "Oberkiefer: alle Zähne fehlen.");
check("Geburtsdatum gesprochen", geburtSprech("1968-03-14") === "geboren am vierzehnten März neunzehnhundertachtundsechzig");
check("Geburtsdatum fehlt -> gesagt", geburtSprech(null) === "in der Kartei ohne Geburtsdatum");
const v = vorleseSatz({
  patient: { ...PETSAS, anredeLabel: "Herrn Petsas" }, versorgungText: "Teleskop-HKP", kiefer: ["OK"], zaehne,
  versorgung: "Teleskope auf 13 und 23, 8 ersetzte Zähne",
});
check("Vorlesen: Patient, Geburtsdatum, Befund, Versorgung, Frage",
  v.startsWith("Bevor ich anlege") && v.includes("Herrn Michael Petsas, geboren am vierzehnten März") && v.includes("es fehlen 14 bis 18 und 24 bis 28")
  && v.includes("Teleskope auf 13 und 23") && v.endsWith("Soll ich den Entwurf so anlegen?"), v);

// --- Bestaetigung gilt nur der offenen Vorschau ---
const vs = { patient: PETSAS, auftragText: "Im Oberkiefer fehlen 14 bis 18. Teleskope auf 13 und 23.", at: Date.now() };
check("Vorschau: Ja ohne Argumente", vorschauPasst(vs, {}));
check("Vorschau: gleicher Name und Auftrag", vorschauPasst(vs, { name: "Herrn Petsas", auftrag: vs.auftragText }));
check("Vorschau: anderer Patient -> neu", !vorschauPasst(vs, { name: "Hans Mueller" }));
check("Vorschau: neuer Auftragsinhalt -> neu vorlesen", !vorschauPasst(vs, { auftrag: `${vs.auftragText} Und 26 ist doch vorhanden.` }));
check("Vorschau: abgelaufen", !vorschauPasst({ ...vs, at: Date.now() - 11 * 60 * 1000 }, {}));
check("Vorschau: keine offen", !vorschauPasst(null, {}));

// --- Befund aufnehmen ---
const ohne = await befundErmitteln("zzz-mas2-hkp-sicher", { id: "p", label: "Hans Meier" }, { kiefer: "OK", lena: async () => null, pvs: async () => null });
check("Kein Befund: Rueckfrage nimmt den Kiefer komplett auf",
  !ohne.ok && ohne.grund === "befund_fehlt" && ohne.frage.includes("im Oberkiefer") && ohne.frage.includes("überkront") && ohne.frage.includes("zur Kontrolle vor"), ohne.frage);

// --- Katalog: neu angelegte Patienten ---
const eintraege = [{ i: "alt", f: "Michael", l: "Petzas" }];
check("Katalog: neuer Patient wird nachgetragen", eintraegeNachtragen(eintraege, [{ i: "neu", f: "Michael", l: "Petsas" }]) && eintraege.length === 2);
check("Katalog: bekannter Patient unveraendert", !eintraegeNachtragen(eintraege, [{ i: "neu", f: "Michael", l: "Petsas" }]) && eintraege.length === 2);
check("Katalog: Umbenennung uebernommen", eintraegeNachtragen(eintraege, [{ i: "alt", f: "Michael", l: "Petsas" }]) && eintraege[0].l === "Petsas");

console.log(fehler ? `\n${fehler} Fehler` : "\nAlles gruen");
process.exit(fehler ? 1 : 0);
