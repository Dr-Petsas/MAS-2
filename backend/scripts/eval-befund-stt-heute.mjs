/**
 * Befund-STT-Eval gegen die Live-Diktate 21./22.07.2026.
 *
 * Quelle der Hypothesen: Firestore-Dictations (= Parakeet-Tee auf dem echten
 * Headset-Audio). Roh-WAVs der Tee-Segmente wurden nicht gespeichert — die
 * gemessene Kette ist deshalb STT-Hypothese → Garble/Alias → Parser/Chart.
 *
 * Treffer = korrekter FDI + korrekter Befund-Code (Ka/Fu/f/t/x …).
 * Bei reinen Ansage-Faellen zaehlt nur der FDI.
 *
 *   node scripts/eval-befund-stt-heute.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public", "m");
const ctx = { window: {} };
ctx.window.window = ctx.window;
vm.createContext(ctx.window);
for (const f of ["lena-zahnstatus-katalog.js", "lena-voice-chart.js", "lena-doku-template-zahn.js"]) {
  vm.runInContext(fs.readFileSync(path.join(pub, f), "utf8"), ctx.window, { filename: f });
}
const W = ctx.window;

/** @typedef {{ fdi: number, code?: string, namedOnly?: boolean }} Expect */
/** @typedef {{ id: string, source: string, verified: string, round?: string, segments: string[], expect: Expect[] }} Case */

