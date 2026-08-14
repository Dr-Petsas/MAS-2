// Auffaelligkeiten im Tages-Briefing: verbunden, nicht chronologisch,
// kein erfundenes "weil". Chef 14.08.2026.

import {
  istVersaeumtStatus,
  sammleAuffaelligkeiten,
  sprecheAuffaelligkeiten,
} from "../src/clara/dayNotables.js";

let ok = 0;
let fail = 0;
function check(name, cond, info = "") {
  if (cond) { ok++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FEHL ${name} ${info}`); }
}

console.log("=== Status versaeumt ===");
check("no-show", istVersaeumtStatus("no-show"));
check("didNotAttend", istVersaeumtStatus("didNotAttend"));
check("Kommentar versäumt", istVersaeumtStatus("confirmed", "Patient hat versäumt"));
check("treated ist kein Versaeumnis", !istVersaeumtStatus("confirmed", "Kontrolle"));
check("leerer Status nicht raten", !istVersaeumtStatus("", ""));

console.log("\n=== Sammeln ===");
const appointments = [
  { patientId: "1", patientName: "Frau Berger", time: "9 Uhr", comments: "bitte vorher sprechen", docsStatus: "red" },
  { patientId: "2", patientName: "Herr Müller", time: "10 Uhr", comments: "", docsStatus: "green" },
  { patientId: "3", patientName: "Frau Klein", time: "11 Uhr", comments: "", docsStatus: "red" },
  { patientId: "4", patientName: "Herr Frost", time: "12 Uhr", comments: "nur Kontrolle", docsStatus: "red" },
];
const casesByPatient = new Map([
  ["2", [{
    topic: "other",
    channel: "email",
    stats: { contacts: 1 },
    updates: [{ kind: "contact", channel: "email", text: "fragt, ob die Prothese schon fertig sei" }],
  }]],
  ["1", [{
    topic: "appointment",
    updates: [{ kind: "contact", text: "Neuer Termin am 14.08." }],
  }]],
]);
const events = [
  { subject: { patientId: "1" }, channel: "call", direction: "in" },
  { subject: { patientId: "1" }, channel: "call", direction: "in" },
  { subject: { patientId: "1" }, channel: "call", direction: "in" },
  { subject: { patientId: "1" }, channel: "call", direction: "in" },
];
const lastByPatient = new Map([
  ["3", { status: "no-show", comments: "", patientName: "Frau Klein" }],
]);

const items = sammleAuffaelligkeiten({
  appointments,
  briefing: {
    docsRed: 3,
    docsYellow: 0,
    attention: [
      { patientName: "Frau Berger", time: "9 Uhr", comments: "bitte vorher sprechen" },
    ],
  },
  casesByPatient,
  events,
  lastByPatient,
});

check("höchstens 4 Punkte", items.length <= 4, `n=${items.length}`);
check("Unterlagen rot zuerst", items[0]?.art === "docs_red" && items[0].n === 3);
check("Kalender-Echo nicht als Vorgang", !items.some((it) => it.art === "vorgang" && it.who === "Frau Berger"));
check("Mail zur Prothese", items.some((it) => it.art === "mail" && /Prothese/.test(it.text || "")));
check("Vier Anrufe", items.some((it) => it.art === "anruf" && it.n === 4));
check("Versaeumter letzter Termin", items.some((it) => it.art === "versaeumt" && /Klein/.test(it.who || "")));

console.log("\n=== Sprechen ===");
const spoken = sprecheAuffaelligkeiten(items);
check("hat Text", spoken.length > 20, spoken);
check("Kopf oder Verbindung", /fällt auf|Auffällig|ins Auge|Kurz das Auffällige/.test(spoken), spoken);
check("Unterlagen im Satz", /bei 3 Terminen die Unterlagen/.test(spoken), spoken);
check("verbindet mit und", / und /.test(spoken), spoken);
check("kein erfundenes weil", !/\bweil\b/.test(spoken), spoken);
check("kein erstens", !/erstens|zweitens/.test(spoken), spoken);

const mitGrund = sprecheAuffaelligkeiten([
  { art: "anruf", who: "Frau Berger", time: "9 Uhr", n: 4, text: "weil sie vorher sprechen wollte" },
]);
check("weil nur aus der Quelle", /\bweil sie vorher sprechen wollte\b/.test(mitGrund), mitGrund);

const sechs = sammleAuffaelligkeiten({
  appointments: Array.from({ length: 6 }, (_, i) => ({
    patientId: String(i + 1),
    patientName: `Patient ${i + 1}`,
    time: `${8 + i} Uhr`,
    comments: `wichtige Notiz Nummer ${i + 1} bitte merken`,
  })),
  briefing: {
    docsRed: 0,
    attention: Array.from({ length: 6 }, (_, i) => ({
      patientName: `Patient ${i + 1}`,
      time: `${8 + i} Uhr`,
      comments: `wichtige Notiz Nummer ${i + 1} bitte merken`,
    })),
  },
});
check("Deckel bei 4 auch bei vielen Notizen", sechs.length === 4, `n=${sechs.length}`);

console.log("");
if (fail) {
  console.log(`ERGEBNIS: ${ok} ok, ${fail} FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`ERGEBNIS: alle ${ok} Pruefungen gruen`);
