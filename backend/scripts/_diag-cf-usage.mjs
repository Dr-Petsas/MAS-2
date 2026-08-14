// Diagnose 14.08.2026 Teil 3: Sind die Cloud Functions (Buchungsstrecke,
// Plattform) die Firestore-Leser? Ausfuehrungszahlen je Funktion, 24 h und
// Nachtfenster. Nur Lesezugriff auf die Monitoring-API.
import "dotenv/config";
import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/monitoring.read"] });
const client = await auth.getClient();
const projectId = await auth.getProjectId();

async function grouped({ metric, startIso, endIso, alignSec, groupBy }) {
  const params = new URLSearchParams({
    filter: `metric.type="${metric}"`,
    "interval.startTime": startIso,
    "interval.endTime": endIso,
    "aggregation.alignmentPeriod": `${alignSec}s`,
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  for (const f of groupBy || []) params.append("aggregation.groupByFields", f);
  const url = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`;
  const res = await client.request({ url });
  const out = [];
  for (const ts of res.data.timeSeries || []) {
    const label = Object.values({ ...ts.resource?.labels, ...ts.metric?.labels })
      .filter((v) => !["docgenda", "us-central1", "europe-west1", "europe-west3"].includes(v))
      .join(" | ") || "(gesamt)";
    let sum = 0;
    for (const p of ts.points || []) sum += Number(p.value.int64Value ?? p.value.doubleValue ?? 0);
    out.push({ label, sum });
  }
  out.sort((a, b) => b.sum - a.sum);
  return out;
}

const now = new Date();
const dayAgo = new Date(now.getTime() - 24 * 3600_000);
// Nachtfenster: heute 02:00-05:00 UTC (04:00-07:00 Berlin)
const nightEnd = new Date(); nightEnd.setUTCHours(4, 0, 0, 0);
const nightStart = new Date(nightEnd.getTime() - 3 * 3600_000);

try {
  console.log(`Projekt: ${projectId}\n`);
  const day = await grouped({
    metric: "cloudfunctions.googleapis.com/function/execution_count",
    startIso: dayAgo.toISOString(), endIso: now.toISOString(),
    alignSec: 86400, groupBy: ["resource.labels.function_name"],
  });
  console.log("=== Cloud-Function-Ausfuehrungen (24 h) ===");
  if (!day.length) console.log("(keine)");
  for (const r of day) console.log(`${r.sum.toLocaleString("de-DE").padStart(10)}  ${r.label}`);

  const night = await grouped({
    metric: "cloudfunctions.googleapis.com/function/execution_count",
    startIso: nightStart.toISOString(), endIso: nightEnd.toISOString(),
    alignSec: 3 * 3600, groupBy: ["resource.labels.function_name"],
  });
  console.log("\n=== Cloud-Function-Ausfuehrungen nachts 04:00-07:00 Berlin ===");
  if (!night.length) console.log("(keine)");
  for (const r of night) console.log(`${r.sum.toLocaleString("de-DE").padStart(10)}  ${r.label}`);

  // Gen2 laeuft auf Cloud Run: dort auch schauen.
  const run = await grouped({
    metric: "run.googleapis.com/request_count",
    startIso: dayAgo.toISOString(), endIso: now.toISOString(),
    alignSec: 86400, groupBy: ["resource.labels.service_name"],
  });
  console.log("\n=== Cloud-Run-Requests (24 h) ===");
  if (!run.length) console.log("(keine)");
  for (const r of run) console.log(`${r.sum.toLocaleString("de-DE").padStart(10)}  ${r.label}`);
} catch (e) {
  console.error("FEHLER:", e?.response?.data?.error?.message || e?.message || e);
  process.exit(1);
}
process.exit(0);
