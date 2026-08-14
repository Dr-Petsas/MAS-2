// Diagnose 14.08.2026: "90% des Google-Budgets verbraucht" — woher kommen die
// Kosten? Fragt die Cloud-Monitoring-API nach echten Firestore-Zahlen
// (Reads/Writes/Deletes pro Tag, letzte 7 Tage) und der Stunden-Verteilung
// von heute. Nur Lesezugriff; nutzt den vorhandenen Service-Account.
import "dotenv/config";
import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/monitoring.read"] });
const client = await auth.getClient();
const projectId = await auth.getProjectId();

async function timeSeries({ metric, days, alignSec, groupBy }) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
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

function printDaily(label, series) {
  console.log(`\n=== ${label} — Summe pro Tag ===`);
  if (!series.length) { console.log("(keine Daten)"); return; }
  const rows = new Map(); // tag -> { key -> wert }
  const keys = new Set();
  for (const ts of series) {
    const key = Object.values(ts.metric?.labels || {}).join("/") || "gesamt";
    keys.add(key);
    for (const p of ts.points || []) {
      const day = p.interval.endTime.slice(0, 10);
      const v = Number(p.value.int64Value ?? p.value.doubleValue ?? 0);
      if (!rows.has(day)) rows.set(day, {});
      rows.get(day)[key] = (rows.get(day)[key] || 0) + v;
    }
  }
  const days = [...rows.keys()].sort();
  for (const d of days) {
    const parts = [...keys].map((k) => `${k}=${(rows.get(d)[k] || 0).toLocaleString("de-DE")}`);
    console.log(`${d}  ${parts.join("  ")}`);
  }
}

try {
  console.log(`Projekt: ${projectId}`);
  const reads = await timeSeries({
    metric: "firestore.googleapis.com/document/read_count",
    days: 8, alignSec: 86400, groupBy: [],
  });
  printDaily("Firestore READS", reads);

  const writes = await timeSeries({
    metric: "firestore.googleapis.com/document/write_count",
    days: 8, alignSec: 86400, groupBy: [],
  });
  printDaily("Firestore WRITES", writes);

  const deletes = await timeSeries({
    metric: "firestore.googleapis.com/document/delete_count",
    days: 8, alignSec: 86400, groupBy: [],
  });
  printDaily("Firestore DELETES", deletes);

  // Stunden-Verteilung der Reads (letzte 48 h): 24/7-Sockel = Backend-Sweeps,
  // Tages-Spitzen = Frontend/Kalender oder Clara-Anrufe.
  const hourly = await timeSeries({
    metric: "firestore.googleapis.com/document/read_count",
    days: 2, alignSec: 3600, groupBy: [],
  });
  console.log("\n=== READS pro Stunde (letzte 48 h) ===");
  for (const ts of hourly) {
    const pts = (ts.points || []).slice().reverse();
    for (const p of pts) {
      const t = new Date(p.interval.endTime);
      const local = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(t);
      const v = Number(p.value.int64Value ?? p.value.doubleValue ?? 0);
      console.log(`${local}  ${v.toLocaleString("de-DE")}`);
    }
  }
} catch (e) {
  console.error("FEHLER:", e?.response?.data?.error?.message || e?.message || e);
  process.exit(1);
}
process.exit(0);
