// W-STABIL-8 Fristen-/Rechnungs-Waechter (Verkaufskern 24/25, 28.07.2026).
//
// Prueft (1) PUR die Extraktion: Betraege in Cent, neue Frist-Formulierungen
// ("Widerspruch bis ...", "Zahlungsfrist ..."), Rechnungssignal, und dass der
// GESPROCHENE Wiedervorlage-Text NIE einen Euro-Betrag enthaelt (Chef-Regel);
// (2) GEGEN FIRESTORE die Kette: synthetische Events (Mail/Brief/Telefon)
// -> buildWiedervorlage sortiert sie -> "erledigt" per Stichwort loest genau
// einen auf, mehrdeutig fragt zurueck. Testdaten werden am Ende GELOESCHT.
// Bewusst OHNE kritisch-Flag und mit Fristen > 3 Tagen, damit der Proaktiv-
// Sweep waehrend des Tests keinen Push ausloest.
import "dotenv/config";
import { extractAmountCents, extractDeadlineMs, extractDeadlineInfo, detectInvoiceOrPayment, assessCritical, formatEuro } from "../src/brain/critical.js";
import { buildWiedervorlage, spokenWiedervorlage, resolveWiedervorlage, ABHAK_ANLEITUNG } from "../src/brain/wiedervorlage.js";
import { karteWiedervorlage } from "../src/clara/karten.js";
import { appendEvent } from "../src/brain/eventStore.js";
import { masCollection } from "../src/tenant.js";

const CLIENT = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
let fails = 0;
function check(ok, label) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) fails++;
}

// --- 1) Betrags-Extraktion (Cent) ------------------------------------------
check(extractAmountCents("Rechnungsbetrag: 1.234,56 EUR, zahlbar bis zum 15.08.2026") === 123456,
  "Betrag 1.234,56 EUR -> 123456 Cent");
check(extractAmountCents("offener Betrag von 89,90 €") === 8990, "Betrag 89,90 € -> 8990 Cent");
check(extractAmountCents("Forderung in Höhe von EUR 2.500") === 250000, "EUR 2.500 (Waehrung davor) -> 250000 Cent");
check(extractAmountCents("Der Betrag von 150 Euro ist offen") === 15000, "150 Euro -> 15000 Cent");
check(extractAmountCents("Wir bestellten 3 Kartons und 12 Schrauben") === null, "keine Waehrung -> kein Betrag");
check(extractAmountCents("Umsatz 99.999.999,00 EUR im Konzern") === null, "> 1 Mio Euro -> verworfen (Muell-Schutz)");
// Mehrere Betraege: der mit Zahlungs-Stichwort in der Naehe gewinnt.
check(extractAmountCents("Porto 4,95 €. Zu zahlender Betrag: 312,40 €") === 31240,
  "bei mehreren Betraegen gewinnt der mit Stichwort davor");

// --- 2) Neue Frist-Formulierungen -------------------------------------------
check(extractDeadlineMs("Widerspruch bis 15.09.2026 moeglich") != null, "Widerspruch bis <Datum> erkannt");
check(extractDeadlineMs("Einspruch ist bis zum 3. September 2026 einzulegen") != null, "Einspruch + Monatsname erkannt");
check(extractDeadlineMs("Zahlungsfrist: 20.09.2026") != null, "Zahlungsfrist: <Datum> erkannt");
check(extractDeadlineMs("Der Betrag ist zu zahlen bis 10.09.2026") != null, "zu zahlen bis <Datum> erkannt");
check(extractDeadlineMs("Wir treffen uns am 15.09.2026 zum Grillen") == null, "nacktes Datum ohne Frist-Wort -> keine Frist");
// Starke vs. schwache Frist-Woerter (Werbe-Schutz der Wiedervorlage):
check(extractDeadlineInfo("Widerspruch bis 15.09.2026")?.strong === true, "Widerspruch -> STARKE Frist");
check(extractDeadlineInfo("Der Betrag ist zahlbar bis zum 20.09.2026")?.strong === true, "zahlbar bis -> STARKE Frist");
check(extractDeadlineInfo("Sale! Angebot nur bis zum 24.09.2026 sichern")?.strong === false, "Werbe-'bis zum' -> schwache Frist");
check(extractDeadlineInfo("Die Rechnung ist innerhalb von 14 Tagen zu zahlen")?.strong === true, "innerhalb von 14 Tagen zu zahlen -> stark");

// --- 3) Rechnungssignal ------------------------------------------------------
check(detectInvoiceOrPayment("anbei unsere Rechnung Nr. 2026-119") === true, "Rechnung erkannt");
check(detectInvoiceOrPayment("die Zahlungserinnerung vom 12.07.") === true, "Zahlungserinnerung erkannt");
check(detectInvoiceOrPayment("Ihr Termin am Dienstag ist bestaetigt") === false, "Terminmail ist keine Rechnung");
const a = assessCritical({ subject: "Mahnung", text: "Letzte Mahnung: 240,00 EUR, zahlbar bis zum 05.09.2026" });
check(a.critical === true && a.invoiceOrPayment === true && a.amountCents === 24000 && a.deadlineMs != null,
  "assessCritical liefert kritisch + Rechnung + Betrag + Frist zusammen");

