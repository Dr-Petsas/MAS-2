import "dotenv/config";
import { trenneMemo } from "../src/clara/dokuAbrechnung.js";

// Schnelltest der Memo-Trennung (lokales LLM + Fallbacks). Keine Firestore-
// Schreibzugriffe — reine Text-in/Text-out-Pruefung.

let fehler = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "\n      " + detail : ""}`);
  if (!cond) fehler += 1;
}

// 1) Reine Doku ohne Abrechnungs-Marker -> Kurzschluss, alles Doku.
const t1 = await trenneMemo("Zahn 36 Fuellung zweiflaechig okklusal-distal mit Composite, Infiltration, keine Besonderheiten.");
check("reines Doku-Memo bleibt komplett Doku (ohne LLM-Aufruf)",
  t1.methode === "kein_marker" && t1.abrechnungText === "" && t1.dokuText.includes("Composite"),
  `methode=${t1.methode}`);

// 2) Gemischtes Memo -> Abrechnungssatz raus aus der Doku.
const t2 = await trenneMemo("Zahn 36 Fuellung zweiflaechig okklusal-distal mit Composite, Infiltration, keine Besonderheiten. Berechne das privat mit Faktor 3,5.");
console.log("   doku:", JSON.stringify(t2.dokuText));
console.log("   abr.:", JSON.stringify(t2.abrechnungText), "| methode:", t2.methode);
check("gemischtes Memo: Abrechnungsanweisung erkannt",
  /faktor/i.test(t2.abrechnungText),
  `abrechnung=${t2.abrechnungText}`);
check("gemischtes Memo: Klinik bleibt in der Doku",
  t2.dokuText.includes("Composite") && t2.dokuText.includes("Infiltration"),
  `doku=${t2.dokuText}`);
check("gemischtes Memo: Abrechnungskommando NICHT in der Doku",
  !/berechne|faktor/i.test(t2.dokuText),
  `doku=${t2.dokuText}`);

// 3) Kurze Antwort auf offene ABRECHNUNGS-Frage -> zur Abrechnung.
const t3 = await trenneMemo("Faktor 3,5 bitte.", { offeneAbrechnungsFrage: "Mit welchem Steigerungsfaktor soll privat berechnet werden?" });
console.log("   doku:", JSON.stringify(t3.dokuText), "| abr.:", JSON.stringify(t3.abrechnungText), "| methode:", t3.methode);
check("Kurzantwort auf Abrechnungsfrage landet in der Abrechnung",
  /faktor/i.test(t3.abrechnungText),
  `abrechnung=${t3.abrechnungText}`);

// 4) Klinische Kurzantwort trotz offener Abrechnungsfrage -> bleibt Doku
//    (Sophie liest den Klinik-Text ohnehin mit).
const t4 = await trenneMemo("Keine Komplikationen, Patient stabil.", { offeneAbrechnungsFrage: "Mit welchem Steigerungsfaktor soll privat berechnet werden?" });
console.log("   doku:", JSON.stringify(t4.dokuText), "| abr.:", JSON.stringify(t4.abrechnungText), "| methode:", t4.methode);
check("klinische Kurzantwort bleibt Doku",
  t4.dokuText.includes("Komplikationen"),
  `doku=${t4.dokuText}`);

// 5) Reines Abrechnungs-Memo -> Doku leer, alles Abrechnung.
const t5 = await trenneMemo("Berechne die Fuellung bei Frau Meier privat nach GOZ mit Faktor 2,3.");
console.log("   doku:", JSON.stringify(t5.dokuText), "| abr.:", JSON.stringify(t5.abrechnungText), "| methode:", t5.methode);
check("reines Abrechnungs-Memo: nichts in der Kartei",
  !t5.dokuText || t5.dokuText.length < 15,
  `doku=${t5.dokuText}`);
check("reines Abrechnungs-Memo: Anweisung erfasst",
  /faktor|goz/i.test(t5.abrechnungText),
  `abrechnung=${t5.abrechnungText}`);

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
process.exit(fehler === 0 ? 0 : 1);
