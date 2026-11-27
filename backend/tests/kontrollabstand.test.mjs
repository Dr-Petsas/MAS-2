// Kontrollabstand je Behandlung im Vorschlag von "Luecke fuellen" (27.11.2026): der Recall-Abstand, den die Praxis
// am Besuchsgrund eingestellt hat, und nur, wenn der Recall auch so gerechnet ist. Erfundene Daten, kein Zugriff
// auf eine Praxis. Start: node --test backend/tests/kontrollabstand.test.mjs
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

const K = await import("../src/clara/kontrollabstand.js");
const L = await import("../src/clara/lueckeFuellen.js");

const TAG = 86400000;
const JETZT = Date.UTC(2026, 10, 27, 11, 0, 0);
const motive = new Map([
  ["pzr", { id: "pzr", name: "PRO professionelle Zahnreinigung", duration: 30, recurrenceCount: -1, recurrenceInterval: "6-m" }],
  ["fuellung", { id: "fuellung", name: "KCH Füllung klein", duration: 30, recurrenceCount: "2", recurrenceInterval: "1-y" }],
  ["ko", { id: "ko", name: "KCH Kontrolluntersuchung", duration: 15, recurrenceCount: -1, recurrenceInterval: "6-m" }],
  ["rest", { id: "rest", name: "KCH Extraktion", duration: 30, recurrenceCount: 0, recurrenceInterval: "6-m" }],
  ["tage", { id: "tage", name: "KCH Nachsorge", duration: 15, recurrenceCount: 1, recurrenceInterval: "14-d" }],
]);

test("Abstand in Monaten: Monate und Jahre, sonst nichts", () => {
  assert.equal(K.abstandMonate("6-m"), 6);
  assert.equal(K.abstandMonate("12-m"), 12);
  assert.equal(K.abstandMonate("1-y"), 12);
  assert.equal(K.abstandMonate("20-y"), 240);
  assert.equal(K.abstandMonate("21-y"), null, "ueber 240 Monate");
  assert.equal(K.abstandMonate("241-m"), null);
  assert.equal(K.abstandMonate("0-m"), null);
  assert.equal(K.abstandMonate("0-d"), null);
  assert.equal(K.abstandMonate("14-d"), null, "Tage werden nicht in Monate umgerechnet");
  assert.equal(K.abstandMonate("2-w"), null);
  assert.equal(K.abstandMonate("1.5-y"), null);
  assert.equal(K.abstandMonate("6"), null);
  assert.equal(K.abstandMonate("6-m-x"), null);
  assert.equal(K.abstandMonate(""), null);
  assert.equal(K.abstandMonate(undefined), null);
});

test("Tage, wie die Plattform rechnet", () => {
  assert.equal(K.abstandTage("6-m"), 180);
  assert.equal(K.abstandTage("12-m"), 360);
  assert.equal(K.abstandTage("1-y"), 365);
  assert.equal(K.abstandTage("3-d"), null);
});

test("Recall-Abstand zaehlt nur mit eingeschaltetem Recall-Muster", () => {
  assert.equal(K.recallAbstandMonate(motive.get("pzr")), 6);
  assert.equal(K.recallAbstandMonate(motive.get("fuellung")), 12, "Anzahl als Text");
  assert.equal(K.recallAbstandMonate(motive.get("rest")), null, "Abstand steht da, Recall ist aus");
  assert.equal(K.recallAbstandMonate(motive.get("tage")), null);
  assert.equal(K.recallAbstandMonate({ recurrenceInterval: "6-m" }), null, "ohne Angabe zur Anzahl");
  assert.equal(K.recallAbstandMonate({ recurrenceCount: null, recurrenceInterval: "6-m" }), null);
  assert.equal(K.recallAbstandMonate(undefined), null);
});

test("der Abstand gilt nur, wenn der Recall so gerechnet ist", () => {
  const von = JETZT - 400 * TAG;
  assert.equal(K.bestaetigterAbstand(motive.get("pzr"), von, von + 180 * TAG, 2), 6);
  assert.equal(K.bestaetigterAbstand(motive.get("pzr"), von, von + 181 * TAG, 2), 6);
  assert.equal(K.bestaetigterAbstand(motive.get("pzr"), von, von + 365 * TAG, 2), null, "Einstellung seither geaendert");
  assert.equal(K.bestaetigterAbstand(motive.get("pzr"), von, von + 150 * TAG, 31), 6);
  assert.equal(K.bestaetigterAbstand(motive.get("pzr"), von, von + 140 * TAG, 31), null);
  assert.equal(K.bestaetigterAbstand(motive.get("pzr"), 0, von, 2), null, "ausloesender Termin unbekannt");
  assert.equal(K.bestaetigterAbstand(motive.get("rest"), von, von + 180 * TAG, 2), null);
  assert.equal(K.bestaetigterAbstand(undefined, von, von + 180 * TAG, 2), null);
});

const mitglied = (x = {}) => ({
  patientId: "p1", firstName: "Erika", lastName: "Beispiel", mobilePhoneNumber: "+491700000001", phoneNumber: "",
  smsAllowed: true, calendarId: "kalA", dueAtMs: JETZT - 40 * TAG, lastAppointmentDateMs: JETZT - 220 * TAG, recallReason: "recall",
  sourceVisitMotiveId: "pzr", targetVisitMotiveId: "pzr", targetVisitMotiveName: "Professionelle Zahnreinigung", ...x,
});
const ausBucket = (m, o = {}) => L.bucketKandidatenAus(m, { motive, jetzt: JETZT, gruende: new Set(["recall", "successor"]), hoechstensTage: 0, nurGruende: new Set(), ...o });

