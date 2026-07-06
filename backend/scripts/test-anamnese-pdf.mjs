import "dotenv/config";
import admin from "../src/firebase.js";
import { getPatientAnamnese, buildSpokenAnamnese } from "../src/clara/anamnese.js";
import { parseAnamneseText, findingsAusFragen } from "../src/clara/anamnesePdf.js";

// ============================================================================
// Test (04.07.2026): Anamnese-Auswertung aus SIGNIERTEN PDFs.
//   A) Parser-Unit-Test auf synthetischem Textdump (Kaestchen-Glyphen).
//   B) Echte Alt-PDFs aus Storage (Kueppers 2022, Galatola 2025,
//      Papathanassiou 2022) durch getPatientAnamnese — inkl. Cache-Weg.
// Raeumt den Firestore-Cache der Testdokumente vorher, damit wirklich das
// PDF gelesen wird, und prueft danach, dass der Cache gefuellt ist.
// ============================================================================

const CLIENT = "MEe4ZQHEzOPzLcexyhdT";
let fehler = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "\n      " + detail : ""}`);
  if (!cond) fehler += 1;
}

// --- A) Parser-Unit-Test --------------------------------------------------
const X = "\ue800", O = "\uf096";
const synthetisch = [
  "Frau Erika Beispiel",
  "Allgemeine Gesundheitssituation",
  "Nehmen Sie regelmäßig Medikamente ein?",
  `${X} Ja`,
  "Welche?",
  "Marcumar, L-Thyroxin",
  `${O} Nein`,
  "Leiden Sie unter Bluthochdruck?",
  `${O} Nein, mein Blutdruck ist normal.`,
  `${X} Ja, hoher Blutdruck`,
  "Haben Sie einen Herzschrittmacher?",
  `${O} Ja`,
  `${X} Nein`,
  "Allergien",
  "Leiden Sie unter Allergien?",
  `${X} Ja`,
  "Welche?",
  "Nickel",
  `${O} Nein`,
  "Zahnärztliche Schlafmedizin",
  "Leiden Sie unter Schlafproblemen?",
  `${O} nein`,
  `${X} Ich schnarche`,
  "Seite 1 von 4",
].join("\n");

const fragen = parseAnamneseText(synthetisch);
const f = findingsAusFragen(fragen);
const hat = (cat, sub) => f.some((x) => x.category === cat && x.text.toLowerCase().includes(sub));
check("Parser: Medikamente mit Freitext", hat("Medikamente", "marcumar"), JSON.stringify(f));
check("Parser: Bluthochdruck als Thema", hat("Vorerkrankung", "bluthochdruck") || hat("Vorerkrankung", "blutdruck"), JSON.stringify(f));
check("Parser: Allergie Nickel", hat("Allergie", "nickel"), JSON.stringify(f));
check("Parser: verneinter Schrittmacher NICHT gemeldet", !f.some((x) => /schrittmacher/i.test(x.text)), JSON.stringify(f));
check("Parser: Ueberschrift 'Allergien' nicht als Befund", !f.some((x) => x.text.trim().toLowerCase() === "allergien"), JSON.stringify(f));

// --- B) Echte Alt-PDFs ------------------------------------------------------
const db = admin.firestore();
// ACHTUNG: Galatola und Sykioti teilen sich DIESELBE pdocument-ID
// (Massenversand) — genau der Fall, der den Cache frueher vergiftete
// (alle bekamen Galatolas Hashimoto/Nickel). Beide muessen ihre EIGENEN
// Befunde liefern; der Cache-Key ist deshalb patientId_docId.
const FAELLE = [
  { pid: "02IVQRkEOnanyfznWNao", docId: "1Hjf75EkieTP7jvfAF0P", wer: "Gordula Küppers (2022)", erwartet: [["Medikamente", "candesatan"]] },
  { pid: "04VJQei6MQNwPyv5ocph", docId: "zGtAS84YTVNOmP7gfbRo", wer: "Maria Galatola (2025)", erwartet: [["Allergie", "nickel"], ["Vorerkrankung", "hashimoto"]] },
  { pid: "04qBzW3i1KKHNI7N3ob7", docId: "zGtAS84YTVNOmP7gfbRo", wer: "Eirini Sykioti (2025, gleiche Doc-ID wie Galatola)", erwartet: [["Medikamente", "ametriptilin"]], verboten: ["hashimoto", "nickel"] },
  { pid: "03xtEagU6pyFjZDDflfd", docId: "MctyI3ojCond1zphfnqv", wer: "Serafim Papathanassiou (2022, alles Nein)", erwartet: [] },
];

for (const fall of FAELLE) {
  await db.collection("clients").doc(CLIENT).collection("mas_anamnese_pdf").doc(`${fall.pid}_${fall.docId}`).delete().catch(() => {});
}

for (const fall of FAELLE) {
  const r = await getPatientAnamnese(CLIENT, { patientId: fall.pid });
  console.log(`\n--- ${fall.wer}`);
  console.log(`    ausPdf=${r.ausPdf} signedOnly=${r.signedOnly} findings=${JSON.stringify(r.findings)}`);
  console.log(`    Gesprochen: ${buildSpokenAnamnese(r, { who: fall.wer.split(" (")[0] })}`);
  check(`${fall.wer}: PDF ausgewertet`, r.ok && r.ausPdf === true && r.signedOnly === false);
  for (const [cat, sub] of fall.erwartet) {
    check(`${fall.wer}: ${cat} enthaelt "${sub}"`, r.findings.some((x) => x.category === cat && x.text.toLowerCase().includes(sub)));
  }
  for (const sub of (fall.verboten || [])) {
    check(`${fall.wer}: "${sub}" darf NICHT auftauchen (fremder Patient)`, !r.findings.some((x) => x.text.toLowerCase().includes(sub)), JSON.stringify(r.findings));
  }
  if (!fall.erwartet.length) {
    check(`${fall.wer}: keine Befunde (alles verneint)`, r.findings.length === 0, JSON.stringify(r.findings));
  }
  const cache = await db.collection("clients").doc(CLIENT).collection("mas_anamnese_pdf").doc(`${fall.pid}_${fall.docId}`).get();
  check(`${fall.wer}: Cache gefuellt`, cache.exists && Array.isArray(cache.data()?.findings));
}

// Cache-Weg: zweiter Aufruf muss ohne PDF-Download dasselbe liefern.
const nochmal = await getPatientAnamnese(CLIENT, { patientId: FAELLE[1].pid });
check("Zweiter Aufruf (aus Cache) identisch", nochmal.ausPdf === true && nochmal.findings.length > 0);

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
process.exit(fehler === 0 ? 0 : 1);
