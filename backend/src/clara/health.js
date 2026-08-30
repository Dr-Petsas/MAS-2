// ============================================================================
// CLARA HEALTH - Live-Stack-Check fuer die Status-Seite (15.06.2026).
//
// Spiegelt die Checks aus F:\MAS-2\clara-smoke.ps1, aber in Node, damit das
// Backend die Status-Seite selbst ausliefern kann (kein Frontend-Deploy noetig).
//
// WICHTIG: Der Tool-Calling-Check laeuft REIN auf LLM-Ebene (Ollama) und fuehrt
// KEINE echten Tools aus -> KEINE Pushes/SMS an die Praxis. Sicher gegen Live.
// ============================================================================
import net from "node:net";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CLARA_PROFILE_ID, DEFAULT_CLIENT_ID } from "../routes/_shared.js";

const OLLAMA_DEFAULT_BASE = "http://127.0.0.1:11434/v1";
const OLLAMA_DEFAULT_MODEL = "qwen3:4b-instruct";
const CLARA_ENV = "F:/Clara-Voice/.env";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Faehigkeits-Ping (W-STABIL-3, 28.07.2026): Quelle fuer den Abgleich
// "Profil-Tool -> existiert die MAS-Route wirklich?". Der Abwesenheits-Vorfall
// (Tool zeigte WOCHEN auf eine nie gemountete Route, Antwort blieb hoeflich
// leer) waere damit am ersten Tag aufgefallen.
// W-MANDANT-3: Der Pfad folgt dem konfigurierten Profil (CLARA_PROFILE_ID,
// heute clara_meddent) statt einem fest getippten meddent-Pfad.
const CLARA_PROFILE_PATH = (process.env.CLARA_PROFILE_PATH
  || `F:/Clara-Voice-dev/profiles/${CLARA_PROFILE_ID}/profile.json`).trim();
// Alle Cloud Functions, die das MAS wirklich aufruft (cfProxy, agentBooking,
// sophieBilling). OPTIONS-Anfrage = keine Ausfuehrung, nur Erreichbarkeit.
const CF_NAMES = [
  "getFreeTimeSlots", "createAppointment", "updateOrCancelAppointment",
  "agentGetDoctorAbsences", "agentFindPatientAppointments",
  "agentCancelAppointmentById", "masSearchPatients", "masBookAppointment",
  "masSophieBilling",
];
const WORKER_LOG_DIRS = [
  { dir: "F:/MAS-2/logs", re: /^clara_.*\.err\.log$/ },
  { dir: "F:/Clara-Voice", re: /^_worker.*\.err\.log$/ },
  { dir: "F:/Clara-Voice-dev", re: /^_worker.*\.err\.log$/ },
  // Vom Umschalter gestartete Worker (DEV/Live/V6) protokollieren hierhin.
  // Seit W-STABIL-5 pro Start zeitgestempelt (live-JJJJMMTT-HHMMSS.err.log);
  // die alten festen Namen bleiben als Altbestand mit abgedeckt.
  { dir: "F:/Clara-Voice/.run/switch", re: /^(live|v6|dev)(-\d{8}-\d{4,6})?\.err\.log$/ },
];

async function readLlmConfig() {
  let model = OLLAMA_DEFAULT_MODEL;
  let base = OLLAMA_DEFAULT_BASE;
  try {
    const txt = await fs.readFile(CLARA_ENV, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      let m = line.match(/^\s*LIVEAVATAR_LLM_MODEL\s*=\s*(.+?)\s*$/);
      if (m) model = m[1].trim();
      m = line.match(/^\s*LIVEAVATAR_LLM_BASE_URL\s*=\s*(.+?)\s*$/);
      if (m) base = m[1].trim();
    }
  } catch { /* defaults */ }
  return { model, base };
}

function checkTcp(port, host = "127.0.0.1", timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; try { sock.destroy(); } catch { /**/ } resolve(ok); } };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, host);
  });
}

function isLocalOllama(base) {
  const b = String(base || "").toLowerCase();
  return b.includes("127.0.0.1:11434") || b.includes("localhost:11434");
}

