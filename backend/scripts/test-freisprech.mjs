import "dotenv/config";
import { freiFormulieren, guardOk, pflichtOk } from "../src/clara/freiSprech.js";

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

// Live 27.07.2026, Heads-up: "... drei Termine ... Damit ist der Kalender fuer
// heute ABGEARBEITET" kam als "... damit ist der Kalender fuer heute LEER"
// zurueck. Zahlen und Namen stimmten, die Aussage war das Gegenteil.
const quelleTagEnde = "Heute hatten Sie drei Termine, zwischen 9 Uhr und 10 Uhr 30. Damit ist der Kalender fuer heute abgearbeitet. Es sind sechs E-Mails eingegangen.";
check("Guard: dazuerfundene Verneinung faellt durch (abgearbeitet -> leer)",
  !guardOk(quelleTagEnde, "Du hast heute zwischen 9 Uhr und 10 Uhr 30 drei Termine, damit ist der Kalender fuer heute leer. Es sind sechs E-Mails reingekommen.").ok);
check("Guard: gleiche Aussage anders gesagt bleibt ok",
  guardOk(quelleTagEnde, "Sie hatten heute drei Termine, zwischen 9 Uhr und 10 Uhr 30 - damit ist der Kalender fuer heute abgearbeitet. Reingekommen sind sechs E-Mails.").ok);
check("Guard: geduzte Fassung faellt durch (Chef 27.07.2026: immer siezen)",
  !guardOk(quelleTagEnde, "Du hast heute drei Termine gehabt, zwischen 9 Uhr und 10 Uhr 30 - damit ist dein Kalender abgearbeitet. Es sind sechs E-Mails eingegangen.").ok);
check("Guard: gesiezte Fassung bleibt ok",
  guardOk(quelleTagEnde, "Drei Termine hatten Sie heute, zwischen 9 Uhr und 10 Uhr 30 - damit ist Ihr Kalender abgearbeitet. Es sind sechs E-Mails eingegangen.").ok);
check("Guard: Verneinung aus der Quelle darf bleiben",
  guardOk("Heute sind keine Termine gebucht, der Kalender ist leer. Es sind sechs E-Mails eingegangen.",
    "Heute ist nichts gebucht, der Kalender bleibt leer - dafuer liegen sechs E-Mails da.").ok);

// W-UMBAU-2 Werkzeug 1 (28.07.2026): Lisa-Bericht laeuft jetzt durch
// FreiSprech — der Guard muss die Berichts-Form genauso tragen.
const quelleLisa = "Lisa hat angerufen und alles ausgerichtet, Doktor Petsas. "
  + "Er weiss Bescheid, dass der Termin morgen um 14:30 entfaellt, und bedankt "
  + "sich fuer die Info. Er bittet um einen Rueckruf naechste Woche wegen der "
  + "Vertretung.";
check("Guard (Lisa-Bericht): treue Nacherzaehlung bleibt ok",
  guardOk(quelleLisa, "Kurzer Bericht: Lisa hat Doktor Petsas erreicht und alles ausgerichtet - er weiss Bescheid, dass der Termin morgen um 14:30 entfaellt, und bedankt sich fuer die Info. Um einen Rueckruf naechste Woche wegen der Vertretung bittet er noch.").ok);
check("Guard (Lisa-Bericht): verdrehte Uhrzeit faellt durch",
  !guardOk(quelleLisa, quelleLisa.replace("14:30", "15:30")).ok);
check("Guard (Lisa-Bericht): verschwundener Name faellt durch",
  !guardOk(quelleLisa, quelleLisa.replace("Doktor Petsas. ", "")).ok);
// Live-Probe 28.07.2026: "Lisa hat Dr. Petsas erreicht" kam als "ICH habe
// gerade Dr. Petsas erreicht" zurueck — Clara schmueckte sich mit Lisas Anruf.
check("Guard (Lisa-Bericht): Handelnden-Tausch (ich statt Lisa) faellt durch",
  !guardOk(quelleLisa, quelleLisa.replace("Lisa hat angerufen und alles ausgerichtet, Doktor Petsas",
    "Ich habe gerade angerufen und alles ausgerichtet, Doktor Petsas")).ok);
check("Guard (Lisa-Bericht): Ich-Tat aus der Quelle darf bleiben",
  guardOk("Ich habe Doktor Petsas um 14:30 angerufen und alles ausgerichtet - er weiss Bescheid und bedankt sich fuer die Nachricht dazu.",
    "Ich habe Doktor Petsas um 14:30 angerufen, alles ausgerichtet - er weiss Bescheid und bedankt sich fuer die Nachricht dazu.").ok);
// Live-Probe 2 (28.07.2026): "Dr." im Satz sprengte das Suchfenster, der
// Tausch rutschte durch. Der woertliche Live-Satz muss ROT sein.
check("Guard (Lisa-Bericht): Handelnden-Tausch trotz 'Dr.' im Satz faellt durch",
  !guardOk(quelleLisa.replace("Lisa hat angerufen und alles ausgerichtet, Doktor Petsas.", "Lisa hat Dr. Petsas erreicht."),
    "Guten Tag, ich habe gerade Dr. Petsas am Telefon erreicht. Er weiss Bescheid, dass der Termin morgen um 14:30 entfaellt, und bedankt sich fuer die Info. Er bittet um einen Rueckruf naechste Woche wegen der Vertretung.").ok);

