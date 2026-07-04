import "dotenv/config";
import admin from "../src/firebase.js";
import { PDFParse } from "pdf-parse";

// ============================================================================
// Probe (04.07.2026): Sind unterschriebene Anamnese-PDFs maschinell lesbar?
// Die Plattform loescht formRows nach dem Signieren und behaelt nur das PDF
// (pdfmake, Cloud Function saveDocumentAndCreatePDF). pdfmake schreibt eine
// ECHTE Textebene (kein Scan) — wenn das stimmt, koennen wir die Antworten
// per Textextraktion zurueckgewinnen. Kaestchen sind Fontello-Glyphen:
//   \ue800 = angekreuzt, \uf096 = leer.
// Dieses Skript sucht unterschriebene Anamnesen, laedt die PDFs und zeigt,
// was extrahierbar ist. NUR LESEN, keine Schreibzugriffe.
// ============================================================================

const CLIENT = "MEe4ZQHEzOPzLcexyhdT";
const db = admin.firestore();
const bucket = admin.storage().bucket();

const locSnap = await db.collection("clients").doc(CLIENT).collection("locations").limit(1).get();
const locationId = locSnap.docs[0]?.id;
if (!locationId) { console.error("keine Location"); process.exit(1); }
console.log(`Location: ${locationId}\n`);

// Alle Patienten durchgehen, unterschriebene Anamnesen einsammeln (max 5).
const patSnap = await db.collection("clients").doc(CLIENT)
  .collection("locations").doc(locationId)
  .collection("patients").get();
console.log(`${patSnap.size} Patienten, suche unterschriebene Anamnesen...\n`);

const gefunden = [];
for (const p of patSnap.docs) {
  if (gefunden.length >= 5) break;
  const pd = await p.ref.collection("pdocuments").get();
  for (const d of pd.docs) {
    const doc = d.data() || {};
    if (!/anamnese|anamnesis|history/i.test(String(doc.name || ""))) continue;
    const rows = Array.isArray(doc.formRows) ? doc.formRows : [];
    const signed = doc.status === "signed" || doc.pdfCreatedAt;
    if (!rows.length && signed) {
      gefunden.push({
        patientId: p.id,
        patient: `${p.data()?.firstName || ""} ${p.data()?.lastName || ""}`.trim(),
        docId: d.id,
        name: doc.name,
        status: doc.status,
        pdfCreatedAt: doc.pdfCreatedAt?.toDate?.()?.toISOString?.() || String(doc.pdfCreatedAt || ""),
        felder: Object.keys(doc).sort().join(", "),
      });
    }
  }
}

if (!gefunden.length) {
  console.log("Keine unterschriebene (formRows-lose) Anamnese gefunden.");
  process.exit(0);
}

for (const g of gefunden) {
  console.log(`--- ${g.patient} (${g.patientId})`);
  console.log(`    Doc ${g.docId} | ${g.name} | status=${g.status} | pdf=${g.pdfCreatedAt}`);
  console.log(`    Felder: ${g.felder}`);

  // PDF-Pfad wie pdfService.createPDF: .../patients/{pid}/documents/{formId}.pdf
  const pfad = `clients/${CLIENT}/locations/${locationId}/patients/${g.patientId}/documents/${g.docId}.pdf`;
  const file = bucket.file(pfad);
  const [exists] = await file.exists();
  console.log(`    Storage: ${pfad} -> ${exists ? "VORHANDEN" : "FEHLT"}`);
  if (!exists) { console.log(""); continue; }

  const [buf] = await file.download();
  console.log(`    Groesse: ${(buf.length / 1024).toFixed(1)} KB`);
  try {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const res = await parser.getText();
    const text = String(res?.text || "");
    const checked = (text.match(/\ue800/g) || []).length;
    const unchecked = (text.match(/\uf096/g) || []).length;
    console.log(`    Textebene: ${text.length} Zeichen | angekreuzt=${checked} leer=${unchecked}`);
    const kern = text.replace(/\ue800/g, "[X]").replace(/\uf096/g, "[ ]").replace(/\r/g, "");
    console.log("    ------- Auszug (erste 2200 Zeichen) -------");
    console.log(kern.slice(0, 2200).split("\n").map((z) => "    " + z).join("\n"));
    console.log("    -------------------------------------------\n");
    await parser.destroy?.();
  } catch (e) {
    console.log(`    EXTRAKTION FEHLGESCHLAGEN: ${e?.message || e}\n`);
  }
}
process.exit(0);
