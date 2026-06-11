import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { log } from "../log.js";

// ============================================================================
// Test & Train — Bruecke zur Clara-Voice-Testsuite (Python).
//
// Die Testsuite lebt in F:\Clara-Voice\testsuite (run_tests.py) und schreibt
// Reports nach .run/testsuite/reports/run_*.jsonl|.md. Dieses Modul:
//   * listet/parst historische Laeufe (JSONL → kompakte Zusammenfassung),
//   * startet NEUE Laeufe als Kindprozess (genau einer gleichzeitig — die
//     GPU/Ollama vertraegt keine parallelen Suiten),
//   * liefert Live-Status + Log-Tail fuer die UI.
//
// Der Lauf selbst ist sicher (dryRun/Simulation, siehe testsuite/README.md).
// ============================================================================

const CLARA_DIR = (process.env.CLARA_VOICE_DIR || "F:\\Clara-Voice").trim();
const REPORTS_DIR = path.join(CLARA_DIR, ".run", "testsuite", "reports");
const UI_LOG_DIR = path.join(CLARA_DIR, ".run", "testsuite", "ui_runs");
const PYTHON_BIN = (process.env.TESTSUITE_PYTHON || "python").trim();

// --------------------------------------------------------------------------
// Report-Parsing
// --------------------------------------------------------------------------

function p50(values) {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  return Math.round(v[Math.floor(v.length / 2)]);
}

// Kaltstart-Filter: Ollama (bzw. Whisper/TTS) laedt das Modell beim ersten
// Request frisch in den VRAM (10-20 s). Bei kleinen Laeufen kippt so EIN
// Ausreisser den Median komplett (2 Faelle: 13.917 ms + 749 ms => p50 "14 s").
// Regel: Ein Wert fliegt raus, wenn er >8 s ist UND mehr als 4x ueber dem
// Median der uebrigen Werte liegt. Ist ein Lauf insgesamt langsam (alle Werte
// hoch), bleibt alles drin — das waere ein echtes Problem, kein Kaltstart.
function dropColdStarts(values) {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  if (v.length < 2) return v;
  return v.filter((x, i) => {
    if (x <= 8000) return true;
    const rest = v.filter((_, j) => j !== i).sort((a, b) => a - b);
    const med = rest[Math.floor(rest.length / 2)];
    return x <= 4 * med;
  });
}

function parseRunFile(file) {
  const raw = fs.readFileSync(file, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  let meta = {};
  const results = [];
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj._meta) meta = obj;
    else results.push(obj);
  }
  return { meta, results };
}

function summarize(file) {
  const { meta, results } = parseRunFile(file);
  const passed = results.filter((r) => r.pass).length;
  const byCategory = {};
  for (const r of results) {
    const c = (byCategory[r.category] ||= { total: 0, passed: 0 });
    c.total++;
    if (r.pass) c.passed++;
  }
  const st = fs.statSync(file);
  return {
    file: path.basename(file),
    model: meta.model || "?",
    stt: meta.stt || "?",
    tts: meta.tts || "none",
    audio: meta.audio !== false,
    timestamp: meta.timestamp || "",
    mtime: st.mtimeMs,
    total: results.length,
    passed,
    passRate: results.length ? Math.round((100 * passed) / results.length) : 0,
    byCategory,
    latency: {
      stt_ms_p50: p50(dropColdStarts(results.map((r) => r.stt_ms || 0))),
      ttft_ms_p50: p50(dropColdStarts(results.map((r) => r.llm1_ttft_ms || 0))),
      total_ms_p50: p50(dropColdStarts(results.map((r) => r.total_ms || 0))),
      tts_ttfa_ms_p50: p50(dropColdStarts(results.map((r) => r.tts_ttfa_ms || 0))),
    },
  };
}

export function listRuns({ limit = 50 } = {}) {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => f.startsWith("run_") && f.endsWith(".jsonl"))
    .map((f) => path.join(REPORTS_DIR, f));
  const out = [];
  for (const f of files) {
    try {
      out.push(summarize(f));
    } catch (e) {
      log.warn("testtrain: report unlesbar", { file: f, error: String(e?.message || e) });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, limit);
}

/** Voller Lauf inkl. aller Einzelfaelle (fuer die Detail-Ansicht). */
export function getRun(name) {
  const safe = path.basename(String(name || ""));
  if (!safe.startsWith("run_") || !safe.endsWith(".jsonl")) return null;
  const file = path.join(REPORTS_DIR, safe);
  if (!fs.existsSync(file)) return null;
  const { meta, results } = parseRunFile(file);
  return { summary: summarize(file), meta, results };
}

