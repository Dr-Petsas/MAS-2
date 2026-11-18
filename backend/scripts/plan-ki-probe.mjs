// Probe-Dienst für die KI-Zeile: derselbe Zug wie /planr/plan-ki, aus der Arbeitskopie und ohne MAS-Neustart.
// Die Planer-Proben in PlanR (src/kiLive.test.ts, KI_LIVE=1) schicken ihre Pläne hierher.
//   node scripts/plan-ki-probe.mjs        lauscht auf 127.0.0.1:4011
import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { planKiZug } from "../src/hkp/planKiZug.js";

const port = Number(process.env.PLAN_KI_PROBE_PORT || 4011);
http.createServer(async (req, res) => {
  if (req.method !== "POST") { res.writeHead(200).end("plan-ki-probe"); return; }
  let roh = "";
  for await (const c of req) roh += c;
  let aus;
  // PLAN_KI_PROBE_DUMP=<Ordner>: jede Anfrage samt Antwort als Datei, zum Nachlesen, was das Modell gesehen hat.
  const dump = process.env.PLAN_KI_PROBE_DUMP;
  try { aus = await planKiZug(JSON.parse(roh || "{}")); if (dump) fs.writeFileSync(path.join(dump, `${Date.now()}.json`), JSON.stringify({ anfrage: JSON.parse(roh), antwort: aus }, null, 1)); } catch (e) { aus = { ok: false, message: String(e?.message || e) }; }
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(aus));
}).listen(port, "127.0.0.1", () => console.log(`plan-ki-probe auf 127.0.0.1:${port}`));
