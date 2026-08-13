import http from "node:http";

// STT-Bench hinter dem MAS-Tunnel (14.08.2026).
// Handy/LTE braucht HTTPS fuers Mikrofon — dafuer existiert bereits
// mas.pickadoc-tunnel.com. Statt eines zweiten Tunnels (stt.pickadoc-tunnel.com)
// proxyt MAS den Bench:
//   https://mas.pickadoc-tunnel.com/stt-bench  ->  http://127.0.0.1:8150
//
// Der Bench selbst bleibt ein eigener Prozess (GPU, Port 8150). Ist er aus,
// kommt eine klare 502-Seite statt eines stillen Fehlers.

const PORT = Number(process.env.STT_BENCH_PORT || 8150);

export function sttBenchProxy(req, res) {
  const suffix = !req.url || req.url === "/" ? "/" : req.url;
  const headers = { ...req.headers, host: `127.0.0.1:${PORT}` };
  delete headers.connection;
  delete headers["keep-alive"];
  const proxy = http.request({
    hostname: "127.0.0.1",
    port: PORT,
    path: suffix.startsWith("/") ? suffix : `/${suffix}`,
    method: req.method,
    headers,
  }, (pres) => {
    const out = { ...pres.headers };
    delete out.connection;
    res.writeHead(pres.statusCode || 502, out);
    pres.pipe(res);
  });
  proxy.on("error", () => {
    if (res.headersSent) {
      try { res.end(); } catch { /* egal */ }
      return;
    }
    res.status(502).type("html").send(
      `<!doctype html><meta charset="utf-8"><title>STT-Bench aus</title>
<body style="font-family:system-ui;background:#0f1115;color:#e7e9ee;padding:32px;max-width:640px">
<h1>STT-Bench laeuft nicht</h1>
<p>Die Mikrofon-Vergleichsseite braucht den Dienst auf Port ${PORT}. Auf dem Praxis-PC starten:</p>
<pre style="background:#161a22;padding:14px;border-radius:10px">powershell -File F:\\Clara-Voice\\stt_bench\\start-stt-bench.ps1</pre>
<p style="color:#9aa1ad">Danach diese Seite neu laden.</p>
</body>`,
    );
  });
  req.pipe(proxy);
}

export default sttBenchProxy;
