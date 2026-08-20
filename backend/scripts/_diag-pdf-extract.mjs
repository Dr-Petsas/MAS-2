// Diagnose: liest extractText() wieder Text aus einem PDF?
// Baut ein winziges PDF mit Textebene im Speicher (keine Fremddatei noetig)
// und schickt es durch denselben Pfad wie der Upload im KI-Bereich.
import { extractText } from "../src/mail/extract.js";

const PROBE = "Kostenvoranschlag Implantat Regio 36 Betrag 2340,00 EUR";

// Minimales, gueltiges PDF mit einer Textzeile (Helvetica, unkomprimiert).
function baueTestPdf(text) {
  const objekte = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const strom = `BT /F1 12 Tf 72 760 Td (${text.replace(/([()\\])/g, "\\$1")}) Tj ET`;
  objekte.push(`<< /Length ${strom.length} >>\nstream\n${strom}\nendstream`);

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objekte.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const buf = baueTestPdf(PROBE);
const res = await extractText({
  base64: buf.toString("base64"),
  filename: "kostenvoranschlag.pdf",
  contentType: "application/pdf",
});

console.log("ok:", res.ok);
console.log("kind:", res.kind);
if (res.note) console.log("note:", res.note);
console.log("text:", JSON.stringify(res.text));
const treffer = res.ok && res.text.includes("Implantat") && res.text.includes("2340,00");
console.log(treffer ? "\nBESTANDEN: Text aus dem PDF gelesen." : "\nFEHLGESCHLAGEN.");
process.exit(treffer ? 0 : 1);
