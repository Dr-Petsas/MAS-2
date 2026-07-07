// Diagnose 07.07.2026 Teil 5 (READ-ONLY): Simuliert exakt die listMessages-
// Abfrage des Posteingangs (where folder==INBOX, limit 300, KEIN orderBy ->
// Firestore liefert nach Doc-ID) und prueft, ob die neuen Dampsoft-/Tzannis-
// Mails im sichtbaren Fenster landen oder herausfallen.
import "dotenv/config";
import admin from "../src/firebase.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT";
const msgsCol = db.collection("clients").doc(cid).collection("mas_mail_messages");

const total = (await msgsCol.count().get()).data().count;
const inbox = (await msgsCol.where("folder", "==", "INBOX").count().get()).data().count;
console.log(`Nachrichten gesamt: ${total} | davon folder=INBOX: ${inbox}`);

// Exakt wie store.js listMessages(clientId, { folder:"INBOX", limit:50 }):
for (const limit of [50, 100]) {
  const snap = await msgsCol.where("folder", "==", "INBOX").limit(Math.min(300, limit * 3)).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.date || 0) - (a.date || 0));
  const top = rows.slice(0, limit);
  const fmt = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16) : "?");
  const hasDampsoft = top.some((r) => (r.from?.address || "").includes("dampsoft"));
  const hasTzannis = top.some((r) => `${r.from?.name || ""} ${r.from?.address || ""}`.toLowerCase().includes("tzannis") || (r.from?.address || "") === "development@pickadoc.de");
  const aeraCount = top.filter((r) => (r.from?.address || "") === "no-reply@aera-gmbh.de").length;
  console.log(`\n— listMessages(limit=${limit}): ${snap.size} Docs geholt (Cap ${Math.min(300, limit * 3)}), sichtbar ${top.length}`);
  console.log(`  aelteste sichtbare Mail: ${fmt(top[top.length - 1]?.date)} | neueste: ${fmt(top[0]?.date)}`);
  console.log(`  Dampsoft sichtbar: ${hasDampsoft} | Tzannis sichtbar: ${hasTzannis} | AERA-Mails in der Liste: ${aeraCount}`);
}

// Wo stehen die zwei aktuellen Beleg-Mails in der Doc-ID-Reihenfolge?
const targets = [
  ["m_d5b6230a22d8d87d817cc11a3616", "Dampsoft Mahnung 07.07."],
  ["m_82cc71909d1fcfd13722110ac11a", "Dampsoft Beleg 01.07."],
];
const allIds = (await msgsCol.where("folder", "==", "INBOX").select().get()).docs.map((d) => d.id).sort();
for (const [id, label] of targets) {
  const pos = allIds.indexOf(id);
  console.log(`${label}: Doc-ID-Position ${pos + 1} von ${allIds.length} ${pos >= 300 ? "-> FAELLT AUS DEM 300er-FENSTER" : "-> im 300er-Fenster"}`);
}
process.exit(0);