// --- 4) Gesprochener Text: NIE Euro-Betraege --------------------------------
const beispielItems = [
  { eventId: "x1", ts: Date.now(), quelle: "Brief", wer: "Finanzamt Bochum", was: "Widerspruchsfrist Bescheid", kritisch: false, rechnung: false, deadlineMs: Date.now() + 5 * 86400000, stage: "later", amountCents: null },
  { eventId: "x2", ts: Date.now(), quelle: "E-Mail", wer: "Dentallabor Nord", was: "Rechnung 2026-119", kritisch: false, rechnung: true, deadlineMs: null, stage: null, amountCents: 123456 },
];
const gesprochen = spokenWiedervorlage({ items: beispielItems });
check(!/euro|€|\d+,\d{2}/i.test(gesprochen), "gesprochener Text enthaelt keinen Euro-Betrag");
check(/Finanzamt Bochum/.test(gesprochen) && /Dentallabor Nord/.test(gesprochen), "gesprochener Text nennt beide Absender");
check(/erledigt/i.test(gesprochen), "gesprochener Text erklaert das Abhaken");
// W-UMBAU-2 Werkzeug 3 (28.07.2026): Die Route formuliert den BERICHT frei um
// und haengt die Abhak-Anleitung WOERTLICH wieder an. Das Abtrennen funktioniert
// nur, wenn der gesprochene Text exakt mit der exportierten Konstante endet.
check(gesprochen.endsWith(ABHAK_ANLEITUNG), "gesprochener Text endet exakt mit der ABHAK_ANLEITUNG (Konstanten-Kopplung)");
const leer = spokenWiedervorlage({ items: [] });
check(/nichts offen/i.test(leer), "leere Liste -> beruhigender Satz");
check(!leer.includes(ABHAK_ANLEITUNG), "leere Liste traegt KEINE Abhak-Anleitung");

// --- 5) Karte: Betrag NUR hier ----------------------------------------------
const karte = karteWiedervorlage({ items: beispielItems, euro: formatEuro });
const kartenText = JSON.stringify(karte);
check(kartenText.includes("1.234,56"), "Karte zeigt den Betrag");
check(karte.kind === "wiedervorlage" && karte.items.length === 2, "Karte hat kind + Zeilen");
check(formatEuro(8990) === "89,90 €", "formatEuro formatiert deutsch");

