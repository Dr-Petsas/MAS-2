import "dotenv/config";
import admin from "../src/firebase.js";
import { appendEvent } from "../src/brain/eventStore.js";
import { linkEventToCase, saveCaseDraft } from "../src/brain/caseStore.js";
import { buildMailBriefing } from "../src/mail/briefing.js";

// Verifies Nadine's spoken briefing: counts new/unread mail today + delegation
// tasks (and how many already have a draft). Seeds inbound messages directly,
// isolated tenant, cleaned up.

const TEST = "zzz-mas2-mbrief";
const db = admin.firestore();
let failed = 0;
const check = (c, m) => { console.log((c ? "  ok: " : "  FAIL: ") + m); if (!c) failed++; };

const msgsCol = db.collection("clients").doc(TEST).collection("mas_mail_messages");

async function cleanup() {
  for (const c of ["mas_events", "mas_cases", "mas_mail_messages"]) {
    const snap = await db.collection("clients").doc(TEST).collection(c).get();
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref));
    if (snap.size) await b.commit();
  }
}
await cleanup();

console.log("=== Nadine-Briefing ===");

// Seed 3 inbound mails today (2 unread), 2 from the same sender.
const now = Date.now();
const seed = [
  { from: { name: "Karl Huber", address: "karl@x.de" }, subject: "Frage", seen: false },
  { from: { name: "Karl Huber", address: "karl@x.de" }, subject: "Nachtrag", seen: false },
  { from: { name: "Labor Nord", address: "labor@x.de" }, subject: "Befund", seen: true },
];
for (let i = 0; i < seed.length; i++) {
  await msgsCol.doc(`seed_${i}`).set({ accountId: "a1", folder: "INBOX", direction: "in", from: seed[i].from, to: [], subject: seed[i].subject, date: now - i * 60000, seen: seed[i].seen, preview: "…", hasAttachments: false });
}

// Two Nadine tasks, one with a prepared draft.
const e1 = (await appendEvent(TEST, { channel: "bianca_call", counterparty: { kind: "patient" }, subject: { patientId: "p1", name: "Anna Meier", matchStatus: "matched" }, summary: "Rechnung.", signals: { billingQuestion: true } })).event;
const l1 = await linkEventToCase(TEST, e1);
await import("../src/brain/caseStore.js").then((m) => m.assignCase(TEST, l1.caseId, { assignee: "Nadine", instruction: "Rechnung senden", by: "Clara" }));
await saveCaseDraft(TEST, l1.caseId, { channel: "email", to: "anna@x.de", subject: "Ihre Rechnung", body: "..." }, { by: "Nadine" });

const e2 = (await appendEvent(TEST, { channel: "bianca_call", counterparty: { kind: "patient" }, subject: { patientId: "p2", name: "Bert Klein", matchStatus: "matched" }, summary: "Unterlagen.", signals: { documentRelated: true } })).event;
const l2 = await linkEventToCase(TEST, e2);
await import("../src/brain/caseStore.js").then((m) => m.assignCase(TEST, l2.caseId, { assignee: "Nadine", instruction: "Unterlagen schicken", by: "Clara" }));

const b = await buildMailBriefing(TEST, { sinceMinutes: 720 });
console.log("  Text:", b.spokenText);
check(b.counts.newMail === 3, "3 neue E-Mails erkannt");
check(b.counts.unread === 2, "2 ungelesen erkannt");
check(b.counts.openTasks === 2, "2 Aufträge erkannt");
check(b.counts.draftsReady === 1, "1 Entwurf bereit erkannt");
check(/3 neue E-Mails/.test(b.spokenText) && /2 davon noch ungelesen/.test(b.spokenText), "Text nennt neue/ungelesene Mails");
check(/Karl Huber/.test(b.spokenText), "Text nennt den Hauptabsender");
check(/2 offene Schreibaufträge/.test(b.spokenText) && /1 ist schon ein Entwurf/.test(b.spokenText), "Text nennt Aufträge + Entwurf");

// Empty case
await cleanup();
const empty = await buildMailBriefing(TEST, {});
check(empty.counts.newMail === 0 && empty.counts.openTasks === 0, "Leerer Stand korrekt gezählt");
check(/keine neuen E-Mails/.test(empty.spokenText) && /Schreibaufträge gibt es gerade keine/.test(empty.spokenText), "Leer-Text sinnvoll");

await cleanup();
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
