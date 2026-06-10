// Minimal structured logger: one JSON object per line, so Cloud Run / log
// aggregators can parse and index fields (level, msg, requestId, clientId,
// status, ms). No dependency, no PII by policy — callers pass only safe fields
// (ids, counts, durations), never names / e-mail bodies / search terms.
//
// Levels map to severities Cloud Logging understands.

const LEVELS = { debug: "DEBUG", info: "INFO", warn: "WARNING", error: "ERROR" };

function emit(level, msg, fields) {
  let rec;
  try {
    rec = { ts: new Date().toISOString(), severity: LEVELS[level] || "INFO", msg: String(msg), ...(fields || {}) };
    // Errors may carry an Error object — serialise message + stack only.
    if (rec.err instanceof Error) rec.err = { message: rec.err.message, stack: rec.err.stack };
  } catch {
    rec = { ts: new Date().toISOString(), severity: "ERROR", msg: "log_serialise_failed" };
  }
  let line;
  try {
    line = JSON.stringify(rec);
  } catch {
    line = JSON.stringify({ ts: rec.ts, severity: rec.severity, msg: rec.msg });
  }
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
}

export const log = {
  debug: (msg, fields) => emit("debug", msg, fields),
  info: (msg, fields) => emit("info", msg, fields),
  warn: (msg, fields) => emit("warn", msg, fields),
  error: (msg, fields) => emit("error", msg, fields),
};

export default log;
