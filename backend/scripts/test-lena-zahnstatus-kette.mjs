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
check("Therapie-Handlung beendet Befund-Modus", st3.dictMode !== "befund", String(st3.dictMode));
check("Therapie-Handlung startet Therapie-Modus", st3.dictMode === "therapie", String(st3.dictMode));
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
// Nach Ende kein forced-Mode mehr — Freitext landet trotzdem in der Box
// (Chef 22.07.: Doku-Seite sonst "nichts dokumentiert").
check("Nach Ende Freitext trotzdem dokumentiert", /beratung/i.test(st4.values.befund || ""), st4.values.befund);
check("Nach Ende nicht mehr im Befund-Diktat-Modus", st4.dictMode === null, String(st4.dictMode));

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
check("Ende: echte Handlung -> Therapie-Modus", stEnd.dictMode === "therapie", String(stEnd.dictMode));
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
check("13:12: 'Therapie.' startet Therapie-Modus", stD.dictMode === "therapie", String(stD.dictMode));

// Kiefer-Scope: nur Oberkiefer zahnlos
const stOk = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(stOk, [{ text: "Oberkiefer zahnlos" }]);
check("OK zahnlos: 16 f", stOk.chart?.[16]?.befund === "f", JSON.stringify(stOk.chart?.[16]));
check("OK zahnlos: 46 bleibt leer", (stOk.chart?.[46]?.befund || "") === "", JSON.stringify(stOk.chart?.[46]));

// Massen-Phrasen (Chef 22.07.): Achter / OK-ersetzt / UK-fehlen / Lage
const pAcht = W.LenaVoiceChart.parseUtterance("alle Achter fehlen");
check("alle Achter fehlen -> 18/28/38/48 f",
  pAcht.length === 4 && pAcht.every((e) => e.codes.includes("f")) &&
  [18, 28, 38, 48].every((n) => pAcht.some((e) => e.fdi === n)),
  JSON.stringify(pAcht.map((e) => e.fdi)));
const pWeis = W.LenaVoiceChart.parseUtterance("alle Weisheitszähne fehlen");
check("alle Weisheitszähne fehlen -> 4x f", pWeis.length === 4 && pWeis.every((e) => e.codes.includes("f")), String(pWeis.length));
const pOkE = W.LenaVoiceChart.parseUtterance("alle OK Zähne ersetzt");
check("alle OK Zähne ersetzt -> 16 e, 46 leer",
  pOkE.some((e) => e.fdi === 16 && e.codes.includes("e")) &&
  !pOkE.some((e) => e.fdi === 46),
  JSON.stringify(pOkE.slice(0, 3)));
const pUkF = W.LenaVoiceChart.parseUtterance("alle UK Zähne fehlen");
check("alle UK Zähne fehlen -> 46 f, 16 leer",
  pUkF.some((e) => e.fdi === 46 && e.codes.includes("f")) &&
  !pUkF.some((e) => e.fdi === 16),
  JSON.stringify(pUkF.slice(0, 3)));
const pLuck = W.LenaVoiceChart.parseUtterance("35 Lückenschluss");
check("Lückenschluss -> )(", pLuck.length && pLuck[0].fdi === 35 && pLuck[0].codes.includes(")("), JSON.stringify(pLuck));
const pRt = W.LenaVoiceChart.parseUtterance("48 retiniert");
check("48 retiniert -> rt", pRt.length && pRt[0].fdi === 48 && pRt[0].codes.includes("rt"), JSON.stringify(pRt));
const pImp = W.LenaVoiceChart.parseUtterance("18 impaktiert");
check("18 impaktiert -> imp", pImp.length && pImp[0].fdi === 18 && pImp[0].codes.includes("imp"), JSON.stringify(pImp));
const pVer = W.LenaVoiceChart.parseUtterance("28 verlagert");
check("28 verlagert -> verl", pVer.length && pVer[0].fdi === 28 && pVer[0].codes.includes("verl"), JSON.stringify(pVer));
const pErsetzt = W.LenaVoiceChart.parseUtterance("36 ersetzt");
check("36 ersetzt -> e", pErsetzt.length && pErsetzt[0].fdi === 36 && pErsetzt[0].codes.includes("e"), JSON.stringify(pErsetzt));

// Doku-Freitext (Chef 22.07.): ohne Stichwort trotzdem in die Box
{
  const stF = W.LenaDokuZahn.emptyState("Kontrolle");
  stF.page = "doku";
  W.LenaDokuZahn.applySegments(stF, [
    { text: "16 Karies." },
    { text: "01 fertig." },
    { text: "Patient berichtet über Beschwerden im Unterkiefer links." },
    { text: "Das war alles soweit in Ordnung heute." },
    { text: "ok" },
  ]);
  check("Freitext: Beschwerden -> befund", /beschwerden/i.test(stF.values.befund || ""), stF.values.befund);
  check("Freitext: Narrative ohne Stichwort -> befund", /soweit in ordnung/i.test(stF.values.befund || ""), stF.values.befund);
  check("Freitext: 'ok' nicht in Box", !/\bok\b/i.test(stF.values.befund || ""), stF.values.befund);
  check("Freitext: Schema-Karies bleibt", /16 karies/i.test(stF.values.befund || ""), stF.values.befund);
}

