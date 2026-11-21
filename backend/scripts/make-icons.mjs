// One-time helper: turn the generated Clara artwork into square PWA icons.
// Usage: node scripts/make-icons.mjs <source.png>
// sharp steht bewusst NICHT in package.json: nur dieser Einmal-Helfer braucht es, der Betrieb nicht.
// Vor dem Lauf einmal: npm install --no-save sharp   (ein spaeteres npm ci raeumt es wieder weg)
let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("sharp fehlt. Einmal ausfuehren: npm install --no-save sharp  - danach dieses Skript erneut starten.");
  process.exit(1);
}
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) { console.error("usage: node scripts/make-icons.mjs <source.png>"); process.exit(1); }

const outDir = path.join(__dirname, "..", "public", "m");
const img = sharp(src);
const meta = await img.metadata();
const side = Math.min(meta.width, meta.height);
const left = Math.floor((meta.width - side) / 2);
const top = Math.floor((meta.height - side) / 2);

for (const size of [512, 192, 180, 96]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  await sharp(src).extract({ left, top, width: side, height: side })
    .resize(size, size).png().toFile(path.join(outDir, name));
  console.log("wrote", name);
}
console.log("done");
