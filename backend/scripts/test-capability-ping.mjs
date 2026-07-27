// Test Faehigkeits-Ping (W-STABIL-3, 28.07.2026). OHNE Mutationen:
// nur Datei-Reads, OPTIONS-Anfragen und Health-GETs. Prueft:
//   1. Tool-Routen-Abgleich: alle Profil-Tools zeigen auf gemountete Routen.
//   2. Negativprobe: ein erfundenes Tool auf toter Route wird GEFUNDEN
//      (genau der Abwesenheits-Vorfall, den der Ping kuenftig fangen soll).
//   3. Cloud Functions erreichbar, ElevenLabs ok, Lena-Dienst ok.
// Aufruf: node scripts/test-capability-ping.mjs
import "dotenv/config";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  checkToolRoutes, checkCloudFunctions, checkElevenLabs, checkLena,
} from "../src/clara/health.js";

let failed = 0;
function check(ok, label, detail = "") {
  console.log(`${ok ? "OK " : "ROT"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

// 1. Echtes Profil: alles muss gemountet sein.
const routen = await checkToolRoutes();
check(routen.ok, "Tool-Routen (Profil -> MAS)", routen.detail);

// 2. Negativprobe: totes Tool MUSS auffallen.
const tmp = path.join(os.tmpdir(), `ping-negativ-${Date.now()}.json`);
await fs.writeFile(tmp, JSON.stringify({
  custom_tools: [
    { name: "tot", enabled: true, method: "POST", url: "http://127.0.0.1:4000/clara/diese-route-gibt-es-nicht" },
    { name: "lebendig", enabled: true, method: "GET", url: "http://127.0.0.1:4000/clara/health" },
  ],
}), "utf8");
try {
  const neg = await checkToolRoutes(tmp);
  check(!neg.ok && neg.detail.includes("tot") && !neg.detail.includes("lebendig"),
    "Negativprobe: tote Route wird erkannt, lebendige nicht gemeldet", neg.detail);
} finally {
  await fs.unlink(tmp).catch(() => {});
}

// 3. Externe Dienste.
const cf = await checkCloudFunctions();
check(cf.ok, "Plattform Cloud Functions", cf.detail);

const el = await checkElevenLabs();
check(el.ok, "ElevenLabs (Lisa/TTS)", el.detail);

const lena = await checkLena();
check(lena.ok, "Lena-STT (Doku)", lena.detail);

console.log(failed ? `\nROT: ${failed} Pruefung(en) fehlgeschlagen.` : "\nAlles gruen.");
process.exit(failed ? 1 : 0);
