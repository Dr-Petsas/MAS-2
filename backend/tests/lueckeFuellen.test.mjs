// Luecke fuellen (Chef 26.11.2026): gemeinsame Datengrundlage fuer Claras Gespraech und die
// Maske im Kalender. Reine Rechnung mit erfundenen Daten, dazu ein Lese-Lauf gegen die Praxis,
// der beweist, dass dabei nichts angelegt wird.
// Start: node backend/tests/lueckeFuellen.test.mjs
import "dotenv/config";
import assert from "node:assert/strict";

delete process.env.MAS_GAP_LISTEN;
const { masCollection } = await import("../src/tenant.js");
const L = await import("../src/clara/lueckeFuellen.js");

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
let ok = 0;
const t = async (name, fn) => { await fn(); ok += 1; console.log("  ok -", name); };

const gaps = [
  { date: "2030-01-10", calendarId: "a", calendarName: "Dr. Beispiel", startMin: 570, endMin: 615, minutes: 45 },
  { date: "2030-01-10", calendarId: "a", calendarName: "Dr. Beispiel", startMin: 840, endMin: 900, minutes: 60 },
];

await t("Tag wird mit heute und morgen angesagt", () => {
  const jetzt = new Date("2030-01-09T10:00:00Z");
  assert.equal(L.tagGesprochen("2030-01-09", jetzt), "heute, Mittwoch, den 9. Januar");
  assert.equal(L.tagGesprochen("2030-01-10", jetzt), "morgen, Donnerstag, den 10. Januar");
  assert.equal(L.tagGesprochen("2030-01-11", jetzt), "Freitag, den 11. Januar");
});

await t("Uhrzeit wird gelesen, Unsinn nicht", () => {
  assert.equal(L.uhrzeitMinuten("9:30"), 570);
  assert.equal(L.uhrzeitMinuten("09.30"), 570);
  assert.equal(L.uhrzeitMinuten("14"), 840);
  assert.equal(L.uhrzeitMinuten(""), null);
  assert.equal(L.uhrzeitMinuten("halb zehn"), null);
});

await t("Uhrzeit trifft die Luecke, in der sie liegt, oder die naechste bis 30 Minuten", () => {
  assert.equal(L.lueckeZurUhrzeit(gaps, 600).startMin, 570);
  assert.equal(L.lueckeZurUhrzeit(gaps, 820).startMin, 840);
  assert.equal(L.lueckeZurUhrzeit(gaps, 720), null);
});

const kandidaten = [
  { patientId: "1", name: "Anna Beispiel", visitMotiveName: "PRO Zahnreinigung", durationMin: 45, overdueDays: 240, phone: "0", source: "recall" },
  { patientId: "2", name: "Bernd Muster", visitMotiveName: "Kontrolle", durationMin: 30, overdueDays: 300, phone: "0", source: "recall" },
  { patientId: "3", name: "Carla Probe", visitMotiveName: "Kontrolle", durationMin: 30, overdueDays: 90, phone: "0", source: "recall" },
];

await t("Gruppen nach Besuchsgrund, groesste zuerst, Reihenfolge der Patienten bleibt", () => {
  const g = L.nachBesuchsgrund(kandidaten);
  assert.deepEqual(g.map((x) => [x.besuchsgrund, x.anzahl]), [["Kontrolle", 2], ["Zahnreinigung", 1]]);
  assert.deepEqual(g[0].patienten.map((p) => p.name), ["Bernd Muster", "Carla Probe"]);
  assert.equal(g[0].patienten[0].telefon, true);
  const gemischt = L.nachBesuchsgrund([15, 30, 15].map((durationMin, i) => ({ patientId: String(i), name: "X", visitMotiveName: "Kontrolle", durationMin })));
  assert.equal(gemischt[0].dauerMin, 15, "haeufigste Dauer");
  assert.equal("dauern" in JSON.parse(JSON.stringify(gemischt[0])), false);
});