async function checkLlmModel(model, base) {
  try {
    if (isLocalOllama(base)) {
      const r = await fetch("http://127.0.0.1:11434/api/ps", { signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      const entries = j?.models || [];
      const names = entries.map((m) => m.name);
      const entry = entries.find((m) => m.name === model);
      let ok = !!entry;
      const loaded = names.length ? names.join(", ") : "(keins)";
      let detail = `erwartet '${model}'; geladen: ${loaded}`;
      let fix = `ollama run ${model}  (laedt + haelt warm); .env LIVEAVATAR_LLM_MODEL pruefen`;
      // Kontextfenster-Wache (Vorfall 16.06.2026): Fenster < Prompt => Ollama
      // schneidet System-Prompt + Tools ab, Clara antwortet nur noch leer.
      const ctx = Number(entry?.context_length || 0);
      if (entry && ctx) {
        detail += `; Kontextfenster ${ctx}`;
        if (ctx < 32768) {
          ok = false;
          detail += " (< 32768 - Leer-Turn-Gefahr, Vorfall 16.06.)";
          fix = "setx OLLAMA_CONTEXT_LENGTH 32768 und Ollama neu starten";
        }
      }
      return { ok, detail, fix };
    }
    const r = await fetch(`${base.replace(/\/+$/, "")}/models`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const ids = (j?.data || []).map((m) => m.id);
    const ok = ids.includes(model);
    const available = ids.length ? ids.join(", ") : "(keins)";
    return { ok, detail: `erwartet '${model}' via ${base}; verfuegbar: ${available}`,
      fix: `vLLM auf ${base} pruefen; Tailscale/VPN aktiv?` };
  } catch (e) {
    if (isLocalOllama(base)) {
      return { ok: false, detail: "Ollama nicht erreichbar (11434)", fix: "Ollama-App starten" };
    }
    return { ok: false, detail: `LLM nicht erreichbar: ${base}`, fix: "vLLM-Server pruefen; Tailscale/VPN aktiv?" };
  }
}

async function checkToolCalling(model, base) {
  // Reiner LLM-Aufruf mit einem Test-Tool. KEINE echte Ausfuehrung.
  //
  // Das heutige Datum MUSS mit in den System-Prompt (27.07.2026): ohne es kann
  // das Modell das Pflichtfeld 'date' nicht fuellen und fragt hoeflich zurueck
  // ("welches Datum ist morgen?") statt das Tool zu rufen. Die Pruefung meldete
  // daraufhin faelschlich den 1011c18-Fehler, obwohl Clara live einwandfrei
  // Tools rief - sie bekommt das Datum naemlich immer mitgeliefert. Der Check
  // muss dieselbe Ausgangslage schaffen wie der echte Clara-Prompt.
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    model, stream: false, max_tokens: 80, temperature: 0.3,
    messages: [
      { role: "system", content: `Du bist ein Praxis-Assistent. Heute ist ${today}. Nutze fuer Kalenderfragen das passende Tool und fuelle Datumsangaben selbst im Format JJJJ-MM-TT aus.` },
      { role: "user", content: "Was habe ich morgen fuer Termine?" },
    ],
    tools: [{
      type: "function",
      function: {
        name: "get_day_appointments",
        description: "Liefert die Termine eines Tages.",
        parameters: {
          type: "object",
          properties: { date: { type: "string", description: "Tag im Format JJJJ-MM-TT" } },
          required: ["date"],
        },
      },
    }],
  };
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json();
    const tc = j?.choices?.[0]?.message?.tool_calls;
    if (tc && tc.length >= 1) {
      return { ok: true, detail: `Modell waehlte Tool '${tc[0].function?.name}'`, fix: "" };
    }
    return { ok: false, detail: "Modell lieferte KEINEN tool_call (nur Text) -> exakt der 1011c18-Fehler",
      fix: "Voll-Gate: tools\\release_gate.ps1 -Full; letzten Tool-Commit per git revert pruefen" };
  } catch (e) {
    return { ok: false, detail: `LLM-Aufruf fehlgeschlagen: ${String(e?.message || e)}`,
      fix: "Ollama-App / Modell pruefen" };
  }
}

// ── Faehigkeits-Ping (W-STABIL-3) ───────────────────────────────────────────

/** Alle im Quelltext gemounteten Routen (Methode+Pfad), wie route-inventory. */
async function mountedRoutes() {
  const src = path.join(__dirname, "..");
  const files = [path.join(src, "server.js")];
  try {
    for (const f of await fs.readdir(path.join(src, "routes"))) {
      if (f.endsWith(".js")) files.push(path.join(src, "routes", f));
    }
  } catch { /* routes-Ordner fehlt nie */ }
  const rx = /^\s*(?:app|router)\.(get|post|put|patch|delete|all)\(\s*["'`]([^"'`]+)["'`]/;
  const out = [];
  for (const file of files) {
    let txt = "";
    try { txt = await fs.readFile(file, "utf8"); } catch { continue; }
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(rx);
      if (m) out.push({ method: m[1].toUpperCase(), path: m[2] });
    }
  }
  return out;
}

function compileRoute(r) {
  const rxPath = r.path.split("/").map((seg) => {
    if (seg.startsWith(":")) return "[^/]+";
    return seg.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "*" ? ".*" : `\\${c}`));
  }).join("/");
  return { method: r.method, rx: new RegExp(`^${rxPath}/?$`) };
}

/** Jedes aktivierte Profil-Tool muss auf eine wirklich gemountete Route zeigen. */
export async function checkToolRoutes(profilePath = CLARA_PROFILE_PATH) {
  let prof;
  try {
    prof = JSON.parse(await fs.readFile(profilePath, "utf8"));
  } catch (e) {
    return { ok: false, detail: `Clara-Profil nicht lesbar: ${profilePath}`,
      fix: "CLARA_PROFILE_PATH pruefen (Clara-Voice-Repo vorhanden?)" };
  }
  const tools = (prof?.custom_tools || []).filter((t) => t && t.enabled !== false && t.url);
  if (!tools.length) {
    return { ok: false, detail: "Profil enthaelt keine Tools mit URL", fix: "profile.json pruefen" };
  }
  const routes = (await mountedRoutes()).map(compileRoute);
  const missing = [];
  for (const t of tools) {
    let u;
    try { u = new URL(String(t.url)); } catch { missing.push(`${t.name}: URL unlesbar`); continue; }
    const meth = String(t.method || "POST").toUpperCase();
    const hit = routes.some((r) => (r.method === meth || r.method === "ALL") && r.rx.test(u.pathname));
    if (!hit) missing.push(`${t.name} -> ${meth} ${u.pathname}`);
  }
  const ok = missing.length === 0;
  return { ok,
    detail: ok ? `${tools.length}/${tools.length} Tool-Routen im MAS vorhanden`
      : `FEHLT im MAS: ${missing.join("; ")}`,
    fix: ok ? "" : "Route in src/routes/* anlegen bzw. Tool-URL im Profil korrigieren" };
}

let cfCache = { ts: 0, result: null };
/** Erreichbarkeit der Plattform-Cloud-Functions (OPTIONS = keine Ausfuehrung). */
export async function checkCloudFunctions() {
  if (cfCache.result && Date.now() - cfCache.ts < 10 * 60_000) return cfCache.result;
  const base = (process.env.PICKADOC_REAL_CF_BASE_URL
    || "https://europe-west3-docgenda.cloudfunctions.net").replace(/\/+$/, "");
  const bad = [];
  await Promise.all(CF_NAMES.map(async (name) => {
    // Kaltstart kann > 10 s dauern (masBookAppointment live gemessen):
    // grosszuegiges Zeitfenster + EIN Wiederholungsversuch, sonst Fehlalarm.
    for (let versuch = 0; versuch < 2; versuch++) {
      try {
        const r = await fetch(`${base}/${name}`, { method: "OPTIONS", signal: AbortSignal.timeout(20000) });
        // 404 = nicht deployt. Alles andere (204/200/400/403/405) = Function da.
        if (r.status === 404) bad.push(`${name} (404, nicht deployt)`);
        return;
      } catch (e) {
        if (versuch === 1) bad.push(`${name} (${String(e?.message || e).slice(0, 40)})`);
      }
    }
  }));
  const ok = bad.length === 0;
  const result = { ok,
    detail: ok ? `${CF_NAMES.length}/${CF_NAMES.length} Cloud Functions erreichbar`
      : `Problem: ${bad.join(", ")}`,
    fix: ok ? "" : "aus F:\\pickadoc-live-base deployen: firebase deploy --only functions:<name>" };
  cfCache = { ts: Date.now(), result };
  return result;
}

let elCache = { ts: 0, result: null };
/**
 * ElevenLabs-API (Lisa-Anrufe): Key gueltig UND Lisa-Agent abrufbar.
 * WICHTIG: unser Key ist auf ConvAI-Endpunkte beschraenkt (/v1/user liefert
 * 401, obwohl Lisa einwandfrei anruft - live gemessen 28.07.2026). Deshalb
 * wird GENAU der Endpunkt geprueft, den Lisa wirklich braucht: der Agent.
 */
export async function checkElevenLabs() {
  if (elCache.result && Date.now() - elCache.ts < 5 * 60_000) return elCache.result;
  const key = (process.env.ELEVENLABS_API_KEY || "").trim();
  const agent = (process.env.LISA_AGENT_ID || "").trim();
  let result;
  if (!key) {
    result = { ok: false, detail: "ELEVENLABS_API_KEY fehlt", fix: "backend/.env pruefen" };
  } else if (!agent) {
    result = { ok: false, detail: "LISA_AGENT_ID fehlt (Lisa kann nicht anrufen)",
      fix: "LISA_AGENT_ID in backend/.env setzen" };
  } else {
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agent)}`, {
        headers: { "xi-api-key": key }, signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        result = { ok: true, detail: "API erreichbar, Lisa-Agent abrufbar", fix: "" };
      } else if (r.status === 401 || r.status === 403) {
        result = { ok: false, detail: `API-Antwort ${r.status}: Key ungueltig/abgelaufen`,
          fix: "ElevenLabs-Konto: API-Key pruefen" };
      } else if (r.status === 404) {
        result = { ok: false, detail: "Lisa-Agent nicht gefunden (LISA_AGENT_ID falsch?)",
          fix: "LISA_AGENT_ID gegen ElevenLabs-Konsole pruefen" };
      } else {
        result = { ok: false, detail: `API-Antwort ${r.status}`, fix: "ElevenLabs-Status pruefen" };
      }
    } catch (e) {
      result = { ok: false, detail: `nicht erreichbar: ${String(e?.message || e).slice(0, 60)}`,
        fix: "Internet-Verbindung pruefen" };
    }
  }
  elCache = { ts: Date.now(), result };
  return result;
}

/**
 * Tool-Stoerungen der letzten Stunde (W-STABIL-4 "Fehler-als-Zustand"):
 * vom Voice-Worker gemeldete technische Tool-Ausfaelle. Rot solange die
 * juengste Stoerung < 60 min her ist — heilt sich danach selbst.
 */
export async function checkToolErrors() {
  const clientId = DEFAULT_CLIENT_ID;
  try {
    const { recentToolErrors } = await import("./toolErrors.js");
    const errors = await recentToolErrors(clientId, {});
    if (!errors.length) {
      return { ok: true, detail: "keine gemeldeten Tool-Stoerungen in der letzten Stunde", fix: "" };
    }
    const jungste = errors[0];
    const vorMin = Math.max(0, Math.round((Date.now() - Number(jungste.tsMs || 0)) / 60_000));
    const namen = [...new Set(errors.map((e) => e.tool))].slice(0, 4).join(", ");
    return { ok: false,
      detail: `${errors.length} Stoerung(en) in der letzten Stunde: ${namen} (zuletzt vor ${vorMin} min)`,
      fix: "MAS-Log pruefen (clara.tool_error); GET /clara/tool-errors zeigt Details" };
  } catch (e) {
    return { ok: false, detail: `Stoerungs-Abfrage fehlgeschlagen: ${String(e?.message || e).slice(0, 60)}`,
      fix: "Firestore/MAS pruefen" };
  }
}

/** Lena-STT-Dienst (Doku-Diktat, Behandlungs-Doku). */
export async function checkLena() {
  const url = (process.env.LENA_STT_HEALTH_URL || "http://127.0.0.1:8140/health").trim();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const j = await r.json().catch(() => null);
    const ok = r.ok && j?.ok !== false;
    return { ok,
      detail: ok ? `laeuft (${j?.primary || j?.engine || "?"}, ${j?.device || "?"})`
        : `Antwort ${r.status}`,
      fix: ok ? "" : "F:\\Lena-Voice: Lena-STT-Dienst starten" };
  } catch {
    return { ok: false, detail: "kein Dienst auf 8140 (Doku-Diktat waere tot)",
      fix: "F:\\Lena-Voice: Lena-STT-Dienst starten" };
  }
}

