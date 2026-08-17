/**
 * Wie lange brauchen die Clara-Werkzeuge? Auswertung des Backend-Logs.
 *
 * Aufruf: node backend/scripts/zeig-endpunkt-zeiten.mjs [logdatei] [nurHeute]
 * Ohne Argument: neuestes logs/backend_*.log, alle Eintraege.
 */
import fs from "node:fs";
import path from "node:path";

const wurzel = path.resolve(import.meta.dirname, "..", "..");
const logDir = path.join(wurzel, "logs");

function neuestesLog() {
    const dateien = fs.readdirSync(logDir)
        .filter((n) => n.startsWith("backend_") && n.endsWith(".log") && !n.endsWith(".err.log"))
        .map((n) => ({ n, t: fs.statSync(path.join(logDir, n)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    if (!dateien.length) throw new Error("kein backend_*.log gefunden");
    return path.join(logDir, dateien[0].n);
}

// Argumente in beliebiger Reihenfolge: alles, was mit "20" beginnt, ist ein
// Datums-Filter (JJJJ-MM-TT), der Rest ist der Logpfad.
const args = process.argv.slice(2).filter(Boolean);
const tagFilter = args.find((a) => /^20\d\d-/.test(a)) || "";
const pfadArg = args.find((a) => a !== tagFilter) || "";
const datei = pfadArg ? path.resolve(pfadArg) : neuestesLog();

const proPfad = new Map();
let fallbacks = 0;
let briefings = 0;

for (const zeile of fs.readFileSync(datei, "utf8").split("\n")) {
    if (!zeile.trim().startsWith("{")) continue;
    let e;
    try { e = JSON.parse(zeile); } catch { continue; }
    if (tagFilter && !String(e.ts || "").startsWith(tagFilter)) continue;
    if (e.msg === "freisprech.guard_fallback") { fallbacks += 1; continue; }
    if (e.msg !== "request" || typeof e.ms !== "number") continue;
    const p = String(e.path || "");
    if (!p.startsWith("/tools/")) continue;
    if (p === "/tools/day-briefing") briefings += 1;
    if (!proPfad.has(p)) proPfad.set(p, []);
    proPfad.get(p).push(e.ms);
}

const q = (arr, p) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

const zeilen = [...proPfad.entries()]
    .map(([p, ms]) => ({ pfad: p, n: ms.length, p50: q(ms, 0.5), p90: q(ms, 0.9), max: Math.max(...ms) }))
    .sort((a, b) => b.p50 - a.p50);

console.log(`Log: ${path.basename(datei)}${tagFilter ? `  (nur ${tagFilter})` : ""}\n`);
console.log("Pfad".padEnd(38) + "n".padStart(5) + "p50".padStart(8) + "p90".padStart(8) + "max".padStart(8));
for (const z of zeilen.filter((z) => z.p50 >= 200 || z.n >= 5)) {
    console.log(z.pfad.padEnd(38) + String(z.n).padStart(5)
        + `${z.p50} ms`.padStart(8) + `${z.p90} ms`.padStart(8) + `${z.max} ms`.padStart(8));
}
console.log(`\nfreisprech-Guard-Verwuerfe: ${fallbacks}  (day-briefing-Aufrufe: ${briefings})`);
