// Bedeutungsvektoren für die Abrechnungswissensbasis (Quelltexte und Ziffern).
// Erst node scripts/abrechnung-wissen.mjs, dann: node scripts/abrechnung-vektoren.mjs
// Braucht Ollama mit dem Embedding-Modell (MAS_EMBED_URL, MAS_EMBED_MODEL, Standard bge-m3).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eintragText, eintragSchluessel, kurzHash } from "../src/hkp/wissen.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WISSEN = path.join(HIER, "../src/hkp/wissen/abrechnung.json");
const ZIEL = path.join(HIER, "../src/hkp/wissen/abrechnung.vektoren.json");
const URL_ = (process.env.MAS_EMBED_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const MODELL = process.env.MAS_EMBED_MODEL || "bge-m3";

const basis = JSON.parse(fs.readFileSync(WISSEN, "utf8"));
const alt = fs.existsSync(ZIEL) ? JSON.parse(fs.readFileSync(ZIEL, "utf8")) : null;
const altNach = new Map(alt?.modell === MODELL ? alt.eintraege.map((e) => [`${e.id}|${e.hash}`, e.v]) : []);

const eintraege = [
  ...basis.texte.map((x) => ({ id: eintragSchluessel("t", x), text: eintragText("t", x) })),
  ...basis.ziffern.map((z) => ({ id: eintragSchluessel("z", z), text: eintragText("z", z) })),
].map((e) => ({ ...e, hash: kurzHash(e.text) }));

const zuRechnen = eintraege.filter((e) => !altNach.has(`${e.id}|${e.hash}`));
console.log(`${eintraege.length} Einträge, ${zuRechnen.length} neu zu rechnen (${MODELL})`);

const neu = new Map();
for (let i = 0; i < zuRechnen.length; i += 32) {
  const stapel = zuRechnen.slice(i, i + 32);
  const res = await fetch(`${URL_}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODELL, input: stapel.map((e) => e.text), keep_alive: "24h" }),
  });
  if (!res.ok) throw new Error(`Embedding ${res.status}: ${await res.text()}`);
  const { embeddings } = await res.json();
  stapel.forEach((e, j) => neu.set(`${e.id}|${e.hash}`, Buffer.from(new Float32Array(embeddings[j]).buffer).toString("base64")));
  process.stdout.write(`\r${Math.min(i + 32, zuRechnen.length)}/${zuRechnen.length}`);
}

const aus = {
  modell: MODELL,
  stand: basis.stand,
  eintraege: eintraege.map((e) => ({ id: e.id, hash: e.hash, v: neu.get(`${e.id}|${e.hash}`) || altNach.get(`${e.id}|${e.hash}`) })),
};
fs.writeFileSync(ZIEL, JSON.stringify(aus));
console.log(`\n${aus.eintraege.length} Vektoren, ${fs.statSync(ZIEL).size} Bytes`);
