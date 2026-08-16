/**
 * Prueft die unscharfe Namensauflösung gegen ECHTE Fehlfaelle aus Anrufen.
 *
 * Jeder Fall unten ist live passiert: der Chef sagte etwas, das STT lieferte
 * eine Verstuemmelung, die woertliche Suche fand nichts und Clara meldete
 * "kein Patient gefunden" -- teils in Endlosschleife.
 *
 * Aufruf:  node backend/scripts/test-name-phonetik.mjs
 */
import {
  koelnerPhonetik,
  namensAehnlichkeit,
  teilAehnlichkeit,
  findeNamensKandidaten,
  loeseNamenAuf,
} from "../src/shared/namePhonetik.js";

let fehler = 0;
const pruef = (titel, bedingung, hinweis = "") => {
  if (bedingung) {
    console.log(`PASS  ${titel}`);
  } else {
    fehler++;
    console.log(`FAIL  ${titel}${hinweis ? `\n      -> ${hinweis}` : ""}`);
  }
};

// ---------------------------------------------------------------------------
// 1) Klanggleiche deutsche Schreibvarianten
// ---------------------------------------------------------------------------
console.log("=== 1) Klanggleiche Varianten ergeben denselben Code ===");
const meyerCodes = ["Meyer", "Maier", "Mayer", "Meier"].map(koelnerPhonetik);
pruef(`Meyer/Maier/Mayer/Meier -> ${meyerCodes[0]}`,
  new Set(meyerCodes).size === 1,
  `bekommen: ${meyerCodes.join(", ")}`);

for (const [a, b] of [
  ["Schmidt", "Schmitt"],
  ["Kaufmann", "Kaufman"],
  ["Petsas", "Petzas"],
  ["Tzannis", "Zannis"],
  ["Mueller", "Müller"],
  ["Krueger", "Krüger"],
]) {
  pruef(`${a} klingt wie ${b}`,
    koelnerPhonetik(a) === koelnerPhonetik(b),
    `${a}=${koelnerPhonetik(a)}  ${b}=${koelnerPhonetik(b)}`);
}

// Schmidt/Schmid unterscheiden sich in der Kölner Phonetik WIRKLICH (das
// Schluss-T traegt einen eigenen Code: 8628 vs 868). Das ist kein Fehler des
// Verfahrens -- die unscharfe Stufe muss sie trotzdem zusammenbringen.
pruef("Schmid und Schmidt sind sich sehr aehnlich (nicht klanggleich)",
  teilAehnlichkeit("Schmidt", "Schmid") >= 0.7
  && koelnerPhonetik("Schmidt") !== koelnerPhonetik("Schmid"),
  `Aehnlichkeit ${teilAehnlichkeit("Schmidt", "Schmid").toFixed(2)}, `
  + `Codes ${koelnerPhonetik("Schmidt")} / ${koelnerPhonetik("Schmid")}`);

console.log("\n=== 2) Verschiedene Namen bleiben verschieden ===");
for (const [a, b] of [
  ["Meyer", "Bauer"],
  ["Schmidt", "Fischer"],
  ["Tzannis", "Petsas"],
  ["Thrandorf", "Kaufmann"],
]) {
  pruef(`${a} != ${b}`, koelnerPhonetik(a) !== koelnerPhonetik(b),
    `beide ergaben ${koelnerPhonetik(a)}`);
}

