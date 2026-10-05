/**
 * Einmal-Demo: Info-Push mit Link auf /m/audio-demo.html an alle gekoppelten Geraete.
 * Nutzung: node scripts/send-audio-demo-push.mjs
 */
import "dotenv/config";
import { notifyAllDevices } from "../src/clara/devices.js";

const clientId = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
if (!base.startsWith("https://")) {
  console.error("PUBLIC_BASE_URL fehlt oder ist nicht https:", base);
  process.exit(1);
}

const url = `${base}/m/audio-demo.html`;
const out = await notifyAllDevices(clientId, {
  title: "Clara · Sprachnachricht",
  body: "Demo: tippen und Play drücken",
  url,
});
console.log(JSON.stringify({ clientId, url, ...out }, null, 2));
process.exit(out.ok ? 0 : 1);
