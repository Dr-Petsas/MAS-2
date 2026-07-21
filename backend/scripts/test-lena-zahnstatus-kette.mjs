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

// 11) Ansage-Test (Chef 21.07.): nackte Zahnnummern "12", "15", "34" —
//     jeder genannte Zahn wird im Schema AKTIVIERT (is-named), der letzte
//     bekommt die Auswahl (is-sel), Box zeigt "genannt: ...".
const stN = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(stN, [
  { text: "12." },
  { text: "15," },
  { text: "Zahn zwölf." },
  { text: "34." },
]);
check("Ansage: teeth = 12,15,34", stN.teeth.has(12) && stN.teeth.has(15) && stN.teeth.has(34), [...stN.teeth].join(","));
check("Ansage: letzter Zahn = 34", stN.lastChartFdi === 34, String(stN.lastChartFdi));
check("Ansage: Box 'genannt: 12, 15, 34'", (stN.values.zaehne || "").includes("genannt: 12, 15, 34"), stN.values.zaehne);
const htmlN = W.LenaVoiceChart.renderSchemaHtml(stN.chart, stN.lastChartFdi, stN.teeth);
check("Ansage: 12 aktiviert (is-named)", /class="zs-cell zs-num[^"]*is-named[^"]*" data-fdi="12"/.test(htmlN), (htmlN.match(/class="[^"]*" data-fdi="12"/g) || []).join(" | "));
check("Ansage: 15 aktiviert (is-named)", /class="zs-cell zs-num[^"]*is-named[^"]*" data-fdi="15"/.test(htmlN), "");
check("Ansage: 34 ausgewaehlt (is-sel)", /class="zs-cell zs-num[^"]*is-sel[^"]*" data-fdi="34"/.test(htmlN), "");
check("Ansage: 11 NICHT aktiviert", !/class="zs-cell zs-num[^"]*is-(?:named|sel)[^"]*" data-fdi="11"/.test(htmlN), "");

// Einzelziffer-Diktat "1,2" (STT-Schreibweise) -> 12
const stN2 = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(stN2, [{ text: "1,2." }, { text: "drei, vier." }]);
check("Ansage: '1,2' -> 12", stN2.teeth.has(12), [...stN2.teeth].join(","));
check("Ansage: 'drei, vier' -> 34", stN2.teeth.has(34), [...stN2.teeth].join(","));

// Sobald ein Kuerzel kommt, wandert der Zahn von "genannt" zu markiert
W.LenaDokuZahn.applySegments(stN, [{ text: "34 Karies okklusal." }]);
check("Ansage->Befund: 34 markiert (co)", (stN.chart?.[34]?.befund || "").includes("co"), JSON.stringify(stN.chart?.[34]));
check("Ansage->Befund: 34 raus aus 'genannt'", !/genannt:[^·]*34/.test(stN.values.zaehne || ""), stN.values.zaehne);
const htmlN2 = W.LenaVoiceChart.renderSchemaHtml(stN.chart, 34, stN.teeth);
check("Ansage->Befund: 34 hat has-mark statt is-named", /class="zs-cell zs-num[^"]*has-mark[^"]*" data-fdi="34"/.test(htmlN2) && !/is-named[^"]*" data-fdi="34"/.test(htmlN2), "");

// 12) Schema-Seite getrennt von Boxen: nur Chart, keine Text-Boxen.
const stSch = W.LenaDokuZahn.emptyState("Kontrolle");
stSch.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stSch, [
  { text: "1 2" },
  { text: "15" },
  { text: "drei vier Karies okklusal" },
]);
check("Schema: 12 aus '1 2'", stSch.teeth.has(12), [...stSch.teeth].join(","));
check("Schema: 15", stSch.teeth.has(15), [...stSch.teeth].join(","));
check("Schema: 34 + co", (stSch.chart?.[34]?.befund || "").includes("co"), JSON.stringify(stSch.chart?.[34]));
check("Schema: Befund-Box bleibt leer", !(stSch.values.befund || "").trim(), stSch.values.befund || "(leer)");
check("Schema: Therapie-Box bleibt leer", !(stSch.values.therapie || "").trim(), stSch.values.therapie || "(leer)");
// Box-Seite: volle Segmentliste (Schema + Doku) — Chart bleibt aus Schema-Zeilen,
// neue Klinik-Saetze fuellen die Boxen.
stSch.page = "doku";
W.LenaDokuZahn.applySegments(stSch, [
  { text: "1 2" },
  { text: "15" },
  { text: "drei vier Karies okklusal" },
  { text: "Perkussion negativ, keine Komplikationen." },
]);
check("Doku: Chart 34 bleibt co", (stSch.chart?.[34]?.befund || "").includes("co"), JSON.stringify(stSch.chart?.[34]));
check("Doku: Befund-Box gefuellt", /perkussion/i.test(stSch.values.befund || ""), stSch.values.befund);

// 13) ECHTE Garbles vom Zahlen-Diktat 21.07. abends (Session 21:15/21:23/21:37):
//     "Hier sechs" = "vier sechs" (Anlaut weg), "Bei fünf" = "drei fünf",
//     "Zeit" = "zwei". Aliasse gelten NUR auf der Schema-Seite.
const K2 = W.LenaZahnstatusKatalog;
check("Alias: 'Hier sechs.' -> vier sechs", /vier sechs/i.test(K2.schemaDigitAlias("Hier sechs.")), K2.schemaDigitAlias("Hier sechs."));
check("Alias: 'Bei fünf.' -> drei fünf", /drei fünf/i.test(K2.schemaDigitAlias("Bei fünf.")), K2.schemaDigitAlias("Bei fünf."));
const stG = W.LenaDokuZahn.emptyState("");
stG.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stG, [
  { text: "Hier sechs." },   // -> 46
  { text: "Hier, fünf." },   // -> 45
  { text: "Bei fünf." },     // -> 35
  { text: "Hier sieben." },  // -> 47
]);
check("Garble: 46 aus 'Hier sechs'", stG.teeth.has(46), [...stG.teeth].join(","));
check("Garble: 45 aus 'Hier, fünf'", stG.teeth.has(45), [...stG.teeth].join(","));
check("Garble: 35 aus 'Bei fünf'", stG.teeth.has(35), [...stG.teeth].join(","));
check("Garble: 47 aus 'Hier sieben'", stG.teeth.has(47), [...stG.teeth].join(","));

// Doku-Seite: "hier"/"bei" bleiben normale Woerter (KEIN Alias in Boxen)
const stG2 = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(stG2, [{ text: "Druckdolenz hier bei Perkussion" }]);
check("Doku: 'hier bei' unveraendert in Box", /hier bei/i.test(stG2.values.befund || ""), stG2.values.befund);
check("Doku: kein Geister-Zahn aus 'hier bei'", stG2.teeth.size === 0, [...stG2.teeth].join(","));

// 14) Einzelziffern-Paarung (VAD trennt "Vier." / "Sechs." in zwei Segmente)
const stP = W.LenaDokuZahn.emptyState("");
stP.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stP, [
  { text: "Vier.", startMs: 1000 },
  { text: "Sechs.", startMs: 1900 },   // -> 46
  { text: "Eins.", startMs: 6000 },
  { text: "Eins.", startMs: 6800 },    // -> 11
  { text: "Zwei.", startMs: 9000 },    // pending (frisch)
]);
check("Paarung: 4+6 -> 46", stP.teeth.has(46), [...stP.teeth].join(","));
check("Paarung: 1+1 -> 11", stP.teeth.has(11), [...stP.teeth].join(","));
check("Paarung: '2' haengt als pending", stP.pendingDigit === "2", String(stP.pendingDigit));
check("Paarung: keine Geister-Zaehne", stP.teeth.size === 2, [...stP.teeth].join(","));

