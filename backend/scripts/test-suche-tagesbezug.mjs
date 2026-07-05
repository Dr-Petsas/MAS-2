import "dotenv/config";
import { resolveDayIntent, buildCalendarContext } from "../src/brain/search.js";

// KI-Suche mit Tagesbezug (Befund 05.07.2026): "welche Patienten habe ich am
// Montag" wurde aus Gedaechtnis-Events (SMS/Anrufe) geraten statt aus dem
// echten Kalender. Diese Tests sichern die PURE Logik ab:
//   resolveDayIntent    — heute/morgen/uebermorgen/gestern, Wochentage,
//                         explizite Daten -> Berlin-ISO-Datum
//   buildCalendarContext — Tagesplan als Prompt-Block (sortiert, Abwesenheiten)
// Run: node scripts/test-suche-tagesbezug.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

// Fester Anker: Sonntag, 05.07.2026 (der Tag des Befunds).
const TODAY = "2026-07-05";
const day = (q) => resolveDayIntent(q, TODAY)?.date ?? null;

console.log("=== resolveDayIntent (heute = Sonntag, 05.07.2026) ===");
check(day("welche patienten habe ich am montag") === "2026-07-06", "'am montag' -> kommender Montag 06.07.");
check(day("Welche Termine sind HEUTE?") === "2026-07-05", "'heute' -> 05.07.");
check(day("was ist morgen los") === "2026-07-06", "'morgen' -> 06.07.");
check(day("wer kommt übermorgen") === "2026-07-07", "'übermorgen' -> 07.07. (nicht als 'morgen' gelesen)");
check(day("was war gestern") === "2026-07-04", "'gestern' -> 04.07.");
check(day("welche patienten hatte ich am freitag") === "2026-07-03", "'hatte ... freitag' -> vergangener Freitag 03.07.");
check(day("was war am sonntag") === "2026-06-28", "'war ... sonntag' -> letzter Sonntag 28.06. (nicht heute)");
check(day("termine am sonntag") === "2026-07-05", "'am sonntag' ohne Vergangenheit -> heute 05.07.");
check(day("termine am 06.07.2026") === "2026-07-06", "explizit '06.07.2026'");
check(day("was ist am 6.7.") === "2026-07-06", "explizit '6.7.' -> laufendes Jahr");
check(day("termin am 6. Juli") === "2026-07-06", "explizit '6. Juli'");
check(day("rechnung blessing") === null, "ohne Tagesbezug -> null");
check(day("um 9.45 uhr anrufen") === null, "Uhrzeit '9.45' ist KEIN Datum (Monat 45 verworfen)");
check(day("karfreitag planung") === null, "'karfreitag' matcht nicht als 'freitag' (Wortgrenze)");

console.log("\n=== buildCalendarContext (Prompt-Block) ===");
const at = (h, m) => new Date(`2026-07-06T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`).getTime();
const ctx = buildCalendarContext({
  date: "2026-07-06",
  calendars: [{ id: "c1", name: "Dr. Petsas" }, { id: "c2", name: "Dr. Patrikis" }],
  appointments: [
    { startMs: at(11, 40), endMs: at(12, 0), calendarId: "c1", patientName: "Uwe Freigang", visitMotive: "", isAbsence: false },
    { startMs: at(9, 0), endMs: at(9, 30), calendarId: "c1", patientName: "Andrea Sablon", visitMotive: "Implantate", isAbsence: false, newPatient: false },
    { startMs: at(9, 0), endMs: at(9, 45), calendarId: "c2", patientName: "Kai-Uwe Ingenhoven", visitMotive: "", isAbsence: false },
    { startMs: at(8, 0), endMs: at(18, 0), calendarId: "", calendarName: "Dr. Nikolaou", isAbsence: true },
    { startMs: at(11, 15), endMs: at(11, 40), calendarId: "c1", patientName: "Uwe Freigang", visitMotive: "", isAbsence: false },
    { startMs: at(12, 5), endMs: at(12, 35), calendarId: "c1", patientName: "Iris Hossner", visitMotive: "", isAbsence: false, patientStatus: 5 },
  ],
});
check(ctx.count === 5, `5 echte Termine gezaehlt (war ${ctx.count})`);
check(ctx.text.includes("Iris Hossner") && ctx.text.includes("ABGESAGT/entschuldigt"), "abgesagter Termin (patientStatus 5) als durchgestrichen markiert");
check(ctx.label.includes("6. Juli 2026") && /^Montag/.test(ctx.label), `Label 'Montag, 6. Juli 2026' (war '${ctx.label}')`);
const lines = ctx.text.split("\n");
check(lines[0].includes("09:00") , `sortiert, erste Zeile 09:00 (war '${lines[0]}')`);
check(ctx.text.includes("Andrea Sablon — bei Dr. Petsas — Implantate"), "Zeile mit Name + Behandler + Besuchsgrund");
check((ctx.text.match(/Uwe Freigang/g) || []).length === 2, "Doppeltermin Freigang bleibt doppelt (11:15 + 11:40)");
check(ctx.text.includes("ABWESEND/GESPERRT: Dr. Nikolaou"), "Abwesenheit als eigener Eintrag");
const empty = buildCalendarContext({ date: "2026-07-06", calendars: [], appointments: [] });
check(empty.count === 0 && empty.text.includes("keine Termine"), "leerer Tag -> '(keine Termine eingetragen)'");

console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failed ? 1 : 0);
