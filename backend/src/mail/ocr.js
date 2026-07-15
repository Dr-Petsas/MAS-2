// Hybrid-OCR für gescannte/fotografierte Unterlagen. Zwei Wege, in dieser
// Reihenfolge — beide halten das Bild LOKAL (DSGVO):
//
//  1) Vision-Endpoint (optional, per Env): ein multimodales Modell (Qwen-VL)
//     transkribiert das Bild. Bessere Qualität bei Layout/Handschrift. Nur aktiv,
//     wenn MAS_OCR_VISION_BASE_URL gesetzt ist. Das Schreib-Modell qwen3.6 ist ein
//     reines TEXT-Modell und kann KEIN Bild lesen — dafür braucht es ein VL-Modell.
//
//     Zwei Endpoint-Arten:
//       - "ollama": /api/chat mit keep_alive. So bleibt qwen3.6 dauerhaft im vLLM,
//         während das VL-Modell NUR bei Bedarf geladen und danach (keep_alive)
//         automatisch wieder aus dem VRAM entladen wird. Empfohlen fürs 7B-VL.
//       - "openai": /v1/chat/completions (vLLM & Co.) — Modell bleibt geladen.
//     Auto-Erkennung: Port 11434 => ollama; sonst openai. Erzwingbar per
//     MAS_OCR_VISION_KIND=ollama|openai.
//  2) Tesseract (immer verfügbar): reines WASM, kein System-Binary, kein GPU.
//     Läuft rein lokal; nur die Sprach-Trainingsdaten werden einmalig geladen.
//
// Rückgabe immer { ok, text, engine, note? } — nie werfen, damit der Aufrufer
// sauber auf den "bitte Text einfügen"-Hinweis zurückfallen kann.
import fs from "node:fs";

// keep_alive für Ollama parsen: reine Zahl -> Sekunden (0 = sofort entladen),
// sonst Dauer-String ("30s", "5m") unverändert an Ollama durchreichen.
function parseKeepAlive(raw) {
  const s = String(raw ?? "0").trim();
  if (s === "") return 0;
  return /^\d+$/.test(s) ? Number(s) : s;
}

function visionCfg() {
  const base = String(process.env.MAS_OCR_VISION_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  const kindEnv = String(process.env.MAS_OCR_VISION_KIND || "auto").trim().toLowerCase();
  const kind = kindEnv === "ollama" || kindEnv === "openai"
    ? kindEnv
    : (/:11434(\/|$)/.test(base) ? "ollama" : "openai");
  return {
    base,
    kind,
    model: String(process.env.MAS_OCR_VISION_MODEL || "qwen-vl").trim(),
    apiKey: String(process.env.MAS_OCR_VISION_API_KEY || "ollama").trim(),
    // Default 0 = VL-Modell direkt nach der Anfrage aus dem VRAM entladen (Ollama).
    keepAlive: parseKeepAlive(process.env.MAS_OCR_VISION_KEEP_ALIVE),
    // On-demand-Container: URL, die den (gestoppten) VL-Container startet.
    wakeUrl: String(process.env.MAS_OCR_VISION_WAKE_URL || "").trim() || null,
    wakeMethod: String(process.env.MAS_OCR_VISION_WAKE_METHOD || "GET").trim().toUpperCase() === "POST" ? "POST" : "GET",
    // Wie lange auf Bereitschaft warten, während der Container hochfährt (ms).
    startupWaitMs: Math.max(0, Number(process.env.MAS_OCR_VISION_STARTUP_WAIT_MS || 0) || 0),
  };
}

// On-demand-Container anstupsen und auf Bereitschaft warten. No-op, wenn weder
// Wake-URL noch Startup-Wartezeit gesetzt sind (dann verhält sich alles wie
// gegen ein bereits laufendes Endpoint). Der Container STOPPT sich selbst per
// Idle-Timeout (Box-Seite) -> VRAM wird danach automatisch frei.
async function ensureVlAwake(c) {
  if (!c.wakeUrl && c.startupWaitMs <= 0) return;
  if (c.wakeUrl) {
    try { await fetch(c.wakeUrl, { method: c.wakeMethod }); } catch { /* Trigger best-effort */ }
  }
  if (c.startupWaitMs <= 0) return;
  const deadline = Date.now() + c.startupWaitMs;
  const modelsUrl = `${c.base}/models`;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(modelsUrl, { headers: { Authorization: `Bearer ${c.apiKey}` } });
      if (r.ok) return;
    } catch { /* noch nicht bereit */ }
    await new Promise((res) => setTimeout(res, 2000));
  }
}

const OCR_PROMPT =
  "Transkribiere den gesamten sichtbaren Text dieses Dokuments WORTGETREU. " +
  "Behalte Absätze und Zeilenumbrüche grob bei. Gib NUR den reinen Text zurück — " +
  "keine Beschreibung, keine Einleitung, keine Kommentare. Wenn nichts lesbar ist, antworte mit einem leeren Text.";

function cleanReply(text) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

// Ollama-nativ: /api/chat mit images[] + keep_alive (on-demand laden, danach
// per keep_alive automatisch entladen -> VRAM frei für das residente qwen3.6).
async function visionOcrOllama(c, buffer, timeoutMs) {
  const root = c.base.endsWith("/v1") ? c.base.slice(0, -3) : c.base;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${root}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        model: c.model,
        stream: false,
        keep_alive: c.keepAlive,
        options: { temperature: 0, num_predict: 4000 },
        messages: [{ role: "user", content: OCR_PROMPT, images: [buffer.toString("base64")] }],
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return { ok: false, text: "", engine: "vision-ollama", note: `http_${resp.status}` };
    const data = await resp.json().catch(() => null);
    const text = cleanReply(data?.message?.content);
    if (!text) return { ok: false, text: "", engine: "vision-ollama", note: "leer" };
    return { ok: true, text, engine: "vision-ollama" };
  } catch (e) {
    return { ok: false, text: "", engine: "vision-ollama", note: e?.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(t);
  }
}

