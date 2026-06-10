import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Test runner for `npm test`. Discovers every scripts/test-*.mjs, runs each in a
// child process, and aggregates pass/fail by exit code. Each test isolates its
// own zzz-mas2-* tenant and cleans up after itself. Network-dependent tests
// (LLM/IMAP) degrade to offline fallbacks, so they pass without those services.
//
// Requires Firestore credentials (GOOGLE_APPLICATION_CREDENTIALS) — most tests
// touch an isolated test tenant. Set MAIL_DRY_RUN=1 to keep SMTP offline.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PER_TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 180000);

const files = readdirSync(__dirname)
  .filter((f) => /^test-.*\.mjs$/.test(f))
  .sort();

// Allow narrowing to a subset: `node scripts/run-tests.mjs cases nadine`.
const filter = process.argv.slice(2);
const selected = filter.length ? files.filter((f) => filter.some((p) => f.includes(p))) : files;

function runOne(file) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, MAIL_DRY_RUN: process.env.MAIL_DRY_RUN || "1", MAS_BOOKING_DRY_RUN: process.env.MAS_BOOKING_DRY_RUN || "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, PER_TEST_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      const ms = Date.now() - start;
      resolve({ file, code, ms, out });
    });
  });
}

console.log(`Running ${selected.length} test file(s)…\n`);
const results = [];
for (const file of selected) {
  const r = await runOne(file);
  results.push(r);
  const tag = r.code === 0 ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${file} (${(r.ms / 1000).toFixed(1)}s)`);
  if (r.code !== 0) {
    // Show the failing test's output so CI logs are actionable.
    console.log(r.out.split("\n").map((l) => "      " + l).join("\n"));
  }
}

const failed = results.filter((r) => r.code !== 0);
console.log(`\n${failed.length === 0 ? `ALL ${results.length} TEST FILES PASSED` : `${failed.length}/${results.length} TEST FILES FAILED`}`);
process.exit(failed.length ? 1 : 0);
