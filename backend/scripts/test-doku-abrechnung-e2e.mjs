import "dotenv/config";
import admin from "../src/firebase.js";

// ============================================================================
// E2E gemischte Memos (04.07.2026) gegen den LAUFENDEN MAS-Server:
//   1. Gemischtes Memo (Doku + "berechne privat Faktor 3,5")
//      -> Kartei bekommt NUR Klinik, Hinweis landet im Abrechnungs-Memo,
//         Bestaetigung enthaelt Doku-Rueckfragen UND Abrechnungs-Zeile.
//   2. "Was ist noch offen?" -> beide Spuren in einer Antwort.
//   3. "Rechne ab" OHNE text -> Grundlage kommt aus Doku + Hinweisen.
//   4. Aufraeumen: Diktate, Kartei, Events, Abrechnungs-Memo, Lern-Profil.
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

async function findLocationId() {
  const snap = await db.collection("clients").doc(CLIENT).collection("locations").limit(1).get();
  return snap.docs[0]?.id;
}

async function findeTestTermin(locationId) {
  const col = db.collection("clients").doc(CLIENT).collection("locations").doc(locationId).collection("appointments");
  const snap = await col.orderBy("start", "desc").limit(400).get();
  for (const d of snap.docs) {
    const a = d.data() || {};
    const motive = String(a?.visitMotive?.name || "");
    if (!/f[uü]ll/i.test(motive)) continue;
    if (a.isAbsence) continue;
    const dict = await col.doc(d.id).collection("dictations").limit(1).get();
    if (!dict.empty) continue;
    return { id: d.id, motive, patient: `${a?.patient?.firstName || ""} ${a?.patient?.lastName || ""}`.trim() };
  }
  return null;
}

const locationId = await findLocationId();
const termin = await findeTestTermin(locationId);
if (!termin) { console.error("Kein passender Termin gefunden"); process.exit(1); }
console.log(`Test-Termin: ${termin.id} | ${termin.motive} | ${termin.patient}\n`);

const lernRef = db.collection("clients").doc(CLIENT).collection("mas_doku_lernprofil").doc("zahnmedizin");
const lernSnap = await lernRef.get();
const lernBackup = lernSnap.exists ? lernSnap.data() : null;

try {
  // --- 1) Gemischtes Memo
  const r1 = await post("/tools/save-treatment-dictation", {
    appointmentId: termin.id,
    text: "Zahn 36 Füllung zweiflächig okklusal-distal mit Composite gelegt, Infiltrationsanästhesie, keine Komplikationen, Kontrolle bei Beschwerden. Berechne das privat mit Faktor 3,5.",
  });
  console.log("Memo 1:", r1.message);
  console.log("  memoTrennung:", JSON.stringify(r1.memoTrennung), "| abrechnung:", JSON.stringify(r1.abrechnung));
  check("Memo gespeichert", r1.ok === true && !!r1.dictationId);
  check("Abrechnungsanteil erkannt", r1.memoTrennung?.abrechnungErkannt === true);

  // Kartei-Segment: NUR Klinik, kein Abrechnungskommando.
  const segSnap = await db.collection("clients").doc(CLIENT)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(termin.id)
    .collection("dictations").doc(r1.dictationId).get();
  const segText = String(segSnap.data()?.text || "");
  check("Kartei-Segment enthaelt Klinik", /Composite/i.test(segText) && /Infiltration/i.test(segText), segText);
  check("Kartei-Segment OHNE Abrechnungskommando", !/berechne|faktor/i.test(segText), segText);

  // Abrechnungs-Memo am Termin.
  const memoSnap = await db.collection("clients").doc(CLIENT).collection("mas_abrechnung_memo").doc(termin.id).get();
  const memoDoc = memoSnap.exists ? memoSnap.data() : {};
  check("Abrechnungs-Hinweis am Termin gemerkt", /faktor/i.test(String(memoDoc.hinweise || "")), JSON.stringify(memoDoc.hinweise));

  // Antwort traegt eine Abrechnungs-Spur (Sonde gelaufen).
  check("Sophie-Sonde gelaufen (Status vorhanden)", !!r1.abrechnung?.status, JSON.stringify(r1.abrechnung));
  if (r1.abrechnung?.status === "needs_input") {
    check("Sophie-Gegenfrage in der Bestaetigung", /Zur Abrechnung fragt Sophie/i.test(r1.message), r1.message);
  }

  // --- 2) Offene Fragen beider Spuren
  const r2 = await post("/tools/doku-offen", { appointmentId: termin.id });
  console.log("Offen:", r2.message);
  check("Status-Auskunft ok", r2.ok === true && !!r2.message);
  check("Status nennt Doku-Spur", /doku/i.test(r2.message), r2.message);
  check("Status nennt Abrechnungs-Spur", /abrechnung/i.test(r2.message), r2.message);

  // --- 3) "Rechne ab" OHNE text -> Grundlage aus Doku + Hinweisen
  const r3 = await post("/tools/bill-treatment", { appointmentId: termin.id });
  console.log("Abrechnen ohne Text:", r3.status, "|", String(r3.message || "").slice(0, 180));
  check("Abrechnen ohne Text laeuft (ok mit Status)", r3.ok === true && ["needs_input", "complete", "no_match"].includes(r3.status), `status=${r3.status}`);
} finally {
  const apptRef = db.collection("clients").doc(CLIENT)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(termin.id);
  const dict = await apptRef.collection("dictations").get();
  for (const d of dict.docs) await d.ref.delete();
  await apptRef.collection("treatment").doc("main").delete().catch(() => {});
  const evs = await db.collection("clients").doc(CLIENT).collection("mas_events")
    .where(admin.firestore.FieldPath.documentId(), ">=", `lena-doc:${termin.id}:`)
    .where(admin.firestore.FieldPath.documentId(), "<", `lena-doc:${termin.id}:\uf8ff`).get();
  for (const d of evs.docs) await d.ref.delete();
  await db.collection("clients").doc(CLIENT).collection("mas_abrechnung_memo").doc(termin.id).delete().catch(() => {});
  if (lernBackup) await lernRef.set(lernBackup); else await lernRef.delete().catch(() => {});
  console.log(`\nAufgeraeumt: ${dict.size} Diktate, Kartei, ${evs.size} Events, Abrechnungs-Memo, Lern-Profil.`);
}

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
process.exit(fehler === 0 ? 0 : 1);
