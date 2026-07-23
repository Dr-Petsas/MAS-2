// Chef-Session 22.07. ~01:20-01:50: alle Diktat-Segmente von heute Nacht dumpen.
import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const fromH = Number(process.argv[2] || 1);   // Stunde ab (lokal)
const toH = Number(process.argv[3] || 2);     // Stunde bis (inkl.)

const snap = await db.collectionGroup("dictations").get();
const rows = [];
snap.forEach((d) => {
  const s = d.data() || {};
  const at = s.createdAt?.toDate?.();
  if (!at) return;
  const now = new Date();
  if (at.getFullYear() !== now.getFullYear() || at.getMonth() !== now.getMonth() || at.getDate() !== now.getDate()) return;
  const h = at.getHours();
  if (h < fromH || h > toH) return;
  rows.push({
    at,
    t: at.toLocaleTimeString("de-DE") + "." + String(at.getMilliseconds()).padStart(3, "0"),
    src: s.source || "?",
    startMs: Number(s.startMs) || 0,
    text: String(s.text || ""),
    appt: d.ref.parent.parent ? d.ref.parent.parent.id : "?",
  });
});
rows.sort((a, b) => (a.startMs || a.at.getTime()) - (b.startMs || b.at.getTime()));
console.log(`${rows.length} Segmente ${fromH}:00-${toH}:59 heute`);
for (const r of rows) {
  console.log(`${r.t} [${r.src}] appt=${r.appt.slice(0, 8)} | ${r.text}`);
}
process.exit(0);
