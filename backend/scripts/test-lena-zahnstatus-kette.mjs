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

// 6) Befund-Diktat (Trigger "Befund", Chef 21.07.):
//    ALLE Diktate danach -> Befund-Box + B-Zeile, auch ohne Befund-Keyword.
//    Therapie-HANDLUNG beendet den Modus ohne Trigger-Wort.
const st3 = W.LenaDokuZahn.emptyState("Fuellung 35");
W.LenaDokuZahn.applySegments(st3, [
  { text: "So, Befund" },
  { text: "35 Karies distal" },
  { text: "46 fehlt" },
  { text: "17 Fuellung insuffizient" },
  { text: "Sondierungstiefe fuenf Millimeter am 36" },
]);
check("Modus aktiv nach Trigger", st3.dictMode === "befund", String(st3.dictMode));
check(
  "Befund-Box sammelt ALLE Diktate",
  ["35 Karies distal", "46 fehlt", "17 Fuellung insuffizient", "Sondierungstiefe"]
    .every((s) => (st3.values.befund || "").includes(s)),
  st3.values.befund,
);
check("35: c+d in B-Zeile", (st3.chart?.[35]?.befund || "").includes("cd"), JSON.stringify(st3.chart?.[35]));
check("46: f (fehlend) in B-Zeile", st3.chart?.[46]?.befund === "f", JSON.stringify(st3.chart?.[46]));
check(
  "17: Bestands-Fuellung in B-Zeile (fu), NICHT Therapie",
  (st3.chart?.[17]?.befund || "").includes("fu") && !(st3.chart?.[17]?.therapie || ""),
  JSON.stringify(st3.chart?.[17]),
);
check("Fuellung-Block NICHT durch Bestand geoeffnet", !st3.openBlocks.has("fuellung"), [...st3.openBlocks].join(","));

// Therapie-Handlung beendet den Modus (ohne Trigger) — Eintrag in Therapie
W.LenaDokuZahn.applySegments(st3, [
  { text: "So, Befund" },
  { text: "35 Karies distal" },
  { text: "46 fehlt" },
  { text: "17 Fuellung insuffizient" },
  { text: "Sondierungstiefe fuenf Millimeter am 36" },
  { text: "Anaesthesie gesetzt mit Ultracain" },
  { text: "Exkaviert und Kompositfuellung MOD an 35 gelegt" },
]);
check("Therapie-Handlung beendet Modus", st3.dictMode === null, String(st3.dictMode));
check("Therapie-Box gefuellt (ohne Trigger)", (st3.values.therapie || "").includes("Exkaviert"), st3.values.therapie);
check("35: Therapie fMOD in T-Zeile", /f/i.test(st3.chart?.[35]?.therapie || ""), JSON.stringify(st3.chart?.[35]));
check("LA-Block offen", st3.openBlocks.has("la"), [...st3.openBlocks].join(","));

// 7) "Befund Ende" beendet den Modus explizit
const st4 = W.LenaDokuZahn.emptyState("Kontrolle");
W.LenaDokuZahn.applySegments(st4, [
  { text: "Befund" },
  { text: "46 fehlt" },
  { text: "Befund Ende" },
  { text: "Patient wuenscht Beratung Implantat" },
]);
check("Befund Ende beendet Modus", st4.dictMode === null, String(st4.dictMode));
check("Nach Ende kein Zwangs-Befund", !(st4.values.befund || "").includes("Beratung"), st4.values.befund);

// 8) setField-Fix: laengeres NEUES Diktat ersetzt gesammelte Eintraege nicht
const st5 = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(st5, [
  { text: "Befund" },
  { text: "35 Karies distal" },
  { text: "Zahnfleisch generalisiert geroetet und geschwollen im Oberkiefer" },
]);
check(
  "Kurzer Eintrag bleibt trotz laengerem Folgediktat",
  (st5.values.befund || "").includes("35 Karies distal"),
  st5.values.befund,
);

// 9) ECHTE Transkript-Zeilen (Live-Behandlung 21.07., Patientin N.):
//    FDI einzeln gesprochen ("1,6" / "vier, sechs"), Kompakt "16x14x",
//    Soll-Form "muss extrahiert werden" (= Befund x, NICHT Therapie-Ende),
//    Kommando "Schreib in den Befund ein ...".
const K = W.LenaZahnstatusKatalog;
check("norm '1,6' -> 16", K.normalizeToothText("Und dann muss 1,6 und 1,4 auch extrahiert werden.").includes("16"), K.normalizeToothText("Und dann muss 1,6 und 1,4 auch extrahiert werden."));
check("norm 'vier, sechs' -> 46", K.normalizeToothText("Sagen, vier, sechs.").includes("46"), K.normalizeToothText("Sagen, vier, sechs."));
check("norm '16x14x' -> '16 x 14 x'", /16 x\s+14 x/.test(K.normalizeToothText("Schreib in den Befund ein 16x14x.")), K.normalizeToothText("Schreib in den Befund ein 16x14x."));
check("norm '3,5 Millimeter' bleibt Messwert", !/\b35\b/.test(K.normalizeToothText("Sondierungstiefe 3,5 Millimeter")), K.normalizeToothText("Sondierungstiefe 3,5 Millimeter"));
check("norm 'zwei, drei Wochen' bleibt Zeitraum", !/\b23\b/.test(K.normalizeToothText("Kontrolle in zwei, drei Wochen")), K.normalizeToothText("Kontrolle in zwei, drei Wochen"));

