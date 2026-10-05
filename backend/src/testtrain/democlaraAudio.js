import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Test & Train — DemoClara Audiotraining.
//
// Liest die zentralen WAV-/Skript-Aufnahmen der Erlebnis-Demo. DemoClara
// schreibt nach backend/data/testtrain/democlara-audio (eine Session =
// Manifest-JSON + Ordner mit seg_*.wav, session.wav, script.md). Aeltere
// lokale Kopien unter Pickadoc-Demo\.run\call_transcripts bleiben lesbar.
// ============================================================================

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CENTRAL = (process.env.DEMOCLARA_AUDIOTRAIN_DIR || "").trim()
  || path.resolve(HERE, "..", "..", "data", "testtrain", "democlara-audio");
const LEGACY = (process.env.DEMOCLARA_AUDIOTRAIN_LEGACY || "").trim()
  || "F:\\Pickadoc-Demo\\demo-clara\\.run\\call_transcripts";

const FILE_OK = /^(session\.wav|script\.md|seg_\d{3}_(user|assistant)\.wav)$/;

function roots() {
  const out = [];
  for (const r of [CENTRAL, LEGACY]) {
    if (r && fs.existsSync(r) && !out.includes(r)) out.push(r);
  }
  return out;
}

function safeId(raw) {
  return String(raw || "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 120);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function previewOf(data) {
  const turns = Array.isArray(data?.turns) ? data.turns : [];
  const user = turns.find((t) => t.role === "user" && t.text);
  const any = turns.find((t) => t.text);
  return String((user || any)?.text || "").slice(0, 180);
}

function summarize(data, file) {
  const folder = path.join(path.dirname(file), data.id || path.basename(file, ".json"));
  const hasSession = fs.existsSync(path.join(folder, "session.wav"));
  const hasScript = fs.existsSync(path.join(folder, "script.md"));
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch { /* ignore */ }
  return {
    id: data.id || path.basename(file, ".json"),
    room: data.room || "",
    profile_id: data.profile_id || "",
    assistant_name: data.assistant_name || "",
    started_at: data.started_at || "",
    ended_at: data.ended_at || "",
    end_reason: data.end_reason || "",
    turn_count: data.turn_count || (data.turns || []).length,
    has_session_wav: hasSession || !!data.has_session_wav,
    has_script: hasScript || !!data.has_script,
    preview: previewOf(data),
    mtime,
  };
}

function findManifest(id) {
  const safe = safeId(id);
  if (!safe) return null;
  for (const root of roots()) {
    const file = path.join(root, `${safe}.json`);
    if (fs.existsSync(file)) return { root, file, id: safe };
  }
  return null;
}

export function listDemoClaraSessions({ limit = 80 } = {}) {
  const seen = new Set();
  const out = [];
  for (const root of roots()) {
    let names = [];
    try { names = fs.readdirSync(root); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(root, name);
      const data = readJson(file);
      if (!data || typeof data !== "object") continue;
      const id = data.id || name.slice(0, -5);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(summarize(data, file));
    }
  }
  out.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  return out.slice(0, Math.max(1, Math.min(200, Number(limit) || 80)));
}

export function getDemoClaraSession(id) {
  const found = findManifest(id);
  if (!found) return null;
  const data = readJson(found.file);
  if (!data) return null;
  const folder = path.join(found.root, found.id);
  let script = "";
  const scriptPath = path.join(folder, "script.md");
  if (fs.existsSync(scriptPath)) {
    try { script = fs.readFileSync(scriptPath, "utf-8"); } catch { /* ignore */ }
  }
  if (!script && Array.isArray(data.turns)) {
    const name = data.assistant_name || "Clara";
    script = data.turns.map((t) => {
      const who = t.role === "user" ? "Team" : name;
      return `## ${t.seq || "?"} ${who}\n\n${t.text || "—"}\n`;
    }).join("\n");
  }
  return {
    ...data,
    id: data.id || found.id,
    script,
    has_session_wav: fs.existsSync(path.join(folder, "session.wav")),
    has_script: !!script,
  };
}

export function streamDemoClaraFile(id, fileName, res) {
  const found = findManifest(id);
  if (!found) return false;
  const safeFile = path.basename(String(fileName || ""));
  if (!FILE_OK.test(safeFile)) return false;
  const file = path.join(found.root, found.id, safeFile);
  if (!fs.existsSync(file)) return false;
  const ext = path.extname(safeFile).toLowerCase();
  const type = ext === ".wav" ? "audio/wav"
    : ext === ".md" ? "text/markdown; charset=utf-8"
    : "application/octet-stream";
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Length", String(fs.statSync(file).size));
  if (ext === ".wav" || ext === ".md") {
    res.setHeader("Content-Disposition", `inline; filename="${safeFile}"`);
  }
  fs.createReadStream(file).pipe(res);
  return true;
}
