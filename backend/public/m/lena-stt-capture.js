/**
 * Schlanker Lena-STT-Client fuer die iPad-Companion-Seite.
 * Mikro -> 16 kHz int16 PCM -> WS /stt -> partial/final.
 * Adresse: localStorage.lenaSttWs | GET /treatment/lena-stt-url | localhost:8140
 *
 * Mic-Modus (opts.micMode):
 *   "ipad"      — Built-in (Stereo wenn moeglich, sonst Energie-Diarize)
 *   "usb"       — externes USB/DJI Stereo L/R
 *   "bluetooth" — EIN Headset (Stream von Clara/LiveKit geteilt, kein zweites
 *                 getUserMedia): Energie laut=Arzt, leise+Boost=Patient.
 *                 opts.sharedStream = MediaStream vom LiveKit-Local-Track.
 */
(function (global) {
  "use strict";

  const MIC_MODE_KEY = "pickadoc.ipad.micMode";

  function isLocalHost() {
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1";
  }

  async function resolveLenaSttWs() {
    try {
      const override = localStorage.getItem("lenaSttWs");
      if (override && /^wss?:\/\//i.test(override)) return override.replace(/\/+$/, "");
    } catch (_) {}
    try {
      const r = await fetch("/treatment/lena-stt-url", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        const url = String(j.wsUrl || "").trim().replace(/\/+$/, "");
        if (/^wss:\/\//i.test(url)) return url;
        if (/^ws:\/\//i.test(url) && isLocalHost()) return url;
      }
    } catch (_) {}
    if (isLocalHost()) return "ws://127.0.0.1:8140/stt";
    return null;
  }

  function normalizeMicMode(m) {
    const s = String(m || "").toLowerCase().trim();
    if (s === "usb" || s === "external" || s === "dji" || s === "stereo") return "usb";
    if (s === "bluetooth" || s === "bt" || s === "headset" || s === "shokz") return "bluetooth";
    return "ipad";
  }

  function loadMicMode() {
    try { return normalizeMicMode(localStorage.getItem(MIC_MODE_KEY)); } catch (_) { return "ipad"; }
  }

  function saveMicMode(mode) {
    try { localStorage.setItem(MIC_MODE_KEY, normalizeMicMode(mode)); } catch (_) {}
  }

  function isBuiltinLabel(label) {
    const l = String(label || "").toLowerCase();
    if (!l) return false;
    return /ipad|iphone|built-?\s*in|internal|eingebaut|default/.test(l);
  }

  function isBluetoothLabel(label) {
    const l = String(label || "").toLowerCase();
    if (!l || isBuiltinLabel(l)) return false;
    return /bluetooth|airpods|shokz|openrun|openfit|aftershokz|hands-?\s*free|hfp|hsp|headset|beats|jabra|bose\s*qc|sony\s*wh|wh-\d|galaxy\s*buds/.test(l);
  }

  function isUsbLabel(label) {
    const l = String(label || "").toLowerCase();
    if (!l || isBuiltinLabel(l) || isBluetoothLabel(l)) return false;
    // Explizite externe Geraete (DJI Mobile Receiver, USB-Interfaces …)
    if (/dji|usb|mic\s*mini|mic\s*series|osmo|rode|shure|focusrite|interface|line\s*in|external|extern/.test(l)) {
      return true;
    }
    // Generisches Mikro nur wenn klar nicht Built-in/BT
    if (/(microphone|mikrofon|audio)/.test(l) && !/ipad|iphone|built|bluetooth|airpods|headset/.test(l)) {
      return true;
    }
    return false;
  }

  /** Permission + Liste der audioinput-Geraete (mit Labels).
   *  BT-HEADSET (23.07.2026): KEIN Wegwerf-getUserMedia mehr, sobald die
   *  Mikro-Erlaubnis bereits vorliegt. Ein getUserMedia({audio}) + sofortiges
   *  track.stop() entreisst LiveKit auf iPadOS das Bluetooth-Headset
   *  (Re-Handshake + evtl. Erlaubnis-Popup) — genau der Fehler beim Wechsel
   *  Clara<->Lena. Nur beim allerersten Aufruf OHNE Erlaubnis wird einmalig
   *  gewaermt (da haelt LiveKit noch kein Mikro). */
  async function listAudioInputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    let devices = await navigator.mediaDevices.enumerateDevices();
    const hasLabels = devices.some((d) => d.kind === "audioinput" && d.label);
    if (!hasLabels) {
      let granted = false;
      try {
        const st = await navigator.permissions?.query?.({ name: "microphone" });
        granted = st?.state === "granted";
      } catch (_) { /* permissions-API evtl. nicht verfuegbar (iOS) */ }
      if (!granted) {
        // Erststart ohne Erlaubnis: einmalig warmen (kein LiveKit-Mic offen).
        try {
          const warm = await navigator.mediaDevices.getUserMedia({ audio: true });
          try { warm.getTracks().forEach((t) => t.stop()); } catch (_) {}
        } catch (_) { /* Permission verweigert — Liste ggf. ohne Labels */ }
        devices = await navigator.mediaDevices.enumerateDevices();
      }
    }
    return devices
      .filter((d) => d.kind === "audioinput" && d.deviceId)
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || "(ohne Namen)",
        groupId: d.groupId || "",
        builtin: isBuiltinLabel(d.label),
        usb: isUsbLabel(d.label),
        bluetooth: isBluetoothLabel(d.label),
      }));
  }

  /** Aus einer bereits gelesenen Geraeteliste die deviceId fuer den Modus waehlen. */
  function pickFromInputs(mode, inputs) {
    if (!inputs.length) {
      return { ok: false, error: "Kein Mikrofon gefunden.", inputs };
    }
    if (mode === "usb") {
      const usb = inputs.find((d) => d.usb)
        || inputs.find((d) => !d.builtin && !d.bluetooth && d.label && d.label !== "(ohne Namen)");
      if (!usb) {
        return {
          ok: false,
          error: "Kein USB-/DJI-Mikrofon gefunden. Empfänger einstecken und Seite neu laden.",
          inputs,
        };
      }
      return { ok: true, deviceId: usb.deviceId, device: usb, inputs };
    }
    if (mode === "bluetooth") {
      const bt = inputs.find((d) => d.bluetooth)
        || inputs.find((d) => !d.builtin && !d.usb && d.label && d.label !== "(ohne Namen)");
      if (!bt) {
        return {
          ok: false,
          error: "Kein Bluetooth-Mikrofon gefunden. Headset koppeln und Seite neu laden.",
          inputs,
        };
      }
      return { ok: true, deviceId: bt.deviceId, device: bt, inputs };
    }
    // iPad Built-in
    const builtin = inputs.find((d) => d.builtin)
      || inputs.find((d) => d.deviceId === "default")
      || inputs[0];
    return { ok: true, deviceId: builtin.deviceId, device: builtin, inputs };
  }

  /**
   * Waehlt deviceId fuer micMode "ipad" | "usb" | "bluetooth".
   *
   * opts.waitMs: Fuer EXTERNE Geraete (BT/USB) ein kurzes Warte-/Retry-Fenster.
   * Nach einem iOS-Routenwechsel (BT -> iPad -> BT) verschwindet das BT-Mikro
   * kurz aus der Geraeteliste (HFP-Re-Handshake). Ohne Wartefenster meldet der
   * erste enumerateDevices "nicht gefunden" und das Headset gilt faelschlich als
   * verloren. Mit waitMs>0 pollen wir enumerateDevices (billig, KEIN getUserMedia)
   * bis das Geraet auftaucht. Default 0 = altes Verhalten fuer alle Aufrufer.
   */
  async function pickAudioInput(micMode, opts) {
    const mode = normalizeMicMode(micMode);
    const waitMs = Math.max(0, Number(opts?.waitMs) || 0);
    const external = mode === "bluetooth" || mode === "usb";
    const deadline = Date.now() + waitMs;
    let res = pickFromInputs(mode, await listAudioInputs());
    // Nur externe Geraete pollen — Built-in ist immer sofort da.
    while (!res.ok && external && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
      res = pickFromInputs(mode, await listAudioInputs());
    }
    return res;
  }

  // Auf sauberes Schliessen der WS warten (bis timeoutMs). Beim Stoppen MUSS der
  // Client warten, bis der Server seinen Decode-Rueckstau abgearbeitet und alle
  // Finals gesendet hat — das STT ist langsamer als der Audio-Stream, sonst gehen
  // die letzten Saetze verloren ("send after close"). Server schliesst nach bye.
  function awaitWsClose(ws, timeoutMs) {
    return new Promise((resolve) => {
      if (!ws || ws.readyState === WebSocket.CLOSED) return resolve();
      let done = false;
      const fin = () => { if (done) return; done = true; resolve(); };
      try { ws.addEventListener("close", fin); } catch (_) { return resolve(); }
      setTimeout(fin, timeoutMs);
    });
  }

  const WORKLET_SRC = `
class LenaCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch);
    return true;
  }
}
registerProcessor("lena-capture", LenaCaptureProcessor);
`;

  class LenaSttCapture {
    constructor() {
      this.ws = null;
      this.ctx = null;
      this.stream = null;
      this.node = null;
      this.source = null;
      this.cb = {};
      this.srcRate = 48000;
      this.resamplePos = 0;
      this.outBuf = [];
      this.closed = false;
      this._analyser = null;
      this._level = 0;
      this.activeMic = null; // { mode, label, deviceId }
    }

    /** 0..1 aktueller Mikro-Pegel (fuer Meter). */
    level() {
      if (this._level > 0 || !this._analyser) return this._level;
      try {
        const buf = new Uint8Array(this._analyser.fftSize);
        this._analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        this._level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
      } catch (_) {}
      return this._level;
    }

    /**
     * opts.micMode: "ipad" | "usb"
     * opts.deviceId: optional feste deviceId (ueberschreibt Auto-Pick)
     */
    async start(opts, cb) {
      this.cb = cb || {};
      const wsBase = await resolveLenaSttWs();
      if (!wsBase) {
        this.cb.onError?.("STT-Dienst nicht erreichbar (keine wss-Adresse).");
        return false;
      }

      const micMode = normalizeMicMode(opts?.micMode || loadMicMode());
      let deviceId = opts?.deviceId ? String(opts.deviceId) : "";
      let pickedLabel = "";

      if (!deviceId) {
        const pick = await pickAudioInput(micMode);
        if (!pick.ok) {
          this.cb.onError?.(pick.error);
          return false;
        }
        deviceId = pick.deviceId || "";
        pickedLabel = pick.device?.label || "";
      }

      const audioConstraints = {
        channelCount: 1,
        echoCancellation: micMode === "ipad",
        noiseSuppression: micMode === "ipad",
        autoGainControl: micMode === "ipad",
      };
      // USB: Verarbeitung aus — DJI liefert schon aufbereitetes Signal.
      if (deviceId && deviceId !== "default" && deviceId !== "communications") {
        audioConstraints.deviceId = { exact: deviceId };
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch (e) {
        // Fallback ohne exact (manche Safari-Builds)
        if (audioConstraints.deviceId) {
          try {
            delete audioConstraints.deviceId;
            if (deviceId) audioConstraints.deviceId = deviceId;
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
          } catch (e2) {
            this.cb.onError?.("Mikrofon: " + (e2?.name || e2));
            return false;
          }
        } else {
          this.cb.onError?.("Mikrofon: " + (e?.name || e));
          return false;
        }
      }

      const track = this.stream.getAudioTracks()[0];
      const settings = track?.getSettings?.() || {};
      const realLabel = track?.label || pickedLabel || "(unbekannt)";
      const realId = settings.deviceId || deviceId || "";
      const suspectBuiltin = micMode === "usb" && isBuiltinLabel(realLabel);
      this.activeMic = {
        mode: micMode,
        label: realLabel,
        deviceId: realId,
        warning: suspectBuiltin
          ? "Label wirkt wie iPad-Mikro — bitte mit Zudecken-Test prüfen (Safari kann lügen)."
          : "",
      };

      let q =
        "?channel=" + encodeURIComponent(opts.channel || "arzt") +
        "&session=" + encodeURIComponent(opts.session || "ipad") +
        "&lang=" + encodeURIComponent(opts.lang || "de-DE");
      if (opts.enhanceProfile) {
        q += "&enhanceProfile=" + encodeURIComponent(String(opts.enhanceProfile));
      }
      this._reconUrl = wsBase + q; // fuer Auto-Reconnect nach WS-Abbruch gemerkt
      const ws = await this._connectWs(wsBase + q);
      if (!ws) {
        this.cb.onError?.("STT-WebSocket fehlgeschlagen: " + wsBase);
        this.cleanup();
        return false;
      }
      this.ws = ws;
      this._bindWsHandlers(ws);

      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        if (this.ctx.state === "suspended") await this.ctx.resume();
        this.srcRate = this.ctx.sampleRate || 48000;
        this.source = this.ctx.createMediaStreamSource(this.stream);
        this._analyser = this.ctx.createAnalyser();
        this._analyser.fftSize = 512;
        this.source.connect(this._analyser);
        await this._buildNode();
      } catch (e) {
        this.cb.onError?.("Audio-Pipeline: " + (e?.message || e));
        this.cleanup();
        return false;
      }
      return true;
    }

    _connectWs(url) {
      return new Promise((resolve) => {
        let ws;
        try {
          ws = new WebSocket(url);
          ws.binaryType = "arraybuffer";
        } catch {
          return resolve(null);
        }
        let done = false;
        const finish = (ok) => {
          if (done) return;
          done = true;
          if (ok) resolve(ws);
          else {
            try { ws.close(); } catch (_) {}
            resolve(null);
          }
        };
        ws.onopen = () => finish(true);
        ws.onerror = () => finish(false);
        ws.onclose = () => finish(false);
        setTimeout(() => finish(ws.readyState === WebSocket.OPEN), 4000);
      });
    }

    async _buildNode() {
      if (!this.ctx || !this.source) return;
      const sink = this.ctx.createGain();
      sink.gain.value = 0;
      sink.connect(this.ctx.destination);
      this._sink = sink;

      if (this.ctx.audioWorklet && window.AudioWorkletNode) {
        const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
        try {
          await this.ctx.audioWorklet.addModule(blobUrl);
          const node = new AudioWorkletNode(this.ctx, "lena-capture");
          node.port.onmessage = (ev) => this._onSamples(ev.data);
          this.source.connect(node);
          node.connect(sink);
          this.node = node;
          return;
        } catch (e) {
          console.warn("lena-stt: worklet fehlgeschlagen, ScriptProcessor", e);
        } finally {
          try { URL.revokeObjectURL(blobUrl); } catch (_) {}
        }
      }
      const proc = this.ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (ev) => this._onSamples(ev.inputBuffer.getChannelData(0));
      this.source.connect(proc);
      proc.connect(sink);
      this.node = proc;
    }

    _onSamples(input) {
      if (!input?.length) return;
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      this._level = Math.min(1, rms * 4.5);

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      // Unter Schwelle: Stille senden (nicht Rauschen) — sonst Halluzinationen.
      const SEND_MIN = 0.012;
      const ratio = this.srcRate / 16000;
      let pos = this.resamplePos;
      while (pos < input.length) {
        const i = Math.floor(pos);
        const frac = pos - i;
        let s = 0;
        if (rms >= SEND_MIN) {
          const a = input[i] || 0;
          const b = input[i + 1] || a;
          s = a + (b - a) * frac;
        }
        this.outBuf.push(s);
        pos += ratio;
      }
      this.resamplePos = pos - input.length;
      while (this.outBuf.length >= 960) {
        const chunk = this.outBuf.splice(0, 960);
        const pcm = new Int16Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          const v = Math.max(-1, Math.min(1, chunk[i]));
          pcm[i] = (v * 32767) | 0;
        }
        try { this.ws.send(pcm.buffer); } catch (_) { return; }
      }
    }

    _onMessage(ev) {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === "ready") this.cb.onReady?.(msg);
      else if (msg.type === "partial") this.cb.onPartial?.(msg.text || "");
      else if (msg.type === "final") {
        const timing = { startMs: Number(msg.startMs) || 0, endMs: Number(msg.endMs) || 0 };
        this.cb.onFinal?.(msg.text || "", msg.raw || "", msg.corrections || [], timing);
      }
    }

    _bindWsHandlers(ws) {
      ws.onmessage = (ev) => this._onMessage(ev);
      // Transiente Fehler NICHT als fatal melden (onError -> stopRecording).
      ws.onerror = () => {};
      ws.onclose = () => { if (!this.closed) this._reconnect(); };
    }

    // WS nach Abbruch neu verbinden, OHNE die Aufnahme zu stoppen (iOS-Drossel/
    // Netz-Haenger). Erst nach mehreren Fehlversuchen aufgeben (-> onClose/Stop).
    async _reconnect(attempt = 1) {
      if (this.closed || !this._reconUrl) return;
      const ws = await this._connectWs(this._reconUrl);
      if (this.closed) { try { ws?.close(); } catch (_) {} return; }
      if (ws) {
        this.ws = ws;
        this.resamplePos = 0;
        this._bindWsHandlers(ws);
        this.cb.onWarn?.("Verbindung wiederhergestellt.");
        return;
      }
      if (attempt < 8) {
        setTimeout(() => this._reconnect(attempt + 1), Math.min(3000, 400 * attempt));
      } else {
        this.cb.onClose?.();
      }
    }

    // Nach iOS-Standby/Tab-Drosselung den AudioContext wieder anwerfen.
    resume() { try { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); } catch (_) {} }

    async stop() {
      this.closed = true;
      const ws = this.ws;
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "flush" }));
          ws.send(JSON.stringify({ type: "bye" }));
        }
      } catch (_) {}
      // Auf Server-Close warten (Decode-Rueckstau) statt fixe 180 ms.
      await awaitWsClose(ws, 15000);
      this.cleanup();
    }

    cleanup() {
      try { this.node?.disconnect(); } catch (_) {}
      try { this.source?.disconnect(); } catch (_) {}
      try { this._analyser?.disconnect(); } catch (_) {}
      try { this._sink?.disconnect(); } catch (_) {}
      try { this.stream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
      try { this.ctx?.close(); } catch (_) {}
      try { if (this.ws && this.ws.readyState <= 1) this.ws.close(); } catch (_) {}
      this.ws = this.ctx = this.stream = this.node = this.source = this._analyser = this._sink = null;
      this._level = 0;
      this.outBuf = [];
      this.activeMic = null;
    }
  }

  // ── Stereo-Split (DJI Mic Mini USB, TX1=L / TX2=R) ───────────────────────
  const WORKLET_STEREO_SRC = `
class LenaStereoCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1024;
    this.bufL = new Float32Array(this.size);
    this.bufR = new Float32Array(this.size);
    this.fill = 0;
  }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp[0] || !inp[0].length) return true;
    const l = inp[0];
    const r = (inp[1] && inp[1].length === l.length) ? inp[1] : null;
    let i = 0;
    while (i < l.length) {
      const n = Math.min(l.length - i, this.size - this.fill);
      this.bufL.set(l.subarray(i, i + n), this.fill);
      if (r) this.bufR.set(r.subarray(i, i + n), this.fill);
      else this.bufR.fill(0, this.fill, this.fill + n);
      this.fill += n;
      i += n;
      if (this.fill >= this.size) {
        this.port.postMessage({ l: this.bufL, r: this.bufR }, [this.bufL.buffer, this.bufR.buffer]);
        this.bufL = new Float32Array(this.size);
        this.bufR = new Float32Array(this.size);
        this.fill = 0;
      }
    }
    return true;
  }
}
registerProcessor("lena-capture-stereo", LenaStereoCaptureProcessor);
`;

  const SWAP_KEY = "pickadoc.ipad.stereoSwap"; // true = Links=Arzt

  function loadStereoSwap() {
    try { return localStorage.getItem(SWAP_KEY) === "1"; } catch (_) { return false; }
  }
  function saveStereoSwap(v) {
    try { localStorage.setItem(SWAP_KEY, v ? "1" : "0"); } catch (_) {}
  }

  /**
   * DJI / USB Stereo: ein getUserMedia(Stereo), zwei WS (raum + arzt).
   * Dominanz-Gate gegen Uebersprechen (wie Desktop LenaStereoSplitCapture).
   */
  class LenaStereoSplitCapture {
    static DOM_FACTOR = 2.0;
    static ENV_DECAY = 0.85;
    static MIN_ENV = 0.012; // darunter = Stille ans STT (gegen Rausch-Halluzinationen)
    static PEAK_DECAY = 0.9995;
    static PEAK_FLOOR = 0.01;
    static DEDUPE_WINDOW_MS = 8000;
    static DEDUPE_SIM = 0.72;

    constructor() {
      this.ctx = null;
      this.stream = null;
      this.node = null;
      this.source = null;
      this._sink = null;
      this.cb = {};
      this.srcRate = 48000;
      this.closed = false;
      this.readySent = false;
      this.envL = 0;
      this.envR = 0;
      this.peakL = 0;
      this.peakR = 0;
      this.silence = new Float32Array(0);
      this.idDiffAcc = 0;
      this.idSigAcc = 0;
      this.idWarned = false;
      this.recentFinals = [];
      this.activeMic = null;
      this.isStereo = true;
      this.L = { ws: null, ch: "raum", buf: [], pos: 0 };
      this.R = { ws: null, ch: "arzt", buf: [], pos: 0 };
    }

    level() {
      return Math.max(this.levelL(), this.levelR());
    }
    levelL() {
      return Math.min(1, this.envL * 4.5);
    }
    levelR() {
      return Math.min(1, this.envR * 4.5);
    }
    /** Pegel fuer UI: a=Arzt, p=Patient — unabhaengig von L/R-Tausch. */
    levelsAp() {
      const leftIsPatient = this.L.ch === "raum";
      const p = leftIsPatient ? this.levelL() : this.levelR();
      const a = leftIsPatient ? this.levelR() : this.levelL();
      return { a, p };
    }

    async start(opts, cb) {
      this.cb = cb || {};
      const wsBase = await resolveLenaSttWs();
      if (!wsBase) {
        this.cb.onError?.("STT-Dienst nicht erreichbar (keine wss-Adresse).");
        return false;
      }

      const swap = !!(opts?.swapLR ?? loadStereoSwap());
      this.L.ch = swap ? "arzt" : "raum";
      this.R.ch = swap ? "raum" : "arzt";
      const lang = opts?.lang || "de-DE";
      const session = opts?.session || "ipad-st";
      // Fuer Auto-Reconnect eines einzelnen Kanals gemerkt (iOS-Drossel/Netz-
      // Haenger reisst sonst die ganze Aufnahme ab, weil onClose -> stopRecording).
      this._wsBase = wsBase;
      this._session = session;
      this._lang = lang;

      const micMode = normalizeMicMode(opts?.micMode || "usb");
      const pick = await pickAudioInput(micMode === "ipad" ? "ipad" : "usb");
      if (!pick.ok) {
        this.cb.onError?.(pick.error);
        return false;
      }
      const deviceId = pick.deviceId || "";

      // Stereo, DSP AUS — sonst mischt Safari L/R zu Mono.
      const audioConstraints = {
        channelCount: { ideal: 2 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      };
      if (deviceId && deviceId !== "default" && deviceId !== "communications") {
        audioConstraints.deviceId = { exact: deviceId };
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      } catch (e) {
        try {
          delete audioConstraints.deviceId;
          if (deviceId) audioConstraints.deviceId = deviceId;
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch (e2) {
          this.cb.onError?.("Mikrofon: " + (e2?.name || e2));
          return false;
        }
      }

      const track = this.stream.getAudioTracks()[0];
      const settings = track?.getSettings?.() || {};
      const chCount = Number(settings.channelCount) || 0;
      const realLabel = track?.label || pick.device?.label || (micMode === "ipad" ? "iPad" : "USB");
      this.activeMic = {
        mode: micMode,
        label: realLabel,
        deviceId: settings.deviceId || deviceId,
        channelCount: chCount,
        swap,
        warning: chCount < 2
          ? (micMode === "usb"
            ? "Eingang liefert nur " + (chCount || "?") + " Kanal — Empfänger auf STEREO stellen (Doppeltipp Link-Taste)."
            : "iPad liefert nur Mono — Energie-Diarisierung.")
          : "",
      };
      // Aufrufer kann bei Mono + allowMonoFallback abbrechen und Energy nutzen
      if (opts?.allowMonoFallback && chCount < 2) {
        this.cleanup();
        return false;
      }

      const q = (ch) =>
        "?channel=" + encodeURIComponent(ch) +
        "&session=" + encodeURIComponent(session) +
        "&lang=" + encodeURIComponent(lang);
      const left = await this._connectWs(wsBase + q(this.L.ch));
      const right = await this._connectWs(wsBase + q(this.R.ch));
      if (!left || !right) {
        try { left?.close(); } catch (_) {}
        try { right?.close(); } catch (_) {}
        this.cb.onError?.("STT-WebSocket (Stereo) fehlgeschlagen.");
        this.cleanup();
        return false;
      }
      this.L.ws = left;
      this.R.ws = right;
      this._bindWs(this.L);
      this._bindWs(this.R);

      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        if (this.ctx.state === "suspended") await this.ctx.resume();
        this.srcRate = this.ctx.sampleRate || 48000;
        this.source = this.ctx.createMediaStreamSource(this.stream);
        await this._buildNode();
      } catch (e) {
        this.cb.onError?.("Audio-Pipeline: " + (e?.message || e));
        this.cleanup();
        return false;
      }
      return true;
    }

    _connectWs(url) {
      return new Promise((resolve) => {
        let ws;
        try {
          ws = new WebSocket(url);
          ws.binaryType = "arraybuffer";
        } catch {
          return resolve(null);
        }
        let done = false;
        const finish = (ok) => {
          if (done) return;
          done = true;
          if (ok) resolve(ws);
          else {
            try { ws.close(); } catch (_) {}
            resolve(null);
          }
        };
        ws.onopen = () => finish(true);
        ws.onerror = () => finish(false);
        ws.onclose = () => finish(false);
        setTimeout(() => finish(ws.readyState === WebSocket.OPEN), 4000);
      });
    }

    _bindWs(side) {
      const ws = side.ws;
      if (!ws) return;
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === "ready") {
          if (!this.readySent) {
            this.readySent = true;
            this.cb.onReady?.(msg);
          }
          return;
        }
        if (msg.type === "partial") {
          this.cb.onPartial?.(side.ch, String(msg.text || ""));
          return;
        }
        if (msg.type === "final") {
          const text = String(msg.text || "");
          if (this._isDedupe(side.ch, text)) return;
          const timing = { startMs: Number(msg.startMs) || 0, endMs: Number(msg.endMs) || 0 };
          this.cb.onFinal?.(side.ch, text, timing);
        }
      };
      // Transiente WS-Fehler NICHT als fatal an den Aufrufer geben (onError ->
      // stopRecording). Der close-Handler entscheidet: reconnecten statt stoppen.
      ws.onerror = () => {};
      ws.onclose = () => { if (!this.closed) this._reconnectSide(side); };
    }

    // Einen einzelnen Kanal nach WS-Abbruch neu verbinden, OHNE die Aufnahme zu
    // stoppen. Erst nach mehreren Fehlversuchen wird aufgegeben (-> onClose/Stop).
    async _reconnectSide(side, attempt = 1) {
      if (this.closed) return;
      const MAX = 8;
      const url = this._wsBase +
        "?channel=" + encodeURIComponent(side.ch) +
        "&session=" + encodeURIComponent(this._session) +
        "&lang=" + encodeURIComponent(this._lang);
      const ws = await this._connectWs(url);
      if (this.closed) { try { ws?.close(); } catch (_) {} return; }
      if (ws) {
        side.ws = ws;
        side.pos = 0;
        this._bindWs(side);
        this.cb.onWarn?.("Verbindung (" + side.ch + ") wiederhergestellt.");
        return;
      }
      if (attempt < MAX) {
        setTimeout(() => this._reconnectSide(side, attempt + 1), Math.min(3000, 400 * attempt));
      } else {
        this.cb.onClose?.();
      }
    }

    async _buildNode() {
      if (!this.ctx || !this.source) return;
      const sink = this.ctx.createGain();
      sink.gain.value = 0;
      sink.connect(this.ctx.destination);
      this._sink = sink;

      if (this.ctx.audioWorklet && window.AudioWorkletNode) {
        const blobUrl = URL.createObjectURL(new Blob([WORKLET_STEREO_SRC], { type: "application/javascript" }));
        try {
          await this.ctx.audioWorklet.addModule(blobUrl);
          const node = new AudioWorkletNode(this.ctx, "lena-capture-stereo", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 2,
            channelCountMode: "explicit",
            channelInterpretation: "discrete",
          });
          node.port.onmessage = (ev) => {
            const d = ev.data;
            if (d && d.l) this._onStereoBlock(d.l, d.r || null);
          };
          this.source.connect(node);
          node.connect(sink);
          this.node = node;
          return;
        } catch (e) {
          console.warn("lena-stt: stereo worklet fehlgeschlagen", e);
        } finally {
          try { URL.revokeObjectURL(blobUrl); } catch (_) {}
        }
      }
      const proc = this.ctx.createScriptProcessor(4096, 2, 2);
      proc.onaudioprocess = (ev) => {
        const ib = ev.inputBuffer;
        const l = ib.getChannelData(0);
        const r = ib.numberOfChannels > 1 ? ib.getChannelData(1) : null;
        this._onStereoBlock(l, r);
      };
      this.source.connect(proc);
      proc.connect(sink);
      this.node = proc;
    }

    _rms(b) {
      let s = 0;
      for (let i = 0; i < b.length; i++) s += b[i] * b[i];
      return Math.sqrt(s / b.length);
    }

    _onStereoBlock(l, r) {
      const K = LenaStereoSplitCapture;
      const rr = r && r.length === l.length ? r : null;
      this.envL = Math.max(this._rms(l), this.envL * K.ENV_DECAY);
      this.envR = Math.max(rr ? this._rms(rr) : 0, this.envR * K.ENV_DECAY);
      this.peakL = Math.max(this.envL, this.peakL * K.PEAK_DECAY);
      this.peakR = Math.max(this.envR, this.peakR * K.PEAK_DECAY);

      if (rr && !this.idWarned) {
        for (let i = 0; i < l.length; i += 4) {
          const diff = l[i] - rr[i];
          this.idDiffAcc += diff * diff;
          this.idSigAcc += l[i] * l[i] + rr[i] * rr[i];
        }
        if (this.idSigAcc > 3) {
          if (this.idDiffAcc / this.idSigAcc < 0.001) {
            this.idWarned = true;
            this.cb.onWarn?.(
              "Beide Kanäle identisch (Mono am Empfänger?) — DJI auf STEREO stellen (Link-Taste doppelt).",
            );
          }
          this.idDiffAcc = 0;
          this.idSigAcc = 0;
        }
      }

      let sendL = true;
      let sendR = !!rr;
      if (rr && (this.envL > K.MIN_ENV || this.envR > K.MIN_ENV)) {
        const kalibriert = this.peakL > K.PEAK_FLOOR && this.peakR > K.PEAK_FLOOR;
        const a = kalibriert ? this.envL / this.peakL : this.envL;
        const b = kalibriert ? this.envR / this.peakR : this.envR;
        if (a > b * K.DOM_FACTOR) sendR = false;
        else if (b > a * K.DOM_FACTOR) sendL = false;
      }
      if (this.silence.length !== l.length) this.silence = new Float32Array(l.length);
      // Auch bei Dominanz: unter MIN_ENV nie echtes Audio (stiller TX / Rauschen).
      const pushL = sendL && this.envL >= K.MIN_ENV;
      const pushR = sendR && this.envR >= K.MIN_ENV;
      this._pushSide(this.L, pushL ? l : this.silence);
      if (rr) this._pushSide(this.R, pushR ? rr : this.silence);
    }

    _normText(t) {
      return t.toLowerCase().replace(/[^a-zäöüß0-9 ]+/gi, " ").replace(/\s+/g, " ").trim();
    }
    _bigramSim(a, b) {
      if (!a || !b) return 0;
      if (a === b) return 1;
      const grams = (s) => {
        const m = new Map();
        for (let i = 0; i < s.length - 1; i++) {
          const g = s.slice(i, i + 2);
          m.set(g, (m.get(g) || 0) + 1);
        }
        return m;
      };
      const ga = grams(a);
      const gb = grams(b);
      let overlap = 0;
      let total = 0;
      ga.forEach((n, g) => { overlap += Math.min(n, gb.get(g) || 0); total += n; });
      gb.forEach((n) => { total += n; });
      return total ? (2 * overlap) / total : 0;
    }
    _isDedupe(ch, text) {
      const K = LenaStereoSplitCapture;
      const now = Date.now();
      const norm = this._normText(text);
      this.recentFinals = this.recentFinals.filter((f) => now - f.at < K.DEDUPE_WINDOW_MS);
      if (norm.length >= 12) {
        for (const f of this.recentFinals) {
          if (f.ch === ch) continue;
          if (this._bigramSim(norm, f.norm) >= K.DEDUPE_SIM) return true;
        }
      }
      this.recentFinals.push({ ch, norm, at: now });
      if (this.recentFinals.length > 12) this.recentFinals.shift();
      return false;
    }

    _pushSide(side, input) {
      const ws = side.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN || !input?.length) return;
      const ratio = this.srcRate / 16000;
      let pos = side.pos;
      while (pos < input.length) {
        const i = Math.floor(pos);
        const frac = pos - i;
        const a = input[i] || 0;
        const b = input[i + 1] !== undefined ? input[i + 1] : a;
        side.buf.push(Math.max(-1, Math.min(1, a + (b - a) * frac)));
        pos += ratio;
      }
      side.pos = pos - input.length;
      while (side.buf.length >= 960) {
        const chunk = side.buf.splice(0, 960);
        const pcm = new Int16Array(chunk.length);
        for (let k = 0; k < chunk.length; k++) pcm[k] = (chunk[k] * 32767) | 0;
        try { ws.send(pcm.buffer); } catch (_) { return; }
      }
    }

    flush() {
      try { this.L.ws?.send(JSON.stringify({ type: "flush" })); } catch (_) {}
      try { this.R.ws?.send(JSON.stringify({ type: "flush" })); } catch (_) {}
    }

    // Nach iOS-Standby/Tab-Drosselung den AudioContext wieder anwerfen.
    resume() { try { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); } catch (_) {} }

    async stop() {
      this.closed = true;
      const lws = this.L.ws;
      const rws = this.R.ws;
      try {
        this.flush();
        lws?.send(JSON.stringify({ type: "bye" }));
        rws?.send(JSON.stringify({ type: "bye" }));
      } catch (_) {}
      // Auf Server-Close BEIDER Kanaele warten (Decode-Rueckstau) statt 180 ms.
      await Promise.all([awaitWsClose(lws, 15000), awaitWsClose(rws, 15000)]);
      this.cleanup();
    }

    cleanup() {
      try { this.node?.disconnect(); } catch (_) {}
      try { this.source?.disconnect(); } catch (_) {}
      try { this._sink?.disconnect(); } catch (_) {}
      try { this.stream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
      try { this.ctx?.close(); } catch (_) {}
      for (const side of [this.L, this.R]) {
        try { if (side.ws && side.ws.readyState <= 1) side.ws.close(); } catch (_) {}
        side.ws = null;
        side.buf = [];
        side.pos = 0;
      }
      this.node = this.source = this.stream = this.ctx = this._sink = null;
      this.envL = this.envR = 0;
      this.activeMic = null;
    }
  }

  // Mono: levelsAp-Hilfskompatibel
  LenaSttCapture.prototype.levelsAp = function () {
    const p = this.level();
    return { a: 0, p };
  };
  LenaSttCapture.prototype.isStereo = false;
  LenaSttCapture.prototype.flush = function () {
    try {
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: "flush" }));
    } catch (_) {}
  };

  /**
   * Mono-Energie-Diarisierung (Bluetooth / iPad-Fallback):
   * laut = Arzt (Headset-Traeger), leise Sprache = Patient (Boost + quietBoost Enhance).
   */
  class LenaEnergyDiarizeCapture {
    static ENV_DECAY = 0.88;
    static PEAK_DECAY = 0.9992;
    static PEAK_FLOOR = 0.02;
    static LOUD_MIN = 0.035;
    static QUIET_MIN = 0.009;
    static LOUD_PEAK_FRAC = 0.42;
    static TARGET_RMS = 0.12;
    static MAX_GAIN = 9;
    static DEDUPE_WINDOW_MS = 8000;
    static DEDUPE_SIM = 0.72;

    constructor() {
      this.ctx = null;
      this.stream = null;
      this.node = null;
      this.source = null;
      this._sink = null;
      this.cb = {};
      this.srcRate = 48000;
      this.closed = false;
      this.readySent = false;
      this.env = 0;
      this.peak = 0;
      this.noise = 0.004;
      this.envArzt = 0;
      this.envPat = 0;
      this.silence = new Float32Array(0);
      this.boostBuf = new Float32Array(0);
      this.recentFinals = [];
      this.activeMic = null;
      this.isStereo = false;
      this.isEnergy = true;
      this.Arzt = { ws: null, ch: "arzt", buf: [], pos: 0 };
      this.Pat = { ws: null, ch: "raum", buf: [], pos: 0 };
      this._ownTracks = true; // false = sharedStream von Clara — Tracks nicht stoppen
    }

    level() { return Math.max(this.levelArzt(), this.levelPat()); }
    levelArzt() { return Math.min(1, this.envArzt * 4.5); }
    levelPat() { return Math.min(1, this.envPat * 4.5); }
    levelsAp() { return { a: this.levelArzt(), p: this.levelPat() }; }

    async start(opts, cb) {
      this.cb = cb || {};
      const wsBase = await resolveLenaSttWs();
      if (!wsBase) {
        this.cb.onError?.("STT-Dienst nicht erreichbar (keine wss-Adresse).");
        return false;
      }
      const micMode = normalizeMicMode(opts?.micMode || "bluetooth");
      const lang = opts?.lang || "de-DE";
      const session = opts?.session || "ipad-en";
      this._wsBase = wsBase;
      this._session = session;
      this._lang = lang;
      this.closed = false;
      this.readySent = false;

      // Soft-Switch: Clara's LiveKit-Track wiederverwenden (ein Headset, kein
      // zweites getUserMedia auf demselben BT-Geraet).
      const shared = opts?.sharedStream;
      if (shared && typeof shared.getAudioTracks === "function" && shared.getAudioTracks().length) {
        this.stream = shared;
        this._ownTracks = false;
      } else {
        this._ownTracks = true;
        const pick = await pickAudioInput(micMode);
        if (!pick.ok) {
          this.cb.onError?.(pick.error);
          return false;
        }
        const deviceId = pick.deviceId || "";
        // DSP aus — AGC wuerde Laut/Leise glattbuegeln.
        const audioConstraints = {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        };
        if (deviceId && deviceId !== "default" && deviceId !== "communications") {
          audioConstraints.deviceId = { exact: deviceId };
        }
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch (e) {
          try {
            delete audioConstraints.deviceId;
            if (deviceId) audioConstraints.deviceId = deviceId;
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
          } catch (e2) {
            this.cb.onError?.("Mikrofon: " + (e2?.name || e2));
            return false;
          }
        }
      }

      const track = this.stream.getAudioTracks()[0];
      const settings = track?.getSettings?.() || {};
      const realLabel = track?.label || micMode;
      const suspect = micMode === "bluetooth" && isBuiltinLabel(realLabel) && this._ownTracks;
      this.activeMic = {
        mode: micMode,
        label: realLabel,
        deviceId: settings.deviceId || "",
        channelCount: Number(settings.channelCount) || 1,
        energy: true,
        shared: !this._ownTracks,
        warning: suspect
          ? "Label wirkt wie iPad-Mikro — BT-Headset aktiv? Zudecken-Test."
          : (!this._ownTracks
            ? "Ein Headset · laut=Arzt, leise=Patient (Test)"
            : ""),
      };

      const q = (ch, profile) => {
        let s = "?channel=" + encodeURIComponent(ch)
          + "&session=" + encodeURIComponent(session)
          + "&lang=" + encodeURIComponent(lang);
        if (profile) s += "&enhanceProfile=" + encodeURIComponent(profile);
        return s;
      };
      const aw = await this._connectWs(wsBase + q("arzt", ""));
      const pw = await this._connectWs(wsBase + q("raum", "quietBoost"));
      if (!aw || !pw) {
        try { aw?.close(); } catch (_) {}
        try { pw?.close(); } catch (_) {}
        this.cb.onError?.("STT-WebSocket (Energie) fehlgeschlagen.");
        this.cleanup();
        return false;
      }
      this.Arzt.ws = aw;
      this.Pat.ws = pw;
      this._bindWs(this.Arzt);
      this._bindWs(this.Pat);

      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        if (this.ctx.state === "suspended") await this.ctx.resume();
        this.srcRate = this.ctx.sampleRate || 48000;
        this.source = this.ctx.createMediaStreamSource(this.stream);
        await this._buildNode();
      } catch (e) {
        this.cb.onError?.("Audio-Pipeline: " + (e?.message || e));
        this.cleanup();
        return false;
      }
      return true;
    }

    _connectWs(url) {
      return new Promise((resolve) => {
        let ws;
        try {
          ws = new WebSocket(url);
          ws.binaryType = "arraybuffer";
        } catch {
          return resolve(null);
        }
        let done = false;
        const finish = (ok) => {
          if (done) return;
          done = true;
          if (ok) resolve(ws);
          else {
            try { ws.close(); } catch (_) {}
            resolve(null);
          }
        };
        ws.onopen = () => finish(true);
        ws.onerror = () => finish(false);
        ws.onclose = () => finish(false);
        setTimeout(() => finish(ws.readyState === WebSocket.OPEN), 4000);
      });
    }

    _bindWs(side) {
      const ws = side.ws;
      if (!ws) return;
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === "ready") {
          if (!this.readySent) {
            this.readySent = true;
            this.cb.onReady?.(msg);
          }
          return;
        }
        if (msg.type === "partial") {
          this.cb.onPartial?.(side.ch, String(msg.text || ""));
          return;
        }
        if (msg.type === "final") {
          const text = String(msg.text || "");
          if (this._isDedupe(side.ch, text)) return;
          const timing = { startMs: Number(msg.startMs) || 0, endMs: Number(msg.endMs) || 0 };
          this.cb.onFinal?.(side.ch, text, timing);
        }
      };
      ws.onerror = () => {};
      ws.onclose = () => { if (!this.closed) this._reconnectSide(side); };
    }

    async _reconnectSide(side, attempt = 1) {
      if (this.closed) return;
      const MAX = 8;
      const profile = side.ch === "raum" ? "quietBoost" : "";
      let url = this._wsBase
        + "?channel=" + encodeURIComponent(side.ch)
        + "&session=" + encodeURIComponent(this._session)
        + "&lang=" + encodeURIComponent(this._lang);
      if (profile) url += "&enhanceProfile=" + encodeURIComponent(profile);
      const ws = await this._connectWs(url);
      if (this.closed) { try { ws?.close(); } catch (_) {} return; }
      if (ws) {
        side.ws = ws;
        side.pos = 0;
        this._bindWs(side);
        this.cb.onWarn?.("Verbindung (" + side.ch + ") wiederhergestellt.");
        return;
      }
      if (attempt < MAX) {
        setTimeout(() => this._reconnectSide(side, attempt + 1), Math.min(3000, 400 * attempt));
      } else {
        this.cb.onClose?.();
      }
    }

    async _buildNode() {
      if (!this.ctx || !this.source) return;
      const sink = this.ctx.createGain();
      sink.gain.value = 0;
      sink.connect(this.ctx.destination);
      this._sink = sink;
      if (this.ctx.audioWorklet && window.AudioWorkletNode) {
        const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
        try {
          await this.ctx.audioWorklet.addModule(blobUrl);
          const node = new AudioWorkletNode(this.ctx, "lena-capture");
          node.port.onmessage = (ev) => {
            if (ev.data && ev.data.length) this._onMonoBlock(ev.data);
          };
          this.source.connect(node);
          node.connect(sink);
          this.node = node;
          return;
        } catch (e) {
          console.warn("lena-stt: energy worklet fehlgeschlagen", e);
        } finally {
          try { URL.revokeObjectURL(blobUrl); } catch (_) {}
        }
      }
      const proc = this.ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (ev) => {
        this._onMonoBlock(ev.inputBuffer.getChannelData(0));
      };
      this.source.connect(proc);
      proc.connect(sink);
      this.node = proc;
    }

    _rms(b) {
      let s = 0;
      for (let i = 0; i < b.length; i++) s += b[i] * b[i];
      return Math.sqrt(s / b.length);
    }

    _onMonoBlock(input) {
      const K = LenaEnergyDiarizeCapture;
      if (!input?.length) return;
      const rms = this._rms(input);
      this.env = Math.max(rms, this.env * K.ENV_DECAY);
      this.peak = Math.max(this.env, this.peak * K.PEAK_DECAY);
      if (rms < this.noise * 1.6) {
        this.noise = 0.97 * this.noise + 0.03 * Math.max(rms, 1e-5);
      }

      const loudThr = Math.max(
        K.LOUD_MIN,
        this.peak > K.PEAK_FLOOR ? this.peak * K.LOUD_PEAK_FRAC : K.LOUD_MIN,
      );
      const quietFloor = Math.max(K.QUIET_MIN, this.noise * 2.8);

      let toArzt = false;
      let toPat = false;
      if (this.env >= loudThr) {
        toArzt = true;
      } else if (this.env >= quietFloor && this.env < loudThr * 0.85) {
        toPat = true;
      }

      this.envArzt = toArzt ? Math.max(this.env, this.envArzt * K.ENV_DECAY)
        : this.envArzt * K.ENV_DECAY;
      this.envPat = toPat ? Math.max(this.env, this.envPat * K.ENV_DECAY)
        : this.envPat * K.ENV_DECAY;

      if (this.silence.length !== input.length) {
        this.silence = new Float32Array(input.length);
        this.boostBuf = new Float32Array(input.length);
      }
      if (toArzt) {
        this._pushSide(this.Arzt, input);
        this._pushSide(this.Pat, this.silence);
      } else if (toPat) {
        const g = Math.min(K.MAX_GAIN, Math.max(1.4, K.TARGET_RMS / Math.max(this.env, 1e-4)));
        for (let i = 0; i < input.length; i++) {
          this.boostBuf[i] = Math.max(-1, Math.min(1, input[i] * g));
        }
        this._pushSide(this.Pat, this.boostBuf);
        this._pushSide(this.Arzt, this.silence);
      } else {
        this._pushSide(this.Arzt, this.silence);
        this._pushSide(this.Pat, this.silence);
      }
    }

    _normText(t) {
      return t.toLowerCase().replace(/[^a-zäöüß0-9 ]+/gi, " ").replace(/\s+/g, " ").trim();
    }
    _bigramSim(a, b) {
      if (!a || !b) return 0;
      if (a === b) return 1;
      const grams = (s) => {
        const m = new Map();
        for (let i = 0; i < s.length - 1; i++) {
          const g = s.slice(i, i + 2);
          m.set(g, (m.get(g) || 0) + 1);
        }
        return m;
      };
      const ga = grams(a);
      const gb = grams(b);
      let overlap = 0;
      let total = 0;
      ga.forEach((n, g) => { overlap += Math.min(n, gb.get(g) || 0); total += n; });
      gb.forEach((n) => { total += n; });
      return total ? (2 * overlap) / total : 0;
    }
    _isDedupe(ch, text) {
      const K = LenaEnergyDiarizeCapture;
      const now = Date.now();
      const norm = this._normText(text);
      this.recentFinals = this.recentFinals.filter((f) => now - f.at < K.DEDUPE_WINDOW_MS);
      if (norm.length >= 12) {
        for (const f of this.recentFinals) {
          if (f.ch === ch) continue;
          if (this._bigramSim(norm, f.norm) >= K.DEDUPE_SIM) return true;
        }
      }
      this.recentFinals.push({ ch, norm, at: now });
      if (this.recentFinals.length > 12) this.recentFinals.shift();
      return false;
    }

    _pushSide(side, input) {
      const ws = side.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN || !input?.length) return;
      const ratio = this.srcRate / 16000;
      let pos = side.pos;
      while (pos < input.length) {
        const i = Math.floor(pos);
        const frac = pos - i;
        const a = input[i] || 0;
        const b = input[i + 1] !== undefined ? input[i + 1] : a;
        side.buf.push(Math.max(-1, Math.min(1, a + (b - a) * frac)));
        pos += ratio;
      }
      side.pos = pos - input.length;
      while (side.buf.length >= 960) {
        const chunk = side.buf.splice(0, 960);
        const pcm = new Int16Array(chunk.length);
        for (let k = 0; k < chunk.length; k++) pcm[k] = (chunk[k] * 32767) | 0;
        try { ws.send(pcm.buffer); } catch (_) { return; }
      }
    }

    flush() {
      try { this.Arzt.ws?.send(JSON.stringify({ type: "flush" })); } catch (_) {}
      try { this.Pat.ws?.send(JSON.stringify({ type: "flush" })); } catch (_) {}
    }
    resume() { try { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); } catch (_) {} }

    async stop() {
      this.closed = true;
      const aws = this.Arzt.ws;
      const pws = this.Pat.ws;
      try {
        this.flush();
        aws?.send(JSON.stringify({ type: "bye" }));
        pws?.send(JSON.stringify({ type: "bye" }));
      } catch (_) {}
      await Promise.all([awaitWsClose(aws, 15000), awaitWsClose(pws, 15000)]);
      this.cleanup();
    }

    cleanup() {
      try { this.node?.disconnect(); } catch (_) {}
      try { this.source?.disconnect(); } catch (_) {}
      try { this._sink?.disconnect(); } catch (_) {}
      // Shared LiveKit-Track NICHT stoppen — sonst ist Claras Mikro tot.
      if (this._ownTracks) {
        try { this.stream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
      }
      try { this.ctx?.close(); } catch (_) {}
      for (const side of [this.Arzt, this.Pat]) {
        try { if (side.ws && side.ws.readyState <= 1) side.ws.close(); } catch (_) {}
        side.ws = null;
        side.buf = [];
        side.pos = 0;
      }
      this.node = this.source = this.stream = this.ctx = this._sink = null;
      this.env = this.peak = this.envArzt = this.envPat = 0;
      this.activeMic = null;
    }
  }

  /**
   * Startet den passenden Dual-Capture fuer micMode.
   * @returns {Promise<object|null>} laufende Capture-Instanz oder null
   */
  async function startLenaDualCapture(opts, cb) {
    const mode = normalizeMicMode(opts?.micMode || loadMicMode());
    const base = Object.assign({}, opts || {}, { micMode: mode });

    if (mode === "usb") {
      const c = new LenaStereoSplitCapture();
      return (await c.start(base, cb)) ? c : null;
    }
    if (mode === "bluetooth") {
      // Ein Headset: Stream von Clara teilen, Energie laut/leise.
      if (!base.sharedStream || !base.sharedStream.getAudioTracks?.().length) {
        cb?.onError?.("Clara-Mikro fehlt — zuerst mit Clara verbinden (Headset).");
        return null;
      }
      const c = new LenaEnergyDiarizeCapture();
      return (await c.start(base, cb)) ? c : null;
    }
    // iPad: erst echte Stereo-Kanaele versuchen, sonst Energie-Diarize
    const stereo = new LenaStereoSplitCapture();
    const okStereo = await stereo.start(
      Object.assign({}, base, { allowMonoFallback: true, micMode: "ipad" }),
      cb,
    );
    if (okStereo && (stereo.activeMic?.channelCount || 0) >= 2) return stereo;
    try { await stereo.stop(); } catch (_) { try { stereo.cleanup(); } catch (_) {} }
    const energy = new LenaEnergyDiarizeCapture();
    return (await energy.start(Object.assign({}, base, { micMode: "ipad" }), cb)) ? energy : null;
  }

  /**
   * Nur Pegel-Preview (kein STT/WS) — vor der Aufnahme L/R bzw. Laut/Leise zuordnen.
   */
  class LenaMicPreview {
    constructor() {
      this.ctx = null;
      this.stream = null;
      this.source = null;
      this.node = null;
      this._sink = null;
      this.envL = 0;
      this.envR = 0;
      this.envArzt = 0;
      this.envPat = 0;
      this.peak = 0;
      this.stereo = false;
      this.energy = false;
      this.teeArzt = false;
      this.swap = false;
      this._ownTracks = true;
      this.activeMic = null;
      this._running = false;
    }

    level() {
      return Math.max(this.levelL(), this.levelR(), this.levelArzt(), this.levelPat());
    }
    levelL() { return Math.min(1, this.envL * 4.5); }
    levelR() { return Math.min(1, this.envR * 4.5); }
    levelArzt() { return Math.min(1, this.envArzt * 4.5); }
    levelPat() { return Math.min(1, this.envPat * 4.5); }
    levelsAp() {
      if (this.energy) return { a: this.levelArzt(), p: this.levelPat() };
      if (!this.stereo) return { a: 0, p: this.levelL() };
      if (this.swap) return { a: this.levelL(), p: this.levelR() };
      return { a: this.levelR(), p: this.levelL() };
    }
    setSwap(v) {
      this.swap = !!v;
    }

    async start(opts) {
      await this.stop();
      this._running = true;
      const mode = normalizeMicMode(opts?.micMode || loadMicMode());
      this.stereo = mode === "usb";
      this.teeArzt = false;
      this.energy = mode === "bluetooth" || mode === "ipad";
      this.swap = !!(opts?.swapLR ?? loadStereoSwap());
      this._ownTracks = true;

      const shared = opts?.sharedStream;
      if (shared && typeof shared.getAudioTracks === "function" && shared.getAudioTracks().length) {
        this.stream = shared;
        this._ownTracks = false;
      } else {
        const pick = await pickAudioInput(mode);
        if (!pick.ok) {
          this.activeMic = { mode, warning: pick.error, label: "" };
          this._running = false;
          return false;
        }

        const wantStereo = mode === "usb";
        const audioConstraints = wantStereo
          ? {
              channelCount: { ideal: 2 },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : {
              channelCount: mode === "ipad" ? { ideal: 2 } : 1,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            };
        const deviceId = pick.deviceId || "";
        if (deviceId && deviceId !== "default" && deviceId !== "communications") {
          audioConstraints.deviceId = { exact: deviceId };
        }

        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch (e) {
          try {
            delete audioConstraints.deviceId;
            if (deviceId) audioConstraints.deviceId = deviceId;
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
          } catch (e2) {
            this.activeMic = { mode, warning: "Mikrofon: " + (e2?.name || e2), label: "" };
            this._running = false;
            return false;
          }
        }
      }

      if (!this._running) {
        this.cleanup();
        return false;
      }

      const track = this.stream.getAudioTracks()[0];
      const settings = track?.getSettings?.() || {};
      const chCount = Number(settings.channelCount) || 0;
      const wantStereo = mode === "usb";
      this.stereo = wantStereo && chCount >= 2 && this._ownTracks;
      this.energy = !this.stereo && (mode === "bluetooth" || mode === "ipad");
      this.activeMic = {
        mode,
        label: track?.label || "",
        deviceId: settings.deviceId || "",
        channelCount: chCount,
        swap: this.swap,
        energy: this.energy,
        shared: !this._ownTracks,
        warning: wantStereo && chCount < 2
          ? "Eingang nur " + (chCount || "?") + " Kanal — Empfänger auf STEREO."
          : (!this._ownTracks
            ? "Ein Headset · laut=Arzt, leise=Patient (Test)"
            : ""),
      };

      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        if (this.ctx.state === "suspended") await this.ctx.resume();
        this.source = this.ctx.createMediaStreamSource(this.stream);
        const sink = this.ctx.createGain();
        sink.gain.value = 0;
        sink.connect(this.ctx.destination);
        this._sink = sink;

        if (this.stereo && this.ctx.audioWorklet && window.AudioWorkletNode) {
          const blobUrl = URL.createObjectURL(new Blob([WORKLET_STEREO_SRC], { type: "application/javascript" }));
          try {
            await this.ctx.audioWorklet.addModule(blobUrl);
            const node = new AudioWorkletNode(this.ctx, "lena-capture-stereo", {
              numberOfInputs: 1,
              numberOfOutputs: 1,
              channelCount: 2,
              channelCountMode: "explicit",
              channelInterpretation: "discrete",
            });
            node.port.onmessage = (ev) => {
              const d = ev.data;
              if (d && d.l) this._onBlock(d.l, d.r || null);
            };
            this.source.connect(node);
            node.connect(sink);
            this.node = node;
            return true;
          } catch (_) {
            /* ScriptProcessor-Fallback */
          } finally {
            try { URL.revokeObjectURL(blobUrl); } catch (_) {}
          }
        }

        const chIn = this.stereo ? 2 : 1;
        const proc = this.ctx.createScriptProcessor(2048, chIn, chIn);
        proc.onaudioprocess = (ev) => {
          const ib = ev.inputBuffer;
          const l = ib.getChannelData(0);
          const r = ib.numberOfChannels > 1 ? ib.getChannelData(1) : null;
          this._onBlock(l, r);
        };
        this.source.connect(proc);
        proc.connect(sink);
        this.node = proc;
        return true;
      } catch (e) {
        this.activeMic = {
          mode,
          warning: "Pegel-Preview: " + (e?.message || e),
          label: this.activeMic?.label || "",
        };
        this.cleanup();
        return false;
      }
    }

    _rms(b) {
      let s = 0;
      for (let i = 0; i < b.length; i++) s += b[i] * b[i];
      return Math.sqrt(s / b.length);
    }

    _onBlock(l, r) {
      const decay = 0.85;
      if (this.stereo) {
        this.envL = Math.max(this._rms(l), this.envL * decay);
        this.envR = Math.max(r && r.length === l.length ? this._rms(r) : 0, this.envR * decay);
        return;
      }
      const rms = this._rms(l);
      const env = Math.max(rms, Math.max(this.envArzt, this.envPat) * decay);
      this.peak = Math.max(env, this.peak * 0.9992);
      const loudThr = Math.max(0.035, this.peak > 0.02 ? this.peak * 0.42 : 0.035);
      if (env >= loudThr) {
        this.envArzt = Math.max(env, this.envArzt * decay);
        this.envPat *= decay;
      } else if (env >= 0.009) {
        this.envPat = Math.max(env, this.envPat * decay);
        this.envArzt *= decay;
      } else {
        this.envArzt *= decay;
        this.envPat *= decay;
      }
      this.envL = env;
      this.envR = 0;
    }

    async stop() {
      this._running = false;
      this.cleanup();
    }

    cleanup() {
      try { this.node?.disconnect(); } catch (_) {}
      try { this.source?.disconnect(); } catch (_) {}
      try { this._sink?.disconnect(); } catch (_) {}
      if (this._ownTracks) {
        try { this.stream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
      }
      try { this.ctx?.close(); } catch (_) {}
      this.node = this.source = this.stream = this.ctx = this._sink = null;
      this.envL = this.envR = this.envArzt = this.envPat = this.peak = 0;
    }
  }

  global.LenaSttCapture = LenaSttCapture;
  global.LenaStereoSplitCapture = LenaStereoSplitCapture;
  global.LenaEnergyDiarizeCapture = LenaEnergyDiarizeCapture;
  global.startLenaDualCapture = startLenaDualCapture;
  global.LenaMicPreview = LenaMicPreview;
  global.resolveLenaSttWs = resolveLenaSttWs;
  global.lenaListAudioInputs = listAudioInputs;
  global.lenaPickAudioInput = pickAudioInput;
  global.lenaLoadMicMode = loadMicMode;
  global.lenaSaveMicMode = saveMicMode;
  global.lenaNormalizeMicMode = normalizeMicMode;
  global.lenaLoadStereoSwap = loadStereoSwap;
  global.lenaSaveStereoSwap = saveStereoSwap;
})(window);
