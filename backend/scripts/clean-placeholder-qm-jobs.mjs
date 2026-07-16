import "dotenv/config";
import { masCollection } from "../src/tenant.js";

// Entfernt NUR die alten Platzhalter-Jobs "<Plan> – anlegen & pflegen", die frueher
// beim blossen Auswaehlen/Aktivieren eines Plans automatisch angelegt wurden.
// Echte, per Wizard/Interview erzeugte Jobs (recurrenceMode != on_event bzw. mit
// recurrenceId/cycle) bleiben unangetastet.
//
//   node scripts/clean-placeholder-qm-jobs.mjs [clientId] [--dry]
//
// Ohne clientId: DEFAULT_CLIENT_ID aus der .env.

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const clientId = (args.find((a) => !a.startsWith("--")) || process.env.DEFAULT_CLIENT_ID || "").trim();
const dry = flags.has("--dry");

if (!clientId) {
  console.error("Kein clientId und kein DEFAULT_CLIENT_ID gesetzt. Abbruch.");
  process.exit(1);
}

const snap = await masCollection(clientId, "mas_qm_jobs").get();
const victims = snap.docs.filter((d) => {
  const j = d.data() || {};
  const title = String(j.title || "");
  const isPlaceholder = /–\s*anlegen\s*&\s*pflegen\s*$/i.test(title);
  const isOnEvent = (j.recurrenceMode || "on_event") === "on_event" && !j.recurrenceId && !j.cycle;
  return isPlaceholder && isOnEvent;
});

console.log(`Platzhalter-Cleanup fuer Mandant: ${clientId}${dry ? "  (DRY-RUN)" : ""}`);
console.log(`  Jobs gesamt: ${snap.size}, Platzhalter gefunden: ${victims.length}`);
for (const d of victims) console.log(`   - ${d.data().title}`);

if (!dry && victims.length) {
  for (let i = 0; i < victims.length; i += 400) {
    await Promise.all(victims.slice(i, i + 400).map((d) => d.ref.delete()));
  }
  console.log(`\nGeloescht: ${victims.length} Platzhalter-Jobs. Echte Wizard-Jobs bleiben erhalten.`);
} else if (dry) {
  console.log("\nDRY-RUN fertig — gleicher Aufruf ohne --dry loescht die oben gelisteten Jobs.");
} else {
  console.log("\nNichts zu tun.");
}
process.exit(0);
