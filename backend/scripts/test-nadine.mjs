import "dotenv/config";
import admin from "../src/firebase.js";
import { appendEvent } from "../src/brain/eventStore.js";
import { linkEventToCase, assignCase, listCases, getCaseContext, saveCaseDraft, setStatus } from "../src/brain/caseStore.js";

// Verifies the Clara -> Nadine delegation loop end to end (no email infra):
// contact -> case -> assign to Nadine -> appears in Nadine's list -> context +
// suggested draft -> save draft -> resolve. Isolated test tenant, cleaned up.

const TEST = "zzz-mas2-nadine";
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

console.log("=== Clara -> Nadine Delegations-Regelkreis ===");

// 1) a billing contact creates a case
const { event } = await appendEvent(TEST, {
  channel: "bianca_call", counterparty: { kind: "patient" },
  subject: { patientId: "p_meier", name: "Gisela Meier", matchStatus: "matched" },
  summary: "Frau Meier fragt nach der Rechnung und bittet um schriftliche Aufstellung.",
  signals: { billingQuestion: true },
});
const link = await linkEventToCase(TEST, event);
check(link.created, "Vorgang aus Kontakt angelegt");

// 2) Clara delegates to Nadine
const asg = await assignCase(TEST, link.caseId, { assignee: "Nadine", instruction: "Schriftliche Rechnungsaufstellung per E-Mail senden.", by: "Dr. Petsas" });
check(asg.ok && asg.assignee === "Nadine", "An Nadine delegiert");

// 3) Nadine's workspace lists it
const nadineCases = await listCases(TEST, { assignee: "Nadine", activeOnly: true });
check(nadineCases.length === 1 && nadineCases[0].id === link.caseId, "Vorgang erscheint in Nadines Liste (assignee-Filter)");
const otherList = await listCases(TEST, { assignee: "Lisa", activeOnly: true });
check(otherList.length === 0, "Lisa sieht den Vorgang NICHT (Filter trennt sauber)");

// 4) full context + suggested draft (start from a written draft, not blank)
const ctx = await getCaseContext(TEST, link.caseId);
check(/Auftrag an Nadine/.test(ctx.contextText), "Kontext enthält den Auftrag");
check(/Verlauf der Kontakte/.test(ctx.contextText), "Kontext enthält den Verlauf");
check(!!ctx.suggestedDraft && ctx.suggestedDraft.subject === "Ihre Rechnung", "Vorschlagsentwurf mit passendem Betreff");
check(/Guten Tag Gisela Meier,/.test(ctx.suggestedDraft.body), "Entwurf mit persönlicher Anrede");
console.log("  --- Vorschlagsentwurf ---");
console.log("    Betreff:", ctx.suggestedDraft.subject);
console.log(ctx.suggestedDraft.body.split("\n").map((l) => "    " + l).join("\n"));

// 5) Nadine saves a draft -> stored + logged + status in_progress
const saved = await saveCaseDraft(TEST, link.caseId, {
  channel: "email", to: "g.meier@example.com", subject: "Ihre Rechnung",
  body: "Guten Tag Frau Meier,\n\nanbei die gewünschte Aufstellung.\n\nMit freundlichen Grüßen\nIhr Praxisteam",
}, { by: "Nadine" });
check(saved.ok && saved.draft.to === "g.meier@example.com", "Entwurf gespeichert");
const after = (await listCases(TEST, { assignee: "Nadine" }))[0];
check(after.status === "waiting_approval", "Status auf waiting_approval (Entwurf wartet auf Freigabe)");
check(!!after.draft && after.draft.subject === "Ihre Rechnung", "Entwurf am Vorgang hinterlegt");
check(after.updates.some((u) => /Entwurf .*vorbereitet/.test(u.text)), "Entwurf im Audit-Trail protokolliert");

// 6) resolve
const done = await setStatus(TEST, link.caseId, "resolved", { by: "Nadine", note: "Rechnung versendet" });
check(done.ok, "Vorgang als erledigt markiert");
const stillOpen = await listCases(TEST, { assignee: "Nadine", activeOnly: true });
check(stillOpen.length === 0, "Nach Erledigung nicht mehr in offener Liste");

await cleanup();
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
