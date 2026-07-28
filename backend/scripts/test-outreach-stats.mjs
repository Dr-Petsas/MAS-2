// Kontakt-Zaehler + Spam-Wache + Anzeige (Chef 28.07.2026) — reine Pins,
// ohne Firestore-Schreibzugriff. Prueft:
//   1. Anzeige: hochgestellte Zahlen am Namen ("Maria Ackermann ⁵ ✓²")
//   2. Fenster-Zaehlung + Tore (frisch gebucht / Spam-Risiko)
//   3. rankCandidatesForGap: Tore greifen, Ranking bevorzugt wenig Kontaktierte
//   4. SMS-Vorlage: Zusage-Link wird angehaengt und NIE gekappt

import {
  normStats, contactsInWindow, isBookedSuppressed, isSpamRisk,
  supZahl, nameMitZaehler, BOOKED_SUPPRESS_DAYS, SPAM_MAX_CONTACTS,
} from "../src/clara/outreachStats.js";
import { rankCandidatesForGap } from "../src/clara/gapFill.js";
import { composeRecallSms, SMS_LIMIT } from "../src/clara/outreachTemplates.js";

let fehler = 0;
function check(was, ok) {
  console.log(`${ok ? "  OK  " : "  FAIL"} ${was}`);
  if (!ok) fehler++;
}

const TAG = 86400000;
const now = Date.now();

console.log("[1] Anzeige: hochgestellte Zaehler");
check("supZahl(5) -> ⁵", supZahl(5) === "⁵");
check("supZahl(12) -> ¹²", supZahl(12) === "¹²");
check("Name ohne Kontakte bleibt pur", nameMitZaehler("Maria Ackermann", { contacts: 0, booked: 0 }) === "Maria Ackermann");
check("Name mit 5 Kontakten, 2 Erfolgen", nameMitZaehler("Maria Ackermann", { contacts: 5, booked: 2 }) === "Maria Ackermann ⁵ ✓²");
check("Name mit 3 Kontakten ohne Erfolg", nameMitZaehler("Udo Kaya", { contacts: 3, booked: 0 }) === "Udo Kaya ³");

console.log("[2] Fenster + Tore");
const frisch = normStats({ contacts: 4, booked: 1, recentContactsMs: [now - TAG, now - 3 * TAG], lastBookedMs: now - 5 * TAG });
check("contactsInWindow zaehlt nur juengste", contactsInWindow(normStats({ recentContactsMs: [now - TAG, now - 200 * TAG] })) === 1);
check("frisch gebucht -> unterdrueckt", isBookedSuppressed(frisch));
check(`Buchung aelter als ${BOOKED_SUPPRESS_DAYS} Tage -> frei`, !isBookedSuppressed(normStats({ lastBookedMs: now - (BOOKED_SUPPRESS_DAYS + 1) * TAG })));
const spam = normStats({ contacts: SPAM_MAX_CONTACTS, booked: 0, recentContactsMs: Array.from({ length: SPAM_MAX_CONTACTS }, (_, i) => now - (i + 1) * TAG) });
check("oft kontaktiert ohne Termin -> Spam-Risiko", isSpamRisk(spam));
check("gleiche Kontakte MIT Buchung -> kein Spam-Risiko", !isSpamRisk(normStats({ ...spam, booked: 1 })));
check("ohne Zaehler -> kein Spam-Risiko", !isSpamRisk(null));

console.log("[3] rankCandidatesForGap mit Zaehler-Toren");
const gap = { minutes: 60 };
const basis = { durationMin: 30, calendarId: null, alreadyCalled: false, phoneNorm: "", consent: {} };
const kandidaten = [
  { ...basis, patientId: "a", name: "A", overdueDays: 100, stats: { recent: 2, booked: 0, suppressed: false, spamRisk: false } },
  { ...basis, patientId: "b", name: "B", overdueDays: 100, stats: { recent: 0, booked: 0, suppressed: false, spamRisk: false } },
  { ...basis, patientId: "c", name: "C", overdueDays: 100, stats: { recent: 0, booked: 0, suppressed: true, spamRisk: false } },
  { ...basis, patientId: "d", name: "D", overdueDays: 100, stats: { recent: 3, booked: 0, suppressed: false, spamRisk: true } },
  { ...basis, patientId: "e", name: "E", overdueDays: 300 },
];
const gerankt = rankCandidatesForGap(kandidaten, gap, {});
const namen = gerankt.map((c) => c.name);
check("frisch Gebuchter (C) fliegt raus", !namen.includes("C"));
check("Spam-Risiko (D) fliegt raus", !namen.includes("D"));
check("am laengsten faellig (E) zuerst", namen[0] === "E");
check("bei gleicher Faelligkeit: weniger Kontakte (B) vor mehr (A)", namen.indexOf("B") < namen.indexOf("A"));
const demo = rankCandidatesForGap(kandidaten, gap, { ignoreOutreachGates: true });
check("Demo-Modus: Tore aus, alle 5 bleiben", demo.length === 5);

console.log("[4] SMS mit Zusage-Link");
const url = "https://mas.pickadoc-tunnel.com/z/MEe4ZQHEzOPzLcexyhdT/abc123def456ghi7";
const sms = composeRecallSms({
  practiceName: "MED:DENT Zahnklinik Bochum", practicePhone: "0234 12345678",
  patientName: "Frau Ackermann", date: "2026-07-28", timeLabel: "13:00",
  visitMotiveName: "Professionelle Zahnreinigung", claimUrl: url,
});
check("Link ist VOLLSTAENDIG enthalten", sms.includes(url));
check(`Gesamtlaenge <= SMS_LIMIT (${SMS_LIMIT})`, sms.length <= SMS_LIMIT);
check("Link steht am Ende (nie gekappt)", sms.endsWith(url));
const smsLang = composeRecallSms({
  practiceName: "Zahnarztpraxis mit einem wirklich sehr sehr langen Praxisnamen und Zusatzbezeichnung Bochum-Innenstadt",
  practicePhone: "0234 12345678",
  patientName: "Frau Dr. Annegret Muellenmeister-Hagedorn",
  date: "2026-07-28", timeLabel: "13:00",
  visitMotiveName: "Professionelle Zahnreinigung und Prophylaxe-Beratung", claimUrl: url,
});
check("auch bei Ueberlaenge: Link ueberlebt am Ende", smsLang.endsWith(url) && smsLang.length <= SMS_LIMIT);
const ohneLink = composeRecallSms({
  practiceName: "MED:DENT", practicePhone: "0234 12345678", patientName: "Frau Ackermann",
  date: "2026-07-28", timeLabel: "13:00", visitMotiveName: "Kontrolle",
});
check("ohne claimUrl: alter Text mit Anruf-Bitte", /rufen Sie uns kurz an/.test(ohneLink) && !ohneLink.includes("http"));

console.log();
if (fehler) {
  console.log(`FAZIT: ${fehler} Pin(s) verletzt.`);
  process.exit(1);
}
console.log("FAZIT: Zaehler, Tore, Ranking und SMS-Link halten.");
process.exit(0);