/** Ground Truth aus Live-Sessions (Echo + Intent + Log). */
const CASES = /** @type {Case[]} */ ([
  {
    id: "nacht-01:37-befund",
    source: "firestore zjVVeJyf 22.07. 01:37 + Clara-Echo 64bcde",
    verified: "chef-intent+echo (16=Teleskop, nicht fehlt)",
    segments: [
      "Eins, vier.", "Zülung MOD.", "Zwei, drei.", "Covidus.", "Paris.",
      "Zwei, drei Karies.", "Eins, sieben.", "Füllung?", "F2UD.", "1, 7.",
      "Einzige Füllung MOD.", "Vier, vier.", "4, 4 Karies.", "Eins, sechs.",
      "Telesco.", "Ein Sechst-Teleskopkrone.", "Eins, sechs.", "Kicker.",
      "1, 6.", "Ein Sex-Teleskop-Krone.", "Es fehlen.", "Zwei, zwei.",
      "Fehl.", "3, 2.", "3, 2 fehlt.", "2, 2 fehlt.",
    ],
    expect: [
      { fdi: 14, code: "Fu" },
      { fdi: 23, code: "Ka" },
      { fdi: 17, code: "Fu" },
      { fdi: 44, code: "Ka" },
      { fdi: 16, code: "t" },
      { fdi: 22, code: "f" },
      { fdi: 32, code: "f" },
    ],
  },
  {
    id: "vormittag-11:00",
    source: "firestore 9J7zGis1 21.07. 11:00",
    verified: "stt-hyp+log",
    segments: ["2, 4, Füllung MOD.", "Zahn 2,5 Karies."],
    expect: [
      { fdi: 24, code: "Fu" },
      { fdi: 25, code: "Ka" },
    ],
  },
  {
    id: "live-11:34-extraktion",
    source: "firestore 9J7zGis1 21.07. 11:34 (Patientin N.)",
    verified: "manuell+kette",
    segments: [
      "Sagen, vier, sechs.",
      "muss extrahiert werden, x.",
      "dass er nur Befund eines x bei 46.",
      "Und dann muss 1,6 und 1,4 auch extrahiert werden.",
      "Schreib in den Befund ein 16x14x.",
      "Befund 16x.",
      "1, 4x.",
    ],
    expect: [
      { fdi: 46, code: "x" },
      { fdi: 16, code: "x" },
      { fdi: 14, code: "x" },
    ],
  },
  {
    id: "live-13:12-zahnlos",
    source: "firestore HODMHf89 21.07. 13:12",
    verified: "manuell+kette",
    segments: [
      "So, Befund.",
      "Alle Zähne fehlend.",
      "1,8 fehlt, 1,7 fehlt, 1,6 fehlt und so weiter.",
    ],
    expect: [
      { fdi: 18, code: "f" },
      { fdi: 17, code: "f" },
      { fdi: 16, code: "f" },
      { fdi: 25, code: "f" },
      { fdi: 48, code: "f" },
    ],
  },
  {
    id: "abend-21:15-schema",
    source: "firestore AtdXbSjA 21.07. 21:15",
    verified: "stt-hyp+alias-intent",
    segments: [
      "Eins, fünf.", "Eins, drei, x.", "Eins, zwei.", "Hier sechs.",
      "Hier, fünf.", "Vier, sechs.", "Vier, fünf.", "Vier, vier.",
      "Füllung MOD", "1-1 Füllung, M-O-D.", "Drei, zwei, Füllung, Distal.",
      "3,6 OD.",
    ],
    expect: [
      { fdi: 15, namedOnly: true },
      { fdi: 13, code: "x" },
      { fdi: 12, namedOnly: true },
      { fdi: 46, namedOnly: true },
      { fdi: 45, namedOnly: true },
      { fdi: 44, namedOnly: true },
      { fdi: 11, code: "Fu" },
      { fdi: 32, code: "Fu" },
      { fdi: 36, namedOnly: true },
    ],
  },
  {
    id: "abend-21:23-garble-zahlen",
    source: "firestore AtdXbSjA 21.07. 21:23",
    verified: "stt-hyp+alias-intent",
    segments: [
      "Drei, vier.", "2, 3.", "Eins, eins.", "Hier sieben.", "Vier sieben.",
      "Hier drei.", "Vier, zwei.", "Hier eins.", "Drei, eins.", "Drei, drei.",
    ],
    expect: [
      { fdi: 34, namedOnly: true },
      { fdi: 23, namedOnly: true },
      { fdi: 11, namedOnly: true },
      { fdi: 47, namedOnly: true },
      { fdi: 43, namedOnly: true },
      { fdi: 42, namedOnly: true },
      { fdi: 41, namedOnly: true },
      { fdi: 31, namedOnly: true },
      { fdi: 33, namedOnly: true },
    ],
  },
  {
    id: "abend-21:37-garble",
    source: "firestore AtdXbSjA 21.07. 21:37",
    verified: "stt-hyp+alias-intent",
    segments: [
      "2, 2.", "Zeit.", "Hier ab.", "Eins, eins.", "2-1.", "Zwei, eins.",
      "Drei, vier.", "Bei fünf.", "Drei, fünf.", "Hier?", "Sieben.",
    ],
    expect: [
      { fdi: 22, namedOnly: true },
      { fdi: 11, namedOnly: true },
      { fdi: 21, namedOnly: true },
      { fdi: 34, namedOnly: true },
      { fdi: 35, namedOnly: true },
      { fdi: 47, namedOnly: true },
    ],
  },
  {
    id: "abend-22:49-zahlen",
    source: "firestore AtdXbSjA + mic-final 422099 21.07. 22:49",
    verified: "stt-hyp+alias-intent",
    segments: [
      "1,1.", "2-1.", "Zwei Alt.", "Eins, drei.", "Zwei, eins.", "Zwei, vier.",
      "Drei Alten.", "Drei Eisen.", "Drei, eins.", "Vier, sieben.", "4,6.",
      "4,5.", "4, 3.", "4-1.", "4,1.", "Eins, eins.", "2,7.", "3,8.",
    ],
    expect: [
      { fdi: 11, namedOnly: true },
      { fdi: 21, namedOnly: true },
      { fdi: 28, namedOnly: true },
      { fdi: 13, namedOnly: true },
      { fdi: 24, namedOnly: true },
      { fdi: 38, namedOnly: true },
      { fdi: 31, namedOnly: true },
      { fdi: 47, namedOnly: true },
      { fdi: 46, namedOnly: true },
      { fdi: 45, namedOnly: true },
      { fdi: 43, namedOnly: true },
      { fdi: 41, namedOnly: true },
      { fdi: 27, namedOnly: true },
    ],
  },
  {
    id: "abend-23:31-zahlen",
    source: "firestore 9J7zGis1 21.07. 23:31",
    verified: "stt-hyp",
    segments: [
      "Eins, eins.", "2, 1.", "4,2.", "Drei Acht.", "3,7.", "2,7.", "1, 8.",
      "Vier, fünf?",
    ],
    expect: [
      { fdi: 11, namedOnly: true },
      { fdi: 21, namedOnly: true },
      { fdi: 42, namedOnly: true },
      { fdi: 38, namedOnly: true },
      { fdi: 37, namedOnly: true },
      { fdi: 27, namedOnly: true },
      { fdi: 18, namedOnly: true },
      { fdi: 45, namedOnly: true },
    ],
  },
  {
    id: "mic-log-01:29-therapie",
    source: "worker-log 503391 mic-final 21.07. ~01:29 (kein Tee-WAV)",
    verified: "mic-final-text",
    segments: [
      "Und bei dem Patienten wurde an dem Zahn 2,3 eine octosaldistale Füllung gemacht, also inzisaldistale.",
      "Zahn 2,4 eine MOD-Füllung mit Injektion.",
      "Am Zahn 2.6 ist noch eine Karie.",
      "So, der Zahn 2, 4 hat Karies.",
      "1,1 Karies Distar.",
      "Der Zahn 1,6 Karies Distal.",
    ],
    expect: [
      { fdi: 23, code: "Fu" },
      { fdi: 24, code: "Fu" },
      { fdi: 26, code: "Ka" },
      { fdi: 11, code: "Ka" },
      { fdi: 16, code: "Ka" },
    ],
  },
]);

