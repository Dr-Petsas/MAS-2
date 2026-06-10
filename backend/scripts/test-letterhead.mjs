import "dotenv/config";
import admin from "../src/firebase.js";
import { PDFDocument } from "pdf-lib";
import { buildLetterPdf } from "../src/mail/letter.js";
import { saveLetterheadAsset, getLetterheadMeta, getLetterheadBuffer, deleteLetterheadAsset, listLetterheads, setActiveLetterhead, deleteLetterhead } from "../src/mail/letterhead.js";
import { setLetterSettings, getLetterSettings } from "../src/mail/letterSettings.js";

// Verifies the branded-letterhead feature: upload (inline fallback), settings
// switch + bodyTopMm clamp, and rendering a letter on top of both a PDF
// letterhead (pdf-lib overlay) and an image letterhead (pdfkit background).

const TEST = "zzz-mas2-letterhead";
const db = admin.firestore();
let failed = 0;
const check = (c, m) => { console.log((c ? "  ok: " : "  FAIL: ") + m); if (!c) failed++; };

async function cleanup() {
  for (const colName of ["mas_config", "mas_letterheads"]) {
    const snap = await db.collection("clients").doc(TEST).collection(colName).get();
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref));
    if (snap.size) await b.commit();
  }
}
await cleanup();

// A tiny valid letterhead PDF and a 1x1 PNG.
const lhDoc = await PDFDocument.create();
const lhPage = lhDoc.addPage([595, 842]);
lhPage.drawText("MUSTERPRAXIS — Briefkopf", { x: 50, y: 800, size: 14 });
const lhPdfB64 = Buffer.from(await lhDoc.save()).toString("base64");
const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

console.log("=== Settings: Modus + bodyTopMm ===");
const def = await getLetterSettings(TEST);
check(def.letterheadMode === "text" && def.bodyTopMm === 0, "Default: Textmodus, kein Offset");
const clamp = await setLetterSettings(TEST, { bodyTopMm: 999 });
check(clamp.settings.bodyTopMm === 120, "bodyTopMm wird auf max 120 begrenzt");

console.log("\n=== Upload PDF-Briefkopf (inline fallback) ===");
const up = await saveLetterheadAsset(TEST, { base64: lhPdfB64, filename: "briefkopf.pdf", contentType: "application/pdf" });
check(up.ok && up.asset.kind === "pdf", "PDF-Briefkopf gespeichert");
const meta = await getLetterheadMeta(TEST);
check(meta && meta.kind === "pdf" && meta.size > 0, "Meta lesbar (ohne Binärdaten)");
const buf = await getLetterheadBuffer(TEST);
check(buf && buf.kind === "pdf" && Buffer.isBuffer(buf.buffer), "Briefkopf-Bytes wieder ladbar");

console.log("\n=== Brief auf PDF-Briefkopf (Overlay) ===");
const merged = await buildLetterPdf({
  settings: { signatureName: "Dr. Muster", bodyTopMm: 10 },
  letterhead: buf,
  to: "Herr Karl Huber\nBahnhofstr. 7\n54321 Beispielheim",
  subject: "Ihre Terminbestätigung",
  body: "Sehr geehrter Herr Huber,\n\nhiermit bestätigen wir Ihren Termin.",
});
check(Buffer.isBuffer(merged) && merged.slice(0, 5).toString() === "%PDF-", "Overlay liefert gültiges PDF");
check(merged.slice(-8).toString().includes("EOF"), "PDF korrekt abgeschlossen");
const mergedDoc = await PDFDocument.load(merged);
check(mergedDoc.getPageCount() === 1, "Eine Seite (Briefkopf + Text verschmolzen)");