async function newestWorkerLog() {
  let newest = null;
  for (const { dir, re } of WORKER_LOG_DIRS) {
    let files = [];
    try { files = await fs.readdir(dir); } catch { continue; }
    for (const f of files) {
      if (!re.test(f)) continue;
      try {
        const st = await fs.stat(`${dir}/${f}`);
        if (!newest || st.mtimeMs > newest.mtime) newest = { path: `${dir}/${f}`, name: f, mtime: st.mtimeMs };
      } catch { /* skip */ }
    }
  }
  return newest;
}

// W-STABIL-7 "Konfig ins Tag" (28.07.2026): Der wirksame Zustand ausserhalb
// von Git (ElevenLabs-Agenten-Prompt, Firestore-Settings, Env-Schluessel)
// liegt als committeter Snapshot in backend/config-snapshots/. Dieser Check
// laesst den Exporter im Vergleichsmodus laufen: Drift (z. B. jemand aendert
// den Lisa-Prompt in der ElevenLabs-Konsole) macht die Status-Seite ROT und
// kommt ueber den Morgenlauf aufs Handy. Cache 10 min.
// Vergleich ist kanonisch: neue ElevenLabs-Defaultfelder und ephemere
// Tunnel-Hosts (trycloudflare/ngrok) zaehlen NICHT als Drift — sonst ging
// der Morgenlauf nach jedem Stack-Start grundlos ROT.
const konfigCache = { ts: 0, result: null };
export async function checkKonfigDrift() {
  if (konfigCache.result && Date.now() - konfigCache.ts < 10 * 60_000) return konfigCache.result;
  const backendDir = path.resolve(__dirname, "../..");
  const script = path.join(backendDir, "scripts", "konfig-export.mjs");
  const result = await new Promise((resolve) => {
    execFile(process.execPath, [script, "--check"], { cwd: backendDir, timeout: 60_000 },
      (err, stdout = "", stderr = "") => {
        const out = `${stdout}\n${stderr}`;
        if (!err) {
          resolve({ ok: true,
            detail: "wirksame Konfig = Snapshot (ElevenLabs-Agenten, Firestore-Settings, Env-Schluessel)",
            fix: "" });
          return;
        }
        const geaendert = [...out.matchAll(/\[(?:GEAENDERT|NEU)\]\s+(\S+)/g)].map((m) => m[1]);
        if (geaendert.length) {
          resolve({ ok: false, detail: `Drift gegen Snapshot: ${geaendert.join(", ")}`,
            fix: "node scripts/konfig-export.mjs laufen lassen, Aenderung pruefen + committen (oder in der Quelle zuruecknehmen)" });
        } else {
          resolve({ ok: false,
            detail: `Konfig-Pruefung fehlgeschlagen: ${String(err.message || err).slice(0, 140)}`,
            fix: "node scripts/konfig-export.mjs --check von Hand laufen lassen" });
        }
      });
  });
  konfigCache.ts = Date.now();
  konfigCache.result = result;
  return result;
}

