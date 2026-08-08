// Gegenprobe des Namenskatalogs an der ECHTEN Kartei.
//
// Aufruf:  node backend/tools/patient-catalog-check.mjs "Hajjami" "El Otmani" ...
// Ohne Argumente werden die Namen aus den gescheiterten Live-Anrufen geprueft.
//
// Zeigt: Groesse des Katalogs, woher er kam (Platte = 0 Lesevorgaenge) und die
// Trefferliste je Suchwort samt Dauer.

import "dotenv/config";
import { ensureCatalog, findInCatalog, catalogStatus } from "../src/clara/patientCatalog.js";

const cid = process.env.DEFAULT_CLIENT_ID;
const proben = process.argv.slice(2);
const fragen = proben.length
  ? proben
  : ["Ouafa El Hajjami", "El Hajjami", "Hajjami", "Haila El Otmani", "Makhoukhi", "Dermos"];

const t0 = Date.now();
const cat = await ensureCatalog(cid);
console.log(`Katalog: ${cat?.count ?? 0} Namen, ${cat?.index.size ?? 0} Klang-Schluessel, bereit in ${Date.now() - t0} ms`);
const st = catalogStatus();
console.log(`Ablage: ${st.dir}${st.diskError ? "  (FEHLER: " + st.diskError + ")" : ""}`);
console.log(`Alter: ${st.tenants[0]?.ageMinutes ?? "?"} Minuten, Auffrischung alle ${Math.round(st.ttlMs / 3600000)} h\n`);

for (const q of fragen) {
  const t = Date.now();
  const r = await findInCatalog(cid, q, { limit: 5 });
  const namen = r.map((x) => `${x.f} ${x.l} (${x.score})`).join(" | ") || "(nichts)";
  console.log(`"${q}"  [${Date.now() - t} ms]\n   ${namen}`);
}
process.exit(0);
