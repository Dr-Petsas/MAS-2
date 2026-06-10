import "dotenv/config";
import { setOperators, listOperators, identifyByPin, normalizeRole } from "../src/clara/operators.js";
import { buildCaseBriefing, buildSpokenCaseBriefing } from "../src/brain/caseBriefing.js";

let failed = 0;
function check(cond, msg) { console.log((cond ? "  ok: " : "  FAIL: ") + msg); if (!cond) failed++; }

console.log("=== role normalization ===");
check(normalizeRole("Arzt") === "doctor", "Arzt -> doctor");
check(normalizeRole("Rezeption") === "frontdesk", "Rezeption -> frontdesk");
check(normalizeRole("Praxisleitung") === "admin", "Praxisleitung -> admin");
check(normalizeRole("unbekannt") === "frontdesk", "Unbekannt -> frontdesk (sicherer Default)");

console.log("\n=== role-scoped briefing (pure) ===");
const cases = [
  { id: "c1", topic: "complaint", status: "open", contactCount: 2, subject: { name: "A Patient" }, updates: [] },
  { id: "c2", topic: "billing", status: "open", contactCount: 1, subject: { name: "B Patient" }, updates: [] },
  { id: "c3", topic: "appointment", status: "open", contactCount: 1, subject: { name: "C Patient" }, updates: [] },
  { id: "c4", topic: "other", status: "open", contactCount: 1, subject: { name: "D Patient" }, updates: [] },
];
const docB = buildCaseBriefing(cases, { role: "doctor" });
check(docB.counts.openTotal === 2, "Arzt sieht nur Beschwerde + Allgemein (2)");
check(docB.groups.billing.length === 0 && docB.groups.appointment.length === 0, "Arzt sieht KEINE Rechnung/Termine");

const fdB = buildCaseBriefing(cases, { role: "frontdesk" });
check(fdB.counts.openTotal === 3, "Rezeption sieht Rechnung+Termin+Beschwerde (3)");
check(fdB.groups.other.length === 0, "Rezeption sieht KEIN Allgemein");

const adminB = buildCaseBriefing(cases, { role: "admin" });
check(adminB.counts.openTotal === 4, "Admin sieht alles (4)");

const noRole = buildCaseBriefing(cases, {});
check(noRole.counts.openTotal === 4, "Ohne Rolle: alles (rueckwaertskompatibel)");

console.log("\n=== delegated-to-me is never hidden ===");
const withAssigned = [
  { id: "c5", topic: "billing", status: "open", contactCount: 1, assignee: "Dr. Petsas", subject: { name: "E" }, updates: [] },
];
const docAssigned = buildCaseBriefing(withAssigned, { role: "doctor", operatorName: "Dr. Petsas" });
check(docAssigned.counts.openTotal === 1, "An mich delegierte Rechnung bleibt sichtbar trotz Arzt-Rolle");

console.log("\n=== spoken greeting with name ===");
const spoken = buildSpokenCaseBriefing(buildCaseBriefing(cases, { role: "admin" }), { greeting: "Guten Morgen", operatorName: "Dr. Petsas" });
check(spoken.startsWith("Guten Morgen, Dr. Petsas."), "Begruessung mit Namen");

console.log("\n=== Firestore: registry + PIN (isolierter Test-Mandant) ===");
const TEST_CLIENT = "zzz-mas2-optest";
await setOperators(TEST_CLIENT, [
  { name: "Dr. Test", role: "doctor", pin: "4242" },
  { name: "Empfang Test", role: "frontdesk", pin: "7777" },
]);
const pub = await listOperators(TEST_CLIENT);
check(pub.length === 2, "2 Operatoren gespeichert");
check(pub.every((m) => !("pinHash" in m)), "listOperators gibt KEINE Hashes preis");

const good = await identifyByPin(TEST_CLIENT, "4242");
check(good?.name === "Dr. Test" && good.role === "doctor", "Korrekte PIN -> richtiger Operator + Rolle");
const bad = await identifyByPin(TEST_CLIENT, "0000");
check(bad === null, "Falsche PIN -> null (kein Leak)");
const malformed = await identifyByPin(TEST_CLIENT, "ab");
check(malformed === null, "Ungueltiges Format -> null");

// cleanup
const admin = (await import("../src/firebase.js")).default;
await admin.firestore().collection("clients").doc(TEST_CLIENT).collection("mas_config").doc("team").delete();
console.log("(cleanup done)");

console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
