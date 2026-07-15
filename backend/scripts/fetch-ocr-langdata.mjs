// Holt die Tesseract-Sprachdaten EINMALIG ins backend/ (Arbeitsverzeichnis),
// damit der lokale OCR-Fallback im DSGVO-isolierten Netz OFFLINE läuft (kein
// CDN-Download zur Laufzeit -> kein Hänger bis Timeout).
//
// tesseract.js 7 liest beim Start zuerst den Cache `./{lang}.traineddata` und
// erkennt gzip automatisch. Wir speichern daher die (entpackten) *.traineddata
// genau in dieser Form. Variante 4.0.0_best_int = die LSTM-Default-Daten von
// tesseract.js (klein, integerisiert).
//
// Nutzung:  node scripts/fetch-ocr-langdata.mjs [deu+eng]
import fs from "node:fs";
import zlib from "node:zlib";
import { promisify } from "node:util";

const gunzip = promisify(zlib.gunzip);
const VARIANT = "4.0.0_best_int";
const langsRaw = process.argv[2] || process.env.MAS_OCR_LANG || "deu+eng";
const langs = langsRaw.split("+").map((s) => s.trim()).filter(Boolean);

let bad = 0;
for (const lang of langs) {
  const out = `${process.cwd()}/${lang}.traineddata`;
  if (fs.existsSync(out)) { console.log(`${lang}: existiert bereits (${out}) — übersprungen`); continue; }
  const url = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/${VARIANT}/${lang}.traineddata.gz`;
  process.stdout.write(`${lang}: lade ${url} ... `);
  try {
    const r = await fetch(url);
    if (!r.ok) { console.log(`FEHLER HTTP ${r.status}`); bad++; continue; }
    const data = await gunzip(Buffer.from(await r.arrayBuffer()));
    fs.writeFileSync(out, data);
    console.log(`OK (${(data.length / 1e6).toFixed(1)} MB) -> ${out}`);
  } catch (e) {
    console.log(`FEHLER ${e?.message || e}`);
    bad++;
  }
}
console.log(bad === 0 ? "\nAlle Sprachdaten vorhanden. OCR-Fallback läuft jetzt offline." : `\n${bad} Sprache(n) fehlgeschlagen.`);
process.exit(bad ? 1 : 0);
