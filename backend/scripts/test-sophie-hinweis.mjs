import "dotenv/config";
import admin from "../src/firebase.js";

// ============================================================================
// E2E Sophie-Zuleitung von der Lena-Seite (Masterplan W-LENA, 04.07.2026)
// gegen den LAUFENDEN MAS-Server:
//   1. POST /clara/sophie-hinweis  -> Hinweis landet im Arbeitsstand
//      (mas_abrechnung_memo) MIT Patient/Termin-Bezug.
//   2. Zweiter POST                -> Hinweise werden KUMULIERT.
//   3. GET  /clara/sophie-hinweis  -> Arbeitsstand lesbar.
//   4. Fehlerfaelle: ohne appointmentId / ohne Text -> 400.
//   5. Aufraeumen: Memo-Dokument wird auf den Vorzustand zurueckgesetzt.
// ============================================================================

const BASE = "http://127.0.0.1:4000";
const CLIENT = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
let fehler = 0;

function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "\n      " + detail : ""}`);
  if (!cond) fehler += 1;
}

async function post(path, body) {
  const resp = await fetch(`${BASE}${path}?clientId=${CLIENT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: resp.status, data: await resp.json().catch(() => ({})) };
}

async function get(path) {
  const resp = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}clientId=${CLIENT}`);
  return { status: resp.status, data: await resp.json().catch(() => ({})) };
}

const db = admin.firestore();

async function findLocationId() {
  const snap = await db.collection("clients").doc(CLIENT).collection("locations").limit(1).get();
  return snap.docs[0]?.id;
}

// Juengster echter Patiententermin (kein Abwesenheits-Block).
async function findeTestTermin(locationId) {
  const col = db.collection("clients").doc(CLIENT).collection("locations").doc(locationId).collection("appointments");
  const snap = await col.orderBy("start", "desc").limit(200).get();
  for (const d of snap.docs) {
    const a = d.data() || {};
    if (a.isAbsence) continue;
    if (!a?.patient?.id) continue;
    if (a.status === "needsConfirmation" || a.status === "declined") continue;
    return {
      id: d.id,
      patient: `${a?.patient?.firstName || ""} ${a?.patient?.lastName || ""}`.trim(),
      lastName: String(a?.patient?.lastName || ""),
    };
  }
  return null;
}

const locationId = await findLocationId();
const termin = await findeTestTermin(locationId);
if (!termin) { console.error("Kein passender Termin gefunden"); process.exit(1); }
console.log(`Test-Termin: ${termin.id} | ${termin.patient}\n`);

// Vorzustand des Arbeitsstands sichern (wird am Ende wiederhergestellt).
const memoRef = db.collection("clients").doc(CLIENT).collection("mas_abrechnung_memo").doc(termin.id);
const memoSnap = await memoRef.get();
const memoBackup = memoSnap.exists ? memoSnap.data() : null;
await memoRef.delete().catch(() => {});

try {
  // --- 1) Erster Hinweis -> Arbeitsstand mit Patient-Bezug
  const t1 = `TESTLAUF Hinweis eins: privat Faktor 2,3 (${Date.now()})`;
  const r1 = await post("/clara/sophie-hinweis", { appointmentId: termin.id, text: t1 });
  check("POST 1 ok", r1.status === 200 && r1.data.ok === true, JSON.stringify(r1.data).slice(0, 200));
  check("POST 1 Hinweis im Arbeitsstand", String(r1.data.hinweise || "").includes(t1));
  check("POST 1 Patient-Bezug", String(r1.data.patientName || "").length > 0, `patientName=${r1.data.patientName}`);
  check("POST 1 Termin-Bezug", r1.data.appointmentId === termin.id && Number(r1.data.apptStartMs) > 0);

  // --- 2) Zweiter Hinweis -> kumuliert
  const t2 = "TESTLAUF Hinweis zwei: zusaetzlich GOZ 2197";
  const r2 = await post("/clara/sophie-hinweis", { appointmentId: termin.id, text: t2 });
  check("POST 2 ok", r2.status === 200 && r2.data.ok === true);
  check("POST 2 kumuliert beide Hinweise",
    String(r2.data.hinweise || "").includes(t1) && String(r2.data.hinweise || "").includes(t2));

  // --- 3) GET liest denselben Arbeitsstand
  const r3 = await get(`/clara/sophie-hinweis?appointmentId=${encodeURIComponent(termin.id)}`);
  check("GET ok", r3.status === 200 && r3.data.ok === true);
  check("GET Arbeitsstand vollstaendig",
    String(r3.data.hinweise || "").includes(t1) && String(r3.data.hinweise || "").includes(t2));

  // --- 4) Firestore-Dokument traegt Patient-Bezug
  const nach = await memoRef.get();
  const nd = nach.exists ? nach.data() : {};
  check("Firestore patientId gesetzt", !!nd.patientId, `patientId=${nd.patientId}`);
  check("Firestore lastName gesetzt", !!nd.lastName, `lastName=${nd.lastName}`);

  // --- 5) Fehlerfaelle
  const f1 = await post("/clara/sophie-hinweis", { text: "ohne Termin" });
  check("Ohne appointmentId -> 400", f1.status === 400);
  const f2 = await post("/clara/sophie-hinweis", { appointmentId: termin.id, text: "" });
  check("Ohne Text -> 400", f2.status === 400);
} finally {
  // Aufraeumen: Vorzustand wiederherstellen.
  if (memoBackup) await memoRef.set(memoBackup).catch(() => {});
  else await memoRef.delete().catch(() => {});
}

console.log(fehler ? `\n${fehler} Pruefung(en) FEHLGESCHLAGEN` : "\nAlle Pruefungen bestanden.");
process.exit(fehler ? 1 : 0);