// Zeitfenster: weit auseinanderliegende Einzelziffern paaren NICHT
const stP2 = W.LenaDokuZahn.emptyState("");
stP2.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stP2, [
  { text: "Vier.", startMs: 1000 },
  { text: "Sechs.", startMs: 60000 },  // 59 s spaeter -> kein Paar
]);
check("Paarung: 59s Abstand -> kein 46", !stP2.teeth.has(46), [...stP2.teeth].join(","));

// Garble-Alias + Paarung kombiniert: "Hier?" (=vier) + "Sieben." -> 47
const stP3 = W.LenaDokuZahn.emptyState("");
stP3.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stP3, [
  { text: "Hier?", startMs: 1000 },
  { text: "Sieben.", startMs: 1800 },
]);
check("Alias+Paarung: 'Hier?'+'Sieben.' -> 47", stP3.teeth.has(47), [...stP3.teeth].join(","));

// 15) VOLL-GRAMMATIK (Chef 21.07. 23:39) — vier Ansage-Formen.
// a) Zahn-Befund
const gA1 = W.LenaVoiceChart.parseUtterance("27 Füllung");
check("Gram a: '27 Füllung' -> 27 Fu", gA1.length === 1 && gA1[0].fdi === 27 && gA1[0].codes.includes("Fu"), JSON.stringify(gA1));
const gA2 = W.LenaVoiceChart.parseUtterance("16 Karies");
check("Gram a: '16 Karies' -> 16 Ka", gA2.length === 1 && gA2[0].fdi === 16 && gA2[0].codes.includes("Ka"), JSON.stringify(gA2));
const gA3 = W.LenaVoiceChart.parseUtterance("34 fehlt");
check("Gram a: '34 fehlt' -> 34 f", gA3.length === 1 && gA3[0].fdi === 34 && gA3[0].codes.includes("f"), JSON.stringify(gA3));

