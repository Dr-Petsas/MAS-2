// Diagnose 14.08.2026 Teil 2: Woher kommt der 42k/h-Lese-Sockel? Aufschluesselung
// der Firestore-Zugriffe nach API-Methode (RunQuery/Listen/BatchGet/Get) und der
// Reads nach Typ (QUERY/LOOKUP). Nur Lesezugriff auf die Monitoring-API.
import "dotenv/config";
import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/monitoring.read"] });
const client = await auth.getClient();
const projectId = await auth.getProjectId();

async function timeSeries({ metric, hours, alignSec, groupBy }) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  const params = new URLSearchParams({
    filter: `metric.type="${metric}"`,
    "interval.startTime": start.toISOString(),
    "interval.endTime": end.toISOString(),
    "aggregation.alignmentPeriod": `${alignSec}s`,
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  for (const f of groupBy || []) params.append("aggregation.groupByFields", f);
  const url = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`;
  const res = await client.request({ url });
  return res.data.timeSeries || [];
}

function sumSeries(series) {
  const out = [];
  for (const ts of series) {
    const label = Object.entries(ts.metric?.labels || {})
      .map(([k, v]) => `${k}=${v}`).join(",") || "(gesamt)";
    let sum = 0;
    for (const p of ts.points || []) sum += Number(p.value.int64Value ?? p.value.doubleValue ?? 0);
    out.push({ label, sum });
  }
  out.sort((a, b) => b.sum - a.sum);
  return out;
}

try {
  console.log(`Projekt: ${projectId} — Zeitraum: letzte 24 h\n`);

  const byMethod = await timeSeries({
    metric: "firestore.googleapis.com/api/request_count",
    hours: 24, alignSec: 86400, groupBy: ["metric.labels.method"],
  });
  console.log("=== API-Requests nach Methode (24 h) ===");
  for (const r of sumSeries(byMethod)) console.log(`${r.sum.toLocaleString("de-DE").padStart(12)}  ${r.label}`);

  const byType = await timeSeries({
    metric: "firestore.googleapis.com/document/read_count",
    hours: 24, alignSec: 86400, groupBy: ["metric.labels.type"],
  });
  console.log("\n=== Dokument-READS nach Typ (24 h) ===");
  for (const r of sumSeries(byType)) console.log(`${r.sum.toLocaleString("de-DE").padStart(12)}  ${r.label}`);

  // Nachtfenster separat (02:00-05:00 UTC = 04:00-07:00 Berlin): reiner Sockel,
  // kein Nutzer — zeigt die Dauerlaeufer isoliert.
  const nightEnd = new Date(); nightEnd.setUTCHours(4, 0, 0, 0);
  const nightStart = new Date(nightEnd.getTime() - 3 * 3600_000);
  const params = new URLSearchParams({
    filter: `metric.type="firestore.googleapis.com/api/request_count"`,
    "interval.startTime": nightStart.toISOString(),
    "interval.endTime": nightEnd.toISOString(),
    "aggregation.alignmentPeriod": `${3 * 3600}s`,
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  params.append("aggregation.groupByFields", "metric.labels.method");
  const url = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`;
  const res = await client.request({ url });
  console.log("\n=== API-Requests nachts 04:00-07:00 Berlin (nur Sockel) ===");
  for (const r of sumSeries(res.data.timeSeries || [])) console.log(`${r.sum.toLocaleString("de-DE").padStart(12)}  ${r.label}`);
} catch (e) {
  console.error("FEHLER:", e?.response?.data?.error?.message || e?.message || e);
  process.exit(1);
}
process.exit(0);
