import "dotenv/config";
import admin from "../src/firebase.js";
import { getPatientAnamnese } from "../src/clara/anamnese.js";

// Gegenstueck zu seed-anamnese-sablon.mjs (05.07.2026): Die am 04.07. per
// Skript in Andrea Sablons ECHTEN (unsignierten) Anamnesebogen geschriebenen
// Demo-Antworten werden wieder entfernt — die Patientin hat den Bogen nie
// selbst ausgefuellt, erfundene Medizindaten duerfen nicht stehen bleiben.
// Chirurgisch: NUR die drei geseedeten Fragen werden zurueckgesetzt
// (alle Antworten abgewaehlt, Folge-Freitexte geleert). Idempotent.

const CLIENT = "MEe4ZQHEzOPzLcexyhdT";
const LASTNAME = "Sablon";
const FRAGEN = [
  "Leiden Sie unter Allergien",
  "Nehmen Sie regelmäßig Medikamente",
  "Bluthochdruck",
];

const db = admin.firestore();

const loc = (await db.collection("clients").doc(CLIENT).collection("locations").limit(1).get()).docs[0];
const pats = await db.collection("clients").doc(CLIENT).collection("locations").doc(loc.id)
  .collection("patients").where("lastName", "==", LASTNAME).get();
if (pats.empty) { console.error("Patientin nicht gefunden"); process.exit(1); }
const pat = pats.docs[0];

const pdocs = await pat.ref.collection("pdocuments").get();
const anaDoc = pdocs.docs.find((d) => /anamnese/i.test(String(d.data()?.name || "")) && (d.data()?.formRows || []).length);
if (!anaDoc) { console.error("Kein lesbarer (unsignierter) Anamnesebogen"); process.exit(1); }

const data = anaDoc.data();
const rows = data.formRows;

function deLabel(item) {
  const l = (item?.labels || []).find((x) => x?.key === "de") || (item?.labels || [])[0];
  return String(l?.value || "").trim();
}

// Radio-Frage komplett zuruecksetzen: KEINE Antwort angekreuzt, Freitexte leer.
function resetQuestion(question) {
  let hit = 0;
  const walk = (rws) => {
    for (const r of rws || []) {
      for (const c of r?.columns || []) {
        if (c?.type === 8 && deLabel(c).toLowerCase().includes(question.toLowerCase())) {
          for (const a of c.answers || []) {
            a.checked = false;
            for (const fr of a.formRows || []) {
              for (const fc of fr?.columns || []) {
                if (fc?.type === 5) fc.value = "";
              }
            }
          }
          if (typeof c.value === "string") c.value = "";
          hit++;
        }
        if (Array.isArray(c?.formRows)) walk(c.formRows);
        for (const a of c?.answers || []) if (Array.isArray(a?.formRows)) walk(a.formRows);
      }
    }
  };
  walk(rows);
  return hit;
}

for (const frage of FRAGEN) {
  const n = resetQuestion(frage);
  console.log(`zurueckgesetzt: "${frage}" -> ${n} Treffer`);
}

await anaDoc.ref.update({ formRows: rows });
console.log("Bogen bereinigt:", anaDoc.id, "| Status bleibt:", data.status);

// Gegenprobe: MAS-Logik darf KEINE Befunde mehr melden.
const check = await getPatientAnamnese(CLIENT, { patientId: pat.id });
console.log("MAS-Flags danach:", JSON.stringify(check.findings));
if (check.findings.length) {
  console.error("FEHLER: Es sind noch Befunde uebrig!");
  process.exit(1);
}
console.log("OK: keine Anamnese-Befunde mehr fuer Sablon.");
process.exit(0);
