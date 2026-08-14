// Diagnose 14.08.2026 Teil 5: Haengen nachts Snapshot-Listener (Web-SDK der
// Praxis-Geraete) an Firestore? active_connections + snapshot_listeners im
// Tagesverlauf. Nur Lesezugriff auf die Monitoring-API.
import "dotenv/config";
import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/monitoring.read"] });
const client = await auth.getClient();
const projectId = await auth.getProjectId();

async function series(metric, hours, alignSec, aligner) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  const params = new URLSearchParams({
    filter: `metric.type="${metric}"`,
    "interval.startTime": start.toISOString(),
    "interval.endTime": end.toISOString(),
    "aggregation.alignmentPeriod": `${alignSec}s`,
    "aggregation.perSeriesAligner": aligner,
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  const url = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${params}`;
  const res = await client.request({ url });
  return res.data.timeSeries || [];
}

function print(label, ts) {
  console.log(`\n=== ${label} ===`);
  if (!ts.length) { console.log("(keine Daten)"); return; }
  for (const s of ts) {
    const pts = (s.points || []).slice().reverse();
    for (const p of pts) {
      const t = new Date(p.interval.endTime);
      const local = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(t);
      const v = Number(p.value.int64Value ?? p.value.doubleValue ?? 0);
      console.log(`${local}  ${Math.round(v).toLocaleString("de-DE")}`);
    }
  }
}

try {
  console.log(`Projekt: ${projectId}`);
  print("Aktive Verbindungen (Mittel je 2 h)",
    await series("firestore.googleapis.com/network/active_connections", 24, 7200, "ALIGN_MEAN"));
  print("Snapshot-Listener (Mittel je 2 h)",
    await series("firestore.googleapis.com/network/snapshot_listeners", 24, 7200, "ALIGN_MEAN"));
} catch (e) {
  console.error("FEHLER:", e?.response?.data?.error?.message || e?.message || e);
  process.exit(1);
}
process.exit(0);
