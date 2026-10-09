// Live-Ansicht im PlanR-HKP-Planer am Praxis-PC (Chef 09.10.2026): Clara meldet jeden Schritt
// beim Anlegen (Patient, Befund, Planung, angelegt), der Planer mit ?live=1 zeigt ihn sofort.
// Notaus MAS_HKP_LIVE=0; Fenster nicht selbst oeffnen: MAS_HKP_LIVE_OEFFNEN=0.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { log } from "../log.js";

/** Aelter als das zeigt ein frisch geoeffneter Planer nicht mehr an */
const STAND_MAX_ALTER_MS = 10 * 60_000;
const OEFFNEN_PAUSE_MS = 30_000;
/** Fenstertitel des Planers im Live-Modus (zum Nach-vorn-Holen) */
export const LIVE_TITEL = "Clara plant live";

const staende = new Map();
const hoerer = new Map();
const geoeffnet = new Map();

export const liveAus = () => process.env.MAS_HKP_LIVE === "0";
const oeffnenAus = () => process.env.MAS_HKP_LIVE_OEFFNEN === "0" || process.platform !== "win32";
const planerUrl = () => String(process.env.PLANR_LIVE_URL || "http://127.0.0.1:5181/?live=1");

export function livePatient(p) {
  if (!p) return null;
  return {
    id: p.id ? String(p.id) : "", label: String(p.anredeLabel || p.label || ""),
    name: String(p.lastName || ""), vorname: String(p.firstName || ""), geburtsdatum: String(p.birthDate || ""),
  };
}

export function liveStand(clientId) {
  const s = staende.get(clientId);
  return s && Date.now() - s.at < STAND_MAX_ALTER_MS ? s : null;
}

/** Neuer Vorgang bei anderem Patienten oder nach dem Anlegen; sonst wird der laufende ergaenzt. */
export function liveMelden(clientId, teil) {
  if (liveAus() || !clientId) return null;
  try {
    const alt = liveStand(clientId);
    const anderer = teil.patient?.id && alt?.patient?.id && teil.patient.id !== alt.patient.id;
    const neu = !alt || alt.phase === "angelegt" || anderer;
    const basis = neu ? { vorgang: randomUUID(), seq: 0, phase: "patient", patient: null, befund: null, plan: null, hkpId: "", meldung: "" } : alt;
    const stand = { ...basis, ...teil, seq: basis.seq + 1, at: Date.now() };
    staende.set(clientId, stand);
    senden(clientId, stand);
    if (neu) planerZeigen(clientId);
    return stand;
  } catch (e) {
    log.warn?.(`[hkp-live] melden: ${e?.message || e}`);
    return null;
  }
}

function senden(clientId, stand) {
  const zeile = `data: ${JSON.stringify(stand)}\n\n`;
  for (const res of hoerer.get(clientId) || []) {
    try { res.write(zeile); } catch { /* Verbindung weg, close raeumt auf */ }
  }
}

/** Server-Sent Events fuer den Planer; der aktuelle Stand kommt sofort mit. */
export function liveAbonnieren(clientId, req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  const s = liveStand(clientId);
  if (s) res.write(`data: ${JSON.stringify(s)}\n\n`);
  if (!hoerer.has(clientId)) hoerer.set(clientId, new Set());
  hoerer.get(clientId).add(res);
  const puls = setInterval(() => { try { res.write(": puls\n\n"); } catch { /* close raeumt auf */ } }, 20_000);
  req.on("close", () => {
    clearInterval(puls);
    hoerer.get(clientId)?.delete(res);
  });
}

export const liveHoerer = (clientId) => hoerer.get(clientId)?.size || 0;

function starten(befehl, args) {
  try {
    spawn(befehl, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch (e) {
    log.warn?.(`[hkp-live] ${befehl}: ${e?.message || e}`);
  }
}

/** Offener Live-Planer: nach vorn holen; sonst einmal im Standardbrowser oeffnen. */
function planerZeigen(clientId) {
  if (oeffnenAus()) return;
  if (liveHoerer(clientId)) {
    starten("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `$null = (New-Object -ComObject WScript.Shell).AppActivate('${LIVE_TITEL}')`]);
    return;
  }
  const zuletzt = geoeffnet.get(clientId) || 0;
  if (Date.now() - zuletzt < OEFFNEN_PAUSE_MS) return;
  geoeffnet.set(clientId, Date.now());
  log.info?.(`[hkp-live] Planer oeffnen: ${planerUrl()}`);
  starten("explorer.exe", [planerUrl()]);
}

export function _liveZuruecksetzen() {
  staende.clear();
  hoerer.clear();
  geoeffnet.clear();
}
