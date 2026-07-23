// Heutige Doku-Segmente (ab 21:00): Termine durchgehen, dictations lesen.
import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const cid = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const locId = process.argv[2] || "VjdvbRQHH8oTId4f0GiX";

const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);

const apptSnap = await db.collection("clients").doc(cid)
  .collection("locations").doc(locId)
  .collection("appointments")
  .where("start", ">=", dayStart)
  .where("start", "<=", dayEnd)
  .orderBy("start")
  .get();

for (const doc of apptSnap.docs) {
  const a = doc.data() || {};
  const segSnap = await doc.ref.collection("dictations").orderBy("createdAt", "asc").get();
  if (segSnap.empty) continue;
  const rows = [];
  segSnap.forEach((d) => {
    const s = d.data() || {};
    const at = s.createdAt?.toDate?.();
    if (!at) return;
    // nur Segmente von heute Abend (nach 21:00)
    if (at.getHours() < 21) return;
    rows.push({
      t: at.toLocaleTimeString("de-DE") + "." + String(at.getMilliseconds()).padStart(3, "0"),
      src: s.source || "?",
      text: String(s.text || "").slice(0, 90),
    });
  });
  if (!rows.length) continue;
  const name = [a?.patient?.firstName, a?.patient?.lastName].filter(Boolean).join(" ") || a?.title || "?";
  console.log(`\n=== ${doc.id}  ${name}  (${rows.length} Segmente nach 21:00) ===`);
  rows.forEach((r) => console.log(`  ${r.t} [${r.src}] ${r.text}`));
}
process.exit(0);
