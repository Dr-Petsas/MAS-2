/**
 * Test des AI-Improve-Moduls (Auftrag Dr. Petsas, 09.08.2026).
 *
 * Der wichtigste Punkt ist die EHRLICHKEITSREGEL: Kennzahlen, die wir noch
 * nicht messen, muessen ausdruecklich als "nicht gemessen" zurueckkommen und
 * duerfen niemals als schoene Zahl erscheinen. Eine erfundene 97,8 % waere
 * schlimmer als ein Fragezeichen, weil der Chef darauf Entscheidungen baut.
 *
 * Aufruf:  node tests/test-improve.mjs
 */
import { perzentil, kennzahlen, zuegeFuerAnzeige, ordneEin, passendeZuege } from "../src/improve.js";

let ok = 0;
let fail = 0;
function pruefe(name, bedingung, info = "") {
  if (bedingung) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

console.log("1) Perzentile");
pruefe("Median von 1..5", perzentil([1, 2, 3, 4, 5], 0.5) === 3);
pruefe("p95 nimmt den oberen Rand", perzentil([1, 2, 3, 4, 100], 0.95) === 100);
pruefe("leere Reihe -> nicht gemessen", perzentil([], 0.5) === null);
pruefe("Unfug wird aussortiert", perzentil([1, null, "x", 3], 0.5) === 1);

console.log("\n2) Kennzahlen aus echten Zugformen");
const zuege = [
  { ts: "2026-08-09T10:00:00", nutzer: "Was steht heute an?", gesprochen: "Drei Termine.",
    tools: [{ name: "list_day_appointments", status: "ok" }], waechter: [], dauer_ms: 1200 },
  { ts: "2026-08-09T10:01:00", nutzer: "Sag Frau Meier ab.", gesprochen: "Erledigt.",
    tools: [{ name: "cancel_appointment", status: "ok" }], waechter: ["storno-guard"],
    dauer_ms: 2400, anruf: "raum_1", audio: "seg_003_user.wav" },
  { ts: "2026-08-09T10:02:00", nutzer: "Danke.", gesprochen: "Gern.", tools: [], waechter: [],
    dauer_ms: 300 },
  { ts: "2026-08-09T10:03:00", nutzer: "Und weiter?", gesprochen: "", tools: [{ name: "x", status: "500" }],
    waechter: [], dauer_ms: 900, abgebrochen: true },
];
const k = kennzahlen(zuege);
pruefe("Zuege gezaehlt", k.zuege === 4, String(k.zuege));
// Rangmethode (wie bei p95 ueblich): bei [300, 900, 1200, 2400] ist der
// mittlere Rang der zweite Wert. Bewusst nicht der Durchschnitt der beiden
// mittleren — sonst stuende in der Anzeige eine Antwortzeit, die so nie
// gemessen wurde.
pruefe("Median nach Rangmethode", k.antwortzeit_median_ms === 900, String(k.antwortzeit_median_ms));
pruefe("Anteil mit Werkzeug", k.anteil_mit_werkzeug === 75, String(k.anteil_mit_werkzeug));
pruefe("Abbruch gezaehlt", k.abgebrochen === 1, String(k.abgebrochen));
pruefe("Werkzeugfehler gezaehlt", k.werkzeug_fehler === 1, String(k.werkzeug_fehler));
pruefe("Absicherung gezaehlt", k.top_waechter[0]?.name === "storno-guard", JSON.stringify(k.top_waechter));
pruefe("Tonbezug ausgewiesen", k.anteil_mit_tonbezug === 25, String(k.anteil_mit_tonbezug));

console.log("\n3) EHRLICHKEIT: was wir nicht messen, wird nicht erfunden");
for (const feld of ["namensgenauigkeit", "patient_erkannt", "falsche_aktionen", "rueckfragequote"]) {
  pruefe(`${feld} ist ausdruecklich nicht gemessen`, k[feld] === null, String(k[feld]));
}
const leer = kennzahlen([]);
pruefe("ohne Daten keine erfundene Antwortzeit", leer.antwortzeit_median_ms === null);
pruefe("ohne Daten kein erfundener Anteil", leer.anteil_mit_werkzeug === null);
pruefe("ohne Daten null Zuege", leer.zuege === 0);
pruefe("kaputte Eingabe stuerzt nicht ab", kennzahlen(null).zuege === 0);

console.log("\n4) Anzeige");
const anzeige = zuegeFuerAnzeige(zuege, 2);
pruefe("neueste zuerst", anzeige[0].gehoert === "Und weiter?", anzeige[0]?.gehoert);
pruefe("Grenze eingehalten", anzeige.length === 2, String(anzeige.length));
pruefe("Tonbezug durchgereicht", zuegeFuerAnzeige(zuege, 4)[2].audio === "seg_003_user.wav");

console.log("\n5) Einordnung der Klartext-Meldung");
pruefe("Namensproblem -> Hoeren, Praxis darf pflegen",
  JSON.stringify(ordneEin("Clara versteht Frau El Hajjami immer falsch")) === JSON.stringify({ bereich: "hoeren", ebene: "einstellung" }));
pruefe("zu viele Rueckfragen -> Denken, Praxis darf pflegen",
  ordneEin("Bei Terminverschiebungen fragt sie zu oft nach").ebene === "einstellung");
pruefe("falsche Aktion -> technisch",
  ordneEin("Sie hat den falschen Termin abgesagt").ebene === "technisch");
pruefe("doppelt geschickt -> technisch",
  ordneEin("Die Karte wurde doppelt geschickt").ebene === "technisch");
pruefe("Unklares landet technisch, nicht bei der Praxis",
  ordneEin("Irgendwas stimmt nicht").ebene === "technisch");

console.log("\n6) Passende Gespraeche zur Meldung");
const treffer = passendeZuege(zuege, "Frau Meier absagen");
pruefe("findet den richtigen Zug", treffer.length > 0 && treffer[0].nutzer.includes("Meier"),
  JSON.stringify(treffer[0] || null));
pruefe("ohne brauchbare Woerter kein Rateergebnis", passendeZuege(zuege, "ab").length === 0);

// Der teuerste Fehler waere eine lange Liste unbeteiligter Gespraeche als
// angeblicher Beleg. Allerweltswoerter duerfen deshalb nichts anziehen.
const viele = [];
for (let i = 0; i < 40; i++) {
  viele.push({ nutzer: `Clara, bitte Termine am ${i}.`, gesprochen: "Alles klar.", tools: [] });
}
viele.push({ nutzer: "Kontaktkarte von Frau Hajjami bitte", gesprochen: "Schicke ich.", tools: [] });
const gezielt = passendeZuege(viele, "Clara versteht Frau Hajjami immer falsch");
pruefe("seltener Name gewinnt", gezielt[0]?.nutzer.includes("Hajjami"), gezielt[0]?.nutzer);
pruefe("Allerweltswoerter ziehen nichts an", gezielt.length === 1, String(gezielt.length));
pruefe("nur Allerweltswoerter -> kein Ergebnis",
  passendeZuege(viele, "Clara bitte Termine").length === 0);
// Der Fall aus der Praxis: Der gemeldete Name steht in KEINEM Protokoll, weil
// die Spracherkennung ihn anders verstanden hat. Dann ist "nichts gefunden"
// die einzig richtige Antwort — kein Ersatzbeleg aus fremden Gespraechen.
pruefe("unbekannter Name -> ehrlich nichts, statt Ersatzbelege",
  passendeZuege(viele, "Clara versteht Frau Unbekanntname immer falsch").length === 0);

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
