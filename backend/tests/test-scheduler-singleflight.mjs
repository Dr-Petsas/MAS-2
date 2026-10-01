/**
 * Regression: setInterval darf denselben Mandanten-Job nicht stapeln.
 *
 * Der Timeout-Vorfall vom 01.10.2026 entstand, weil teure 5-Minuten-Jobs
 * erneut starteten, obwohl ihr vorheriger Lauf noch arbeitete. Dieser Test
 * haelt den ersten Lauf absichtlich offen und erwartet, dass der zweite
 * sofort mit already_running abgewiesen wird.
 */
process.env.MAS_MULTI_TENANT_SCHEDULER = "0";

const { fuerAlleMandanten } = await import("../src/tenants.js");

let starts = 0;
let release;
let started;
const offen = new Promise((resolve) => { release = resolve; });
const istGestartet = new Promise((resolve) => { started = resolve; });

const erster = fuerAlleMandanten("test.singleflight", async () => {
  starts++;
  started();
  await offen;
});
await istGestartet;

const zweiter = await fuerAlleMandanten("test.singleflight", async () => {
  starts++;
});
if (zweiter?.skipped !== "already_running" || starts !== 1) {
  console.error("FEHLER: ueberlappender Scheduler-Lauf wurde nicht abgewehrt", { zweiter, starts });
  release();
  await erster;
  process.exit(1);
}

release();
await erster;

const dritter = await fuerAlleMandanten("test.singleflight", async () => {
  starts++;
});
if (!dritter?.ok || starts !== 2) {
  console.error("FEHLER: Job blieb nach Abschluss dauerhaft gesperrt", { dritter, starts });
  process.exit(1);
}

console.log("PASS: Scheduler-Jobs laufen single-flight und werden danach wieder freigegeben.");
process.exit(0);
