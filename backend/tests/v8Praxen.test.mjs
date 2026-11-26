// Schalterliste der Clara V8 fuer weitere Praxen (src/clara/v8Praxen.js): reine Entscheidung, kein Netz, kein Firestore.
import { praxenAusText, praxenLesen, zielFuerWeiterePraxis } from "../src/clara/v8Praxen.js";

let ok = 0;
let fail = 0;
function check(name, cond, info = "") {
  if (cond) ok++;
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

const liste = praxenAusText("# Kommentar\npraxis2=test\n\nABC123  # voll\n  xyz = TEST \nkaputt=irgendwas\nmit leerzeichen\na/b\n");
check("Testpraxis gelesen", liste.get("praxis2") === "test");
check("volle Praxis gelesen", liste.get("ABC123") === "voll");
check("Leerzeichen und Grossschreibung", liste.get("xyz") === "test");
check("unbekannte Art zaehlt nicht", !liste.has("kaputt"));
check("ungueltige Kennungen zaehlen nicht", liste.size === 3, String([...liste.keys()]));
check("leere Liste", praxenAusText("").size === 0 && praxenAusText("# nur Kommentar\n").size === 0);
check("fehlende Datei ist eine leere Liste", praxenLesen("Z:\\gibt\\es\\nicht.txt").size === 0);

const an = { v8Laeuft: true, betrieb: true, notaus: false };
check("ohne Eintrag bleibt die Praxis beim alten Worker", zielFuerWeiterePraxis({ ...an, eintrag: undefined, wunsch: "v8" }) === "alt");
check("Test-Eintrag ohne Wunsch: alt", zielFuerWeiterePraxis({ ...an, eintrag: "test", wunsch: "" }) === "alt");
check("Test-Eintrag mit Wunsch: v8", zielFuerWeiterePraxis({ ...an, eintrag: "test", wunsch: "V8" }) === "v8");
check("voll + Betriebsmarke: v8", zielFuerWeiterePraxis({ ...an, eintrag: "voll", wunsch: "" }) === "v8");
check("voll ohne Betriebsmarke: alt", zielFuerWeiterePraxis({ ...an, betrieb: false, eintrag: "voll", wunsch: "" }) === "alt");
check("voll ohne Betriebsmarke, mit Wunsch: v8", zielFuerWeiterePraxis({ ...an, betrieb: false, eintrag: "voll", wunsch: "v8" }) === "v8");
check("V8 laeuft nicht: alt", zielFuerWeiterePraxis({ ...an, v8Laeuft: false, eintrag: "voll", wunsch: "v8" }) === "alt");
check("Notaus: alt", zielFuerWeiterePraxis({ ...an, notaus: true, eintrag: "voll", wunsch: "v8" }) === "alt");

console.log(fail ? `ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN` : `ERGEBNIS: alle ${ok} Pruefungen gruen`);
process.exit(fail ? 1 : 0);
