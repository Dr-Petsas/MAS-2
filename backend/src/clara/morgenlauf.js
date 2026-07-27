// ============================================================================
// MORGENLAUF (W-STABIL-6, 28.07.2026)
//
// Vor Praxisbeginn laufen automatisch (a) der Faehigkeits-Ping (runClaraHealth
// inkl. Tool-Routen/CF/ElevenLabs/Lena, W-STABIL-3) und (b) das Verkaufskern-
// Register aus F:\Clara-Voice (28 kritische Faelle, SAFE-Modus: kein Push, kein
// Anruf, keine SMS - Tools werden simuliert). Das Ergebnis kommt als EIN
// Push aufs Handy: "Morgenlauf: GRUEN" oder "ROT: <was>", Link auf die
// Status-Seite. So faellt ein kaputter Stand VOR dem ersten Patienten auf,
// nicht mittendrin.
//
// Not-Aus: CLARA_MORGENLAUF=0. Zeit: CLARA_MORGENLAUF_ZEIT (Default "06:30").
// ============================================================================
import { spawn } from "node:child_process";
import { runClaraHealth } from "./health.js";
import { notifyAllDevices } from "./devices.js";
import { log } from "../log.js";

const CLARA_DIR = (process.env.CLARA_VOICE_DIR || "F:/Clara-Voice").trim();
const PYTHON = (process.env.CLARA_PYTHON || "python").trim();
const REGISTER_TIMEOUT_MS = 15 * 60_000;

let laufAktiv = false;

/**
 * Register-Lauf im SAFE-Modus (nur vk-/reg-Faelle, ~2-3 min, echtes LLM +
 * simulierte Tools). Exit-Code 0 = alles gruen (--register-strict).
 */
export function runRegister() {
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawn(PYTHON,
        ["testsuite/run_tests.py", "--no-audio", "--safe",
          "--ids", "vk-", "reg-", "--register-strict"],
        { cwd: CLARA_DIR, windowsHide: true });
    } catch (e) {
      return resolve({ ok: false, error: String(e?.message || e), gruen: null, gesamt: null, fails: [] });
    }
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* schon tot */ }
      out += "\n[morgenlauf] Abbruch: Zeitlimit erreicht";
    }, REGISTER_TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += String(d); });
    child.stderr.on("data", (d) => { out += String(d); });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: String(e?.message || e), gruen: null, gesamt: null, fails: [] });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const m = out.match(/VERKAUFSKERN-REGISTER:\s*(\d+)\/(\d+)\s*gruen/i);
      const fails = [...out.matchAll(/^\s*ROT\s+([\w-]+):/gm)].map((x) => x[1]);
      resolve({
        ok: code === 0 && !!m,
        gruen: m ? Number(m[1]) : null,
        gesamt: m ? Number(m[2]) : null,
        fails,
        code,
        error: m ? "" : "Register-Bilanz nicht in der Ausgabe gefunden",
      });
    });
  });
}

/**
 * Kompletter Morgenlauf: Ping + Register, Ergebnis-Push an alle Geraete.
 * options.push=false unterdrueckt den Push (fuer Handtests, z. B. nachts).
 */
export async function runMorgenlauf(clientId, { publicBaseUrl = "", push = true } = {}) {
  if (laufAktiv) return { ok: false, skipped: true, reason: "lauf_bereits_aktiv" };
  laufAktiv = true;
  const startedAt = new Date().toISOString();
  try {
    const health = await runClaraHealth().catch((e) => (
      { overall: "red", checks: [], error: String(e?.message || e) }));
    const rot = (health.checks || []).filter((c) => !c.ok).map((c) => c.name);
    const pingOk = health.overall === "green";
    const pingTxt = pingOk
      ? `Ping gruen (${(health.checks || []).length} Checks)`
      : `Ping ROT: ${rot.join(", ") || health.error || "?"}`;

    const register = await runRegister();
    const regTxt = register.gesamt != null
      ? `Register ${register.gruen}/${register.gesamt}`
      : `Register nicht messbar (${register.error || "Abbruch"})`;

    const ok = pingOk && register.ok;
    const title = ok ? "Morgenlauf: GRUEN" : "Morgenlauf: ROT";
    const body = [pingTxt, regTxt,
      register.fails?.length ? `rot: ${register.fails.join(", ")}` : ""]
      .filter(Boolean).join(" | ").slice(0, 178);
    const base = (publicBaseUrl || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    const url = base ? `${base}/clara/${encodeURIComponent(clientId)}/status` : "";

    let pushed = { ok: false, reason: "push_deaktiviert" };
    if (push) {
      try {
        pushed = await notifyAllDevices(clientId, { title, body, url });
      } catch (e) {
        pushed = { ok: false, reason: String(e?.message || e) };
      }
    }
    const result = { ok, startedAt, ping: { ok: pingOk, rot }, register, pushed, title, body };
    log.info("morgenlauf.done", { ok, ping: pingOk, register: regTxt, pushed: pushed.ok });
    return result;
  } finally {
    laufAktiv = false;
  }
}
