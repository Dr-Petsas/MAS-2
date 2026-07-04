import "dotenv/config";
import admin from "../src/firebase.js";
import { dokuAnforderungen } from "../src/clara/dokuPflicht.js";

// READ-ONLY: Abdeckungs-Matrix der Basis-Doku-Mappings ueber ALLE Master-
// Kataloge (25 Fachrichtungen). Zeigt je Fachrichtung, wie viele Besuchs-
// gruende eine Fachkatalog-Regel, einen Archetyp oder nur das Geruest treffen.
const db = admin.firestore();
const mcSnap = await db.collection("masterCatalogs").get();

let totalMotive = 0;
let totalFach = 0;
let totalArchetyp = 0;
let totalGeruest = 0;
const geruestFaelle = [];

for (const d of mcSnap.docs) {
  const key = d.id;
  const vs = await d.ref.collection("visitMotives").get();
  const names = [...new Set(vs.docs.map((v) => String(v.data()?.name || "").trim()).filter(Boolean))];
  let fach = 0, arch = 0, ger = 0;
  const archIds = new Map();
  for (const n of names) {
    const a = dokuAnforderungen(key, n);
    if (a.quelle === "fachkatalog") fach += 1;
    else if (a.quelle === "archetyp") {
      arch += 1;
      archIds.set(a.regel.id, (archIds.get(a.regel.id) || 0) + 1);
    } else {
      ger += 1;
      geruestFaelle.push(`${key}: ${n}`);
    }
  }
  totalMotive += names.length;
  totalFach += fach;
  totalArchetyp += arch;
  totalGeruest += ger;
  const archStr = [...archIds.entries()].map(([id, c]) => `${id}=${c}`).join(", ");
  console.log(`${key.padEnd(28)} ${String(names.length).padStart(3)} Motive | Fachregel ${String(fach).padStart(3)} | Archetyp ${String(arch).padStart(3)} (${archStr}) | NUR-Geruest ${ger}`);
}

console.log(`\nGESAMT: ${totalMotive} Motive | Fachregel ${totalFach} | Archetyp ${totalArchetyp} | NUR-Geruest ${totalGeruest}`);
if (geruestFaelle.length) {
  console.log("\nNUR-GERUEST-Faelle (kein Fachkatalog, kein Archetyp — bitte pruefen):");
  for (const f of geruestFaelle) console.log("  - " + f);
}
process.exit(0);
