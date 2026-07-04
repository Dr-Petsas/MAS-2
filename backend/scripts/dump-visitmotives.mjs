import "dotenv/config";
import admin from "../src/firebase.js";
import { loadBooking } from "../src/clara/booking.js";

// READ-ONLY: Grundlage fuer das Doku-Pflicht-Mapping (fachrichtungs-agnostisch).
// Dumpt (1) Besuchsgruende des Clients inkl. Fachrichtungs-Zuordnung,
// (2) die Specialities des Clients mit specialtyKey (Master-Katalog-Slug),
// (3) alle masterCatalogs (verfuegbare Fachrichtungen plattformweit).
const clientId = (process.argv[2] || process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
const db = admin.firestore();

const booking = await loadBooking(clientId);
const locationId = booking?.locationId;
console.log("clientId:", clientId, " locationId:", locationId);

// --- Specialities des Clients (Fachrichtungen) --------------------------------
const specCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("specialities");
const specSnap = await specCol.get().catch(() => null);
const specs = new Map();
console.log("\n=== SPECIALITIES (Client) ===");
if (specSnap && !specSnap.empty) {
  for (const d of specSnap.docs) {
    const x = d.data() || {};
    specs.set(d.id, x);
    console.log(`- ${d.id}: name=${JSON.stringify(x.name || "")} specialtyKey=${JSON.stringify(x.specialtyKey || "")} catalogGroup=${JSON.stringify(x.specialtyCatalogGroup || "")}`);
  }
} else {
  console.log("(keine specialities-Collection oder leer)");
}

// --- VisitMotives des Clients --------------------------------------------------
const vmCol = db.collection("clients").doc(clientId).collection("locations").doc(locationId).collection("visitMotives");
const vmSnap = await vmCol.get().catch(() => null);
console.log("\n=== VISIT MOTIVES (Client) ===");
if (vmSnap && !vmSnap.empty) {
  const rows = vmSnap.docs.map((d) => {
    const x = d.data() || {};
    const spec = specs.get(x.specialityId || "");
    return {
      id: d.id,
      name: x.name || "",
      speciality: spec?.name || x.specialityId || "",
      specialtyKey: spec?.specialtyKey || "",
      duration: x.duration || 0,
      docIds: Array.isArray(x.documentIds) ? x.documentIds.length : 0,
    };
  }).sort((a, b) => (a.speciality + a.name).localeCompare(b.speciality + b.name, "de"));
  for (const r of rows) {
    console.log(`- [${r.speciality}${r.specialtyKey ? "/" + r.specialtyKey : ""}] ${JSON.stringify(r.name)} (${r.duration} min, ${r.docIds} Pflicht-Doks, id=${r.id})`);
  }
  console.log("gesamt:", rows.length);
} else {
  console.log("(keine visitMotives-Collection oder leer — booking.visitMotives als Fallback:)");
  for (const v of booking?.visitMotives || []) console.log(`- ${JSON.stringify(v.name)} (${v.duration} min, id=${v.id})`);
}

// --- Master-Kataloge (plattformweit, Fachrichtungen) ---------------------------
console.log("\n=== MASTER CATALOGS (plattformweit) ===");
const mcSnap = await db.collection("masterCatalogs").get().catch(() => null);
if (mcSnap && !mcSnap.empty) {
  for (const d of mcSnap.docs) {
    const x = d.data() || {};
    const c = x.counts || {};
    console.log(`- ${d.id}: ${JSON.stringify(x.specialtyNameDe || "")} v${x.version || "?"} status=${x.status || "?"} (motive=${c.visitMotives || 0}, docs=${c.documents || 0})`);
  }
} else {
  console.log("(keine masterCatalogs gefunden)");
}

process.exit(0);
