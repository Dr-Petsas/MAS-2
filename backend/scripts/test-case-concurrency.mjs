import "dotenv/config";
import admin from "../src/firebase.js";
import { appendEvent } from "../src/brain/eventStore.js";
import { linkEventToCase, listCases } from "../src/brain/caseStore.js";

// Proves the duplicate-case race is closed: many contacts about the SAME matter
// (same patient + topic) arriving CONCURRENTLY must converge on exactly ONE case
// via the deterministic id + transaction — never N racing duplicates. Also
// proves idempotency: re-linking the SAME event must not double-count.

const TEST = "zzz-mas2-concurrency";
const db = admin.firestore();
let failed = 0;
const check = (c, m) => { console.log((c ? "  ok: " : "  FAIL: ") + m); if (!c) failed++; };

async function cleanup() {
  for (const c of ["mas_events", "mas_cases"]) {
    const snap = await db.collection("clients").doc(TEST).collection(c).get();
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref));
    if (snap.size) await b.commit();
  }
}
await cleanup();

console.log("=== Vorgangs-Threading: Race-Sicherheit ===");

// 1) Fire N concurrent contacts for the same patient + billing topic.
const N = 12;
const events = [];
for (let i = 0; i < N; i++) {
  const { event } = await appendEvent(TEST, {
    channel: "bianca_call", counterparty: { kind: "patient" },
    subject: { patientId: "p_race", name: "Rainer Renner", matchStatus: "matched" },
    summary: `Rechnungsfrage Kontakt #${i + 1}.`,
    signals: { billingQuestion: true },
  });
  events.push(event);
}
const results = await Promise.all(events.map((e) => linkEventToCase(TEST, e)));

const caseIds = [...new Set(results.map((r) => r.caseId))];
check(caseIds.length === 1, `Alle ${N} gleichzeitigen Kontakte -> genau 1 Vorgang (waren ${caseIds.length})`);
const createdCount = results.filter((r) => r.created).length;
check(createdCount === 1, `Nur 1x "created" trotz Nebenläufigkeit (war ${createdCount}x)`);

// Confirm Firestore really holds a single case with the full count.
const cases = await listCases(TEST, { patientId: "p_race" });
check(cases.length === 1, `Firestore enthält genau 1 Vorgang (waren ${cases.length})`);
check(cases[0]?.contactCount === N, `contactCount = ${N} (war ${cases[0]?.contactCount})`);
check((cases[0]?.eventIds || []).length === N, `alle ${N} Events verknüpft (waren ${(cases[0]?.eventIds || []).length})`);

// 2) Idempotency: re-link the first event again — no double count.
await linkEventToCase(TEST, events[0]);
const again = await listCases(TEST, { patientId: "p_race" });
check(again[0]?.contactCount === N, `Erneutes Verknüpfen desselben Events zählt nicht doppelt (count=${again[0]?.contactCount})`);

await cleanup();
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