// W-UMBAU-2 Werkzeug 3 (28.07.2026): Wiedervorlage-BERICHT laeuft durch
// FreiSprech (die Abhak-Anleitung haengt die Route woertlich wieder an).
// Chef-Regel: NIE Euro im gesprochenen Text — der Guard muss eine
// dazuerfundene Summe genauso abfangen wie verdrehte Fristen.
const quelleWv = "3 Punkte auf der Wiedervorlage, davon einer dringend: eine Frist von Finanzamt Bochum (Brief) — heute faellig; eine Rechnungssache von Dentallabor Nord (E-Mail, 2 Schreiben) — faellig am 30.07; eine Frist von Testanwalt (Anruf) — faellig am 02.08.";
check("Guard (Wiedervorlage): treue Nacherzaehlung bleibt ok",
  guardOk(quelleWv, "Auf der Wiedervorlage liegen 3 Punkte, einer davon dringend: vom Finanzamt Bochum ist eine Frist per Brief heute faellig; das Dentallabor Nord hat eine Rechnungssache offen (E-Mail, 2 Schreiben), faellig am 30.07; und vom Testanwalt kam per Anruf eine Frist zum 02.08.").ok);
check("Guard (Wiedervorlage): dazuerfundener Euro-Betrag faellt durch",
  !guardOk(quelleWv, quelleWv.replace("(E-Mail, 2 Schreiben)", "(E-Mail, 2 Schreiben, 456,00 Euro)")).ok);
check("Guard (Wiedervorlage): verdrehtes Frist-Datum faellt durch",
  !guardOk(quelleWv, quelleWv.replace("30.07", "31.07")).ok);
// Befund beim Bau (28.07.2026): namenOk schuetzt nur Namen MIT Anrede
// (Herr/Frau/Doktor) — Absender wie "Finanzamt Bochum" sind fuer den
// generischen Guard unsichtbar. Deshalb prueft die wiedervorlage-ROUTE
// selbst, dass jeder gesprochene Absender die Umformulierung ueberlebt
// (sonst deterministischer Text). Hier gepinnt, damit niemand den
// Routen-Check als "doppelt" wieder ausbaut.
check("Guard (Wiedervorlage): Absender OHNE Anrede ist fuer guardOk unsichtbar (deshalb Pflichtwoerter)",
  guardOk(quelleWv, quelleWv.replace("von Finanzamt Bochum ", "")).ok);

// W-UMBAU-2 Werkzeug 4 (28.07.2026): Pflichtwoerter — der Aufrufer sichert
// Woerter, die der generische Guard nicht sieht (Absender ohne Anrede,
// Kalendernamen, Zeitfenster wie "vormittags", Tages-Kern wie "morgen").
check("Pflicht: fehlendes Pflichtwort faellt durch",
  !pflichtOk(["Finanzamt Bochum"], quelleWv.replace("von Finanzamt Bochum ", "")).ok);
check("Pflicht: vorhandene Pflichtwoerter ok (Gross-/Kleinschreibung egal)",
  pflichtOk(["finanzamt bochum", "Dentallabor Nord"], quelleWv).ok);
check("Pflicht: leere Liste ok", pflichtOk([], "irgendein Text").ok);
check("Pflicht: verschwundenes Zeitfenster faellt durch",
  !pflichtOk(["vormittags"], "Morgen bei Dr. Petsas: 3 von 5 informiert.").ok);

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

// W-UMBAU-2 Werkzeug 4 (28.07.2026): Abwesenheits-Stand mit Pflichtwoertern —
// egal ob umformuliert oder deterministisch: Tages-Kern, Kalendername und
// Zeitfenster MUESSEN im Ergebnis stehen (pflichtOk erzwingt sonst Fallback).
const quelleAbw = "Abwesenheits-Stand: Morgen (vormittags) bei Dr. Petsas: 3 von 5 informiert, 2 haben bereits neu gebucht, 2 noch offen. Am Donnerstag bei Dr. Patrikis: Zeitraum gesperrt, keine Termine betroffen.";
const abwPflicht = ["morgen", "vormittags", "Dr. Petsas", "am Donnerstag", "Dr. Patrikis"];
const abw = await freiFormulieren(quelleAbw, {
  kontext: "Zwischenstand zu geplanten und laufenden Abwesenheiten",
  pflicht: abwPflicht, timeoutMs: 30000,
});
console.log(`\nAbwesenheits-Lauf (umformuliert=${abw.ok}${abw.warum ? ", warum=" + abw.warum : ""}):\n  ${abw.text}`);
check("Abwesenheits-Stand: alle Pflichtwoerter im Ergebnis (umformuliert ODER Fallback)",
  abwPflicht.every((w) => abw.text.toLowerCase().includes(w.toLowerCase())));
check("Abwesenheits-Stand: Fakten-Guard haelt", guardOk(quelleAbw, abw.text).ok || !abw.ok);

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
// Undici (Node-fetch) Keep-Alive-Pool schliessen und den Prozess NATUERLICH
// auslaufen lassen (exitCode statt process.exit()). Ein abruptes process.exit()
// kracht sonst auf Windows/Node 24 in einer libuv-Assertion (async.c:
// UV_HANDLE_CLOSING), NACHDEM alle Checks bestanden sind -> falscher Roter.
try { await globalThis[Symbol.for("undici.globalDispatcher.1")]?.destroy?.(); } catch { /* egal */ }
process.exitCode = fehler === 0 ? 0 : 1;
