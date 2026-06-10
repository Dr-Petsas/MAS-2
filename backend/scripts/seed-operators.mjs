import "dotenv/config";
import { setOperators, listOperators } from "../src/clara/operators.js";

// Seeds the per-tenant operator registry (clients/{clientId}/mas_config/team).
// PINs are stored hashed; the plaintext is printed here ONCE so the team can use
// (and then change) them.  Usage: node scripts/seed-operators.mjs [clientId]
const clientId = (process.argv[2] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();

const members = [
  { name: "Dr. Petsas", role: "doctor", doctorName: "Dr. Petsas", pin: "1001" },
  { name: "Dr. Nikolaou", role: "doctor", doctorName: "Dr. Nikolaou", pin: "1002" },
  { name: "Dr. Patrikis", role: "doctor", doctorName: "Dr. Patrikis", pin: "1003" },
  { name: "Rezeption", role: "frontdesk", pin: "2001" },
  { name: "Praxisleitung", role: "admin", pin: "9001" },
];

const res = await setOperators(clientId, members);
console.log(`seeded ${res.count} operators for ${clientId}\n`);
console.log("PINs (bitte nach dem ersten Test aendern):");
for (const m of members) console.log(`  ${m.pin}  ->  ${m.name} (${m.role})`);

console.log("\nGespeichert (ohne Hashes):");
console.log(JSON.stringify(await listOperators(clientId), null, 2));
process.exit(0);
