import "dotenv/config";
import admin from "../src/firebase.js";

// ============================================================================
// E2E Doku-Wächter (04.07.2026) gegen den LAUFENDEN MAS-Server:
//   1. Diktat OHNE Datum fuer einen Patienten OHNE heutigen Termin
//      -> landet auf dem zuletzt BEGONNENEN (vergangenen) Termin,
//         Bestaetigung NENNT das Datum ("zum Termin vom ...").
//   2. Hat derselbe Patient einen weiteren juengeren Termin ohne Doku,
//      weist die Bestaetigung darauf hin ("Übrigens: ...").
//   3. /tools/doku-luecken liefert praxisweite Luecken.
//   4. Aufraeumen.
// ============================================================================

const BASE = "http://127.0.0.1:4000";
const CLIENT = "MEe4ZQHEzOPzLcexyhdT";
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
  return resp.json();
}

const db = admin.firestore();
const locSnap = await db.collection("clients").doc(CLIENT).collection("locations").limit(1).get();
const locationId = locSnap.docs[0]?.id;
const apptCol = db.collection("clients").doc(CLIENT).collection("locations").doc(locationId).collection("appointments");

function tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

// Patient suchen: >= 2 vergangene Termine in den letzten 14 Tagen, KEIN
// heutiger/kommender Termin, keine Diktate an den beiden juengsten.
const now = Date.now();
const ab = new Date(now - 14 * 86400000);
const snap = await apptCol.where("start", ">=", ab).orderBy("start", "asc").get();
const proPatient = new Map();
for (const d of snap.docs) {
  const a = d.data() || {};
  const pid = a?.patient?.id;
  if (!pid || a.calendarItemType === "absence" || a.isMultiDay) continue;
  if (["needsConfirmation", "declined"].includes(String(a.status || ""))) continue;
  if (!proPatient.has(pid)) proPatient.set(pid, []);
  proPatient.get(pid).push({ id: d.id, startMs: tsToMs(a.start), lastName: a?.patient?.lastName || "", name: `${a?.patient?.firstName || ""} ${a?.patient?.lastName || ""}`.trim(), motive: a?.visitMotive?.name || "" });
}
let kandidat = null;
for (const [pid, appts] of proPatient) {
  const past = appts.filter((x) => x.startMs < now).sort((a, b) => a.startMs - b.startMs);
  const future = appts.filter((x) => x.startMs >= now);
  if (past.length < 2 || future.length) continue;
  const [aeltere, juengste] = [past[past.length - 2], past[past.length - 1]];
  const d1 = await apptCol.doc(juengste.id).collection("dictations").limit(1).get();
  const d2 = await apptCol.doc(aeltere.id).collection("dictations").limit(1).get();
  if (!d1.empty || !d2.empty) continue;
  kandidat = { pid, juengste, aeltere };
  break;
}
if (!kandidat) { console.error("Kein passender Test-Patient gefunden"); process.exit(1); }
const { pid, juengste, aeltere } = kandidat;
console.log(`Patient: ${juengste.name} | juengster Termin: ${new Date(juengste.startMs).toISOString().slice(0, 10)} (${juengste.motive}) | aelterer: ${new Date(aeltere.startMs).toISOString().slice(0, 10)} (${aeltere.motive})\n`);

try {
  const r1 = await post("/tools/save-treatment-dictation", {
    patientId: pid,
    lastName: juengste.lastName,
    text: "Kontrolle durchgefuehrt, Befund unauffaellig, keine Beschwerden.",
  });
  console.log("Antwort:", r1.message, "\n");
  check("Diktat gespeichert", r1.ok === true && !!r1.dictationId);
  check("Ziel = juengster VERGANGENER Termin (nicht Zukunft, nicht aelterer)",
    r1.appointmentId === juengste.id,
    `ziel=${r1.appointmentId} erwartet=${juengste.id}`);
  check("Bestaetigung nennt das Termindatum (nicht heute)",
    /zum Termin vom/i.test(r1.message),
    r1.message);
  check("Luecken-Hinweis auf den aelteren Termin ohne Doku",
    /Übrigens|Uebrigens/i.test(r1.message),
    r1.message);

  const r2 = await post("/tools/doku-luecken", { days: 7 });
  check("Praxis-Luecken-Scan ok", r2.ok === true && typeof r2.count === "number", `count=${r2.count}`);
  check("Juengster Termin ist KEINE Luecke mehr (Doku eben gespeichert)",
    !(r2.luecken || []).some((l) => l.appointmentId === juengste.id));
} finally {
  for (const apptId of [juengste.id, aeltere.id]) {
    const dict = await apptCol.doc(apptId).collection("dictations").get();
    for (const d of dict.docs) await d.ref.delete();
    await apptCol.doc(apptId).collection("treatment").doc("main").delete().catch(() => {});
    const evs = await db.collection("clients").doc(CLIENT).collection("mas_events")
      .where(admin.firestore.FieldPath.documentId(), ">=", `lena-doc:${apptId}:`)
      .where(admin.firestore.FieldPath.documentId(), "<", `lena-doc:${apptId}:\uf8ff`).get();
    for (const d of evs.docs) await d.ref.delete();
    await db.collection("clients").doc(CLIENT).collection("mas_abrechnung_memo").doc(apptId).delete().catch(() => {});
  }
  console.log("\nAufgeraeumt.");
}

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
process.exit(fehler === 0 ? 0 : 1);
