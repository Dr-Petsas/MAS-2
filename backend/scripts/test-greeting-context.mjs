import { pickFreshNotable, spokenFreshEvent, GREETING_FRESH_MS } from "../src/clara/greetingContext.js";

// Begruessungs-Kontext (W-HUMAN Stufe 2): pure Auswahl-Logik, ohne Firestore.
// Run: node scripts/test-greeting-context.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const NOW = Date.parse("2026-07-10T09:00:00+02:00");
const min = (n) => NOW - n * 60000;

function ev(over = {}) {
  return {
    id: over.id || `e-${Math.random().toString(36).slice(2, 8)}`,
    ts: over.ts ?? min(10),
    channel: over.channel || "bianca_call",
    direction: over.direction || "in",
    type: over.type || "interaction",
    status: over.status || "open",
    summary: over.summary ?? "Anruf von Frau Meier: hat weiterhin Schmerzen nach der Füllung.",
    signals: over.signals || { painPersists: true },
  };
}

console.log("=== pickFreshNotable ===");
const fresh = ev({ id: "a", ts: min(12) });
check(pickFreshNotable([fresh], NOW)?.id === "a", "frischer Schmerz-Anruf wird gewaehlt");

// Frische-Fenster: 46 min alt -> zu alt.
check(pickFreshNotable([ev({ ts: NOW - GREETING_FRESH_MS - 60000 })], NOW) === null, "aelter als Fenster -> null");

// Kalender-Automatik (channel system) interessiert die Begruessung nicht.
check(pickFreshNotable([ev({ channel: "system" })], NOW) === null, "system-Kanal (Kalender-Echo) -> null");
check(pickFreshNotable([ev({ channel: "clara_voice" })], NOW) === null, "Claras eigene Sitzung -> null");

// Unauffaellig (keine Signale, status none) -> still.
check(pickFreshNotable([ev({ signals: {}, status: "none" })], NOW) === null, "unauffaelliges Ereignis -> null");

// Ausgehende Routine (Lisa-Recall out, keine Kritik) zaehlt nicht ...
check(pickFreshNotable([ev({ channel: "lisa_call", direction: "out", signals: {}, status: "open" })], NOW) === null
  || pickFreshNotable([ev({ channel: "lisa_call", direction: "out", signals: {}, status: "open" })], NOW) === null,
"ausgehende Routine ohne Kritik -> null");
// ... aber ein kritisches Ereignis schon (auch out).
check(pickFreshNotable([ev({ channel: "nadine_letter", direction: "out", signals: { critical: true } })], NOW) !== null, "kritisch (Anwalt/Mahnung) zaehlt immer");

// Ohne Zusammenfassung gibt es nichts vorzulesen.
check(pickFreshNotable([ev({ summary: "" })], NOW) === null, "ohne summary -> null");

// Juengstes gewinnt.
const older = ev({ id: "alt", ts: min(40) });
const newer = ev({ id: "neu", ts: min(5) });
check(pickFreshNotable([older, newer], NOW)?.id === "neu", "juengstes auffaelliges Ereignis gewinnt");

// humanReview-Korrektur wird angewendet (korrigierte summary gewinnt).
const reviewed = { ...ev({ id: "hr", ts: min(8) }), humanReview: { summary: "Korrigiert: Anruf von Frau Maier (nicht Meier)." } };
check(/Maier/.test(pickFreshNotable([reviewed], NOW)?.summary || ""), "humanReview-Korrektur greift");

console.log("\n=== spokenFreshEvent ===");
const line = spokenFreshEvent(ev({ ts: min(12) }), NOW);
check(/vor 12 Minuten/.test(line), "relative Zeit ('vor 12 Minuten')");
check(/Schmerzen nach der Füllung/.test(line), "woertliche Ereignis-Zusammenfassung enthalten");
check(spokenFreshEvent(null) === "", "null -> leer");
const justNow = spokenFreshEvent(ev({ ts: min(1) }), NOW);
check(/gerade eben/.test(justNow), "unter 3 Minuten -> 'gerade eben'");
const lange = spokenFreshEvent(ev({ ts: min(44) }), NOW);
check(/vor 44 Minuten/.test(lange), "aeltester Rand -> 'vor 44 Minuten'");
// Lange Zusammenfassungen werden gekappt (Sprache ist linear).
const longSummary = spokenFreshEvent(ev({ summary: "x".repeat(400) }), NOW);
check(longSummary.length < 280, "lange summary wird gekappt");

console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : "ALL CHECKS PASSED"}`);
process.exit(failed ? 1 : 0);
