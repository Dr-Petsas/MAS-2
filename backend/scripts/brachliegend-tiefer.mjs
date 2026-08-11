// Zweite, gruendlichere Runde der Inventur (Dr. Petsas, 11.08.2026).
//
// Die erste Runde suchte nur nach Schaltern und nach Dateien, deren Name
// nirgends auftaucht. Diese Runde schaut auf das, was im Betrieb wirklich
// zaehlt:
//   1. Router, die gebaut, aber nicht eingehaengt sind (Schnittstelle tot).
//   2. Exportierte Funktionen, die kein anderes Modul je benutzt (gebaute
//      Faehigkeit ohne Aufrufer) - beschraenkt auf src/, ohne Tests/Skripte.
//   3. Seiten unter public/, auf die nichts verweist.
//
// Reine Textanalyse, veraendert nichts. Aufruf: node scripts/brachliegend-tiefer.mjs
import fs from "node:fs";
import path from "node:path";

const WURZEL = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const UEBERSPRINGEN = new Set(["node_modules", ".git", ".cache", ".run", "coverage"]);

function dateien(dir, endungen, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (UEBERSPRINGEN.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) dateien(p, endungen, out);
    else if (endungen.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const kurz = (p) => path.relative(WURZEL, p);
const srcDateien = dateien(path.join(WURZEL, "src"), [".js"]);
const src = new Map(srcDateien.map((p) => [p, fs.readFileSync(p, "utf8")]));
const serverText = fs.readFileSync(path.join(WURZEL, "src", "server.js"), "utf8");

// --- 1) Nicht eingehaengte Router ------------------------------------------
console.log("1) Schnittstellen, die gebaut, aber nicht eingehaengt sind:");
let tot = 0;
for (const [p, t] of src) {
  if (!p.includes(`${path.sep}routes${path.sep}`)) continue;
  if (!/express\.Router\(\)/.test(t)) continue;
  const name = path.basename(p, ".js");
  const eingehaengt = new RegExp(`routes/${name}\\.js`).test(serverText)
    || [...src].some(([q, s]) => q !== p && new RegExp(`routes/${name}\\.js`).test(s));
  if (!eingehaengt) {
    console.log(`   ${kurz(p)}`);
    tot += 1;
  }
}
if (!tot) console.log("   keine");

// --- 2) Exporte ohne jeden Aufrufer ----------------------------------------
console.log("\n2) Gebaute Faehigkeiten, die kein anderes Modul benutzt:");
const exportMuster = /export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g;
const treffer = [];
for (const [p, t] of src) {
  const namen = [...t.matchAll(exportMuster)].map((m) => m[1]);
  if (!namen.length) continue;
  const ungenutzt = namen.filter((n) => {
    const wort = new RegExp(`\\b${n}\\b`);
    return ![...src].some(([q, s]) => q !== p && wort.test(s));
  });
  if (ungenutzt.length && ungenutzt.length === namen.length) {
    treffer.push({ datei: kurz(p), namen: ungenutzt });
  }
}
if (!treffer.length) console.log("   keine (jedes Modul wird irgendwo benutzt)");
for (const t of treffer) {
  console.log(`   ${t.datei}  ->  ${t.namen.slice(0, 6).join(", ")}${t.namen.length > 6 ? " …" : ""}`);
}

// --- 3) Seiten ohne Verweis -------------------------------------------------
console.log("\n3) Seiten unter public/, auf die nichts verweist:");
const seiten = dateien(path.join(WURZEL, "public"), [".html"]);
const allesTexte = [...src.values()]
  .concat(seiten.map((p) => fs.readFileSync(p, "utf8")));
let ohne = 0;
for (const p of seiten) {
  const name = path.basename(p);
  const verweise = allesTexte.filter((t) => t.includes(name)).length;
  if (verweise <= 1) {
    console.log(`   ${kurz(p)}`);
    ohne += 1;
  }
}
if (!ohne) console.log("   keine");
