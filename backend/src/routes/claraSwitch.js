// Clara-Umschalter (/clara-switch/*): schaltet zwischen den Clara-Staenden um:
// Betriebsstand DEV (F:\Clara-Voice-dev, Port 8093), Rueckweg Live
// (F:\Clara-Voice, Port 8091) und Testinstanz V6 (F:\Clara-Voice-v6, Port 8092).
//
// 10.08.2026: "dev" dazugenommen.
// 14.08.2026: DEV ist der dauerhafte Betriebsstand (Auftrag Dr. Petsas).
// Auto-Start und Waechter duerfen NICHT mehr auf Live zurueckziehen.
//
// Warum ueberhaupt umschalten statt parallel betreiben: beide Instanzen
// registrieren sich bei DERSELBEN LiveKit-Cloud fuer den automatischen
// Dispatch. Liefen sie gleichzeitig, verteilte LiveKit die Raeume "clara_*"
// zufaellig auf einen der beiden Worker (Vorfall 17.07.2026). Es darf also
// immer nur EINE laufen. Die eigentliche Arbeit (beenden, pruefen, starten)
// macht F:\Clara-Voice\tools\clara-switch.ps1 — hier ist nur der Ausloeser
// und die Statusabfrage fuer die Handy-Seite.
//
// Eigener Pfad-Prefix /clara-switch (NICHT /clara/...), damit die
// Catch-all-Seite GET /clara/:clientId in routes/clara.js unberuehrt bleibt.
import express from "express";
import net from "node:net";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { log } from "../log.js";

const router = express.Router();

const SWITCH_SCRIPT = process.env.CLARA_SWITCH_SCRIPT || "F:\\Clara-Voice\\tools\\clara-switch.ps1";
const STATE_FILE = process.env.CLARA_SWITCH_STATE || "F:\\Clara-Voice\\.run\\clara-switch.json";
const LOG_DIR = process.env.CLARA_SWITCH_LOGS || "F:\\Clara-Voice\\.run\\switch";
const PORTS = { live: 8091, v6: 8092, dev: 8093 };
const MODI = ["live", "dev", "v6"];
// Kaltstart mit Modell-Prewarm dauert bis ~2 min; danach gilt ein haengender
// Umschaltvorgang als abgestorben und die Seite wird wieder bedienbar.
const SWITCH_STALE_MS = 4 * 60 * 1000;

function probePort(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (open) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(open);
    };
    sock.setTimeout(400);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, "127.0.0.1");
  });
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function currentStatus() {
  const offen = await Promise.all(MODI.map((m) => probePort(PORTS[m])));
  const laufende = MODI.filter((_, i) => offen[i]);
  const state = readState();
  const age = state?.ts ? Date.now() - Date.parse(state.ts) : Number.POSITIVE_INFINITY;
  const inFlight = !!state && ["stopping", "starting"].includes(state.phase) && age < SWITCH_STALE_MS;

  // Mehr als ein offener Port heisst: zwei Staende gleichzeitig am LiveKit-
  // Dispatch. Das ist der Zustand, der am 17.07.2026 jede zweite Sitzung taub
  // gemacht hat - er muss als Konflikt sichtbar werden, nicht als "laeuft".
  let running = "off";
  if (laufende.length > 1) running = "conflict";
  else if (laufende.length === 1) running = laufende[0];
  else if (inFlight) running = "switching";

  return {
    ok: true,
    running,
    busy: inFlight && laufende.length === 0,
    phase: state?.phase || "idle",
    target: state?.target || null,
    message: state?.message || "",
    ts: state?.ts || null,
  };
}

router.get("/clara-switch/status", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await currentStatus());
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

router.post("/clara-switch/set", async (req, res) => {
  const mode = String(req.body?.mode || "").toLowerCase();
  if (![...MODI, "off"].includes(mode)) {
    return res.status(400).json({ ok: false, error: "mode_invalid" });
  }
  if (process.platform !== "win32") {
    return res.status(503).json({ ok: false, error: "windows_only" });
  }
  if (!fs.existsSync(SWITCH_SCRIPT)) {
    return res.status(503).json({ ok: false, error: "switch_script_missing", path: SWITCH_SCRIPT });
  }

  const status = await currentStatus();
  if (status.busy) {
    return res.status(409).json({ ok: false, error: "switch_in_progress", ...status });
  }
  if (status.running === mode) {
    return res.json({ ok: true, accepted: false, alreadyRunning: true, ...status });
  }

  try {
    // Das Skript laeuft bis zu zwei Minuten (Kill, Warten, Start, Prewarm);
    // die Antwort geht sofort raus, die Seite pollt derweil /clara-switch/status.
    // KEIN detached:true — damit startet PowerShell unter Windows in einer
    // versteckten neuen Konsole und stirbt wortlos, bevor die erste Zeile
    // laeuft (hier am 27.07.2026 reproduziert). Stattdessen haengt der Prozess
    // an MAS und schreibt sein Protokoll in eine Datei.
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const out = fs.openSync(`${LOG_DIR}\\switch.log`, "a");
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SWITCH_SCRIPT, "-Mode", mode],
      { detached: false, stdio: ["ignore", out, out], windowsHide: true },
    );
    child.on("exit", (code) => {
      try { fs.closeSync(out); } catch { /* egal */ }
      log.info("clara-switch beendet", { mode, code });
    });
    child.unref();
    log.info("clara-switch angestossen", { mode, from: status.running });
    res.json({ ok: true, accepted: true, target: mode, from: status.running });
  } catch (err) {
    log.error("clara-switch fehlgeschlagen", { mode, err });
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

export default router;
