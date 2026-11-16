// Probe am echten Modell: ordnet Beispieltexte ein. Liest nur, speichert nichts.
// Aufruf: node scripts/_probe_einordnen.mjs [datei.txt ...]
import fs from "node:fs";
import path from "node:path";
import { chat, strongLlm } from "../src/mail/llm.js";
import { PROBE_EINORDNEN, einordnungLesen } from "../src/hkp/probeEinordnen.js";

const FEST = [
  ["par", "PAR-Plan.pdf", "Parodontalstatus und Behandlungsplan. Diagnose: Parodontitis Stadium III Grad B. BEMA 4 PAR-Status, ATG, MHU, AIT a 12x, AIT b 14x, BEV a, UPT a-g. Krankenkasse AOK Rheinland."],
  ["par", "scan3.pdf", "Kostenvoranschlag Parodontitistherapie privat. GOZ 4005, 4070 x 10, 4075 x 12, 4110, 1040. Faktor 2,3. Geschlossene Kürettage, subgingivale Konkremententfernung. Gesamtbetrag 1.240,00 EUR."],
  ["kb", "plan.pdf", "Behandlungsplan Kiefergelenkserkrankungen / Kieferbruch. K1 Aufbissbehelf mit adjustierter Oberfläche, K7 Kontrollbehandlung, 7b Planungsmodelle. Diagnose CMD, Bruxismus. Labor BEL 401 0."],
  ["kb", "kva.pdf", "Privater Kostenvoranschlag Funktionsanalyse und Schienentherapie. GOZ 8000 klinische Funktionsanalyse, 8010, 8020, 8050, 7010 Aufbissbehelf mit adjustierter Oberfläche, Faktor 2,3 bis 3,5."],
  ["kfo", "bp.pdf", "Kieferorthopädischer Behandlungsplan. KIG D4. BEMA 119c, 120b, 126a Brackets, 127a, 128a. Multibandapparatur im Ober- und Unterkiefer, voraussichtliche Dauer 16 Quartale."],
  ["kfo", "aligner.pdf", "Heil- und Kostenplan Alignertherapie. GOZ 6030, 6060, 6080, 6100 x 20, 6140. Schienen Ober- und Unterkiefer, 24 Aligner, Retainer. Gesamt 4.850 EUR."],
  ["kons", "mkv.pdf", "Mehrkostenvereinbarung nach § 28 Abs. 2 SGB V. Zahn 36 Kompositfüllung in Adhäsivtechnik dreiflächig GOZ 2100 Faktor 2,3 abzüglich Kassenanteil BEMA 13c. Eigenanteil 86,40 EUR."],
  ["kons", "endo.pdf", "Kostenvoranschlag Wurzelkanalbehandlung Zahn 46. GOZ 2390, 2410 x 3, 2420 x 3, 2440 x 3, 2197, GOÄ 5000. Elektrometrische Längenbestimmung, OP-Mikroskop Zuschlag 0110."],
  ["labor", "labor.pdf", "Dentallabor Müller GmbH Kostenvoranschlag. BEL II 001 0 Modell, 012 0 Einartikulieren, 102 1 Vollkrone Metall, 933 0 Versandkosten. Material NEM 12 g. Summe Material und Labor 412,30 EUR."],
  ["goz-anlage", "anlage.pdf", "Anlage zum Heil- und Kostenplan vom 03.11.2026. Aufstellung der voraussichtlichen GOZ-Leistungen bei gleichartiger Versorgung. Zahn 16 vollkeramische Krone GOZ 2210 Faktor 3,2; 2197; 5170. Voraussichtliches Honorar GOZ 612,40 EUR. Festzuschuss siehe HKP."],
  ["hkp", "hkp.pdf", "Heil- und Kostenplan Teil 1. Befund B: 16 ww, 15 f, 14 kw. Regelversorgung R: 16 K, 15 B, 14 K. Therapieplanung TP. Befunde für Festzuschüsse 2.1, 1.1. Zahnärztliches Honorar BEMA 20a, 91a, 92. Bonus 70 %. Krankenkasse Techniker."],
  ["privat-ze", "kv.pdf", "Privater Heil- und Kostenplan Zahnersatz. Zahn 11, 21 Vollkeramikkronen GOZ 2210 x 2 Faktor 3,5, 2270 Provisorium, 5170, 2030. Laborkosten geschätzt 780 EUR. Gesamtkosten 2.140 EUR. Privatversichert."],
];

const faelle = FEST.map(([soll, name, text]) => ({ soll, name, text }));
for (const datei of process.argv.slice(2)) {
  faelle.push({ soll: "?", name: path.basename(datei), text: fs.readFileSync(datei, "utf8").slice(0, 9000) });
}

const { base, model } = strongLlm();
let richtig = 0;
for (const f of faelle) {
  const t0 = Date.now();
  const antwort = await chat([
    { role: "system", content: PROBE_EINORDNEN },
    { role: "user", content: `Dateiname: ${f.name}\n\nText:\n${f.text}` },
  ], { temperature: 0, maxTokens: 400, model, baseUrl: base, timeoutMs: 40000 });
  const e = antwort.ok ? einordnungLesen(antwort.text) : null;
  const ok = e && (f.soll === "?" || e.art === f.soll);
  if (ok && f.soll !== "?") richtig++;
  console.log(`${ok ? "ok  " : "FEHL"} soll=${f.soll} ist=${e ? e.art : "-"} kasse=${e ? e.kasse : "-"} ${((Date.now() - t0) / 1000).toFixed(1)}s ${f.name} | ${e ? e.grund : (antwort.error || antwort.text || "").toString().slice(0, 120)}`);
}
console.log(`${richtig}/${FEST.length} richtig`);
