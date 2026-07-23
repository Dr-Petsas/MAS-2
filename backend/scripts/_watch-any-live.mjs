// Robuster Live-Watch: zeigt NEUE Diktat-Segmente ueber ALLE Termine, deren
// Recorder in den letzten Minuten aktiv war (umgeht haengende recording-Status).
//   node scripts/_watch-any-live.mjs [sekunden]
import admin from "../src/firebase.js";
const db = admin.firestore();
const RUN_S = Math.max(30, Number(process.argv[2] || 600));
const t0 = Date.now();
const seen = new Set();
let firstStart = null;

const tl = (ms) => (ms ? new Date(ms).toLocaleTimeString("de-DE") : "?");

console.log(`[watch-any] laeuft ${RUN_S}s — nimm jetzt am iPad auf.`);
while ((Date.now() - t0) / 1000 < RUN_S) {
  try {
    const snap = await db.collectionGroup("treatment").get();
    const active = [];
    snap.forEach((d) => {
      if (d.id !== "recorder") return;
      const r = d.data() || {};
      const upd = r.updatedAtMs || 0;
      if (Date.now() - upd < 5 * 60 * 1000) active.push({ ref: d.ref.parent.parent, upd, status: r.status });
    });
    for (const a of active) {
      const o = (await a.ref.get()).data() || {};
      const name = `${o.patient?.firstName || ""} ${o.patient?.lastName || ""}`.trim() || "?";
      const dict = await a.ref.collection("dictations").get();
      const rows = [];
      dict.forEach((d) => {
        if (seen.has(d.id)) return;
        const s = d.data() || {};
        rows.push({ id: d.id, at: s.createdAt?.toMillis?.() || 0, source: s.source || "?", startMs: Number(s.startMs) || 0, text: String(s.text || "").trim() });
      });
      rows.sort((x, y) => (x.at || 0) - (y.at || 0));
      for (const r of rows) {
        seen.add(r.id);
        if (r.startMs && firstStart === null) firstStart = r.startMs;
        const delta = r.startMs && firstStart ? `+${((r.startMs - firstStart) / 1000).toFixed(1)}s` : "—";
        console.log(`[watch-any] ${tl(r.at)} [${name}] src=${r.source.padEnd(9)} t=${delta.padEnd(8)} | ${r.text.slice(0, 160)}`);
      }
    }
  } catch (e) { console.log("[watch-any] Fehler:", e.message); }
  await new Promise((r) => setTimeout(r, 2000));
}
console.log("[watch-any] fertig.");
process.exit(0);