// OpenAI-kompatibel (vLLM u. a.): /v1/chat/completions mit image_url data-URL.
async function visionOcrOpenai(c, buffer, contentType, timeoutMs) {
  const dataUrl = `data:${contentType || "image/png"};base64,${buffer.toString("base64")}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${c.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        model: c.model,
        temperature: 0,
        max_tokens: 4000,
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return { ok: false, text: "", engine: "vision", note: `http_${resp.status}` };
    const data = await resp.json().catch(() => null);
    const text = cleanReply(data?.choices?.[0]?.message?.content);
    if (!text) return { ok: false, text: "", engine: "vision", note: "leer" };
    return { ok: true, text, engine: "vision" };
  } catch (e) {
    return { ok: false, text: "", engine: "vision", note: e?.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(t);
  }
}

async function visionOcr(buffer, contentType = "image/png", timeoutMs = 90000) {
  const c = visionCfg();
  if (!c) return { ok: false, text: "", engine: "vision", note: "kein Vision-Endpoint konfiguriert" };
  await ensureVlAwake(c);
  return c.kind === "ollama"
    ? visionOcrOllama(c, buffer, timeoutMs)
    : visionOcrOpenai(c, buffer, contentType, timeoutMs);
}

// Grobe Format-Erkennung an den Magic-Bytes. Verhindert, dass abgeschnittene
// oder Nicht-Bild-Daten überhaupt an Tesseract gehen (das wirft sonst teils
// out-of-band und würde den Prozess crashen).
function looksLikeImage(buffer) {
  if (!buffer || buffer.length < 12) return false;
  const b = buffer;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;
  // BMP
  if (b[0] === 0x42 && b[1] === 0x4d) return true;
  // TIFF (II* / MM*)
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00)) return true;
  // WEBP (RIFF....WEBP)
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true;
  return false;
}

// Lokalen langPath finden: explizit per Env, sonst das Arbeitsverzeichnis, WENN
// dort die *.traineddata liegen (backend/deu.traineddata etc.). So bleibt OCR im
// DSGVO-isolierten Netz OFFLINE — kein CDN-Download, kein Hänger bis Timeout.
function resolveLangPath(lang) {
  const explicit = String(process.env.MAS_OCR_LANG_PATH || "").trim();
  if (explicit) return explicit;
  const first = String(lang || "deu").split("+")[0].trim() || "deu";
  try {
    if (fs.existsSync(`${process.cwd()}/${first}.traineddata`)) return process.cwd();
  } catch { /* egal — dann CDN-Default */ }
  return "";
}

async function tesseractOcr(buffer, timeoutMs = 90000) {
  if (!looksLikeImage(buffer)) {
    return { ok: false, text: "", engine: "tesseract", note: "kein_bild" };
  }
  const lang = String(process.env.MAS_OCR_LANG || "deu+eng").trim();
  const langPath = resolveLangPath(lang);
  let worker = null;
  try {
    const { createWorker } = await import("tesseract.js");
    // errorHandler fängt Worker-Fehler, die Tesseract sonst per
    // process.nextTick global wirft (createWorker.js) — würde den Prozess töten.
    const opts = { errorHandler: () => { /* geschluckt, recognize rejectet ohnehin */ } };
    if (langPath) opts.langPath = langPath;
    worker = await createWorker(lang, undefined, opts);
    const recog = worker.recognize(buffer);
    const guard = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs));
    const { data } = await Promise.race([recog, guard]);
    const text = String(data?.text || "").trim();
    if (!text) return { ok: false, text: "", engine: "tesseract", note: "leer" };
    return { ok: true, text, engine: "tesseract" };
  } catch (e) {
    return { ok: false, text: "", engine: "tesseract", note: String(e?.message || e).slice(0, 120) };
  } finally {
    try { await worker?.terminate(); } catch { /* egal */ }
  }
}

/**
 * OCR eines Bild-Buffers. Vision zuerst (falls konfiguriert), sonst Tesseract.
 * @param {Buffer} buffer
 * @param {{ contentType?:string }} [opts]
 * @returns {Promise<{ok:boolean, text:string, engine:string, note?:string}>}
 */
export async function ocrImage(buffer, { contentType } = {}) {
  if (!buffer || !buffer.length) return { ok: false, text: "", engine: "none", note: "leer" };
  if (visionCfg()) {
    const v = await visionOcr(buffer, contentType);
    if (v.ok) return v;
    // Vision konfiguriert aber gescheitert → Tesseract als Fallback.
  }
  return await tesseractOcr(buffer);
}

/** Ist ein Vision-OCR-Endpoint konfiguriert? (für /health-Anzeige) */
export function ocrInfo() {
  const c = visionCfg();
  return {
    vision: !!c,
    visionKind: c?.kind || null,
    visionModel: c?.model || null,
    keepAlive: c ? c.keepAlive : null,
    onDemand: c ? (!!c.wakeUrl || c.startupWaitMs > 0) : null,
    tesseractLang: String(process.env.MAS_OCR_LANG || "deu+eng").trim(),
  };
}
