// Ende-zu-Ende-Probe ohne Browser: Sprachsegmente -> Katalog/Chart -> Template-Boxen.
// Prueft die Kette, die auf dem iPad die Doku-Boxen fuellt (Befund/Therapie/Zaehne).
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
let fail = 0;
const check = (label, cond, extra) => {
  console.log((cond ? "OK  " : "FEHL") + " " + label + (extra ? "  -> " + extra : ""));
  if (!cond) fail++;
};

check("Katalog geladen", !!W.LenaZahnstatusKatalog);
check("VoiceChart geladen", !!W.LenaVoiceChart);
check("DokuZahn geladen", !!W.LenaDokuZahn);

// 1) FDI + Befund-Kuerzel: "35 Karies distal" -> Ka an 35, Flaeche d, Layer befund
const p1 = W.LenaVoiceChart.parseUtterance("Zahn 35 Karies distal");
check("35 erkannt", p1.length === 1 && p1[0].fdi === 35, JSON.stringify(p1));
check("Karies -> Ka", p1[0]?.codes?.includes("Ka"), (p1[0]?.codes || []).join(","));
check("Flaeche d", p1[0]?.surfaces?.includes("d"), (p1[0]?.surfaces || []).join(","));

// 2) f = fehlend (KZBV)
const p2 = W.LenaVoiceChart.parseUtterance("46 fehlt");
check("46 fehlt -> f", p2.length && p2[0].fdi === 46 && p2[0].codes.includes("f"), JSON.stringify(p2));

// 3) Therapie: Fuellung MOD -> Layer therapie
const chart = W.LenaVoiceChart.emptyChart();
W.LenaVoiceChart.applySegments(chart, [
  { text: "Zahn 35 Karies distal" },
  { text: "Fuellung mesial okklusal distal an 35 Komposit" },
]);
const cell35 = chart?.teeth?.[35] || chart?.[35] || null;
check("Chart hat 35", !!cell35, JSON.stringify(cell35));
const lines = W.LenaVoiceChart.summaryLines ? W.LenaVoiceChart.summaryLines(chart) : [];
check("Summary erwaehnt 35", lines.some((l) => String(l).includes("35")), lines.join(" | "));

// 4) Template-Routing: Befund-/Therapie-Saetze landen in den richtigen Boxen
const st = W.LenaDokuZahn.emptyState("Fuellung 35");
W.LenaDokuZahn.applySegments(st, [
  { text: "Zahn 35 Karies distal, Perkussion negativ" },
  { text: "Exkaviert und Kompositfuellung MOD gelegt" },
  { text: "Keine Komplikationen, Kontrolle in einer Woche" },
]);
check("Befund-Box gefuellt", !!st.values.befund, st.values.befund);
check("Therapie-Box gefuellt", !!st.values.therapie, st.values.therapie);
check("Komplikationen=keine", st.values.komplikationen === "keine", st.values.komplikationen);
check("Procedere gefuellt", !!st.values.procedere, st.values.procedere);
check("Zaehne-Box gefuellt", !!st.values.zaehne, st.values.zaehne);

// 5) Souffleuse: leere Pflicht-Box wird angesagt
const st2 = W.LenaDokuZahn.emptyState("Kontrolle");
W.LenaDokuZahn.ensureGaps(st2);
const hint = W.LenaDokuZahn.nextSouffleHint(st2, new Set());
check("Souffleuse-Hinweis kommt", !!hint?.text, hint?.text);

console.log(fail ? "FAZIT: " + fail + " Fehler" : "FAZIT: Kette OK");
process.exitCode = fail ? 1 : 0;
