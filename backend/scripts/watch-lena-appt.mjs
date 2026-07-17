// Live-Watch: Diktat-Segmente + Recorder eines Termins pollen.
//   node scripts/watch-lena-appt.mjs [appointmentId] [seconds]
import admin from "../src/firebase.js";

const apptId = process.argv[2] || "vmCbnelkmApPNmUSr2dn";
const seconds = Math.max(10, Number(process.argv[3] || 90));
const cid = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const locId = "VjdvbRQHH8oTId4f0GiX";
const ref = admin.firestore()
  .collection("clients").doc(cid)
  .collection("locations").doc(locId)
  .collection("appointments").doc(apptId);

const seen = new Set();
const t0 = Date.now();
console.log(`[watch] appt=${apptId} fuer ${seconds}s — jetzt am iPad aufnehmen`);

const snap0 = await ref.get();
const o0 = snap0.data() || {};
console.log(`[watch] Patient: ${`${o0.patient?.firstName || ""} ${o0.patient?.lastName || ""}`.trim()} · ${o0.visitMotive?.name || ""}`);

while ((Date.now() - t0) / 1000 < seconds) {
  const [rec, dict] = await Promise.all([
    ref.collection("treatment").doc("recorder").get(),
    ref.collection("dictations").get(),
  ]);
  const r = rec.exists ? (rec.data() || {}) : null;
  if (r) {
    const line = `recorder status=${r.status || "?"} cmd=${r.command || "-"} accumMs=${r.accumMs || 0} by=${r.by || ""} updated=${r.updatedAtMs ? new Date(r.updatedAtMs).toLocaleTimeString("de-DE") : "?"}`;
    if (line !== globalThis.__lastRec) {
      console.log(`[watch] ${line}`);
      globalThis.__lastRec = line;
    }
  }
  const rows = [];
  for (const d of dict.docs) {
    if (seen.has(d.id)) continue;
    const s = d.data() || {};
    rows.push({
      id: d.id,
      at: s.createdAt?.toDate?.() || null,
      source: s.source || "?",
      text: String(s.text || "").trim(),
    });
  }
  rows.sort((a, b) => (a.at || 0) - (b.at || 0));
  for (const row of rows) {
    seen.add(row.id);
    console.log(`[watch] +SEGMENT ${row.at?.toLocaleTimeString?.("de-DE") || "?"} src=${row.source} | ${row.text.slice(0, 200)}`);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

console.log(`[watch] Ende — ${seen.size} neue Segmente in ${seconds}s`);
process.exit(0);
