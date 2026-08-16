// Test des Namenskatalogs: findet er Doppelnamen, die der Plattform-Index
// nicht kennt — und haelt er die Namensteilchen-Flut zurueck?
//
// Anlass (Live-Anruf Dr. Petsas 04.08.2026): "Ouafa El Hajjami" war NICHT
// auffindbar — weder ganz noch ueber "El Hajjami" oder "Hajjami". Grund: die
// Plattform legt nur Anfangsstuecke des GANZEN Nachnamens ab ("el hajjami",
// ..., "el"), das Wort "hajjami" existiert dort nie. Clara bot daraufhin
// endlos falsche "El"-Treffer an.
//
// Aufruf: node backend/tests/test-patient-catalog.mjs

import {
  nameTokens, isMeaningful, entryCodes, buildIndex, catalogMatch, PARTICLES,
  spokenLooksLikeNewPerson,
} from "../src/clara/patientCatalog.js";

let ok = 0;
let fail = 0;
function check(name, cond, info = "") {
  if (cond) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

// Eine kleine, realistische Praxis — inklusive der Stolperfaelle aus echten
// Anrufen (Doppelnamen, Namensvettern, gleich klingende Namen).
const praxis = [
  { i: "p1", f: "Ouafa", l: "El Hajjami" },
  { i: "p2", f: "Hassana", l: "El Makhoukhi" },
  { i: "p3", f: "Youssef", l: "El Amrani" },
  { i: "p4", f: "Karim", l: "El Amrani" },
  { i: "p5", f: "Xenofon", l: "Thermos" },
  { i: "p6", f: "Nadine", l: "Thermos" },
  { i: "p7", f: "Levi", l: "Tzannis" },
  { i: "p8", f: "Jan", l: "van der Berg" },
  { i: "p9", f: "Maria", l: "de Souza" },
  { i: "p10", f: "Greta-Sophie", l: "Nippert" },
  { i: "p11", f: "Michael", l: "Eckardt" },
  { i: "p12", f: "Anke", l: "Horstmann" },
  { i: "p13", f: "Lydia", l: "Muhamedjanowa" },
  { i: "p14", f: "Naomi", l: "Amofa-Datuo" },
  { i: "p15", f: "Hanifi", l: "Karadavut" },
  // Aus echten Anrufen, in denen Clara den Namen NICHT fand (16.08.2026).
  { i: "p16", f: "Peter", l: "Maier" },
  { i: "p17", f: "Haila", l: "El-Otmani" },
  { i: "p18", f: "Marcel", l: "Krüger" },
  { i: "p19", f: "Nicole", l: "Thrandorf" },
].map((e) => ({ ...e, c: entryCodes(e.f, e.l) }));
const index = buildIndex(praxis);
const treffer = (spoken, opts) => catalogMatch(spoken, praxis, index, opts).map((x) => x.i);

console.log("1) Der Fall aus dem Live-Anruf");
check("ganzer Name findet die Patientin", treffer("Ouafa El Hajjami")[0] === "p1",
  JSON.stringify(treffer("Ouafa El Hajjami")));
check("nur der Nachname-Kern findet sie", treffer("Hajjami")[0] === "p1",
  JSON.stringify(treffer("Hajjami")));
check("Nachname mit Teilchen findet sie", treffer("El Hajjami")[0] === "p1",
  JSON.stringify(treffer("El Hajjami")));
check("nur der Vorname findet sie", treffer("Ouafa").includes("p1"),
  JSON.stringify(treffer("Ouafa")));

console.log("2) Namensteilchen loesen KEINE Flut aus");
check("'El' allein liefert nichts", treffer("El").length === 0, JSON.stringify(treffer("El")));
check("'van der' allein liefert nichts", treffer("van der").length === 0);
check("'de' allein liefert nichts", treffer("de").length === 0);

console.log("3) Weitere Doppelnamen ueber den Kern auffindbar");
check("Makhoukhi", treffer("Makhoukhi")[0] === "p2", JSON.stringify(treffer("Makhoukhi")));
check("Berg (van der Berg)", treffer("Berg")[0] === "p8", JSON.stringify(treffer("Berg")));
check("Souza (de Souza)", treffer("Souza")[0] === "p9", JSON.stringify(treffer("Souza")));
check("Amrani liefert BEIDE Namensvettern",
  treffer("El Amrani").filter((x) => x === "p3" || x === "p4").length === 2,
  JSON.stringify(treffer("El Amrani")));
check("Vorname grenzt den Vetter ein", treffer("Karim El Amrani")[0] === "p4",
  JSON.stringify(treffer("Karim El Amrani")));

console.log("4) Verhoerer werden ueber den Klang aufgefangen");
check("Dermos -> Thermos", treffer("Dermos").every((x) => x === "p5" || x === "p6"),
  JSON.stringify(treffer("Dermos")));
check("Xenophon Termos -> Xenofon Thermos", treffer("Xenophon Termos")[0] === "p5",
  JSON.stringify(treffer("Xenophon Termos")));
check("Zannis -> Tzannis", treffer("Levi Zannis")[0] === "p7", JSON.stringify(treffer("Levi Zannis")));
check("Eckard -> Eckardt", treffer("Michael Eckard")[0] === "p11", JSON.stringify(treffer("Michael Eckard")));
check("Horstman -> Horstmann", treffer("Horstman")[0] === "p12", JSON.stringify(treffer("Horstman")));
check("Greta Sophie Nippert (Bindestrich)", treffer("Greta Sophie Nippert")[0] === "p10",
  JSON.stringify(treffer("Greta Sophie Nippert")));

console.log("5) Vollstaendiger Name schlaegt Teiltreffer");
// Chef-Beschwerde 04.08.2026: "Ich nannte den Vornamen — trotzdem fragt Clara
// noch, ob ich Nadine oder Xenofon Thermos meine." Wer den ganzen Namen sagt,
// bekommt genau einen Treffer; nur der blosse Nachname loest die Rueckfrage aus.
const rangfolge = catalogMatch("Xenofon Thermos", praxis, index);
check("ganzer Name -> genau eine Person, keine Rueckfrage",
  rangfolge.length === 1 && rangfolge[0].i === "p5",
  JSON.stringify(rangfolge.map((x) => `${x.i}:${x.score}`)));
const nurNachname = catalogMatch("Thermos", praxis, index);
check("nur Nachname -> beide Namensvettern zur Auswahl",
  nurNachname.length === 2 && nurNachname.every((x) => x.i === "p5" || x.i === "p6"),
  JSON.stringify(nurNachname.map((x) => `${x.i}:${x.score}`)));

console.log("6) Rauschfilter: klarer Treffer verdraengt schwache Vorschlaege");
const klar = catalogMatch("Ouafa El Hajjami", praxis, index);
check("voller Treffer steht allein", klar.length === 1 && klar[0].i === "p1",
  JSON.stringify(klar.map((x) => `${x.i}:${x.score}`)));
const vettern = catalogMatch("El Amrani", praxis, index);
check("gleich starke Namensvettern bleiben beide", vettern.length === 2,
  JSON.stringify(vettern.map((x) => `${x.i}:${x.score}`)));

console.log("7) Zusammengesetzter Nachname, den STT zerlegt (14.08.2026)");
check("Muhamedjanowa ganz findet Lydia",
  treffer("Muhamedjanowa")[0] === "p13",
  JSON.stringify(treffer("Muhamedjanowa")));
check("Muhammad Janova findet Lydia, nicht Amofa",
  JSON.stringify(treffer("Muhammad Janova")) === '["p13"]',
  JSON.stringify(treffer("Muhammad Janova")));
check("Muhamed Janowa findet Lydia",
  treffer("Muhamed Janowa")[0] === "p13",
  JSON.stringify(treffer("Muhamed Janowa")));
check("Hinweis 'Muhamedjanowa' ist ein neuer Name, keine Auswahl",
  spokenLooksLikeNewPerson("Muhamedjanowa", [
    { firstName: "Naomi", lastName: "Amofa-Datuo" },
    { firstName: "Hanifi", lastName: "Karadavut" },
  ]) === true);
check("'der erste' ist keine neue Person",
  spokenLooksLikeNewPerson("der erste", [
    { firstName: "Naomi", lastName: "Amofa-Datuo" },
  ]) === false);
check("'Den ersten Eintrag bitte' ist keine neue Person",
  spokenLooksLikeNewPerson("Den ersten Eintrag bitte", [
    { firstName: "Haila", lastName: "El Otmani" },
    { firstName: "Theresa", lastName: "Heldmann" },
  ]) === false);
check("'Naomi' bleibt Auswahl in der Liste",
  spokenLooksLikeNewPerson("Naomi", [
    { firstName: "Naomi", lastName: "Amofa-Datuo" },
  ]) === false);

console.log("8) Unbekanntes und Unbrauchbares");
check("fremder Name liefert nichts", treffer("Schmidt").length === 0, JSON.stringify(treffer("Schmidt")));
check("leer", treffer("").length === 0);
check("nur Satzzeichen", treffer("?!.").length === 0);
check("ein Buchstabe", treffer("A").length === 0);
check("Obergrenze wird eingehalten", treffer("El Amrani", { limit: 1 }).length === 1);

console.log("9) Echte Fehlfaelle aus den Anrufen (16.08.2026 ausgewertet)");
// Jede Zeile ist live schiefgegangen. Sie stehen hier, damit ein spaeterer
// Umbau der Bewertung sofort auffaellt.
for (const [gesprochen, soll, wann] of [
  ["Peter Meyer", "p16", "31.07. Termin loeschen"],
  ["Hayla Ottmann", "p17", "04.08. Kontaktkarte, Vor- UND Nachname verhoert"],
  ["Heyla Otmani", "p17", "04.08. zweiter Anlauf"],
  ["Otmani", "p17", "04.08. nur der Nachname"],
  ["Marcel Krueger", "p18", "15.06. E-Mail, ue statt ü"],
]) {
  check(`${gesprochen} -> ${soll} (${wann})`, treffer(gesprochen).includes(soll),
    JSON.stringify(treffer(gesprochen)));
}

console.log("10) Grenze der Phonetik: 'Transauer' bleibt ungeloest — mit Absicht");
// Gemessen am 16.08.2026 fuer eine abgestufte Aehnlichkeit (Editierdistanz auf
// dem Klang-Code), die diesen Fall loesen sollte:
//     "Transauer" -> Thermos     0.80   FALSCH
//     "Transauer" -> Thrandorf   0.67   richtig
//     "Schmidt"   -> Tzannis     0.75   FALSCH
// Der falsche Treffer liegt HOEHER als der richtige. Es gibt keine Schwelle,
// die Thrandorf zulaesst und Tzannis sperrt — ein solcher Fallback wuerde
// Lisa den falschen Patienten anrufen lassen. Diese beiden Pruefungen sind
// der Stolperdraht dagegen: wer sie gruen halten will, muss den Weg ueber
// Rueckfrage/Buchstabieren nehmen, nicht ueber schaerferes Raten.
check("Transauer findet NICHTS statt der falschen Person",
  treffer("Transauer").length === 0, JSON.stringify(treffer("Transauer")));
check("fremder Name Schmidt bleibt ohne Treffer",
  treffer("Schmidt").length === 0, JSON.stringify(treffer("Schmidt")));

console.log("11) Bausteine");
check("Zerlegung mit Bindestrich", JSON.stringify(nameTokens("El-Hajjami")) === '["el","hajjami"]',
  JSON.stringify(nameTokens("El-Hajjami")));
check("Umlaute werden umgeschrieben", nameTokens("Müller Groß")[0] === "mueller",
  JSON.stringify(nameTokens("Müller Groß")));
check("Teilchen sind nicht unterscheidungskraeftig", !isMeaningful("el") && !isMeaningful("van"));
check("echte Namen sind unterscheidungskraeftig", isMeaningful("hajjami") && isMeaningful("berg"));
check("Klang-Code je Wort, nicht am Stueck", entryCodes("Ouafa", "El Hajjami").length >= 3,
  JSON.stringify(entryCodes("Ouafa", "El Hajjami")));
check("Nachschlagewerk kennt den Kern",
  buildIndex(praxis).has(entryCodes("", "Hajjami")[0]));
check("Teilchenliste enthaelt die haeufigen", ["el", "van", "de", "ben", "von"].every((p) => PARTICLES.has(p)));

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
