import "dotenv/config";
import admin from "../src/firebase.js";

// READ-ONLY: Struktur + Besuchsgruende ALLER Master-Kataloge (25 Fachrichtungen)
// als Grundlage fuer die Basis-Doku-Mappings je Fachrichtung.
const db = admin.firestore();
const mcSnap = await db.collection("masterCatalogs").get();

for (const d of mcSnap.docs) {
  const x = d.data() || {};
  console.log(`\n===== ${d.id} (${x.specialtyNameDe || "?"}) =====`);
  // Subcollections erkunden
  const subs = await d.ref.listCollections();
  const subNames = subs.map((c) => c.id);
  if (!subNames.length) {
    // Motive evtl. als Array-Feld?
    const keys = Object.keys(x);
    console.log("  (keine Subcollections; Felder: " + keys.join(", ") + ")");
    continue;
  }
  for (const c of subs) {
    if (!/motive/i.test(c.id)) { console.log(`  [sub ${c.id}] (uebersprungen)`); continue; }
    const vs = await c.get();
    const names = vs.docs.map((v) => String(v.data()?.name || v.data()?.nameDe || "")).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "de"));
    console.log(`  [${c.id}] ${names.length} Motive:`);
    for (const n of names) console.log("    - " + n);
  }
}
process.exit(0);
