// Test: acceptCorrection-Guard des qwen-Fachbegriff-Korrektors (17.07.2026).
// Reine Logik, kein Firebase/LLM noetig.  Start: node scripts/test-lena-correct.mjs
import { acceptCorrection } from "../src/lena/garbleCorrect.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

console.log("[test-lena-correct] acceptCorrection");

// 1) Echter Fachbegriff-Verhoerer ohne Zahlen -> uebernehmen.
check("Barottis->Parotis uebernommen",
  acceptCorrection("Da hinten sehe ich die Barottis.", "Da hinten sehe ich die Parotis."));

// 2) Zahnnummer bleibt, Begriff korrigiert -> uebernehmen.
check("in Blattat->Implantat (Zahn 36 bleibt)",
  acceptCorrection("Wir setzen ein in Blattat an Zahn 36.", "Wir setzen ein Implantat an Zahn 36."));

// 3) Leerer/zu kurzer Vorschlag -> ablehnen.
check("leerer Vorschlag abgelehnt", !acceptCorrection("Zahn 36 kariös.", ""));

// 4) Nichts geaendert -> nicht speichern.
check("unveraendert nicht gespeichert", !acceptCorrection("Alles gut.", "Alles gut."));

// 5) Erfundene Zahl/Zahnnummer -> ablehnen (§ 630f Zahlen-Waechter).
check("erfundene Zahnnummer abgelehnt",
  !acceptCorrection("Der Zahn ist kaputt.", "Der Zahn 36 ist kaputt."));

// 6) "37,8" darf NICHT zu "378" verschmolzen werden (neue Ziffernfolge).
check("37,8 -> 378 abgelehnt",
  !acceptCorrection("Ich sehe Zahn 37,8.", "Ich sehe Zahn 378."));

// 7) Aufblaehung (Halluzination/Zusatzsatz) -> ablehnen.
check("Aufblaehung abgelehnt",
  !acceptCorrection("Okay.", "Okay, und dann machen wir noch eine ausfuehrliche Untersuchung mit Roentgen."));

// 8) Drastische Kuerzung (Inhalt verloren) -> ablehnen.
check("drastische Kuerzung abgelehnt",
  !acceptCorrection("Wir kontrollieren den Zahn und besprechen alles in Ruhe.", "Wir."));

// 9) Zahl bleibt identisch, nur Begriff korrigiert -> uebernehmen.
check("Karius->Karies (approximal 5 bleibt)",
  acceptCorrection("Approximat Karius zwischen 5 und 6.", "Approximale Karies zwischen 5 und 6."));

console.log(failures ? `\n${failures} FAIL` : "\nAlle Faelle ok");
process.exit(failures ? 1 : 0);
