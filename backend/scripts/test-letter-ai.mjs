import "dotenv/config";
import admin from "../src/firebase.js";
import { appendEvent } from "../src/brain/eventStore.js";
import { linkEventToCase } from "../src/brain/caseStore.js";
import { masCollection } from "../src/tenant.js";
import { extractText } from "../src/mail/extract.js";
import { assembleContext, draftLetter } from "../src/mail/letterAI.js";

// Verifies the KI-Schreibhilfe: the shared brain context bundle (calls + e-mails
// + source letter) and the draft path incl. an offline-model fallback that must
// never throw. Isolated tenant; the live model is optional (skipped if offline).

const TEST = "zzz-mas2-letter-ai";
const db = admin.firestore();
let failed = 0;
const check = (c, m) => { console.log((c ? "  ok: " : "  FAIL: ") + m); if (!c) failed++; };

async function cleanup() {
  for (const c of ["mas_cases", "mas_events", "mas_mail_messages"]) {
    const snap = await db.collection("clients").doc(TEST).collection(c).get();
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref));
    if (snap.size) await b.commit();
  }
}
await cleanup();

console.log("=== Textextraktion ===");
const txt = await extractText({ base64: Buffer.from("Sehr geehrte Damen und Herren, ...").toString("base64"), filename: "brief.txt", contentType: "text/plain" });
check(txt.ok && /Sehr geehrte/.test(txt.text), "Text-Datei extrahiert");
const img = await extractText({ base64: "AAAA", filename: "scan.png", contentType: "image/png" });
check(!img.ok && /OCR/.test(img.note || ""), "Bild -> klarer OCR-Hinweis (kein Crash)");
const paste = await extractText({ text: "  direkt eingefügter Brieftext  " });
check(paste.ok && paste.text === "direkt eingefügter Brieftext", "Direkt eingefügter Text übernommen");

console.log("\n=== Kontext-Bündelung aus dem Gehirn ===");
const { event } = await appendEvent(TEST, {
  channel: "bianca_call",
  subject: { patientId: "pat_ai", name: "Karl Huber", matchStatus: "matched" },
  signals: { billingQuestion: true },
  summary: "Herr Huber fragt, warum die Rechnung höher ausfällt als besprochen.",
});
const link = await linkEventToCase(TEST, event);
check(!!link.caseId, "Vorgang aus Telefonat erstellt");

await masCollection(TEST, "mas_mail_messages").add({
  accountId: "acc1", folder: "INBOX", direction: "in", threadId: "t1",
  from: { name: "Karl Huber", address: "huber@example.com" }, to: [{ address: "praxis@example.com" }],
  subject: "Nachfrage zur Rechnung", preview: "ich verstehe die Rechnung nicht ...",
  textBody: "Sehr geehrtes Praxisteam, ich verstehe die Rechnung nicht ...",
  date: Date.now(), seen: false, caseId: link.caseId,
});

const ctx = await assembleContext(TEST, { caseId: link.caseId, sourceText: "Bitte erklären Sie mir die Position 2 auf der Rechnung." });
check(ctx.counts.calls >= 1, `Telefonate im Kontext (${ctx.counts.calls})`);
check(ctx.counts.emails >= 1, `E-Mails im Kontext (${ctx.counts.emails})`);
check(ctx.sourceIncluded === true, "Quellbrief im Kontext markiert");
check(/Vorgang & Telefonate/.test(ctx.contextText) && /Nachfrage zur Rechnung/.test(ctx.contextText) && /Position 2/.test(ctx.contextText), "Kontext bündelt Telefonat + E-Mail + Quellbrief");
console.log("  --- Kontext ---\n" + ctx.contextText.split("\n").map((l) => "    " + l).join("\n"));

console.log("\n=== Entwurf (Fallback wenn Modell offline) ===");
const prevBase = process.env.MAS_LLM_BASE_URL;
process.env.MAS_LLM_BASE_URL = "http://127.0.0.1:1/v1"; // dead port -> connection refused
const off = await draftLetter(TEST, { caseId: link.caseId, recipient: "Herr Karl Huber", direction: "Höflich erklären, dass die Position korrekt ist, und einen Termin anbieten." });
if (prevBase === undefined) delete process.env.MAS_LLM_BASE_URL; else process.env.MAS_LLM_BASE_URL = prevBase;
check(!off.ok && off.fallback === true, "Modell offline -> sauberer Fallback (kein Crash)");
check(typeof off.body === "string" && off.body.length > 0 && typeof off.subject === "string", "Fallback liefert Betreff + Text");

console.log("\n=== Entwurf live (optional, nur wenn Ollama läuft) ===");
const live = await draftLetter(TEST, { caseId: link.caseId, recipient: "Herr Karl Huber", direction: "Höflich erklären, dass die Rechnung korrekt ist, Termin anbieten." });
if (live.ok && !live.fallback) {
  check(live.body.length > 40, `Live-Entwurf erstellt (${live.model}, ${live.body.length} Zeichen)`);
  console.log("  --- Live-Entwurf ---\n  Betreff: " + live.subject + "\n" + live.body.split("\n").map((l) => "    " + l).join("\n"));
} else {
  console.log("  (übersprungen — Modell nicht erreichbar: " + (live.reason || "n/a") + ")");
}

await cleanup();
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
