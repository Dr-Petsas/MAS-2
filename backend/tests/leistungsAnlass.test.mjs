// Anlass aus abgerechneten Leistungen: nur was in der Liste steht, sonst bleibt alles wie bisher.
import test from "node:test";
import assert from "node:assert/strict";

process.env.PLANR_HKP_KEY = "test-schluessel";
const { anlassAn, anlassAusLeistungen, anlassErgaenzen, leistungenAusPvs, _setHolen } = await import("../src/clara/leistungsAnlass.js");

const JETZT = Date.parse("2026-11-27T10:00:00Z");
const zeile = (date, kind, text, anzahl = 1) => ({ date, time: "", kind, text, zahn: "", anzahl, seite: "kasse" });

test("Schalter: aus ohne Liste, an nur für genannte Praxen", () => {
  assert.equal(anlassAn("praxisA", ""), false);
  assert.equal(anlassAn("praxisA", undefined), false);
  assert.equal(anlassAn("praxisA", "1"), false);
  assert.equal(anlassAn("praxisA", "praxisB, praxisA"), true);
  assert.equal(anlassAn("praxisC", "praxisB, praxisA"), false);
  assert.equal(anlassAn("", "praxisA"), false);
});

test("letzter Tag mit abgerechneten Positionen, Texte wie im Praxisprogramm", () => {
  const a = anlassAusLeistungen([
    zeile("2026-03-03", "01", "Eingehende Untersuchung"),
    zeile("2026-09-14", "1040", "Professionelle Zahnreinigung", 28),
    zeile("2026-09-14", "Ä1", "Beratung"),
    zeile("2026-09-14", "1040", "professionelle zahnreinigung"),
  ], JETZT);
  assert.deepEqual(a.letzter_besuch, { datum: "2026-09-14", grund: "Professionelle Zahnreinigung, Beratung" });
  assert.equal(a.kontrollgrund, "Zuletzt am 14. September 2026 abgerechnet: Professionelle Zahnreinigung, Beratung.");
  assert.equal(a.anlass_quelle, "abrechnung");
});

test("höchstens drei Leistungen werden genannt", () => {
  const a = anlassAusLeistungen(["A", "B", "C", "D"].map((t, i) => zeile("2026-10-01", `10${i}`, t)), JETZT);
  assert.equal(a.letzter_besuch.grund, "A, B, C");
});

test("nichts Sprechbares ergibt null: leere Liste, Karteitext ohne Position, Kürzel ohne Text, Zukunft, kaputtes Datum", () => {
  assert.equal(anlassAusLeistungen(null, JETZT), null);
  assert.equal(anlassAusLeistungen([], JETZT), null);
  assert.equal(anlassAusLeistungen([{ date: "2026-10-01", time: "09:15", kind: "", text: "Patient klagt über Schmerzen", anzahl: 0 }], JETZT), null);
  assert.equal(anlassAusLeistungen([zeile("2026-10-01", "Ä1", "Beratung", 0)], JETZT), null);
  assert.equal(anlassAusLeistungen([zeile("2026-10-01", "1040", "")], JETZT), null);
  assert.equal(anlassAusLeistungen([zeile("2026-12-24", "1040", "Zahnreinigung")], JETZT), null);
  assert.equal(anlassAusLeistungen([zeile("", "1040", "Zahnreinigung"), zeile("irgendwann", "01", "Untersuchung")], JETZT), null);
});

test("am letzten Tag nur Kürzel ohne Text: kein Anlass, auch wenn ein älterer Tag Texte hat", () => {
  assert.equal(anlassAusLeistungen([zeile("2026-03-03", "01", "Eingehende Untersuchung"), zeile("2026-09-14", "1040", "")], JETZT), null);
});

