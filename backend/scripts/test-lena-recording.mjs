// Pure Unit-Tests fuer die halluzinationsfreie Patientenbindung der Lena-
// Aufnahme (W-LENA-1). Kein Firestore, kein LLM. Aufruf: node scripts/test-lena-recording.mjs
import {
  pickCurrentAppointment,
  spokenApptWhen,
  resolveChairAppointment,
  matchCalendarId,
  matchTodayAppointmentsByName,
} from "../src/clara/treatmentRecording.js";

let fails = 0;
function check(name, cond, detail = "") {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`${tag}  ${name}${!cond && detail ? " — " + detail : ""}`);
  if (!cond) fails++;
}

const MIN = 60 * 1000;
const now = 1_000_000_000;
const P = (id, startOff, durMin = 30, extra = {}) => ({
  id, patientId: `pat_${id}`, patientName: `Patient ${id}`,
  startMs: now + startOff, endMs: now + startOff + durMin * MIN,
  isAbsence: false, calendarId: extra.calendarId || "calA", ...extra,
});

// 1) Leer -> none
check("leer -> none", pickCurrentAppointment([], now).reason === "none");

// 2) Genau ein laufender Termin -> in_progress
{
  const r = pickCurrentAppointment([P("a", -10 * MIN)], now);
  check("ein laufender -> in_progress", r.reason === "in_progress" && r.appointment?.id === "a", r.reason);
}

// 3) Termin gerade vorbei, innerhalb Grace (15 min) -> in_progress
{
  const r = pickCurrentAppointment([P("a", -40 * MIN, 30)], now); // endet vor 10 min
  check("gerade vorbei (Grace) -> in_progress", r.reason === "in_progress", r.reason);
}

// 4) Mehrere laufende (2 Behandler) -> ambiguous, nicht raten
{
  const r = pickCurrentAppointment([
    P("a", -5 * MIN, 30, { calendarId: "calA" }),
    P("b", -5 * MIN, 30, { calendarId: "calB" }),
  ], now);
  check("mehrere laufende -> ambiguous", r.reason === "ambiguous" && r.appointment === null, r.reason);
  check("ambiguous liefert Kandidaten", r.candidates.length === 2);
}

// 5) Keiner laeuft, naechster in 20 min -> nearest
{
  const r = pickCurrentAppointment([P("a", 20 * MIN)], now);
  check("naechster in 20 min -> nearest", r.reason === "nearest" && r.appointment?.id === "a", r.reason);
}

// 6) Keiner laeuft, naechster erst in 90 min -> none (ausserhalb Fenster)
{
  const r = pickCurrentAppointment([P("a", 90 * MIN)], now);
  check("naechster in 90 min -> none", r.reason === "none", r.reason);
}

// 7) Abwesenheitsbloecke + Termine ohne Patient werden ignoriert
{
  const r = pickCurrentAppointment([
    { id: "abs", isAbsence: true, startMs: now - 5 * MIN, endMs: now + 25 * MIN },
    { id: "hold", patientId: "", startMs: now - 5 * MIN, endMs: now + 25 * MIN },
    P("a", 10 * MIN),
  ], now);
  check("Abwesenheit/Halt ignoriert, echter Termin bleibt", r.appointment?.id === "a", r.reason);
}

// 8) Nur Abwesenheit -> none
check("nur Abwesenheit -> none",
  pickCurrentAppointment([{ id: "abs", isAbsence: true, startMs: now, endMs: now + MIN }], now).reason === "none");

// 9) spokenApptWhen
check("spokenApptWhen(0) leer", spokenApptWhen(0) === "");
check("spokenApptWhen enthaelt 'Uhr'", /Uhr/.test(spokenApptWhen(now)));

// 10) resolveChairAppointment: activeRecording gewinnt
{
  const r = resolveChairAppointment(
    { appointmentId: "rec1", locationId: "locA", patientName: "Mueller" },
    [P("a", -5 * MIN)],
    now,
    "locB",
  );
  check("activeRecording gewinnt", r.ok && r.reason === "recording" && r.appointmentId === "rec1" && r.locationId === "locA");
}

// 11) resolveChairAppointment: ohne active -> Stuhl-Termin
{
  const r = resolveChairAppointment(null, [P("a", -5 * MIN)], now, "locA");
  check("ohne active -> in_progress", r.ok && r.reason === "in_progress" && r.appointmentId === "a" && r.locationId === "locA");
}

// 12) resolveChairAppointment: keiner -> none
{
  const r = resolveChairAppointment(null, [], now, "locA");
  check("leer -> found=false", !r.ok && r.reason === "none");
}

// 13) matchCalendarId
check("matchCalendarId exakt", matchCalendarId([{ id: "c1", name: "Dr. Petsas" }], "Dr. Petsas") === "c1");
check("matchCalendarId Token", matchCalendarId([{ id: "c1", name: "Dr. med. Petsas" }], "Petsas") === "c1");
check("matchCalendarId leer", matchCalendarId([{ id: "c1", name: "Dr. Petsas" }], "") === "");

// 14) matchTodayAppointmentsByName — Befund-Sprachbefehl gegen heutige Liste
{
  const day = [
    P("a", -5 * MIN, 30, { patientName: "Anna Meier", patientLastName: "Meier" }),
    P("b", 60 * MIN, 30, { patientName: "Peter Mueller", patientLastName: "Mueller" }),
  ];
  const u = matchTodayAppointmentsByName(day, "Herrn Meier");
  check("Befund-Name unique", u.reason === "unique" && u.matches[0]?.id === "a", u.reason);
  const n = matchTodayAppointmentsByName(day, "Schmidt");
  check("Befund-Name none", n.reason === "none" && !n.matches.length, n.reason);
  const twins = [
    P("c1", -5 * MIN, 30, { patientName: "Anna Meier", patientLastName: "Meier" }),
    P("c2", 90 * MIN, 30, { patientName: "Bernd Meier", patientLastName: "Meier" }),
  ];
  const amb = matchTodayAppointmentsByName(twins, "Meier");
  check("Befund-Name ambiguous", amb.reason === "ambiguous" && amb.matches.length === 2, amb.reason);
  const hint = matchTodayAppointmentsByName(twins, "Meier", "Anna");
  check("Befund-Name hint engt ein", hint.reason === "unique" && hint.matches[0]?.id === "c1", hint.reason);
  check("Befund-Name leer", matchTodayAppointmentsByName(day, "").reason === "empty_name");
}

console.log();
if (fails) { console.log(`${fails} CHECK(S) FEHLGESCHLAGEN`); process.exit(1); }
console.log("ALLE CHECKS BESTANDEN");