// Speech-Katalog + Speed (Chef 22.07.)
{
  const ex = W.LenaZahnstatusKatalog.SPEECH_EXAMPLES || {};
  let speechOk = 0;
  let speechFail = 0;
  const fails = [];
  for (const [code, phrases] of Object.entries(ex)) {
    for (const phrase of phrases) {
      const ev = W.LenaVoiceChart.parseUtterance("16 " + phrase);
      const hit = ev.some((e) => e.fdi === 16 && (e.codes || []).includes(code));
      if (hit) speechOk++;
      else {
        speechFail++;
        if (fails.length < 12) fails.push(`${code}←"${phrase}" got ${JSON.stringify(ev)}`);
      }
    }
  }
  check(`SPEECH_EXAMPLES: ${speechOk} Phrasen ok`, speechFail === 0, fails.join(" | ") || String(speechOk));
  const neg = [
    ["empfehlen wir Komposit", "f"],
    ["das war ein Fehler", "f"],
    ["ab Montag Wiedervorstellung", "ab"],
    ["so ist das", "so"],
  ];
  for (const [txt, bad] of neg) {
    const codes = W.LenaVoiceChart.extractCodes(txt);
    check(`Negativ kein ${bad}: "${txt}"`, !codes.includes(bad), codes.join(","));
  }
  const t0 = Date.now();
  const sample = [
    "16 Karies mesial", "46 fehlt", "27 Teleskopkrone", "18 retiniert",
    "alle Achter fehlen", "35 Lückenschluss", "24 Implantat", "36 ersetzt",
  ];
  for (let i = 0; i < 400; i++) W.LenaVoiceChart.parseUtterance(sample[i % sample.length]);
  const ms = Date.now() - t0;
  check(`Speed: 400 parses < 250ms (ist ${ms}ms)`, ms < 250, String(ms));
}

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
// Flaechen im Echo (Chef 24.07.: "Fuellung notiert, aber ohne Flaechen")
const stE2 = W.LenaDokuZahn.emptyState("");
stE2.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stE2, [{ text: "27 Füllung mesial okklusal distal" }]);
const echoSurf = W.LenaVoiceChart.buildEchoText(
  W.LenaVoiceChart.diffChartForEcho(snapVor, stE2.chart, new Set(), stE2.teeth),
);
check("Echo: Fuellung nennt die Flaechen",
  /^Zwei sieben: Füllung /.test(echoSurf) &&
  /mesial/.test(echoSurf) && /okklusal/.test(echoSurf) && /distal/.test(echoSurf), echoSurf);
// Schleifen-Sicherheit MIT Flaechen: Flaechen-Echo erzeugt keine neuen Marks
const stE2b = W.LenaDokuZahn.emptyState("");
stE2b.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stE2b, [
  { text: "27 Füllung mesial okklusal distal" },
  { text: echoSurf },
]);
check("Echo-Loop: Flaechen-Echo erzeugt KEINE neuen Marks",
  W.LenaVoiceChart.buildEchoText(W.LenaVoiceChart.diffChartForEcho(
    W.LenaVoiceChart.chartEchoSnapshot(stE2.chart), stE2b.chart, new Set(stE2.teeth), stE2b.teeth)) === "",
  "");
// Nachtraeglich diktierte Flaeche wird nachgesprochen (getrennte Segmente)
const stE3a = W.LenaDokuZahn.emptyState("");
stE3a.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stE3a, [{ text: "36 Füllung" }]);
const snapFu = W.LenaVoiceChart.chartEchoSnapshot(stE3a.chart);
const stE3b = W.LenaDokuZahn.emptyState("");
stE3b.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stE3b, [{ text: "36 Füllung" }, { text: "36 distal" }]);
const echoLate = W.LenaVoiceChart.buildEchoText(
  W.LenaVoiceChart.diffChartForEcho(snapFu, stE3b.chart, new Set(stE3a.teeth), stE3b.teeth),
);
check("Echo: nachtraegliche Flaeche -> 'Drei sechs: Füllung distal.'",
  /^Drei sechs: Füllung /.test(echoLate) && /distal/.test(echoLate), echoLate);

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

