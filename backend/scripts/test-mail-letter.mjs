import "dotenv/config";
import admin from "../src/firebase.js";
import { buildLetterPdf, letterFilename } from "../src/mail/letter.js";
import { appendEvent } from "../src/brain/eventStore.js";
import { linkEventToCase, saveCaseDraft, getCase, addUpdate } from "../src/brain/caseStore.js";
import { runOnce } from "../src/mail/scheduler.js";

// Verifies: a valid PDF is produced; the case-letter loop saves a letter draft +
// logs it; the auto-sync sweep runs without error. Isolated tenant, cleaned up.

const TEST = "zzz-mas2-letter";
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

console.log("=== Brief-PDF & Scheduler ===");

// 1) PDF generation
const pdf = await buildLetterPdf({
  practice: { name: "Zahnarztpraxis Dr. Petsas", address: "Hauptstr. 1\n12345 Musterstadt", contact: "Tel 0123-456 · praxis@example.de" },
  to: "Herr Karl Huber\nBahnhofstr. 7\n54321 Beispielheim",
  subject: "Ihre Terminbestätigung",
  body: "Guten Tag Herr Huber,\n\nhiermit bestätigen wir Ihren Termin am 15.06.\n\nMit freundlichen Grüßen\nIhr Praxisteam",
});
check(Buffer.isBuffer(pdf), "PDF ist ein Buffer");
check(pdf.slice(0, 5).toString() === "%PDF-", "Beginnt mit %PDF-Header");
check(pdf.length > 1200, `PDF hat plausible Größe (${pdf.length} Bytes)`);
check(pdf.slice(-6).toString().includes("EOF"), "Endet mit EOF-Marker");
check(/\.pdf$/.test(letterFilename("Ihre Terminbestätigung")), "Dateiname endet auf .pdf");

// 2) Case-letter loop (replicates POST /brain/cases/:id/letter persistence)
const { event } = await appendEvent(TEST, {
  channel: "bianca_call", counterparty: { kind: "patient" },
  subject: { patientId: "p1", name: "Karl Huber", matchStatus: "matched" },
  summary: "Bittet um schriftliche Bestätigung.", signals: { documentRelated: true },
});
const link = await linkEventToCase(TEST, event);
const filename = letterFilename("Ihre Terminbestätigung");
await saveCaseDraft(TEST, link.caseId, { channel: "letter", to: "Karl Huber", subject: "Ihre Terminbestätigung", body: "Guten Tag …" }, { by: "Nadine" });
await addUpdate(TEST, link.caseId, { by: "Nadine", kind: "note", text: `Brief als PDF erstellt: ${filename}.` });
const c = await getCase(TEST, link.caseId);
check(c.draft?.channel === "letter", "Entwurf als Brief gespeichert");
check(c.updates.some((u) => /Brief als PDF erstellt/.test(u.text)), "Brief im Audit-Trail protokolliert");

// 3) Auto-sync sweep runs cleanly (0 real IMAP accounts expected here)
const sweep = await runOnce();
check(sweep.ok && typeof sweep.accounts === "number", `Scheduler-Lauf ok (Praxen: ${sweep.tenants}, Konten: ${sweep.accounts})`);

await cleanup();
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
