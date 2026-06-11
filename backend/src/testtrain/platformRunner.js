import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { log } from "../log.js";

// ============================================================================
// Test & Train — Bruecke zur PLATTFORM-Testsuite (Node, pickadoc-live-base).
//
// Die Suite (platform-tests/run.mjs) prueft Cloud Functions, Apps (CalendR/
// SignR/ClonR/CampaignR), Landingpages, SMS und Browser-Flows (Playwright)
// gegen die PRODUKTION mit dem Automations-Test-Tenant. Reports landen als
// platform_<ts>.json|.md mit Agent-Briefing in platform-tests/reports.
// ============================================================================

const SUITE_DIR = (process.env.PLATFORM_TESTS_DIR || "F:\\pickadoc-live-base\\platform-tests").trim();
const REPORTS_DIR = path.join(SUITE_DIR, "reports");
const NODE_BIN = (process.env.PLATFORM_TESTS_NODE || "node").trim();

export const PLATFORM_GROUPS = [
  { id: "functions", name: "Cloud Functions Gesundheit",
    desc: "Login über Firebase Auth funktioniert · doesUserExists antwortet korrekt · ungültige Aufrufe werden sauber abgewiesen (keine Abstürze)" },
  { id: "calendr", name: "CalendR (Termine)",
    desc: "freie Slots werden gefunden (getFreeTimeSlots) · nächster freier Termin · öffentliche Termin-Abfrage · Reservierung anlegen und wieder löschen (nur Testdaten) · Kalender- & Besuchsgrund-Konfiguration vollständig" },
  { id: "signr", name: "SignR (Dokumente)",
    desc: "Dokumentbibliothek abrufbar (listLibraryDocuments) · Dokumenten-Konfiguration des Test-Tenants konsistent" },
  { id: "clonr", name: "ClonR (Video-Clones)",
    desc: "Clone-Konfiguration konsistent · Render-Webhooks erreichbar (Replicate, Wavespeed)" },
  { id: "campaignr", name: "CampaignR (Recall)",
    desc: "Recall-Übersicht liefert Daten (getRecallBucketsSummary) · Kampagnen-Konfiguration vorhanden" },
  { id: "sms", name: "SMS-Versand",
    desc: "verschickt EINE echte Test-SMS über sendSms (smsflatrate.net) an die angegebene Testnummer — ohne Nummer wird übersprungen" },
  { id: "landingpages", name: "Landingpages & Public Web",
    desc: "Praxis-Profilseite, Praxis-App-Login und Bewertungs-Widget sind öffentlich erreichbar (HTTP 200)" },
  { id: "browser", name: "Browser-Flows (Playwright)",
    desc: "echter Chrome-Browser: Login · Dashboard lädt · Navigation in CalendR/SignR/ClonR/CampaignR rendert · Superuser-Bereich für normale Nutzer gesperrt" },
];

export function listPlatformRuns({ limit = 50 } = {}) {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => f.startsWith("platform_") && f.endsWith(".json"));
  const out = [];
  for (const f of files) {
    try {
      const report = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), "utf-8"));
      const groups = {};
      for (const g of report.groups || []) {
        groups[g.id] = {
          name: g.name,
          total: g.checks.length,
          passed: g.checks.filter((c) => c.status === "pass").length,
          failed: g.checks.filter((c) => c.status === "fail").length,
          skipped: g.checks.filter((c) => c.status === "skipped").length,
        };
      }
      out.push({ file: f, meta: report.meta, summary: report.summary, groups });
    } catch (e) {
      log.warn("testtrain: Plattform-Report unlesbar", { file: f, error: String(e?.message || e) });
    }
  }
  out.sort((a, b) => (b.meta?.startedAt || 0) - (a.meta?.startedAt || 0));
  return out.slice(0, limit);
}

export function getPlatformRun(name) {
  const safe = path.basename(String(name || ""));
  if (!safe.startsWith("platform_") || !safe.endsWith(".json")) return null;
  const file = path.join(REPORTS_DIR, safe);
  if (!fs.existsSync(file)) return null;
  const report = JSON.parse(fs.readFileSync(file, "utf-8"));
  const mdFile = file.replace(/\.json$/, ".md");
  const markdown = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, "utf-8") : "";
  return { ...report, markdown };
}

let active = null; // { proc, startedAt, params, logPath, finished, exitCode, reportFile }

export function startPlatformRun(params = {}, { by = "Superuser" } = {}) {
  if (active && !active.finished) return { ok: false, reason: "run_in_progress" };
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(REPORTS_DIR, `_ui_run_${ts}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  // SMS-Testnummer kommt PRO LAUF vom Tester selbst (UI-Feld) — nie aus einer
  // globalen Env, sonst landet die Test-SMS bei jemandem, der gar nicht testet.
  const smsNumber = String(params.smsNumber || "").replace(/[^\d+]/g, "").slice(0, 20);
  const env = { ...process.env };
  delete env.PLATFORM_TEST_SMS_NUMBER;
  if (smsNumber) env.PLATFORM_TEST_SMS_NUMBER = smsNumber;

  const args = ["run.mjs", "--trigger", String(params.trigger || "ui")];
  if (Array.isArray(params.groups) && params.groups.length) {
    const apiGroups = params.groups.filter((g) => g !== "browser");
    if (apiGroups.length && !params.groups.includes("browser")) {
      args.push("--groups", apiGroups.join(","), "--no-browser");
    } else if (!apiGroups.length && params.groups.includes("browser")) {
      args.push("--only", "browser");
    } else if (apiGroups.length) {
      args.push("--groups", params.groups.join(","));
    }
  } else if (params.noBrowser) {
    args.push("--no-browser");
  }

  const proc = spawn(NODE_BIN, args, {
    cwd: SUITE_DIR,
    env,
    windowsHide: true,
  });
  const startedAt = Date.now();
  active = { proc, startedAt, params: { ...params, smsNumber }, logPath, finished: false, exitCode: null, reportFile: null, by };

  proc.stdout.on("data", (d) => logStream.write(d));
  proc.stderr.on("data", (d) => logStream.write(d));
  proc.on("close", (code) => {
    active.finished = true;
    active.exitCode = code;
    logStream.end();
    try {
      const newest = listPlatformRuns({ limit: 3 }).find((r) => (r.meta?.startedAt || 0) >= startedAt - 5000);
      active.reportFile = newest?.file || null;
    } catch { /* Status bleibt ohne Report-Link */ }
    log.info("testtrain: Plattform-Lauf beendet", { exitCode: code, report: active.reportFile });
  });
  proc.on("error", (e) => {
    active.finished = true;
    active.exitCode = -1;
    logStream.write(`\nSPAWN-FEHLER: ${e?.message || e}\n`);
    logStream.end();
  });

  log.info("testtrain: Plattform-Lauf gestartet", { params, by });
  return { ok: true, startedAt, params };
}

export function cancelPlatformRun() {
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

export function platformRunStatus({ tailBytes = 4000 } = {}) {
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
  } catch { /* Log noch leer */ }
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
