/**
 * Test: Zentraler Meldeeingang (Auftrag Dr. Petsas, 10.08.2026).
 *
 * Geprueft wird nur der reine Teil — Aufbau des Eintrags, die Frage
 * "muss das per Code geloest werden?" und der Text des Alarms. Alles, was
 * Datenbank oder Mailserver braucht, ist bewusst NICHT hier: Ein Test, der
 * nur bei laufender Firestore-Verbindung gruen wird, ist kein Test.
 *
 * Der wichtigste Punkt in dieser Datei ist die DATENSPARSAMKEIT: In der
 * gemeinsamen Sammelstelle und erst recht in der E-Mail duerfen keine
 * Anrufinhalte landen. Der Verlauf bleibt bei der Praxis.
 *
 * Aufruf:  node tests/test-improve-zentrale.mjs
 */
import { baueMeldung, alarmMail, istCodeFall } from "../src/improveZentrale.js";

let ok = 0;
let fail = 0;
function pruefe(name, bedingung, info = "") {
  if (bedingung) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

console.log("1) Was gehoert auf die Entwicklungs-Liste?");
pruefe("technische Faelle muessen per Code geloest werden",
  istCodeFall({ ebene: "technisch" }) === true);
pruefe("Einstellungen der Praxis gehoeren NICHT auf die Liste",
  istCodeFall({ ebene: "einstellung" }) === false);
// Unklares gehoert angeschaut, nicht weggefiltert.
pruefe("Unklares landet vorsichtshalber bei der Entwicklung",
  istCodeFall({}) === true);

console.log("\n2) Der Eintrag traegt alles, was zum Handeln noetig ist");
const meldung = baueMeldung({
  clientId: "MEe4ZQHEzOPzLcexyhdT",
  praxis: "Zahnarztpraxis Petsas",
  fallId: "FALL123",
  einordnung: { bereich: "handeln", ebene: "technisch", fehlerklasse: "falsches_tool", kategorie: "falsche_aktion" },
  schwere: "blocker",
  text: "Clara hat den Termin der falschen Frau Meier abgesagt.",
  meldung_von: "Dr. Petsas",
  gemeinter_name: "Ouafa El Hajjami",
  anruf: "call-991",
  jetzt: 1770000000000,
});
pruefe("Praxis-Kennung", meldung.praxis === "MEe4ZQHEzOPzLcexyhdT");
pruefe("Praxis-Name im Klartext", meldung.praxis_name === "Zahnarztpraxis Petsas");
pruefe("Zeiger auf den vollen Fall", meldung.fall === "FALL123");
pruefe("Melder festgehalten", meldung.gemeldet_von === "Dr. Petsas");
pruefe("Art im Klartext", meldung.kategorie_text === "Falsche Aktion", meldung.kategorie_text);
pruefe("Schwere im Klartext", meldung.schwere_text === "Blockiert den Betrieb", meldung.schwere_text);
pruefe("als Code-Fall erkannt", meldung.code_noetig === true);
pruefe("startet ungelesen", meldung.gelesen === false && meldung.status === "neu");
pruefe("Mailweg startet als offen", meldung.mail_status === "offen");

console.log("\n3) Datensparsamkeit: kein Anrufinhalt in der Sammelstelle");
// Der Verlauf (gehoerte Saetze, Tonaufnahmen) darf die Praxis nicht verlassen.
const felder = Object.keys(meldung);
pruefe("kein Gespraechsverlauf im Eintrag", !felder.includes("kette"));
pruefe("keine Auffaelligkeiten-Liste im Eintrag", !felder.includes("funde"));
pruefe("nur die Anruf-Kennung als Zeiger, kein Inhalt", meldung.anruf === "call-991");

console.log("\n4) Unbekannter Melder faellt nicht unter den Tisch");
const ohneNamen = baueMeldung({ clientId: "X", einordnung: { ebene: "einstellung" }, schwere: "kosmetik" });
pruefe("Melder wird als unbekannt ausgewiesen", ohneNamen.gemeldet_von === "unbekannt");
pruefe("Einstellungsfall ist kein Code-Fall", ohneNamen.code_noetig === false);
pruefe("unbekannte Art wird als Sonstiges gefuehrt", ohneNamen.kategorie_text === "Sonstiges");

console.log("\n5) Lange Texte werden gekappt (Eintrag, kein Archiv)");
const lang = baueMeldung({ clientId: "X", text: "a".repeat(2000), einordnung: {}, schwere: "stoerend" });
pruefe("Freitext auf 600 Zeichen begrenzt", lang.text.length === 600, String(lang.text.length));

console.log("\n6) Der Betreff sagt schon alles — er wird auf dem Handy gelesen");
const blocker = alarmMail(meldung);
pruefe("Betreff nennt die Dringlichkeit", blocker.betreff.includes("BLOCKIERT"), blocker.betreff);
pruefe("Betreff nennt die Praxis", blocker.betreff.includes("Zahnarztpraxis Petsas"), blocker.betreff);
pruefe("Betreff nennt die Art", blocker.betreff.includes("Falsche Aktion"), blocker.betreff);

const codeFall = alarmMail(baueMeldung({
  clientId: "X", praxis: "Praxis Nord", schwere: "stoerend",
  einordnung: { ebene: "technisch", kategorie: "erfunden", fehlerklasse: "halluziniert" },
}));
pruefe("nicht blockierende Code-Faelle heissen im Betreff 'Code'",
  codeFall.betreff.includes("(Code)"), codeFall.betreff);

const eigenerFall = alarmMail(baueMeldung({
  clientId: "X", praxis: "Praxis Süd", schwere: "kosmetik",
  einordnung: { ebene: "einstellung", kategorie: "umstaendlich", fehlerklasse: "gespraechsfluss" },
}));
pruefe("Einstellungsfaelle sind im Betreff als solche erkennbar",
  eigenerFall.betreff.includes("(Einstellung)"), eigenerFall.betreff);

console.log("\n7) Der Mailtext nennt Melder, Weg und Fall-Nummer");
pruefe("Melder steht drin", blocker.text.includes("Dr. Petsas"));
pruefe("Loesungsweg steht drin", blocker.text.includes("CODE (Entwicklung)"));
pruefe("Fall-Nummer steht drin", blocker.text.includes("FALL123"));
pruefe("gemeinter Name steht drin", blocker.text.includes("Ouafa El Hajjami"));
pruefe("Wortlaut der Praxis steht drin", blocker.text.includes("falschen Frau Meier"));
pruefe("Hinweis, dass der Verlauf bei der Praxis bleibt",
  blocker.text.includes("bewusst nicht Teil dieser E-Mail"));
pruefe("Link zum Eingang nur, wenn eine Adresse bekannt ist",
  !blocker.text.includes("improve-zentrale.html")
  && alarmMail(meldung, { basis: "http://x:4000" }).text.includes("improve-zentrale.html"));

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
