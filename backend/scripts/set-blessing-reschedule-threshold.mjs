// Setzt die Bagatell-Schwelle fuer Terminverschiebungs-Benachrichtigungen bei Blessing.
// notificationsSettings.rescheduleNotifyMinMinutes = 15  (Verschiebungen < 15 Min -> keine Patienten-Nachricht)
// Dry-Run:  node scripts/set-blessing-reschedule-threshold.mjs
// Schreiben: node scripts/set-blessing-reschedule-threshold.mjs --apply
import "dotenv/config";
import { db } from "../src/firebase.js";

const CLIENT_ID = "UUJnPzoYPa4yYyzcaGlm";   // Blessing (aktiv)
const LOCATION_ID = "dlxNwKLaA5VMEWQ5AjsL"; // Blessing Standort
const VALUE = 15;
const APPLY = process.argv.includes("--apply");

const ref = db.doc(`clients/${CLIENT_ID}/locations/${LOCATION_ID}`);
const snap = await ref.get();
if (!snap.exists) { console.log("Location nicht gefunden!"); process.exit(1); }

const ns = snap.data()?.notificationsSettings || {};
console.log(`Location: ${snap.data()?.name || "?"}`);
console.log(`Aktuell rescheduleNotifyMinMinutes = ${ns.rescheduleNotifyMinMinutes ?? "(nicht gesetzt)"}`);

if (!APPLY) {
  console.log(`\nDRY-RUN: wuerde auf ${VALUE} setzen. Mit --apply ausfuehren.`);
  process.exit(0);
}

await ref.update({ "notificationsSettings.rescheduleNotifyMinMinutes": VALUE });
const after = (await ref.get()).data()?.notificationsSettings?.rescheduleNotifyMinMinutes;
console.log(`\nGESETZT: rescheduleNotifyMinMinutes = ${after}`);
process.exit(0);