// --------------------------------------------------------------------------
// Lauf starten / Status
// --------------------------------------------------------------------------

let active = null; // { proc, startedAt, params, logPath, finished, exitCode, reportFile }

function buildArgs(params = {}) {
  const args = [path.join("testsuite", "run_tests.py")];
  if (params.model) args.push("--model", String(params.model));
  if (params.stt && params.stt !== "whisper") args.push("--stt", String(params.stt));
  if (params.tts && params.tts !== "none") args.push("--tts", String(params.tts));
  if (params.noAudio) args.push("--no-audio");
  if (params.noDialogs) args.push("--no-dialogs");
  const limit = Number(params.limit);
  if (Number.isFinite(limit) && limit > 0) args.push("--limit", String(Math.floor(limit)));
  if (Array.isArray(params.ids) && params.ids.length) args.push("--ids", ...params.ids.map(String));
  return args;
}

export function startRun(params = {}, { by = "Superuser" } = {}) {
  if (active && !active.finished) return { ok: false, reason: "run_in_progress" };
  fs.mkdirSync(UI_LOG_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(UI_LOG_DIR, `run_${ts}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const args = ["-u", ...buildArgs(params)];
  const proc = spawn(PYTHON_BIN, args, {
    cwd: CLARA_DIR,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    windowsHide: true,
  });
  const startedAt = Date.now();
  active = { proc, startedAt, params, logPath, finished: false, exitCode: null, reportFile: null, by };

  proc.stdout.on("data", (d) => logStream.write(d));
  proc.stderr.on("data", (d) => logStream.write(d));
  proc.on("close", (code) => {
    active.finished = true;
    active.exitCode = code;
    logStream.end();
    // Neuesten Report finden, der NACH dem Start entstanden ist.
    try {
      const newest = listRuns({ limit: 5 }).find((r) => r.mtime >= startedAt - 5000);
      active.reportFile = newest?.file || null;
    } catch {
      /* Status bleibt ohne Report-Link */
    }
    log.info("testtrain: Lauf beendet", { exitCode: code, report: active.reportFile });
  });
  proc.on("error", (e) => {
    active.finished = true;
    active.exitCode = -1;
    logStream.write(`\nSPAWN-FEHLER: ${e?.message || e}\n`);
    logStream.end();
  });

  log.info("testtrain: Lauf gestartet", { params, by, logPath });
  return { ok: true, startedAt, params, logPath: path.basename(logPath) };
}

export function cancelRun() {
  if (!active || active.finished) return { ok: false, reason: "no_active_run" };
  try {
    active.proc.kill("SIGTERM");
    setTimeout(() => {
      try {
        if (!active.finished) active.proc.kill("SIGKILL");
      } catch { /* schon beendet */ }
    }, 3000);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

export function runStatus({ tailBytes = 4000 } = {}) {
  if (!active) return { running: false };
  let logTail = "";
  try {
    const st = fs.statSync(active.logPath);
    const fd = fs.openSync(active.logPath, "r");
    const start = Math.max(0, st.size - tailBytes);
    const buf = Buffer.alloc(st.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    logTail = buf.toString("utf-8");
  } catch {
    /* Log noch leer */
  }
  return {
    running: !active.finished,
    startedAt: active.startedAt,
    params: active.params,
    exitCode: active.exitCode,
    reportFile: active.reportFile,
    by: active.by,
    elapsedMs: Date.now() - active.startedAt,
    logTail,
  };
}

// --------------------------------------------------------------------------
// Katalog-Info (fuer die UI: was deckt die Suite ab?)
// --------------------------------------------------------------------------

export function catalogInfo() {
  const out = { cases: 0, dialogs: 0, categories: {} };
  try {
    const cat = JSON.parse(fs.readFileSync(path.join(CLARA_DIR, "testsuite", "catalog.json"), "utf-8"));
    for (const c of cat.cases || []) {
      out.cases++;
      out.categories[c.category] = (out.categories[c.category] || 0) + 1;
    }
  } catch { /* Katalog optional */ }
  try {
    const dl = JSON.parse(fs.readFileSync(path.join(CLARA_DIR, "testsuite", "dialogs.json"), "utf-8"));
    out.dialogs = (dl.dialogs || []).length;
  } catch { /* Dialoge optional */ }
  return out;
}
