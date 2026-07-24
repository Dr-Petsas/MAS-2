import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";
import { todayBerlin } from "./clara/daySchedule.js";
import { dokuAbendlauf } from "./clara/dokuWaechter.js";
import { runProaktivSweep } from "./clara/interruptPolicy.js";
import { sweepRecallOutcomes, dailyInitiativeScan } from "./clara/recallCoach.js";
import { sweepAbsenceRebookings } from "./clara/absencePlanner.js";
import { runRetentionSweep } from "./brain/retention.js";
import { materializeDueJobs as qmMaterializeDueJobs } from "./qm/schedules.js";
import { runEscalationSweep as qmRunEscalationSweep } from "./qm/notify.js";
import { finalizeLisaCalls, callConfigured as lisaCallConfigured } from "./lisa/outbound.js";
import { syncLisaAgentTools } from "./lisa/agentTools.js";
import { ingestBiancaCalls, biancaConfigured } from "./bianca/ingest.js";
import { backfillAddressBook } from "./brain/addressBook.js";
import { startMailScheduler } from "./mail/scheduler.js";
import { llmInfo } from "./mail/letterAI.js";
import { isLocalLlm } from "./mail/llm.js";
import { authMiddleware, AUTH_ENFORCED } from "./auth.js";
import admin from "./firebase.js";
import { log } from "./log.js";
import miscRouter from "./routes/misc.js";
import toolsRouter from "./routes/tools.js";
import qmRouter from "./routes/qm.js";
import brainRouter from "./routes/brain.js";
import mailRouter from "./routes/mail.js";
import testtrainRouter from "./routes/testtrain.js";
import devicesRouter from "./routes/devices.js";
import lisaToolsRouter from "./routes/lisaTools.js";
import treatmentRouter from "./routes/treatment.js";
import trainingRouter from "./routes/training.js";
import claraRouter from "./routes/clara.js";
import { DEFAULT_CLIENT_ID, PUBLIC_BASE_URL } from "./routes/_shared.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// 25mb: Nadines Composer erlaubt bis 15 MB Anhaenge pro Mail; base64 in JSON
// blaeht das auf ~20 MB auf. Mit dem alten 8mb-Limit scheiterte /mail/send ab
// ~6 MB echter Dateigroesse mit einem nichtssagenden HTTP 413.
app.use(express.json({ limit: "25mb" }));

// Request id + structured access log. We log method, route path (NOT the query
// string, which can carry patient names in ?q=), status, duration and the
// resolved tenant — never PII. The id is echoed in X-Request-Id for tracing.
app.use((req, res, next) => {
  const requestId = req.header("X-Request-Id") || randomUUID();
  req.requestId = requestId;
  res.set("X-Request-Id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    log.info("request", {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      clientId: req.auth?.clientId || undefined,
      auth: req.auth?.kind || undefined,
    });
  });
  next();
});

