// Schalter MAS_LISA_ALT_EINTRAEGE: die alte Lisa-Strecke schreibt ihre eigenen
// Anruf-Eintraege nur, solange Lisa V8 die Anrufe nicht selbst meldet. Ohne Datenbank.
import test from "node:test";
import assert from "node:assert/strict";
import { alteAnrufEintraegeAn, altEintrag, istLisaV8Bericht, schreibtLisaResult, telefonkiReportFuer } from "../src/lisa/outbound.js";

async function mitSchalter(wert, fn) {
  const alt = process.env.MAS_LISA_ALT_EINTRAEGE;
  if (wert == null) delete process.env.MAS_LISA_ALT_EINTRAEGE; else process.env.MAS_LISA_ALT_EINTRAEGE = wert;
  try { return await fn(); } finally {
    if (alt == null) delete process.env.MAS_LISA_ALT_EINTRAEGE; else process.env.MAS_LISA_ALT_EINTRAEGE = alt;
  }
}

test("Standard: die alte Strecke schreibt wie bisher", async () => {
  for (const wert of [null, "", "1", "ja"]) {
    await mitSchalter(wert, async () => {
      assert.equal(alteAnrufEintraegeAn(), true, String(wert));
      const geschrieben = [];
      const aus = await altEintrag("c", { id: "lisa-result-t1" }, async (cid, e) => { geschrieben.push([cid, e.id]); });
      assert.deepEqual(aus, { geschrieben: true });
      assert.deepEqual(geschrieben, [["c", "lisa-result-t1"]]);
    });
  }
});

test("MAS_LISA_ALT_EINTRAEGE=0: kein eigener Eintrag mehr", async () => {
  await mitSchalter("0", async () => {
    assert.equal(alteAnrufEintraegeAn(), false);
    let aufrufe = 0;
    const aus = await altEintrag("c", { id: "lisa-result-t1" }, async () => { aufrufe += 1; });
    assert.deepEqual(aus, { geschrieben: false });
    assert.equal(aufrufe, 0);
  });
});

test("zu einem Bericht von Lisa V8 entsteht nie ein lisa-result, auch bei Schalter an", async () => {
  await mitSchalter(null, async () => {
    assert.equal(schreibtLisaResult({ extractor: "telefonki-lisa-v8" }), false);
    assert.equal(schreibtLisaResult({ extractor: "telefonki-lisa-v8@1" }), false);
    assert.equal(schreibtLisaResult({ extractor: "lisa-v8" }), false);
    assert.equal(schreibtLisaResult({ extractor: "telefonki-lisa" }), true, "alte TelefonKI-Lisa wie bisher");
    assert.equal(schreibtLisaResult({ extractor: "telefonki" }), true);
    assert.equal(schreibtLisaResult(null), true, "ohne Bericht (nicht erreicht) wie bisher");
  });
  await mitSchalter("0", async () => {
    assert.equal(schreibtLisaResult({ extractor: "telefonki" }), false);
    assert.equal(schreibtLisaResult(null), false);
  });
  assert.equal(istLisaV8Bericht({ extractor: "lisa@outbound" }), false);
});

test("der Eintrag von Lisa V8 gilt als Bericht zum Auftrag", () => {
  const task = { phone: "+491700000301", ts: 1_000_000 };
  const v8 = { channel: "lisa_call", type: "interaction", extractor: "lisa-v8", ts: 1_000_500, counterparty: { ref: "+491700000301" }, anruf: { erreicht: "niemand" } };
  assert.equal(telefonkiReportFuer(task, [v8]), v8);
  assert.equal(telefonkiReportFuer(task, [{ ...v8, counterparty: { ref: "+491700000999" } }]), null, "andere Nummer");
  assert.equal(telefonkiReportFuer(task, [{ ...v8, extractor: "lisa@outbound" }]), null, "die eigene Notiz der alten Strecke ist kein Bericht");
});
