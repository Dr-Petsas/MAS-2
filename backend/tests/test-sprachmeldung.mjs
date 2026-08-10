/**
 * Test: Fehlermeldung per Sprache ("Clara, Fehler melden", Chef 10.08.2026).
 *
 * Geprueft wird der reine Teil im Backend: Wie eine gesprochene Schilderung in
 * eine der sechs Fehlerarten einsortiert wird, und dass der Verweis auf die
 * Tonaufnahme nicht aus dem Aufnahmeordner herausfuehren kann.
 *
 * Die Erkennung des Sprachbefehls selbst sitzt im Sprach-Stack
 * (Clara-Voice/testsuite/test_wake_word.py), das Abspielen im Superuser-
 * Eingang haengt an einer angemeldeten Sitzung — beides gehoert nicht hierher.
 *
 * Aufruf:  node tests/test-sprachmeldung.mjs
 */
import { kategorieAusSprache, sprachnotizPfad } from "../src/improve.js";

let ok = 0;
let fail = 0;
function pruefe(name, bedingung, info = "") {
  if (bedingung) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}
const art = (t) => kategorieAusSprache(t)?.id || "";

console.log("1) Gesprochenes wird der richtigen Fehlerart zugeordnet");
pruefe("verhoerter Name",
  art("Clara hat den Namen falsch verstanden, die Frau heißt El Hajjami") === "verhoert");
pruefe("nichts passiert",
  art("Sie hat gesagt die SMS ist raus, es ist aber nichts passiert") === "nichts_passiert");
pruefe("erfunden",
  art("Sie behauptet etwas, das es gar nicht gibt, komplett erfunden") === "erfunden");
pruefe("umstaendlich",
  art("Sie fragt dreimal nach, das ist viel zu umständlich") === "umstaendlich");
pruefe("falsche Auskunft",
  art("Die Uhrzeit stimmte nicht, sie sagte Dienstag statt Mittwoch") === "falsche_daten");

console.log("\n2) Ein Eingriff in echte Daten ist die SCHWERSTE Art");
// Das ist der Fall, der nicht in der weicheren Klasse landen darf: Hier wurde
// gehandelt, nicht nur falsch geredet.
pruefe("Absage beim falschen Patienten",
  art("Sie hat den Termin der falschen Frau Meier abgesagt") === "falsche_aktion");
pruefe("falsch gebucht",
  art("Der Termin wurde falsch gebucht, beim falschen Arzt") === "falsche_aktion");
pruefe("doppelt eingetragen",
  art("Der Patient wurde doppelt eingetragen") === "falsche_aktion");

console.log("\n3) Nichts erfinden, wenn nichts erkennbar ist");
// Lieber offen lassen als raten: Im Eingang steht die Art dann als geschaetzt
// und laesst sich richtigstellen.
pruefe("unverstaendliches Gemurmel ergibt keine Art", art("Hmm ja also keine Ahnung") === "");
pruefe("leer ergibt keine Art", kategorieAusSprache("") === null);
pruefe("nur Leerzeichen ergibt keine Art", kategorieAusSprache("   ") === null);

console.log("\n4) Der Verweis auf die Tonaufnahme fuehrt nie aus dem Ordner");
pruefe("gueltige Aufnahme wird gefunden",
  sprachnotizPfad("clara_abc_20260810T101010", "seg_004_user.wav").includes("seg_004_user.wav"));
pruefe("Ausbruch ueber Punktfolgen wird abgewiesen",
  sprachnotizPfad("..\\..\\etc", "seg_004_user.wav") === "");
pruefe("Ausbruch mit Schraegstrich wird abgewiesen",
  sprachnotizPfad("../../windows", "seg_004_user.wav") === "");
pruefe("fremde Dateiendung wird abgewiesen",
  sprachnotizPfad("clara_abc", "geheim.txt") === "");
pruefe("erfundener Aufnahmename wird abgewiesen",
  sprachnotizPfad("clara_abc", "seg_x_user.wav") === "");
pruefe("ohne Anruf kein Pfad", sprachnotizPfad("", "seg_001_user.wav") === "");

console.log("\n5) Der zentrale Eintrag kennzeichnet Herkunft und Ton");
const { baueMeldung } = await import("../src/improveZentrale.js");
const gesprochen = baueMeldung({
  clientId: "abc", praxis: "Testpraxis", fallId: "f1",
  einordnung: { kategorie: "verhoert", fehlerklasse: "verhoert_name", ebene: "einstellung" },
  schwere: "stoerend", text: "Name falsch verstanden",
  meldung_von: "per Sprache über Clara", anruf: "clara_abc",
  quelle: "sprache", sprachnotiz: { anruf: "clara_abc", datei: "seg_004_user.wav" },
});
pruefe("Herkunft steht dabei", gesprochen.quelle === "sprache");
pruefe("Verweis auf die Aufnahme steht dabei",
  gesprochen.sprachnotiz?.datei === "seg_004_user.wav", JSON.stringify(gesprochen.sprachnotiz));

// Eine getippte Meldung darf keinen Ton-Verweis erfinden.
const getippt = baueMeldung({
  clientId: "abc", fallId: "f2", einordnung: { kategorie: "verhoert" }, schwere: "stoerend",
  text: "von der Seite gemeldet",
});
pruefe("getippte Meldung hat keine Tonspur", getippt.sprachnotiz === null);
pruefe("getippte Meldung heisst 'seite'", getippt.quelle === "seite");

// Ein Verweis ohne Dateinamen ist kein Verweis — sonst zeigte der Eingang
// einen Abspielknopf, hinter dem nichts liegt.
const halb = baueMeldung({
  clientId: "abc", fallId: "f3", einordnung: {}, schwere: "stoerend", text: "x",
  quelle: "sprache", sprachnotiz: { anruf: "clara_abc", datei: "" },
});
pruefe("halber Verweis wird verworfen", halb.sprachnotiz === null);

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
