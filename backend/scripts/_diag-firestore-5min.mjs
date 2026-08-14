// Diagnose 14.08.2026 Teil 7: Wirkungskontrolle der Kosten-Bremsen —
// Firestore-Reads in 5-Minuten-Fenstern der letzten Stunde. Vorher-Sockel:
// ~3.500 Reads je 5 min (42k/h). Nur Lesezugriff auf die Monitoring-API.
import "dotenv/config";
import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/monitoring.read"] });
const client = await auth.getClient();
const projectId = await auth.getProjectId();

const end = new Date();
const start = new Date(end.getTime() - 60 * 60_000);
const params = new URLSearchParams({
  filter: 'metric.type="firestore.googleapis.com/document/read_count"',
  "interval.startTime": start.toISOString(),
  "interval.endTime": end.toISOString(),
  "aggregation.alignmentPeriod": "300s",
  "aggregation.perSeriesAligner": "ALIGN_SUM",
  "aggregation.crossSeriesReducer": "REDUCE_SUM",
});
const res = await client.request({
  url: `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`,
});
const rows = [];
for (const ts of res.data.timeSeries || []) {
  for (const p of ts.points || []) {
    rows.push([p.interval.endTime, Number(p.value.int64Value ?? p.value.doubleValue ?? 0)]);
  }
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
for (const [t, v] of rows) {
  const local = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
  console.log(`bis ${local}  ${String(v.toLocaleString("de-DE")).padStart(8)}  ${"#".repeat(Math.min(60, Math.round(v / 100)))}`);
}

// Zweitmessung (optional): RunQuery-Aufrufe je 5 min. Die Monitoring-API wirft
// fuer kurze Fenster teils 404 ("cannot find metric") — dann einfach ohne.
try {
  const p2 = new URLSearchParams({
    filter: 'metric.type="firestore.googleapis.com/api/request_count" AND metric.labels.method="RunQuery"',
    "interval.startTime": start.toISOString(),
    "interval.endTime": end.toISOString(),
    "aggregation.alignmentPeriod": "300s",
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  const res2 = await client.request({
    url: `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${p2}`,
  });
  const rows2 = [];
  for (const ts of res2.data.timeSeries || []) {
    for (const p of ts.points || []) {
      rows2.push([p.interval.endTime, Number(p.value.int64Value ?? p.value.doubleValue ?? 0)]);
    }
  }
  rows2.sort((a, b) => a[0].localeCompare(b[0]));
  console.log("\nRunQuery-Aufrufe je 5 min:");
  for (const [t, v] of rows2) {
    const local = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
    console.log(`bis ${local}  ${String(v.toLocaleString("de-DE")).padStart(8)}`);
  }
} catch {
  console.log("\n(RunQuery-Aufschluesselung fuer dieses Fenster nicht verfuegbar)");
}
process.exit(0);
