// Smoke-Test für den Vision-OCR-Pfad (Weg A: unified Qwen3-VL auf dem 5090).
// Nutzung:
//   node scripts/test-vision-ocr.mjs               -> nur Konnektivität/Config
//   node scripts/test-vision-ocr.mjs pfad/zum/bild.png|jpg  -> echte OCR
//
// Ändert NICHTS am Live-System. Liest nur MAS_OCR_VISION_* aus der Umgebung
// (bzw. .env) und ruft denselben Codepfad wie der Upload (ocrImage()).
import "dotenv/config";
import fs from "node:fs";
import { ocrImage, ocrInfo } from "../src/mail/ocr.js";

function line(s = "") { process.stdout.write(String(s) + "\n"); }

async function checkEndpoint() {
  const base = String(process.env.MAS_OCR_VISION_BASE_URL || "").trim().replace(/\/+$/, "");
  const model = String(process.env.MAS_OCR_VISION_MODEL || "qwen3-vl").trim();
  const apiKey = String(process.env.MAS_OCR_VISION_API_KEY || "ollama").trim();
  if (!base) {
    line("Vision-Endpoint: NICHT konfiguriert (MAS_OCR_VISION_BASE_URL leer) -> es läuft nur Tesseract.");
    return { ok: false, base, model };
  }
  line(`Vision-Endpoint:  ${base}`);
  line(`Vision-Modell:    ${model}`);
  try {
    const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) { line(`  /models -> HTTP ${r.status} (Endpoint erreichbar, aber Fehler)`); return { ok: false, base, model }; }
    const data = await r.json().catch(() => null);
    const ids = (data?.data || []).map((m) => m.id);
    line(`  gelistete Modelle: ${ids.join(", ") || "(keine)"}`);
    const present = ids.includes(model);
    line(present ? `  OK: '${model}' ist verfügbar.` : `  WARNUNG: '${model}' ist NICHT gelistet — served-model-name prüfen.`);
    return { ok: present, base, model };
  } catch (e) {
    line(`  Endpoint nicht erreichbar: ${e?.message || e}`);
    return { ok: false, base, model };
  }
}

async function main() {
  line("=== Vision-OCR Smoke-Test ===");
  line("Konfig: " + JSON.stringify(ocrInfo()));
  line("");
  await checkEndpoint();
  line("");

  const imgPath = process.argv[2];
  if (!imgPath) {
    line("Kein Bild übergeben — nur Konnektivität geprüft.");
    line("Für einen echten Lauf: node scripts/test-vision-ocr.mjs <bild.png|.jpg>");
    return;
  }
  if (!fs.existsSync(imgPath)) { line(`Bild nicht gefunden: ${imgPath}`); process.exitCode = 1; return; }
  const buf = fs.readFileSync(imgPath);
  const ext = imgPath.toLowerCase().split(".").pop();
  const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  line(`OCR läuft auf ${imgPath} (${buf.length} Bytes, ${contentType}) ...`);
  const t0 = Date.now();
  const res = await ocrImage(buf, { contentType });
  const ms = Date.now() - t0;
  line(`Engine: ${res.engine}   ok=${res.ok}   ${res.note ? "note=" + res.note + "   " : ""}${ms} ms`);
  if (res.ok) {
    line("--- Erkannter Text (erste 800 Zeichen) ---");
    line(res.text.slice(0, 800));
  } else {
    line("Kein Text erkannt. Bei konfiguriertem Vision-Endpoint sollte 'engine=vision' erscheinen;");
    line("erscheint 'engine=tesseract', ist der Vision-Endpoint nicht erreichbar/leer -> Fallback lief.");
  }
}

main().catch((e) => { line("FEHLER: " + (e?.stack || e)); process.exitCode = 1; });
