// Schalter Anruflisten (Chef 26.11.2026: "Keine eigenmaechtigen Listen"): ohne MAS_GAP_LISTEN=1
// findet runGapFill Luecken, laedt aber keine Kandidaten und legt keine Anrufliste an — egal
// welcher Weg ruft (Zeitplan, Morgenbriefing, Clara, Plattform-Knopf, Service-Route).
// Liest nur: im ausgeschalteten Zustand schreibt der Lauf nichts.
// Start: node backend/tests/gapListenSchalter.test.mjs
import "dotenv/config";
import assert from "node:assert/strict";

delete process.env.MAS_GAP_LISTEN;
const { masCollection } = await import("../src/tenant.js");
const { runGapFill, anruflistenAktiv, buildSpokenGapBriefing, spokenGapAnswer } = await import("../src/clara/gapFill.js");
const { dailyInitiativeScan } = await import("../src/clara/recallCoach.js");

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
let ok = 0;
const t = async (name, fn) => { await fn(); ok += 1; console.log("  ok -", name); };

const listen = async () => {
  const snap = await masCollection(clientId, "mas_cases").where("assignee", "==", "Lisa").get();
  return snap.docs.filter((d) => d.id.startsWith("gapfill_")).map((d) => `${d.id}:${d.get("status")}:${d.updateTime.toMillis()}`).sort();
};
const VERSPRECHEN = ["Anrufliste", "Freigabe", "freigeben", "Kandidat", "telefoniert"];
const ohneVersprechen = (text) => VERSPRECHEN.filter((w) => text.includes(w));

await t("Schalter steht ohne Einstellung auf aus", () => {
  assert.equal(anruflistenAktiv(), false);
  process.env.MAS_GAP_LISTEN = "1";
  assert.equal(anruflistenAktiv(), true);
  delete process.env.MAS_GAP_LISTEN;
});

const vorher = await listen();
let lauf;
await t("Lauf ueber sieben Tage findet Luecken, legt keine Liste an", async () => {
  lauf = await runGapFill(clientId, { horizonDays: 7, bucketKey: "fach:prophylaxe", bucketExplicit: true });
  assert.equal(lauf.ok, true);
  assert.equal(lauf.listenAus, true);
  assert.deepEqual(lauf.callLists, []);
  assert.equal(lauf.candidatesTotal, 0);
  assert.ok(lauf.gaps.every((g) => g.candidateCount === null), "keine Kandidaten geladen");
  console.log("     Luecken gefunden:", lauf.gaps.length);
});

await t("Sprechtexte versprechen keine Liste", () => {
  assert.deepEqual(ohneVersprechen(spokenGapAnswer(lauf)), []);
  const briefing = buildSpokenGapBriefing(lauf, { operatorName: "Chef" });
  assert.deepEqual(["Anrufliste", "Freigabe", "freigeben", "telefoniert"].filter((w) => briefing.includes(w)), []);
});

await t("Zeitplan-Lauf meldet keinen Anlass (kein Push, kein Recall-Angebot)", async () => {
  const out = await dailyInitiativeScan(clientId, { publicBaseUrl: "" });
  assert.equal(out.ok, true);
  assert.equal(out.worthIt, false);
  assert.ok(!out.pushed);
});

await t("Bestand an Anruflisten ist unveraendert", async () => {
  assert.deepEqual(await listen(), vorher);
});

console.log(`\n${ok} Pruefungen bestanden.`);
process.exit(0);
