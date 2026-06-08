import "dotenv/config";
import admin from "../src/firebase.js";

const clientId = process.argv[2] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const db = admin.firestore();

const ptr = await db.collection("clients").doc(clientId).collection("mas_config").doc("live_session").get();
const sid = ptr.exists ? ptr.data().sessionId : null;
console.log("live_session pointer:", JSON.stringify(ptr.data() || null));

if (sid) {
  const s = await db.collection("clients").doc(clientId).collection("mas_sessions").doc(sid).get();
  const d = s.data() || {};
  console.log("\nsession:", sid, "status:", d.status, "commandSeq:", d.commandSeq);
  console.log("lastCommand:", JSON.stringify(d.lastCommand, null, 2));
  console.log("history length:", (d.history || []).length);
  console.log("history types:", (d.history || []).map((c) => c.type).join(", "));
}
process.exit(0);