console.log("\n=== Bild-Briefkopf (Hintergrund) ===");
await saveLetterheadAsset(TEST, { base64: pngB64, filename: "kopf.png", contentType: "image/png" });
const imgBuf = await getLetterheadBuffer(TEST);
check(imgBuf && imgBuf.kind === "image", "Bild-Briefkopf gespeichert + geladen");
const imgPdf = await buildLetterPdf({ settings: {}, letterhead: imgBuf, to: "Herr Huber", subject: "Test", body: "Text auf Bild-Briefkopf." });
check(Buffer.isBuffer(imgPdf) && imgPdf.slice(0, 5).toString() === "%PDF-", "Bild-Briefkopf -> gültiges PDF");

console.log("\n=== Platzhalter-Layout (letterLayout) ===");
const badLayout = { date: { x: 999, y: -5 }, body: { x: 25, y: 120, w: 150 }, junk: { x: 1 } };
const savedLay = await setLetterSettings(TEST, { letterLayout: badLayout });
const lay = savedLay.settings.letterLayout;
check(lay.date.x === 210 && lay.date.y === 0, "Koordinaten werden auf A4 begrenzt");
check(!("junk" in lay) && lay.body.y === 120, "Unbekannte Slots verworfen, gültige übernommen");
const layPdf = await buildLetterPdf({
  settings: { signatureName: "Dr. Muster", letterLayout: lay },
  to: "Herr Huber", subject: "Layout-Test", body: "Sehr geehrter Herr Huber,\n\nText.",
});
check(Buffer.isBuffer(layPdf) && layPdf.slice(0, 5).toString() === "%PDF-", "Brief mit Layout -> gültiges PDF");
await setLetterSettings(TEST, { letterLayout: null });

console.log("\n=== Zu große Datei ===");
// Behaviour depends on whether a Cloud Storage bucket is configured: with a
// bucket the file is accepted (stored out-of-line); without one it must be
// clearly rejected as too_large.
let hasBucket = false;
try { hasBucket = !!admin.storage().bucket()?.name; } catch { hasBucket = false; }
const big = Buffer.alloc(1000 * 1024, 1).toString("base64");
const tooBig = await saveLetterheadAsset(TEST, { base64: big, filename: "gross.pdf", contentType: "application/pdf" });
if (hasBucket) {
  check(tooBig.ok && tooBig.asset?.size > 0, "Große Datei wird im Cloud-Storage abgelegt (Bucket vorhanden)");
} else {
  check(!tooBig.ok && tooBig.error === "too_large", "Zu große Datei wird ohne Cloud-Storage klar abgelehnt");
}

console.log("\n=== Mehrere Briefköpfe: Liste + aktiv wählen ===");
const listed = await listLetterheads(TEST);
check(listed.items.length === 3, `Liste enthält alle Uploads (${listed.items.length})`);
check(!!listed.activeId, "Es gibt einen aktiven Briefkopf");
// Bild-Eintrag hat eine Vorschau (data-/signed-URL), PDF nicht.
const imgItem = listed.items.find((i) => i.kind === "image");
check(imgItem && !!imgItem.preview, "Bild-Briefkopf hat eine Vorschau");
// Einen anderen aktiv setzen.
const other = listed.items.find((i) => i.id !== listed.activeId);
const act = await setActiveLetterhead(TEST, other.id);
check(act.ok && act.activeId === other.id, "Anderer Briefkopf als aktiv gesetzt");
check((await getLetterheadMeta(TEST)).id === other.id, "Aktiver Briefkopf korrekt geladen");

console.log("\n=== Entfernen ===");
// Aktiven löschen -> ein anderer wird automatisch aktiv.
await deleteLetterhead(TEST, other.id);
const afterOne = await listLetterheads(TEST);
check(afterOne.items.length === 2 && !!afterOne.activeId, "Nach Löschen: 2 übrig, neuer aktiver gesetzt");
// Rest über die Alt-Route (aktiven entfernen) leeren.
await deleteLetterheadAsset(TEST);
await deleteLetterheadAsset(TEST);
check((await getLetterheadMeta(TEST)) === null, "Alle Briefköpfe entfernt");

await cleanup();
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