// 18) Live-Garbles 22.07. 01:37 (Teleskop/Zülung/Covidus) + Pend-Reset
const stTel = W.LenaDokuZahn.emptyState("");
stTel.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stTel, [
  { text: "Eins, sechs.", startMs: 1000 },
  { text: "Telesco.", startMs: 2000 },
  { text: "Ein Sex-Teleskop-Krone.", startMs: 3000 },
  { text: "Es fehlen.", startMs: 4000 },
  { text: "Zwei, zwei.", startMs: 5000 },
  { text: "2, 2 fehlt.", startMs: 6000 },
]);
check("Tel: 16 = t (nicht f)", (stTel.chart?.[16]?.befund || "") === "t", JSON.stringify(stTel.chart?.[16]));
check("Tel: 22 = f", (stTel.chart?.[22]?.befund || "") === "f", JSON.stringify(stTel.chart?.[22]));
const stZu = W.LenaDokuZahn.emptyState("");
stZu.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stZu, [
  { text: "Eins, vier." },
  { text: "Zülung MOD." },
  { text: "Zwei, drei Karies." },
]);
check("Garble: Zülung MOD -> 14 fumod", (stZu.chart?.[14]?.befund || "").includes("fu"), JSON.stringify(stZu.chart?.[14]));
check("Garble: 23 c", (stZu.chart?.[23]?.befund || "") === "c", JSON.stringify(stZu.chart?.[23]));
const stHy = W.LenaDokuZahn.emptyState("");
stHy.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stHy, [{ text: "1-1 Füllung, M-O-D." }]);
check("Hyphen: '1-1 Füllung' -> 11 fu", (stHy.chart?.[11]?.befund || "").includes("fu"), JSON.stringify(stHy.chart?.[11]));
const stPend = W.LenaDokuZahn.emptyState("");
stPend.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stPend, [
  { text: "Zeit.", startMs: 1000 },
  { text: "Hier ab.", startMs: 2000 },
  { text: "Hier?", startMs: 8000 },
  { text: "Sieben.", startMs: 8800 },
]);
check("Pend-Reset: Hier+Sieben -> 47 (kein Geister-24)", stPend.teeth.has(47) && !stPend.teeth.has(24), [...stPend.teeth].join(","));
check("Alias: Zwei Alt -> 28", (() => {
  const s = W.LenaDokuZahn.emptyState("");
  s.page = "schema";
  W.LenaDokuZahn.applySchemaSegments(s, [{ text: "Zwei Alt." }]);
  return s.teeth.has(28);
})(), "");

// 19) "01 fertig" (Chef 22.07. 01:56): Sprachkommando beendet den Befund
//     und schaltet Schema -> Doku. Steuer-Segment: kein Chart-/Box-Inhalt,
//     idempotent beim Voll-Rebuild, "01" NIE als Zahn geparst.
const FIN = W.LenaDokuZahn.schemaFinishCommand;
check("Fertig-API vorhanden", typeof FIN === "function" && typeof W.LenaDokuZahn.schemaFinishShouldSwitch === "function");
// Positiv: alle Kommando-Varianten (Gross/Klein, Zahlwort/Ziffer, Interpunktion)
[
  "01 fertig",
  "01 fertig.",
  "So, 01 fertig!",
  "null eins fertig",
  "Null eins fertig.",
  "NULL EINS FERTIG",
  "0 1 fertig.",
  "Die 01 ist fertig.",
  "Befund fertig",
  "Befund fertig.",
  "Der Befund ist fertig.",
  "fertig mit dem Befund",
  "Fertig mit dem Befund.",
  "01 abgeschlossen",
  "01 abgeschlossen.",
  "Befund abgeschlossen",
  "Befund abgeschlossen!",
  "weiter zur Doku",
  "Weiter zur Doku.",
  "weiter mit der Doku",
  "Weiter mit der Doku.",
  "Weiter zur Dokumentation.",
].forEach((t) => check("Fertig-Kommando: " + JSON.stringify(t), FIN(t) === true, String(FIN(t))));
// Negativ: "fertig" allein / Befund-Versuche / Diktat mit "fertig" mittendrin
[
  "fertig",
  "Fertig.",
  "So, fertig.",
  "01 fehlt",
  "01 fehlt.",
  "Zahn 41 fertig praepariert",
  "Zahn 41 fertig präpariert.",
  "16 fertig",
  "Wir sind gleich fertig",
  "Die Fuellung ist fertig",
  "Befund 16x.",
  "weiter gehts",
  "Befund fertig machen wir spaeter",
].forEach((t) => check("KEIN Kommando: " + JSON.stringify(t), FIN(t) === false, String(FIN(t))));
// "01" darf NIRGENDS als Zahn parsen (FDI kennt kein 01)
const p01 = W.LenaVoiceChart.parseUtterance("01 fertig");
check("'01' nie als Zahn (parseUtterance)", !p01.some((e) => e.fdi), JSON.stringify(p01));
check("'01' nie als Zahn (extractFdi)", W.LenaVoiceChart.extractFdi("01 fertig.").length === 0, JSON.stringify(W.LenaVoiceChart.extractFdi("01 fertig.")));
check("norm laesst '01' in Ruhe", !/\b[1-4][1-8]\b/.test(K.normalizeToothText("01 fertig")), K.normalizeToothText("01 fertig"));
// Schema-Seite: Kommando-Segment erzeugt KEINEN Chart-Inhalt, verwirft
// offene Einzelziffer, laesst vorhandene Befunde unangetastet.
const stFin = W.LenaDokuZahn.emptyState("");
stFin.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stFin, [
  { text: "16 Karies", startMs: 1000 },
  { text: "2,7 Füllung", startMs: 2000 },
  { text: "Eins.", startMs: 3000 },        // offene Einzelziffer ...
  { text: "01 fertig.", startMs: 3500 },   // ... Kommando verwirft sie
]);
check("Fertig: Chart 16 = c bleibt", (stFin.chart?.[16]?.befund || "") === "c", JSON.stringify(stFin.chart?.[16]));
check("Fertig: Chart 27 = fu bleibt", (stFin.chart?.[27]?.befund || "").includes("fu"), JSON.stringify(stFin.chart?.[27]));
check("Fertig: keine Geister-Zaehne (nur 16+27)", stFin.teeth.size === 2, [...stFin.teeth].join(","));
check("Fertig: offene Einzelziffer verworfen", !stFin.pendingDigit, String(stFin.pendingDigit));
// "null eins fertig" erzeugt ebenfalls keinerlei Zaehne
const stFin2 = W.LenaDokuZahn.emptyState("");
stFin2.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stFin2, [
  { text: "Null.", startMs: 1000 },
  { text: "Eins.", startMs: 1500 },
  { text: "Fertig.", startMs: 2000 },      // getrennt: KEIN Kommando, aber ...
  { text: "null eins fertig", startMs: 3000 },
]);
check("Fertig: 'null eins fertig' -> keine Zaehne", stFin2.teeth.size === 0, [...stFin2.teeth].join(","));
// Idempotenz: Voll-Rebuild mit historischem Kommando aendert nichts am Chart
const segsHist = [
  { text: "16 Karies", startMs: 1000 },
  { text: "01 fertig.", startMs: 2000 },
];
const stR1 = W.LenaDokuZahn.emptyState("");
stR1.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stR1, segsHist);
const stR2 = W.LenaDokuZahn.emptyState("");
stR2.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stR2, [{ text: "16 Karies", startMs: 1000 }]);
check(
  "Fertig-Rebuild: Chart mit/ohne Kommando identisch",
  JSON.stringify(W.LenaVoiceChart.chartEchoSnapshot(stR1.chart)) ===
    JSON.stringify(W.LenaVoiceChart.chartEchoSnapshot(stR2.chart)),
  "",
);
// Seitenwechsel-Entscheid (Guards wie in ipad-app.html):
const SW = W.LenaDokuZahn.schemaFinishShouldSwitch;
check("Switch: frisches Kommando schaltet",
  SW("01 fertig.", { at: 10000, recStartedAt: 5000, lastSwitchAt: 0 }) === true, "");