// CORS: the platform (CalendR) runs on a different origin and calls the session
// endpoints from the browser. Allow it. ALLOWED_ORIGINS (comma-separated) locks
// this down in production; default "*" is fine for local dev.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").trim();
app.use((req, res, next) => {
  const origin = req.header("Origin");
  if (ALLOWED_ORIGINS === "*") {
    res.set("Access-Control-Allow-Origin", origin || "*");
  } else if (origin && ALLOWED_ORIGINS.split(",").map((s) => s.trim()).includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  // ngrok-skip-browser-warning: das Frontend sendet ihn, damit der ngrok-Tunnel
  // (Produktion) keine Interstitial-Seite vor API-Antworten schaltet.
  res.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Client-Id,X-Service-Token,X-User-Id,X-User-Admin,ngrok-skip-browser-warning");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// iOS-Kopplung: token-spezifisches Manifest. Apple gibt einer zum
// Home-Bildschirm hinzugefuegten Web-App einen EIGENEN Speicher, getrennt von
// Safari — der vor dem Hinzufuegen in Safari zwischengespeicherte QR-Token ist
// darin unsichtbar. Folge: die App startet an ihrer start_url (call.html),
// findet keinen Code und landet auf "kein Verbindungscode gefunden".
// Loesung: Wenn die Kopplungsseite das Manifest mit ?c=&t= anfordert, backen
// wir den Code in die start_url -> die installierte App startet direkt auf
// pair.html MIT dem Code, ganz ohne Safari-Speicher. Muss VOR express.static
// stehen, sonst gewinnt die statische Datei. no-store, damit iOS den Token
// nicht aus dem Cache zieht.
app.get("/m/manifest.webmanifest", (req, res) => {
  const c = String(req.query.c || "").trim();
  const t = String(req.query.t || "").trim();
  const manifest = {
    name: "Clara – Praxis-Assistentin",
    short_name: "Clara",
    description: "Clara ruft dich an: Briefings und Rückfragen deiner Praxis-KI direkt aufs Handy.",
    display: "standalone",
    background_color: "#0a1322",
    theme_color: "#0a1322",
    scope: "/m/",
    start_url: (c && t)
      ? `/m/pair.html?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}`
      : "/m/call.html",
    icons: [
      { src: "/m/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/m/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/m/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  res.set("Content-Type", "application/manifest+json");
  res.set("Cache-Control", "no-store");
  res.json(manifest);
});

// iPad-Arbeitsplatz-Manifest — gleiche iOS-Falle wie beim Handy: die installierte
// App hat einen eigenen Speicher, der in Safari getippte Code ist darin unsichtbar.
// Loesung analog: fordert ipad.html das Manifest mit ?code= an, backen wir den
// Code in die start_url -> die installierte App startet auf ipad.html MIT dem Code
// (koppelt sich dort push-frei selbst). Ohne Code startet sie direkt in der App.
app.get("/m/ipad.webmanifest", (req, res) => {
  const code = String(req.query.code || "").trim();
  const manifest = {
    name: "pickadoc – Arbeitsplatz",
    short_name: "pickadoc",
    description: "Behandlungszimmer am iPad: Clara Sprechzimmer & Lena Dokumentation.",
    display: "standalone",
    orientation: "any",
    background_color: "#0b0410",
    theme_color: "#0b0410",
    scope: "/m/",
    start_url: code ? `/m/ipad.html?code=${encodeURIComponent(code)}` : "/m/ipad-app.html",
    icons: [
      { src: "/m/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/m/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/m/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  res.set("Content-Type", "application/manifest+json");
  res.set("Cache-Control", "no-store");
  res.json(manifest);
});

// Companion-Seiten (Handy/iPad) NIE cachen — sonst zeigt eine installierte
// Home-Bildschirm-App (iOS cached start_url hartnaeckig) veraltete Stände, obwohl
// der Server längst die neue Oberfläche ausliefert. Muss VOR express.static stehen.
// Gilt auch fuer die Lena-JS-Module: am 21.07. lief das iPad stundenlang mit
// altem lena-doku-template-zahn.js aus dem Safari-Cache (?v= nicht gebumpt) —
// Befund-Diktate verschwanden, obwohl der Server laengst den Fix auslieferte.
app.use((req, res, next) => {
  if (/^\/m\/(ipad|ipad-app|preview|pair|call|lena-01|lena-training)\.html$/.test(req.path) ||
      /^\/m\/lena-01\//.test(req.path) ||
      /^\/m\/lena-[\w-]+\.js$/.test(req.path)) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});

app.use(express.static(path.join(__dirname, "..", "public")));

// Authentication: verify the caller (Firebase ID token or service secret) before
// any route runs. Public routes (/health, PIN-gated phone endpoints) are allowed
// through inside the middleware. See src/auth.js.
app.use(authMiddleware());

// ---------------------------------------------------------------------------
// Domaenen-Router (W1.2-Split, 04.07.2026). Jede Route traegt ihren vollen
// Original-Pfad; gemountet wird ohne Prefix, daher identisches Matching wie
// vor dem Split. REIHENFOLGE WICHTIG: clara MUSS zuletzt kommen, weil es die
// /clara/:clientId-Catch-all-Seiten enthaelt - qm (/clara/qm/*) und devices
// (/clara/devices*) muessen vorher greifen.
// ---------------------------------------------------------------------------
app.use(miscRouter);
app.use(toolsRouter);
app.use(qmRouter);
app.use(brainRouter);
app.use(mailRouter);
app.use(testtrainRouter);
app.use(devicesRouter);
app.use(lisaToolsRouter);
app.use(treatmentRouter);
app.use(trainingRouter);
app.use(claraRouter);


// Unknown route -> consistent JSON 404 (never an HTML/empty body).
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found", path: req.path });
});

// Central error handler: any error thrown/forwarded from a route lands here with
// a consistent shape. 4-arg signature is required for Express to treat it as the
// error handler. Avoids leaking stack traces to clients.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = Number(err?.status || err?.statusCode) || 500;
  log.error("request error", { requestId: req.requestId, method: req.method, path: req.path, status, err });
  if (res.headersSent) return;
  res.status(status).json({ ok: false, error: String(err?.message || err) || "internal_error" });
});

// Don't let a stray rejection/exception silently kill the process unseen.
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", { err: reason instanceof Error ? reason : new Error(String(reason)) });
});
process.on("uncaughtException", (err) => {
  log.error("uncaughtException", { err });
});

const PORT = Number(process.env.PORT || 4000);

// DSGVO guard: patient content must stay on the practice network. If the LLM
// endpoint is not local/private, warn loudly — and refuse to start when
// MAS_LLM_REQUIRE_LOCAL=1, so a misconfigured cloud endpoint can't leak data.
function assertLocalLlm() {
  const info = llmInfo();
  const local = isLocalLlm(info.base);
  if (local) {
    log.info("llm endpoint local", { base: info.base, model: info.model });
    return;
  }
  if (String(process.env.MAS_LLM_REQUIRE_LOCAL || "") === "1") {
    log.error("llm endpoint NOT local — refusing to start (MAS_LLM_REQUIRE_LOCAL=1)", { base: info.base });
    process.exit(1);
  }
  log.warn("llm endpoint is NOT local — patient data may leave the practice network", { base: info.base, model: info.model });
}

// Aktuelle öffentliche Backend-URL nach Firestore veröffentlichen
// (settings/masRuntime, public read). Die deployte Web-App löst die MAS-URL
// ZUR LAUFZEIT von dort auf — die Cloudflare-Quick-Tunnel-URL wechselt bei
// jedem Tunnel-Neustart, eine im Frontend-Build eingebackene URL veraltet
// zwangsläufig ("Failed to fetch" beim Handy-Koppeln). Nur HTTPS-URLs werden
// veröffentlicht, damit ein lokaler Dev-Boot (127.0.0.1) die Produktion
// niemals umbiegt.
async function publishRuntimeConfig() {
  if (!PUBLIC_BASE_URL.startsWith("https://")) {
    log.info("runtime config not published (PUBLIC_BASE_URL not public https)", { baseUrl: PUBLIC_BASE_URL });
    return;
  }
  try {
    await admin.firestore().collection("settings").doc("masRuntime").set({
      baseUrl: PUBLIC_BASE_URL.replace(/\/+$/, ""),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    log.info("runtime config published", { baseUrl: PUBLIC_BASE_URL });
  } catch (e) {
    log.warn("runtime config publish failed", { err: String(e?.message || e) });
  }
}

// W-OUTREACH-2: Lisas Kalender-Webhook-Tools (offer_slots/book_slot) am
// ElevenLabs-Agenten mit der AKTUELLEN öffentlichen URL verdrahten. Die
// Tunnel-URL wechselt bei Neustarts — ohne diesen Abgleich zeigen die Tools
// ins Leere und Lisa kann im Gespräch nicht mehr buchen. Best-effort: ein
// Fehler hier darf den Boot nie stoppen.
async function syncLisaTools() {
  try {
    const r = await syncLisaAgentTools({ baseUrl: PUBLIC_BASE_URL });
    if (!r.ok) log.info("lisa agent tools not synced", { reason: r.reason });
  } catch (e) {
    log.warn("lisa agent tools sync failed", { err: String(e?.message || e) });
  }
}

// Lena-STT WebSocket-Proxy: iPad holt wss vom Named-Tunnel (mas.pickadoc-tunnel.com)
// statt fragiler Quick-Tunnel. Pfad /lena-stt → lokal ws://127.0.0.1:8140/stt.
const LENA_STT_PORT = Number(process.env.LENA_STT_PORT || 8140);
const server = http.createServer(app);
server.on("upgrade", (req, socket, head) => {
  const rawUrl = String(req.url || "");
  if (!rawUrl.startsWith("/lena-stt")) {
    socket.destroy();
    return;
  }
  let targetPath = "/stt";
  try {
    const u = new URL(rawUrl, "http://127.0.0.1");
    // /lena-stt  oder  /lena-stt/stt  (+ Query channel/session)
    targetPath = "/stt" + (u.search || "");
  } catch {
    /* keep /stt */
  }
  const headers = { ...req.headers, host: `127.0.0.1:${LENA_STT_PORT}` };
  const proxyReq = http.request({
    hostname: "127.0.0.1",
    port: LENA_STT_PORT,
    path: targetPath,
    method: "GET",
    headers,
  });
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    const lines = ["HTTP/1.1 101 Switching Protocols"];
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => lines.push(`${k}: ${x}`));
      else lines.push(`${k}: ${v}`);
    }
    lines.push("", "");
    socket.write(lines.join("\r\n"));
    if (proxyHead?.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxyReq.on("error", (err) => {
    log.warn("lena-stt proxy upgrade failed", { err: String(err?.message || err) });
    try { socket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n"); } catch { /* noop */ }
    try { socket.destroy(); } catch { /* noop */ }
  });
  socket.on("error", () => { try { proxyReq.destroy(); } catch { /* noop */ } });
  proxyReq.end();
  if (head?.length) {
    // head already belongs to the client socket stream after upgrade;
    // http.request('upgrade') handles the handshake without needing head write.
  }
});

// Lena-Provider registrieren (GUARDED, 23.07.2026): ein defektes oder neu
// gebautes Lena darf den Server-Boot NICHT verhindern. Schlaegt der Import fehl,
// bleiben nur Lenas Doku-Funktionen deaktiviert (sichere Defaults ueber
// shared/lenaBridge) — Clara und der restliche Server laufen unbeschadet weiter.
try {
  await import("./lena/register.js");
  log.info("lena provider registered");
} catch (e) {
  log.warn("lena provider not loaded", { error: String(e?.message || e) });
}

server.listen(PORT, () => {
  assertLocalLlm();
  log.info("backend listening", { port: PORT, authEnforced: AUTH_ENFORCED, lenaSttProxy: LENA_STT_PORT });
  publishRuntimeConfig();
  syncLisaTools();
  startMailScheduler();
  // Lisa call finalizer: fetch transcripts of finished outbound calls and
  // write the outcome to the shared brain. Cheap no-op when nothing is calling.
  if (lisaCallConfigured() && DEFAULT_CLIENT_ID) {
    setInterval(() => {
      finalizeLisaCalls(DEFAULT_CLIENT_ID).catch((e) =>
        log.warn("lisa.finalize_loop_error", { error: String(e?.message || e) })
      );
    }, 15_000);
    log.info("lisa finalizer enabled", { intervalMs: 15_000 });
  }

  // Bianca-Ingest (Telefon-Loop, 12.06.2026): beendete Inbound-Gespräche des
  // ConvAI-Agenten als bianca_call-Events ins Praxisgedächtnis holen — damit
  // Clara Anrufe kennt ("Waren Anrufe für mich da?") und Rückrufer für Bianca
  // Kontext haben. Billig im Leerlauf (eine Listen-Abfrage pro Takt).
  if (biancaConfigured() && DEFAULT_CLIENT_ID) {
    setInterval(() => {
      ingestBiancaCalls(DEFAULT_CLIENT_ID, { port: PORT }).catch((e) =>
        log.warn("bianca.ingest_loop_error", { error: String(e?.message || e) })
      );
    }, 30_000);
    log.info("bianca ingest enabled", { intervalMs: 30_000 });
  }

  // Adressbuch-Backfill: Bestands-Telefonate (Brain) und Nummern aus Mail-
  // Signaturen einmalig ins geteilte Adressbuch holen. Marker-Dokument macht
  // Folge-Starts zum No-op.
  if (DEFAULT_CLIENT_ID) {
    backfillAddressBook(DEFAULT_CLIENT_ID).catch((e) =>
      log.warn("addressbook.backfill_error", { error: String(e?.message || e) })
    );
  }

  if (lisaCallConfigured() && DEFAULT_CLIENT_ID) {

    // Recall-Sweep: ordnet beendete Lisa-Calls den Anruflisten zu, bucht
    // Zusagen direkt fest und schickt SMS-Fallbacks. Billig im Leerlauf.
    setInterval(() => {
      sweepRecallOutcomes(DEFAULT_CLIENT_ID).catch((e) =>
        log.warn("recall.sweep_error", { error: String(e?.message || e) })
      );
    }, 60_000);

    // Abwesenheits-Rückkanal: erkennt Neubuchungen abgesagter Patienten und
    // schreibt die Verschiebe-Notiz in den neuen Termin (Kalender-Quittung).
    setInterval(() => {
      sweepAbsenceRebookings(DEFAULT_CLIENT_ID).catch((e) =>
        log.warn("absence.sweep_error", { error: String(e?.message || e) })
      );
    }, 300_000);

    // Datensparsamkeit: täglicher Aufräumlauf (ab 3 Uhr nachts, einmal pro
    // Tag). Löscht Nachrichten, Tickets und Gedächtnis-Einträge älter als
    // RETENTION_DAYS endgültig — idempotent, daher unkritisch bei Neustarts.
    let lastRetentionDay = "";
    setInterval(async () => {
      try {
        const hh = Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).format(new Date()));
        const today = todayBerlin();
        if (hh >= 3 && lastRetentionDay !== today) {
          lastRetentionDay = today;
          const out = await runRetentionSweep(DEFAULT_CLIENT_ID);
          log.info("retention.daily_run", out);
        }
      } catch (e) {
        log.warn("retention.daily_error", { error: String(e?.message || e) });
      }
    }, 1_800_000);
  }

  // Recall-Initiative: Abend-Scan (ab 18 Uhr für MORGEN) + Morgen-Scan (ab
  // 7:30 für HEUTE). Läuft je einmal pro Tag; der Push selbst ist zusätzlich
  // über lastPushDay dedupliziert (max. 1 Push pro Tag, Entscheidung Chef).
  if (DEFAULT_CLIENT_ID) {
    const initiativeRuns = { evening: "", morning: "" };
    setInterval(async () => {
      try {
        const now = new Date();
        const berlinHM = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
        const [hh, mm] = berlinHM.split(":").map(Number);
        const today = todayBerlin();
        if (hh >= 18 && initiativeRuns.evening !== today) {
          initiativeRuns.evening = today;
          const tomorrow = new Date(now.getTime() + 86400000);
          const tIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrow);
          const out = await dailyInitiativeScan(DEFAULT_CLIENT_ID, { targetDate: tIso, publicBaseUrl: PUBLIC_BASE_URL });
          log.info("recall.evening_scan", { date: tIso, worthIt: out.worthIt, pushed: out.pushed });
        } else if ((hh > 7 || (hh === 7 && mm >= 30)) && hh < 12 && initiativeRuns.morning !== today) {
          initiativeRuns.morning = today;
          const out = await dailyInitiativeScan(DEFAULT_CLIENT_ID, { targetDate: today, publicBaseUrl: PUBLIC_BASE_URL });
          log.info("recall.morning_scan", { date: today, worthIt: out.worthIt, pushed: out.pushed });
        }
      } catch (e) {
        log.warn("recall.initiative_scheduler_error", { error: String(e?.message || e) });
      }
    }, 5 * 60_000);
    log.info("recall initiative scheduler enabled");
  }

  // QM (Julia): wiederkehrende Erinnerungen zu fälligen Jobs materialisieren und
  // offene/überfällige Jobs erneut anstupsen bzw. eskalieren. Billig im Leerlauf
  // (zwei Firestore-Reads pro Takt). Push-Versand respektiert die Ruhezeiten.
  if (DEFAULT_CLIENT_ID) {
    setInterval(async () => {
      try {
        await qmMaterializeDueJobs(DEFAULT_CLIENT_ID, {});
        await qmRunEscalationSweep(DEFAULT_CLIENT_ID, { publicBaseUrl: PUBLIC_BASE_URL });
      } catch (e) {
        log.warn("qm.scheduler_error", { error: String(e?.message || e) });
      }
    }, 5 * 60_000);
    log.info("qm scheduler enabled", { intervalMs: 5 * 60_000 });
  }

  // Doku-Wächter (04.07.2026): Abendlauf ab 18 Uhr — fehlen Behandlungsdokus,
  // ruft Clara den Chef aktiv auf dem Handy an ("3 Dokus fehlen noch, fangen
  // wir mit Herrn X an ...") und arbeitet die Liste im Gespräch einzeln ab.
  // Anti-Nerv: der Lauf selbst dedupliziert auf einen Anruf pro Tag.
  if (DEFAULT_CLIENT_ID) {
    let lastDokuRun = "";
    setInterval(async () => {
      try {
        const hh = Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).format(new Date()));
        const today = todayBerlin();
        if (hh >= 18 && hh < 21 && lastDokuRun !== today) {
          lastDokuRun = today;
          const out = await dokuAbendlauf(DEFAULT_CLIENT_ID, { publicBaseUrl: PUBLIC_BASE_URL });
          log.info("doku.abendlauf", out);
        }
      } catch (e) {
        log.warn("doku.abendlauf_error", { error: String(e?.message || e) });
      }
    }, 5 * 60_000);
    log.info("doku waechter scheduler enabled");
  }

  // Proaktiv-Engine (Masterplan Phase 5, 04.07.2026): alle 5 Minuten pruefen,
  // ob NEUE P0/P1-Punkte in der ASAP-Queue liegen. P0 -> ein aktiver Anruf pro
  // Tag, P1 -> Push in der naechsten Kalenderluecke (Budget 3/Tag). Der erste
  // Lauf markiert den Bestand nur als bekannt (Baseline) und meldet nichts.
  // Not-Aus: MAS_PROAKTIV=0 oder mas_config/proaktiv { enabled: false }.
  if (DEFAULT_CLIENT_ID && process.env.MAS_PROAKTIV !== "0") {
    setInterval(async () => {
      try {
        const out = await runProaktivSweep(DEFAULT_CLIENT_ID, { publicBaseUrl: PUBLIC_BASE_URL });
        if (out?.announced || out?.baselined) log.info("proaktiv.sweep_result", out);
      } catch (e) {
        log.warn("proaktiv.sweep_error", { error: String(e?.message || e) });
      }
    }, 5 * 60_000);
    log.info("proaktiv scheduler enabled", { intervalMs: 5 * 60_000 });
  }
});
