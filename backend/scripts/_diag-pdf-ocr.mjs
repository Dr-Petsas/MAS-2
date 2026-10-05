// Diagnose: wird ein GESCANNTES PDF (nur Bild, keine Textebene) lesbar?
// Baut ein solches PDF im Speicher: Text wird auf eine Leinwand gemalt, als
// JPEG in die Seite eingebettet — genau die Lage bei einem Scan aus dem
// Kopierer. Danach laeuft es durch denselben extractText()-Pfad wie ein
// Upload im KI-Bereich des Composers.
import { createCanvas } from "@napi-rs/canvas";
import { extractText } from "../src/mail/extract.js";

const ZEILEN = [
  "Zahnarztpraxis Dr. Petsas",
  "",
  "Heil- und Kostenplan vom 28.07.2026",
  "Patientin: Sabine Grothe, geb. 14.03.1971",
  "Versichertennummer A123456789, Barmer",
  "",
  "Regio 36: Implantat statt Bruecke",
  "Gesamtbetrag: 2340,00 EUR",
  "Eigenanteil nach Zuschuss: 1487,50 EUR",
  "",
  "Frist zur Stellungnahme: 05.09.2026",
];

// Seite als Bild malen (A4 bei etwa 150 dpi).
function maleSeite() {
  const breite = 1240;
  const hoehe = 1754;
  const canvas = createCanvas(breite, hoehe);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, breite, hoehe);
  ctx.fillStyle = "#000000";
  ctx.font = "34px Arial";
  let y = 160;
  for (const z of ZEILEN) {
    if (z) ctx.fillText(z, 120, y);
    y += 60;
  }
  return canvas.toBuffer("image/jpeg", 92);
}

// Minimales PDF, das NUR dieses JPEG als Seiteninhalt hat (kein Textobjekt).
function baueScanPdf(jpeg, breite, hoehe) {
  const teile = [];
  let laenge = 0;
  const schreibe = (b) => {
    const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1");
    teile.push(buf);
    laenge += buf.length;
  };

  schreibe("%PDF-1.4\n");
  const offsets = [];
  const objekt = (nr, kopf, strom) => {
    offsets[nr] = laenge;
    schreibe(`${nr} 0 obj\n${kopf}\n`);
    if (strom) {
      schreibe("stream\n");
      schreibe(strom);
      schreibe("\nendstream\n");
    }
    schreibe("endobj\n");
  };

  const inhalt = `q ${595} 0 0 ${842} 0 0 cm /Im0 Do Q`;
  objekt(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objekt(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objekt(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
  objekt(4, `<< /Type /XObject /Subtype /Image /Width ${breite} /Height ${hoehe} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  objekt(5, `<< /Length ${inhalt.length} >>`, Buffer.from(inhalt, "latin1"));

  const xref = laenge;
  schreibe(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) schreibe(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  schreibe(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(teile);
}

const jpeg = maleSeite();
const pdf = baueScanPdf(jpeg, 1240, 1754);
console.log(`Test-PDF gebaut: ${Math.round(pdf.length / 1024)} KB, nur Bild, keine Textebene.`);

const payload = {
  base64: pdf.toString("base64"),
  filename: "scan-hkp.pdf",
  contentType: "application/pdf",
};

const t0 = Date.now();
let res;
if (process.env.MAS_LIVE === "1") {
  const r = await fetch((process.env.MAS_BASE || "http://127.0.0.1:4000") + "/mail/letter/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  res = await r.json();
  res._http = r.status;
} else {
  res = await extractText(payload);
}
const ms = Date.now() - t0;

console.log(`\nhttp=${res._http || "modul"} ok=${res.ok} kind=${res.kind} engine=${res.ocrEngine || "-"} ${ms} ms`);
if (res.note) console.log("note:", res.note);
if (res.error) console.log("error:", res.error);
console.log("--- erkannter Text ---");
console.log(res.text || "(leer)");

const alt = /Text-Layer|vermutlich gescannt/.test(String(res.note || ""));
const treffer = res.ok && /Grothe/i.test(res.text) && /2340/.test(res.text) && !alt;
console.log(treffer ? "\nBESTANDEN: Scan wurde lesbar." : "\nFEHLGESCHLAGEN: Scan blieb unlesbar.");
process.exitCode = treffer ? 0 : 1;
