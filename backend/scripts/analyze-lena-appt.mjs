// Auswertung eines Termins: Timing-Abdeckung + Cross-Channel-Merge-Wirkung.
//   node scripts/analyze-lena-appt.mjs [appointmentId]
import admin from "../src/firebase.js";
import { mergeCrossChannel, bigramSim, normSeg } from "../src/lena/crossChannel.js";

const db = admin.firestore();
const cid = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const locId = "VjdvbRQHH8oTId4f0GiX";
const apptId = process.argv[2] || "vmCbnelkmApPNmUSr2dn";
const ref = db.collection("clients").doc(cid).collection("locations").doc(locId).collection("appointments").doc(apptId);

const snap = await ref.collection("dictations").orderBy("createdAt", "asc").get();
const segs = [];
snap.forEach((d) => {
  const s = d.data() || {};
  if (s.struck === true) return;
  const t = String(s.text || "").trim();
  if (!t) return;
  segs.push({ id: d.id, text: t, source: s.source || "?", startMs: Number(s.startMs) || 0, endMs: Number(s.endMs) || 0, at: s.createdAt?.toMillis?.() || 0 });
});

const conv = segs.filter((s) => s.source !== "nachdiktat");
const nd = segs.filter((s) => s.source === "nachdiktat");
const timed = conv.filter((s) => s.startMs > 0);
console.log(`=== Termin ${apptId} ===`);
console.log(`Segmente gesamt: ${segs.length}  (Gespraech ${conv.length}, Nachdiktat ${nd.length})`);
console.log(`Gespraech mit Zeitstempel: ${timed.length}/${conv.length}`);
const bySrc = {}; for (const s of conv) bySrc[s.source] = (bySrc[s.source] || 0) + 1;
console.log(`Quellen (Gespraech):`, bySrc);

// Nur die getimte Session mergen (Alt-Segmente ohne Timing verzerren sonst).
const merged = mergeCrossChannel(conv);
const dropped = conv.length - merged.length;
console.log(`\nCross-Channel-Merge: ${conv.length} -> ${merged.length}  (entfernt: ${dropped})`);

// Welche wurden als Zwilling entfernt?
const keptIds = new Set(merged.map((s) => s.id));
for (const s of conv) {
  if (keptIds.has(s.id)) continue;
  // finde den Partner (andere Quelle, <2.5s, sim>=0.5)
  let best = null;
  for (const k of merged) {
    if (k.source === s.source || !k.startMs || !s.startMs) continue;
    if (Math.abs(k.startMs - s.startMs) > 2500) continue;
    const sim = bigramSim(normSeg(s.text), normSeg(k.text));
    if (!best || sim > best.sim) best = { sim, k };
  }
  console.log(`  ENTFERNT [${s.source}] "${s.text.slice(0, 55)}"`);
  if (best) console.log(`     Partner sim=${best.sim.toFixed(2)} [${best.k.source}] "${best.k.text.slice(0, 55)}"`);
}

// Dialog wie er in die Zusammenfassung ginge (nach Merge), nur getimte.
console.log(`\n=== Dialog nach Merge (getimte Session) ===`);
const t0 = timed.length ? timed[0].startMs : 0;
for (const s of merged.filter((x) => x.startMs > 0)) {
  const who = s.source === "arzt" ? "Arzt" : "Patient";
  console.log(`  [+${((s.startMs - t0) / 1000).toFixed(1)}s ${who}] ${s.text}`);
}
process.exit(0);
