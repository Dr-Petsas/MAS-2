// Auflage der Gegenpruefung (17.08.2026): Die Parallelisierung des Briefings
// darf den gesprochenen Text NICHT veraendern — nur das Warten soll wegfallen.
//
// Der Vergleich laeuft gegen die Variantenwahl (vary()) an, die absichtlich
// wechselnde Einstiege waehlt. Deshalb wird nicht auf Zeichengleichheit geprueft,
// sondern auf die FAKTEN: Namen, Uhrzeiten, Anamnese-Hinweise, Vorgangs-Hinweise
// und die Reihenfolge der Patienten. Genau die duerfen sich nie verschieben.
import "dotenv/config";
import "../src/firebase.js";
import { buildNextPatientsBriefing } from "../src/clara/nextPatientsBriefing.js";
import { todayBerlin } from "../src/clara/daySchedule.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const tag = process.argv[2] || todayBerlin();
let fehler = 0;
const pruef = (was, ok, hinweis = "") => {
  console.log(`${ok ? "OK  " : "FEHL"}  ${was}${hinweis && !ok ? `  -> ${hinweis}` : ""}`);
  if (!ok) fehler++;
};

const fakten = (t) => ({
  uhrzeiten: (t.match(/\b\d{1,2}:\d{2}\b/g) || []),
  namen: (t.match(/[A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+/g) || []),
  laenge: t.length,
});

const laeufe = [];
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  const out = await buildNextPatientsBriefing(clientId, { date: tag, count: 2 });
  laeufe.push({ ms: Date.now() - t0, text: String(out?.message || ""), count: out?.count });
}

for (const l of laeufe) console.log(`  ${String(l.ms).padStart(5)} ms  ${l.count} Patient(en)  ${l.text.slice(0, 90)}...`);
console.log();

const a = fakten(laeufe[0].text);
const b = fakten(laeufe[1].text);
const c = fakten(laeufe[2].text);

pruef("die Uhrzeiten sind in jedem Lauf identisch und in gleicher Reihenfolge",
  JSON.stringify(a.uhrzeiten) === JSON.stringify(b.uhrzeiten)
  && JSON.stringify(b.uhrzeiten) === JSON.stringify(c.uhrzeiten),
  `${a.uhrzeiten} | ${b.uhrzeiten} | ${c.uhrzeiten}`);
pruef("die Patientennamen sind in jedem Lauf identisch",
  JSON.stringify(a.namen) === JSON.stringify(b.namen)
  && JSON.stringify(b.namen) === JSON.stringify(c.namen),
  `${a.namen} | ${b.namen}`);
pruef("die Textlaenge schwankt nur durch die Einstiegs-Variante (< 25 %)",
  Math.abs(a.laenge - b.laenge) < Math.max(60, a.laenge * 0.25),
  `${a.laenge} vs ${b.laenge}`);
pruef("das Briefing bleibt unter zwei Sekunden",
  laeufe[2].ms < 2000, `${laeufe[2].ms} ms`);

const schnitt = Math.round(laeufe.reduce((s, l) => s + l.ms, 0) / laeufe.length);
console.log(`\nMittel: ${schnitt} ms (warm: ${laeufe[2].ms} ms)`);
console.log(fehler ? `${fehler} Pruefung(en) fehlgeschlagen.` : "Alle Pruefungen bestanden.");
process.exit(fehler ? 1 : 0);
