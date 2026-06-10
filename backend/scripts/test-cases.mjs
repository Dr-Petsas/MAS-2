import "dotenv/config";
import admin from "../src/firebase.js";
import { appendEvent } from "../src/brain/eventStore.js";
import { deriveTopic, buildCase, buildUpdate, actorForChannel, TOPICS } from "../src/brain/cases.js";
import { linkEventToCase, getCase, setStatus, addUpdate, listCases, assignCase, getCaseContext } from "../src/brain/caseStore.js";
import { buildCaseBriefing, buildSpokenCaseBriefing } from "../src/brain/caseBriefing.js";

// Tests the Vorgang (case) layer. Pure model checks + an isolated Firestore
// integration run against a throwaway test client that is deleted afterwards
// (no real tenant is touched). Run: node scripts/test-cases.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const TEST_CLIENT = "zzz-mas2-selftest";
const db = admin.firestore();

async function cleanup() {
  for (const c of ["mas_cases", "mas_events"]) {
    const snap = await db.collection("clients").doc(TEST_CLIENT).collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

async function run() {
  console.log("=== pure model ===");
  check(deriveTopic({ billingQuestion: true }) === TOPICS.BILLING, "Topic aus Signal abgeleitet (Rechnung)");
  check(deriveTopic({ painPersists: true }) === TOPICS.COMPLAINT, "Schmerz -> Beschwerde-Topic");
  check(actorForChannel("bianca_call") === "Bianca", "Kanal -> Urheber (Bianca)");
  const c = buildCase({ clientId: "x", topic: TOPICS.BILLING, subject: { patientId: "p1", name: "Gisela Meier" } });
  check(c.title === "Rechnung/Kosten – Gisela Meier", `Default-Titel ("${c.title}")`);
  const u = buildUpdate({ by: "Lisa", text: "angerufen", kind: "contact" });
  check(u.by === "Lisa" && typeof u.ts === "number", "Update traegt Urheber + Zeitstempel");

  console.log("\n=== Firestore integration (isolierter Test-Mandant) ===");
  await cleanup();

  // Mirror the real flow: persist the event, then thread it into a case.
  const ingest = async (summary, signals = { billingQuestion: true }) => {
    const { event } = await appendEvent(TEST_CLIENT, {
      channel: "bianca_call",
      subject: { patientId: "pat_test", name: "Gisela Meier", matchStatus: "matched" },
      signals,
      summary,
    });
    return linkEventToCase(TEST_CLIENT, event);
  };

  const l1 = await ingest("Frau Meier fragt nach der Rechnung.");
  check(l1.created === true, "1. Kontakt -> neuer Vorgang");

  const l2 = await ingest("Frau Meier fragt erneut nach der Rechnung.");
  check(l2.created === false && l2.caseId === l1.caseId, "2. Kontakt -> selber Vorgang (Threading)");

  let caseDoc = await getCase(TEST_CLIENT, l1.caseId);
  check(caseDoc.contactCount === 2, `contactCount = 2 (war ${caseDoc.contactCount})`);
  check((caseDoc.updates || []).length >= 2, "Verlauf enthaelt beide Kontakte");

  await setStatus(TEST_CLIENT, l1.caseId, "resolved", { by: "Team", note: "Rechnung verschickt" });
  caseDoc = await getCase(TEST_CLIENT, l1.caseId);
  check(caseDoc.status === "resolved", "Status auf resolved gesetzt");
  check((caseDoc.updates || []).some((x) => x.kind === "status" && x.statusTo === "resolved"), "Status-Wechsel im Verlauf protokolliert");

  const l3 = await ingest("Frau Meier ruft schon wieder wegen der Rechnung an.");
  check(l3.reopened === true && l3.caseId === l1.caseId, "Erneuter Kontakt nach Abschluss -> Vorgang wiedereroeffnet");
  caseDoc = await getCase(TEST_CLIENT, l1.caseId);
  check(caseDoc.status === "open" && caseDoc.contactCount === 3, "Wieder offen, contactCount = 3");

  // different topic -> separate thread
  const lAppt = await ingest("moechte Termin verschieben", { appointmentRequest: true });
  check(lAppt.created === true && lAppt.caseId !== l1.caseId, "Anderes Thema -> eigener Vorgang");

  const active = await listCases(TEST_CLIENT, { activeOnly: true });
  check(active.length === 2, `2 aktive Vorgaenge gelistet (waren ${active.length})`);

  await addUpdate(TEST_CLIENT, l1.caseId, { by: "Clara", kind: "note", text: "Patientin informiert." });
  caseDoc = await getCase(TEST_CLIENT, l1.caseId);
  check((caseDoc.updates || []).some((x) => x.by === "Clara" && x.text === "Patientin informiert."), "Manuelles Update mit Urheber gespeichert");

  console.log("\n=== Regelkreis: delegieren, Kontext, Briefing ===");
  const asg = await assignCase(TEST_CLIENT, l1.caseId, { assignee: "Nadine", instruction: "Förmlichen Brief zur Rechnung vorbereiten.", by: "Clara" });
  check(asg.ok && asg.assignee === "Nadine", "An Nadine delegiert");
  caseDoc = await getCase(TEST_CLIENT, l1.caseId);
  check(caseDoc.assignee === "Nadine" && caseDoc.status === "in_progress", "assignee gesetzt + Status in_progress");
  check(!!caseDoc.handoff && caseDoc.handoff.instruction.includes("Brief"), "Auftrag/Instruktion gespeichert");

  const ctx = await getCaseContext(TEST_CLIENT, l1.caseId);
  check(ctx && ctx.events.length >= 1, "Kontextbuendel enthaelt verknuepfte Events");
  check(/Verlauf der Kontakte/.test(ctx.contextText) && /Auftrag an Nadine/.test(ctx.contextText), "Kompilierter Kontext mit Verlauf + Auftrag");
  console.log("  --- Kontext fuer Nadine ---\n" + ctx.contextText.split("\n").map((l) => "    " + l).join("\n"));

  const allCases = await listCases(TEST_CLIENT, {});
  const cb = buildCaseBriefing(allCases);
  check(cb.counts.openTotal === 2, `Vorgangs-Briefing zaehlt 2 offene (waren ${cb.counts.openTotal})`);
  const spoken = buildSpokenCaseBriefing(cb, { greeting: "Guten Morgen." });
  check(/seit 3 Kontakten offen/.test(spoken), "Briefing nennt Wiederholungskontakte");
  check(/delegiert an Nadine/.test(spoken), "Briefing nennt Delegation");
  console.log("  spoken: " + spoken);

  await cleanup();
  console.log("\n(cleanup done)\n");
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
