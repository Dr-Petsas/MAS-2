// READ-ONLY Diagnose: findet "Termin verschoben"-Log-Eintraege bei Blessing
// rund um den 24.07.2026 und zeigt WER, WANN, ALT->NEU, Quelle (manuell/online).
// Aendert NICHTS. Usage: node scripts/find-blessing-reschedules.mjs
import "dotenv/config";
import { db } from "../src/firebase.js";

const clientArg = process.argv.find(a => a.startsWith("--client="));
const CLIENT_ID = clientArg ? clientArg.split("=")[1] : "UUJnPzoYPa4yYyzcaGlm"; // Default: Blessing
// Zeitfenster fuer die Log-EINTRAEGE (wann verschoben wurde), grosszuegig:
const FROM = new Date("2026-07-01T00:00:00+02:00");
const TO   = new Date("2026-07-25T23:59:59+02:00");
const ONLY_DOUBLE = process.argv.includes("--double"); // nur echte Doppel-Benachrichtigungen ausgeben
const LIST_MANUAL = process.argv.includes("--list");  // kompakte Liste aller manuellen Verschiebungen

const userCache = new Map();
async function resolveUser(userId) {
  if (!userId) return "(kein userId - evtl. System/Online)";
  if (userCache.has(userId)) return userCache.get(userId);
  let label = userId;
  for (const path of [`clients/${CLIENT_ID}/users/${userId}`, `users/${userId}`]) {
    const snap = await db.doc(path).get().catch(() => null);
    if (snap?.exists) {
      const u = snap.data() || {};
      label = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || u.email || userId;
      break;
    }
  }
  userCache.set(userId, label);
  return label;
}

const patientCache = new Map();
async function resolvePatient(locId, patientId) {
  if (!patientId) return "";
  const key = `${locId}/${patientId}`;
  if (patientCache.has(key)) return patientCache.get(key);
  let label = patientId;
  const snap = await db.doc(`clients/${CLIENT_ID}/locations/${locId}/patients/${patientId}`).get().catch(() => null);
  if (snap?.exists) {
    const p = snap.data() || {};
    label = `${p.firstName || ""} ${p.lastName || ""}`.trim() || patientId;
  }
  patientCache.set(key, label);
  return label;
}

const clientSnap = await db.doc(`clients/${CLIENT_ID}`).get();
console.log(`Client ${CLIENT_ID}: ${clientSnap.exists ? (clientSnap.data()?.name || "?") : "(nicht gefunden!)"}`);

const locs = await db.collection(`clients/${CLIENT_ID}/locations`).get();
console.log(`${locs.size} Standort(e), Log-Fenster ${FROM.toLocaleString("de-DE")} - ${TO.toLocaleString("de-DE")}\n`);

let totalHits = 0;

for (const loc of locs.docs) {
  let snap;
  try {
    snap = await db.collection(`clients/${CLIENT_ID}/locations/${loc.id}/logItems`)
      .where("createdAt", ">=", FROM)
      .where("createdAt", "<=", TO)
      .orderBy("createdAt", "asc")
      .get();
  } catch (e) {
    console.log(`--- Standort ${loc.id}: FEHLER bei Query: ${e.message}`);
    continue;
  }

  const hits = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => (x.message || "").toLowerCase().includes("verschoben"));

  totalHits += hits.length;
  console.log(`=== Standort ${loc.id} (${loc.data()?.name || "?"}): ${snap.size} Logs im Fenster, ${hits.length} Verschiebungen ===`);

  if (LIST_MANUAL) {
    const manual = hits
      .map(x => ({ ...x, when: x.createdAt?.toDate ? x.createdAt.toDate() : new Date(x.createdAt) }))
      .filter(x => x.source === "calendar-web")
      .sort((a, b) => a.when - b.when);
    console.log(`\n  MANUELLE Verschiebungen (Kalender): ${manual.length}\n`);
    let n = 0;
    for (const m of manual) {
      const who = await resolveUser(m.userId);
      const pat = m.patientId ? await resolvePatient(loc.id, m.patientId) : "(kein Patient)";
      const ts = m.when.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      console.log(`  ${String(++n).padStart(3)}. [${ts}] ${who}  |  ${pat}  |  ${m.message}`);
    }
    console.log("");
    continue;
  }

  for (const h of (ONLY_DOUBLE ? [] : hits)) {
    const when = h.createdAt?.toDate ? h.createdAt.toDate() : new Date(h.createdAt);
    const who = await resolveUser(h.userId);
    const patName = await resolvePatient(loc.id, h.patientId);
    const kanal = h.source === "calendar-web" ? "MANUELL (Kalender-Drag/Dialog)"
                : h.source === "appointments-service" ? "ONLINE / Telefon-KI (postpone)"
                : (h.source || "?");
    console.log(
      `\n [${when.toLocaleString("de-DE")}]  ${kanal}  (type=${h.type})` +
      `\n   Mitarbeiter : ${who}  (userId=${h.userId || "-"})` +
      `\n   Patient     : ${patName}  (patientId=${h.patientId || "-"})` +
      `\n   Termin-ID   : ${h.appointmentId || "-"}` +
      `\n   Nachricht   : ${h.message}`
    );
  }

  // Gruppieren: gleiche appointmentId >1x = mehrfach verschoben
  const byAppt = {};
  for (const h of hits) (byAppt[h.appointmentId] ??= []).push(h);
  const doppelt = Object.entries(byAppt).filter(([, v]) => v.length > 1);

  console.log(`\n  >>> Termine mit >1 Verschiebung, die GETRENNTE Benachrichtigungen ausloesten (Abstand >15 Min):\n`);
  for (const [appt, v] of doppelt) {
    const sorted = v.map(x => ({ ...x, when: x.createdAt?.toDate ? x.createdAt.toDate() : new Date(x.createdAt) }))
                    .sort((a, b) => a.when - b.when);
    let separateNotifs = 1;
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i].when - sorted[i-1].when) / 60000 > 15) separateNotifs++;
    }
    if (separateNotifs < 2) continue; // nur echte Doppel-Benachrichtigungen
    const pat = sorted[0].patientId ? await resolvePatient(loc.id, sorted[0].patientId) : "(kein Patient)";
    console.log(`  PATIENT: ${pat}  (patientId=${sorted[0].patientId || "-"}, appointmentId=${appt})`);
    console.log(`  -> ${separateNotifs} getrennte Benachrichtigungen:`);
    for (const s of sorted) {
      const who = await resolveUser(s.userId);
      const kanal = s.source === "calendar-web" ? "manuell/Kalender" : s.source === "appointments-service" ? "online/Telefon-KI" : (s.source || "?");
      console.log(`     [${s.when.toLocaleString("de-DE")}] ${kanal} durch ${who}  ::  ${s.message}`);
    }
    console.log("");
  }
}

console.log(`\nGESAMT: ${totalHits} Verschiebungs-Logs im Zeitfenster.`);
process.exit(0);
