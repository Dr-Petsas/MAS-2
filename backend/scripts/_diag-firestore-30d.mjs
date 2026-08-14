// Diagnose 14.08.2026 Teil 4: Reads pro Tag ueber 30 Tage — seit wann ist das
// Niveau hoch? Nur Lesezugriff auf die Monitoring-API.
import "dotenv/config";
import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/monitoring.read"] });
const client = await auth.getClient();
const projectId = await auth.getProjectId();

const end = new Date();
const start = new Date(end.getTime() - 30 * 86400_000);
const params = new URLSearchParams({
  filter: 'metric.type="firestore.googleapis.com/document/read_count"',
  "interval.startTime": start.toISOString(),
  "interval.endTime": end.toISOString(),
  "aggregation.alignmentPeriod": "86400s",
  "aggregation.perSeriesAligner": "ALIGN_SUM",
  "aggregation.crossSeriesReducer": "REDUCE_SUM",
});
const res = await client.request({
  url: `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`,
});
const rows = [];
for (const ts of res.data.timeSeries || []) {
  for (const p of ts.points || []) {
    rows.push([p.interval.endTime.slice(0, 10), Number(p.value.int64Value ?? p.value.doubleValue ?? 0)]);
  }
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
for (const [d, v] of rows) {
  const bar = "#".repeat(Math.min(60, Math.round(v / 50000)));
  console.log(`${d}  ${v.toLocaleString("de-DE").padStart(12)}  ${bar}`);
}
process.exit(0);
