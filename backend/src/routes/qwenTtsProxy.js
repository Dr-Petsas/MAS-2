import http from "node:http";

// ClonR-TTS hinter dem MAS-Tunnel (30.08.2026).
// Cloud Functions in europe-west3 erreichen 192.168.0.246:8213 nicht.
// Statt eines zweiten Tunnels proxyt MAS:
//   https://mas.pickadoc-tunnel.com/qwen-tts  ->  http://192.168.0.246:8213
//
// VOR express.json mounten, sonst ist der POST-Body schon verbraucht.
// Kein Login: die Function authentifiziert den Aufrufer selbst.

const HOST = process.env.QWEN_TTS_HOST || "192.168.0.246";
const PORT = Number(process.env.QWEN_TTS_PORT || 8213);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").trim();

function browserCorsHeaders(req) {
  const origin = String(req.headers.origin || "").trim();
  const allowed = ALLOWED_ORIGINS === "*"
    || (origin && ALLOWED_ORIGINS.split(",").map((value) => value.trim()).includes(origin));
  return {
    ...(allowed ? { "access-control-allow-origin": ALLOWED_ORIGINS === "*" ? (origin || "*") : origin } : {}),
    vary: "Origin",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
  };
}

export function qwenTtsProxy(req, res) {
  const corsHeaders = browserCorsHeaders(req);
  for (const [name, value] of Object.entries(corsHeaders)) res.setHeader(name, value);
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
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
    timeout: 180000,
  }, (pres) => {
    const out = { ...pres.headers, ...corsHeaders };
    delete out.connection;
    res.writeHead(pres.statusCode || 502, out);
    pres.pipe(res);
  });
  proxy.setTimeout(180000);
  proxy.on("error", () => {
    if (res.headersSent) {
      try { res.end(); } catch { /* egal */ }
      return;
    }
    res.status(502).json({ detail: `qwen-tts nicht erreichbar (${HOST}:${PORT})` });
  });
  req.pipe(proxy);
}

export default qwenTtsProxy;
