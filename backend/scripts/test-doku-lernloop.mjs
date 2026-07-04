import "dotenv/config";
import admin from "../src/firebase.js";
import { applyAnpassung, effektiveAnforderungen } from "../src/clara/dokuLernen.js";
import { pruefeDoku, baueRueckfragenSatz } from "../src/clara/dokuCheck.js";

// Live-Test des Lern-Loops (schreibt NUR ins Lern-Profil mas_doku_lernprofil
// und raeumt am Ende vollstaendig auf; keine Termin-/Patientendaten beruehrt).
const CLIENT = "MEe4ZQHEzOPzLcexyhdT";
const FACH = "zahnmedizin";
let fehler = 0;

function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fehler += 1;
}

// --- Schritt 1: PZR-Diktat MIT Roentgen-Erwaehnung => Querschnitt fragt nach ---
const diktatPzr = "PZR gemacht, achtundzwanzig Zaehne, Roe sechsunddreissig angefertigt.";
const check1 = await pruefeDoku(CLIENT, FACH, { motiveName: "PRO Professionelle Zahnreinigung", text: diktatPzr });
console.log("Check 1 (vor Unterdrueckung):", JSON.stringify(check1.fragen), "| Satz:", baueRueckfragenSatz(check1));
check("Roentgen-Rueckfrage VOR Unterdrueckung vorhanden",
  check1.ok && check1.fragen.some((f) => /roentgen|indikation|aufnahme/i.test(f.key)),
  `fragen=${check1.fragen.map((f) => f.key).join(",")}`);

// --- Schritt 2: Voice-Korrektur "frag nicht mehr nach Roentgen bei Zahnreinigung" ---
const korr = await applyAnpassung(CLIENT, FACH, {
  aktion: "frag_nicht_mehr", besuchsgrund: "Zahnreinigung", feld: "Roentgenbilder",
  original: "Frag nicht immer nach Roentgenbildern bei der Zahnreinigung.",
});
console.log("Korrektur:", korr.message);
check("Unterdrueckung angenommen", korr.ok === true, korr.message);

// --- Schritt 3: gleiches Diktat, SOFORT danach => keine Roentgen-Rueckfrage mehr ---
const check3 = await pruefeDoku(CLIENT, FACH, { motiveName: "PRO Professionelle Zahnreinigung", text: diktatPzr });
console.log("Check 3 (nach Unterdrueckung):", JSON.stringify(check3.fragen));
check("Roentgen-Rueckfrage NACH Unterdrueckung weg",
  check3.ok && !check3.fragen.some((f) => /roentgen|indikation|aufnahme/i.test(f.key)),
  `fragen=${check3.fragen.map((f) => f.key).join(",")}`);

// --- Schritt 4: neue Frage lernen: "frag bei Fuellungen auch nach der Zahnfarbe" ---
const lern = await applyAnpassung(CLIENT, FACH, {
  aktion: "frag_auch", besuchsgrund: "Fuellung", feld: "Zahnfarbe",
  frage: "Welche Zahnfarbe wurde bestimmt?",
  original: "Frag bei Fuellungen kuenftig auch nach der Zahnfarbe.",
});
console.log("Lernen:", lern.message);
const effFuellung = await effektiveAnforderungen(CLIENT, FACH, "KCH Fuellung klein");
check("gelerntes Feld in effektiven Anforderungen",
  effFuellung.felder.some((f) => f.key === "zahnfarbe" && f.gelernt),
  effFuellung.felder.map((f) => f.key).join(","));

// --- Schritt 5: Fuellungs-Diktat ohne Zahnfarbe => gelernte Frage kommt ---
const check5 = await pruefeDoku(CLIENT, FACH, {
  motiveName: "KCH Fuellung klein",
  text: "Zahn sechsundzwanzig Kompositfuellung okklusal-distal gelegt, Infiltration, Kofferdam, keine Besonderheiten, Kontrolle in zwei Wochen.",
});
console.log("Check 5 (Fuellung):", JSON.stringify(check5.fragen), "| Satz:", baueRueckfragenSatz(check5));
check("gelernte Zahnfarbe-Frage wird gestellt",
  check5.ok && check5.fragen.some((f) => f.key === "zahnfarbe"),
  `fragen=${check5.fragen.map((f) => f.key).join(",")}`);

// --- Schritt 6: "frag doch wieder nach Roentgen bei Zahnreinigung" ---
const wieder = await applyAnpassung(CLIENT, FACH, {
  aktion: "frag_wieder", besuchsgrund: "Zahnreinigung", feld: "Roentgen",
});
console.log("Wieder:", wieder.message);
const check6 = await pruefeDoku(CLIENT, FACH, { motiveName: "PRO Professionelle Zahnreinigung", text: diktatPzr });
check("Roentgen-Rueckfrage nach 'frag wieder' zurueck",
  check6.ok && check6.fragen.some((f) => /roentgen|indikation|aufnahme/i.test(f.key)),
  `fragen=${check6.fragen.map((f) => f.key).join(",")}`);

// --- Aufraeumen: Test-Lernprofil komplett entfernen ---
await admin.firestore().collection("clients").doc(CLIENT)
  .collection("mas_doku_lernprofil").doc(FACH).delete();
console.log("\nLern-Profil-Testdaten geloescht.");

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
process.exit(fehler === 0 ? 0 : 1);
