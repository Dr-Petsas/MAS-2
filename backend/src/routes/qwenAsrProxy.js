import http from "node:http";

// Qwen3-ASR fuer den Stimmklon im Patientenportal.
// https://mas.pickadoc-tunnel.com/qwen-asr -> http://127.0.0.1:8151
// Der Worker bleibt ein eigener Prozess (Clara-Voice, stt_bench/qwen_asr_worker.py).
// VOR express.json mounten, sonst ist der Upload-Body schon verbraucht.

const HOST = process.env.QWEN_ASR_HOST || "127.0.0.1";
const PORT = Number(process.env.QWEN_ASR_PORT || 8151);

export function qwenAsrProxy(req, res) {
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
    const out = { ...pres.headers };
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
    res.status(502).json({ detail: `qwen-asr nicht erreichbar (${HOST}:${PORT})` });
  });
  req.pipe(proxy);
}

export default qwenAsrProxy;
