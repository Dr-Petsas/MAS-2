// Hybrid-OCR für gescannte/fotografierte Unterlagen. Zwei Wege, in dieser
// Reihenfolge — beide halten das Bild LOKAL (DSGVO):
//
//  1) Vision-Endpoint (optional, per Env): ein multimodales Modell auf dem
//     5090-Server (z. B. Qwen-VL via vLLM) transkribiert das Bild. Bessere
//     Qualität bei Layout/Handschrift. Nur aktiv, wenn MAS_OCR_VISION_BASE_URL
//     gesetzt ist. qwen3.6:35b-a3b (das Schreib-Modell) ist ein TEXT-Modell und
//     kann KEIN Bild lesen — dafür braucht es ein separates VL-Modell.
//  2) Tesseract (immer verfügbar): reines WASM, kein System-Binary, kein GPU.
//     Läuft rein lokal; nur die Sprach-Trainingsdaten werden einmalig geladen
//     (kein Patienteninhalt).
//
// Rückgabe immer { ok, text, engine, note? } — nie werfen, damit der Aufrufer
// sauber auf den "bitte Text einfügen"-Hinweis zurückfallen kann.

function visionCfg() {
  const base = String(process.env.MAS_OCR_VISION_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return {
    base,
    model: String(process.env.MAS_OCR_VISION_MODEL || "qwen3-vl").trim(),
    apiKey: String(process.env.MAS_OCR_VISION_API_KEY || "ollama").trim(),
  };
}

const OCR_PROMPT =
  "Transkribiere den gesamten sichtbaren Text dieses Dokuments WORTGETREU. " +
  "Behalte Absätze und Zeilenumbrüche grob bei. Gib NUR den reinen Text zurück — " +
  "keine Beschreibung, keine Einleitung, keine Kommentare. Wenn nichts lesbar ist, antworte mit einem leeren Text.";

async function visionOcr(buffer, contentType = "image/png", timeoutMs = 90000) {
  const c = visionCfg();
  if (!c) return { ok: false, text: "", engine: "vision", note: "kein Vision-Endpoint konfiguriert" };
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
    const text = String(data?.choices?.[0]?.message?.content || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    if (!text) return { ok: false, text: "", engine: "vision", note: "leer" };
    return { ok: true, text, engine: "vision" };
  } catch (e) {
    return { ok: false, text: "", engine: "vision", note: e?.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(t);
  }
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

async function tesseractOcr(buffer, timeoutMs = 90000) {
  if (!looksLikeImage(buffer)) {
    return { ok: false, text: "", engine: "tesseract", note: "kein_bild" };
  }
  const lang = String(process.env.MAS_OCR_LANG || "deu+eng").trim();
  const langPath = String(process.env.MAS_OCR_LANG_PATH || "").trim();
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
  return { vision: !!c, visionModel: c?.model || null, tesseractLang: String(process.env.MAS_OCR_LANG || "deu+eng").trim() };
}