check("Switch: Re-Delivery (at <= letzter Wechsel) schaltet NICHT",
  SW("01 fertig.", { at: 10000, recStartedAt: 5000, lastSwitchAt: 10000 }) === false, "");
check("Switch: historisches Segment (vor Aufnahmestart) schaltet NICHT",
  SW("01 fertig.", { at: 1000, recStartedAt: 60000, lastSwitchAt: 0 }) === false, "");
check("Switch: Nicht-Kommando schaltet NICHT",
  SW("Zahn 41 fertig praepariert", { at: 10000, recStartedAt: 5000, lastSwitchAt: 0 }) === false, "");
check("Switch: zweites ECHTES Kommando spaeter schaltet wieder",
  SW("Befund abgeschlossen.", { at: 20000, recStartedAt: 5000, lastSwitchAt: 10000 }) === true, "");
// Doku-Rebuild: Kommando laeuft NICHT als Text in die Boxen (auch im
// Befund-Diktat-Modus nicht) und beendet den Modus nicht versehentlich.
const stFinD = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(stFinD, [
  { text: "Befund" },
  { text: "46 fehlt" },
  { text: "01 fertig." },
  { text: "weiter zur Doku" },
]);
check("Doku-Rebuild: '01 fertig' NICHT in Befund-Box", !(stFinD.values.befund || "").includes("01 fertig"), stFinD.values.befund);
check("Doku-Rebuild: 'weiter zur Doku' NICHT in Boxen",
  !Object.values(stFinD.values).some((v) => String(v).includes("weiter zur Doku")), "");
check("Doku-Rebuild: 46 fehlt bleibt im Befund", (stFinD.values.befund || "").includes("46 fehlt"), stFinD.values.befund);
// Quittungs-Echo darf (falls Echo-Schutz doppelt versagt) nichts anrichten:
const stEcho = W.LenaDokuZahn.emptyState("");
stEcho.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stEcho, [
  { text: "16 Karies", startMs: 1000 },
  { text: "Befund abgeschlossen — weiter zur Behandlungs-Doku.", startMs: 2000 },
]);
check("Quittung: erzeugt keine Marks/Zaehne", stEcho.teeth.size === 1 && (stEcho.chart?.[16]?.befund || "") === "c", [...stEcho.teeth].join(","));
check("Quittung: ist selbst KEIN Schalt-Kommando", FIN("Befund abgeschlossen — weiter zur Behandlungs-Doku.") === false, "");