const gruppen = () => [{
  besuchsgrund: "professionelle Zahnreinigung", anzahl: 3,
  patienten: [
    { patientId: "p1", name: "Michael Petsas", faellig: "seit 5 Tagen fällig" },
    { patientId: "p2", name: "Ohne Geburtsdatum", faellig: "seit 9 Tagen fällig" },
    { patientId: "p3", name: "Ohne Leistungen", faellig: "seit 12 Tagen fällig" },
  ],
}];
const kartei = async () => [
  { id: "p1", firstName: "Michael", lastName: "Petsas", birthDate: "1970-01-01" },
  { id: "p2", firstName: "Ohne", lastName: "Geburtsdatum", birthDate: null },
  { id: "p3", firstName: "Ohne", lastName: "Leistungen", birthDate: "1980-05-05" },
];

test("ergänzt nur Felder, und nur wo das Praxisprogramm etwas liefert", async () => {
  const gefragt = [];
  const aus = await anlassErgaenzen("praxisA", gruppen(), {
    laden: kartei, jetzt: JETZT,
    leistungen: async (cid, wer) => { gefragt.push(wer.name); return wer.name === "Petsas" ? [zeile("2026-09-14", "1040", "Professionelle Zahnreinigung")] : null; },
  });
  const [p1, p2, p3] = aus[0].patienten;
  assert.equal(p1.faellig, "seit 5 Tagen fällig");
  assert.deepEqual(p1.letzter_besuch, { datum: "2026-09-14", grund: "Professionelle Zahnreinigung" });
  assert.equal(p1.anlass_quelle, "abrechnung");
  assert.deepEqual(p2, gruppen()[0].patienten[1]);
  assert.deepEqual(p3, gruppen()[0].patienten[2]);
  assert.deepEqual(gefragt.sort(), ["Leistungen", "Petsas"], "ohne Geburtsdatum wird nicht gesucht");
});

test("Fehler beim Laden oder Abrufen lassen die Gruppen unverändert", async () => {
  const a = await anlassErgaenzen("praxisA", gruppen(), { laden: async () => { throw new Error("Kartei weg"); } });
  assert.deepEqual(a, gruppen());
  const b = await anlassErgaenzen("praxisA", gruppen(), { laden: kartei, leistungen: async () => { throw new Error("Bridge weg"); } });
  assert.deepEqual(b, gruppen());
});

test("Abruf bei PlanR: Schlüssel im Kopf, Liste nur bei ok, sonst null", async () => {
  const rufe = [];
  _setHolen(async (url, init) => { rufe.push({ url, init }); return { ok: true, json: async () => ({ ok: true, leistungen: [zeile("2026-09-14", "1040", "Zahnreinigung")] }) }; });
  const liste = await leistungenAusPvs("praxisA", { vorname: "Michael", name: "Petsas", geburt: "1970-01-01" });
  assert.equal(liste.length, 1);
  assert.ok(rufe[0].url.includes("/api/intern/pvs/leistungen?clientId=praxisA&vorname=Michael&name=Petsas&geburt=1970-01-01"));
  assert.equal(rufe[0].init.headers["X-PlanR-Key"], "test-schluessel");

  _setHolen(async () => ({ ok: false, status: 404, json: async () => ({}) }));
  assert.equal(await leistungenAusPvs("praxisA", { vorname: "Michael", name: "Petsas", geburt: "1970-01-01" }), null);
  _setHolen(async () => ({ ok: true, json: async () => ({ ok: false, meldung: "nicht eindeutig" }) }));
  assert.equal(await leistungenAusPvs("praxisA", { vorname: "Michael", name: "Petsas", geburt: "1970-01-01" }), null);
  _setHolen(async () => { throw new Error("Zeitlimit"); });
  assert.equal(await leistungenAusPvs("praxisA", { vorname: "Michael", name: "Petsas", geburt: "1970-01-01" }), null);

  rufe.length = 0;
  _setHolen(async (url) => { rufe.push(url); return { ok: true, json: async () => ({ ok: true, leistungen: [] }) }; });
  assert.equal(await leistungenAusPvs("praxisA", { vorname: "Michael", name: "Petsas", geburt: "" }), null);
  assert.equal(rufe.length, 0, "ohne Geburtsdatum kein Abruf");
  _setHolen(null);
});
