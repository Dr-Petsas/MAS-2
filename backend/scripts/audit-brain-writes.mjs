// Dev audit: which routes/modules WRITE into the shared brain and which
// action paths READ it back. Static scan — run: node scripts/audit-brain-writes.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) files.push(p);
  }
})(ROOT);

const writeRe = /recordCommunication\(|appendEvent\(|addUpdate\(|createCase\(/;
const readRe = /listCases\(|getCaseContext\(|compileCaseContext\(|listActiveCasesByPatientIds\(|loadBrainContext|caseContext/i;

for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const lines = src.split(/\r?\n/);
  const routes = [];
  lines.forEach((l, i) => {
    const m = l.match(/app\.(post|get|delete|put)\("([^"]+)"/);
    if (m) routes.push([i, m[2]]);
  });
  const routeOf = (i) => {
    let r = "";
    for (const [li, name] of routes) { if (li <= i) r = name; else break; }
    return r;
  };
  const hits = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith("import") || t.startsWith("//") || t.startsWith("*")) return;
    if (writeRe.test(l)) hits.push(`W ${String(i + 1).padStart(5)} ${routeOf(i).padEnd(28)} ${t.slice(0, 95)}`);
    else if (readRe.test(l)) hits.push(`R ${String(i + 1).padStart(5)} ${routeOf(i).padEnd(28)} ${t.slice(0, 95)}`);
  });
  if (!hits.length) continue;
  console.log(`\n=== ${path.relative(ROOT, f)} ===`);
  for (const h of hits) console.log("  " + h);
}
