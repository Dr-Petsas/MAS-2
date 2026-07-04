import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import { appendEvent } from "../src/brain/eventStore.js";
import { buildAsapQueue, spokenAsapQueue } from "../src/clara/asapQueue.js";

// ASAP-Queue (Masterplan Phase 5) gegen einen isolierten Test-Mandanten:
// rote Liste/Fristen -> P0, Beschwerden/ungeloest -> P1, Rueckrufe -> P2,
// Dedupe ueber eventId, Sprechtext ohne Euro. Raeumt vollstaendig auf.
//   node scripts/test-asap-queue.mjs

const C = "zzz-mas2-asap";
let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

async function wipeEvents() {
  const snap = await masCollection(C, "mas_events").get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function run() {
  await wipeEvents();

  console.log("=== 1) Leerer Mandant: nichts brennt ===");
  const empty = await buildAsapQueue(C);
  check(empty.ok && empty.items.length === 0, `leere Queue (items=${empty.items.length})`);
  const emptySpoken = spokenAsapQueue(empty);
  check(/brennt nichts|Nichts Dringendes|Alles ruhig/i.test(emptySpoken), `Leer-Text sinnvoll: ${emptySpoken}`);

  console.log("\n=== 2) Quellen befuellen ===");
  const now = Date.now();
  // P0: kritisches Event (Anwalt) mit verstrichener Frist.
  await appendEvent(C, {
    id: "asap-anwalt",
    channel: "nadine_email",
    summary: "Anwaltsschreiben wegen Behandlungsfehler-Vorwurf, Frist verstrichen",
    counterparty: { kind: "other", name: "Kanzlei Meier" },
    signals: { critical: true, needsHuman: true },
    tags: ["kritisch", "anwalt"],
    deadlineMs: now - 2 * 86400000,
    ts: now - 3600000,
  });
  // P1: Beschwerde-Anruf.
  await appendEvent(C, {
    id: "asap-beschwerde",
    channel: "bianca_call",
    summary: "Patientin sehr unzufrieden, Schmerzen halten an",
    counterparty: { kind: "patient", name: "Frau Krause" },
    signals: { complaintStated: true, painPersists: true },
    ts: now - 7200000,
  });
  // P2: Rueckrufbitte.
  await appendEvent(C, {
    id: "asap-rueckruf",
    channel: "bianca_call",
    summary: "Bittet um Rueckruf wegen Termin",
    counterparty: { kind: "patient", name: "Herr Lehmann" },
    signals: { callbackRequested: true },
    ts: now - 1800000,
  });

  const q = await buildAsapQueue(C);
  const byId = Object.fromEntries(q.items.filter((i) => i.eventId).map((i) => [i.eventId, i]));
  check(byId["asap-anwalt"]?.prio === "P0", `Anwalt+Frist -> P0 (ist: ${byId["asap-anwalt"]?.prio})`);
  check(byId["asap-beschwerde"]?.prio === "P1", `Beschwerde -> P1 (ist: ${byId["asap-beschwerde"]?.prio})`);
  check(byId["asap-rueckruf"]?.prio === "P2", `Rueckruf -> P2 (ist: ${byId["asap-rueckruf"]?.prio})`);
  check(q.items[0]?.eventId === "asap-anwalt", "P0 steht ganz oben");
  const ids = q.items.filter((i) => i.eventId).map((i) => i.eventId);
  check(new Set(ids).size === ids.length, "kein Event doppelt (Dedupe ueber eventId)");

  console.log("\n=== 3) Sprechtext ===");
  const spoken = spokenAsapQueue(q);
  console.log("  Text:", spoken);
  check(/Sofort:/.test(spoken), "P0 wird als 'Sofort' angesagt");
  check(/Kanzlei Meier|Anwaltsschreiben/i.test(spoken), "Anwalt-Punkt kommt vor");
  check(/Heute noch:/.test(spoken) && /Krause/.test(spoken), "Beschwerde unter 'Heute noch'");
  check(/Rueckruf|Lehmann/i.test(spoken), "Rueckruf-Punkt kommt vor");
  check(!/€|Euro|\bEUR\b/i.test(spoken), "keine Euro-Angaben im Sprechtext");

  console.log("\n=== 4) Zaehlstaende ===");
  check(q.counts.P0 === 1 && q.counts.P1 === 1 && q.counts.P2 === 1,
    `counts P0/P1/P2 = ${q.counts.P0}/${q.counts.P1}/${q.counts.P2}`);

  await wipeEvents();
  console.log(failed === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${failed} CHECK(S) FEHLGESCHLAGEN`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error("Testlauf abgebrochen:", e?.stack || e);
  try { await wipeEvents(); } catch { /* best effort */ }
  process.exit(1);
});