test("Bucket: Abstand vom ausloesenden Besuchsgrund, nicht vom Ziel", () => {
  assert.equal(ausBucket([mitglied()])[0].kontrollabstandMonate, 6);
  const [c] = ausBucket([mitglied({ sourceVisitMotiveId: "fuellung", targetVisitMotiveId: "ko", lastAppointmentDateMs: JETZT - 405 * TAG })]);
  assert.equal(c.visitMotiveId, "ko");
  assert.equal(c.kontrollabstandMonate, 12, "Fuellung: Kontrolle nach einem Jahr, obwohl die Kontrolle selbst alle sechs Monate laeuft");
});

test("Bucket: kein Wert ohne ausloesenden Termin, bei anderem Abstand, ohne Recall-Muster, bei Folgeterminen", () => {
  const ohne = (x) => assert.equal("kontrollabstandMonate" in ausBucket([mitglied(x)])[0], false);
  ohne({ lastAppointmentDateMs: undefined });
  ohne({ lastAppointmentDateMs: JETZT - 405 * TAG });
  ohne({ sourceVisitMotiveId: "rest" });
  ohne({ sourceVisitMotiveId: "unbekannt" });
  ohne({ sourceVisitMotiveId: "tage", lastAppointmentDateMs: JETZT - 54 * TAG });
  ohne({ recallReason: "successor" });
});

test("im Vorschlag steht kontrollabstand_monate nur mit Wert", () => {
  const basis = { patientId: "p1", name: "Erika Beispiel", phone: "+491700000001", visitMotiveId: "pzr", visitMotiveName: "PRO professionelle Zahnreinigung", durationMin: 30, overdueDays: 40, source: "recall" };
  const [g] = L.nachBesuchsgrund([{ ...basis, kontrollabstandMonate: 6 }, { ...basis, patientId: "p2", name: "Otto Beispiel" }]);
  assert.equal(g.patienten[0].kontrollabstand_monate, 6);
  assert.equal("kontrollabstand_monate" in g.patienten[1], false);
});

const platzhalter = (x = {}) => ({ source: "recall", recallAppointmentId: "r1", parentRecallId: "e1", recallStartMs: JETZT - 20 * TAG, patientId: "p1", visitMotiveId: "ko", ...x });
const eltern = (x = {}) => ({ id: "e1", startMs: JETZT - 200 * TAG, grundId: "pzr", patientId: "p1", ...x });

test("alter Platzhalter: Abstand vom Besuchsgrund des Termins, aus dem der Recall entstand", async () => {
  K._elternCacheLeeren();
  const gelesen = [];
  const lesen = async (cid, lid, ids) => { gelesen.push(ids); return [eltern(), eltern({ id: "e2", grundId: "fuellung", startMs: JETZT - 380 * TAG, patientId: "p2" })]; };
  const aus = await K.mitKontrollabstand("praxisA", "ort", [
    platzhalter(),
    platzhalter({ recallAppointmentId: "r2", parentRecallId: "e2", patientId: "p2", recallStartMs: JETZT - 10 * TAG }),
    { source: "recall", patientId: "p3", campaignId: "k1" },
  ], motive, { lesen, jetzt: JETZT });
  assert.equal(aus[0].kontrollabstandMonate, 6);
  assert.equal(aus[1].kontrollabstandMonate, 12);
  assert.equal("kontrollabstandMonate" in aus[2], false, "Kampagne: kein Wert");
  assert.deepEqual(gelesen, [["e1", "e2"]]);
  await K.mitKontrollabstand("praxisA", "ort", [platzhalter()], motive, { lesen, jetzt: JETZT + 60000 });
  assert.equal(gelesen.length, 1, "gemerkt, nicht noch einmal gelesen");
});

test("alter Platzhalter: kein Wert bei fehlendem oder fremdem Ausloeser, anderem Abstand, Recall aus", async () => {
  const ohne = async (kandidat, gefunden) => {
    K._elternCacheLeeren();
    const [c] = await K.mitKontrollabstand("praxisA", "ort", [kandidat], motive, { lesen: async () => gefunden, jetzt: JETZT });
    assert.equal("kontrollabstandMonate" in c, false);
  };
  await ohne(platzhalter(), []);
  await ohne(platzhalter(), [eltern({ patientId: "anderer" })]);
  await ohne(platzhalter(), [eltern({ startMs: JETZT - 385 * TAG })]);
  await ohne(platzhalter(), [eltern({ grundId: "rest" })]);
  await ohne(platzhalter(), [eltern({ grundId: "unbekannt" })]);
  await ohne(platzhalter({ parentRecallId: undefined }), [eltern()]);
});

test("Lesefehler: Kandidaten bleiben, wie sie sind", async () => {
  K._elternCacheLeeren();
  const k = [platzhalter()];
  const aus = await K.mitKontrollabstand("praxisA", "ort", k, motive, { lesen: async () => { throw new Error("Datenbank weg"); }, jetzt: JETZT });
  assert.deepEqual(aus, k);
});