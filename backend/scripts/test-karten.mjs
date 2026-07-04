import "dotenv/config";
import admin from "../src/firebase.js";

// ============================================================================
// E2E Übersichts-Karten (04.07.2026) gegen den LAUFENDEN MAS-Server:
// Die Handy-App rendert card-Objekte aus den Tool-Antworten — hier pruefen
// wir, dass jeder Endpunkt seine Karte korrekt und vollstaendig mitliefert.
//   1. day-briefing            -> card kind=tag (Termine, Spanne, Chips)
//   2. next-patients-briefing  -> cards[] kind=patient (Heads-up-Motiv)
//   3. save-treatment-dictation-> card kind=doku (Notizen + offene Fragen)
//   4. doku-offen              -> card kind=doku (Status-Sicht)
//   5. doku-luecken            -> card kind=luecken
//   6. Aufraeumen wie test-doku-abrechnung-e2e (Diktate, Events, Memo).
// ============================================================================

const BASE = "http://127.0.0.1:4000";
const CLIENT = "MEe4ZQHEzOPzLcexyhdT";
let fehler = 0;

function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "\n      " + detail : ""}`);
  if (!cond) fehler += 1;
}

function kartenForm(card) {
  return card && typeof card === "object"
    && typeof card.kind === "string"
    && typeof card.title === "string"
    && Array.isArray(card.items)
    && card.items.every((i) => i && typeof i.text === "string" && ["alert", "warn", "info", "ok"].includes(i.level));
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
    return {
      id: d.id,
      motive,
      patient: `${a?.patient?.firstName || ""} ${a?.patient?.lastName || ""}`.trim(),
      lastName: String(a?.patient?.lastName || ""),
    };
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
  // --- 1) Tagesbriefing -> Tages-Karte
  const r1 = await post("/tools/day-briefing", {});
  check("day-briefing ok", r1.ok === true, r1.message);
  check("Tages-Karte vorhanden + wohlgeformt", kartenForm(r1.card) && r1.card.kind === "tag", JSON.stringify(r1.card)?.slice(0, 200));
  check("Tages-Karte nennt Terminzahl", /Termin/i.test(String(r1.card?.subtitle || "")), r1.card?.subtitle);

  // --- 2) Heads-up -> Patienten-Karte (gezielt nach Namen, unabhaengig von der Uhrzeit)
  const r2 = await post("/tools/next-patients-briefing", { patientName: termin.lastName });
  check("next-patients ok", r2.ok === true, String(r2.message || "").slice(0, 140));
  if (Array.isArray(r2.cards) && r2.cards.length) {
    check("Patienten-Karte wohlgeformt", kartenForm(r2.cards[0]) && r2.cards[0].kind === "patient", JSON.stringify(r2.cards[0])?.slice(0, 200));
    check("Patienten-Karte traegt Namen", String(r2.cards[0].title || "").length > 1, r2.cards[0].title);
  } else {
    // Mehrdeutiger Name -> keine Karte, aber sauber gemeldet. Kein Fehler.
    check("next-patients ohne Karte nur bei Rueckfrage", /mehrere|Wen genau|finde/i.test(String(r2.message || "")), String(r2.message || "").slice(0, 140));
  }

  // --- 3) Diktat -> Doku-Memo-Karte (die Flip-Rueckseite beim Diktieren)
  const r3 = await post("/tools/save-treatment-dictation", {
    appointmentId: termin.id,
    text: "Zahn 36 Füllung zweiflächig okklusal-distal mit Composite gelegt, Infiltrationsanästhesie.",
  });
  check("Diktat gespeichert", r3.ok === true && !!r3.dictationId, r3.message);
  check("Doku-Karte vorhanden + wohlgeformt", kartenForm(r3.card) && r3.card.kind === "doku", JSON.stringify(r3.card)?.slice(0, 240));
  const noteItems = (r3.card?.items || []).filter((i) => i.level === "ok" && i.icon === "note");
  check("Doku-Karte zeigt Notiz-Punkte", noteItems.length >= 1, JSON.stringify(noteItems));
  const hatOffene = (r3.card?.items || []).some((i) => i.level === "warn");
  check("Doku-Karte zeigt offene Fragen (warn) ODER 'vollstaendig'-Fuss", hatOffene || /vollständig/i.test(String(r3.card?.footer || "")), `footer=${r3.card?.footer}`);

  // --- 4) Status-Abfrage -> gleiche Karten-Sicht
  const r4 = await post("/tools/doku-offen", { appointmentId: termin.id });
  check("doku-offen ok", r4.ok === true, String(r4.message || "").slice(0, 140));
  check("Status-Karte vorhanden + wohlgeformt", kartenForm(r4.card) && r4.card.kind === "doku", JSON.stringify(r4.card)?.slice(0, 200));

  // --- 5) Praxisweite Luecken -> Luecken-Karte
  const r5 = await post("/tools/doku-luecken", { days: 7 });
  check("doku-luecken ok", r5.ok === true, String(r5.message || "").slice(0, 140));
  check("Luecken-Karte vorhanden + wohlgeformt", kartenForm(r5.card) && r5.card.kind === "luecken", JSON.stringify(r5.card)?.slice(0, 200));
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
