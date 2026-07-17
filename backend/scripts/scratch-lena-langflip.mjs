// Diagnose Sprachspringen (13.07.2026): heutige Diktat-Segmente pro Termin mit
// VOLLEM Text + Patientenname, um die Sprach-Flips (Paraschou + 2.) zu sehen.
import admin from "../src/firebase.js";

const db = admin.firestore();
const since = new Date("2026-07-13T00:00:00+02:00");

const snap = await db.collectionGroup("dictations").limit(2000).get();
const byAppt = new Map();
snap.forEach((d) => {
  const s = d.data() || {};
  const ts = s.createdAt?.toDate ? s.createdAt.toDate() : null;
  if (!ts || ts < since) return;
  const apptRef = d.ref.parent.parent;
  const key = apptRef.path;
  if (!byAppt.has(key)) byAppt.set(key, { ref: apptRef, segs: [] });
  byAppt.get(key).segs.push({
    ts,
    source: s.source || "?",
    lang: s.lang || "?",
    struck: s.struck === true,
    text: String(s.text || "").replace(/\s+/g, " ").trim(),
  });
});

if (!byAppt.size) {
  console.log("Keine Segmente von heute gefunden.");
  process.exit(0);
}

for (const { ref, segs } of byAppt.values()) {
  let name = "?";
  try {
    const a = (await ref.get()).data() || {};
    name = a.patientName || a.patient?.name ||
      [a.patientFirstName, a.patientLastName].filter(Boolean).join(" ") || "?";
  } catch { /* ignore */ }
  segs.sort((x, y) => x.ts - y.ts);
  console.log(`\n===== Termin ${ref.id.slice(0, 8)} — Patient: ${name} — ${segs.length} Segmente =====`);
  for (const r of segs) {
    console.log(`${r.ts.toLocaleTimeString("de-DE")} [${r.source}/${r.lang}]${r.struck ? " STRUCK" : ""}: ${r.text}`);
  }
}
console.log(`\n-- ${byAppt.size} Termine mit Segmenten heute`);
process.exit(0);
