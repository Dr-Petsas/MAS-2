// Identity resolution smoke test.
//   node scripts/test-identity.mjs [clientId] [name]
// - asserts the deterministic "no name -> unmatched" branch
// - runs a real masSearchPatients lookup against the given client (informational)
import { resolvePatientSubject, nameLooksConsistent } from "../src/brain/identity.js";
import { extractPatientName } from "../src/brain/extractor.js";

let pass = 0, fail = 0;
function check(cond, label) {
  if (cond) { pass++; console.log("  ok:", label); }
  else { fail++; console.log("  FAIL:", label); }
}

const clientId = (process.argv[2] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
const name = process.argv[3] || "Ackermann";

console.log("=== deterministic branch ===");
const empty = await resolvePatientSubject(clientId, "");
check(empty.matchStatus === "unmatched" && empty.patientId === null, "leerer Name -> unmatched, kein patientId");

console.log("\n=== Namens-Konsistenz (Verwechslungsschutz, ohne Netz) ===");
check(nameLooksConsistent("Meier", { lastName: "Meier", firstName: "Anna" }), "Nachname-only Query passt");
check(nameLooksConsistent("Anna Meier", { lastName: "Meier", firstName: "Anna" }), "Voller Name passt");
check(!nameLooksConsistent("Anna Schmidt", { lastName: "Müller", firstName: "Anna" }), "Falscher Nachname -> inkonsistent");
check(!nameLooksConsistent("Anna", { lastName: "Müller", firstName: "Anna" }), "Nur Vorname -> zu schwach (inkonsistent)");
check(nameLooksConsistent("Herr Müller", { lastName: "Müller" }), "Anrede ignoriert, Nachname passt");
check(nameLooksConsistent("Mueller", { lastName: "Müller" }), "Umlaut-Faltung (ue == ü)");
check(!nameLooksConsistent("", { lastName: "Müller" }), "leere Query -> nicht konsistent");
check(nameLooksConsistent("Anna-Lena Vogt-Berg", { lastName: "Vogt-Berg", firstName: "Anna-Lena" }), "Doppelnamen passen");

console.log("\n=== name extraction -> resolve (real lookup) ===");
const spoken = `Guten Tag, mein Name ist ${name}, ich hätte gern einen Termin.`;
const extracted = extractPatientName([{ role: "user", text: spoken }]);
console.log("  extrahiert:", JSON.stringify(extracted));

const resolved = await resolvePatientSubject(clientId, extracted || name);
console.log("  matchStatus:", resolved.matchStatus);
console.log("  patientId:", resolved.patientId);
console.log("  name:", resolved.name);
console.log("  candidates:", (resolved.candidates || []).length);
check(["matched", "ambiguous", "unmatched"].includes(resolved.matchStatus), "matchStatus ist gültig");
check(resolved.matchStatus !== "matched" || !!resolved.patientId, "matched => patientId gesetzt");
check(resolved.matchStatus !== "ambiguous" || resolved.patientId === null, "ambiguous => kein patientId (nie raten)");

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
