import "dotenv/config";
import { db } from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import {
  specialtyKeyForClient,
  invalidateSpecialtyCache,
  dokuAnforderungen,
} from "../src/clara/dokuPflicht.js";

// Plattform-Regel (Masterplan Phase 7): Fachrichtung kommt aus Client-Daten,
// nicht aus Code. Dieser Test prueft den Resolver gegen einen SYNTHETISCHEN
// Zweit-Mandanten (Hausarzt) - jedes Doku-Feature muss auch ohne Zahn-Kontext
// funktionieren. Isolierter zzz-Mandant, raeumt vollstaendig auf.
//   node scripts/test-specialty-resolver.mjs

const C = "zzz-mas2-specialty";
const LOC = "loc-specialty-test";

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const locRef = db.collection("clients").doc(C).collection("locations").doc(LOC);

async function cleanup() {
  const specs = await locRef.collection("specialities").get();
  await Promise.all(specs.docs.map((d) => d.ref.delete()));
  await locRef.delete();
  await masCollection(C, "mas_config").doc("booking").delete();
  await masCollection(C, "mas_config").doc("doku").delete();
  invalidateSpecialtyCache(C);
}

async function resolveFresh() {
  invalidateSpecialtyCache(C);
  return specialtyKeyForClient(C);
}

async function run() {
  await cleanup();

  console.log("=== 1) Kein Datenbestand -> Fallback zahnmedizin ===");
  check((await resolveFresh()) === "zahnmedizin", "leerer Mandant faellt auf zahnmedizin zurueck");

  console.log("\n=== 2) Provisionierung: Hausarzt-Standort ===");
  await masCollection(C, "mas_config").doc("booking").set({ locationId: LOC });
  await locRef.collection("specialities").doc("s1").set({
    name: "Allgemeinmedizin", specialtyKey: "hausarzt", cardinality: 1,
  });
  check((await resolveFresh()) === "hausarzt", "specialtyKey 'hausarzt' aus Standort-Daten");

  console.log("\n=== 3) Haupt-Fachrichtung gewinnt (kleinste cardinality) ===");
  await locRef.collection("specialities").doc("s2").set({
    name: "Kardiologie", specialtyKey: "kardiologie", cardinality: 0,
  });
  check((await resolveFresh()) === "kardiologie", "kleinste cardinality (0) schlaegt hausarzt (1)");

  console.log("\n=== 4) MAS-Override schlaegt Provisionierung ===");
  await masCollection(C, "mas_config").doc("doku").set({ specialtyKey: "augenheilkunde" });
  check((await resolveFresh()) === "augenheilkunde", "mas_config/doku.specialtyKey gewinnt");

  console.log("\n=== 5) Unbekannter Override wird ignoriert ===");
  await masCollection(C, "mas_config").doc("doku").set({ specialtyKey: "quantenmedizin" });
  check((await resolveFresh()) === "kardiologie", "Key ohne Katalog ignoriert -> Provisionierung");

  console.log("\n=== 6) Cache: alter Wert bis zur Invalidierung ===");
  await masCollection(C, "mas_config").doc("doku").set({ specialtyKey: "hno" });
  const cached = await specialtyKeyForClient(C); // ohne invalidate
  check(cached === "kardiologie", "ohne Invalidierung bleibt der gecachte Wert");
  invalidateSpecialtyCache(C);
  check((await specialtyKeyForClient(C)) === "hno", "nach Invalidierung frisch aufgeloest");

  console.log("\n=== 7) Altbestand ohne specialtyKey: Zahn-Heuristik ===");
  await masCollection(C, "mas_config").doc("doku").delete();
  const specs = await locRef.collection("specialities").get();
  await Promise.all(specs.docs.map((d) => d.ref.delete()));
  await locRef.collection("specialities").doc("s3").set({ name: "Implantologie", cardinality: 1 });
  await locRef.collection("specialities").doc("s4").set({ name: "Prophylaxe", cardinality: 2 });
  check((await resolveFresh()) === "zahnmedizin", "Namens-Marker (Implantologie) -> zahnmedizin");

  console.log("\n=== 8) Aufgeloester Key steuert die Doku-Anforderungen ===");
  const gp = dokuAnforderungen("hausarzt", "Gesundheits-Check-up 35");
  check(gp.regel?.id === "checkup" && gp.quelle === "fachkatalog", "Hausarzt-Katalog trifft Check-up");
  check(gp.regel?.felder.some((f) => f.key === "impfstatus" && f.pflicht), "Pflichtfeld Impfstatus vorhanden");
  const zahn = dokuAnforderungen("zahnmedizin", "Gesundheits-Check-up 35");
  check(zahn.regel?.id !== "checkup", "Zahn-Katalog kennt den Check-up NICHT (getrennte Kataloge)");
  // Unbekannte Besuchsgruende faengt der Konsultations-Archetyp (match /./) ab -
  // jede Fachrichtung bekommt so IMMER sinnvolle Anforderungen, nie "nichts".
  const unbekannt = dokuAnforderungen("hausarzt", "Quantenharmonisierung");
  check(unbekannt.quelle === "archetyp" && unbekannt.regel?.id === "a_konsultation" && unbekannt.dokuPflichtig,
    "unbekannter Grund -> Konsultations-Archetyp, dokupflichtig");

  await cleanup();
  console.log(failed === 0 ? "\nALLE CHECKS BESTANDEN" : `\n${failed} CHECK(S) FEHLGESCHLAGEN`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error("Testlauf abgebrochen:", e?.stack || e);
  try { await cleanup(); } catch { /* best effort */ }
  process.exit(1);
});
