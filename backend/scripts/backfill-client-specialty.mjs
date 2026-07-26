// Backfill: Kunden-Fachrichtung fuer MAS aus medicalSpecialties spiegeln.
// ---------------------------------------------------------------------------
// Die Plattform speichert die Fachrichtung eines Mandanten als
// clients/{id}.medicalSpecialties[] (englische Keys wie "dermatologist"). MAS/
// Clara/Lena lesen aber clients/{id}.specialty | .fachrichtung | .fach
// (getClientSpecialty). Der Frontend-Fix (ClientsService.updateClient) spiegelt
// das ab jetzt bei jeder Anlage/Bearbeitung — dieses Skript holt die
// BESTANDSKUNDEN einmalig nach.
//
// Regeln (nicht-destruktiv):
//   - Nur schreiben, wenn ein Mapping existiert UND specialty/fachrichtung/fach
//     ALLE leer sind (vorhandene Werte werden NIE ueberschrieben).
//   - Kanonischer Wert = Katalog-Slug der ERSTEN gemappten Fachrichtung
//     (identisch zur Frontend-Tabelle MEDICAL_SPECIALTY_TO_CATALOG).
//
// Aufruf:
//   node backend/scripts/backfill-client-specialty.mjs            (Trockenlauf)
//   node backend/scripts/backfill-client-specialty.mjs --apply    (schreibt)
import "dotenv/config";
import { db } from "../src/firebase.js";

// Spiegelung der Frontend-Tabelle
// docgendaweb/src/services/clonRScriptResolverService.ts
const MEDICAL_SPECIALTY_TO_CATALOG = {
  dentist: "zahnmedizin",
  orthodontist: "kieferorthopaedie",
  oralsurgeon: "oralchirurgie-mkg",
  dermatologist: "dermatologie",
  cardiologist: "kardiologie",
  pediatrician: "kinder-jugendmedizin",
  orthopedist: "orthopaedie",
  neurologist: "neurologie",
  psychiatrist: "psychiatrie-psychotherapie",
  gynecologist: "gynaekologie",
  urologist: "urologie",
  ophthalmologist: "augenheilkunde",
  otolaryngologist: "hno",
  surgeon: "chirurgie",
  radiologist: "radiologie",
  anesthesiologist: "anaesthesiologie",
  internist: "innere-medizin",
  gastroenterologist: "gastroenterologie",
  pulmonologist: "pneumologie",
  pneumologist: "pneumologie",
  oncologist: "onkologie",
  rheumatologist: "rheumatologie",
  diabetologist: "diabetologie-endokrinologie",
  endocrinologist: "diabetologie-endokrinologie",
  gp: "hausarzt",
  generalpractitioner: "hausarzt",
  familydoctor: "hausarzt",
};

const APPLY = process.argv.slice(2).includes("--apply");

function slugFromSpecs(specs) {
  const arr = Array.isArray(specs) ? specs : [];
  for (const s of arr) {
    const slug = MEDICAL_SPECIALTY_TO_CATALOG[String(s || "").trim().toLowerCase()];
    if (slug) return slug;
  }
  return "";
}

console.log(APPLY ? "== BACKFILL (SCHREIBEND) ==" : "== BACKFILL (Trockenlauf, kein Schreiben) ==");

const snap = await db.collection("clients").get();
let total = 0;
let already = 0;
let noMapping = 0;
let written = 0;
const plan = [];

snap.forEach((doc) => {
  total += 1;
  const d = doc.data() || {};
  const existing = String(d.specialty || d.fachrichtung || d.fach || "").trim();
  if (existing) { already += 1; return; }
  const slug = slugFromSpecs(d.medicalSpecialties);
  if (!slug) { noMapping += 1; return; }
  plan.push({ id: doc.id, name: d.name || "", specs: d.medicalSpecialties || [], slug });
});

for (const p of plan) {
  const line = `${p.id.padEnd(22)} ${String(p.name).slice(0, 30).padEnd(30)} [${p.specs.join(", ")}] -> ${p.slug}`;
  if (APPLY) {
    try {
      await db.doc(`clients/${p.id}`).set({ specialty: p.slug, fachrichtung: p.slug }, { merge: true });
      written += 1;
      console.log("GESETZT  " + line);
    } catch (e) {
      console.log("FEHLER   " + line + "  (" + (e?.message || e) + ")");
    }
  } else {
    console.log("WUERDE   " + line);
  }
}

console.log("\n--- Zusammenfassung ---");
console.log("Kunden gesamt          :", total);
console.log("bereits gesetzt (skip) :", already);
console.log("kein Mapping (skip)    :", noMapping);
console.log(APPLY ? "geschrieben            :" : "aenderbar (Trockenlauf):", APPLY ? written : plan.length);
if (!APPLY && plan.length > 0) {
  console.log("\nZum Schreiben:  node backend/scripts/backfill-client-specialty.mjs --apply");
}
process.exit(0);
