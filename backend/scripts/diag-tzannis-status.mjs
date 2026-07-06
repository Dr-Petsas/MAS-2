// Folge-Diagnose: Status-Verteilung der Termine von Kiriakos Tzannis +
// showVirtualAppointments-Einstellung — erklaert, warum das MAS-Profil
// "keine Termine" zeigt. READ-ONLY.
import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT", loc = "VjdvbRQHH8oTId4f0GiX";
const apCol = db.collection("clients").doc(cid).collection("locations").doc(loc).collection("appointments");

const pid = process.argv[2] || "5viR6kC9WsUWLgSWtD6M"; // Kiriakos Tzannis

const locSnap = await db.collection("clients").doc(cid).collection("locations").doc(loc).get();
const l = locSnap.data() || {};
console.log("showVirtualAppointments (Standort):", l.showVirtualAppointments);

const snap = await apCol.where("patient.id", "==", pid).get();
const now = Date.now();
const tsMs = (v) => v?.toMillis?.() ?? (typeof v === "number" ? v : new Date(v).getTime() || 0);
const byStatus = {};
let pastReal = 0, pastVirtual = 0, futureReal = 0, futureVirtual = 0;
for (const d of snap.docs) {
  const a = d.data();
  const st = a.status || "(leer)";
  byStatus[st] = (byStatus[st] || 0) + 1;
  const virtual = st === "needsConfirmation" || st === "declined";
  const past = tsMs(a.start) < now;
  if (past && virtual) pastVirtual++;
  else if (past) pastReal++;
  else if (virtual) futureVirtual++;
  else futureReal++;
}
console.log(`pid=${pid}  gesamt=${snap.size}`);
console.log("Status-Verteilung:", byStatus);
console.log(`Vergangenheit: echt=${pastReal} virtuell=${pastVirtual}`);
console.log(`Zukunft:       echt=${futureReal} virtuell=${futureVirtual}`);
process.exit(0);