// b) Befund-Zahn (Praeposition an/auf/am/bei)
const gB1 = W.LenaVoiceChart.parseUtterance("Füllung, Krone an 27");
check("Gram b: 'Füllung, Krone an 27' -> 27 Fu+k",
  gB1.length === 1 && gB1[0].fdi === 27 && gB1[0].codes.includes("Fu") && gB1[0].codes.includes("k"),
  JSON.stringify(gB1));
const gB2 = W.LenaVoiceChart.parseUtterance("Krone auf 14");
check("Gram b: 'Krone auf 14' -> 14 k", gB2.length === 1 && gB2[0].fdi === 14 && gB2[0].codes.includes("k"), JSON.stringify(gB2));
const gB3 = W.LenaVoiceChart.parseUtterance("Füllung am 36");
check("Gram b: 'Füllung am 36' -> 36 Fu", gB3.length === 1 && gB3[0].fdi === 36 && gB3[0].codes.includes("Fu"), JSON.stringify(gB3));
const gB4 = W.LenaVoiceChart.parseUtterance("Karies bei 46");
check("Gram b: 'Karies bei 46' -> 46 Ka", gB4.length === 1 && gB4[0].fdi === 46 && gB4[0].codes.includes("Ka"), JSON.stringify(gB4));
// Praeposition bindet NICHT rueckwaerts ueber den Zahn hinweg:
const gB5 = W.LenaVoiceChart.parseUtterance("34 fehlt und 16 Karies");
const gb5map = Object.fromEntries(gB5.map((e) => [e.fdi, e.codes.join(",")]));
check("Gram b Negativ: '34 fehlt und 16 Karies' getrennt",
  gb5map[34] === "f" && gb5map[16] === "Ka", JSON.stringify(gb5map));

