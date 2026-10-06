// "Nee, doch nicht": Gegenaktion zur letzten Clara-Schreib-Aktion (06.10.2026).
// Start: node backend/tests/rueckgaengig.test.mjs
import assert from "node:assert/strict";
const { mitUndo, zuruecknehmen, RUECKGAENGIG_MS } = await import("../src/clara/rueckgaengig.js");

let ok = 0;
async function t(name, fn) { await fn(); ok += 1; console.log("  ok -", name); }

function attrappe(hkps = {}) {
  const log = [];
  return {
    log,
    hkps,
    deps: {
      terminAbsagen: async (c, id) => { log.push(["absagen", id]); return { ok: id !== "kaputt" }; },
      hkpLesen: async (c, id) => hkps[id] || null,
      hkpAktualisieren: async (c, id, { felder }) => { log.push(["hkp", id, felder.status]); hkps[id].status = felder.status; },
      statusText: { freigegeben: "freigegeben" },
      vorgangStatus: async (c, id, status) => { log.push(["vorgang", id, status]); return { ok: true }; },
    },
  };
}

await t("mitUndo traegt Art, Kennung und Zeit", () => {
  const { undo } = mitUndo("termin", { id: "a1", label: "den Termin für Herrn Abel" });
  assert.equal(undo.art, "termin");
  assert.equal(undo.id, "a1");
  assert.ok(Date.now() - undo.wann < 1000);
  assert.deepEqual(mitUndo("unbekannt", { id: "x" }), {});
});

await t("Notaus MAS_RUECKGAENGIG=0: kein undo-Feld", () => {
  process.env.MAS_RUECKGAENGIG = "0";
  assert.deepEqual(mitUndo("termin", { id: "a1" }), {});
  delete process.env.MAS_RUECKGAENGIG;
});

await t("Termin wird per Kennung abgesagt", async () => {
  const a = attrappe();
  const r = await zuruecknehmen("c", mitUndo("termin", { id: "a1", label: "den Termin für Herrn Abel" }).undo, a.deps);
  assert.equal(r.ok, true);
  assert.equal(r.undoErledigt, true);
  assert.match(r.message, /^Gut, ich habe den Termin für Herrn Abel wieder abgesagt\.$/);
  assert.deepEqual(a.log, [["absagen", "a1"]]);
});

await t("fehlgeschlagene Absage: Eintrag bleibt fuer einen zweiten Anlauf", async () => {
  const r = await zuruecknehmen("c", mitUndo("termin", { id: "kaputt", label: "den Termin" }).undo, attrappe().deps);
  assert.equal(r.ok, false);
  assert.equal(r.undoErledigt, false);
});

await t("HKP-Entwurf wird verworfen, ein ersetzter alter wartet wieder", async () => {
  const a = attrappe({
    neu: { id: "neu", status: "wartet_auf_freigabe", version: 1 },
    alt: { id: "alt", status: "verworfen", version: 3 },
  });
  const r = await zuruecknehmen("c", mitUndo("hkp", { id: "neu", label: "den Kassen-HKP für Frau Greisinger", alt: ["alt"] }).undo, a.deps);
  assert.equal(r.ok, true);
  assert.match(r.message, /wieder verworfen\. Der vorige HKP wartet wieder auf Ihre Freigabe\./);
  assert.equal(a.hkps.neu.status, "verworfen");
  assert.equal(a.hkps.alt.status, "wartet_auf_freigabe");
});

await t("freigegebener HKP bleibt unberuehrt", async () => {
  const a = attrappe({ h: { id: "h", status: "freigegeben", version: 2 } });
  const r = await zuruecknehmen("c", mitUndo("hkp", { id: "h", label: "den HKP" }).undo, a.deps);
  assert.equal(r.ok, false);
  assert.match(r.message, /freigegeben — zurücknehmen geht nur noch in PlanR/);
  assert.equal(a.log.length, 0);
});

await t("Vorgang geht auf den vorigen Status zurueck, Aufgabe wird geschlossen", async () => {
  const a = attrappe();
  const v = await zuruecknehmen("c", mitUndo("vorgang", { id: "v1", vorher: "in_progress", label: "den Vorgang von Herrn Tzannis" }).undo, a.deps);
  assert.match(v.message, /^Gut, ich habe den Vorgang von Herrn Tzannis wieder geöffnet\.$/);
  const g = await zuruecknehmen("c", mitUndo("aufgabe", { id: "t1", label: "die Aufgabe" }).undo, a.deps);
  assert.match(g.message, /wieder gestrichen/);
  assert.deepEqual(a.log, [["vorgang", "v1", "in_progress"], ["vorgang", "t1", "closed"]]);
});

await t("SMS/Mail/Lisa: ehrlich endgueltig, keine Gegenaktion", async () => {
  const a = attrappe();
  const r = await zuruecknehmen("c", mitUndo("endgueltig", { label: "die SMS an Herrn Abel" }).undo, a.deps);
  assert.equal(r.endgueltig, true);
  assert.match(r.message, /^Zurückholen kann ich die SMS an Herrn Abel nicht mehr/);
  assert.equal(a.log.length, 0);
});

await t("zu alt oder unbekannt: nichts wird angefasst", async () => {
  const a = attrappe();
  const alt = { ...mitUndo("termin", { id: "a1", label: "den Termin" }).undo, wann: Date.now() - RUECKGAENGIG_MS - 1000 };
  assert.match((await zuruecknehmen("c", alt, a.deps)).message, /zu lange her/);
  assert.match((await zuruecknehmen("c", null, a.deps)).message, /nichts geschrieben/);
  assert.match((await zuruecknehmen("c", { art: "loeschen", id: "x", wann: Date.now() }, a.deps)).message, /nichts geschrieben/);
  assert.equal(a.log.length, 0);
});

console.log(`\nrueckgaengig: ${ok} ok`);
