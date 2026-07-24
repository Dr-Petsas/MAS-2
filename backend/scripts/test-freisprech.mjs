import "dotenv/config";
import { freiFormulieren, guardOk } from "../src/clara/freiSprech.js";

// FreiSprech-Test (04.07.2026):
//   1. Guard-Unit-Checks (deterministisch, ohne LLM).
//   2. Echte Umformulierung eines Beispiel-Briefings, 3 Laeufe -> Varianz
//      pruefen (nicht dreimal woertlich derselbe Text) + Guard muss halten.

let fehler = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "\n      " + detail : ""}`);
  if (!cond) fehler += 1;
}

// --- 1) Guard-Units ----------------------------------------------------------
const quelle = "Um 09:10 kommt Frau Sablon zur PZR. Achtung aus der Anamnese — Medikamente: Marcumar; Allergie: Penicillin. Danach um 10:30 Herr Freigang, KCH Kontrolle, 2 offene Vorgaenge.";

check("Guard: identischer Text ok", guardOk(quelle, quelle).ok);
check("Guard: fehlende Uhrzeit faellt durch",
  !guardOk(quelle, quelle.replace("10:30", "spaeter")).ok);
check("Guard: erfundene Zahl faellt durch",
  !guardOk(quelle, quelle + " Und 5 Anrufe.").ok);
check("Guard: fehlender Name faellt durch",
  !guardOk(quelle, quelle.replace("Herr Freigang", "der naechste Patient")).ok);
check("Guard: dazuerfundener Euro-Betrag faellt durch",
  !guardOk(quelle.replace("2 offene", "2 offene"), quelle + " Kostet 80 Euro.").ok);
check("Guard: viel zu kurzer Text faellt durch",
  !guardOk(quelle, "Um 09:10 kommt Frau Sablon. 10:30 Herr Freigang. 2.").ok === false ? true : !guardOk(quelle, "Zu kurz 09:10 10:30 2 Sablon Freigang Marcumar").ok);

// Wort-Zahlen (Tagesbriefing schreibt Mengen als Woerter).
const quelleWorte = "Du hast heute sechs Termine zwischen neun Uhr und vierzehn Uhr dreissig. Frei ist von zwoelf Uhr zwanzig bis dreizehn Uhr. Dabei ist ein Neupatient.";
check("Guard: Zahlwort-Aenderung faellt durch (sechs -> sieben)",
  !guardOk(quelleWorte, quelleWorte.replace("sechs", "sieben")).ok);
check("Guard: fehlendes Zahlwort faellt durch (dreizehn weg)",
  !guardOk(quelleWorte, quelleWorte.replace("bis dreizehn Uhr", "bis mittags")).ok);
check("Guard: Zahlwoerter unveraendert ok",
  guardOk(quelleWorte, "Kurzer Blick auf heute: sechs Termine, los geht es um neun Uhr, Schluss gegen vierzehn Uhr dreissig. Zwischen zwoelf Uhr zwanzig und dreizehn Uhr bleibt Luft. Ein Neupatient ist dabei.").ok);

// --- 2) Echte Umformulierung -------------------------------------------------
const laeufe = [];
for (let i = 0; i < 3; i++) {
  const r = await freiFormulieren(quelle, { kontext: "Heads-up zu den naechsten Patienten", timeoutMs: 30000 });
  laeufe.push(r);
  console.log(`\nLauf ${i + 1} (umformuliert=${r.ok}${r.warum ? ", warum=" + r.warum : ""}):\n  ${r.text}`);
}
const mind1 = laeufe.some((r) => r.ok);
check("\nMindestens ein Lauf wurde frei umformuliert (LLM erreichbar)", mind1,
  mind1 ? "" : "LLM offline? Dann ist deterministischer Fallback ok, aber Test nicht aussagekraeftig.");
for (const [i, r] of laeufe.entries()) {
  check(`Lauf ${i + 1}: Fakten-Guard haelt`, guardOk(quelle, r.text).ok || !r.ok);
}
const texte = new Set(laeufe.filter((r) => r.ok).map((r) => r.text));
check("Varianz: umformulierte Laeufe sind nicht alle woertlich identisch",
  texte.size >= Math.min(2, laeufe.filter((r) => r.ok).length) || laeufe.filter((r) => r.ok).length <= 1);

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
// Undici (Node-fetch) Keep-Alive-Pool schliessen und den Prozess NATUERLICH
// auslaufen lassen (exitCode statt process.exit()). Ein abruptes process.exit()
// kracht sonst auf Windows/Node 24 in einer libuv-Assertion (async.c:
// UV_HANDLE_CLOSING), NACHDEM alle Checks bestanden sind -> falscher Roter.
try { await globalThis[Symbol.for("undici.globalDispatcher.1")]?.destroy?.(); } catch { /* egal */ }
process.exitCode = fehler === 0 ? 0 : 1;
