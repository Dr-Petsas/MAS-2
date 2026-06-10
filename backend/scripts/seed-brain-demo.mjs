import "dotenv/config";
import { buildEvent, CHANNELS, COUNTERPARTY_KINDS, MATCH_STATUS, ITEM_STATUS } from "../src/brain/events.js";
import { buildBriefing, buildSpokenBriefing } from "../src/brain/briefing.js";

// Smoke test for the shared brain. By default it is PURE (no Firestore, no
// credentials): it builds a realistic set of events, aggregates the briefing and
// asserts the read-model behaves. Run with `--write <clientId>` to additionally
// append the events to Firestore and read them back through the store.
//
//   node scripts/seed-brain-demo.mjs
//   node scripts/seed-brain-demo.mjs --write MEe4ZQHEzOPzLcexyhdT

const now = Date.now();
const min = (n) => now - n * 60_000;

// A realistic morning at the practice — the exact kinds of things the user
// listed: callbacks, angry/aborted calls, billing questions, a colleague
// calling about a patient, a "I've been here 3 times and it still hurts", an
// unmatched call, and one item that was already handled (must NOT show up).
const raw = [
  {
    channel: CHANNELS.BIANCA_CALL,
    direction: "in",
    counterparty: { kind: COUNTERPARTY_KINDS.PATIENT, name: "Anna Ackermann" },
    subject: { patientId: "pat_ackermann", name: "Anna Ackermann", matchStatus: MATCH_STATUS.MATCHED },
    summary: "Laut Anruf bittet Frau Ackermann um Rückruf wegen einer Terminverschiebung.",
    signals: { callbackRequested: true, appointmentRequest: true },
    confidence: 0.92,
    extractor: "qwen8b@v1",
    ts: min(180),
  },
  {
    channel: CHANNELS.BIANCA_CALL,
    direction: "in",
    counterparty: { kind: COUNTERPARTY_KINDS.PATIENT, name: "Peter Meier" },
    subject: { patientId: "pat_meier", name: "Peter Meier", matchStatus: MATCH_STATUS.MATCHED },
    summary: "Herr Meier sagt, er sei zum dritten Mal hier und es tue immer noch weh.",
    signals: { complaintStated: true, painPersists: true, repeatVisitStated: true, sentiment: "negative" },
    confidence: 0.81,
    extractor: "qwen8b@v1",
    ts: min(140),
  },
  {
    channel: CHANNELS.BIANCA_CALL,
    direction: "in",
    counterparty: { kind: COUNTERPARTY_KINDS.PATIENT, name: "Frau Meier" },
    subject: { patientId: "pat_meier_g", name: "Gisela Meier", matchStatus: MATCH_STATUS.MATCHED },
    summary: "Frau Meier fragt, wann sie die Rechnung bekommt.",
    signals: { billingQuestion: true },
    confidence: 0.88,
    extractor: "qwen8b@v1",
    ts: min(95),
  },
  {
    channel: CHANNELS.BIANCA_CALL,
    direction: "in",
    counterparty: { kind: COUNTERPARTY_KINDS.COLLEAGUE, name: "Dr. Müller" },
    subject: { patientId: "pat_schulz", name: "Klaus Schulz", matchStatus: MATCH_STATUS.MATCHED },
    summary: "Kollege Dr. Müller hat wegen Patient Klaus Schulz angerufen (Überweisung/Rückfrage).",
    signals: { needsHuman: true },
    confidence: 0.9,
    extractor: "qwen8b@v1",
    ts: min(70),
  },
  {
    channel: CHANNELS.BIANCA_CALL,
    direction: "in",
    counterparty: { kind: COUNTERPARTY_KINDS.PATIENT, name: "unbekannt" },
    subject: { name: "", matchStatus: MATCH_STATUS.UNMATCHED },
    summary: "Anrufer hat das Gespräch verärgert abgebrochen; Patient nicht eindeutig erkannt.",
    signals: { abortedEarly: true, unresolvedByAI: true, sentiment: "negative" },
    confidence: 0.55,
    extractor: "qwen8b@v1",
    ts: min(55),
  },
  {
    channel: CHANNELS.BIANCA_CALL,
    direction: "in",
    counterparty: { kind: COUNTERPARTY_KINDS.PATIENT, name: "Sabine Vogel" },
    subject: { patientId: "pat_vogel", name: "Sabine Vogel", matchStatus: MATCH_STATUS.MATCHED },
    summary: "Frau Vogel bittet um Rückruf zur Befundbesprechung.",
    signals: { callbackRequested: true },
    confidence: 0.86,
    extractor: "qwen8b@v1",
    ts: min(40),
  },
  // Already handled by Lisa -> must be filtered out of the briefing.
  {
    channel: CHANNELS.LISA_CALL,
    direction: "out",
    counterparty: { kind: COUNTERPARTY_KINDS.PATIENT, name: "Tom Berger" },
    subject: { patientId: "pat_berger", name: "Tom Berger", matchStatus: MATCH_STATUS.MATCHED },
    summary: "Rückruf erledigt, neuer Termin vereinbart.",
    signals: { callbackRequested: true },
    status: ITEM_STATUS.RESOLVED,
    confidence: 0.95,
    extractor: "qwen8b@v1",
    ts: min(30),
  },
];

