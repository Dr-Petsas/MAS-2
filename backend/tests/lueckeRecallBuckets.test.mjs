// Faellige Recalls aus den Recall-Buckets der Plattform als weitere Quelle fuer "Luecke fuellen" (27.11.2026).
// Die Plattform legt keine Platzhalter-Termine mehr an, sie fuehrt die Faelligen je Kalender und Besuchsgrund
// in Mitgliederlisten. Erfundene Daten, kein Zugriff auf eine Praxis.
// Start: node --test backend/tests/lueckeRecallBuckets.test.mjs
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

const L = await import("../src/clara/lueckeFuellen.js");
const G = await import("../src/clara/gapFill.js");

const TAG = 86400000;
const JETZT = Date.UTC(2026, 10, 27, 11, 0, 0);
const motive = new Map([
  ["pzr", { id: "pzr", name: "PRO professionelle Zahnreinigung", duration: 30 }],
  ["ko", { id: "ko", name: "Kontrolle", duration: 15 }],
  ["lang", { id: "lang", name: "Parodontitis-Nachsorge", duration: 60 }],
]);
const kalender = new Map([["kalA", "Dr. Alpha"], ["kalB", "Dr. Beta"]]);
const mitglied = (x = {}) => ({
  patientId: "p1", firstName: "Erika", lastName: "Beispiel", mobilePhoneNumber: "+491700000001", phoneNumber: "",
  smsAllowed: true, calendarId: "kalA", dueAtMs: JETZT - 40 * TAG, recallReason: "recall",
  sourceVisitMotiveId: "pzr", targetVisitMotiveId: "pzr", targetVisitMotiveName: "Professionelle Zahnreinigung", ...x,
});
const aus = (m, o = {}) => L.bucketKandidatenAus(m, { motive, kalender, jetzt: JETZT, gruende: new Set(["recall"]), ...o });

test("Schalter: aus ohne Eintrag, an je Praxis oder fuer alle", () => {
  assert.equal(L.bucketsAn("praxisX", ""), false);
  assert.equal(L.bucketsAn("praxisX", undefined), false);
  assert.equal(L.bucketsAn("praxisX", "praxisY, praxisX"), true);
  assert.equal(L.bucketsAn("praxisZ", "praxisY,praxisX"), false);
  assert.equal(L.bucketsAn("praxisZ", "*"), true);
  assert.equal(L.bucketsAn("", "praxisX"), false);
});

test("Anlaesse: ohne Angabe nur Recall, Folgetermine nur auf Wunsch", () => {
  assert.deepEqual([...L.bucketGruende("")], ["recall"]);
  assert.deepEqual([...L.bucketGruende("recall, successor")], ["recall", "successor"]);
});

test("ein faelliges Mitglied wird Kandidat in der Form der Recall-Kandidaten", () => {
  const [c] = aus([mitglied()]);
  assert.equal(c.source, "recall");
  assert.equal(c.herkunft, "bucket");
  assert.equal(c.patientId, "p1");
  assert.equal(c.name, "Erika Beispiel");
  assert.equal(c.phone, "+491700000001");
  assert.ok(c.phoneNorm);
  assert.equal(c.visitMotiveId, "pzr");
  // Name des Besuchsgrunds wie in der Praxis, nicht der Patientenname aus dem Bucket: sonst zwei Gruppen.
  assert.equal(c.visitMotiveName, "PRO professionelle Zahnreinigung");
  assert.equal(c.durationMin, 30);
  assert.equal(c.calendarId, "kalA");
  assert.equal(c.doctorName, "Dr. Alpha");
  assert.equal(c.overdueDays, 40);
  assert.equal(c.alreadyCalled, false);
  assert.equal(c.consent.sms, true);
});

test("unbekannter Besuchsgrund: Name aus dem Bucket, Dauer 30 Minuten", () => {
  const [c] = aus([mitglied({ targetVisitMotiveId: "fremd", targetVisitMotiveName: "Sonderkontrolle" })]);
  assert.equal(c.visitMotiveName, "Sonderkontrolle");
  assert.equal(c.durationMin, 30);
});

