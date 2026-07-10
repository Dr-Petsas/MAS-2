import { inventsNumbers, summarizeForSpeech } from "../src/clara/summarize.js";

// Reine Waechter-/Fallback-Logik der Sprech-Zusammenfassung — ohne LLM, damit
// der Test deterministisch im Gate laeuft. Der LLM-Pfad (chat) wird nur bei
// genuegend langem Inhalt betreten und ist best-effort; hier pruefen wir die
// Sicherheits-Bausteine, die IMMER gelten. Run: node scripts/test-summarize.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

console.log("=== Zahlen-Waechter (Anti-Erfindung) ===");
check(inventsNumbers("Ratenzahlung über 500 Euro.", "Bitte um Ratenzahlung von 300 Euro.") === true, "erfundene 500 -> true");
check(inventsNumbers("Es geht um 300 Euro bis zum 15.", "Ratenzahlung 300 Euro, Frist 15.07.") === false, "nur Quelltext-Zahlen -> false");
check(inventsNumbers("Kein Betrag genannt.", "Der Patient bittet um Rueckruf.") === false, "gar keine Zahlen -> false");
check(inventsNumbers("Termin am 15. Juli 2026.", "Wir schlagen den 2026-07-15 vor.") === false, "umformatiertes Datum (15/2026 vorhanden) -> false");
check(inventsNumbers("Frist 3 Tage, Betrag 99.", "Frist 3 Tage.") === true, "teilweise erfunden (99) -> true");

console.log("\n=== Zu-kurz-Kurzschluss (kein LLM-Aufruf) ===");
const short = await summarizeForSpeech("email", "Danke, bis dann.");
check(short.ok === false && short.reason === "too_short", "kurzer Text -> ok:false/too_short");
const emptyR = await summarizeForSpeech("call", "");
check(emptyR.ok === false && emptyR.reason === "too_short", "leerer Text -> ok:false/too_short");

console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : "ALL CHECKS PASSED"}`);
process.exit(failed ? 1 : 0);
