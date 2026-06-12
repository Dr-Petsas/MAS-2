import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { log } from "../log.js";

// ============================================================================
// Test & Train — Zwei-LLM-Gespraechssimulation ("Dr. Petsas" ↔ Clara).
//
// Spawnt testsuite/duo_conversation.py in F:\Clara-Voice: Ein Doktor-LLM
// stellt Fragen, Clara antwortet ueber die echte Pipeline mit LIVE-Daten
// (read-only Tools echt, Schreib-Tools dryRun/simuliert). Der Python-Prozess
// schreibt turn-weise status.json; am Ende liegen conversation.mp3 +
// transcript.md im Run-Ordner. Genau EIN Lauf gleichzeitig (GPU).
// ============================================================================

const CLARA_DIR = (process.env.CLARA_VOICE_DIR || "F:\\Clara-Voice").trim();
const DUO_DIR = path.join(CLARA_DIR, ".run", "testsuite", "duo");
const PYTHON_BIN = (process.env.TESTSUITE_PYTHON || "python").trim();

let active = null; // { proc, runId, startedAt, finished, exitCode, logPath, by }

function readStatusFile(runId) {
  try {
    const raw = fs.readFileSync(path.join(DUO_DIR, runId, "status.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function startDuoRun({ turns = 8, noAudio = false, langs = null, team = false } = {}, { by = "Superuser" } = {}) {
  if (active && !active.finished) return { ok: false, reason: "run_in_progress" };
  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(DUO_DIR, runId);
  fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, "run.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const safeTurns = Math.max(3, Math.min(16, Number(turns) || 8));
  const args = ["-u", path.join("testsuite", "duo_conversation.py"),
    "--run-id", runId, "--turns", String(safeTurns)];
  if (noAudio) args.push("--no-audio");
  // Fremdsprachen-Zuege des Doktors (Verkaufsdemo): ["en","fr","es"] -> ein
  // Zug pro Sprache, dazwischen Deutsch. Leeres Array = nur Deutsch.
  if (Array.isArray(langs)) {
    const safeLangs = langs
      .map((l) => String(l || "").trim().toLowerCase())
      .filter((l) => /^[a-z]{2}$/.test(l));
    args.push("--langs", safeLangs.join(","));
  }
  // Team-Stimmen: Nadine/Bianca/Lisa antworten selbst (eigene ElevenLabs-
  // Stimmen) statt dass Clara ihre Ergebnisse nachspricht.
  if (team) args.push("--team");

  const proc = spawn(PYTHON_BIN, args, {
    cwd: CLARA_DIR,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    windowsHide: true,
  });
  active = { proc, runId, startedAt: Date.now(), finished: false, exitCode: null, logPath, by };

  proc.stdout.on("data", (d) => logStream.write(d));
  proc.stderr.on("data", (d) => logStream.write(d));
  proc.on("close", (code) => {
    active.finished = true;
    active.exitCode = code;
    logStream.end();
    log.info("testtrain-duo: Lauf beendet", { runId, exitCode: code });
  });
  proc.on("error", (e) => {
    active.finished = true;
    active.exitCode = -1;
    logStream.write(`\nSPAWN-FEHLER: ${e?.message || e}\n`);
    logStream.end();
  });

  log.info("testtrain-duo: Lauf gestartet", { runId, turns: safeTurns, noAudio, by });
  return { ok: true, runId, startedAt: active.startedAt };
}

export function cancelDuoRun() {
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

/** Status des aktiven (oder zuletzt gestarteten) Laufs inkl. Turn-Liste. */
export function duoRunStatus() {
  if (!active) return { running: false };
  const status = readStatusFile(active.runId);
  return {
    running: !active.finished,
    runId: active.runId,
    startedAt: active.startedAt,
    exitCode: active.exitCode,
    by: active.by,
    elapsedMs: Date.now() - active.startedAt,
    status, // turn-weise Daten aus status.json (oder null ganz am Anfang)
  };
}

/** Historische Laeufe, neueste zuerst (fuer die Run-Liste in der UI). */
export function listDuoRuns({ limit = 20 } = {}) {
  if (!fs.existsSync(DUO_DIR)) return [];
  const out = [];
  for (const name of fs.readdirSync(DUO_DIR)) {
    const status = readStatusFile(name);
    if (!status) continue;
    out.push({
      runId: name,
      state: status.state,
      startedAt: status.startedAt,
      finishedAt: status.finishedAt,
      turns: (status.turns || []).length,
      hasAudio: !!status.mp3,
    });
  }
  out.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return out.slice(0, limit);
}

/** Voller Run (Transkript-Turns) fuer die Detail-Ansicht. */
export function getDuoRun(runId) {
  const safe = path.basename(String(runId || ""));
  const status = readStatusFile(safe);
  if (!status) return null;
  return status;
}

/** MP3 eines Laufs in die Response streamen (Express' sendFile blockt den
 *  Punkt-Ordner ".run" als dotfile, deshalb hier von Hand). */
export function streamDuoAudio(runId, res) {
  const safe = path.basename(String(runId || ""));
  const file = path.join(DUO_DIR, safe, "conversation.mp3");
  if (!fs.existsSync(file)) return false;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Length", String(fs.statSync(file).size));
  fs.createReadStream(file).pipe(res);
  return true;
}

/** Einzel-Zug-MP3 (t01_doktor.mp3 / t01_clara.mp3) streamen — Live-Mithoeren
 *  waehrend des Laufs. Dateiname strikt validiert (kein Pfad-Traversal). */
export function streamDuoTurnAudio(runId, fileName, res) {
  const safeRun = path.basename(String(runId || ""));
  const safeFile = path.basename(String(fileName || ""));
  if (!/^t\d{2}_(doktor|clara|nadine|bianca|lisa)\.mp3$/.test(safeFile)) return false;
  const file = path.join(DUO_DIR, safeRun, safeFile);
  if (!fs.existsSync(file)) return false;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Length", String(fs.statSync(file).size));
  fs.createReadStream(file).pipe(res);
  return true;
}
