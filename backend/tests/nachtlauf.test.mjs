// Nachtlauf: Morgen-Zeile, Pruefliste lesen, Testfall per Klick (06.10.2026).
// Start: node backend/tests/nachtlauf.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { leseNachtlauf, nachtlaufZeile, prueflisteLaden, testfallUebernehmen, prueflisteVerwerfen } = await import("../src/clara/nachtlauf.js");

let ok = 0;
function t(name, fn) { fn(); ok += 1; console.log("  ok -", name); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nachtlauf-"));
const opts = { claraDir: dir };
const schreib = (rel, daten) => {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(daten), "utf8");
};

const vorschlag = {
  id: "gs-20261006-101500-001", category: "aus_gespraech", goal: "Chef korrigiert",
  turns: [{ text: "Wann kommt Herr Betsis?" }], dialog_expect: { final_executed: ["patient_next_appointment"] },
};
schreib(".run/pruefliste/pruefliste-20261006.json", { tag: "20261006", eintraege: [
  { id: vorschlag.id, status: "offen", vorschlag },
  { id: "gs-20261006-101500-002", status: "offen", vorschlag: { id: "gs-20261006-101500-002", turns: [{ text: "Und die Hund." }] } },
  { id: "gs-20261006-101500-003", status: "offen", vorschlag: { ...vorschlag, id: "gs-20261006-101500-003" } },
] });
schreib(".run/pruefliste/pruefliste-20261005.json", { tag: "20261005", eintraege: [] });

t("Morgen-Zeile: gruen mit Bilanz und offener Pruefliste", () => {
  assert.equal(nachtlaufZeile({ volltest: { ok: true, bestanden: 140, gesamt: 145 }, pruefliste: { offen: 7 } }),
    "Nachttest gruen 140/145 | Pruefliste 7");
});

t("Morgen-Zeile: rot mit Schritten, ohne Volltest, ohne Lauf", () => {
  assert.equal(nachtlaufZeile({ volltest: { ok: false, bestanden: 100, gesamt: 145, schritte_rot: ["Flip-Sperre"] }, pruefliste: { offen: 0 } }),
    "Nachttest ROT 100/145 (Flip-Sperre)");
  assert.equal(nachtlaufZeile({ volltest: null, pruefliste: { offen: 2 } }), "Nachttest fehlt | Pruefliste 2");
  assert.equal(nachtlaufZeile(null), "Nachtlauf fehlt");
});

t("letzter.json nur, wenn frisch", () => {
  schreib(".run/nachtlauf/letzter.json", { tag: "20261006", beendet: "2026-10-07T02:48:00" });
  const jetzt = Date.parse("2026-10-07T06:30:00");
  assert.equal(leseNachtlauf({ ...opts, jetzt }).tag, "20261006");
  assert.equal(leseNachtlauf({ ...opts, jetzt: jetzt + 2 * 86400_000 }), null);
});

t("Pruefliste: neueste Tage zuerst", () => {
  const tage = prueflisteLaden(opts);
  assert.deepEqual(tage.map((x) => x.tag), ["20261006", "20261005"]);
  assert.equal(tage[0].eintraege.length, 3);
});

t("Klick uebernimmt den Vorschlag und markiert den Eintrag", () => {
  const out = testfallUebernehmen({ tag: "20261006", id: vorschlag.id }, opts);
  assert.equal(out.ok, true);
  const datei = JSON.parse(fs.readFileSync(path.join(dir, "testsuite/dialogs_aus_gespraechen.json"), "utf8"));
  assert.equal(datei.dialogs.length, 1);
  assert.deepEqual(datei.dialogs[0].dialog_expect, { final_executed: ["patient_next_appointment"] });
  assert.equal(prueflisteLaden(opts)[0].eintraege[0].status, "uebernommen");
});

t("zweiter Klick ersetzt statt zu verdoppeln", () => {
  testfallUebernehmen({ tag: "20261006", id: vorschlag.id }, opts);
  const datei = JSON.parse(fs.readFileSync(path.join(dir, "testsuite/dialogs_aus_gespraechen.json"), "utf8"));
  assert.equal(datei.dialogs.length, 1);
});

t("Vorschlag ohne Erwartung wird abgelehnt, bearbeitete Fassung geht", () => {
  const ohne = testfallUebernehmen({ tag: "20261006", id: "gs-20261006-101500-002" }, opts);
  assert.equal(ohne.ok, false);
  assert.match(ohne.error, /keine Erwartung/);
  const mit = testfallUebernehmen({ tag: "20261006", id: "gs-20261006-101500-002",
    dialog: { id: "gs-20261006-101500-002", turns: [{ text: "Und die Hund.", say_not_contains: ["nicht verstanden"] }] } }, opts);
  assert.equal(mit.ok, true);
});

t("kaputte Eingaben", () => {
  assert.equal(testfallUebernehmen({ tag: "x", id: "a" }, opts).ok, false);
  assert.equal(testfallUebernehmen({ tag: "20261006", id: "gibtsnicht" }, opts).ok, false);
  assert.equal(testfallUebernehmen({ tag: "20261006", id: "gs-20261006-101500-003", dialog: { id: "../böse", turns: [{ text: "x" }] } }, opts).ok, false);
});

t("Verwerfen", () => {
  assert.equal(prueflisteVerwerfen({ tag: "20261006", id: "gs-20261006-101500-003" }, opts).ok, true);
  assert.equal(prueflisteLaden(opts)[0].eintraege[2].status, "verworfen");
  assert.equal(prueflisteVerwerfen({ tag: "20261006", id: "nix" }, opts).ok, false);
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(`nachtlauf: ${ok} ok`);