await t("Genannter Besuchsgrund waehlt die Gruppe, auch in Kurzform", () => {
  const g = ["Kontrolluntersuchung", "professionelle Zahnreinigung", "Zahnaufhellung", "PAR Kontrolluntersuchung", "Füllung klein"].map((besuchsgrund) => ({ besuchsgrund }));
  const wahl = (w) => L.besuchsgrundWaehlen(g, w).map((x) => x.besuchsgrund);
  assert.deepEqual(wahl("Kontrolle"), ["Kontrolluntersuchung", "PAR Kontrolluntersuchung"]);
  assert.deepEqual(wahl("Zahnreinigung"), ["professionelle Zahnreinigung"]);
  assert.deepEqual(wahl("eine Füllung"), ["Füllung klein"]);
  assert.deepEqual(wahl("Zahnaufhellung"), ["Zahnaufhellung"]);
  assert.equal(wahl("Implantat").length, 5);
  assert.equal(wahl("").length, 5);
});

await t("Absager und Nichterschienene: nur das Kennzeichen am Termin, nur ohne neuen Termin", () => {
  const jetzt = new Date("2030-06-01T10:00:00Z").getTime();
  const tag = (d) => new Date(`${d}T09:00:00Z`);
  const termin = (pid, d, patientStatus, mehr = {}) => ({ patient: { id: pid }, start: tag(d), patientStatus, status: "confirmed", ...mehr });
  const aus = L.absagerAusTerminen([
    termin("a", "2030-03-01", 5),                                   // abgesagt, nichts danach
    termin("b", "2030-03-01", 4),                                   // nicht erschienen, nichts danach
    termin("c", "2030-03-01", 5), termin("c", "2030-04-01", 2),     // abgesagt, danach behandelt
    termin("d", "2030-03-01", 4), termin("d", "2030-07-01", 0),     // nicht erschienen, neuer Termin steht
    termin("e", "2030-03-01", 5), termin("e", "2030-07-01", 0, { isDeleted: true }), // neuer Termin geloescht
    termin("f", "2030-03-01", 5), termin("f", "2030-07-01", 0, { status: "needsConfirmation" }), // nur Recall-Platzhalter
    termin("g", "2030-02-01", 2), termin("g", "2030-03-01", 0),     // nie gefehlt
    termin("h", "2030-01-01", 5), termin("h", "2030-02-01", 2), termin("h", "2030-05-01", 4), // kam wieder, fehlte dann
    termin("i", "2030-07-01", 5),                                   // Absage eines kuenftigen Termins: noch kein Anlass
    termin("j", "2030-03-01", 5, { comments: "kommt sicher" }), termin("j", "2030-03-01", 0, { comments: "abgesagt, nicht erschienen" }),
  ], jetzt);
  const kurz = aus.map((x) => `${x.patientId}:${x.art}`).sort();
  assert.deepEqual(kurz, ["a:absage", "b:nicht_erschienen", "e:absage", "f:absage", "h:nicht_erschienen", "j:absage"]);
});

await t("Reihenfolge: juengster Anlass zuerst, seit Jahren Faellige hinten", () => {
  const k = [
    { name: "alt", overdueDays: 1800, source: "recall" },
    { name: "frisch", overdueDays: 20, source: "recall" },
    { name: "absage", overdueDays: 20, source: "absage" },
    { name: "versaeumt", overdueDays: 5, source: "nicht_erschienen" },
    { name: "mittel", overdueDays: 400, source: "recall" },
  ];
  assert.deepEqual([...k].sort(L.juengsterAnlassZuerst).map((x) => x.name), ["versaeumt", "absage", "frisch", "mittel", "alt"]);
  const g = L.nachBesuchsgrund([{ patientId: "1", name: "A B", visitMotiveName: "Kontrolle", source: "absage", anlass: "hat den Termin am 3. Mai 2030 abgesagt", overdueDays: 20, phone: "0" }]);
  assert.equal(g[0].patienten[0].faellig, "hat den Termin am 3. Mai 2030 abgesagt");
  assert.equal(g[0].patienten[0].quelle, "absage");
});

