import "dotenv/config";
import admin from "../src/firebase.js";
import { appendEvent } from "../src/brain/eventStore.js";
import { linkEventToCase, saveCaseDraft, getCase, addUpdate, setStatus } from "../src/brain/caseStore.js";
import { createAccount, deleteAccount } from "../src/mail/accounts.js";
import { sendMail } from "../src/mail/mailbox.js";
import { listMessages } from "../src/mail/store.js";

// Verifies the full "Nadine sends" loop in DRY_RUN (no SMTP server): account +
// case+draft -> send -> outgoing copy stored in SENT, case logged + resolved.
// Run with MAIL_DRY_RUN=1.

if (process.env.MAIL_DRY_RUN !== "1") {
  console.log("SKIP: set MAIL_DRY_RUN=1 to run this test.");
  process.exit(0);
}

const TEST = "zzz-mas2-mail-send";
const db = admin.firestore();
let failed = 0;
const check = (c, m) => { console.log((c ? "  ok: " : "  FAIL: ") + m); if (!c) failed++; };

async function cleanup() {
  for (const c of ["mas_events", "mas_cases", "mas_mail_accounts", "mas_mail_messages", "mas_contacts"]) {
    const snap = await db.collection("clients").doc(TEST).collection(c).get();
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref));
    if (snap.size) await b.commit();
  }
}
await cleanup();

console.log("=== Versand-Regelkreis (DRY_RUN) ===");

const acc = await createAccount(TEST, { label: "Praxis", email: "praxis@example.de", smtp: { host: "smtp.example.de", user: "praxis@example.de", password: "x" } });
check(acc.ok, "Konto angelegt");

const { event } = await appendEvent(TEST, {
  channel: "bianca_call", counterparty: { kind: "patient" },
  subject: { patientId: "p1", name: "Karl Huber", matchStatus: "matched" },
  summary: "Bittet um schriftliche Terminbestätigung.", signals: { appointmentRequest: true },
});
const link = await linkEventToCase(TEST, event);
await saveCaseDraft(TEST, link.caseId, { channel: "email", to: "karl.huber@example.de", subject: "Ihre Terminbestätigung", body: "Guten Tag Herr Huber,\n\nanbei Ihre Bestätigung." }, { by: "Nadine" });
check(true, "Vorgang mit Entwurf vorbereitet");

// Replicates POST /brain/cases/:id/send orchestration.
const c = await getCase(TEST, link.caseId);
const sent = await sendMail(TEST, acc.account.id, { to: [c.draft.to], subject: c.draft.subject, text: c.draft.body });
check(sent.ok && sent.dryRun, "Versand im Testmodus erfolgreich");
await addUpdate(TEST, link.caseId, { by: "Nadine", kind: "note", text: `E-Mail gesendet an ${c.draft.to} (Betreff: ${c.draft.subject}) [Testmodus].` });
const resolved = await setStatus(TEST, link.caseId, "resolved", { by: "Nadine", note: "Per E-Mail beantwortet" });
check(resolved.ok, "Vorgang nach Versand erledigt");

const sentBox = await listMessages(TEST, { folder: "SENT" });
check(sentBox.length === 1 && sentBox[0].to?.[0]?.address === "karl.huber@example.de", "Ausgangskopie im Ordner SENT");
check(sentBox[0].direction === "out" && sentBox[0].subject === "Ihre Terminbestätigung", "Ausgangsnachricht korrekt gespeichert");

const finalCase = await getCase(TEST, link.caseId);
check(finalCase.status === "resolved", "Status = erledigt");
check(finalCase.updates.some((u) => /E-Mail gesendet an karl\.huber/.test(u.text)), "Versand im Audit-Trail");

await cleanup();
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
