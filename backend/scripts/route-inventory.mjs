// Routen-Inventar (W1.2): extrahiert alle app./router.-Registrierungen mit
// Methode+Pfad aus src/server.js UND src/routes/*.js. Dient als Beweis, dass
// der Router-Split die Routen-Menge nicht veraendert hat:
//   node scripts/route-inventory.mjs > vorher.txt   (vor dem Split)
//   node scripts/route-inventory.mjs > nachher.txt  (nach dem Split)
//   fc vorher.txt nachher.txt
// Ausgabe ist nach Methode+Pfad sortiert (Registrierungs-Reihenfolge ist bei
// disjunkten Literal-Pfaden nicht bedeutungstragend; Duplikate werden separat
// als WARNUNG gelistet, weil bei ihnen die Reihenfolge zaehlt).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "src");

function extract(file) {
  const out = [];
  const text = fs.readFileSync(file, "utf8");
  const rx = /^\s*(?:app|router)\.(get|post|put|patch|delete|all)\(\s*["'`]([^"'`]+)["'`]/;
  text.split(/\r?\n/).forEach((line, idx) => {
    const m = line.match(rx);
    if (m) out.push({ method: m[1].toUpperCase(), path: m[2], file: path.basename(file), line: idx + 1 });
  });
  return out;
}

const files = [path.join(SRC, "server.js")];
const routesDir = path.join(SRC, "routes");
if (fs.existsSync(routesDir)) {
  for (const f of fs.readdirSync(routesDir)) {
    if (f.endsWith(".js")) files.push(path.join(routesDir, f));
  }
}

const all = files.flatMap(extract);
const key = (r) => `${r.method} ${r.path}`;

const seen = new Map();
const dups = [];
for (const r of all) {
  if (seen.has(key(r))) dups.push({ first: seen.get(key(r)), dup: r });
  else seen.set(key(r), r);
}

const params = all.filter((r) => r.path.includes(":") || r.path.includes("*"));

console.log(`# Routen: ${all.length} (eindeutig: ${seen.size})`);
if (dups.length) {
  console.log("# WARNUNG Duplikate (Reihenfolge relevant!):");
  for (const d of dups) {
    console.log(`#   ${key(d.dup)}  zuerst ${d.first.file}:${d.first.line}, dann ${d.dup.file}:${d.dup.line}`);
  }
}
if (params.length) {
  console.log(`# Parameter-/Wildcard-Routen: ${params.length}`);
}
for (const k of [...seen.keys()].sort()) console.log(k);
