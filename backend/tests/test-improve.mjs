/**
 * Test des AI-Improve-Moduls (Auftrag Dr. Petsas, 09.08.2026).
 *
 * Zweite Fassung nach seiner Rueckmeldung: Kennzahlen und Gespraechsliste sind
 * weg. Geprueft wird jetzt das, worauf es ihm ankommt:
 *   - Das letzte Gespraech wird als Beleg an die Meldung gehaengt.
 *   - Die Verarbeitungskette (gehoert -> Werkzeug -> Antwort) wird richtig
 *     zusammengesetzt.
 *   - Auffaelligkeiten werden nur mit Beleg benannt, nie geraten.
 *   - Der LAUF zeigt keinen Schritt als erledigt, der nur geplant ist.
 *
 * Aufruf:  node tests/test-improve.mjs
 */
import {
  ketteBauen, auffaelligkeiten, baueLauf, ordneEin, urteile, probeErlaubt,
  KATEGORIEN, findeKategorie, zeitAusAufnahmename,
  baueGespraechBeleg, baueGespraechNachrichten,
} from "../src/improve.js";

let ok = 0;
let fail = 0;
function pruefe(name, bedingung, info = "") {
  if (bedingung) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

// Vorfall 10.08.2026: Der Meldung wurde ein Gespraech vom 28.07. angehaengt,
// obwohl der Anruf von vor zwei Minuten vorlag. Grund: Die Dateinamen tragen
// ein Zufallskuerzel VOR der Zeit, und alphabetisch sortiert gewinnt der
// Zufall. Dadurch belegte die Meldung das falsche Gespraech - der ganze
// Loesungsweg lief damit ins Leere.
console.log("0) Das JUENGSTE Gespraech gewinnt, nicht das mit dem groessten Kuerzel");
const namen = [
  "clara_MEe4ZQHEzOPzLcexyhdT_fedb5d_20260728T212354.json",
  "clara_MEe4ZQHEzOPzLcexyhdT_5aaa24_20260810T131949.json",
  "clara_MEe4ZQHEzOPzLcexyhdT_911da5_20260808T212810.json",
];
const sortiert = [...namen].sort((a, b) => {
  const za = zeitAusAufnahmename(a);
  const zb = zeitAusAufnahmename(b);
  if (za && zb) return zb.localeCompare(za);
  if (za) return -1;
  if (zb) return 1;
  return b.localeCompare(a);
});
pruefe("Zeit wird aus dem Namen gelesen",
  zeitAusAufnahmename(namen[0]) === "20260728T212354");
pruefe("Name ohne Zeitstempel gibt leer zurueck",
  zeitAusAufnahmename("irgendwas.json") === "");
pruefe("der Anruf vom 10.08. steht vorn, nicht der vom 28.07.",
  sortiert[0] === namen[1], `-> ${sortiert[0]}`);
pruefe("danach folgt der 08.08., zuletzt der 28.07.",
  sortiert[1] === namen[2] && sortiert[2] === namen[0]);

// Ein Gespraech, wie es der Sprach-Dienst aufzeichnet.
const gespraech = {
  id: "clara_test_1",
  begonnen: "2026-08-09T18:12:00",
  zuege: [
    { seq: 1, rolle: "assistant", text: "Was brauchen Sie?", audio: "seg_001_assistant.wav" },
    { seq: 2, rolle: "user", text: "Schick mir die Karte von Frau Hajjami.", audio: "seg_002_user.wav" },
    { seq: 3, rolle: "assistant", text: "Ich finde niemanden mit dem Namen.", audio: "seg_003_assistant.wav" },
    { seq: 4, rolle: "user", text: "Schick mir die Karte von Frau Hajjami.", audio: "seg_004_user.wav" },
    { seq: 5, rolle: "assistant", text: "Wen meinen Sie genau?", audio: "seg_005_assistant.wav" },
  ],
};
const protokoll = [
  { anruf: "clara_test_1", nutzer: "Schick mir die Karte von Frau Hajjami.",
    tools: [{ name: "search_patient" }], waechter: [] },
  { anruf: "clara_test_1", nutzer: "Schick mir die Karte von Frau Hajjami.",
    tools: [{ name: "search_patient" }], waechter: [] },
];

console.log("1) Verarbeitungskette");
const kette = ketteBauen(gespraech, protokoll);
pruefe("nur die Fragen des Nutzers werden Schritte", kette.length === 2, String(kette.length));
pruefe("Antwort der Assistentin haengt am richtigen Schritt",
  kette[0].geantwortet === "Ich finde niemanden mit dem Namen.", kette[0].geantwortet);
pruefe("Werkzeug aus dem Protokoll verknuepft",
  kette[0].werkzeuge[0] === "search_patient", JSON.stringify(kette[0].werkzeuge));
pruefe("Tonaufnahme durchgereicht", kette[0].audio === "seg_002_user.wav", kette[0].audio);
pruefe("Protokollbezug wird ehrlich vermerkt", kette[0].protokoll === true);

console.log("\n2) Ohne Protokoll bleibt der Wortlaut nutzbar");
const nurTon = ketteBauen(gespraech, []);
pruefe("Schritte entstehen trotzdem", nurTon.length === 2);
pruefe("fehlender Protokollbezug wird zugegeben", nurTon[0].protokoll === false);
pruefe("keine erfundenen Werkzeuge", nurTon[0].werkzeuge.length === 0);

console.log("\n3) Auffaelligkeiten — nur mit Beleg");
const funde = auffaelligkeiten(kette);
pruefe("Schleife erkannt", funde.some((f) => f.art === "schleife"), JSON.stringify(funde));
pruefe("jeder Fund nennt einen Bereich", funde.every((f) => !!f.bereich));
const sauber = auffaelligkeiten([
  { gehoert: "Was steht heute an?", werkzeuge: ["list_day_appointments"], waechter: [], protokoll: true, audio: "a.wav", geantwortet: "Drei Termine." },
]);
pruefe("sauberes Gespraech erzeugt keine Fehlermeldung", sauber.length === 0, JSON.stringify(sauber));
const ohneTool = auffaelligkeiten([
  { gehoert: "Schick ihr bitte die Karte.", werkzeuge: [], waechter: [], protokoll: true, audio: "a.wav", geantwortet: "Mache ich." },
]);
pruefe("Auftrag ohne Aktion wird erkannt",
  ohneTool.some((f) => f.art === "nicht_ausgefuehrt"), JSON.stringify(ohneTool));
pruefe("ohne Protokoll wird das offen gelegt",
  auffaelligkeiten([{ gehoert: "Test", werkzeuge: [], waechter: [], protokoll: false, audio: "", geantwortet: "" }])
    .some((f) => f.art === "kein_protokoll"));

console.log("\n4) Der Lauf");
const lauf = baueLauf({ text: "Clara findet Frau Hajjami nicht", gespraech, schritte: kette, funde,
  einordnung: ordneEin("Clara versteht Frau Hajjami falsch") });
pruefe("sechs Schritte", lauf.length === 6, String(lauf.length));
pruefe("Meldung ist erledigt", lauf[0].zustand === "fertig");
pruefe("Gespraech ist angehaengt", lauf[1].zustand === "fertig" && /Anruf vom/.test(lauf[1].text), lauf[1].text);
pruefe("Kette haengt am Ablaufschritt", (lauf[2].kette || []).length === 2);
pruefe("Funde haengen am Fehlerschritt", (lauf[3].funde || []).length > 0);
// Der Nachweis gilt erst als erbracht, wenn der Kunde ihn ausgeloest hat —
// vorher darf nichts nach "erledigt" aussehen.
pruefe("Nachweis wird NICHT als erledigt behauptet", lauf[5].zustand !== "fertig", lauf[5].zustand);
// Seit 10.08.2026 ist der Nachweis wirklich ausfuehrbar: Der Schritt traegt
// die Marke, an der die Seite ihren Knopf aufhaengt. Fehlt sie, bliebe es
// wieder bei einer blossen Ankuendigung.
pruefe("Nachweis ist ausloesbar", lauf[5].nachweis === true, JSON.stringify(lauf[5].nachweis));
pruefe("Nachweis nennt die Zahl der Aufnahmen", /2 Stellen/.test(lauf[5].text), lauf[5].text);
pruefe("Nachweis verspricht damals gegen heute", /damals neben heute/.test(lauf[5].text), lauf[5].text);

console.log("\n5) Lauf ohne Gespraech — ehrlich statt beschoenigt");
const leer = baueLauf({ text: "Irgendwas klappt nicht", gespraech: null, schritte: [], funde: [],
  einordnung: ordneEin("Irgendwas klappt nicht") });
pruefe("Anhang fehlt sichtbar", leer[1].zustand === "fehlt", leer[1].zustand);
pruefe("Ablauf kann nicht geprueft werden", leer[2].zustand === "fehlt", leer[2].zustand);
pruefe("Nachweis ohne Ton nicht moeglich", leer[5].zustand === "fehlt", leer[5].zustand);
pruefe("kein Schritt behauptet Erfolg ohne Grundlage",
  leer.filter((s) => s.zustand === "fertig").length === 2, JSON.stringify(leer.map((s) => s.zustand)));

console.log("\n6) Einordnung der Klartext-Meldung");
pruefe("Namensproblem -> Praxis darf pflegen", ordneEin("Clara versteht Frau El Hajjami immer falsch").ebene === "einstellung");
pruefe("zu viele Rueckfragen -> Praxis darf pflegen", ordneEin("Bei Terminverschiebungen fragt sie zu oft nach").ebene === "einstellung");
pruefe("falsche Aktion -> technisch", ordneEin("Sie hat den falschen Termin abgesagt").ebene === "technisch");
pruefe("Unklares landet technisch, nicht bei der Praxis", ordneEin("Irgendwas stimmt nicht").ebene === "technisch");

console.log("\n7) Urteil der Namensprobe");
pruefe("ein Treffer ist eindeutig",
  urteile([{ firstName: "Ouafa", lastName: "El Hajjami" }]).art === "eindeutig");
pruefe("Name steht im Urteil",
  /Ouafa El Hajjami/.test(urteile([{ firstName: "Ouafa", lastName: "El Hajjami" }]).text));
// Zwei aehnliche Namen sind KEIN Erfolg — genau daran ist Clara im Live-Anruf
// gescheitert, als sie zwischen Kandidaten hin und her sprang.
pruefe("zwei Treffer gelten als mehrdeutig, nicht als Erfolg",
  urteile([{ firstName: "A", lastName: "X" }, { firstName: "B", lastName: "X" }]).art === "mehrdeutig");
pruefe("nichts gefunden wird nicht beschoenigt", urteile([]).art === "nichts");
pruefe("kaputte Eingabe stuerzt nicht ab", urteile(null).art === "nichts");

console.log("\n8) Kostendeckel der Live-Probe");
// Jede Probe fragt die Plattform-Suche bis zu dreimal ab und kostet damit
// Geld. Nach dem Kostenvorfall vom 09.08.2026 laeuft hier nichts ohne Deckel.
let erlaubt = 0;
const start = Date.now();
for (let i = 0; i < 60; i++) if (probeErlaubt(start)) erlaubt++;
pruefe("Deckel greift bei 40 Proben je Stunde", erlaubt === 40, String(erlaubt));
pruefe("nach einer Stunde wieder frei", probeErlaubt(start + 3600001) === true);

console.log("\n9) Kundenkategorien");
// Feste Auswahl statt Freitext: Der Inhaber soll gefuehrt werden, nicht Romane
// schreiben. Jede Kategorie MUSS auf eine Fehlerklasse zeigen — sonst gaebe es
// spaeter nichts, woran alle Praxen gemeinsam profitieren koennten.
pruefe("sechs Kategorien zur Auswahl", KATEGORIEN.length === 6, String(KATEGORIEN.length));
pruefe("jede hat Titel, Hinweis und Beispiel",
  KATEGORIEN.every((k) => k.titel && k.hinweis && k.beispiel));
pruefe("jede zeigt auf eine Fehlerklasse",
  KATEGORIEN.every((k) => !!k.fehlerklasse && k.fehlerklasse !== "unklar"));
pruefe("Fehlerklassen sind eindeutig",
  new Set(KATEGORIEN.map((k) => k.fehlerklasse)).size === KATEGORIEN.length);
pruefe("jede sagt, wo die Loesung liegt",
  KATEGORIEN.every((k) => k.ebene === "einstellung" || k.ebene === "technisch"));
pruefe("nur der Hoerfehler fragt nach dem Namen",
  KATEGORIEN.filter((k) => k.fragtNamen).length === 1);
pruefe("Hoerfehler ist die Kategorie mit Namensfrage",
  KATEGORIEN.find((k) => k.fragtNamen).id === "verhoert");
// Erfundene Daten und falsche Aktionen duerfen NIE als Praxis-Einstellung
// durchgehen — die repariert man baulich, nicht per Schieberegler.
pruefe("Erfundenes ist ein technischer Fall",
  findeKategorie("erfunden").ebene === "technisch");
pruefe("falsche Aktion ist ein technischer Fall",
  findeKategorie("falsche_aktion").ebene === "technisch");
pruefe("unbekannte Kategorie wird nicht geraten", findeKategorie("gibtsnicht") === null);
pruefe("leere Kategorie ergibt nichts", findeKategorie("") === null);

console.log("\n10) Fehlerklasse steht im Lauf");
const laufKat = baueLauf({
  text: "", gespraech, schritte: kette, funde,
  einordnung: { bereich: "hoeren", ebene: "einstellung", fehlerklasse: "verhoert_name" },
});
pruefe("Fehlerklasse wird genannt", /verhoert_name/.test(laufKat[4].text), laufKat[4].text);
pruefe("Nutzen fuer alle Praxen wird erklaert", /alle Praxen/.test(laufKat[4].text));
const laufOhne = baueLauf({
  text: "", gespraech, schritte: kette, funde,
  einordnung: { bereich: "unklar", ebene: "technisch", fehlerklasse: "unklar" },
});
pruefe("ohne Klasse wird nichts behauptet", !/Fehlerklasse/.test(laufOhne[4].text), laufOhne[4].text);

// Der Inhaber soll KEINEN Aufsatz schreiben muessen. Laesst er das Textfeld
// leer, muss die Kategorie die Meldung tragen — ein leerer erster Schritt
// waere schlicht kaputt.
const laufOhneText = baueLauf({
  text: "", gespraech, schritte: kette, funde,
  einordnung: { ebene: "einstellung", fehlerklasse: "verhoert_name" },
  kategorie: findeKategorie("verhoert"), schwere: "blocker",
});
pruefe("Kategorie traegt die Meldung ohne Text",
  /Falsch verstanden/.test(laufOhneText[0].text), laufOhneText[0].text);
pruefe("Schweregrad steht dabei", /blockiert/.test(laufOhneText[0].text), laufOhneText[0].text);
const laufMitText = baueLauf({
  text: "Ging dreimal schief", gespraech, schritte: kette, funde,
  einordnung: { ebene: "einstellung", fehlerklasse: "verhoert_name" },
  kategorie: findeKategorie("verhoert"), schwere: "stoerend",
});
pruefe("eigener Text bleibt erhalten",
  /Ging dreimal schief/.test(laufMitText[0].text), laufMitText[0].text);
pruefe("erster Schritt ist nie leer",
  baueLauf({ text: "", gespraech: null, schritte: [], funde: [], einordnung: {} })[0].text.length > 0);

console.log("\n11) Grenzfaelle");
pruefe("kaputte Eingabe stuerzt nicht ab", ketteBauen(null, null).length === 0);
pruefe("leere Kette erzeugt keine Funde", auffaelligkeiten(null).length === 0);

console.log("\n12) Gespraech ueber den Fehler");
const beleg = baueGespraechBeleg({
  kategorie: "verhoert", schwere: "stoerend",
  text: "Muhamedjanowa kam nicht an",
  gemeinter_name: "Muhamedjanowa",
  kette: [{ gehoert: "Muhammad Janova", geantwortet: "Naomi oder Hanifi?", werkzeuge: ["contact_card"] }],
  funde: [{ text: "Name zerlegt", beleg: "Muhammad Janova" }],
});
pruefe("Beleg traegt die Meldung", /Muhamedjanowa kam nicht an/.test(beleg));
pruefe("Beleg traegt den gehoerten Zug", /Muhammad Janova/.test(beleg));
pruefe("Beleg erfindet kein Behoben", !/behoben|gefixt|erledigt/i.test(beleg));
const nachrichten = baueGespraechNachrichten(beleg, [], "");
pruefe("Eroeffnung ohne Nutzertext", nachrichten.some((m) => /Eroeffne/.test(m.content)));
pruefe("System fordert Siezen und Ehrlichkeit",
  nachrichten[0].content.includes("SIEZT") && nachrichten[0].content.includes("NIE"));
const mitFrage = baueGespraechNachrichten(beleg, [
  { rolle: "assistant", text: "Was genau kam falsch an?" },
], "Sie hat den Namen wiederholt und trotzdem nichts gefunden.");
pruefe("Nutzerfrage steht am Ende",
  mitFrage[mitFrage.length - 1].content.includes("trotzdem nichts gefunden"));

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