// ---------------------------------------------------------------------------
// 3) Die echten Fehlfaelle: gesprochen -> Kartei
// ---------------------------------------------------------------------------
// Eine nachgebaute Kartei mit den echten Namen dieser Praxis plus Streuung,
// damit ein Treffer etwas bedeutet (nicht "einziger Eintrag gewinnt").
const KARTEI = [
  { id: "p1", vorname: "Nicole", nachname: "Thrandorf" },
  { id: "p2", vorname: "Peter", nachname: "Maier" },
  { id: "p3", vorname: "Haila", nachname: "El-Otmani" },
  { id: "p4", vorname: "Georgios", nachname: "Tzannis" },
  { id: "p5", vorname: "Denise", nachname: "Röther" },
  { id: "p6", vorname: "Sarah", nachname: "Muffarei" },
  { id: "p7", vorname: "Calvin", nachname: "Uhrich" },
  { id: "p8", vorname: "Achim", nachname: "Deutscher" },
  { id: "p9", vorname: "Ilias", nachname: "El Hajjami" },
  { id: "p10", vorname: "Ahlam", nachname: "El Mouhmouh" },
  { id: "p11", vorname: "Wafa", nachname: "El-Hayami" },
  { id: "p12", vorname: "Stefan", nachname: "Meier" },
  { id: "p13", vorname: "Marcel", nachname: "Krüger" },
  { id: "p14", vorname: "Christine", nachname: "Kiriakos-Zandes" },
  { id: "p15", vorname: "Maria", nachname: "Tzannis" },
];

console.log("\n=== 3) Echte Fehlfaelle aus Anrufen ===");
const FAELLE = [
  // [gesprochen (so wie das STT es lieferte), erwartete id, Quelle]
  ["Peter Meyer", "p2", "31.07. 'Termin von Peter Meyer loeschen'"],
  ["Transauer", "p1", "24.06. 'Kontaktkarte von Frau Transauer'"],
  ["Frau Transauer", "p1", "24.06. mit Anrede"],
  ["Hayla Ottmann", "p3", "04.08. 'such mal nach Hayla Ottmann'"],
  ["Heyla Otmani", "p3", "04.08. 'Kontaktkarte Heyla Otmani'"],
  ["Haila El-Otmani", "p3", "17.07. korrekt gesprochen"],
  ["Otmani", "p3", "04.08. 'der Nachname ist Ottmani'"],
  ["Tzannis", "p4", "16.08. buchstabiert"],
  ["Sarah Muffarei", "p6", "10.07. 'Termin von Sarah Muffarei'"],
  ["Denise Röther", "p5", "24.06. 'Kontaktkarte von Denise Roether'"],
  ["Marcel Krueger", "p13", "15.06. 'E-Mail von Marcel Krueger'"],
  ["Stefan Maier", "p12", "Variante zum Gegentest Maier/Meier"],
];

for (const [gesprochen, erwartet, quelle] of FAELLE) {
  const kandidaten = findeNamensKandidaten(gesprochen, KARTEI);
  const bester = kandidaten[0];
  const ok = bester && bester.eintrag.id === erwartet;
  const gefunden = bester
    ? `${bester.eintrag.vorname} ${bester.eintrag.nachname} (${bester.wert.toFixed(2)})`
    : "NICHTS";
  pruef(`"${gesprochen}" -> ${erwartet}   [${quelle}]`, ok,
    `bekommen: ${gefunden}; Liste: ${kandidaten.map(
      (k) => `${k.eintrag.nachname}=${k.wert.toFixed(2)}`).join(", ") || "leer"}`);
}

// ---------------------------------------------------------------------------
// 4) Mehrdeutigkeit muss als Liste erkennbar sein, nicht geraten werden
// ---------------------------------------------------------------------------
console.log("\n=== 4) Mehrdeutigkeit ===");
const zwei = findeNamensKandidaten("Tzannis", KARTEI);
pruef("Tzannis liefert beide Traeger (Georgios + Maria)",
  zwei.filter((k) => k.eintrag.nachname === "Tzannis").length === 2,
  `bekommen: ${zwei.map((k) => k.eintrag.vorname).join(", ")}`);

const meierListe = findeNamensKandidaten("Meier", KARTEI);
pruef("Meier findet Maier UND Meier",
  meierListe.some((k) => k.eintrag.id === "p2")
  && meierListe.some((k) => k.eintrag.id === "p12"),
  `bekommen: ${meierListe.map((k) => `${k.eintrag.vorname} ${k.eintrag.nachname}`).join(", ")}`);

