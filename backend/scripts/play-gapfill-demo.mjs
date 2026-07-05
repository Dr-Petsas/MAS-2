import "dotenv/config";

// ============================================================================
// Lückenfüller-Testfall durchspielen (OHNE echte Anrufe/SMS an Patienten).
// Voraussetzung: node scripts/seed-gapfill-demo.mjs [--date YYYY-MM-DD]
//
//   node scripts/play-gapfill-demo.mjs
//   node scripts/play-gapfill-demo.mjs --date 2026-07-14
//   node scripts/play-gapfill-demo.mjs --live   # Lisa ruft wirklich an (Chef-Nr!)
// ============================================================================

const BASE = process.env.MAS_BASE_URL || "http://127.0.0.1:4000";
const CLIENT = "MEe4ZQHEzOPzLcexyhdT";

function defaultDemoDay() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const args = process.argv.slice(2);
const LIVE = args.includes("--live");
const DAY = args.includes("--date") ? args[args.indexOf("--date") + 1] : defaultDemoDay();

async function post(path, body = {}) {
  const res = await fetch(`${BASE}${path}?clientId=${CLIENT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function step(n, title) {
  console.log(`\n--- Schritt ${n}: ${title} ---`);
}

async function run() {
  console.log(`\n=== Lückenfüller Demo-Playbook (${DAY}) ===`);
  console.log(`Modus: ${LIVE ? "LIVE (Lisa ruft an!)" : "SICHER (dryRun / demoOnly)"}\n`);

  step(1, "Clara scannt Lücken + baut Anruflisten (demoOnly)");
  const briefing = await post("/tools/gap-briefing", { date: DAY, horizonDays: 1, demoOnly: true });
  console.log(briefing.message);
  console.log(`→ ${briefing.gaps} Lücken, ${briefing.callLists} Anruflisten`);

  if (!briefing.callLists) {
    console.log("\nKeine Anruflisten — evtl. seed-gapfill-demo.mjs noch nicht gelaufen?");
    return;
  }

  step(2, "Kandidaten-Namen vorlesen");
  const names = await post("/tools/recall-candidates", { date: DAY });
  console.log(names.message);

  step(3, LIVE ? "Recall freigeben (LIVE)" : "Recall freigeben (dryRun — niemand wird kontaktiert)");
  const approve = await post("/tools/recall-approve", LIVE ? { date: DAY } : { date: DAY, dryRun: true });
  console.log(approve.message);

  step(4, "Patient suchen (Helena Brandt)");
  const search = await post("/tools/search-patient", { name: "Helena Brandt" });
  console.log(search.message);

  step(5, "Gezieltes Einbestellen — Vorschau (10:30)");
  const preview = await post("/tools/gapfill-call-patient", {
    name: "Helena Brandt",
    date: DAY,
    time: "10:30",
    visitMotiveName: "PRO professionelle Zahnreinigung",
    calendarName: "Dr. Petsas",
    message: "Es ist kurzfristig ein Termin fuer Ihre faellige Zahnreinigung frei geworden.",
  });
  console.log(preview.message);

  if (!LIVE) {
    step(6, "Gezieltes Einbestellen — dryRun-Bestaetigung");
    const call = await post("/tools/gapfill-call-patient", {
      name: "Helena Brandt",
      date: DAY,
      time: "10:30",
      visitMotiveName: "PRO professionelle Zahnreinigung",
      calendarName: "Dr. Petsas",
      message: "Es ist kurzfristig ein Termin fuer Ihre faellige Zahnreinigung frei geworden.",
      confirm: true,
      dryRun: true,
    });
    console.log(call.message);
  }

  step(7, "Recall-Status");
  const status = await post("/tools/recall-status", { date: DAY });
  console.log(status.message);

  console.log("\n=== Fertig ===");
  if (!LIVE) {
    console.log("Alles sicher simuliert. Fuer echten Lisa-Anruf an die Chef-Nummer:");
    console.log(`  node scripts/play-gapfill-demo.mjs --date ${DAY} --live`);
  }
}

run().catch((e) => {
  console.error("\nFEHLER:", e.message || e);
  process.exit(1);
});
