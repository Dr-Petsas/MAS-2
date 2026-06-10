// Einmalige Daten-Reparatur: subscriptions.core fuer Blessing explizit setzen.
// Das V2-Lizenzen-Panel hatte Core nie in settings/billing geschrieben (Bug, gefixt).
// Quelle der Wahrheit: die beiden Premium-Behandler-Kalender (Blessing, Dr.Ralf).
import "dotenv/config";
import { db } from "../src/firebase.js";

const CLIENT_ID = "UUJnPzoYPa4yYyzcaGlm"; // Blessing (aktiv)
const CORE_CALENDAR_IDS = [
  "8krcWh7AuXEfgWc1blzQ", // Blessing (premium)
  "TphQRh53x8SToBSa8DdB", // Dr.Ralf (premium)
];

const ref = db.doc(`clients/${CLIENT_ID}/settings/billing`);
const before = await ref.get();
console.log("Vorher core:", JSON.stringify(before.data()?.subscriptions?.core));

await ref.set({
  subscriptions: {
    core: {
      enabled: true,
      licenseCount: CORE_CALENDAR_IDS.length,
      assignedCalendarIds: CORE_CALENDAR_IDS,
    },
  },
  updatedAt: new Date().toISOString(),
}, { merge: true });

const after = await ref.get();
console.log("Nachher core:", JSON.stringify(after.data()?.subscriptions?.core));
console.log("crew unveraendert:", JSON.stringify(after.data()?.subscriptions?.crew));
process.exit(0);
