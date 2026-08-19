import "dotenv/config";
import http from "node:http";
import express from "express";
import demoRouter from "./routes/demo.js";
import { log } from "./log.js";

// ============================================================================
// Eigener MAS-Prozess NUR fuer die Erlebnis-Demo (Chef 19.08.2026).
//
// Autark: startet OHNE Clara-Router, OHNE Scheduler, OHNE Telefon-Clara.
// Clara v7 (F:\Clara-Voice und F:\Clara-Voice-dev) wird nicht geladen.
// Sprache laeuft ueber die Kopie F:\Clara-Voice-DemoClara + lokalen LiveKit.
//
// Start:  powershell -File F:\MAS-2\start-demo-mas.ps1
// Port:   4010 (DEMO_MAS_PORT), Haupt-MAS bleibt 4000.
// ============================================================================

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const origin = req.header("Origin");
  res.set("Access-Control-Allow-Origin", origin || "*");
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,Authorization,ngrok-skip-browser-warning");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, dienst: "demo-mas", clara: "unberuehrt" });
});
app.use(demoRouter);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found", path: req.path, dienst: "demo-mas" });
});

const PORT = Number(process.env.DEMO_MAS_PORT || 4010);
const server = http.createServer(app);
server.listen(PORT, "127.0.0.1", () => {
  log.info("demo-mas listening", { port: PORT, bind: "127.0.0.1" });
});
