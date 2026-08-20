// Diagnose: geht der Upload-Weg des Composers (/mail/letter/extract) durch?
// Nutzt dasselbe Test-PDF wie _diag-pdf-extract.mjs, aber ueber HTTP — also
// exakt den Pfad, den der KI-Bereich im E-Mail-Composer benutzt.
const BASE = process.env.MAS_BASE || "http://127.0.0.1:4000";
const PROBE = "Kostenvoranschlag Implantat Regio 36 Betrag 2340,00 EUR";

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
  objekte.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const r = await fetch(`${BASE}/mail/letter/extract`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    base64: baueTestPdf(PROBE).toString("base64"),
    filename: "kostenvoranschlag.pdf",
    contentType: "application/pdf",
  }),
});
const j = await r.json();
console.log(`HTTP ${r.status} ok=${j.ok} kind=${j.kind}`);
if (j.note) console.log("note:", j.note);
console.log("text:", JSON.stringify(j.text));
const treffer = r.ok && j.ok && String(j.text || "").includes("Implantat");
console.log(treffer ? "\nBESTANDEN: Upload-Weg liefert PDF-Text." : "\nFEHLGESCHLAGEN.");
// Kein process.exit(): direkt nach fetch() reisst das unter Windows die noch
// schliessende libuv-Handle mit ("Assertion failed ... async.c").
process.exitCode = treffer ? 0 : 1;