function cellHasCode(cell, code) {
  if (!cell) return false;
  const codes = cell.codes || [];
  if (codes.includes(code)) return true;
  const b = String(cell.befund || "");
  if (code === "Ka") return /\bc/.test(b) || codes.includes("Ka");
  if (code === "Fu") return /\bfu/i.test(b) || codes.includes("Fu");
  if (code === "f") return b === "f" || codes.includes("f");
  if (code === "t") return /\bt\b/.test(b) || b.startsWith("t") || codes.includes("t");
  if (code === "x") return /\bx\b/.test(b) || codes.includes("x");
  return b.includes(String(code).toLowerCase());
}

function runCase(c) {
  const st = W.LenaDokuZahn.emptyState("");
  st.page = "schema";
  const segs = c.segments.map((t, i) => ({ text: t, startMs: 1000 + i * 900 }));
  // 13:12 / Extraktion: auch ueber Doku-Pfad (Befund-Modus) abdecken
  if (c.id.startsWith("live-13:12") || c.id.startsWith("live-11:34")) {
    W.LenaDokuZahn.applySegments(st, [{ text: "Befund" }, ...segs]);
  } else if (c.id.startsWith("mic-log")) {
    W.LenaDokuZahn.applySegments(st, [{ text: "Befund" }, ...segs]);
  } else {
    W.LenaDokuZahn.applySchemaSegments(st, segs);
  }
  const rows = [];
  for (const exp of c.expect) {
    const named = st.teeth && st.teeth.has(exp.fdi);
    const cell = st.chart?.[exp.fdi];
    let ok = false;
    let got = "";
    if (exp.namedOnly) {
      ok = named || !!(cell && (cell.befund || (cell.codes || []).length));
      got = named ? "named" : JSON.stringify(cell || null);
    } else {
      ok = cellHasCode(cell, exp.code);
      got = cell ? `${(cell.codes || []).join(",")}|B=${cell.befund}` : "—";
    }
    rows.push({
      caseId: c.id,
      expect: exp.namedOnly ? `${exp.fdi} (genannt)` : `${exp.fdi}:${exp.code}`,
      got,
      pass: ok,
      source: c.source,
      verified: c.verified,
    });
  }
  return rows;
}

const all = [];
for (const c of CASES) all.push(...runCase(c));

const pass = all.filter((r) => r.pass).length;
const total = all.length;
const pct = total ? Math.round((1000 * pass) / total) / 10 : 0;

console.log("Audio/Hypothesen-Quellen: Firestore-Dictations 21./22.07. + mic-final-Log");
console.log(`Treffer = korrekter FDI + Code (bzw. genannt bei Ansage)`);
console.log("");
console.log("| Audio/Fall | erwartet | erkannt | pass/fail |");
console.log("|---|---|---|---|");
for (const r of all) {
  console.log(
    `| ${r.caseId} | ${r.expect} | ${r.got.replace(/\|/g, "/")} | ${r.pass ? "PASS" : "FAIL"} |`,
  );
}
console.log("");
console.log(`SCORE: ${pass}/${total} = ${pct}%`);
console.log(pct >= 88 ? "ZIEL >=88% ERREICHT" : "ZIEL >=88% NICHT ERREICHT");

const fails = all.filter((r) => !r.pass);
if (fails.length) {
  console.log("\nOFFENE FAILS:");
  fails.forEach((r) => console.log(`  - ${r.caseId}: erwartet ${r.expect}, got ${r.got}`));
}

process.exitCode = pct >= 88 ? 0 : 1;
