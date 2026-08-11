// Welche Backend-Faehigkeiten kann Clara gar nicht aufrufen? (11.08.2026)
//
// Das Backend stellt unter /tools/... Faehigkeiten bereit. Clara kennt davon
// nur die, die in ihrem Profil als Werkzeug hinterlegt sind. Alles andere ist
// gebaut, aber fuer Clara unerreichbar - genau die Sorte Brachland, nach der
// Dr. Petsas gefragt hat.
//
// Reine Textanalyse, veraendert nichts.
// Aufruf: node scripts/clara-anbindung-pruefen.mjs [pfad-zum-profil]
import fs from "node:fs";
import path from "node:path";

const WURZEL = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PROFIL = process.argv[2] || "F:/Clara-Voice-dev/profiles/clara_meddent/profile.json";

const routen = fs.readFileSync(path.join(WURZEL, "src", "routes", "tools.js"), "utf8");
const angeboten = new Set();
for (const m of routen.matchAll(/router\.(?:get|post)\(\s*["'`]([^"'`]+)["'`]/g)) {
  // Der Router haengt bereits unter /tools - im Quelltext steht der Pfad je
  // nach Stelle mit oder ohne dieses Vorwort. Beides auf eine Form bringen.
  const p = m[1].replace(/^\/tools/, "").replace(/\/$/, "");
  if (p && !p.includes(":")) angeboten.add(p);
}

const profil = JSON.parse(fs.readFileSync(PROFIL, "utf8"));
const genutzt = new Set();
for (const t of profil.custom_tools || []) {
  const m = String(t.url || "").match(/\/tools(\/[a-zA-Z0-9\-_]+)/);
  if (m) genutzt.add(m[1]);
}

const frei = [...angeboten].filter((p) => !genutzt.has(p)).sort();
console.log(`Backend-Faehigkeiten unter /tools: ${angeboten.size}`);
console.log(`davon in Claras Profil hinterlegt: ${angeboten.size - frei.length}`);
console.log(`\nFuer Clara NICHT erreichbar (${frei.length}):`);
for (const p of frei) console.log(`   /tools${p}`);
