import "dotenv/config";
import admin from "../src/firebase.js";
import { buildLetterPdf } from "../src/mail/letter.js";
import { getLetterSettings, setLetterSettings } from "../src/mail/letterSettings.js";
import { listBlocks, createBlock, deleteBlock, seedDefaultBlocks, BLOCK_CATEGORIES } from "../src/mail/letterBlocks.js";

// Verifies the letter editor backend: settings round-trip, text blocks CRUD +
// defaults, and a valid DIN-5008 PDF from settings + signature. Isolated tenant.

const TEST = "zzz-mas2-letter-ed";
const db = admin.firestore();
let failed = 0;
const check = (c, m) => { console.log((c ? "  ok: " : "  FAIL: ") + m); if (!c) failed++; };

async function cleanup() {
  for (const c of ["mas_letter_blocks", "mas_config"]) {
    const snap = await db.collection("clients").doc(TEST).collection(c).get();
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref));
    if (snap.size) await b.commit();
  }
}
await cleanup();

console.log("=== Brief-Editor Backend ===");

// Settings round-trip
const empty = await getLetterSettings(TEST);
check(empty.senderName === "" && "footerRight" in empty, "Leere Settings haben alle Felder");
await setLetterSettings(TEST, { senderName: "Zahnarztpraxis Dr. Petsas", senderAddress: "Hauptstr. 1\n12345 Musterstadt", signatureName: "Dr. Petsas", signatureRole: "Zahnarzt", footerLeft: "Tel 0123" });
const saved = await getLetterSettings(TEST);
check(saved.senderName === "Zahnarztpraxis Dr. Petsas" && saved.signatureRole === "Zahnarzt", "Settings gespeichert + gelesen");
await setLetterSettings(TEST, { footerRight: "USt 123" });
const merged = await getLetterSettings(TEST);
check(merged.senderName === "Zahnarztpraxis Dr. Petsas" && merged.footerRight === "USt 123", "Teil-Update merged, nichts verloren");

// Blocks: seed defaults
const seed = await seedDefaultBlocks(TEST);
check(seed.seeded === 8, "8 Standard-Bausteine geseedet");
const seed2 = await seedDefaultBlocks(TEST);
check(seed2.seeded === 0, "Seed ist idempotent (kein Doppeln)");
let blocks = await listBlocks(TEST);
check(blocks.length === 8, "Bausteine gelistet");
check(BLOCK_CATEGORIES.every((c) => blocks.some((b) => b.category === c)), "Alle Kategorien vertreten");

// Blocks CRUD
const created = await createBlock(TEST, { category: "text", title: "Mahnung", content: "wir möchten Sie höflich erinnern …" });
check(created.ok && created.block.category === "text", "Baustein angelegt");
const bad = await createBlock(TEST, { category: "text", title: "", content: "" });
check(!bad.ok, "Leerer Baustein abgelehnt");
await deleteBlock(TEST, created.block.id);
blocks = await listBlocks(TEST);
check(blocks.length === 8 && !blocks.some((b) => b.id === created.block.id), "Baustein gelöscht");

// PDF from settings + signature
const pdf = await buildLetterPdf({
  settings: merged,
  to: "Herr Karl Huber\nBahnhofstr. 7\n54321 Beispielheim",
  subject: "Ihre Terminbestätigung",
  body: "Sehr geehrter Herr Huber,\n\nhiermit bestätigen wir Ihren Termin am 15.06. um 9 Uhr.",
  signature: { name: "Dr. Petsas", role: "Zahnarzt" },
});
check(Buffer.isBuffer(pdf) && pdf.slice(0, 5).toString() === "%PDF-", "Gültiges PDF mit Briefkopf");
check(pdf.length > 1500, `PDF plausibel groß (${pdf.length} Bytes)`);
check(pdf.slice(-8).toString().includes("EOF"), "PDF korrekt abgeschlossen");

await cleanup();
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
