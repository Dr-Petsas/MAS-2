// Diagnose W-SUCHE-3 (06.07.2026): MAS-Suche zeigt bei manchen Patienten
// keine/gemischte Termine. Prueft READ-ONLY fuer gegebene Namen:
//  1. Welche Patienten-Datensaetze existieren (Duplikate?)
//  2. Haengen die Termine an derselben patient.id wie der Patienten-Datensatz?
//  3. Greift der lastName-Fallback (exakte Schreibweise)?
// Aufruf: node scripts/diag-profil-termine.mjs tzannis sablon queiroz
import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT", loc = "VjdvbRQHH8oTId4f0GiX";
const patCol = db.collection("clients").doc(cid).collection("locations").doc(loc).collection("patients");
const apCol = db.collection("clients").doc(cid).collection("locations").doc(loc).collection("appointments");

const terms = process.argv.slice(2).map((t) => t.toLowerCase()).filter(Boolean);
if (!terms.length) { console.log("Nutzung: node scripts/diag-profil-termine.mjs <nachname> [...]"); process.exit(1); }

const fmt = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") : "—");
const tsMs = (v) => v?.toMillis?.() ?? (typeof v === "number" ? v : new Date(v).getTime() || 0);

for (const term of terms) {
  console.log(`\n========== Suche: "${term}" ==========`);

  // 1) Patienten-Datensaetze (wie masSearchPatients: searchIndexes)
  const pSnap = await patCol.where("searchIndexes", "array-contains", term).limit(20).get();
  const patients = pSnap.docs.map((d) => {
    const o = d.data();
    return { id: d.id, firstName: o.firstName || "", lastName: o.lastName || "", birthDate: o.birthDate || null };
  });
  console.log(`Patienten-Datensaetze: ${patients.length}`);
  for (const p of patients) console.log(`  pat ${p.id}  ${p.firstName} ${p.lastName}`);

  // 2) Termine je patient.id
  for (const p of patients) {
    const aSnap = await apCol.where("patient.id", "==", p.id).get();
    console.log(`  -> Termine mit patient.id==${p.id}: ${aSnap.size}`);
    const rows = aSnap.docs
      .map((d) => { const a = d.data(); return { start: tsMs(a.start), status: a.status || "", typ: a.calendarItemType || "", ln: a.patient?.lastName || "", fn: a.patient?.firstName || "" }; })
      .sort((a, b) => a.start - b.start);
    for (const r of rows.slice(-6)) console.log(`       ${fmt(r.start)}  status=${r.status || "—"} typ=${r.typ || "—"} name=${r.fn} ${r.ln}`);
  }

  // 3) Termine, die den Namen tragen, aber evtl. eine ANDERE/keine patient.id haben
  //    (Scan ueber patient.lastName in allen Schreibweisen).
  const all = await apCol.select("patient", "start", "status", "calendarItemType").get();
  const knownIds = new Set(patients.map((p) => p.id));
  const orphan = [];
  for (const d of all.docs) {
    const a = d.data();
    const ln = String(a.patient?.lastName || "").toLowerCase();
    if (!ln.includes(term)) continue;
    const pid = a.patient?.id || "";
    if (!knownIds.has(pid)) orphan.push({ pid: pid || "(leer)", ln: a.patient?.lastName, fn: a.patient?.firstName || "", start: tsMs(a.start), status: a.status || "" });
  }
  console.log(`Termine mit Namens-Treffer aber FREMDER/fehlender patient.id: ${orphan.length}`);
  const byPid = new Map();
  for (const o of orphan) { if (!byPid.has(o.pid)) byPid.set(o.pid, []); byPid.get(o.pid).push(o); }
  for (const [pid, rows] of byPid) {
    rows.sort((a, b) => a.start - b.start);
    console.log(`  pid=${pid}  (${rows.length} Termine, ${rows[0].fn} ${rows[0].ln})`);
    for (const r of rows.slice(-4)) console.log(`       ${fmt(r.start)}  status=${r.status || "—"}`);
  }
}
process.exit(0);
