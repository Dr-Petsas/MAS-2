// Live-Watch fuer den Dual-Mikro-Test (17.07.2026).
// Findet die GERADE laufende Aufnahme automatisch (recorder.status=recording)
// und streamt neue Diktat-Segmente mit Quelle + Zeitstempel(Δ) + Text. Zeigt am
// Ende eine Auswertung: Timing vorhanden? mutmassliche Zwei-Mikro-Zwillinge?
//
//   node scripts/watch-lena-live.mjs [sekunden]
import admin from "../src/firebase.js";

const db = admin.firestore();
const RUN_S = Math.max(30, Number(process.argv[2] || 1200));
const t0 = Date.now();

const fmt = (ms) => (ms ? new Date(ms).toLocaleTimeString("de-DE") : "?");
const norm = (t) => String(t || "").toLowerCase().replace(/[^a-zäöüß0-9 ]+/gi, " ").replace(/\s+/g, " ").trim();
function bigram(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const g = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const x = s.slice(i, i + 2); m.set(x, (m.get(x) || 0) + 1); } return m; };
  const ga = g(a), gb = g(b); let o = 0, tot = 0;
  ga.forEach((n, x) => { o += Math.min(n, gb.get(x) || 0); tot += n; });
  gb.forEach((n) => { tot += n; });
  return tot ? (2 * o) / tot : 0;
}

async function findRecording() {
  const snap = await db.collectionGroup("treatment").get();
  let best = null;
  snap.forEach((d) => {
    if (d.id !== "recorder") return;
    const r = d.data() || {};
    if (r.status === "recording") {
      const upd = r.updatedAtMs || 0;
      if (!best || upd > best.upd) best = { ref: d.ref.parent.parent, upd };
    }
  });
  return best ? best.ref : null;
}

let apptRef = null;
let firstStart = null;
const seen = new Set();
const all = [];

console.log(`[watch-live] warte auf laufende Aufnahme (bis ${RUN_S}s) — jetzt am iPad Seite neu laden + aufnehmen`);

while ((Date.now() - t0) / 1000 < RUN_S) {
  if (!apptRef) {
    try { apptRef = await findRecording(); } catch (e) { console.log("[watch-live] Suche-Fehler:", e.message); }
    if (apptRef) {
      const o = (await apptRef.get()).data() || {};
      console.log(`[watch-live] AUFNAHME GEFUNDEN: ${`${o.patient?.firstName || ""} ${o.patient?.lastName || ""}`.trim() || "?"} · ${o.visitMotive?.name || ""}`);
    }
  }
  if (apptRef) {
    const dict = await apptRef.collection("dictations").get();
    const rows = [];
    dict.forEach((d) => {
      if (seen.has(d.id)) return;
      const s = d.data() || {};
      rows.push({ id: d.id, at: s.createdAt?.toMillis?.() || 0, source: s.source || "?", startMs: Number(s.startMs) || 0, endMs: Number(s.endMs) || 0, text: String(s.text || "").trim() });
    });
    rows.sort((a, b) => (a.startMs || a.at) - (b.startMs || b.at));
    for (const r of rows) {
      seen.add(r.id);
      all.push(r);
      if (r.startMs && firstStart === null) firstStart = r.startMs;
      const delta = r.startMs && firstStart ? `+${((r.startMs - firstStart) / 1000).toFixed(1)}s` : "—";
      const timing = r.startMs ? `t=${delta}` : "t=KEINE";
      console.log(`[watch-live] +SEG src=${r.source.padEnd(9)} ${timing.padEnd(12)} | ${r.text.slice(0, 160)}`);
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
}

// Auswertung
console.log(`\n[watch-live] === AUSWERTUNG (${all.length} Segmente) ===`);
const withTiming = all.filter((s) => s.startMs > 0).length;
console.log(`[watch-live] mit Zeitstempel: ${withTiming}/${all.length}`);
const bySrc = {};
for (const s of all) bySrc[s.source] = (bySrc[s.source] || 0) + 1;
console.log(`[watch-live] Quellen:`, bySrc);
// mutmassliche Zwei-Mikro-Zwillinge (andere Quelle, <2.5s, sim>=0.5)
let twins = 0;
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.source === b.source) continue;
    if (!a.startMs || !b.startMs) continue;
    if (Math.abs(a.startMs - b.startMs) > 2500) continue;
    const sim = bigram(norm(a.text), norm(b.text));
    if (sim >= 0.5) { twins++; console.log(`[watch-live]   ZWILLING sim=${sim.toFixed(2)} Δ${((b.startMs - a.startMs) / 1000).toFixed(1)}s :: "${a.text.slice(0, 40)}" / "${b.text.slice(0, 40)}"`); }
  }
}
console.log(`[watch-live] mutmassliche Zwei-Mikro-Zwillinge: ${twins}`);
process.exit(0);
