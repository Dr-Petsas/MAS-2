import "dotenv/config";
import admin from "../src/firebase.js";

// ============================================================================
// E2E-Test Diktat-Doku (04.07.2026) gegen den LAUFENDEN MAS-Server:
//   1. Diktat 1 (unvollstaendig)  -> Rueckfragen kommen (Anaesthesie etc.)
//   2. Diktat 2 (Antwort)         -> KEINE Wiederholung schon beantworteter
//      Felder aus Diktat 1 (kumulierter Doku-Check)
//   3. Auto-Karteikarte           -> treatment/main von clara-auto beschrieben
//   4. Streichen per textHint     -> struck=true, Memory-Kopie weg, Kartei neu
//   5. Streichen "das letzte"     -> alles gestrichen -> Kartei geleert
//   6. Aufraeumen: Diktate, Kartei, Events, Lern-Profil-Snapshot zurueck
//
// Nutzt einen ECHTEN Termin des Demo-Mandanten, aber nur einen OHNE bestehende
// Diktate — es wird nichts Bestehendes angefasst, alles Testdaten am Ende weg.
// ============================================================================

const BASE = "http://127.0.0.1:4000";
const CLIENT = "MEe4ZQHEzOPzLcexyhdT";
let fehler = 0;

function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
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

// Termin mit Fuellungs-Besuchsgrund und OHNE bestehende Diktate suchen.
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