// c) Multiple Zaehne + EIN Befund (distributiv)
const gC1 = W.LenaVoiceChart.parseUtterance("13,14,15,16,17 fehlen");
check("Gram c: '13,14,15,16,17 fehlen' -> 5x f",
  gC1.length === 5 && gC1.every((e) => e.codes.join() === "f") &&
  [13, 14, 15, 16, 17].every((z) => gC1.some((e) => e.fdi === z)),
  JSON.stringify(gC1.map((e) => e.fdi + ":" + e.codes.join())));
const gC2 = W.LenaVoiceChart.parseUtterance("13 14 15 fehlen");
check("Gram c: '13 14 15 fehlen' -> 3x f",
  gC2.length === 3 && gC2.every((e) => e.codes.join() === "f"),
  JSON.stringify(gC2.map((e) => e.fdi + ":" + e.codes.join())));
const gC3 = W.LenaVoiceChart.parseUtterance("dreizehn vierzehn fünfzehn fehlen");
check("Gram c: Zahlwoerter 'dreizehn vierzehn fünfzehn fehlen'",
  gC3.length === 3 && [13, 14, 15].every((z) => gC3.some((e) => e.fdi === z && e.codes.includes("f"))),
  JSON.stringify(gC3.map((e) => e.fdi + ":" + e.codes.join())));

// d) Befund(e) vorangestellt
const gD1 = W.LenaVoiceChart.parseUtterance("es fehlen 23,24,25,26,27");
check("Gram d: 'es fehlen 23,24,25,26,27' -> 5x f",
  gD1.length === 5 && gD1.every((e) => e.codes.join() === "f") &&
  [23, 24, 25, 26, 27].every((z) => gD1.some((e) => e.fdi === z)),
  JSON.stringify(gD1.map((e) => e.fdi + ":" + e.codes.join())));
const gD2 = W.LenaVoiceChart.parseUtterance("fehlend sind 31 32");
check("Gram d: 'fehlend sind 31 32' -> 31 f, 32 f",
  gD2.length === 2 && [31, 32].every((z) => gD2.some((e) => e.fdi === z && e.codes.includes("f"))),
  JSON.stringify(gD2.map((e) => e.fdi + ":" + e.codes.join())));
const gD3 = W.LenaVoiceChart.parseUtterance("Krone und Füllung an 27");
check("Gram d: 'Krone und Füllung an 27' -> 27 k+Fu",
  gD3.length === 1 && gD3[0].fdi === 27 && gD3[0].codes.includes("k") && gD3[0].codes.includes("Fu"),
  JSON.stringify(gD3));
const gD4 = W.LenaVoiceChart.parseUtterance("Karies an 16 und 17");
check("Gram d: 'Karies an 16 und 17' -> beide Ka",
  gD4.length === 2 && [16, 17].every((z) => gD4.some((e) => e.fdi === z && e.codes.includes("Ka"))),
  JSON.stringify(gD4.map((e) => e.fdi + ":" + e.codes.join())));

// Negativ: Masseinheiten-Guard + Alltagswoerter duerfen NICHT parsen
const gN1 = W.LenaVoiceChart.parseUtterance("Sondierungstiefe 3,5 Millimeter");
check("Gram Negativ: '3,5 Millimeter' -> kein Zahn 35", !gN1.some((e) => e.fdi === 35), JSON.stringify(gN1));
const gN2 = W.LenaVoiceChart.parseUtterance("zwei, drei Wochen Schonung");
check("Gram Negativ: 'zwei, drei Wochen' -> kein Zahn 23", !gN2.some((e) => e.fdi === 23), JSON.stringify(gN2));
const gN3 = W.LenaVoiceChart.parseUtterance("So, ab morgen bitte weiter");
check("Gram Negativ: 'So, ab morgen' -> keine Codes so/ab", gN3.length === 0, JSON.stringify(gN3));
const gN4 = W.LenaVoiceChart.parseUtterance("Der Fehler war empfehlenswert");
check("Gram Negativ: 'Fehler/empfehlen' -> kein f", !gN4.some((e) => (e.codes || []).includes("f")), JSON.stringify(gN4));

