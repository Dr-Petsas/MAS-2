import "dotenv/config";
import { diffCalendarSnapshots } from "../src/clara/calendarWatch.js";

// Clara's calendar watch: pure diff tests — created / moved / cancelled /
// removed / docs traffic light / appointment note. Run:
//   node scripts/test-calendar-watch.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const future = Date.now() + 3 * 86400000;
const base = {
  a1: { s: future, e: future + 900000, c: "calP", cn: "Dr. Petsas", st: "confirmed", d: "green", cm: "", p: "p1", pn: "Nicole Thrandorf", pl: "Thrandorf", pg: "f", vm: "KCH akute Beschwerden/Notfall", cb: "callr", _id: "a1" },
  a2: { s: future + 2700000, e: future + 3600000, c: "calP", cn: "Dr. Petsas", st: "confirmed", d: "green", cm: "", p: "p2", pn: "Michael Diedershagen", pl: "Diedershagen", pg: "m", vm: "SLM Besprechung", cb: "online", _id: "a2" },
};

console.log("=== Baseline unverändert ===");
check(diffCalendarSnapshots(base, base).length === 0, "Keine Änderung -> keine Events");

console.log("\n=== Neuer Termin ===");
const withNew = { ...base, a3: { ...base.a1, _id: "a3", p: "p3", pn: "Anna Ahn", pl: "Ahn", pg: "f", vm: "PRO professionelle Zahnreinigung", cb: "", d: "green" } };
let d = diffCalendarSnapshots(base, withNew);
check(d.length === 1 && d[0].kind === "created", "Neuer Termin erkannt");
check(/Frau Ahn/.test(d[0].summary) && /Dr\. Petsas/.test(d[0].summary), "Summary nennt Patientin + Behandler");
check(d[0].eventId === "appt-watch:a3:created", "Deterministische Event-ID");
console.log("  " + d[0].summary);

console.log("\n=== Neuer Termin mit gelber Ampel ===");
const withNewYellow = { ...base, a4: { ...withNew.a3, _id: "a4", d: "yellow" } };
d = diffCalendarSnapshots(base, withNewYellow);
check(d.length === 2 && d.some((x) => x.kind === "docs"), "Neuer Termin + Dokumenten-Ampel = 2 Events");

console.log("\n=== Verschoben ===");
const moved = { ...base, a1: { ...base.a1, s: future + 7200000 } };
d = diffCalendarSnapshots(base, moved);
check(d.length === 1 && d[0].kind === "moved", "Verschiebung erkannt");
check(/verschoben/.test(d[0].summary) && /Frau Thrandorf/.test(d[0].summary), "Summary beschreibt Verschiebung");
console.log("  " + d[0].summary);

console.log("\n=== Ampel green -> yellow ===");
const yellow = { ...base, a1: { ...base.a1, d: "yellow" } };
d = diffCalendarSnapshots(base, yellow);
check(d.length === 1 && d[0].kind === "docs", "Ampelwechsel erkannt");
check(/GELB/.test(d[0].summary) && /nicht vollständig/.test(d[0].summary), "GELB wird erklärt");
console.log("  " + d[0].summary);

console.log("\n=== Ampel yellow -> green (Entwarnung) ===");
d = diffCalendarSnapshots(yellow, base);
check(d.length === 1 && /GRÜN/.test(d[0].summary), "Entwarnung wird erfasst");

console.log("\n=== Terminnotiz ergänzt ===");
const note = { ...base, a2: { ...base.a2, cm: "bringt vielleicht seine Frau mit zur Kontrolle" } };
d = diffCalendarSnapshots(base, note);
check(d.length === 1 && d[0].kind === "note", "Notiz-Änderung erkannt");
check(/Herrn Diedershagen/.test(d[0].summary) && /seine Frau/.test(d[0].summary), "Notiztext im Event");
console.log("  " + d[0].summary);

console.log("\n=== Abgesagt (Status) ===");
const cancelled = { ...base, a1: { ...base.a1, st: "cancelled" } };
d = diffCalendarSnapshots(base, cancelled);
check(d.length === 1 && d[0].kind === "cancelled", "Absage über Status erkannt");

console.log("\n=== Entfernt (aus Kalender gelöscht) ===");
const removedNext = { a2: base.a2 };
d = diffCalendarSnapshots(base, removedNext);
check(d.length === 1 && d[0].kind === "removed", "Gelöschter zukünftiger Termin erkannt");
check(/Frau Thrandorf/.test(d[0].summary), "Summary nennt Patientin");

console.log("\n=== Idempotenz der Event-IDs ===");
const d1 = diffCalendarSnapshots(base, moved);
const d2 = diffCalendarSnapshots(base, moved);
check(d1[0].eventId === d2[0].eventId, "Gleiche Änderung -> gleiche Event-ID (idempotent)");

console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : "ALL CHECKS PASSED"}`);
process.exit(failed ? 1 : 0);
