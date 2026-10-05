// DENS-Karteinotiz über die offene Oberfläche (Kettenerfassung "notiz").
// Gleicher Weg wie der erfolgreiche Test — kein Bank-Zugriff.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXE = path.resolve(__dirname, "../../scripts/DensUiDeliver.exe");

function s(v) {
  return String(v == null ? "" : v).trim();
}

export function writeNoteViaUi({ kurz = "PICKADOC DOKU", text = "", patNr = "", lastName = "" } = {}) {
  const body = s(text);
  if (!body) {
    const err = new Error("text_required");
    err.code = "text_required";
    throw err;
  }
  if (!fs.existsSync(EXE)) {
    const err = new Error("dens_ui_helper_missing");
    err.code = "dens_ui_helper_missing";
    throw err;
  }
  const title = s(kurz).slice(0, 60) || "PICKADOC DOKU";
  const args = ["--kurz", title, "--text", body];
  if (s(patNr)) args.push("--pat", s(patNr));
  if (s(lastName)) args.push("--name", s(lastName));
  const r = spawnSync(EXE, args, {
    windowsHide: true,
    timeout: 35000,
    encoding: "utf8",
  });
  const out = String(r.stdout || "") + String(r.stderr || "");
  if (r.status !== 0) {
    const err = new Error(out.trim() || `dens_ui_exit_${r.status}`);
    err.code = "dens_ui_failed";
    err.detail = out;
    throw err;
  }
  return { ok: true, log: out.trim() };
}
