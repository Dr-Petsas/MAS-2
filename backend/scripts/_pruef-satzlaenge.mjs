// Gegenprobe zur Regel 7b (17.08.2026): Die Politur zog Briefings zu EINEM
// Satz von 362 Zeichen zusammen; der Sprech-Pfad schneidet nur an Satzenden, der
// Block ging also ungeteilt in die Sprachsynthese (~4 s bis zum ersten Ton).
// Hier wird gemessen, wie lang die Saetze nach der Umformulierung wirklich sind.
import "dotenv/config";
import "../src/firebase.js";
import { freiFormulieren } from "../src/clara/freiSprech.js";

const quelle = "Als Nächster um 10:00: Kalliopi Ketsetzi — akute Beschwerden/Notfall. "
  + "In der Historie: akute Beschwerden/Notfall. Unterlagen sind verschickt, aber noch "
  + "nicht unterschrieben. Danach um 11:30: Mustafa Gülhan — Kontrolle. "
  + "Letztes Mal: Füllung an 26.";

let schlimmster = 0;
for (let i = 0; i < 3; i++) {
  const r = await freiFormulieren(quelle, { kontext: "Heads-up zu den naechsten Patienten" });
  const text = String(r?.text || "");
  const saetze = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const max = saetze.length ? Math.max(...saetze.map((s) => s.length)) : 0;
  schlimmster = Math.max(schlimmster, max);
  console.log(`Lauf ${i + 1}: ok=${r?.ok} Saetze=${saetze.length} laengster=${max} Zeichen`);
  if (max > 200) console.log(`   zu lang: ${saetze.find((s) => s.length === max)}`);
}
console.log(schlimmster <= 200
  ? `\nOK: kein Satz ueber 200 Zeichen (schlimmster ${schlimmster}).`
  : `\nFEHL: laengster Satz ${schlimmster} Zeichen — Regel 7b greift nicht.`);
process.exit(schlimmster <= 200 ? 0 : 1);