const stLive = W.LenaDokuZahn.emptyState("Schmerzbehandlung");
W.LenaDokuZahn.applySegments(stLive, [
  { text: "Sagen, vier, sechs." },
  { text: "muss extrahiert werden, x." },
  { text: "dass er nur Befund eines x bei 46." },
  { text: "Und dann muss 1,6 und 1,4 auch extrahiert werden." },
  { text: "weitrige Entzündung der Implantat im rechten" },
  { text: "fakte Diagnose ein, eitrige Entzündung des rechten Oberkiefers und rechten Unterkiefers an den Implantat." },
  { text: "Schreib in den Befund ein 16x14x." },
  { text: "Befund 16x." },
  { text: "1, 4x." },
]);
check("Live: 46 erkannt (vier, sechs)", stLive.teeth.has(46), [...stLive.teeth].join(","));
check("Live: 16+14 erkannt (1,6/1,4)", stLive.teeth.has(16) && stLive.teeth.has(14), [...stLive.teeth].join(","));
check("Live: 46 -> x in B-Zeile", (stLive.chart?.[46]?.befund || "").includes("x"), JSON.stringify(stLive.chart?.[46]));
check("Live: 16 -> x in B-Zeile", (stLive.chart?.[16]?.befund || "").includes("x"), JSON.stringify(stLive.chart?.[16]));
check("Live: 14 -> x in B-Zeile", (stLive.chart?.[14]?.befund || "").includes("x"), JSON.stringify(stLive.chart?.[14]));
check("Live: 14 OHNE Geister-Marks (kein sk/im)", (stLive.chart?.[14]?.befund || "").trim() === "x", JSON.stringify(stLive.chart?.[14]));
check("Live: 'muss extrahiert werden' NICHT als Therapie", !(stLive.values.therapie || "").includes("extrahiert werden"), stLive.values.therapie || "(leer)");
check("Live: Soll-Form in Befund-Box", (stLive.values.befund || "").includes("extrahiert werden"), (stLive.values.befund || "").slice(0, 120));
check("Live: Entzuendung in Befund-Box", /entz[uü]nd/i.test(stLive.values.befund || ""), (stLive.values.befund || "").slice(0, 160));
check("Live: Diagnose-Box gefuellt", /entz[uü]nd/i.test(stLive.values.diagnose || ""), stLive.values.diagnose);
check("Live: Befund-Modus aktiv nach 'Befund 16x'", stLive.dictMode === "befund", String(stLive.dictMode));

// Kommando-Trigger schaltet Modus + Rest wird Inhalt
const stCmd = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(stCmd, [
  { text: "Schreib in den Befund ein 16x14x." },
  { text: "2,5 Karies okklusal" },
]);
check("Cmd: Modus nach Kommando aktiv", stCmd.dictMode === "befund", String(stCmd.dictMode));
check("Cmd: 25 -> c okklusal in B-Zeile", (stCmd.chart?.[25]?.befund || "").includes("c"), JSON.stringify(stCmd.chart?.[25]));

// Echte Handlung beendet weiterhin (Perfekt AKTIV, keine Soll-Form)
const stEnd = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(stEnd, [
  { text: "Befund" },
  { text: "46 muss extrahiert werden" },
  { text: "Ultracain gesetzt und 46 extrahiert" },
]);
check("Ende: echte Handlung beendet Modus", stEnd.dictMode === null, String(stEnd.dictMode));
check("Ende: Handlung in Therapie-Box", /extrahiert/i.test(stEnd.values.therapie || ""), stEnd.values.therapie);

// 10) ECHTE Zeilen 13:12 (Patientin D., zahnlos): "Alle Zaehne fehlend",
//     Einzelziffern "1,8", Nachfragen ans System, "Therapie." als Ende.
const stD = W.LenaDokuZahn.emptyState("Prothesenkontrolle");
W.LenaDokuZahn.applySegments(stD, [
  { text: "So, Befund." },
  { text: "Alle Zähne fehlend." },
  { text: "Alle Zähne fehlen." },
  { text: "1,8 fehlt, 1,7 fehlt, 1,6 fehlt und so weiter." },
  { text: "Hörst du nicht?" },
  { text: "Nur gehen wir mal vorbei." },
  { text: "Therapie." },
  { text: "Hörst du mich?" },
]);
check("13:12: zahnlos -> ALLE Zaehne f (Probe 48)", stD.chart?.[48]?.befund === "f", JSON.stringify(stD.chart?.[48]));
check("13:12: zahnlos -> ALLE Zaehne f (Probe 25)", stD.chart?.[25]?.befund === "f", JSON.stringify(stD.chart?.[25]));
check("13:12: 18 f (aus '1,8 fehlt')", stD.chart?.[18]?.befund === "f", JSON.stringify(stD.chart?.[18]));
check("13:12: Befund-Box hat 'Alle Zähne fehlend'", (stD.values.befund || "").includes("Alle Zähne fehlend"), (stD.values.befund || "").slice(0, 140));
check("13:12: 'Hörst du nicht?' NICHT in Befund-Box", !/h[oö]rst du/i.test(stD.values.befund || ""), (stD.values.befund || "").slice(0, 140));
check("13:12: 'Therapie.' beendet Modus", stD.dictMode === null, String(stD.dictMode));

// Kiefer-Scope: nur Oberkiefer zahnlos
const stOk = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(stOk, [{ text: "Oberkiefer zahnlos" }]);
check("OK zahnlos: 16 f", stOk.chart?.[16]?.befund === "f", JSON.stringify(stOk.chart?.[16]));
check("OK zahnlos: 46 bleibt leer", (stOk.chart?.[46]?.befund || "") === "", JSON.stringify(stOk.chart?.[46]));

console.log(fail ? "FAZIT: " + fail + " Fehler" : "FAZIT: Kette OK");
process.exitCode = fail ? 1 : 0;
