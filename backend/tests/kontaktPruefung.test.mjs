import { test } from "node:test";
import assert from "node:assert/strict";
import { namensTreffer, inhalt, dativ, zusammenfassen, sprechKontakt, pruefeKontakt } from "../src/clara/kontaktPruefung.js";

const anruf = (ts, name, summary, extra = {}) => ({
  id: `e${ts}`, channel: "bianca_call", direction: "in", ts, counterparty: { name }, summary, ...extra,
});

test("Name: sicher, verhoert (Rueckfrage), Behandler im Text zaehlt nicht", () => {
  const e = anruf(1, "Heiko Reuber", "bittet um Rueckruf (Behandler: Doktor Michael Petsas)");
  assert.equal(namensTreffer("Herr Reuber", e), 2);
  assert.equal(namensTreffer("Heiko Reuber", e), 2);
  assert.equal(namensTreffer("Herr Heuser", e), 1);
  assert.equal(namensTreffer("Michael Petsas", e), 0);
  assert.equal(namensTreffer("Frau Fanelas", e), 0);
  assert.equal(namensTreffer("Signpeople", { channel: "nadine_email", summary: "E-Mail von Signpeople — Angebot" }), 2);
});

test("Inhalt ohne Notiz-Praefix, Telefonnummer und Behandler-Klammer", () => {
  const e = anruf(1, "Heiko Reuber", "Laut Anruf (Bianca): Heiko Reuber — Rückruf-Notiz an die Praxis: Heiko Reuber bittet um Rueckruf: Bitte dringend zurückrufen. Tel: +491711066610. (Behandler: Doktor Michael Petsas; Tel: +491711066610)");
  assert.equal(inhalt(e), "bittet um Rückruf: Bitte dringend zurückrufen");
  assert.equal(dativ("Herr Heuser"), "Herrn Heuser");
});

test("Extrakt + Rueckruf-Bitte desselben Anrufs zaehlen als EIN Anruf", () => {
  const t = Date.parse("2026-11-03T07:20:00Z");
  const z = zusammenfassen([
    anruf(t, "Heiko Reuber", "Laut Anruf (Bianca): Heiko Reuber, Gespräch ohne Kalenderänderung."),
    anruf(t + 30000, "Heiko Reuber", "Heiko Reuber bittet um Rueckruf: dringend"),
    anruf(t + 3600000, "Heiko Reuber", "bittet um Rueckruf: nochmal"),
  ]);
  assert.equal(z.length, 2);
});

test("Sprechtext: Ja mit Zahl und Uhrzeit, Nein, Rueckfrage bei Verhoerer", () => {
  const t = Date.now() - 3600000;
  const sicher = zusammenfassen([anruf(t, "Heiko Reuber", "bittet um Rueckruf: dringend", { status: "open" })]);
  const ja = sprechKontakt({ name: "Herr Reuber", kanal: "anruf", tage: 14, sicher, aehnlich: [] });
  assert.match(ja, /^Ja, von Heiko Reuber kam in den letzten 14 Tagen ein Anruf\. Anruf heute um \d+ Uhr/);
  assert.match(ja, /noch offen/);
  const nein = sprechKontakt({ name: "Herr Meier", kanal: "mail", tage: 14, sicher: [], aehnlich: [] });
  assert.equal(nein, "Nein, von Herrn Meier ist in den letzten 14 Tagen keine E-Mail eingegangen.");
  const rueck = sprechKontakt({ name: "Herr Heuser", kanal: "anruf", tage: 14, sicher: [], aehnlich: sicher });
  assert.match(rueck, /meinten Sie Heiko Reuber\?/);
});

test("pruefeKontakt: nur Eingaenge, Kanal-Filter, ausgehende/Lisa raus", async () => {
  const t = Date.now() - 7200000;
  const events = [
    anruf(t, "Heiko Reuber", "bittet um Rueckruf: dringend"),
    { id: "m1", channel: "nadine_email", direction: "in", ts: t + 1000, counterparty: { name: "Heiko Reuber" }, summary: "E-Mail von Heiko Reuber — Befund" },
    { id: "s1", channel: "lisa_sms", direction: "out", ts: t + 2000, counterparty: { name: "Heiko Reuber" }, summary: "SMS" },
  ];
  const query = async () => events;
  const nurAnruf = await pruefeKontakt("c", { name: "Reuber", kanal: "anruf" }, { query });
  assert.equal(nurAnruf.gefunden, 1);
  const alle = await pruefeKontakt("c", { name: "Reuber" }, { query });
  assert.match(alle.message, /ein Anruf und eine E-Mail|eine E-Mail und ein Anruf/);
});
