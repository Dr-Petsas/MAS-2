import http from "node:http";

// ClonR-Stimmprobe: Resemble Enhance auf der 5090 (Port 8214).
//   https://mas.pickadoc-tunnel.com/voice-enhance  ->  http://192.168.0.246:8214
// VOR express.json mounten. Kein Login — der Mixer im Browser ruft direkt an.

const HOST = process.env.VOICE_ENHANCE_HOST || process.env.QWEN_TTS_HOST || "192.168.0.246";
const PORT = Number(process.env.VOICE_ENHANCE_PORT || 8214);

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function voiceEnhanceProxy(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  const suffix = !req.url || req.url === "/" ? "/" : req.url;
  const headers = { ...req.headers, host: `${HOST}:${PORT}` };
  delete headers.connection;
  delete headers["keep-alive"];
  const proxy = http.request({
    hostname: HOST,
    port: PORT,
    path: suffix.startsWith("/") ? suffix : `/${suffix}`,
    method: req.method,
    headers,
    timeout: 240000,
  }, (pres) => {
    const out = { ...pres.headers };
    delete out.connection;
    out["access-control-allow-origin"] = "*";
    res.writeHead(pres.statusCode || 502, out);
    pres.pipe(res);
  });
  proxy.setTimeout(240000);
  proxy.on("error", () => {
    if (res.headersSent) {
      try { res.end(); } catch { /* egal */ }
      return;
    }
    cors(res);
    res.status(502).json({ detail: `voice-enhance nicht erreichbar (${HOST}:${PORT})` });
  });
  req.pipe(proxy);
}

export default voiceEnhanceProxy;
