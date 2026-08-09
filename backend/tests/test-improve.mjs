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
import { ketteBauen, auffaelligkeiten, baueLauf, ordneEin, urteile, probeErlaubt } from "../src/improve.js";

let ok = 0;
let fail = 0;
function pruefe(name, bedingung, info = "") {
  if (bedingung) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

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
// Das Wichtigste: Der Nachweis ist NICHT gebaut und darf nicht so aussehen.
pruefe("Nachweis wird NICHT als erledigt behauptet", lauf[5].zustand !== "fertig", lauf[5].zustand);
pruefe("Nachweis nennt den Grund", /Wiederholungslauf/.test(lauf[5].text), lauf[5].text);

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

console.log("\n9) Grenzfaelle");
pruefe("kaputte Eingabe stuerzt nicht ab", ketteBauen(null, null).length === 0);
pruefe("leere Kette erzeugt keine Funde", auffaelligkeiten(null).length === 0);

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