// 20) Loesch-Kommandos (Chef 22.07. 02:51): Reset-Marker + Einzelzahn-Loeschung
//     wirken im VOLL-REBUILD (anders als "01 fertig", das nur live schaltet).
const RST = W.LenaDokuZahn.schemaResetCommand;
const DEL = W.LenaDokuZahn.toothDeleteCommand;
check("schemaResetCommand exportiert", typeof RST === "function");
check("toothDeleteCommand exportiert", typeof DEL === "function");
[
  "lösch alles", "Lösch alles.", "lösche alles", "loesch alles",
  "alles löschen", "Alles löschen!", "alles loeschen",
  "alles neu", "Alles neu.", "von vorne", "Von vorne.",
  "nochmal neu", "Nochmal neu.", "noch mal neu",
  "alles auf Anfang", "Alles auf Anfang.",
  "So, alles löschen bitte.",
].forEach((t) => check("Reset-Kommando: " + JSON.stringify(t), RST(t) === true, String(RST(t))));
[
  "alles klar", "alles gut", "16 fehlt", "neu", "nochmal bitte",
  "von vorne nach hinten Karies", "alles beim Alten", "lösche 16",
].forEach((t) => check("KEIN Reset: " + JSON.stringify(t), RST(t) === false, String(RST(t))));
[
  ["16 löschen", 16, false], ["16 löschen.", 16, false], ["lösche 16", 16, false],
  ["Lösche die 16.", 16, false], ["16 weg", 16, false], ["Zahn 16 weg damit.", 16, false],
  ["16 raus", 16, false], ["16 streichen", 16, false], ["entferne 16", 16, false],
  ["eins sechs löschen", 16, false], ["sechzehn löschen", 16, false],
  ["47 löschen", 47, false],
  ["16 neu", 16, true], ["16 neu.", 16, true], ["16 nochmal", 16, true],
  ["16 noch mal", 16, true], ["16 korrigieren", 16, true], ["24 nochmal", 24, true],
].forEach(([t, fdi, rebind]) => {
  const r = DEL(t);
  check(
    "Zahn-Loeschung: " + JSON.stringify(t) + " -> " + fdi + (rebind ? " (pending)" : ""),
    !!r && r.fdi === fdi && r.rebind === rebind,
    JSON.stringify(r),
  );
});
[
  "16 fehlt", "16 fehlt.",              // Befund f — KEIN Loeschen (Chef-Abgrenzung)
  "nochmal bitte", "Nochmal bitte.",    // an Lena gerichtet — kein Zahn-Kommando
  "01 fertig",                          // bleibt Seitenwechsel
  "16 neue Füllung",                    // Diktat, kein Kommando
  "16 Karies", "16", "löschen",
  "Karies weg",                         // kein Zahn davor
].forEach((t) => check("KEINE Zahn-Loeschung: " + JSON.stringify(t), DEL(t) === null, JSON.stringify(DEL(t))));
// Rebuild-Semantik global: alles VOR dem juengsten Reset verfaellt
const stRst = W.LenaDokuZahn.emptyState("");
stRst.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stRst, [
  { text: "16 Karies", startMs: 1000 },
  { text: "17 fehlt", startMs: 2000 },
  { text: "lösch alles", startMs: 3000 },
  { text: "24 Füllung", startMs: 4000 },
]);
check("Reset-Rebuild: nur 24 uebrig", stRst.teeth.size === 1 && stRst.teeth.has(24), [...stRst.teeth].join(","));
check("Reset-Rebuild: 16 leer", !(stRst.chart?.[16]?.befund || ""), JSON.stringify(stRst.chart?.[16]));
check("Reset-Rebuild: 24 = fu", (stRst.chart?.[24]?.befund || "").includes("fu"), JSON.stringify(stRst.chart?.[24]));
// Reset als LETZTES Segment: Chart komplett leer
const stRst2 = W.LenaDokuZahn.emptyState("");
stRst2.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stRst2, [
  { text: "16 Karies", startMs: 1000 },
  { text: "alles auf Anfang", startMs: 2000 },
]);
check("Reset-Rebuild: am Ende -> leer", stRst2.teeth.size === 0 && !(stRst2.values.zaehne || ""), stRst2.values.zaehne);
// Zwei Resets: der JUENGSTE zaehlt
const stRst3 = W.LenaDokuZahn.emptyState("");
stRst3.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stRst3, [
  { text: "16 Karies", startMs: 1000 },
  { text: "von vorne", startMs: 2000 },
  { text: "17 Krone", startMs: 3000 },
  { text: "alles neu", startMs: 4000 },
  { text: "34 fehlt", startMs: 5000 },
]);
check("Reset-Rebuild: juengster Reset gewinnt", stRst3.teeth.size === 1 && stRst3.teeth.has(34), [...stRst3.teeth].join(","));
// Einzelzahn: fruehere Marks des Zahns verfallen, andere bleiben
const stDel = W.LenaDokuZahn.emptyState("");
stDel.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stDel, [
  { text: "16 Karies", startMs: 1000 },
  { text: "17 fehlt", startMs: 2000 },
  { text: "16 löschen", startMs: 3000 },
]);
check("Zahn-Loeschung: 16 leer, 17 bleibt",
  !(stDel.chart?.[16]?.befund || "") && (stDel.chart?.[17]?.befund || "") === "f",
  JSON.stringify([stDel.chart?.[16], stDel.chart?.[17]]));
