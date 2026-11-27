// Reine Weiterleitung /lisa-v8/* -> Auftragsannahme von Lisa V8 (LAN, pickadoc1:40111).
//
// Die Plattform (Luecke fuellen) erreicht Lisa V8 nur ueber den MAS-Tunnel. Methode, Pfad, Abfrage, Koerper
// und der Kopf Authorization gehen unveraendert durch; den Schluessel prueft Lisa selbst. Das MAS kennt ihn
// nicht, prueft ihn nicht und schreibt weder ihn noch den Koerper ins Log.
//
// Steht in server.js VOR express.json (der Koerper bleibt roh) und vor der Anmeldung (auth.js fuehrt
// /lisa-v8/ als oeffentlich). Zugelassen sind nur die vier Pfade unten, alles andere ist 404.
// Mit Claras Anrufauftraegen (LISA_OUTBOUND_BASE_URL) hat das nichts zu tun.
import express from "express";
import { randomUUID } from "node:crypto";
import { log } from "../log.js";

const ZEITGRENZE_MS = Number(process.env.LISA_V8_PROXY_ZEITGRENZE_MS || 30000);
const KOERPER_GRENZE = "1mb";

function basis() {
  return String(process.env.LISA_V8_BASIS || "http://192.168.0.246:40111").trim().replace(/\/+$/, "");
}

function kennungOk(s) {
  if (!s || s.length > 160) return false;
  for (const z of s) {
    const ok = (z >= "0" && z <= "9") || (z >= "a" && z <= "z") || (z >= "A" && z <= "Z") || z === "-" || z === "_";
    if (!ok) return false;
  }
  return true;
}

/**
 * Der Pfad bei Lisa V8 fuer einen Aufruf unter /lisa-v8, oder "" wenn er nicht zugelassen ist.
 * @param {string} methode
 * @param {string} pfad Pfad hinter /lisa-v8, beginnt mit "/"
 */
export function zielPfad(methode, pfad) {
  const m = String(methode || "").toUpperCase();
  const p = String(pfad || "");
  if (m === "GET" && p === "/gesund") return p;
  if (m === "POST" && (p === "/anruf" || p === "/api/outbound/dial")) return p;
  if (m === "GET" && p.startsWith("/anruf/")) {
    const id = p.slice("/anruf/".length);
    return kennungOk(id) ? `/anruf/${id}` : "";
  }
  return "";
}

const router = express.Router();

router.use(express.raw({ type: () => true, limit: KOERPER_GRENZE }));

router.use(async (req, res) => {
  const start = Date.now();
  const requestId = req.header("X-Request-Id") || randomUUID();
  res.set("X-Request-Id", requestId);
  // Zeile wie das Zugriffslog des Servers (das erst nach diesem Router sitzt): nie Abfrage, Kopf oder Koerper.
  res.on("finish", () => {
    log.info("request", { requestId, method: req.method, path: `/lisa-v8${req.path}`, status: res.statusCode, ms: Date.now() - start });
  });
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", req.header("Origin") || "*");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return res.sendStatus(204);
  }
  const pfad = zielPfad(req.method, req.path);
  if (!pfad) return res.status(404).json({ error: "not_found" });

  const abfrage = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
  const kopf = {};
  for (const name of ["authorization", "content-type", "accept"]) {
    const wert = req.header(name);
    if (wert) kopf[name] = wert;
  }
  const koerper = req.method === "POST" && Buffer.isBuffer(req.body) && req.body.length ? req.body : undefined;
  try {
    const antwort = await fetch(`${basis()}${pfad}${abfrage}`, {
      method: req.method, headers: kopf, body: koerper, redirect: "manual", signal: AbortSignal.timeout(ZEITGRENZE_MS),
    });
    const inhalt = Buffer.from(await antwort.arrayBuffer());
    const art = antwort.headers.get("content-type");
    if (art) res.set("Content-Type", art);
    const origin = req.header("Origin");
    if (origin) { res.set("Access-Control-Allow-Origin", origin); res.set("Vary", "Origin"); }
    res.set("Cache-Control", "no-store");
    res.status(antwort.status).send(inhalt);
  } catch (e) {
    const zeit = e?.name === "TimeoutError" || e?.name === "AbortError";
    log.warn("lisa-v8-proxy", { requestId, path: `/lisa-v8${pfad}`, fehler: zeit ? "zeitgrenze" : "nicht_erreichbar" });
    if (!res.headersSent) res.status(zeit ? 504 : 502).json({ error: zeit ? "lisa_v8_zeitgrenze" : "lisa_v8_nicht_erreichbar" });
  }
});

export default router;
