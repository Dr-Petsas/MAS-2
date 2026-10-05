// Diagnose 28.07.: Wo liegt die Praxisadresse? (fuer Lisas Einwand-Antworten)
import "dotenv/config";
import { db } from "../src/firebase.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const locationId = "VjdvbRQHH8oTId4f0GiX";

for (const pfad of [
  `clients/${clientId}`,
  `clients/${clientId}/locations/${locationId}`,
]) {
  const snap = await db.doc(pfad).get().catch(() => null);
  console.log(`--- ${pfad}: ${snap?.exists ? "EXISTIERT" : "fehlt"}`);
  if (snap?.exists) {
    const d = snap.data();
    for (const k of Object.keys(d).sort()) {
      const v = d[k];
      const str = typeof v === "object" ? JSON.stringify(v) : String(v);
      if (/addr|adress|street|stra|city|stadt|plz|zip|phone|name/i.test(k) || str.length < 90) {
        console.log(`  ${k}: ${str.length > 200 ? str.slice(0, 200) + "…" : str}`);
      } else {
        console.log(`  ${k}: <${str.length} Zeichen>`);
      }
    }
  }
}
process.exit(0);