// Ende-zu-Ende auf der Schema-Seite (forceLayer befund) inkl. Plural
const stF = W.LenaDokuZahn.emptyState("");
stF.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stF, [
  { text: "13,14,15 fehlen" },
  { text: "Füllung, Krone an 27" },
  { text: "16 Karies" },
]);
check("Schema-Kette: 13/14/15 fehlen", [13, 14, 15].every((z) => stF.chart?.[z]?.befund === "f"),
  JSON.stringify([13, 14, 15].map((z) => stF.chart?.[z]?.befund)));
check("Schema-Kette: 27 fu+k in B-Zeile",
  (stF.chart?.[27]?.befund || "").includes("fu") && (stF.chart?.[27]?.befund || "").includes("k"),
  JSON.stringify(stF.chart?.[27]));
check("Schema-Kette: 16 c in B-Zeile", (stF.chart?.[16]?.befund || "") === "c", JSON.stringify(stF.chart?.[16]));
check("Schema-Kette: Therapie-Zeile bleibt leer",
  [13, 14, 15, 16, 27].every((z) => !(stF.chart?.[z]?.therapie || "")),
  JSON.stringify([13, 14, 15, 16, 27].map((z) => stF.chart?.[z]?.therapie)));

// 16) LEGENDE: Schema-Seite rendert KZBV-Kuerzel, benutzte leuchten
const legHtml = (() => {
  const div = { innerHTML: "" };
  W.LenaDokuZahn.renderSchemaOnly(div, stF);
  return div.innerHTML;
})();
check("Legende: vorhanden", legHtml.includes("zs-legend"), "");
check("Legende: 'f' + Klartext 'fehlt'", /data-code="f"[^>]*>.*?fehlt/.test(legHtml.replace(/<b[^>]*>|<\/b>|<span[^>]*>|<\/span>/g, "")) || (legHtml.includes('data-code="f"') && legHtml.includes("fehlt")), "");
check("Legende: benutzte Kuerzel markiert (is-used an f, c, fu, k)",
  ["f", "c", "fu", "k"].every((c) => new RegExp('class="zs-leg[^"]*is-used[^"]*" data-code="' + c + '"').test(legHtml)), "");
check("Legende: unbenutztes Kuerzel NICHT markiert (ix)",
  !/class="zs-leg[^"]*is-used[^"]*" data-code="ix"/.test(legHtml), "");
check("Legende: Flash am zuletzt gesetzten Kuerzel (c von '16 Karies')",
  /class="zs-leg[^"]*is-flash[^"]*" data-code="c"/.test(legHtml), "");
check("Schema-Seite: KEINE Therapie-Zeile im HTML", !legHtml.includes('data-layer="therapie"'), "");
check("Doku-Seite: Therapie-Zeile bleibt (Regression)",
  W.LenaVoiceChart.renderSchemaHtml(stF.chart, null, null).includes('data-layer="therapie"'), "");

// 17) BEFUND-ECHO: Diff -> Echo-Text -> Schleifen-Sicherheit
const snapVor = W.LenaVoiceChart.chartEchoSnapshot(W.LenaVoiceChart.emptyChart());
const diff1 = W.LenaVoiceChart.diffChartForEcho(snapVor, stF.chart, new Set(), stF.teeth);
const echo1 = W.LenaVoiceChart.buildEchoText(diff1);
check("Echo: Text erzeugt", !!echo1, echo1);
check("Echo: FDI als Einzelziffern ('zwei sieben')", /zwei sieben/i.test(echo1), echo1);
check("Echo: Kuerzel als Klartext (Füllung/Krone/fehlt)",
  /Füllung/.test(echo1) && /Krone/.test(echo1) && /fehlt/.test(echo1), echo1);
