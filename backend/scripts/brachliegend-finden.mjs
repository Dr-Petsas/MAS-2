// Inventur: Was ist gebaut, liegt aber still? (Dr. Petsas, 11.08.2026)
//
// Gesucht werden zwei Sorten Stillstand:
//   1. Schalter, die eine Funktion nur auf Zuruf einschalten oder sie
//      ausdruecklich abschalten (process.env.X === "1" bzw. !== "0").
//   2. Module, die nirgendwo eingebunden sind - gebauter Code ohne Aufrufer.
//
// Reine Textanalyse, veraendert nichts. Aufruf: node scripts/brachliegend-finden.mjs
import fs from "node:fs";
import path from "node:path";

const WURZEL = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const UEBERSPRINGEN = new Set(["node_modules", ".git", ".cache", ".run", "public", "coverage"]);

function dateien(dir, endung, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (UEBERSPRINGEN.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) dateien(p, endung, out);
    else if (e.name.endsWith(endung)) out.push(p);
  }
  return out;
}

const quellen = dateien(path.join(WURZEL, "src"), ".js")
  .concat(dateien(path.join(WURZEL, "scripts"), ".mjs"));
const texte = new Map(quellen.map((p) => [p, fs.readFileSync(p, "utf8")]));
const kurz = (p) => path.relative(WURZEL, p);

// --- 1) Schalter -----------------------------------------------------------
const schalter = new Map();
const muster = /process\.env\.([A-Z][A-Z0-9_]+)\s*(===|!==|==|!=)\s*["']([^"']*)["']/g;
for (const [p, t] of texte) {
  for (const m of t.matchAll(muster)) {
    const [, name, op, wert] = m;
    const nurAufZuruf = (op === "===" || op === "==") && ["1", "true", "on", "ja"].includes(wert);
    const abschaltbar = (op === "!==" || op === "!=") && ["0", "false", "off"].includes(wert);
    if (nurAufZuruf || abschaltbar) {
      const art = nurAufZuruf ? "nur auf Zuruf" : "an, abschaltbar";
      if (!schalter.has(name)) schalter.set(name, { art, ort: kurz(p) });
    }
  }
}

// --- 2) Module ohne Aufrufer ----------------------------------------------
const ohneAufrufer = [];
for (const p of quellen) {
  const name = path.basename(p, path.extname(p));
  if (name === "server" || name === "index") continue;
  let gefunden = false;
  for (const [q, t] of texte) {
    if (q === p) continue;
    if (t.includes(`/${name}.js`) || t.includes(`"${name}.js`) || t.includes(`'${name}.js`)) {
      gefunden = true;
      break;
    }
  }
  if (!gefunden) ohneAufrufer.push(kurz(p));
}

// --- Ausgabe ---------------------------------------------------------------
const env = fs.existsSync(path.join(WURZEL, ".env"))
  ? fs.readFileSync(path.join(WURZEL, ".env"), "utf8")
  : "";
const gesetzt = new Map(
  env.split(/\r?\n/).filter((z) => z.trim() && !z.trim().startsWith("#") && z.includes("="))
    .map((z) => [z.slice(0, z.indexOf("=")).trim(), z.slice(z.indexOf("=") + 1).trim()]),
);

console.log("1) Schalter (Stand laut .env):");
for (const [name, { art, ort }] of [...schalter].sort()) {
  const wert = gesetzt.has(name) ? gesetzt.get(name) : "(nicht gesetzt)";
  const still = art === "nur auf Zuruf" && !["1", "true", "on", "ja"].includes(wert);
  console.log(`   ${still ? "STILL " : "laeuft"} ${name.padEnd(34)} ${art.padEnd(16)} .env=${wert.padEnd(16)} ${ort}`);
}

console.log("\n2) Module, die nirgendwo eingebunden sind:");
if (!ohneAufrufer.length) console.log("   keine");
for (const z of ohneAufrufer) console.log(`   ${z}`);
