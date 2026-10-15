import test from "node:test";
import assert from "node:assert/strict";
import { befundErmitteln, befundWerkzeug, imGespraechAktuell } from "../src/hkp/befundQuelle.js";

const PATIENT = { id: "4711", quelle: "pvs", label: "Anna Test", firstName: "Anna", lastName: "Test", birthDate: "1972-03-05" };
const ZAEHNE = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28",
  "48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const PVS = Object.fromEntries(ZAEHNE.map((z) => [z, ""]));
Object.assign(PVS, { 18: "f", 16: "k", 36: "sk" });
const lesen = (offen = {}, geschrieben = "") => async () => ({ ok: true, pvs: "Dampsoft", datum: "2026-10-12", befund: { ...PVS }, nummer: "4711", offen, geschrieben });
const keiner = async () => null;

test("Werkzeug liest den aktuellen Befund samt offener Aenderungen vor", async () => {
  const r = await befundWerkzeug("x", PATIENT, {}, { pvs: lesen({ 26: "f" }) });
  assert.match(r.message, /Befund von Anna Test aus Dampsoft vom 12\.10\.2026/);
  assert.match(r.message, /Noch nicht in Dampsoft übernommen: es fehlt 26\. Soll ich das in Dampsoft übernehmen\?/);
  assert.equal(r.rueckfrage, "befund_uebernehmen");
  const ohne = await befundWerkzeug("x", PATIENT, {}, { pvs: lesen() });
  assert.equal(ohne.rueckfrage, undefined);
});

test("Aenderung geht als offen an PlanR, Eva fragt vor dem Schreiben", async () => {
  const gesendet = [];
  const r = await befundWerkzeug("x", PATIENT, { aenderung: "26 fehlt, 47 Implantat", wer: "Eva" }, {
    pvs: lesen(), aendern: async (...a) => { gesendet.push(a); return { ok: true, befund: {} }; },
    schreiben: async () => assert.fail("ohne Ja darf nichts ins Praxisprogramm"),
  });
  assert.deepEqual(gesendet, [["x", "4711", { 26: "f", 47: "i" }, "Eva"]]);
  assert.equal(r.rueckfrage, "befund_uebernehmen");
  assert.match(r.message, /Soll ich den Befund so in Dampsoft übernehmen\?/);
  const leer = await befundWerkzeug("x", PATIENT, { aenderung: "ändere den Befund" }, { pvs: lesen() });
  assert.equal(leer.rueckfrage, "befund_aenderung");
});

test("Uebernehmen schreibt nur die Kiefer mit offenen Aenderungen, ganz", async () => {
  let auftrag = null;
  const r = await befundWerkzeug("x", PATIENT, { uebernehmen: true }, {
    pvs: lesen({ 26: "f" }), schreiben: async (_c, _p, a) => { auftrag = a; return { ok: true, pvs: "Dampsoft" }; },
  });
  assert.equal(r.uebertragen, true);
  assert.deepEqual(auftrag.kiefer, ["OK"]);
  assert.equal(auftrag.nummer, "4711");
  assert.equal(Object.keys(auftrag.zaehne).length, 16);
  assert.deepEqual([auftrag.zaehne[26], auftrag.zaehne[16], auftrag.zaehne[36]], ["f", "k", undefined]);
  const nichts = await befundWerkzeug("x", PATIENT, { uebernehmen: true }, { pvs: lesen(), schreiben: async () => assert.fail("nichts offen") });
  assert.match(nichts.message, /steht schon so in Dampsoft/);
  const fehl = await befundWerkzeug("x", PATIENT, { uebernehmen: true }, { pvs: lesen({ 26: "f" }), schreiben: async () => ({ ok: false, meldung: "Bridge weg." }) });
  assert.equal(fehl.uebertragen, false);
  assert.match(fehl.message, /bleibt offen/);
});

test("Verwerfen und Notaus", async () => {
  let weg = 0;
  const r = await befundWerkzeug("x", PATIENT, { verwerfen: true }, { pvs: lesen({ 26: "f" }), weg: async () => { weg++; return { ok: true }; } });
  assert.equal(weg, 1);
  assert.match(r.message, /gilt wieder der Befund aus Dampsoft/);
  process.env.MAS_HKP_BEFUND_WERKZEUG = "0";
  try {
    const aus = await befundWerkzeug("x", PATIENT, { aenderung: "26 fehlt" }, { pvs: () => assert.fail("Notaus") });
    assert.match(aus.message, /nur im Heil- und Kostenplan/);
  } finally { delete process.env.MAS_HKP_BEFUND_WERKZEUG; }
  const ohnePvs = await befundWerkzeug("x", PATIENT, {}, { pvs: keiner });
  assert.match(ohnePvs.message, /kein Praxisprogramm angebunden/);
});

test("Plan nimmt den im Gespraech geaenderten Befund ohne Rueckfrage, Abweichung geht zur Freigabe", async () => {
  const r = await befundErmitteln("x", PATIENT, { kiefer: "OK", pvs: lesen({ 26: "f" }), lena: keiner });
  assert.equal(r.ok, true);
  assert.equal(r.befund[26], "f");
  assert.equal(r.quelle.art, "gesprochen+pvs");
  assert.deepEqual(r.neu.kiefer, ["OK"]);
  assert.deepEqual(r.neu.geaendert, { 26: "f" });
  const g = await befundErmitteln("x", PATIENT, { kiefer: "OK", pvs: lesen({}, new Date().toISOString()), lena: keiner });
  assert.equal(g.ok, true);
  assert.equal(g.quelle.art, "pvs");
  assert.equal(g.neu, undefined);
  const alt = await befundErmitteln("x", PATIENT, { kiefer: "OK", pvs: lesen({}, "2026-01-01T08:00:00Z"), lena: keiner });
  assert.equal(alt.grund, "befund_quelle");
  const mitPvs = await befundErmitteln("x", PATIENT, { kiefer: "OK", quelle: "pvs", gesprochen: "16 fehlt", pvs: lesen({ 26: "f" }), lena: keiner });
  assert.deepEqual(mitPvs.neu.geaendert, { 26: "f", 16: "f" });
});

test("Notaus fuer die automatische Uebernahme", () => {
  assert.equal(imGespraechAktuell({ offen: { 26: "f" } }), true);
  process.env.MAS_HKP_BEFUND_AKTUELL = "0";
  try { assert.equal(imGespraechAktuell({ offen: { 26: "f" } }), false); } finally { delete process.env.MAS_HKP_BEFUND_AKTUELL; }
});
