import "dotenv/config";
import admin from "../src/firebase.js";

// ============================================================================
// E2E Clara Overwatch (05.07.2026) gegen den LAUFENDEN MAS-Server.
// MANUELL starten (bewusst NICHT test-*.mjs: der Lauf stellt kurzzeitig den
// Besuchsgrund eines ECHTEN vergangenen Termins um und wieder zurueck):
//   node scripts/e2e-motive-overwatch.mjs
//
//   1. Vergangener Besprechungs-/Kontroll-Termin ohne Doku wird gesucht.
//   2. Diktat "Implantat regio 36 inseriert ..." via /tools/save-treatment-
//      dictation -> Overwatch muss den Besuchsgrund auf "IMP Implantation
//      OP ..." umstellen (Bestaetigung sagt es an, Termin traegt Audit-
//      Metadaten, Brain-Event existiert).
//   3. ALLES zuruecksetzen: Original-Motiv, Diktate, Karteikarte, Events.
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

// Kandidat: vergangener, bestaetigter Patiententermin der letzten 14 Tage mit
// Besprechungs-/Kontroll-Motiv und OHNE Diktate (Overwatch-Metadaten frisch).
const now = Date.now();
const ab = new Date(now - 14 * 86400000);
const snap = await apptCol.where("start", ">=", ab).orderBy("start", "asc").get();
let kandidat = null;
for (const d of snap.docs) {
  const a = d.data() || {};
  if (!a?.patient?.id || a.calendarItemType === "absence" || a.isMultiDay) continue;
  if (String(a.status || "confirmed") !== "confirmed") continue;
  if (tsToMs(a.start) >= now) continue;
  if (typeof a.patientStatus === "number" && a.patientStatus !== 2) continue; // nur behandelt/unbestimmt
  if (!/besprechung|kontroll/i.test(String(a.visitMotive?.name || ""))) continue;
  const dict = await apptCol.doc(d.id).collection("dictations").limit(1).get();
  if (!dict.empty) continue;
  kandidat = { id: d.id, data: a };
  break;
}
if (!kandidat) { console.error("Kein passender Test-Termin gefunden (vergangene Besprechung/Kontrolle ohne Doku in 14 Tagen)."); process.exit(1); }

const originalMotiv = { ...(kandidat.data.visitMotive || {}) };
const patient = kandidat.data.patient || {};
console.log(`Termin: ${kandidat.id} | ${patient.firstName || ""} ${patient.lastName || ""} | ${new Date(tsToMs(kandidat.data.start)).toISOString().slice(0, 10)} | Motiv: "${originalMotiv.name}"\n`);

try {
  const r1 = await post("/tools/save-treatment-dictation", {
    appointmentId: kandidat.id,
    patientId: patient.id,
    lastName: patient.lastName || "",
    text: "Implantat regio 36 inseriert, Primärstabilität gut. Naht mit 5-0. Keine Komplikationen.",
  });
  console.log("Antwort:", r1.message, "\n");
  check("Diktat gespeichert", r1.ok === true && !!r1.dictationId);
  check("Bestaetigung sagt die Umstellung an", /umgestellt/i.test(String(r1.message || "")), r1.message);
  check("Antwort traegt motiveOverwatch corrected", r1.motiveOverwatch?.status === "corrected", JSON.stringify(r1.motiveOverwatch));

  const nach = (await apptCol.doc(kandidat.id).get()).data() || {};
  check("Termin traegt neues Implantations-Motiv",
    /implantation/i.test(String(nach.visitMotive?.name || "")) && nach.visitMotive?.id !== originalMotiv.id,
    `visitMotive=${JSON.stringify(nach.visitMotive)}`);
  check("Audit-Metadaten am Termin (from/to/basis)",
    nach.motiveOverwatch?.status === "corrected" &&
    nach.motiveOverwatch?.from?.id === originalMotiv.id &&
    nach.motiveOverwatch?.to?.id === nach.visitMotive?.id &&
    nach.motiveOverwatch?.basis === "doku",
    JSON.stringify(nach.motiveOverwatch));

  const evId = `motive-overwatch:${kandidat.id}:${nach.visitMotive?.id}`;
  const ev = await db.collection("clients").doc(CLIENT).collection("mas_events").doc(evId).get();
  check("Brain-Event der Korrektur existiert (idempotente id)", ev.exists,
    ev.exists ? String(ev.data()?.summary || "") : evId);

  // Zweites Diktat auf demselben Termin: Motiv passt jetzt -> kein erneutes
  // Umstellen, keine erneute Ansage (Anti-Nerv).
  const r2 = await post("/tools/save-treatment-dictation", {
    appointmentId: kandidat.id,
    patientId: patient.id,
    lastName: patient.lastName || "",
    text: "Postoperative Anweisungen gegeben, Patient beschwerdefrei entlassen.",
  });
  check("zweites Diktat: keine erneute Umstellungs-Ansage",
    r2.ok === true && !/umgestellt/i.test(String(r2.message || "")), r2.message);
} finally {
  // ALLES zuruecksetzen — der echte Termin bleibt, wie er war.
  await apptCol.doc(kandidat.id).set({
    visitMotive: originalMotiv,
    motiveOverwatch: admin.firestore.FieldValue.delete(),
  }, { merge: true });
  const dict = await apptCol.doc(kandidat.id).collection("dictations").get();
  for (const d of dict.docs) await d.ref.delete();
  await apptCol.doc(kandidat.id).collection("treatment").doc("main").delete().catch(() => {});
  const evs = await db.collection("clients").doc(CLIENT).collection("mas_events")
    .where(admin.firestore.FieldPath.documentId(), ">=", `lena-doc:${kandidat.id}:`)
    .where(admin.firestore.FieldPath.documentId(), "<", `lena-doc:${kandidat.id}:\uf8ff`).get();
  for (const d of evs.docs) await d.ref.delete();
  const owEvs = await db.collection("clients").doc(CLIENT).collection("mas_events")
    .where(admin.firestore.FieldPath.documentId(), ">=", `motive-overwatch:${kandidat.id}:`)
    .where(admin.firestore.FieldPath.documentId(), "<", `motive-overwatch:${kandidat.id}:\uf8ff`).get();
  for (const d of owEvs.docs) await d.ref.delete();
  await db.collection("clients").doc(CLIENT).collection("mas_abrechnung_memo").doc(kandidat.id).delete().catch(() => {});

  const wieder = (await apptCol.doc(kandidat.id).get()).data() || {};
  check("Aufgeraeumt: Original-Motiv wiederhergestellt",
    wieder.visitMotive?.id === originalMotiv.id && wieder.motiveOverwatch === undefined,
    `visitMotive=${JSON.stringify(wieder.visitMotive)}`);
  console.log("\nAufgeraeumt.");
}

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
process.exit(fehler === 0 ? 0 : 1);