check("Zahn-Loeschung: 16 nicht mehr genannt", !stDel.teeth.has(16) && stDel.teeth.has(17), [...stDel.teeth].join(","));
// "16 neu": Zahn bleibt pending, naechste Code-Ansage bindet an ihn
const stRedo = W.LenaDokuZahn.emptyState("");
stRedo.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stRedo, [
  { text: "16 Karies", startMs: 1000 },
  { text: "16 neu", startMs: 2000 },
  { text: "Teleskopkrone", startMs: 3000 },
]);
check("16 neu: alte Marks weg, neue Ansage bindet an 16",
  (stRedo.chart?.[16]?.befund || "") === "t", JSON.stringify(stRedo.chart?.[16]));
check("16 neu: Zahn bleibt pending/genannt", stRedo.teeth.has(16) && stRedo.lastChartFdi === 16, String(stRedo.lastChartFdi));
// Nach spaeterem Diktat an anderem Zahn wieder normal
const stDel2 = W.LenaDokuZahn.emptyState("");
stDel2.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stDel2, [
  { text: "16 Karies", startMs: 1000 },
  { text: "16 löschen", startMs: 2000 },
  { text: "16 Krone", startMs: 3000 },
]);
check("Nach Loeschung neu diktierbar: 16 = k", (stDel2.chart?.[16]?.befund || "") === "k", JSON.stringify(stDel2.chart?.[16]));
// Loesch-Quittungen sind Steuer-Text: nie Inhalt, nie Zaehne
const stQ = W.LenaDokuZahn.emptyState("");
stQ.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stQ, [
  { text: "17 fehlt", startMs: 1000 },
  { text: "Eins sechs: gelöscht.", startMs: 2000 },
  { text: "Alles gelöscht — von vorne.", startMs: 3000 },
]);
check("Loesch-Quittungen: keine Zaehne/kein Reset", stQ.teeth.size === 1 && stQ.teeth.has(17) && (stQ.chart?.[17]?.befund || "") === "f", [...stQ.teeth].join(","));
// Doku-Rebuild: Reset + Loeschung wirken auch dort, Kommandos nie in Boxen
const stDokuDel = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(stDokuDel, [
  { text: "Befund" },
  { text: "16 Karies" },
  { text: "46 fehlt" },
  { text: "16 löschen" },
]);
check("Doku-Rebuild: 16 geloescht, 46 bleibt",
  !(stDokuDel.chart?.[16]?.befund || "") && (stDokuDel.chart?.[46]?.befund || "") === "f",
  JSON.stringify([stDokuDel.chart?.[16], stDokuDel.chart?.[46]]));
check("Doku-Rebuild: '16 löschen' NICHT in Boxen",
  !Object.values(stDokuDel.values).some((v) => String(v).includes("löschen")), "");
const stDokuRst = W.LenaDokuZahn.emptyState("");
W.LenaDokuZahn.applySegments(stDokuRst, [
  { text: "Befund" },
  { text: "16 Karies" },
  { text: "lösch alles" },
  { text: "Befund" },
  { text: "24 Füllung" },
]);
check("Doku-Rebuild: Reset verwirft Aelteres (16 weg, 24 da)",
  !(stDokuRst.chart?.[16]?.befund || "") && !!(stDokuRst.chart?.[24]?.befund || ""),
  JSON.stringify([stDokuRst.chart?.[16], stDokuRst.chart?.[24]]));
check("Doku-Rebuild: '16 Karies' vor Reset NICHT im Befund-Text",
  !(stDokuRst.values.befund || "").includes("16 Karies"), stDokuRst.values.befund);
// Idempotenz: zweiter Rebuild derselben Liste = identisches Chart
const snapA = W.LenaVoiceChart.chartEchoSnapshot(stDel.chart);
const stDelB = W.LenaDokuZahn.emptyState("");
stDelB.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stDelB, [
  { text: "16 Karies", startMs: 1000 },
  { text: "17 fehlt", startMs: 2000 },
  { text: "16 löschen", startMs: 3000 },
]);
check("Loeschung idempotent (Rebuild = Rebuild)",
  JSON.stringify(snapA) === JSON.stringify(W.LenaVoiceChart.chartEchoSnapshot(stDelB.chart)), "");