check("Echo: KEIN 'siebenundzwanzig'", !/siebenundzwanzig/i.test(echo1), echo1);
// Einzelfall exakt wie Chef-Beispiel: "27 Füllung" -> "Zwei sieben: Füllung."
const stE1 = W.LenaDokuZahn.emptyState("");
stE1.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stE1, [{ text: "27 Füllung" }]);
const echoBsp = W.LenaVoiceChart.buildEchoText(
  W.LenaVoiceChart.diffChartForEcho(snapVor, stE1.chart, new Set(), stE1.teeth),
);
check("Echo: '27 Füllung' -> 'Zwei sieben: Füllung.'", echoBsp === "Zwei sieben: Füllung.", echoBsp);

// Schleifen-Sicherheit: Echo-Text als neues Segment darf KEINE neuen Marks
// erzeugen (Mikro nimmt Lautsprecher auf; Worker/Frontend verwerfen zwar,
// aber selbst wenn beides versagt, entsteht kein neuer Zustand -> kein Loop).
const segsLoop = [
  { text: "13,14,15 fehlen" },
  { text: "Füllung, Krone an 27" },
  { text: "16 Karies" },
];
const stL1 = W.LenaDokuZahn.emptyState("");
stL1.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stL1, segsLoop);
const snapNach = W.LenaVoiceChart.chartEchoSnapshot(stL1.chart);
const namedNach = new Set(stL1.teeth);
const stL2 = W.LenaDokuZahn.emptyState("");
stL2.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stL2, segsLoop.concat([{ text: echo1 }]));
const diffLoop = W.LenaVoiceChart.diffChartForEcho(snapNach, stL2.chart, namedNach, stL2.teeth);
const echoLoop = W.LenaVoiceChart.buildEchoText(diffLoop);
check("Echo-Loop: Echo-Text erzeugt KEINE neuen Marks", echoLoop === "", echoLoop || "(leer)");
check("Echo-Loop: Chart identisch",
  JSON.stringify(W.LenaVoiceChart.chartEchoSnapshot(stL2.chart)) === JSON.stringify(snapNach),
  "");
// Auch das Bare-Zahn-Echo ("Vier sechs.") ist schleifenfest:
const stL3 = W.LenaDokuZahn.emptyState("");
stL3.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stL3, [{ text: "46" }]);
const snap46 = W.LenaVoiceChart.chartEchoSnapshot(stL3.chart);
const named46 = new Set(stL3.teeth);
const echo46 = W.LenaVoiceChart.buildEchoText(
  W.LenaVoiceChart.diffChartForEcho(snapVor, stL3.chart, new Set(), stL3.teeth),
);
check("Echo: Bare-Zahn '46' -> 'Vier sechs.'", echo46 === "Vier sechs.", echo46);
const stL4 = W.LenaDokuZahn.emptyState("");
stL4.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stL4, [{ text: "46" }, { text: echo46 }]);
const diff46 = W.LenaVoiceChart.diffChartForEcho(snap46, stL4.chart, named46, stL4.teeth);
check("Echo-Loop: 'Vier sechs.' erzeugt kein neues Echo",
  W.LenaVoiceChart.buildEchoText(diff46) === "", W.LenaVoiceChart.buildEchoText(diff46) || "(leer)");
// Massen-Befund wird gesprochen als "Mehrere Zähne" (nie Zahlwort wie
// "sechzehn" — das wuerde als FDI 16 zurueckparsen!)
const stL5 = W.LenaDokuZahn.emptyState("");
stL5.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stL5, [{ text: "Alle Zähne fehlen" }]);
const echoAll = W.LenaVoiceChart.buildEchoText(
  W.LenaVoiceChart.diffChartForEcho(snapVor, stL5.chart, new Set(), stL5.teeth),
);
check("Echo: Massen-Befund -> 'Mehrere Zähne: fehlt.'", echoAll === "Mehrere Zähne: fehlt.", echoAll);

console.log(fail ? "FAZIT: " + fail + " Fehler" : "FAZIT: Kette OK");
process.exitCode = fail ? 1 : 0;