await t("Sprechtexte nennen Luecken, Besuchsgruende und Namen, aber keine Anrufliste und keine Freigabe", () => {
  const luecken = L.lueckenSatz({ ok: true, date: "2030-01-10", gaps });
  assert.ok(luecken.includes("9:30 bis 10:15 Uhr (45 Minuten)"), luecken);
  assert.ok(luecken.includes("Donnerstag, den 10. Januar"), luecken);
  const fund = { ok: true, luecke: gaps[0], gruppen: L.nachBesuchsgrund(kandidaten), gesamt: 3 };
  const passend = L.passendSatz(fund);
  assert.ok(passend.includes("Kontrolle, 30 Minuten: 2 Patienten, vorn Bernd Muster"), passend);
  assert.ok(passend.includes("Zahnreinigung"), passend);
  for (const text of [luecken, passend, L.lueckenSatz({ ok: true, date: "2030-01-10", gaps: [] }), L.passendSatz({ ...fund, gruppen: [], gesamt: 0 })]) {
    for (const wort of ["Anrufliste", "Freigabe", "freigeben", "€", "Euro"]) assert.ok(!text.includes(wort), `${wort}: ${text}`);
  }
});

const listen = async () => {
  const snap = await masCollection(clientId, "mas_cases").where("assignee", "==", "Lisa").get();
  return snap.docs.filter((d) => d.id.startsWith("gapfill_")).map((d) => `${d.id}:${d.get("status")}:${d.updateTime.toMillis()}`).sort();
};

await t("Lese-Lauf gegen die Praxis: Luecken und Passende kommen, angelegt wird nichts", async () => {
  const vorher = await listen();
  const fund = await L.lueckenFinden(clientId, { horizonDays: 7 });
  assert.equal(fund.ok, true);
  console.log(`     ${fund.gaps.length} Luecken in 7 Tagen`);
  if (fund.gaps.length) {
    const g = fund.gaps[0];
    const passend = await L.passendFuerLuecke(clientId, { date: g.date, calendarId: g.calendarId, startMin: g.startMin, minutes: g.minutes });
    assert.equal(passend.ok, true);
    assert.equal(passend.gesamt, passend.gruppen.reduce((n, x) => n + x.anzahl, 0));
    for (const gr of passend.gruppen) {
      assert.ok(!gr.dauerMin || gr.dauerMin <= g.minutes, "Dauer passt in die Luecke");
      assert.ok(gr.patienten.length <= 100 && gr.patienten.length <= gr.anzahl, "je Besuchsgrund hoechstens 100 mitgeliefert");
    }
    const vorn = passend.gruppen[0].patienten.map((p) => p.overdueDays);
    assert.deepEqual(vorn, [...vorn].sort((a, b) => a - b), "je Besuchsgrund juengster Anlass zuerst");
    console.log(`     davon ${passend.absager} Absager/Nichterschienene, ${passend.faelligBisZweiJahre} bis zwei Jahre faellig; vorn seit ${vorn.slice(0, 3).join(", ")} Tagen`);
    const satz = L.passendSatz(passend);
    assert.ok(satz.includes(`passen ${passend.gesamt === 1 ? "ein Patient" : passend.gesamt + " Patienten"}`), "Satz nennt die echte Zahl");
    console.log(`     erste Luecke ${g.minutes} Minuten: ${passend.gesamt} Passende in ${passend.gruppen.length} Besuchsgruenden`);
  }
  const heute = await L.lueckenMitAusblick(clientId, {});
  assert.equal(heute.fund.ok, true);
  assert.ok(!heute.leerAm || heute.fund.gaps.length > 0, "Ausblick nur, wenn er Luecken bringt");
  console.log(`     ohne Datum: ${heute.fund.gaps.length} Luecken${heute.leerAm ? ", heute leer, Ausblick auf die naechsten Tage" : ""}`);
  assert.deepEqual(await listen(), vorher);
});

console.log(`\n${ok} Pruefungen gruen`);
process.exit(0);
