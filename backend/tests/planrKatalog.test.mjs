import test from "node:test";
import assert from "node:assert/strict";
import { _setHolen, praxisKatalog } from "../src/hkp/planrKatalog.js";

const KATALOG = { pvs: "DS-Win", stand: "2026-10-14", eigenlabor: [{ nr: "2151", text: "Krone gefräst", preis: 120 }], goz: [], komplexe: [] };

test("praxisKatalog: holt mit Schluessel, haelt den Stand, faellt bei Ausfall auf den letzten zurueck", async () => {
  process.env.PLANR_HKP_KEY = "k";
  delete process.env.MAS_PLANR_KATALOG;
  const gefragt = [];
  let antwort = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, katalog: KATALOG }) });
  _setHolen(async (url, opt) => { gefragt.push({ url, key: opt.headers["X-PlanR-Key"] }); return antwort(); });

  assert.deepEqual(await praxisKatalog("p1"), KATALOG);
  assert.match(gefragt[0].url, /\/api\/intern\/praxiskatalog\?clientId=p1$/);
  assert.equal(gefragt[0].key, "k");
  await praxisKatalog("p1");
  assert.equal(gefragt.length, 1, "zweiter Aufruf aus dem Zwischenspeicher");

  antwort = async () => ({ ok: false, status: 404, json: async () => ({ ok: false }) });
  assert.equal(await praxisKatalog("unbekannt"), null);
});

test("praxisKatalog: PlanR nicht erreichbar -> null, wirft nie; Notaus", async () => {
  process.env.PLANR_HKP_KEY = "k";
  _setHolen(async () => { throw new Error("weg"); });
  assert.equal(await praxisKatalog("p2"), null);

  let gefragt = 0;
  _setHolen(async () => { gefragt++; return { ok: true, status: 200, json: async () => ({ ok: true, katalog: KATALOG }) }; });
  process.env.MAS_PLANR_KATALOG = "0";
  assert.equal(await praxisKatalog("p3"), null);
  assert.equal(gefragt, 0);
  delete process.env.MAS_PLANR_KATALOG;
});
