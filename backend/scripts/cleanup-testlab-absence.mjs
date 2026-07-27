// Einmal-Aufraeumer (27.07.2026): Ein Testlauf des Testlabors hat ueber
// plan_absence eine ECHTE Abwesenheit samt Kalender-Sperrblock angelegt, weil
// der Labor-Modus alle MAS-Tools echt ausfuehrte, bevor die serverseitige
// Test-Umleitung existierte. Dieses Skript findet solche von Clara erzeugten
// Abwesenheits-Sperrbloecke in einem Zeitfenster und entfernt sie samt Vorgang.
//
// Aufruf (Trockenlauf zeigt nur an):
//   node scripts/cleanup-testlab-absence.mjs 2026-08-07
//   node scripts/cleanup-testlab-absence.mjs 2026-08-07 --delete
import admin from "../src/firebase.js";

const db = admin.firestore();

const clientId = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const day = process.argv[2] || "";
const doDelete = process.argv.includes("--delete");
if (!day) {
  console.error("Datum fehlt: node scripts/cleanup-testlab-absence.mjs 2026-08-07 [--delete]");
  process.exit(1);
}

const cases = await db.collection("clients").doc(clientId).collection("mas_cases")
  .where("absencePlan.date", "==", day).get()
  .catch(async () => db.collection("clients").doc(clientId).collection("mas_cases").get());

const hits = cases.docs.filter((d) => (d.data()?.absencePlan?.date === day));
console.log(`Vorgaenge mit Abwesenheit am ${day}: ${hits.length}`);

for (const d of hits) {
  const p = d.data().absencePlan || {};
  console.log(`  ${d.id}  Kalender=${p.calendarName}  Block=${p.blockAppointmentId || "-"}  Status=${d.data().status}`);
  if (!doDelete) continue;

  if (p.blockAppointmentId && p.locationId) {
    await db.collection("clients").doc(clientId)
      .collection("locations").doc(p.locationId)
      .collection("appointments").doc(p.blockAppointmentId).delete()
      .then(() => console.log(`    Sperrblock ${p.blockAppointmentId} geloescht`))
      .catch((e) => console.log(`    Sperrblock NICHT geloescht: ${e.message}`));
  }
  await d.ref.delete();
  console.log(`    Vorgang ${d.id} geloescht`);
}

if (!doDelete && hits.length) console.log("\nTrockenlauf. Zum Loeschen mit --delete erneut aufrufen.");
await admin.app().delete();