// W-STABIL-7: Release = Versionspaar. Immer gruen (reine Anzeige), aber auf
// der Status-Seite steht, WELCHER Stand wirklich laeuft — inkl. "-dirty",
// wenn unkommittierte Aenderungen im Arbeitsverzeichnis liegen.
function gitDescribe(dir) {
  return new Promise((resolve) => {
    execFile("git", ["describe", "--tags", "--always", "--dirty"], { cwd: dir, timeout: 8000 },
      (err, stdout) => resolve(err ? "unbekannt" : String(stdout).trim()));
  });
}
export async function checkVersionsstand() {
  const [mas, clara] = await Promise.all([
    gitDescribe("F:/MAS-2"), gitDescribe("F:/Clara-Voice-dev"),
  ]);
  let snap = "Konfig-Snapshot fehlt";
  try {
    const st = await fs.stat(path.resolve(__dirname, "../../config-snapshots/elevenlabs-agent-lisa.json"));
    snap = `Konfig-Snapshot vom ${new Date(st.mtimeMs).toISOString().slice(0, 10)}`;
  } catch { /* fehlt */ }
  return { ok: true, detail: `MAS ${mas} | Clara ${clara} | ${snap}`, fix: "" };
}

async function checkWorker() {
  // Betriebsstand seit 14.08.2026: DEV (8093). Live (8091) und V6 (8092)
  // sind Rueckweg/Test - nie mehr als einer (siehe clara-switch.ps1).
  const [liveUp, v6Up, devUp] = await Promise.all([checkTcp(8091), checkTcp(8092), checkTcp(8093)]);
  const n = [liveUp, v6Up, devUp].filter(Boolean).length;
  const portUp = n >= 1;
  const which = n > 1 ? "ACHTUNG: mehrere Clara-Staende gleichzeitig"
    : devUp ? "Clara DEV (8093)"
      : liveUp ? "Clara LIVE-Rueckweg (8091)"
        : v6Up ? "V6-Testinstanz (8092)"
          : "kein Worker-Port";
  const log = await newestWorkerLog();
  let registered = false;
  let logInfo = "kein Worker-Log gefunden";
  if (log) {
    try {
      const txt = await fs.readFile(log.path, "utf8");
      registered = txt.includes("registered worker");
      logInfo = `${log.name}: ${registered ? "registered worker OK" : "NICHT registriert"}`;
    } catch { logInfo = `${log.name}: nicht lesbar`; }
  }
  const ok = portUp && registered && n === 1;
  return { ok, detail: `${which} ${portUp ? "lauscht" : "tot"} | ${logInfo}`,
    fix: "Umschalter /m/cx7.html nutzen oder clara-switch.ps1 -Mode dev; Worker-Log auf Traceback pruefen" };
}

