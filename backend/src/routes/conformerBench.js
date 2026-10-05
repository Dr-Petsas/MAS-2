import http from "node:http";

// Conformer-Live-Testseite hinter dem MAS-Tunnel (15.08.2026).
// Frueher eigener Named-Tunnel https://stt.pickadoc-tunnel.com (Port 8155).
// Handy/LTE braucht HTTPS fuers Mikrofon — dafuer existiert bereits
// mas.pickadoc-tunnel.com. Statt des zweiten Tunnels proxyt MAS:
//   https://mas.pickadoc-tunnel.com/stt  ->  http://127.0.0.1:8155
//
// Der Bench bleibt ein eigener Prozess (GPU, Port 8155). WebSocket /stt
// haengt der Upgrade-Handler in server.js durch. Ist der Dienst aus,
// kommt eine klare 502-Seite statt eines stillen Fehlers.

const PORT = Number(process.env.CONFORMER_BENCH_PORT || 8155);

export function conformerBenchProxy(req, res) {
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
      `<!doctype html><meta charset="utf-8"><title>Conformer-Bench aus</title>
<body style="font-family:system-ui;background:#0f1115;color:#e7e9ee;padding:32px;max-width:640px">
<h1>Conformer-Bench laeuft nicht</h1>
<p>Die Mikrofon-Testseite braucht den Dienst auf Port ${PORT}. Auf dem Praxis-PC starten:</p>
<pre style="background:#161a22;padding:14px;border-radius:10px">powershell -File F:\\Lena-Voice\\lena_stt\\start-conformer-bench.ps1</pre>
<p style="color:#9aa1ad">Danach diese Seite neu laden.</p>
</body>`,
    );
  });
  req.pipe(proxy);
}

export default conformerBenchProxy;
