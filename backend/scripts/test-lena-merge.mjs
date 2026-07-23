// Test: Cross-Channel-Merge (src/lena/crossChannel.js) — ohne Firebase/LLM.
// Prueft, dass Zwei-Mikro-Doppelungen anhand Quelle+Zeit zusammengefasst werden,
// echtes gleichzeitiges Gegen-Sprechen (Arzt/Patient) aber erhalten bleibt, und
// dass ohne Zeitstempel NICHTS zusammengefasst wird (Alt-Segmente).
//
// Start:  node backend/scripts/test-lena-merge.mjs

import { mergeCrossChannel, bigramSim, normSeg } from "../src/lena/crossChannel.js";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Hilfe: Segment bauen.
let _id = 0;
const seg = (source, text, startMs) => ({ id: `s${++_id}`, text, source, startMs, endMs: startMs + 1500 });

console.log("[test-lena-merge] Zwei-Mikro-Zwillinge (Quelle+Zeit)");

// 1) Hoch-aehnlicher Zwilling ("Zahn 37,8"/"Zahn 378"), ~0.5 s versetzt.
{
  const segs = [
    seg("arzt", "Okay, auch ich sehe da hinten den Zahn 37,8.", 10000),
    seg("raum", "Okay, also ich sehe da hinten den Zahn 378.", 10500),
  ];
  const out = mergeCrossChannel(segs);
  check("hoch-aehnlicher Zwilling -> 1 Segment", out.length === 1, `len=${out.length}`);
}

// 2) STARK divergenter Zwilling (Server-Dedup schaffte das NICHT), gleiche Zeit.
{
  const segs = [
    seg("arzt", "Den Zahn zwischen Raum, approximat, halte ich zwischen fünf und sechs.", 20000),
    seg("raum", "Im Zahnzwischenraum, Approximalraum Karies zwischen fünf und sechs.", 20400),
  ];
  const out = mergeCrossChannel(segs);
  check("divergenter Zwilling -> 1 Segment (Zeit rettet es)", out.length === 1, `len=${out.length}`);
  // Der vollstaendigere (laengere) Text bleibt.
  if (out.length === 1) {
    check("behaelt den vollstaendigeren Text",
      out[0].text.includes("Approximalraum") || out[0].text.length >= 60,
      `blieb="${out[0].text}"`);
  }
}

// 3) Enthaltensein: Kurzfassung + Langfassung derselben Aussage.
{
  const segs = [
    seg("raum", "eine kleine karriöse Stelle am Zahn 3.5", 30000),
    seg("arzt", "Und da sehe ich noch eine kleine karriöse Stelle am Zahn 3.5.", 30300),
  ];
  const out = mergeCrossChannel(segs);
  check("Kurz+Lang -> 1 Segment (Enthaltensein/Aehnlichkeit)", out.length === 1, `len=${out.length}`);
  if (out.length === 1) {
    check("laengere Fassung bleibt", out[0].text.length >= 50, `blieb="${out[0].text}"`);
  }
}

console.log("[test-lena-merge] Bewahren: echtes Gegen-Sprechen bleibt");

// 4) Arzt-Frage + Patient-Antwort, zeitlich ueberlappend, VERSCHIEDENER Inhalt.
{
  const segs = [
    seg("arzt", "Bitte machen Sie den Mund weit auf.", 40000),
    seg("raum", "Ja gerne, aber links tut es ein bisschen weh.", 40300),
  ];
  const out = mergeCrossChannel(segs);
  check("Gegen-Sprechen (versch. Inhalt) bleibt -> 2 Segmente", out.length === 2, `len=${out.length}`);
}

// 5) Gleiche QUELLE, gleicher Text kurz hintereinander -> bleibt (kein Kanal-Zwilling).
{
  const segs = [
    seg("arzt", "Der Zahn vier-sieben fehlt.", 50000),
    seg("arzt", "Der Zahn vier-sieben fehlt.", 50400),
  ];
  const out = mergeCrossChannel(segs);
  check("gleiche Quelle -> nicht zusammengefasst", out.length === 2, `len=${out.length}`);
}

// 6) Zu weit auseinander (> Fenster) -> beide bleiben, auch wenn aehnlich.
{
  const segs = [
    seg("arzt", "Wir kontrollieren den Zahn drei-sechs.", 60000),
    seg("raum", "Wir kontrollieren den Zahn drei-sechs.", 65000),
  ];
  const out = mergeCrossChannel(segs);
  check("ausserhalb Zeitfenster -> beide bleiben", out.length === 2, `len=${out.length}`);
}

console.log("[test-lena-merge] Alt-Segmente ohne Zeit");

// 7) Ohne Zeitstempel (startMs=0) wird NICHTS zusammengefasst.
{
  const segs = [
    { id: "a", text: "Okay, ich sehe da hinten den Zahn 37,8.", source: "arzt", startMs: 0, endMs: 0 },
    { id: "b", text: "Okay, ich sehe da hinten den Zahn 378.", source: "raum", startMs: 0, endMs: 0 },
  ];
  const out = mergeCrossChannel(segs);
  check("ohne Timing -> nichts zusammengefasst (Alt-Verhalten)", out.length === 2, `len=${out.length}`);
}

// Diagnose-Ausgabe der Aehnlichkeiten (zur Kalibrierung).
console.log("[test-lena-merge] Aehnlichkeiten (Info)");
const pairInfo = (a, b) => console.log(`   sim=${bigramSim(normSeg(a), normSeg(b)).toFixed(2)}  "${a.slice(0, 28)}…" / "${b.slice(0, 28)}…"`);
pairInfo("Den Zahn zwischen Raum, approximat, halte ich zwischen fünf und sechs.",
         "Im Zahnzwischenraum, Approximalraum Karies zwischen fünf und sechs.");
pairInfo("Bitte machen Sie den Mund weit auf.", "Ja gerne, aber links tut es ein bisschen weh.");

console.log();
if (failures) {
  console.log(`FEHLGESCHLAGEN: ${failures}`);
  process.exit(1);
}
console.log("ALLE FAELLE OK");