// ---------------------------------------------------------------------------
// 5) Kein Raten: fremde Namen ergeben KEINEN sicheren Treffer
// ---------------------------------------------------------------------------
// Das ist die wichtigere Haelfte. Eine unscharfe Suche, die selbstsicher immer
// irgendetwas liefert, laesst Lisa die falsche Person anrufen.
console.log("\n=== 5) Kein Raten bei fremden Namen ===");
for (const fremd of [
  "Wolfgang Schnellinger",
  "Bartholomäus Findelkind",
  "Kontaktkarte",
  "Heyla Money",       // von Clara selbst erfundener Name (04.08.)
  "Vornabe",           // STT-Muell (25.07.)
]) {
  const urteil = loeseNamenAuf(fremd, KARTEI);
  pruef(`"${fremd}" -> nicht eindeutig`, urteil.art !== "eindeutig",
    `bekommen: ${urteil.art} ${urteil.eintrag
      ? `${urteil.eintrag.vorname} ${urteil.eintrag.nachname}` : ""}`);
}

// ---------------------------------------------------------------------------
// 5b) Die entscheidende Trennung: handeln vs. fragen
// ---------------------------------------------------------------------------
// Gemessen: "Transauer" -> Thrandorf 0.567 (RICHTIG), "Heyla Money" ->
// El Mouhmouh 0.737 (FALSCH). Der falsche Wert ist HOEHER. Deshalb entscheidet
// nicht die Zahl allein, sondern die Stufe -- und beide landen als RUECKFRAGE.
console.log("\n=== 5b) Handeln nur bei Eindeutigkeit ===");
const klar = loeseNamenAuf("Peter Meyer", KARTEI);
pruef("klarer Fall ist eindeutig (Meyer -> Maier)",
  klar.art === "eindeutig" && klar.eintrag.id === "p2",
  `bekommen: ${klar.art}`);

const schwach = loeseNamenAuf("Transauer", KARTEI);
pruef("schwacher, aber richtiger Fall wird zur Rueckfrage",
  schwach.art === "mehrdeutig"
  && schwach.kandidaten.some((k) => k.eintrag.id === "p1"),
  `bekommen: ${schwach.art}; Kandidaten: ${schwach.kandidaten.map(
    (k) => `${k.eintrag.nachname}=${k.wert.toFixed(2)}`).join(", ")}`);

const anrede = loeseNamenAuf("Frau Transauer", KARTEI);
pruef("Anrede stoert die Auflösung nicht",
  anrede.kandidaten.some((k) => k.eintrag.id === "p1"),
  `bekommen: ${anrede.art}; Kandidaten: ${anrede.kandidaten.map(
    (k) => `${k.eintrag.nachname}=${k.wert.toFixed(2)}`).join(", ")}`);

const erfunden = loeseNamenAuf("Heyla Money", KARTEI);
pruef("erfundener Name loest NIE eine Handlung aus",
  erfunden.art !== "eindeutig",
  `bekommen: ${erfunden.art}`);

const mehrfach = loeseNamenAuf("Tzannis", KARTEI);
pruef("zwei Namensträger -> Rueckfrage statt Raten",
  mehrfach.art === "mehrdeutig" && mehrfach.kandidaten.length >= 2,
  `bekommen: ${mehrfach.art}, ${mehrfach.kandidaten.length} Kandidaten`);

// ---------------------------------------------------------------------------
// 6) Robustheit
// ---------------------------------------------------------------------------
console.log("\n=== 6) Robustheit ===");
pruef("leere Eingabe stuerzt nicht ab", findeNamensKandidaten("", KARTEI).length === 0);
pruef("leere Kartei stuerzt nicht ab", findeNamensKandidaten("Meier", []).length === 0);
pruef("null-Kartei stuerzt nicht ab", findeNamensKandidaten("Meier", null).length === 0);
pruef("Code fuer leeren Namen ist leer", koelnerPhonetik("") === "");
pruef("Sonderzeichen allein ergeben nichts", koelnerPhonetik("...") === "");
pruef("Aehnlichkeit ohne Felder ist 0",
  namensAehnlichkeit("Meier", { vorname: "", nachname: "" }) === 0);

console.log();
if (fehler) {
  console.log(`FEHLGESCHLAGEN: ${fehler} Pruefung(en)`);
  process.exit(1);
}
console.log("Alle Pruefungen zur Namensauflösung bestanden.");
