import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import { decideDelivery, snoozeProaktiv, loadProaktivConfig } from "../src/clara/interruptPolicy.js";

// Unterbrechungs-Politik (Masterplan Phase 5): reine Entscheidungslogik
// (decideDelivery) + Snooze-Lernregel gegen einen isolierten Test-Mandanten.
//   node scripts/test-interrupt-policy.mjs

const C = "zzz-mas2-proaktiv";
let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

async function cleanup() {
  for (const col of ["mas_proaktiv", "mas_config"]) {
    const snap = await masCollection(C, col).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

const P0 = { prio: "P0", source: "rote_liste", eventId: "e-anwalt", spoken: "ein Anwaltsschreiben, Frist morgen" };
const P1 = { prio: "P1", source: "anliegen", eventId: "e-beschwerde", spoken: "Frau K. sehr unzufrieden", aboutPatient: "Frau Krause" };
const P2 = { prio: "P2", source: "rueckrufe", eventId: "e-rueckruf", spoken: "Rueckruf Herr L." };
const P3 = { prio: "P3", source: "post", spoken: "3 ungelesene E-Mails" };

async function run() {
  await cleanup();

  console.log("=== 1) decideDelivery: Prioritaets-Kanaele ===");
  const base = { nowMs: Date.now(), running: [], budgetLeft: 3, snoozed: false, quiet: false, announced: {} };
  check(decideDelivery(P0, base).action === "call", "P0 -> sofortiger Anruf");
  check(decideDelivery(P1, base).action === "push", "P1 in Kalenderluecke -> Push");
  check(decideDelivery(P2, base).action === "briefing_only", "P2 -> wartet aufs Briefing");
  check(decideDelivery(P3, base).action === "skip", "P3 -> nur UI");

  console.log("\n=== 2) Anti-Nerv-Regeln ===");
  check(decideDelivery(P0, { ...base, quiet: true }).action === "call", "P0 auch in Ruhezeit");
  check(decideDelivery(P1, { ...base, quiet: true }).action === "defer", "P1 in Ruhezeit -> warten");
  check(decideDelivery(P1, { ...base, snoozed: true }).action === "defer", "P1 bei Snooze -> warten");
  check(decideDelivery(P1, { ...base, budgetLeft: 0 }).action === "briefing_only", "P1 ohne Budget -> Briefing");
  check(decideDelivery(P0, { ...base, announced: { "e-anwalt": { at: 1 } } }).action === "skip", "schon gemeldet -> nie doppelt");

  console.log("\n=== 3) Behandlung laeuft ===");
  const running = [{ patientId: "pat-1", patientName: "Frau Krause", startMs: 0, endMs: Date.now() + 600000 }];
  check(decideDelivery(P1, { ...base, running }).action === "push", "Anliegen betrifft Patientin im Stuhl -> darf durch");
  const fremd = { ...P1, eventId: "e-fremd", aboutPatient: "Herr Meier" };
  check(decideDelivery(fremd, { ...base, running }).action === "defer", "fremdes Anliegen waehrend Behandlung -> warten");
  check(decideDelivery(P0, { ...base, running }).action === "call", "P0 auch waehrend Behandlung");

  console.log("\n=== 4) Snooze-Lernregel ===");
  const s1 = await snoozeProaktiv(C, { minutes: 30, by: "Test" });
  check(s1.ok && s1.minutes === 30 && !s1.restOfDay, `1. Snooze: 30 Min Pause (${s1.message})`);
  const s2 = await snoozeProaktiv(C, { minutes: 30, by: "Test" });
  check(s2.ok && s2.restOfDay, `2. Snooze am selben Tag: Rest des Tages Ruhe (${s2.message})`);
  check(!/€|Euro/.test(s1.message + s2.message), "keine Euro-Angaben");

  console.log("\n=== 5) Konfig-Defaults ===");
  const cfg = await loadProaktivConfig(C);
  check(cfg.enabled === true, "Default: aktiviert");
  check(cfg.dailyBudget === 3, "Default: 3 Spontan-Meldungen/Tag");
  check(cfg.p0Call === true, "Default: P0 als Anruf");
  await masCollection(C, "mas_config").doc("proaktiv").set({ enabled: false, dailyBudget: 1 });
  const cfg2 = await loadProaktivConfig(C);
  check(cfg2.enabled === false && cfg2.dailyBudget === 1, "Override aus mas_config/proaktiv greift");

  await cleanup();
  console.log(failed === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${failed} CHECK(S) FEHLGESCHLAGEN`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error("Testlauf abgebrochen:", e?.stack || e);
  try { await cleanup(); } catch { /* best effort */ }
  process.exit(1);
});
