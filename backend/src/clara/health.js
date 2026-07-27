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

const OLLAMA_DEFAULT_BASE = "http://127.0.0.1:11434/v1";
const OLLAMA_DEFAULT_MODEL = "qwen3:4b-instruct";
const CLARA_ENV = "F:/Clara-Voice/.env";
const WORKER_LOG_DIRS = [
  { dir: "F:/MAS-2/logs", re: /^clara_.*\.err\.log$/ },
  { dir: "F:/Clara-Voice", re: /^_worker.*\.err\.log$/ },
  // Vom Umschalter gestartete Worker (Live wie V6) protokollieren hierhin.
  { dir: "F:/Clara-Voice/.run/switch", re: /^(live|v6)\.err\.log$/ },
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
      const names = (j?.models || []).map((m) => m.name);
      const ok = names.includes(model);
      const loaded = names.length ? names.join(", ") : "(keins)";
      return { ok, detail: `erwartet '${model}'; geladen: ${loaded}`,
        fix: `ollama run ${model}  (laedt + haelt warm); .env LIVEAVATAR_LLM_MODEL pruefen` };
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

async function checkWorker() {
  // Es kann die Live-Clara (Port 8091) ODER die V6-Testinstanz (Port 8092)
  // laufen - nie beide (siehe tools\clara-switch.ps1). Der Check darf die
  // Testinstanz nicht als "Worker tot" melden.
  const [liveUp, v6Up] = await Promise.all([checkTcp(8091), checkTcp(8092)]);
  const portUp = liveUp || v6Up;
  const which = liveUp && v6Up ? "ACHTUNG: Live (8091) UND V6 (8092)"
    : liveUp ? "Live-Clara (8091)"
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
  const ok = portUp && registered && !(liveUp && v6Up);
  return { ok, detail: `${which} ${portUp ? "lauscht" : "tot"} | ${logInfo}`,
    fix: "Umschalter /m/cx7.html nutzen oder start-clara.ps1 neu starten; Worker-Log auf Traceback pruefen" };
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

  checks.push({ name: isLocalOllama(base) ? "LLM Modell (lokal)" : "LLM Modell (remote)", ...(await checkLlmModel(model, base)) });
  checks.push({ name: "Tool-Calling (LLM)", ...(await checkToolCalling(model, base)) });
  checks.push({ name: "Clara Worker", ...(await checkWorker()) });

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
