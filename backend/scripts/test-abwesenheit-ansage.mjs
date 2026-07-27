// Abwesenheiten hoerbar machen (Chef 27.07.2026).
//
// Vorfall: Clara rief am Abend an und wollte am Dienstag, 28.07., "sechs
// Stunden frei" mit Recall-Patienten fuellen — obwohl der Kalender des Chefs
// vom 27.07. 10:30 bis 28.07. 17:00 gesperrt war. Zwei Fehler steckten drin:
//   1. Die Tagesabfrage sah eine Sperre nur an ihrem STARTTAG (sie filtert auf
//      `start` im Tagesfenster). Jeder Folgetag eines Urlaubs galt als frei.
//   2. Selbst mit sichtbarer Sperre sagte Clara nur "Ausserdem sind 2
//      Sperrzeiten eingetragen" — nie "Sie selbst sind nicht da".
// Dieser Test haelt beides fest (rein, ohne Firestore).
import {
  computeDayBriefing, buildSpokenDayBriefing, spokenOwnAbsence, todayBerlin,
} from "../src/clara/daySchedule.js";

let fehler = 0;
function check(name, ok, info = "") {
  console.log(`${ok ? "OK  " : "FEHL"} ${name}${info ? ` — ${info}` : ""}`);
  if (!ok) fehler += 1;
}

const MORGEN = (() => {
  const d = new Date(`${todayBerlin()}T12:00:00+02:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
})();
const ms = (tag, hhmm) => new Date(`${tag}T${hhmm}:00+02:00`).getTime();

const termin = (hhmm, endHhmm, kal = "Dr. Patrikis") => ({
  id: `t_${hhmm}`, startMs: ms(MORGEN, hhmm), endMs: ms(MORGEN, endHhmm),
  calendarId: kal, calendarName: kal, patientId: "p1", patientLastName: "Kracke",
  patientName: "Anna Kracke", isAbsence: false, status: "confirmed", docsStatus: "green",
});

console.log("--- Eigene Abwesenheit wird benannt");

// Ganztags (vom Vortag hereingezogen und weiterlaufend).
const ganzTag = spokenOwnAbsence([{
  calendarName: "Dr. Petsas", startMs: ms(MORGEN, "00:00"), endMs: ms(MORGEN, "23:59"),
  title: "Urlaub", multiDay: true,
}], { operatorDoctorName: "Dr. Petsas" });
check("ganztaegig: 'nicht da' + Grund", /ganztägig nicht da/.test(ganzTag) && /Urlaub/.test(ganzTag), ganzTag);

// Sperre laeuft mittags aus -> "erst ab 17 Uhr da".
const bisMittag = spokenOwnAbsence([{
  calendarName: "Dr. Petsas", startMs: ms(MORGEN, "00:00"), endMs: ms(MORGEN, "17:00"),
  title: "15:00 bis 17:00 Uhr\nModule 1: Fundamentals of Oral Implantology", multiDay: true,
}], { operatorDoctorName: "Dr. Petsas" });
check("bis 17 Uhr gesperrt -> 'erst ab 17 Uhr da'", /erst ab 17 Uhr da/.test(bisMittag), bisMittag);
check("reine Uhrzeit-Zeile wird nicht als Grund vorgelesen",
  !/15 Uhr bis 17 Uhr —/.test(bisMittag), bisMittag);

// Fenster mitten am Tag.
const fenster = spokenOwnAbsence([{
  calendarName: "Dr. Petsas", startMs: ms(MORGEN, "14:30"), endMs: ms(MORGEN, "17:00"), title: "Notar",
}], { operatorDoctorName: "Dr. Petsas" });
check("Zeitfenster wird mit Uhrzeiten genannt",
  /von 14 Uhr 30 bis 17 Uhr gesperrt/.test(fenster) && /Notar/.test(fenster), fenster);

// Sperre laeuft ueber Mitternacht hinaus: am Starttag "ab 10:30 nicht mehr da",
// NICHT "bis 17 Uhr" (das ist die Uhrzeit des Folgetages).
const ueberNacht = spokenOwnAbsence([{
  calendarName: "Dr. Petsas", startMs: ms(todayBerlin(), "10:30"), endMs: ms(MORGEN, "17:00"),
  title: "Fortbildung", multiDay: true,
}], { operatorDoctorName: "Dr. Petsas" });
check("Sperre ueber Mitternacht: 'ab 10 Uhr 30 nicht mehr da'",
  /ab 10 Uhr 30 nicht mehr da/.test(ueberNacht) && !/bis 17 Uhr/.test(ueberNacht), ueberNacht);

// Fremde Sperre ist NICHT die eigene.
check("Sperre eines Kollegen loest keine 'Sie sind nicht da'-Ansage aus",
  spokenOwnAbsence([{
    calendarName: "Dr. Patrikis", startMs: ms(MORGEN, "00:00"), endMs: ms(MORGEN, "23:59"),
  }], { operatorDoctorName: "Dr. Petsas" }) === "");

console.log("\n--- Tagesbriefing: eigener Urlaub steht im Text");
const appts = [
  termin("09:00", "09:30"), termin("09:30", "10:00"), termin("11:30", "12:00"),
  {
    id: "abs_petsas", startMs: ms(MORGEN, "00:00"), endMs: ms(MORGEN, "17:00"),
    calendarId: "Dr. Petsas", calendarName: "Dr. Petsas", isAbsence: true, isMultiDay: true,
    title: "Fortbildung", status: "confirmed", patientId: "",
  },
];
const b = computeDayBriefing(appts, {
  calendars: [{ id: "Dr. Petsas", name: "Dr. Petsas" }, { id: "Dr. Patrikis", name: "Dr. Patrikis" }],
});
const text = buildSpokenDayBriefing(b, { date: MORGEN, operatorDoctorName: "Dr. Petsas", overview: true });
check("Briefing sagt die eigene Abwesenheit", /erst ab 17 Uhr da/.test(text), text);
check("Briefing zaehlt keine anonyme Sperrzeit mehr", !/Außerdem (ist|sind) .*Sperrzeit/.test(text), text);
check("Briefing siezt", !/\b(du|dir|dich|dein)\b/i.test(text), text);

console.log("\n--- Leerer Tag mit eigener Sperre");
const leer = buildSpokenDayBriefing(
  computeDayBriefing([appts[3]], { calendars: [{ id: "Dr. Petsas", name: "Dr. Petsas" }] }),
  { date: MORGEN, operatorDoctorName: "Dr. Petsas" });
check("leerer Urlaubstag nennt die Abwesenheit", /erst ab 17 Uhr da/.test(leer), leer);

console.log(fehler ? `\n${fehler} Test(s) fehlgeschlagen.` : "\nAlle Tests bestanden.");
process.exit(fehler ? 1 : 0);
