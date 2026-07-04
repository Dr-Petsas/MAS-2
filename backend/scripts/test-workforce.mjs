// Pure-Unit-Tests für Claras Dienstplan-/Urlaubs-Auskunft (workforce.js).
// Kein Firestore nötig: testet die deterministische Compute-, Spoken- und
// Auflösungs-Schicht mit Fixtures.  Lauf: node scripts/test-workforce.mjs
import {
  workdaysInRange, vacationStats, presenceOn, presentInPart, absencesOnDay,
  resolveStaffByName, parseDateFromText,
  spokenVacation, spokenPresence, spokenCoverage, spokenSchedule, spokenAbsenceHistory,
} from "../src/clara/workforce.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error("  ✗", name); } }
function eq(name, a, b) { ok(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, a === b); }

// --- Datumshelfer für deterministische, nicht-zirkuläre Erwartungen ----------
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function nextMonday() { const d = new Date(); d.setHours(12, 0, 0, 0); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); return d; }
const mon = nextMonday();
const monStr = ymd(mon);
const friStr = ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4));
const satStr = ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 5));

// --- workdaysInRange ---------------------------------------------------------
eq("Mo–Fr-Woche = 5 Arbeitstage", workdaysInRange(monStr, friStr, [1, 2, 3, 4, 5]), 5);
eq("einzelner Samstag = 0", workdaysInRange(satStr, satStr, [1, 2, 3, 4, 5]), 0);
eq("Neujahr (Feiertag) = 0", workdaysInRange("2026-01-01", "2026-01-01", [1, 2, 3, 4, 5]), 0);
eq("Teilzeit Mo/Mi/Fr in Mo–Fr = 3", workdaysInRange(monStr, friStr, [1, 3, 5]), 3);

// --- Team-Fixture ------------------------------------------------------------
const team = [
  { id: "u1", name: "Aylin Sahin", firstName: "Aylin", lastName: "Sahin", active: true, vacationDaysPerYear: 30, workStart: "08:00", workEnd: "17:00", workdays: [1, 2, 3, 4, 5], hasProfile: true },
  { id: "u2", name: "Bea Yilmaz", firstName: "Bea", lastName: "Yilmaz", active: true, vacationDaysPerYear: 28, workStart: "08:00", workEnd: "12:30", workdays: [1, 2, 3, 4, 5], hasProfile: true },
  { id: "u3", name: "Clara Sahin", firstName: "Clara", lastName: "Sahin", active: true, vacationDaysPerYear: 25, workStart: "13:00", workEnd: "18:00", workdays: [1, 3, 5], hasProfile: true },
];
const year = mon.getFullYear();

// --- vacationStats -----------------------------------------------------------
const urlaubWeek = [{ id: "a1", userId: "u1", appliesToAll: false, type: "urlaub", startDate: monStr, endDate: friStr, status: "approved" }];
const vs1 = vacationStats(team[0], urlaubWeek, year);
eq("Urlaub: 5 genommen", vs1.takenUrlaub, 5);
eq("Urlaub: Rest 25", vs1.remaining, 25);
eq("Urlaub: keine Betriebsferien", vs1.takenBetrieb, 0);

const betrieb = [{ id: "b1", userId: "", appliesToAll: true, type: "betriebsferien", startDate: monStr, endDate: friStr, status: "approved" }];
const vs2 = vacationStats(team[0], [...urlaubWeek, ...betrieb], year);
eq("Betriebsferien zählen gegen jeden (5 Tage)", vs2.takenBetrieb, 5);
eq("Saldo nach Urlaub + Betriebsferien", vs2.remaining, 30 - 5 - 5);
// Teilzeit u3 (Mo/Mi/Fr): Betriebsferien Mo–Fr = 3 Arbeitstage
eq("Betriebsferien Teilzeit = 3", vacationStats(team[2], betrieb, year).takenBetrieb, 3);

// --- presenceOn / presentInPart ----------------------------------------------
const wedStr = ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 2)); // Mittwoch
const pres = presenceOn(team, urlaubWeek, wedStr); // u1 im Urlaub diese Woche
eq("Mittwoch: 3 eingeplant", pres.scheduled.length, 3);
eq("Mittwoch: u1 abwesend", pres.absent.some((m) => m.id === "u1"), true);
eq("Mittwoch: 2 anwesend", pres.present.length, 2);
eq("Vormittag (u2 bis 12:30) anwesend", presentInPart(pres, "morning").some((m) => m.id === "u2"), true);
eq("Nachmittag: u2 NICHT (Schluss 12:30)", presentInPart(pres, "afternoon").some((m) => m.id === "u2"), false);
eq("Nachmittag: u3 (ab 13:00) anwesend", presentInPart(pres, "afternoon").some((m) => m.id === "u3"), true);

// Dienstag: u3 arbeitet nicht (nur Mo/Mi/Fr)
const tueStr = ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 1));
eq("Dienstag: u3 nicht eingeplant", presenceOn(team, [], tueStr).scheduled.some((m) => m.id === "u3"), false);

// Betriebsferien -> niemand da
eq("Betriebsferien: niemand da", presenceOn(team, betrieb, wedStr).present.length, 0);
eq("Betriebsferien: teamClosed", presenceOn(team, betrieb, wedStr).teamClosed, true);

// --- absencesOnDay -----------------------------------------------------------
const absDay = absencesOnDay(team, urlaubWeek, wedStr);
eq("Abwesend am Mittwoch: 1 Eintrag", absDay.length, 1);
eq("Abwesend = Aylin Sahin", absDay[0].who, "Aylin Sahin");

// --- resolveStaffByName ------------------------------------------------------
eq("'Frau Yilmaz' -> u2", resolveStaffByName(team, "wie viele urlaubstage hat frau yilmaz")?.staff?.id, "u2");
eq("'Aylin' -> u1", resolveStaffByName(team, "wann ist aylin da")?.staff?.id, "u1");
ok("'Frau Sahin' mehrdeutig -> candidates", (resolveStaffByName(team, "frau sahin")?.candidates || []).length === 2);
eq("unbekannter Name -> null", resolveStaffByName(team, "frau müller"), null);

// --- parseDateFromText -------------------------------------------------------
const today = ymd(new Date());
eq("'heute'", parseDateFromText("wer ist heute da", today), today);
ok("'morgen' != heute", parseDateFromText("wer ist morgen da", today) !== today && parseDateFromText("morgen", today) > today);
eq("'24.12.2026'", parseDateFromText("habe ich am 24.12.2026 genug helfer", today), "2026-12-24");

// --- Spoken (Substring-Checks, keine Datums-Flakiness) -----------------------
ok("spokenVacation nennt Name + Resttage", /Aylin Sahin/.test(spokenVacation(team[0], vs1, year)) && /25/.test(spokenVacation(team[0], vs1, year)));
ok("spokenPresence Nachmittag nennt u3", /Clara Sahin/.test(spokenPresence(pres, { part: "afternoon" })));
ok("spokenCoverage nennt 2 von 3", /2 von 3/.test(spokenCoverage(pres)));
ok("spokenSchedule nennt Arbeitstage", /arbeitet/.test(spokenSchedule(team[2])) && /Montag/.test(spokenSchedule(team[2])));
ok("spokenAbsenceHistory nennt Urlaub", /Urlaub/.test(spokenAbsenceHistory(team[0], urlaubWeek)));

console.log(`\nworkforce: ${pass} ok, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
