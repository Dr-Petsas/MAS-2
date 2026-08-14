// Diagnose 14.08.2026 Teil 6: Bestandszaehlung fuer die Sweep-Kostenrechnung.
// Zaehlt per Aggregations-Query (1 Read je count), was die Dauerlaeufer bei
// jedem Takt wirklich einlesen.
import "dotenv/config";
import { masCollection } from "../src/tenant.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";

async function count(label, q) {
  try {
    const c = await q.count().get();
    console.log(`${String(c.data().count).padStart(6)}  ${label}`);
    return c.data().count;
  } catch (e) {
    console.log(`  FEHL  ${label}: ${e?.message || e}`);
    return 0;
  }
}

console.log(`Mandant: ${clientId}\n`);

// finalizeLisaCalls (alle 15 s): where status=="calling" limit 25
await count("mas_lisa_tasks status=calling (alle 15 s gelesen)",
  masCollection(clientId, "mas_lisa_tasks").where("status", "==", "calling"));
await count("mas_lisa_tasks status=scheduled",
  masCollection(clientId, "mas_lisa_tasks").where("status", "==", "scheduled"));
await count("mas_lisa_tasks gesamt",
  masCollection(clientId, "mas_lisa_tasks"));

// sweepRecallOutcomes (jede 60 s): listCases -> orderBy updatedAt limit 100
await count("mas_cases gesamt (Sweep liest min(100, Bestand) JEDE Minute)",
  masCollection(clientId, "mas_cases"));

// Bianca-Ingest (alle 30 s): 1 Cursor-Read je done/failed-Conversation im Fenster
await count("bianca ingest-cursor gesamt",
  masCollection(clientId, "mas_bianca_ingested"));

// QM-Scheduler (alle 5 min)
await count("mas_qm_jobs gesamt", masCollection(clientId, "mas_qm_jobs"));

process.exit(0);
