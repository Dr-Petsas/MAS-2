// Vorfall 17.08.2026, 09:17 — nachgestellt, damit er nicht wiederkommt.
//
// Der Chef: "Ich möchte gern wissen, was bei der Frau Ketzezi ansteht heute."
// Der Name kam verhoert an ("Ketzezi" statt "Ketsetzi"), die Kartei bot vier
// aehnlich klingende Patienten. Clara fragte zurueck — und die Antwort des Chefs
// ("die erste, die heute um zehn Uhr einen Termin hat") lief ins Leere, weil das
// Briefing seine Kandidatenliste NICHT gemerkt hatte: search_patient griff auf
// eine noch gueltige, aber voellig andere Merkliste aus einem frueheren Zug
// zurueck und lieferte Namens-Salat. Gesamtkosten: zwanzig Sekunden Umweg.
//
// Diese Pruefung deckt beide Reparaturen ab:
//   1) TAGESBEZUG: hat genau EINER der Kandidaten an dem Tag einen Termin, wird
//      direkt geantwortet (keine Rueckfrage) — das ist der Normalfall der Frage
//      "was steht bei X heute an".
//   2) MERKEN: bleibt es bei der Rueckfrage, liegt die Liste danach im
//      Sitzungs-Gedaechtnis, damit "die erste" im Folgezug trifft.
import "dotenv/config";
import "../src/firebase.js";
import { buildNextPatientsBriefing } from "../src/clara/nextPatientsBriefing.js";
import { getPatientCandidates, setPatientCandidates, clearSelectedPatient } from "../src/clara/sessions.js";
import { getDayAppointments, todayBerlin } from "../src/clara/daySchedule.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
let fehler = 0;
const pruef = (was, ok, hinweis = "") => {
  console.log(`${ok ? "OK  " : "FEHL"}  ${was}${hinweis && !ok ? `  -> ${hinweis}` : ""}`);
  if (!ok) fehler++;
};

const tag = todayBerlin();
const day = await getDayAppointments(clientId, { date: tag });
const echte = (day?.appointments || []).filter((a) => !a.isAbsence && a.patientId);
console.log(`Tag ${tag}: ${echte.length} echte Termine\n`);

// --- 1) Verhoerter Name mit Tagesbezug ------------------------------------
// Eine fremde Merkliste vorher hinterlegen: genau die Lage von 09:18. Wenn der
// Fix greift, wird sie ueberschrieben oder gar nicht gebraucht.
await setPatientCandidates(clientId, [{ id: "fremd-1", firstName: "Uwe", lastName: "Kivitiroto" }]);

const verhoert = await buildNextPatientsBriefing(clientId, { patientName: "Ketzezi", date: tag });
console.log(`Antwort auf "Ketzezi": ${String(verhoert?.message || "").slice(0, 160)}\n`);

const hatRueckfrage = /Wen genau meinen Sie/i.test(String(verhoert?.message || ""));
if (!hatRueckfrage) {
  pruef("verhoerter Name mit Tagesbezug wird OHNE Rueckfrage beantwortet",
    /Ketsetzi/i.test(String(verhoert.message || "")),
    "es wurde jemand anderes geantwortet als der Patient mit dem Termin heute");
  pruef("die Antwort nennt eine Uhrzeit (echter Termin, nicht Kartei-Auskunft)",
    /\d{1,2}:\d{2}/.test(String(verhoert.message || "")));
} else {
  // Kein Kandidat mit Termin heute (z. B. abends nach dem letzten Termin, oder
  // an einem Tag ohne Ketsetzi-Termin): dann MUSS die Liste gemerkt sein.
  const gemerkt = await getPatientCandidates(clientId);
  pruef("bei Rueckfrage liegt die Kandidatenliste im Gedaechtnis", gemerkt.length > 1,
    `gemerkt sind ${gemerkt.length} Kandidaten`);
  pruef("die fremde Merkliste von vorher ist ueberschrieben",
    !gemerkt.some((k) => String(k.lastName || "") === "Kivitiroto"),
    "der Fremd-Eintrag lebt weiter — 'die erste' wuerde wieder ins Leere zeigen");
}

// --- 2) Name, den es nicht gibt: klare Fehlmeldung, nichts gemerkt --------
await clearSelectedPatient(clientId);
const unbekannt = await buildNextPatientsBriefing(clientId, { patientName: "Schmitzberger", date: tag });
pruef("unbekannter Name gibt eine klare Fehlmeldung",
  /finde keinen Patienten/i.test(String(unbekannt?.message || "")),
  String(unbekannt?.message || "").slice(0, 120));

// --- 3) Uhrzeit-Frage bleibt unveraendert --------------------------------
const umZehn = await buildNextPatientsBriefing(clientId, { time: "10:00", date: tag });
pruef("Uhrzeit-Frage antwortet weiterhin (Termin oder klare Fehlmeldung)",
  Boolean(String(umZehn?.message || "").trim()));

console.log(fehler ? `\n${fehler} Pruefung(en) fehlgeschlagen.` : "\nAlle Pruefungen bestanden.");
process.exit(fehler ? 1 : 0);