export async function runClaraHealth() {
  const { model, base } = await readLlmConfig();
  const checks = [];

  checks.push({ name: "MAS-2 Backend", ok: true, detail: "laeuft (beantwortet diese Anfrage)", fix: "" });

  const pub = (process.env.PUBLIC_BASE_URL || "").trim();
  const tunnelOk = pub.startsWith("https://");
  checks.push({ name: "Cloudflare-Tunnel", ok: tunnelOk,
    detail: pub ? pub : "PUBLIC_BASE_URL nicht gesetzt",
    fix: "start-cloudflare-tunnel.ps1 starten" });

  const sfu = await checkTcp(7880);
  checks.push({ name: "LiveKit SFU (7880)", ok: sfu, detail: sfu ? "lauscht" : "kein Listener",
    fix: "livekit-server.exe via start-mas-stack.ps1 starten" });

  // Tool-Calling ZUERST: der Aufruf laedt das Modell, danach zeigt /api/ps
  // verlaesslich Modell + Kontextfenster (sonst Fehlalarm nach Leerlauf).
  checks.push({ name: "Tool-Calling (LLM)", ...(await checkToolCalling(model, base)) });
  checks.push({ name: isLocalOllama(base) ? "LLM Modell (lokal)" : "LLM Modell (remote)", ...(await checkLlmModel(model, base)) });
  checks.push({ name: "Clara Worker", ...(await checkWorker()) });

  // Faehigkeits-Ping (W-STABIL-3): klopft alles an, woran Clara-Funktionen
  // wirklich haengen - Profil-Tool-Routen, Plattform-CFs, ElevenLabs, Lena.
  checks.push({ name: "Tool-Routen (Profil -> MAS)", ...(await checkToolRoutes()) });
  checks.push({ name: "Plattform Cloud Functions", ...(await checkCloudFunctions()) });
  checks.push({ name: "ElevenLabs (Lisa/TTS)", ...(await checkElevenLabs()) });
  checks.push({ name: "Lena-STT (Doku)", ...(await checkLena()) });
  checks.push({ name: "Tool-Stoerungen (60 min)", ...(await checkToolErrors()) });

  // W-STABIL-7: Konfig-Drift + sichtbarer Versionsstand.
  checks.push({ name: "Konfig-Drift (ElevenLabs/Firestore/Env)", ...(await checkKonfigDrift()) });
  checks.push({ name: "Versionsstand", ...(await checkVersionsstand()) });

  const overall = checks.every((c) => c.ok) ? "green" : "red";
  return { overall, ts: new Date().toISOString(), model, checks };
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function statusPageHtml(clientId) {
  const cid = esc(clientId || "");
  return `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Clara - System-Status</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background:#0f1115; color:#e7e9ee; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:560px; margin:0 auto; padding:22px 16px 40px; }
  h1 { font-size:19px; margin:0 0 2px; }
  .sub { color:#9aa3b2; font-size:13px; margin-bottom:18px; }
  .overall { border-radius:16px; padding:18px 20px; margin-bottom:16px; display:flex;
    align-items:center; gap:14px; font-size:18px; font-weight:700; }
  .overall.green { background:rgba(34,197,94,.14); color:#86efac; border:1px solid rgba(34,197,94,.35); }
  .overall.red   { background:rgba(239,68,68,.14); color:#fca5a5; border:1px solid rgba(239,68,68,.40); }
  .overall.load  { background:rgba(148,163,184,.12); color:#cbd5e1; border:1px solid rgba(148,163,184,.3); }
  .dot { width:14px; height:14px; border-radius:50%; flex:0 0 auto; }
  .green .dot { background:#22c55e; } .red .dot { background:#ef4444; } .load .dot { background:#94a3b8; }
  .card { background:#171a21; border:1px solid #232733; border-radius:14px; padding:14px 16px; margin-bottom:10px; }
  .card .row { display:flex; align-items:center; gap:12px; }
  .badge { font-size:11px; font-weight:800; letter-spacing:.04em; padding:4px 9px; border-radius:999px; flex:0 0 auto; }
  .badge.ok { background:rgba(34,197,94,.16); color:#86efac; }
  .badge.bad{ background:rgba(239,68,68,.16); color:#fca5a5; }
  .name { font-weight:650; font-size:15px; }
  .detail { color:#9aa3b2; font-size:13px; margin-top:5px; word-break:break-word; }
  .fix { color:#fbbf24; font-size:12.5px; margin-top:7px; }
  .bar { display:flex; gap:10px; align-items:center; margin:8px 0 18px; }
  button { background:#2563eb; color:#fff; border:0; border-radius:10px; padding:10px 16px;
    font-size:14px; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.55; cursor:default; }
  .meta { color:#6b7280; font-size:12px; }
</style></head>
<body><div class="wrap">
  <h1>Clara - System-Status</h1>
  <div class="sub">Live-Selbsttest des Sprach-Stacks${cid ? " (" + cid + ")" : ""}. Aktualisiert sich automatisch.</div>
  <div id="overall" class="overall load"><span class="dot"></span><span id="overallText">Pruefe...</span></div>
  <div class="bar">
    <button id="refresh" onclick="load()">Jetzt neu pruefen</button>
    <span class="meta" id="meta"></span>
  </div>
  <div id="checks"></div>
<script>
async function load() {
  const btn = document.getElementById('refresh');
  const ov = document.getElementById('overall');
  const ovt = document.getElementById('overallText');
  btn.disabled = true; ov.className = 'overall load'; ovt.textContent = 'Pruefe...';
  try {
    const r = await fetch('/clara/health', { cache: 'no-store' });
    const d = await r.json();
    const green = d.overall === 'green';
    ov.className = 'overall ' + (green ? 'green' : 'red');
    ovt.textContent = green ? 'GRUEN - Clara ist startklar.' : 'ROT - mindestens ein Problem (siehe unten).';
    const host = document.getElementById('checks');
    host.innerHTML = '';
    for (const c of d.checks) {
      const card = document.createElement('div'); card.className = 'card';
      const fix = (!c.ok && c.fix) ? '<div class="fix">Fix: ' + escapeHtml(c.fix) + '</div>' : '';
      card.innerHTML =
        '<div class="row"><span class="badge ' + (c.ok ? 'ok' : 'bad') + '">' + (c.ok ? 'GRUEN' : 'ROT') + '</span>' +
        '<span class="name">' + escapeHtml(c.name) + '</span></div>' +
        '<div class="detail">' + escapeHtml(c.detail) + '</div>' + fix;
      host.appendChild(card);
    }
    document.getElementById('meta').textContent = 'Modell: ' + (d.model || '?') + ' - Stand: ' + new Date(d.ts).toLocaleTimeString('de-DE');
  } catch (e) {
    ov.className = 'overall red'; ovt.textContent = 'Status-Abruf fehlgeschlagen: ' + (e && e.message || e);
  } finally { btn.disabled = false; }
}
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);}); }
load();
setInterval(load, 15000);
</script>
</div></body></html>`;
}
