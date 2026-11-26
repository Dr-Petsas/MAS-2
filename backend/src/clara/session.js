import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import { AccessToken } from "livekit-server-sdk";
import { praxenLesen, zielFuerWeiterePraxis } from "./v8Praxen.js";

// LiveKit endpoint + creds. Defaults match the bundled local SFU dev creds
// from the voice repo (deploy/livekit/livekit.yaml) so a Node-minted token is
// accepted by the same SFU the voice worker connects to. Override in prod.
const LIVEKIT_URL = (process.env.LIVEKIT_URL || "ws://127.0.0.1:7880").trim();
const LIVEKIT_API_KEY = (process.env.LIVEKIT_API_KEY || "pickadoc-dev-key").trim();
const LIVEKIT_API_SECRET = (
  process.env.LIVEKIT_API_SECRET ||
  "pickadoc-dev-secret-2026-05-30-rotate-before-prod-a1b2c3d4e5f6"
).trim();

const TOKEN_TTL_S = Number(process.env.LIVEKIT_TOKEN_TTL_S || 3600);

// --- Clara V8 (F:\\Clara-V8) -------------------------------------------------
// Eigener LiveKit-Server und ausdruecklicher Dispatch an den Agenten "clara-v8":
// die alte Clara (LiveKit-Cloud, automatischer Dispatch) sieht diese Raeume nie.
// Schluessel stehen nur in der .env der Clara V8, nicht doppelt hier.
const V8_ENV = (process.env.CLARA_V8_ENV || "F:\\Clara-V8\\.env").trim();
const V8_URL = (process.env.CLARA_V8_LIVEKIT_PUBLIC_URL || "wss://clarav8.pickadoc-tunnel.com").trim();
const V8_PORT = Number(process.env.CLARA_V8_PORT || 8197);
const V8_AGENT = (process.env.CLARA_V8_AGENT || "clara-v8").trim();
const ALT_PORTS = [8091, 8092, 8093];
// Betriebsmarke: clara-switch.ps1 -Mode v8 schreibt sie, -Mode dev loescht sie.
const V8_MARKE = (process.env.CLARA_V8_MARKE || "F:\\Clara-V8\\.run\\betrieb.txt").trim();

export function v8IstBetrieb() {
  try { return fs.readFileSync(V8_MARKE, "utf8").trim() === "v8"; } catch { return false; }
}

function v8Schluessel() {
  const werte = {};
  for (const zeile of fs.readFileSync(V8_ENV, "utf8").split(/\r?\n/)) {
    const i = zeile.indexOf("=");
    if (i > 0 && !zeile.trim().startsWith("#")) werte[zeile.slice(0, i).trim()] = zeile.slice(i + 1).trim();
  }
  const key = werte.V8_LIVEKIT_SCHLUESSEL, secret = werte.V8_LIVEKIT_GEHEIMNIS;
  if (!key || !secret) throw new Error("Clara V8: LiveKit-Schluessel fehlen in " + V8_ENV);
  return { key, secret };
}

function portOffen(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const fertig = (offen) => { sock.destroy(); resolve(offen); };
    sock.setTimeout(300);
    sock.once("connect", () => fertig(true));
    sock.once("timeout", () => fertig(false));
    sock.once("error", () => fertig(false));
    sock.connect(port, "127.0.0.1");
  });
}

// Wer nimmt das Gespraech an? Steht die Betriebsmarke auf v8 und laeuft die V8, dann
// sie. Sonst die alte Clara; V8 daneben nur auf ausdruecklichen Wunsch (ziel "v8",
// Testphase) oder wenn gar keine alte laeuft. Notaus CLARA_V8=0.
export async function claraZiel(gewuenscht) {
  if (process.env.CLARA_V8 === "0") return "alt";
  const [v8, ...alt] = await Promise.all([V8_PORT, ...ALT_PORTS].map(portOffen));
  if (!v8) return "alt";
  if (v8IstBetrieb() || String(gewuenscht || "").toLowerCase() === "v8") return "v8";
  return alt.some(Boolean) ? "alt" : "v8";
}

// Ziel je Praxis. Die Standardpraxis entscheidet wie bisher (claraZiel). Jede andere Praxis geht nur
// zur Clara V8, wenn sie in der Schalterliste steht (v8Praxen.js); ohne Eintrag bleibt sie beim
// bisherigen Worker. Die Liste ist anfangs leer.
export async function claraZielFuer(clientId, gewuenscht, standardClient) {
  if (clientId === standardClient) return claraZiel(gewuenscht);
  const eintrag = praxenLesen().get(String(clientId || ""));
  if (!eintrag) return "alt";
  return zielFuerWeiterePraxis({
    eintrag, wunsch: gewuenscht, v8Laeuft: await portOffen(V8_PORT),
    betrieb: v8IstBetrieb(), notaus: process.env.CLARA_V8 === "0",
  });
}

async function createV8Session({ clientId, profileId, pipe, metadata, short }) {
  const { key, secret } = v8Schluessel();
  const room = `v8_${clientId}_${short}`;
  const identity = `clara-web-${short}`;
  const at = new AccessToken(key, secret, { identity, ttl: TOKEN_TTL_S, metadata });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  // Als schlichtes Objekt: die Protokollklassen schreiben Felder mit (deployment ...), die der
  // LiveKit-Server 1.11 der Clara V8 nicht kennt und mit "invalid token" ablehnt.
  at.roomConfig = { agents: [{ agentName: V8_AGENT }] };
  return {
    url: V8_URL, token: await at.toJwt(), room, identity, profileId, clientId, clara: "v8",
    expiresAt: Math.floor(Date.now() / 1000) + TOKEN_TTL_S,
  };
}

function shortId() {
  return randomBytes(3).toString("hex");
}

// Mint a LiveKit join token for a Clara browser session. The room is named per
// tenant; profileId is carried in metadata AND sent again via set_profile from
// the browser (the worker prefers the data-channel command).
export async function createClaraSession({ clientId, profileId, pipeline, ziel }) {
  if (!clientId) throw new Error("clientId required");
  const short = shortId();
  const room = `clara_${clientId}_${short}`;
  const identity = `clara-web-${short}`;
  const pipe = String(pipeline || "").trim().toLowerCase();
  const metadata = JSON.stringify({
    role: "clara-web",
    profile_id: profileId,
    client_id: clientId,
    source: "mas-2-clara",
    ...(pipe ? { pipeline: pipe } : {}),
  });

  if (ziel === "v8") return createV8Session({ clientId, profileId, pipe, metadata, short });

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    ttl: TOKEN_TTL_S,
    metadata,
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  const token = await at.toJwt();

  return {
    url: LIVEKIT_URL,
    token,
    room,
    identity,
    profileId,
    clientId,
    expiresAt: Math.floor(Date.now() / 1000) + TOKEN_TTL_S,
  };
}
