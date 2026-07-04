import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT", loc = "VjdvbRQHH8oTId4f0GiX";
const apc = db.collection("clients").doc(cid).collection("locations").doc(loc).collection("appointments");
const f = new Date("2026-06-29T00:00:00+02:00"), t = new Date("2026-06-29T23:59:59+02:00");

const snap = await apc.where("start", ">=", f).where("start", "<=", t).get();
console.log("=== Mo Dr. Petsas: newPatient-Flag vs. echte Vorgeschichte ===");
let flagCount = 0, realNewCount = 0;
for (const d of snap.docs) {
  const a = d.data();
  if (a.calendar?.id !== "zex5bmv5jfIHWVW6zHbg" || !a.patient?.id) continue;
  const pid = a.patient.id;
  const flag = a.patient.newPatient === true;
  const prior = await apc.where("patient.id", "==", pid).where("start", "<", f).get();
  const nm = `${a.patient.firstName || ""} ${a.patient.lastName || ""}`.trim();
  const echtNeu = prior.size === 0;
  if (flag) flagCount++;
  if (echtNeu) realNewCount++;
  const mark = flag !== echtNeu ? "   <-- WIDERSPRUCH" : "";
  console.log(`  ${nm.padEnd(22)} flag=${flag}  frueher=${prior.size}  wirklich_neu=${echtNeu}${mark}`);
}
console.log(`\nGezaehlt per Flag (Claras Zahl): ${flagCount}   |   Wirklich neu (keine Vortermine): ${realNewCount}`);
process.exit(0);
