// Read-only: juengste Termine MIT Doku-Segmenten (fuer PC-Wizard-Sichtpruefung).
import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const snap = await db.collectionGroup("dictations").get();
const byAppt = new Map();
snap.forEach((d) => {
  const apptRef = d.ref.parent.parent;
  if (!apptRef) return;
  const at = d.data()?.createdAt?.toDate?.() || null;
  const key = apptRef.path;
  const cur = byAppt.get(key) || { ref: apptRef, n: 0, newest: null };
  cur.n++;
  if (at && (!cur.newest || at > cur.newest)) cur.newest = at;
  byAppt.set(key, cur);
});
const top = [...byAppt.values()]
  .sort((a, b) => (b.newest?.getTime() || 0) - (a.newest?.getTime() || 0))
  .slice(0, 6);
for (const info of top) {
  const a = (await info.ref.get()).data() || {};
  const name = [a?.patient?.firstName, a?.patient?.lastName].filter(Boolean).join(" ") || a?.title || "?";
  const m = info.ref.path.match(/^clients\/([^/]+)\/locations\/([^/]+)\/appointments\/([^/]+)$/);
  console.log(JSON.stringify({
    clientId: m?.[1] || "",
    locationId: m?.[2] || "",
    appointmentId: m?.[3] || "",
    name,
    segs: info.n,
    newest: info.newest ? info.newest.toISOString() : "",
  }));
}
process.exit(0);