async function segmente(locationId, apptId) {
  const snap = await db.collection("clients").doc(CLIENT)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(apptId)
    .collection("dictations").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

async function karteikarte(locationId, apptId) {
  const snap = await db.collection("clients").doc(CLIENT)
    .collection("locations").doc(locationId)
    .collection("appointments").doc(apptId)
    .collection("treatment").doc("main").get();
  return snap.exists ? (snap.data() || {}) : null;
}

async function pollKarteikarte(locationId, apptId, testFn, maxMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const note = await karteikarte(locationId, apptId);
    if (note && testFn(note)) return note;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return await karteikarte(locationId, apptId);
}

const locationId = await findLocationId();
if (!locationId) { console.error("Kein Standort gefunden"); process.exit(1); }

const termin = await findeTestTermin(locationId);
if (!termin) { console.error("Kein passender Fuellungs-Termin ohne Diktate gefunden"); process.exit(1); }
console.log(`Test-Termin: ${termin.id} | ${termin.motive} | ${termin.patient}\n`);

// Lern-Profil sichern (der Doku-Check kann Beobachtungen zaehlen).
const lernRef = db.collection("clients").doc(CLIENT).collection("mas_doku_lernprofil").doc("zahnmedizin");
const lernSnap = await lernRef.get();
const lernBackup = lernSnap.exists ? lernSnap.data() : null;

try {
  // --- 1) Diktat 1: unvollstaendig (ohne Anaesthesie/Komplikationen/Procedere)
  const r1 = await post("/tools/save-treatment-dictation", {
    appointmentId: termin.id,
    text: "Zahn 36 Füllung zweiflächig okklusal-distal mit Composite gelegt.",
  });
  console.log("Diktat 1:", r1.message, "\n  fragen:", JSON.stringify(r1.dokuCheck?.fragen || []));
  check("Diktat 1 gespeichert", r1.ok === true && !!r1.dictationId);
  const fragen1 = (r1.dokuCheck?.fragen || []).map((f) => f.key);
  check("Rueckfragen zu fehlenden Angaben kommen", fragen1.length > 0, `fragen=${fragen1.join(",")}`);
  check("Zahn/Flaechen/Material werden NICHT gefragt (stehen im Diktat)",
    !fragen1.some((k) => /zahn|flaech|material/i.test(k)), `fragen=${fragen1.join(",")}`);

  // --- 2) Diktat 2: beantwortet die Rueckfragen -> nichts Altes nochmal fragen
  const r2 = await post("/tools/save-treatment-dictation", {
    appointmentId: termin.id,
    text: "Infiltrationsanästhesie gesetzt, keine Komplikationen, Kontrolle bei Beschwerden.",
  });
  console.log("Diktat 2:", r2.message, "\n  fragen:", JSON.stringify(r2.dokuCheck?.fragen || []));
  check("Diktat 2 gespeichert", r2.ok === true && !!r2.dictationId);
  const fragen2 = (r2.dokuCheck?.fragen || []).map((f) => f.key);
  check("beantwortete Felder aus Diktat 1+2 werden NICHT wiederholt",
    !fragen2.some((k) => /zahn|flaech|material|anaesthesie|komplikation|procedere/i.test(k)),
    `fragen=${fragen2.join(",") || "(keine)"}`);

  // --- 3) Auto-Karteikarte: clara-auto strukturiert im Hintergrund
  const note1 = await pollKarteikarte(locationId, termin.id,
    (n) => n.updatedBy === "clara-auto" && String(n.structuredText || "").includes("36") && (n.segmentsCount === 2));
  check("Karteikarte automatisch strukturiert (clara-auto, enthaelt Zahn 36, 2 Segmente)",
    !!note1 && note1.updatedBy === "clara-auto" && String(note1.structuredText || "").includes("36") && note1.segmentsCount === 2,
    note1 ? `updatedBy=${note1.updatedBy} sege=${note1.segmentsCount} text=${String(note1.structuredText || "").slice(0, 80)}...` : "keine Kartei");

  // --- 4) Streichen per Stichwort ("das mit der Anaesthesie war falsch")
  const r4 = await post("/tools/strike-treatment-dictation", {
    appointmentId: termin.id,
    textHint: "Anästhesie",
    reason: "Testlauf: versehentlich diktiert",
  });
  console.log("Streichen 1:", r4.message);
  check("Streichen per textHint ok", r4.ok === true && r4.dictationId === r2.dictationId,
    `getroffen=${r4.dictationId} erwartet=${r2.dictationId}`);
  const segsNach4 = await segmente(locationId, termin.id);
  const seg2 = segsNach4.find((s) => s.id === r2.dictationId);
  check("Segment 2 ist struck (nicht geloescht)", !!seg2 && seg2.struck === true && !!seg2.struckReason);
  const ev2 = await db.collection("clients").doc(CLIENT).collection("mas_events").doc(`lena-doc:${termin.id}:${r2.dictationId}`).get();
  check("Shared-Memory-Kopie von Segment 2 entfernt", !ev2.exists);
  const ev1 = await db.collection("clients").doc(CLIENT).collection("mas_events").doc(`lena-doc:${termin.id}:${r1.dictationId}`).get();
  check("Shared-Memory-Kopie von Segment 1 bleibt", ev1.exists);

  // Kartei-Refresh nach dem Streichen: nur noch 1 aktives Segment.
  const note2 = await pollKarteikarte(locationId, termin.id, (n) => n.segmentsCount === 1);
  check("Karteikarte nach Streichen neu gebaut (1 Segment)",
    !!note2 && note2.segmentsCount === 1, note2 ? `segmente=${note2.segmentsCount}` : "keine Kartei");

  // --- 5) "Streich das letzte Diktat" (ohne Hinweis) -> Segment 1, Kartei leer
  const r5 = await post("/tools/strike-treatment-dictation", { appointmentId: termin.id });
  console.log("Streichen 2:", r5.message);
  check("Streichen ohne Hinweis trifft juengstes AKTIVES Segment (= Segment 1)",
    r5.ok === true && r5.dictationId === r1.dictationId,
    `getroffen=${r5.dictationId} erwartet=${r1.dictationId}`);
  const note3 = await pollKarteikarte(locationId, termin.id, (n) => n.segmentsCount === 0 && !n.structuredText, 30000);
  check("Karteikarte geleert, wenn alles gestrichen",
    !!note3 && note3.segmentsCount === 0 && !note3.structuredText,
    note3 ? `segmente=${note3.segmentsCount} text='${String(note3.structuredText || "").slice(0, 40)}'` : "keine Kartei");
  const ev1b = await db.collection("clients").doc(CLIENT).collection("mas_events").doc(`lena-doc:${termin.id}:${r1.dictationId}`).get();
  check("Shared-Memory-Kopie von Segment 1 nach Streichen entfernt", !ev1b.exists);

  // --- 6) Nichts mehr zu streichen -> ehrliche Meldung
  const r6 = await post("/tools/strike-treatment-dictation", { appointmentId: termin.id });
  check("kein aktives Segment mehr -> ok:false mit Erklaerung", r6.ok === false && /keine aktive/i.test(r6.message || ""), r6.message);
} finally {
  // --- Aufraeumen: alle Test-Diktate + Kartei + Events + Lern-Profil zurueck
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
  if (lernBackup) await lernRef.set(lernBackup); else await lernRef.delete().catch(() => {});
  console.log(`\nAufgeraeumt: ${dict.size} Diktate, Kartei, ${evs.size} Events, Lern-Profil wiederhergestellt.`);
}

console.log(fehler === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${fehler} CHECK(S) FEHLGESCHLAGEN`);
process.exit(fehler === 0 ? 0 : 1);
