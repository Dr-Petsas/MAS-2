import "dotenv/config";
import admin from "../src/firebase.js";
import { loadBooking } from "../src/clara/booking.js";
import { dokuAnforderungen, specialtyKeyForClient, querschnittTreffer } from "../src/clara/dokuPflicht.js";

// READ-ONLY: prueft, welche Doku-Pflicht-Regel jeder ECHTE Besuchsgrund des
// Clients trifft — Abdeckungs-Matrix inkl. Pflichtfeldern fuer die Korrektur.
const clientId = (process.argv[2] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
const db = admin.firestore();

const booking = await loadBooking(clientId);
const locationId = booking?.locationId;
const vmSnap = await db.collection("clients").doc(clientId)
  .collection("locations").doc(locationId).collection("visitMotives").get();

const specialty = await specialtyKeyForClient(clientId);
const byRule = new Map();
let total = 0;
for (const d of vmSnap.docs) {
  const name = String(d.data()?.name || "").trim();
  if (!name) continue;
  total += 1;
  const a = dokuAnforderungen(specialty, name);
  const key = a.regel ? a.regel.id : "!!NUR-GERUEST";
  if (!byRule.has(key)) byRule.set(key, { regel: a.regel, umfang: a.umfang, namen: [] });
  byRule.get(key).namen.push(name);
}

const keys = [...byRule.keys()].sort();
for (const k of keys) {
  const { regel, umfang, namen } = byRule.get(k);
  namen.sort((a, b) => a.localeCompare(b, "de"));
  const kopf = regel
    ? `${regel.label} [${umfang}${regel.eingriff ? ", EINGRIFF->Aufklaerung" : ""}]`
    : "NUR universelles Geruest [voll]";
  console.log(`\n=== ${k}: ${kopf} (${namen.length} Besuchsgruende) ===`);
  if (regel && regel.felder.length) {
    const pflicht = regel.felder.filter((f) => f.pflicht).map((f) => f.key);
    const optional = regel.felder.filter((f) => !f.pflicht).map((f) => f.key);
    if (pflicht.length) console.log("   PFLICHT : " + pflicht.join(", "));
    if (optional.length) console.log("   optional: " + optional.join(", "));
  }
  for (const n of namen) console.log("   - " + n);
}
console.log(`\ngesamt: ${total} Besuchsgruende, ${keys.length} Regeln getroffen`);

// --- Querschnitt-Selbsttest: Roentgen-Trigger auf Beispiel-Diktate -------------
console.log("\n=== QUERSCHNITT roentgen_erwaehnt — Trigger-Selbsttest ===");
const proben = [
  ["Roe 36, dann Trepanation", true],
  ["Rö 36 angefertigt", true],
  ["OPG zur Kontrolle", true],
  ["DVT regio 36", true],
  ["Rtg 12", true],
  ["Zahnfilm 24 mesial", true],
  ["Messaufnahme bei Endo 36", true],
  ["Zahn 36 Fuellung dreiflaechig, keine Besonderheiten", false],
  ["Kontrolle regio 44, reizlos", false],
  ["Provisorium rezementiert", false],
  ["Patient kommt aus dem Buero, Euro-Betrag besprochen", false],
];
let ok = 0;
for (const [text, erwartet] of proben) {
  const hit = querschnittTreffer(text).length > 0;
  const passt = hit === erwartet;
  if (passt) ok += 1;
  console.log(`   ${passt ? "OK " : "FEHLER"} ${hit ? "[trigger]" : "[still ]"} ${JSON.stringify(text)}`);
}
console.log(`Selbsttest: ${ok}/${proben.length} korrekt`);
process.exit(ok === proben.length ? 0 : 1);
