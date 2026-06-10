// One-off diagnostic: dump a client's billing doc + calendars to debug
// why superuser license assignments don't reach the customer account.
// Usage: node scripts/dump-billing.mjs <searchName>
import "dotenv/config";
import { db } from "../src/firebase.js";

const search = (process.argv[2] || "blessing").toLowerCase();

const clientsSnap = await db.collection("clients").get();
const matches = clientsSnap.docs.filter((d) => {
  const o = d.data() || {};
  const name = `${o.name || ""} ${o.practiceName || ""} ${o.title || ""}`.toLowerCase();
  return name.includes(search);
});

if (!matches.length) {
  console.log(`Kein Client gefunden fuer "${search}". Vorhandene Clients:`);
  clientsSnap.docs.forEach((d) => console.log(` - ${d.id}: ${(d.data() || {}).name || "?"}`));
  process.exit(1);
}

for (const doc of matches) {
  const o = doc.data() || {};
  console.log(`\n===== CLIENT ${doc.id} (${o.name || "?"}) =====`);
  console.log("features:", JSON.stringify(o.features || {}, null, 2));
  console.log("isEnabled:", o.isEnabled);

  const billing = await db.doc(`clients/${doc.id}/settings/billing`).get();
  console.log("\n--- settings/billing ---");
  console.log(billing.exists ? JSON.stringify(billing.data(), null, 2) : "(existiert nicht)");

  const locs = await db.collection(`clients/${doc.id}/locations`).get();
  for (const loc of locs.docs) {
    const lo = loc.data() || {};
    console.log(`\n--- location ${loc.id} (${lo.name || "?"}) ---`);
    console.log("features:", JSON.stringify(lo.features || {}));
    const cals = await db.collection(`clients/${doc.id}/locations/${loc.id}/calendars`).get();
    for (const cal of cals.docs) {
      const c = cal.data() || {};
      console.log(`  calendar ${cal.id}: name=${c.name || "?"} license=${c.license} internal=${c.internal} isDeleted=${c.isDeleted}`);
    }
  }
}
process.exit(0);
