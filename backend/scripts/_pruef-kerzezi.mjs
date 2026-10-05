// Sicherheitspruefung 17.08.2026: Um 09:16 behauptete Clara aus drei Wortfetzen
// eine Buchung fuer "Frau Kerzezi". Frage: ist dabei wirklich ein Termin im
// Kalender entstanden? Liest die ECHTEN Termine der Praxis (Plattform-Kalender),
// loest die Patientennamen auf und zeigt alles, was in den letzten 36 Stunden
// angelegt wurde.
import "dotenv/config";
import admin from "firebase-admin";
import "../src/firebase.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const db = admin.firestore();
const locSnap = await db.collection("clients").doc(clientId).collection("locations").get();
const seit = new Date(Date.now() - 36 * 3600 * 1000);

async function patientName(locId, pid) {
  if (!pid) return "(kein Patient verknuepft)";
  const p = await db.collection("clients").doc(clientId).collection("locations").doc(locId)
    .collection("patients").doc(String(pid)).get().catch(() => null);
  if (!p?.exists) return `(Patient ${pid} nicht gefunden)`;
  const d = p.data() || {};
  return [d.lastName, d.firstName].filter(Boolean).join(", ") || d.name || `(Patient ${pid})`;
}

for (const loc of locSnap.docs) {
  const appts = await db.collection("clients").doc(clientId)
    .collection("locations").doc(loc.id).collection("appointments")
    .orderBy("createdAt", "desc").limit(80).get();
  console.log(`\n=== Standort ${loc.id}: ${appts.size} Termine gelesen`);
  console.log("Felder eines Termins:", Object.keys(appts.docs[0]?.data() || {}).sort().join(", "));

  let treffer = 0;
  for (const d of appts.docs) {
    const a = d.data() || {};
    const erstellt = a.createdAt?.toDate ? a.createdAt.toDate() : null;
    if (!erstellt || erstellt < seit) continue;
    const name = await patientName(loc.id, a.patientId || a.patient?.id);
    const beginn = a.start?.toDate ? a.start.toDate() : null;
    console.log(`  angelegt ${erstellt.toLocaleString("de-DE")} | ${name} | Beginn ${beginn?.toLocaleString("de-DE") || a.start || "?"} | Status ${a.status || "-"} | von ${a.createdBy || a.source || "?"}`);
    if (/kerz|kerc|kirz|gerz/i.test(name)) treffer++;
  }
  console.log(treffer ? `ACHTUNG: ${treffer} Termin(e) klingen nach Kerzezi` : "Kein Termin, der nach Kerzezi klingt.");
}
process.exit(0);