test("nicht vorgeschlagen: noch nicht faellig, ohne Faelligkeit, ohne Telefon, ohne Namen, ohne Besuchsgrund", () => {
  assert.equal(aus([mitglied({ dueAtMs: JETZT + TAG })]).length, 0);
  assert.equal(aus([mitglied({ dueAtMs: null })]).length, 0);
  assert.equal(aus([mitglied({ mobilePhoneNumber: "", phoneNumber: "" })]).length, 0);
  assert.equal(aus([mitglied({ firstName: "", lastName: "" })]).length, 0);
  assert.equal(aus([mitglied({ targetVisitMotiveId: "" })]).length, 0);
  assert.equal(aus([mitglied({ patientId: "" })]).length, 0);
  assert.equal(aus(null).length, 0);
});

test("Festnetz zaehlt, wenn kein Handy eingetragen ist", () => {
  const [c] = aus([mitglied({ mobilePhoneNumber: "", phoneNumber: "030 0000001" })]);
  assert.equal(c.phone, "030 0000001");
});

test("Folgetermine und Reaktivierung bleiben draussen, solange sie nicht gewuenscht sind", () => {
  const m = [mitglied({ recallReason: "successor" }), mitglied({ patientId: "p2", recallReason: "reactivation" }), mitglied({ patientId: "p3" })];
  assert.deepEqual(aus(m).map((c) => c.patientId), ["p3"]);
  assert.deepEqual(aus(m, { gruende: new Set(["recall", "successor"]) }).map((c) => c.patientId), ["p1", "p3"]);
});

test("wer fuer den Besuchsgrund schon einen Termin vor sich hat, wird nicht vorgeschlagen", () => {
  const kommend = L.kommendeGruendeAus([
    { patient: { id: "p1" }, visitMotive: { id: "pzr" }, status: "confirmed", start: new Date(JETZT + 3 * TAG) },
    { patient: { id: "p2" }, visitMotive: { id: "ko" }, status: "confirmed", start: new Date(JETZT + 3 * TAG) },
    { patient: { id: "p3" }, visitMotive: { id: "pzr" }, status: "confirmed", start: new Date(JETZT - 3 * TAG) },
    { patient: { id: "p4" }, visitMotive: { id: "pzr" }, status: "needsConfirmation", start: new Date(JETZT + 3 * TAG) },
    { patient: { id: "p5" }, visitMotive: { id: "pzr" }, status: "confirmed", isDeleted: true, start: new Date(JETZT + 3 * TAG) },
    { patient: { id: "p6" }, visitMotive: { id: "pzr" }, status: "confirmed", patientStatus: 5, start: new Date(JETZT + 3 * TAG) },
    { patient: { id: "p7" }, visitMotive: { id: "pzr" }, status: "reserved", start: new Date(JETZT + 3 * TAG) },
  ], JETZT);
  const m = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((patientId) => mitglied({ patientId }));
  // p1 und p7 haben den Termin schon; p2 hat einen anderen Besuchsgrund vor sich und bleibt.
  assert.deepEqual(aus(m, { kommend }).map((c) => c.patientId), ["p2", "p3", "p4", "p5", "p6"]);
});

test("der Termin fuer den ausloesenden Besuchsgrund zaehlt auch, wenn das Ziel ein anderer ist", () => {
  const kommend = new Map([["p1", new Set(["ko"])]]);
  assert.equal(aus([mitglied({ sourceVisitMotiveId: "ko", targetVisitMotiveId: "pzr" })], { kommend }).length, 0);
});

test("keine Doppelten: derselbe Patient mit demselben Besuchsgrund kommt nur aus der bisherigen Quelle", () => {
  const vorhandene = [
    { source: "recall", patientId: "p1", visitMotiveId: "pzr", visitMotiveName: "PRO professionelle Zahnreinigung" },
    { source: "campaign", patientId: "p2", visitMotiveId: "", visitMotiveName: "Kontrolle" },
    { source: "absage", patientId: "p4", visitMotiveId: "alt", visitMotiveName: "Zahnreinigung alt" },
  ];
  const neue = aus([
    mitglied({ patientId: "p1" }),
    mitglied({ patientId: "p1", targetVisitMotiveId: "ko" }),
    mitglied({ patientId: "p2", targetVisitMotiveId: "ko" }),
    mitglied({ patientId: "p3" }),
    mitglied({ patientId: "p3", calendarId: "kalB" }),
  ]);
  const rest = L.ohneDoppelte(vorhandene, neue);
  assert.deepEqual(rest.map((c) => `${c.patientId}/${c.visitMotiveId}/${c.calendarId}`), ["p1/ko/kalA", "p3/pzr/kalA"]);
  assert.deepEqual(L.ohneDoppelte(null, null), []);
});

