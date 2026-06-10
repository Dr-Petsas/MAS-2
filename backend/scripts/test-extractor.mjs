import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { extractFromTranscript, extractPatientName } from "../src/brain/extractor.js";

// Validates the signal extractor against synthetic cases AND a real recorded
// v5.2 transcript manifest. Pure: no Firestore, no GPU. Run:
//   node scripts/test-extractor.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

async function run() {
  console.log("=== synthetic cases ===");

  const callback = await extractFromTranscript([
    { role: "user", text: "Guten Tag, könnten Sie mich bitte zurückrufen wegen meines Termins?" },
  ]);
  check(callback.signals.callbackRequested === true, "Rückruf erkannt");

  const billing = await extractFromTranscript([
    { role: "user", text: "Ich wollte fragen, wann ich die Rechnung bekomme und was das kostet." },
  ]);
  check(billing.signals.billingQuestion === true, "Rechnungsfrage erkannt");

  const repeat = await extractFromTranscript([
    { role: "user", text: "Ich bin jetzt zum fünften Mal hier und es tut immer noch weh." },
  ]);
  check(repeat.signals.repeatVisitStated === true, "Wiederholungsbesuch erkannt");
  check(repeat.signals.painPersists === true, "anhaltender Schmerz erkannt");
  check(/zum 5\. Mal/.test(repeat.summary), `Ordnungszahl im Summary ("${repeat.summary}")`);

  const colleagueDoc = await extractFromTranscript([
    { role: "user", text: "Ich brauche dringend eine Krankschreibung und ein Rezept." },
  ]);
  check(colleagueDoc.signals.documentRelated === true, "Dokument/Unterlagen erkannt");

  const angry = await extractFromTranscript({
    turns: [{ role: "user", text: "Das ist eine Frechheit, ich bin total unzufrieden!" }],
  });
  check(angry.signals.complaintStated === true, "Beschwerde erkannt");
  check(angry.signals.sentiment === "negative", "negative Stimmung (konservativ) erkannt");

  const empty = await extractFromTranscript([{ role: "user", text: "Hallo. Ja. Okay." }]);
  check(Object.keys(empty.signals).length === 0, "kein Signal bei Smalltalk (keine Fehlalarme)");
  check(empty.confidence <= 0.3, "niedrige Confidence ohne Anliegen");

  console.log("\n=== caller name extraction ===");
  check(extractPatientName([{ role: "user", text: "Guten Tag, mein Name ist Anna Ackermann." }]) === "Anna Ackermann", "Name aus 'mein Name ist'");
  check(extractPatientName([{ role: "user", text: "Peter Mayer, das ist der Vorname Peter und der Nachname Mayer." }]) === "Peter Mayer", "Name aus 'Vorname … Nachname …'");
  check(extractPatientName([{ role: "user", text: "Ich bin total unzufrieden." }]) === "", "kein Name aus 'ich bin <Adjektiv>' (keine Fehlzuordnung)");
  check(extractPatientName([{ role: "user", text: "Hallo, ich hätte gern einen Termin." }]) === "", "kein Name wenn keiner genannt");

  console.log("\n=== real recorded transcript ===");
  const realPath = process.argv[2] ||
    "F:/Clara-Voice/.run/call_transcripts/clara_MEe4ZQHEzOPzLcexyhdT_c615f9_20260608T161520.json";
  if (existsSync(realPath)) {
    const manifest = JSON.parse(readFileSync(realPath, "utf8"));
    const res = await extractFromTranscript(manifest);
    console.log("  signals:", JSON.stringify(res.signals));
    console.log("  confidence:", res.confidence);
    console.log("  summary:", res.summary);
    check(res.signals.appointmentRequest === true, "Terminwunsch im echten Anruf erkannt");
    console.log("  extrahierter Name:", JSON.stringify(extractPatientName(manifest)));
  } else {
    console.log("  (skip: transcript not found at", realPath + ")");
  }

  console.log("");
  process.exit(failed ? 1 : 0);
}

run();