const events = raw.map((e) => buildEvent({ ...e, clientId: "demo" }));

function assert(cond, msg) {
  if (!cond) {
    console.error("ASSERT FAILED:", msg);
    process.exitCode = 1;
  } else {
    console.log("  ok:", msg);
  }
}

console.log("=== PURE pipeline (no Firestore) ===");
const briefing = buildBriefing(events, { windowStart: min(720) });
console.log("counts:", JSON.stringify(briefing.counts));

console.log("\nassertions:");
assert(briefing.counts.openTotal === 6, "6 open items (1 resolved filtered out)");
assert(briefing.counts.callbacks === 2, "2 callbacks (Ackermann, Vogel)");
assert(briefing.counts.billing === 1, "1 billing question (Frau Meier)");
assert(briefing.counts.colleagueCalls === 1, "1 colleague call (Dr. Müller)");
assert(briefing.counts.complaints === 1, "1 complaint (Peter Meier, 3x / pain persists)");
assert(briefing.counts.needsIdentity === 1, "1 unmatched call to verify");
assert(briefing.counts.unresolvedByAI === 0, "no double-counting (Müller->colleague, unmatched->identity)");
assert(
  briefing.groups.colleagueCalls[0]?.aboutPatient === "Klaus Schulz",
  "colleague call names the patient it is about"
);
assert(
  briefing.groups.complaints[0]?.aboutPatient === "",
  "patient's own call does not repeat the patient name"
);

console.log("\n=== Spoken briefing (Clara TTS) ===\n");
console.log(buildSpokenBriefing(briefing, { greeting: "Guten Morgen." }));
console.log("");

const writeIdx = process.argv.indexOf("--write");
if (writeIdx === -1) {
  process.exit(process.exitCode || 0);
}

// --write <clientId>: prove the store end-to-end against Firestore.
const clientId = (process.argv[writeIdx + 1] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
console.log(`\n=== WRITE mode: appending ${events.length} events to ${clientId} ===`);
const { appendEvent, queryRecent } = await import("../src/brain/eventStore.js");

for (const e of raw) {
  const { created } = await appendEvent(clientId, e);
  console.log(`  append ${created ? "created" : "exists"}: ${e.summary.slice(0, 48)}…`);
}

const fetched = await queryRecent(clientId, min(720));
const liveBriefing = buildBriefing(fetched, { windowStart: min(720) });
console.log("\nlive counts from Firestore:", JSON.stringify(liveBriefing.counts));
console.log("\n", buildSpokenBriefing(liveBriefing, { greeting: "Guten Morgen." }));
process.exit(process.exitCode || 0);
