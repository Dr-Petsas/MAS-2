// Tests: L4 Anruf-Zeitfenster (Chef 29.07.2026, Lisa rief 23:17-23:51 Uhr
// Patienten an) + C5 Vergangenheits-Luecken (gap_briefing meldete um 23:50
// eine "13:30-Luecke"). Reine Funktionen, kein Firestore, kein Netz.
import {
  imAnrufFenster,
  naechsterFensterStartMs,
  CALL_WINDOW_START,
  CALL_WINDOW_END,
} from "../src/lisa/outbound.js";
import { kappeVergangenheit, gapFillDefaultDate } from "../src/clara/gapFill.js";
import { todayBerlin } from "../src/clara/daySchedule.js";

let ok = 0;
let fail = 0;
function check(name, cond, detail = "") {
  if (cond) { ok++; console.log(`  [OK] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Berlin-Sommerzeit im Juli: +02:00 (die Testdaten liegen bewusst im Juli).
const beruf = (h, m = 0) => Date.parse(`2026-07-29T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`);

console.log("--- L4: Anruf-Fenster (Default 09-19 Uhr Berlin)");
check("Default-Fenster 9-19", CALL_WINDOW_START === 9 && CALL_WINDOW_END === 19,
  `got ${CALL_WINDOW_START}-${CALL_WINDOW_END}`);
check("23:30 Uhr ist AUSSERHALB (Nachtanruf-Vorfall)", !imAnrufFenster(beruf(23, 30)));
check("08:59 Uhr ist ausserhalb", !imAnrufFenster(beruf(8, 59)));
check("09:00 Uhr ist im Fenster", imAnrufFenster(beruf(9, 0)));
check("10:30 Uhr ist im Fenster", imAnrufFenster(beruf(10, 30)));
check("18:59 Uhr ist im Fenster", imAnrufFenster(beruf(18, 59)));
check("19:00 Uhr ist ausserhalb", !imAnrufFenster(beruf(19, 0)));

console.log("--- L4: naechster Fensterstart");
const fmtBerlin = (ms) => new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit",
}).format(new Date(ms));
const nachts = naechsterFensterStartMs(beruf(23, 30)); // Mi 23:30 -> Do 09:00
check("23:30 -> naechster Tag 09:00", fmtBerlin(nachts).includes("Do") && fmtBerlin(nachts).includes("09:00"),
  fmtBerlin(nachts));
const frueh = naechsterFensterStartMs(beruf(7, 0)); // Mi 07:00 -> Mi 09:00
check("07:00 -> selber Tag 09:00", fmtBerlin(frueh).includes("Mi") && fmtBerlin(frueh).includes("09:00"),
  fmtBerlin(frueh));

console.log("--- C5: Vergangenheits-Luecken kappen");
const fenster = [{ startMin: 810, endMin: 1080, minutes: 270, label: "13:30–18:00" }];
check("um 23:50 ist die 13:30-Luecke WEG (Live-Vorfall)",
  kappeVergangenheit(fenster, 23 * 60 + 50).length === 0);
const um14 = kappeVergangenheit(fenster, 14 * 60);
check("um 14:00 beginnt sie ab jetzt", um14.length === 1 && um14[0].startMin === 840,
  JSON.stringify(um14));
check("Label nachgezogen", um14.length === 1 && um14[0].label === "14:00–18:00",
  um14[0]?.label);
const um1403 = kappeVergangenheit(fenster, 14 * 60 + 3);
check("14:03 rundet auf 14:15", um1403.length === 1 && um1403[0].startMin === 855);
check("Zukunft bleibt unangetastet",
  kappeVergangenheit(fenster, 8 * 60)[0]?.startMin === 810);
const kurz = [{ startMin: 810, endMin: 860, minutes: 50, label: "13:30–14:20" }];
check("Rest unter Mindestluecke faellt weg", kappeVergangenheit(kurz, 840).length === 0);

console.log("--- C5: Datum-Default nach Feierabend");
const heute = todayBerlin();
const vormittag = Date.parse(`${heute}T10:00:00+02:00`);
const spaet = Date.parse(`${heute}T23:50:00+02:00`);
check("10:00 Uhr -> heute", gapFillDefaultDate(vormittag) === heute,
  gapFillDefaultDate(vormittag));
const nachFeierabend = gapFillDefaultDate(spaet);
check("23:50 Uhr -> NICHT mehr heute", nachFeierabend > heute, nachFeierabend);
const wd = new Date(`${nachFeierabend}T12:00:00Z`).getUTCDay();
check("Default ist ein Werktag (kein Sa/So)", wd !== 0 && wd !== 6, `weekday=${wd}`);

console.log(fail === 0 ? `ERGEBNIS: GRUEN (${ok} Checks)` : `ERGEBNIS: ROT (${fail} Fehler)`);
process.exit(fail === 0 ? 0 : 1);
