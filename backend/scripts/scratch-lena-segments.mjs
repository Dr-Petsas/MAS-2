// Kurzdiagnose: die neuesten Diktat-Segmente (heute) mit Quelle/Kanal zeigen.
import admin from "../src/firebase.js";

const db = admin.firestore();
const snap = await db.collectionGroup("dictations").limit(800).get();
const rows = [];
snap.forEach((d) => {
  const s = d.data() || {};
  const ts = s.createdAt?.toDate ? s.createdAt.toDate() : null;
  if (!ts) return;
  rows.push({
    appt: d.ref.parent.parent.id,
    ts,
    source: s.source || "?",
    struck: s.struck === true,
    smalltalk: s.smalltalk === true,
    section: s.section || "",
    text: String(s.text || "").slice(0, 110).replace(/\s+/g, " "),
  });
});
rows.sort((a, b) => a.ts - b.ts);
const heute = rows.filter((r) => r.ts >= new Date("2026-07-11T00:00:00+02:00"));
for (const r of heute) {
  console.log(
    `${r.ts.toLocaleTimeString("de-DE")} appt=${r.appt.slice(0, 6)} src=${r.source}` +
    `${r.struck ? " STRUCK" : ""}${r.smalltalk ? " SMALLTALK" : ""}${r.section ? " sec=" + r.section : ""} | ${r.text}`,
  );
}
console.log(`-- ${heute.length} Segmente heute (von ${rows.length} gesamt)`);
process.exit(0);