// --- 6) Kette gegen Firestore ------------------------------------------------
const T = Date.now();
const ids = [
  `test-wv:${T}:brief`, `test-wv:${T}:mail`, `test-wv:${T}:anruf`, `test-wv:${T}:werbung`,
  `test-wv:${T}:mahnung1`, `test-wv:${T}:mahnung2`,
];
try {
  await appendEvent(CLIENT, {
    id: ids[0], channel: "nadine_letter", direction: "in", type: "interaction",
    counterparty: { kind: "other", name: "Testkasse Wiedervorlage" },
    summary: "Unterlage übernommen: test-bescheid.pdf — Widerspruch bis in 10 Tagen",
    deadlineMs: T + 10 * 86400000, deadlineStrong: true, extractor: "test@wv",
  });
  await appendEvent(CLIENT, {
    id: ids[1], channel: "nadine_email", direction: "in", type: "interaction",
    counterparty: { kind: "other", name: "Testlabor Wiedervorlage" },
    summary: "E-Mail von Testlabor — Betreff „Rechnung 2026-999\u201c: offener Betrag",
    signals: { invoiceOrPayment: true }, amountCents: 45600, extractor: "test@wv",
  });
  await appendEvent(CLIENT, {
    id: ids[2], channel: "bianca_call", direction: "in", type: "interaction",
    counterparty: { kind: "other", name: "Testanwalt Wiedervorlage" },
    summary: "Laut Anruf: Stellungnahme angefordert, Frist in 6 Tagen",
    deadlineMs: T + 6 * 86400000, deadlineStrong: true, extractor: "test@wv",
  });
  // Schwache Frist (Werbe-"bis zum") ohne Rechnung/kritisch: darf NICHT drauf.
  await appendEvent(CLIENT, {
    id: ids[3], channel: "nadine_email", direction: "in", type: "interaction",
    counterparty: { kind: "other", name: "Testwerbung Wiedervorlage" },
    summary: "E-Mail von Testwerbung — Angebot nur bis zum naechsten Dienstag",
    deadlineMs: T + 4 * 86400000, extractor: "test@wv",
  });
  // Mahn-Kaskade: zwei Schreiben desselben Absenders = EIN Vorgang; das
  // neuere Schreiben traegt die aktuelle Frist.
  await appendEvent(CLIENT, {
    id: ids[4], channel: "nadine_email", direction: "in", type: "interaction",
    ts: T - 5 * 86400000,
    counterparty: { kind: "other", name: "Testinkasso Wiedervorlage" },
    summary: "E-Mail von Testinkasso — Betreff „Mahnung 111\u201c: zahlbar",
    signals: { invoiceOrPayment: true }, deadlineMs: T + 2 * 86400000,
    deadlineStrong: true, extractor: "test@wv",
  });
  await appendEvent(CLIENT, {
    id: ids[5], channel: "nadine_email", direction: "in", type: "interaction",
    ts: T - 86400000,
    counterparty: { kind: "other", name: "Testinkasso Wiedervorlage" },
    summary: "E-Mail von Testinkasso — Betreff „LETZTE Mahnung 111\u201c: zahlbar",
    signals: { invoiceOrPayment: true }, deadlineMs: T + 8 * 86400000,
    deadlineStrong: true, amountCents: 9900, extractor: "test@wv",
  });

  const liste = await buildWiedervorlage(CLIENT);
  const meine = liste.items.filter((i) => i.wer.includes("Wiedervorlage"));
  check(meine.length === 4, `3 Quellen + 1 gebuendelte Kaskade auf der Liste (gefunden: ${meine.length})`);
  check(!meine.some((i) => i.wer === "Testwerbung Wiedervorlage"),
    "schwache Werbe-Frist bleibt UNTEN (nicht auf der Wiedervorlage)");
  const inkasso = meine.find((i) => i.wer === "Testinkasso Wiedervorlage");
  check(inkasso?.schreiben === 2 && /LETZTE/.test(inkasso?.was || ""),
    "Mahn-Kaskade gebuendelt: EIN Punkt, neuestes Schreiben zaehlt");
  check(/2 Schreiben/.test(spokenWiedervorlage({ items: [inkasso] })),
    "gesprochener Punkt nennt die Zahl der Schreiben");
  const fristIdx = meine.filter((i) => i.deadlineMs).map((i) => liste.items.indexOf(i));
  const rechIdx = meine.filter((i) => !i.deadlineMs).map((i) => liste.items.indexOf(i));
  check(fristIdx.every((fi) => rechIdx.every((ri) => fi < ri)), "Fristen stehen vor Rechnungen ohne Datum");
  const anwaltVorKasse = liste.items.findIndex((i) => i.wer === "Testanwalt Wiedervorlage")
    < liste.items.findIndex((i) => i.wer === "Testkasse Wiedervorlage");
  check(anwaltVorKasse, "fruehere Frist (6 Tage) steht vor spaeterer (10 Tage)");
  check(meine.every((i) => ["Brief", "E-Mail", "Anruf"].includes(i.quelle)), "Quellen-Beschriftung stimmt");

  // Mehrdeutig -> Rueckfrage, nichts wird aufgeloest.
  const mehrdeutig = await resolveWiedervorlage(CLIENT, { wer: "Wiedervorlage" });
  check(mehrdeutig.ok === false && mehrdeutig.reason === "ambiguous", "mehrdeutiges Stichwort -> ehrliche Rueckfrage");

  // Eindeutig -> genau dieser Punkt ist danach weg.
  const erledigt = await resolveWiedervorlage(CLIENT, { wer: "Testlabor" });
  check(erledigt.ok === true, "eindeutiges Stichwort -> erledigt");
  const danach = await buildWiedervorlage(CLIENT);
  const nochDa = danach.items.filter((i) => i.wer.includes("Wiedervorlage"));
  check(nochDa.length === 3 && !nochDa.some((i) => i.wer === "Testlabor Wiedervorlage"),
    "abgehakter Punkt ist von der Liste runter, die anderen bleiben");

  // Kaskade abhaken: BEIDE Schreiben sind danach erledigt (nichts rueckt nach).
  const kaskadeWeg = await resolveWiedervorlage(CLIENT, { wer: "Testinkasso" });
  check(kaskadeWeg.ok === true, "Kaskade per Stichwort erledigt");
  const danach2 = await buildWiedervorlage(CLIENT);
  check(!danach2.items.some((i) => i.wer === "Testinkasso Wiedervorlage"),
    "Kaskade komplett runter - kein aelteres Schreiben rueckt nach");

  const unbekannt = await resolveWiedervorlage(CLIENT, { wer: "Zebra" });
  check(unbekannt.ok === false && unbekannt.reason === "not_found", "unbekanntes Stichwort -> ehrliches 'nichts gefunden'");
} finally {
  // Testdaten restlos entfernen — inklusive des Audit-Events, das resolveItem
  // beim Abhaken zusaetzlich anlegt (resolvesEventId zeigt auf unser Test-Event).
  const col = masCollection(CLIENT, "mas_events");
  for (const id of ids) {
    await col.doc(id).delete().catch(() => {});
    const marker = await col.where("resolvesEventId", "==", id).get().catch(() => null);
    for (const d of marker?.docs || []) await d.ref.delete().catch(() => {});
  }
}

console.log("");
if (fails) {
  console.log(`FEHLGESCHLAGEN: ${fails}`);
  process.exit(1);
}
console.log("Alle Wiedervorlage-Pruefungen bestanden.");
process.exit(0);