// 21) Rueckfragen bei Unverstandenem (Chef 22.07.: "16 was?" / "nochmal bitte")
const CLA = W.LenaDokuZahn.schemaClarifyAnalyze;
const CLT = W.LenaDokuZahn.clarifyQuestionText;
check("schemaClarifyAnalyze exportiert", typeof CLA === "function");
// Zahn + unparsebarer Rest -> Zahn-Rueckfrage
[
  ["16 Kordelblubb.", 16], ["16 was", 16], ["Zahn 24 irgendwas Unklares", 24],
  ["47 Mumpitz", 47],
].forEach(([t, fdi]) => {
  const r = CLA(t);
  check("Rueckfrage Zahn: " + JSON.stringify(t), !!r && r.ask === "tooth" && r.fdi === fdi, JSON.stringify(r));
});
check("Wortlaut Zahn-Rueckfrage", CLT(CLA("16 Kordelblubb")) === "Eins sechs — was genau?", CLT(CLA("16 Kordelblubb")));
// Gar nichts erkannt -> "Nochmal bitte?"
[
  "blabla unfug", "Der Hansel klingt komisch heute",
].forEach((t) => {
  const r = CLA(t);
  check("Rueckfrage Wiederholung: " + JSON.stringify(t), !!r && r.ask === "repeat", JSON.stringify(r));
});
check("Wortlaut Wiederholung", CLT({ ask: "repeat" }) === "Nochmal bitte?", CLT({ ask: "repeat" }));
// KEINE Rueckfrage bei: verstandenem Diktat, blossen Zahn-Ansagen,
// Einzelziffern (Paarung!), Steuer-/Quittungstexten, Floskeln, Systemfragen
[
  "16 Karies", "16 mesial", "17 fehlt", "Teleskopkrone",
  "Zahn 16.", "16 und 17", "16", "Vier.", "Sechs.",
  "01 fertig", "lösch alles", "16 löschen", "16 neu",
  "Eins sechs: gelöscht.", "Alles gelöscht — von vorne.",
  "Eins sechs — was genau?", "Nochmal bitte?",
  "Befund abgeschlossen — weiter zur Behandlungs-Doku.",
  "Gut.", "Okay.", "Danke.", "Moment mal.", "Hörst du mich?",
].forEach((t) => check("KEINE Rueckfrage: " + JSON.stringify(t), CLA(t) === null, JSON.stringify(CLA(t))));
// Rueckfragen-Texte sind Steuer-Text: erzeugen im Rebuild nichts
const stCla = W.LenaDokuZahn.emptyState("");
stCla.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stCla, [
  { text: "17 fehlt", startMs: 1000 },
  { text: "Eins sechs — was genau?", startMs: 2000 },
  { text: "Nochmal bitte?", startMs: 3000 },
]);
check("Rueckfragen-Echo: keine Zaehne/Marks", stCla.teeth.size === 1 && stCla.teeth.has(17), [...stCla.teeth].join(","));
// Pending-Bindung nach Zahn-Rueckfrage: "16 Unfug" benennt 16, naechste
// Code-Ansage bindet per Carry-over an 16 (allowBareNouns im Schema).
const stBind = W.LenaDokuZahn.emptyState("");
stBind.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stBind, [
  { text: "16 Kordelblubb", startMs: 1000 },
  { text: "Teleskopkrone", startMs: 2000 },
]);
check("Pending-Bindung: 16 -> Teleskopkrone", (stBind.chart?.[16]?.befund || "") === "t", JSON.stringify(stBind.chart?.[16]));
check("Pending-Bindung: kein Geister-Inhalt aus 'Kordelblubb'",
  Object.keys(W.LenaVoiceChart.chartEchoSnapshot(stBind.chart)).length === 1, "");

// 22) Echo-Buendelung (Chef 22.07.: "wiederholungen sind unvollstaendig")
const MRG = W.LenaVoiceChart.mergeEchoDiffs;
check("mergeEchoDiffs exportiert", typeof MRG === "function");
{
  const a = { added: [{ fdi: 13, codes: ["f"] }], namedOnly: [27] };
  const b = { added: [{ fdi: 14, codes: ["f"] }, { fdi: 27, codes: ["k"] }], namedOnly: [33] };
  const m = MRG(a, b);
  check("Merge: added vereint", m.added.length === 3, JSON.stringify(m.added));
  check("Merge: 27 wandert von namedOnly zu added", !m.namedOnly.includes(27) && m.added.some((e) => e.fdi === 27), JSON.stringify(m));
  check("Merge: namedOnly 33 bleibt", m.namedOnly.includes(33), JSON.stringify(m.namedOnly));
  check("Merge: null-sicher", MRG(null, a) === a && MRG(a, null) === a && MRG(null, null) === null, "");
  const m2 = MRG({ added: [{ fdi: 16, codes: ["c"] }] }, { added: [{ fdi: 16, codes: ["cd"] }] });
  check("Merge: codes je Zahn vereint", m2.added.length === 1 && m2.added[0].codes.join(",") === "c,cd", JSON.stringify(m2.added));
}
// Bereichs-Sprechweise: Serie -> "eins drei bis eins sieben"
{
  const t = W.LenaVoiceChart.buildEchoText({
    added: [13, 14, 15, 16, 17].map((f) => ({ fdi: f, codes: ["f"] })).concat([{ fdi: 27, codes: ["k"] }]),
    namedOnly: [],
  });
  check("Buendel-Echo: Bereich + Einzelbefund",
    t === "Eins drei bis eins sieben: fehlt. Zwei sieben: Krone.", t);
  // Loop-Sicherheit: Bereichs-Echo darf beim Wieder-Einspeisen NICHTS Neues markieren
  const chB = W.LenaVoiceChart.emptyChart();
  W.LenaVoiceChart.applySegments(chB, [
    { text: "13 14 15 16 17 fehlen", forceLayer: "befund" },
    { text: "27 Krone", forceLayer: "befund" },
  ]);
  const snapB1 = JSON.stringify(W.LenaVoiceChart.chartEchoSnapshot(chB));
  W.LenaVoiceChart.applySegments(chB, [
    { text: "13 14 15 16 17 fehlen", forceLayer: "befund" },
    { text: "27 Krone", forceLayer: "befund" },
    { text: t, forceLayer: "befund" },
  ]);
  check("Buendel-Echo: loop-sicher (keine neuen Marks)",
    snapB1 === JSON.stringify(W.LenaVoiceChart.chartEchoSnapshot(chB)), "");
  // Zahnloser Kiefer bleibt kompakt
  const all = [...K.ALL_FDI].map((f) => ({ fdi: f, codes: ["f"] }));
  check("Buendel-Echo: 32x fehlt -> 'Mehrere Zähne: fehlt.'",
    W.LenaVoiceChart.buildEchoText({ added: all, namedOnly: [] }) === "Mehrere Zähne: fehlt.", "");
}

