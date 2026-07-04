import "dotenv/config";
import admin from "../src/firebase.js";
import { getPatientAnamnese, buildSpokenAnamnese } from "../src/clara/anamnese.js";

// Demo-Seed (04.07.2026): Andrea Sablons Anamnesebogen (Status "sent", noch
// NICHT unterschrieben -> formRows lesbar) bekommt realistische auffaellige
// Antworten, damit die neue Anamnese-Flags-Box im Termin-Popup und Claras
// Anamnese-Vorlesen etwas zu zeigen haben:
//   - Allergien: Ja -> "Penicillin"
//   - Medikamente: Ja -> "Marcumar"
//   - Bluthochdruck: Ja
// Idempotent: setzt dieselben Werte bei jedem Lauf.

const CLIENT = "MEe4ZQHEzOPzLcexyhdT";
const LASTNAME = "Sablon";
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

// Radio-Frage bejahen: "Ja"-Antwort ankreuzen, "Nein" abwaehlen, optionalen
// Folge-Freitext ("Welche?") setzen.
function answerYes(question, detailText = "") {
  let hit = 0;
  const walk = (rws) => {
    for (const r of rws || []) {
      for (const c of r?.columns || []) {
        if (c?.type === 8 && deLabel(c).toLowerCase().includes(question.toLowerCase())) {
          for (const a of c.answers || []) {
            const lab = deLabel(a).toLowerCase();
            if (lab.startsWith("ja")) {
              a.checked = true;
              if (detailText) {
                for (const fr of a.formRows || []) {
                  for (const fc of fr?.columns || []) {
                    if (fc?.type === 5) fc.value = detailText;
                  }
                }
              }
            } else if (lab.startsWith("nein")) {
              a.checked = false;
            }
          }
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

const h1 = answerYes("Leiden Sie unter Allergien", "Penicillin");
const h2 = answerYes("Nehmen Sie regelmäßig Medikamente", "Marcumar");
const h3 = answerYes("Bluthochdruck");
console.log(`gesetzt: Allergien=${h1}, Medikamente=${h2}, Bluthochdruck=${h3}`);

await anaDoc.ref.update({ formRows: rows });
console.log("Bogen aktualisiert:", anaDoc.id, "| Status bleibt:", data.status);

// Gegenprobe ueber die MAS-Logik (muss dieselben Flags melden wie die Box).
const check = await getPatientAnamnese(CLIENT, { patientId: pat.id });
console.log("MAS-Flags:", JSON.stringify(check.findings));
console.log("Clara wuerde sagen:", buildSpokenAnamnese(check, { who: "Frau Sablon" }));
process.exit(0);