test("zusammen mit den bisherigen Quellen steht jeder Patient einmal in der Liste, die bisherige Quelle bleibt", () => {
  const alt = [
    { source: "recall", patientId: "p1", name: "Erika Beispiel", phoneNorm: "491700000001", visitMotiveId: "pzr", visitMotiveName: "PRO professionelle Zahnreinigung", durationMin: 30, calendarId: "kalA", overdueDays: 400, alreadyCalled: false },
  ];
  const neu = L.ohneDoppelte(alt, aus([
    mitglied({ patientId: "p1", targetVisitMotiveId: "ko", dueAtMs: JETZT - 400 * TAG }),
    mitglied({ patientId: "p8", lastName: "Neu", mobilePhoneNumber: "+491700000008" }),
    mitglied({ patientId: "p9", lastName: "Lang", mobilePhoneNumber: "+491700000009", targetVisitMotiveId: "lang" }),
    mitglied({ patientId: "p10", lastName: "Anders", mobilePhoneNumber: "+491700000010", calendarId: "kalB" }),
  ]));
  const liste = G.rankCandidatesForGap([...alt, ...neu], { startMin: 600, endMin: 630, minutes: 30 }, { calendarId: "kalA", max: Infinity });
  // p9 braucht 60 Minuten, p10 gehoert zu einem anderen Behandler; p1 bleibt mit dem bisherigen Eintrag.
  assert.deepEqual(liste.map((c) => c.patientId).sort(), ["p1", "p8"]);
  assert.equal(liste.find((c) => c.patientId === "p1").herkunft, undefined);
  assert.deepEqual(L.nachBesuchsgrund(liste).map((g) => g.anzahl), [2]);
});

test("Mitgliederliste wird zehn Minuten gemerkt und je Praxis getrennt gelesen", async () => {
  L._bucketCacheLeeren();
  let n = 0;
  const lesen = async (c) => { n += 1; return c === "praxisX" ? [mitglied()] : []; };
  assert.equal((await L.bucketMitglieder("praxisX", "ortX", { lesen, jetzt: 0 })).length, 1);
  assert.equal((await L.bucketMitglieder("praxisX", "ortX", { lesen, jetzt: 9 * 60 * 1000 })).length, 1);
  assert.equal((await L.bucketMitglieder("praxisY", "ortX", { lesen, jetzt: 0 })).length, 0);
  assert.equal(n, 2);
  await L.bucketMitglieder("praxisX", "ortX", { lesen, jetzt: 10 * 60 * 1000 + 1 });
  assert.equal(n, 3);
});

test("sind die Buckets oder die kommenden Termine nicht lesbar, wirft das und es wird nichts gemerkt", async () => {
  L._bucketCacheLeeren();
  await assert.rejects(L.bucketMitglieder("praxisX", "ortX", { lesen: async () => { throw new Error("aus"); }, jetzt: 0 }));
  assert.equal((await L.bucketMitglieder("praxisX", "ortX", { lesen: async () => [mitglied()], jetzt: 1 })).length, 1);
  await assert.rejects(L.kommendeGruende("praxisX", "ortX", { lesen: async () => { throw new Error("aus"); }, jetzt: 0 }));
  const k = await L.kommendeGruende("praxisX", "ortX", { lesen: async () => [{ patient: { id: "p1" }, visitMotive: { id: "pzr" }, status: "confirmed", start: new Date(5000) }], jetzt: 1 });
  assert.equal(k.get("p1").has("pzr"), true);
});

test.after(() => setTimeout(() => process.exit(0), 50));