// Einmal-Pruefung fuer den Lueckenfueller-Livetest: Welche Telefonnummer
// traegt der Testpatient (Petsassss) wirklich, und was steht im
// test_redirect? Nur LESEN, keine Schreibzugriffe.
import "dotenv/config";
import { searchPatient } from "../src/clara/agentBooking.js";
import { masCollection } from "../src/tenant.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";

const r = await searchPatient(clientId, "Petsassss");
const items = r?.patients || [];
console.log("Treffer:", items.length);
for (const p of items.slice(0, 3)) {
  console.log({
    id: p.id,
    name: `${p.firstName || ""} ${p.lastName || ""}`.trim(),
    mobil: p.mobilePhoneNumber || "",
    festnetz: p.phoneNumber || "",
    geburtsjahr: p.birthYear || p.dateOfBirth || "",
  });
}

const snap = await masCollection(clientId, "mas_config").doc("test_redirect").get();
console.log("test_redirect:", snap.exists ? JSON.stringify(snap.data()) : "(fehlt)");
process.exit(0);
