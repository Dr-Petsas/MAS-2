// Diagnose 07.07.2026 Teil 3 (READ-ONLY): Detail-Verifikation.
//  a) Seit wann existieren die Mail-Konten (createdAt)? -> erklaert fehlende Alt-Mails
//  b) Widerspruch 01.07.-Dampsoft-Mail: unter welcher accountId/docId liegt sie?
//  c) AERA-Flut 06.07.: auf welchem Konto, wie viele auf dem Server vs. Firestore?
import "dotenv/config";
import { createHash } from "node:crypto";
import admin from "../src/firebase.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT";
const msgsCol = db.collection("clients").doc(cid).collection("mas_mail_messages");
const accCol = db.collection("clients").doc(cid).collection("mas_mail_accounts");
const docIdFor = (accountId, messageId) => "m_" + createHash("sha256").update(`${accountId}:${messageId}`).digest("hex").slice(0, 28);
const fmt = (v) => { const ms = v?.toMillis?.() ?? v; return ms ? new Date(ms).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "—"; };

// a) Konten-Alter
console.log("=== Konten ===");
const accSnap = await accCol.get();
for (const d of accSnap.docs) {
  const a = d.data();
  console.log(`- ${d.id} | ${a.email} | angelegt: ${fmt(a.createdAt)} | letzter Sync: ${fmt(a.lastSyncAt)}`);
}

// b) Die Dampsoft-Mail vom 01.07.
console.log("\n=== Dampsoft-Mails in Firestore (alle) ===");
const ds = await msgsCol.where("from.address", "==", "rechnung@dampsoft.de").get();
for (const d of ds.docs) {
  const m = d.data();
  console.log(`- doc=${d.id} | account=${m.accountId} | uid=${m.uid} | ${fmt(m.date)} | ${m.subject}`);
  console.log(`    messageId=${m.messageId}`);
  console.log(`    docIdFor(med-dent)= ${docIdFor("5RhejapGKhvOvxIj3AkM", m.messageId)}  docIdFor(pickadoc)= ${docIdFor("Nqn7pVKBHJQjX023Mo0P", m.messageId)}`);
}

// c) AERA-Flut vom 06.07.
console.log("\n=== AERA-Mails (Firestore) ===");
const aera = await msgsCol.where("from.address", "==", "no-reply@aera-gmbh.de").get();
const byAcc = new Map(); let minD = Infinity, maxD = 0;
const bySubject = new Map();
for (const d of aera.docs) {
  const m = d.data();
  byAcc.set(m.accountId, (byAcc.get(m.accountId) || 0) + 1);
  if (m.date) { minD = Math.min(minD, m.date); maxD = Math.max(maxD, m.date); }
  const s = String(m.subject || "").slice(0, 50);
  bySubject.set(s, (bySubject.get(s) || 0) + 1);
}
console.log(`gesamt: ${aera.size} | Konten: ${[...byAcc.entries()].map(([k, n]) => `${k}=${n}`).join(", ")}`);
console.log(`Zeitraum: ${fmt(minD)} bis ${fmt(maxD)}`);
console.log("Betreff-Verteilung (Top 5):");
for (const [s, n] of [...bySubject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`  ${String(n).padStart(4)}  ${s}`);
process.exit(0);
