import { randomBytes } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";

// ============================================================================
// LiveKit-Token NUR fuer die Erlebnis-Demo (DemoClara) — Chef 19.08.2026.
//
// STRIKT getrennt von der Haupt-Clara: diese Datei fasst src/clara/session.js
// und src/routes/clara.js NICHT an und nutzt EIGENE, LOKALE LiveKit-Variablen.
//
// Warum eigene Variablen statt LIVEKIT_URL: In Produktion zeigt LIVEKIT_URL auf
// die LiveKit-CLOUD, an der die Telefon-Clara haengt. Wuerde die Demo darueber
// minten, landete der Besucher im Cloud-Dispatch der echten Clara. Deshalb hier
// bewusst der LOKALE SFU (ws://127.0.0.1:7880) — genau dort und nur dort hoert
// die isolierte DemoClara-Kopie (F:\Clara-Voice-DemoClara) zu.
// ============================================================================

const DEMO_URL = (process.env.LIVEKIT_DEMO_URL || "ws://127.0.0.1:7880").trim();
const DEMO_KEY = (process.env.LIVEKIT_DEMO_API_KEY || "pickadoc-dev-key").trim();
const DEMO_SECRET = (
  process.env.LIVEKIT_DEMO_API_SECRET ||
  "pickadoc-dev-secret-2026-05-30-rotate-before-prod-a1b2c3d4e5f6"
).trim();
const DEMO_TTL_S = Number(process.env.LIVEKIT_DEMO_TTL_S || 3600);
const DEMO_PROFILE = (process.env.LIVEKIT_DEMO_PROFILE || "clara_demo").trim();
// MVP: ein gemeinsamer Wegwerf-Sandbox-Kalender (feste sid). Der Kalender wird
// pro Demo-Start geleert. Spaeter (Ausbaustufe B) pro Besucher.
const DEMO_SID = (process.env.LIVEKIT_DEMO_SID || "demo_sandbox").trim();

/** Lokales LiveKit-Token fuer eine DemoClara-Sitzung (Browser -> lokaler SFU). */
export async function demoClaraSession({ pipeline, clientId } = {}) {
  const short = randomBytes(3).toString("hex");
  // Raum beginnt mit "clara_", damit die Begruessungslogik des Workers greift.
  const room = `clara_demo_${short}`;
  const identity = `demo-web-${short}`;
  const pipe = String(pipeline || "").trim().toLowerCase();
  const sid = String(clientId || "").trim() || DEMO_SID;
  const metadata = JSON.stringify({
    role: "democlara",
    profile_id: DEMO_PROFILE,
    client_id: sid,
    source: "erlebnis-demo",
    ...(pipe ? { pipeline: pipe } : {}),
  });

  const at = new AccessToken(DEMO_KEY, DEMO_SECRET, {
    identity,
    ttl: DEMO_TTL_S,
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
    url: DEMO_URL,
    token,
    room,
    identity,
    profileId: DEMO_PROFILE,
    sid,
    expiresAt: Math.floor(Date.now() / 1000) + DEMO_TTL_S,
  };
}
