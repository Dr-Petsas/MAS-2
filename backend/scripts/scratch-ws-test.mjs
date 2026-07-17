// Testet die Lena-STT-WebSocket-Verbindung durch den Cloudflare-Tunnel
// (Node 22 hat globales WebSocket). Erwartet: "ready"-Nachricht.
const url = process.argv[2] || "wss://nested-funeral-historical-hopefully.trycloudflare.com/stt?channel=raum&session=diag&lang=de-DE";
const t0 = Date.now();
const ws = new WebSocket(url);
const timer = setTimeout(() => { console.log(`TIMEOUT nach ${Date.now() - t0} ms`); process.exit(2); }, 15000);
ws.onopen = () => console.log(`OPEN nach ${Date.now() - t0} ms`);
ws.onmessage = (ev) => {
  console.log(`MSG nach ${Date.now() - t0} ms:`, String(ev.data).slice(0, 200));
  clearTimeout(timer);
  ws.close();
  process.exit(0);
};
ws.onerror = (e) => { console.log(`ERROR nach ${Date.now() - t0} ms:`, e?.message || e.type); };
ws.onclose = (e) => { console.log(`CLOSE nach ${Date.now() - t0} ms code=${e.code}`); clearTimeout(timer); process.exit(1); };