// 23) AP1 (Chef 24.07.2026): Diktat-Kombis A/B als Minimum festnageln.
const codesOf = (evts, fdi) => {
  const e = (evts || []).find((x) => x.fdi === fdi);
  return e ? (e.codes || []).slice().sort().join(",") : "(fehlt)";
};
// CLASS A: mehrere Zaehne + EIN Befund
const cA1 = W.LenaVoiceChart.parseUtterance("24 25 26 x");
check("A: '24 25 26 x' -> 24/25/26 je x",
  codesOf(cA1, 24) === "x" && codesOf(cA1, 25) === "x" && codesOf(cA1, 26) === "x",
  JSON.stringify(cA1));
const cA2 = W.LenaVoiceChart.parseUtterance("24 25 26 Füllung");
check("A: '24 25 26 Füllung' -> 24/25/26 je Fu",
  codesOf(cA2, 24) === "Fu" && codesOf(cA2, 25) === "Fu" && codesOf(cA2, 26) === "Fu",
  JSON.stringify(cA2));
const cA3 = W.LenaVoiceChart.parseUtterance("zwei vier zwei fünf zwei sechs fehlt");
check("A: Zahlwoerter '24 25 26 fehlt' -> je f",
  codesOf(cA3, 24) === "f" && codesOf(cA3, 25) === "f" && codesOf(cA3, 26) === "f",
  JSON.stringify(cA3));
// CLASS B: EIN Befund an mehreren benannten Zaehnen
const cB1 = W.LenaVoiceChart.parseUtterance("Füllung an den Zähnen 24 25 26");
check("B: 'Füllung an den Zähnen 24 25 26' -> je Fu",
  codesOf(cB1, 24) === "Fu" && codesOf(cB1, 25) === "Fu" && codesOf(cB1, 26) === "Fu",
  JSON.stringify(cB1));
const cB2 = W.LenaVoiceChart.parseUtterance("fehlt an 18 28 38 48");
check("B: 'fehlt an 18 28 38 48' -> je f",
  [18, 28, 38, 48].every((f) => codesOf(cB2, f) === "f"), JSON.stringify(cB2));
// CLASS C optional: "die Achter/8er fehlen" (ohne "alle")
const cC1 = W.LenaVoiceChart.parseUtterance("die Achter fehlen");
check("C: 'die Achter fehlen' -> 18/28/38/48 f",
  [18, 28, 38, 48].every((f) => codesOf(cC1, f) === "f"), JSON.stringify(cC1.map((e) => e.fdi)));
const cC2 = W.LenaVoiceChart.parseUtterance("die 8er fehlen");
check("C: 'die 8er fehlen' -> 18/28/38/48 f",
  [18, 28, 38, 48].every((f) => codesOf(cC2, f) === "f"), JSON.stringify(cC2.map((e) => e.fdi)));

// 24) "Lena weiter" schaltet Schema->Doku; "weiter" allein NICHT.
const SFC = W.LenaDokuZahn.schemaFinishCommand;
check("Weiter: 'Lena weiter' ist Kommando", SFC("Lena weiter") === true, "");
check("Weiter: 'weiter Lena' ist Kommando", SFC("weiter Lena") === true, "");
check("Weiter: 'weiter zur Doku' ist Kommando", SFC("weiter zur Doku") === true, "");
check("Weiter: blosses 'weiter' ist KEIN Kommando", SFC("weiter") === false, "");
check("Weiter: '41 fertig praepariert' ist KEIN Kommando", SFC("41 fertig präpariert") === false, "");
// Neue Quittung 'Los geht's, weiter mit der Doku.' bleibt Steuer-Text (kein Inhalt).
const stW = W.LenaDokuZahn.emptyState("");
stW.page = "schema";
W.LenaDokuZahn.applySchemaSegments(stW, [
  { text: "27 Füllung", startMs: 1000 },
  { text: "Los geht's, weiter mit der Doku.", startMs: 2000 },
]);
check("Weiter-Quittung: keine Geister-Zaehne", stW.teeth.size === 1 && stW.teeth.has(27), [...stW.teeth].join(","));

console.log(fail ? "FAZIT: " + fail + " Fehler" : "FAZIT: Kette OK");
process.exitCode = fail ? 1 : 0;
