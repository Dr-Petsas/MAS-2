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
    for (const gr of passend.gruppen) assert.ok(!gr.dauerMin || gr.dauerMin <= g.minutes, "Dauer passt in die Luecke");
    console.log(`     erste Luecke ${g.minutes} Minuten: ${passend.gesamt} Passende in ${passend.gruppen.length} Besuchsgruenden`);
  }
  assert.deepEqual(await listen(), vorher);
});

console.log(`\n${ok} Pruefungen gruen`);
process.exit(0);
