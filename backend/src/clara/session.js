import { randomBytes } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";

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

function shortId() {
  return randomBytes(3).toString("hex");
}

// Mint a LiveKit join token for a Clara browser session. The room is named per
// tenant; profileId is carried in metadata AND sent again via set_profile from
// the browser (the worker prefers the data-channel command).
export async function createClaraSession({ clientId, profileId, pipeline }) {
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
