// Diagnose: erreicht ein WS-Client lena_stt ueber alle drei Wege?
// 1. direkt (8140), 2. MAS-Proxy lokal (4000), 3. Named-Tunnel (mas.pickadoc-tunnel.com)
// Nutzt den in Node 22 eingebauten WebSocket (kein ws-Paket noetig).

import { readFileSync } from "node:fs";

function pcmSine(ms, hz = 220, rate = 16000, amp = 0.25) {
  const n = Math.round((ms / 1000) * rate);
  const buf = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * amp * 32767);
  }
  return Buffer.from(buf.buffer);
}

// Echte Sprache statt Sinus: WAV (16 kHz mono int16) -> rohes PCM.
// Sinus wird vom Silero-VAD (korrekt) verworfen und erreicht Whisper nie.
function pcmFromWav(path) {
  const b = readFileSync(path);
  const idx = b.indexOf(Buffer.from("data"));
  if (idx < 0) throw new Error("kein data-Chunk: " + path);
  return b.subarray(idx + 8);
}

const WAV = process.argv[2] || "";
const AUDIO = WAV ? pcmFromWav(WAV) : pcmSine(1200);
console.log("Audio:", WAV || "(sinus 1.2s)", "->", (AUDIO.byteLength / 32000).toFixed(1) + "s");

function test(name, url) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const out = { name, url, opened: false, msgs: [], error: "", closeCode: null };
    let ws;
    try {
      ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
    } catch (e) {
      out.error = "ctor: " + e.message;
      return resolve(out);
    }
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      out.ms = Date.now() - t0;
      resolve(out);
    };
    const timer = setTimeout(() => { try { ws.close(); } catch {} done(); }, 15000);
    ws.onopen = () => {
      out.opened = true;
      // Audio senden (960-Sample-Chunks wie der echte Client), dann flush+bye
      for (let o = 0; o < AUDIO.byteLength; o += 1920) ws.send(AUDIO.subarray(o, Math.min(o + 1920, AUDIO.byteLength)));
      ws.send(JSON.stringify({ type: "flush" }));
      setTimeout(() => { try { ws.send(JSON.stringify({ type: "bye" })); } catch {} }, 4000);
    };
    ws.onmessage = (ev) => {
      out.msgs.push(String(ev.data).slice(0, 160));
    };
    ws.onerror = (ev) => { out.error = String(ev?.message || ev?.error?.message || "ws error"); };
    ws.onclose = (ev) => {
      out.closeCode = ev.code;
      clearTimeout(timer);
      done();
    };
  });
}

const only = process.argv[3] || "";
const alle = [
  ["direkt-8140", "ws://127.0.0.1:8140/stt?channel=arzt&session=diag-direct&lang=de-DE"],
  ["mas-proxy-4000", "ws://127.0.0.1:4000/lena-stt?channel=arzt&session=diag-proxy&lang=de-DE"],
  ["tunnel", "wss://mas.pickadoc-tunnel.com/lena-stt?channel=arzt&session=diag-tunnel&lang=de-DE"],
];
const results = [];
for (const [name, url] of alle) {
  if (only && name !== only) continue;
  results.push(await test(name, url));
}

for (const r of results) {
  console.log("### " + r.name + " -> " + r.url);
  console.log("  opened:", r.opened, "| closeCode:", r.closeCode, "| error:", r.error || "-", "| dauer:", r.ms + "ms");
  r.msgs.slice(0, 4).forEach((m) => console.log("  msg:", m));
}
