import { buildSpokenComms } from "../src/clara/commsDigest.js";
import { todayBerlin } from "../src/clara/daySchedule.js";

// Kommunikations-Digest ("Was ist reingekommen?"): reine Rendering-Logik gegen
// handgebaute Ereignisse — ohne Firestore, ohne LLM (kurze summaries loesen
// keine Verdichtung aus). Run: node scripts/test-comms-digest.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const DAY = todayBerlin();
const at = (h, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
const ev = (o) => ({ direction: "in", status: "none", signals: {}, ...o });

console.log("=== leer ===");
const empty = await buildSpokenComms([], { day: DAY });
check(/nichts reingekommen|nichts eingegangen|Eingang leer/.test(empty), "Leerer Eingang -> ehrliche Meldung");

console.log("\n=== gemischt: Anrufe + Mails ===");
const events = [
  ev({ channel: "bianca_call", ts: at(9, 5), counterparty: { name: "Frau Meier" }, summary: "Laut Anruf: Patientin hat weiterhin Schmerzen seit gestern; bittet um kurzfristigen Termin.", status: "open" }),
  ev({ channel: "nadine_email", ts: at(10, 30), counterparty: { name: "Anja Klose" }, summary: "E-Mail von Anja Klose — Betreff „Ratenzahlung“: bittet um Ratenzahlung von 50 Euro monatlich." }),
  ev({ channel: "bianca_call", ts: at(11, 15), counterparty: { name: "Herr Schulz" }, summary: "Laut Anruf: möchte seinen Kontrolltermin verschieben." }),
];
const digest = await buildSpokenComms(events, { day: DAY });
console.log("  digest: " + digest);
check(/2 Anrufe/.test(digest) && /eine E-Mail/.test(digest), "Kopf zaehlt 2 Anrufe und eine E-Mail");
check(/reingekommen/.test(digest), "Kopf sagt 'reingekommen'");
check(/Frau Meier/.test(digest) && /Herr Schulz/.test(digest), "Anrufer-Namen deterministisch genannt");
check(/Anruf von Frau Meier/.test(digest), "Anruf mit deterministischem Absender-Praefix");
check(/Anja Klose/.test(digest) && /Ratenzahlung/.test(digest), "E-Mail selbstbeschreibend mit Inhalt");
check(/Ein Anliegen ist noch offen/.test(digest), "Offenes Anliegen wird gezaehlt");

console.log("\n=== Einzahl-Verb ===");
const one = await buildSpokenComms([events[1]], { day: DAY });
check(/ist eine E-Mail reingekommen/.test(one), "Einzelner Eingang -> 'ist ... reingekommen'");

console.log("\n=== Kappung + Priorisierung bei vielen Eingaengen ===");
const many = [];
for (let i = 0; i < 9; i++) {
  many.push(ev({ channel: "bianca_call", ts: at(8, i), counterparty: { name: `Anrufer ${i}` }, summary: `Laut Anruf: Anliegen ${i}.` }));
}
// ein spaeter, aber wichtiger (offen) Eintrag muss trotz Kappung erscheinen
many.push(ev({ channel: "nadine_email", ts: at(17, 0), counterparty: { name: "Wichtig Wichtig" }, summary: "E-Mail von Wichtig Wichtig — Betreff „dringend“: bitte zurueckrufen.", status: "open" }));
const big = await buildSpokenComms(many, { day: DAY });
console.log("  big: " + big);
check(/weitere/.test(big), "Bei >6 Eingaengen: 'weitere' Hinweis");
check(/Wichtig Wichtig/.test(big), "Wichtiger offener Eintrag wird trotz Kappung gezeigt");

console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : "ALL CHECKS PASSED"}`);
process.exit(failed ? 1 : 0);
