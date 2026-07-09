// Einmaliger Backfill des GESENDET-Ordners (07.07.2026) + Migration der alten
// "SENT"-Kopien auf den kanonischen Ordnernamen "Sent".
// Hintergrund: Der Sync holte nur INBOX — am Handy/Webmail verschickte Mails
// fehlten in Nadines Postausgang komplett; Nadines eigene Kopien lagen unter
// "SENT" und damit ausserhalb der "Sent"-Abfrage des Kontenbaums.
// Aufruf: node scripts/backfill-nadine-mail-gesendet.mjs [clientId]
import "dotenv/config";
import admin from "../src/firebase.js";
import { listAccounts } from "../src/mail/accounts.js";
import { syncAccount } from "../src/mail/mailbox.js";

const db = admin.firestore();
const cid = process.argv[2] || "MEe4ZQHEzOPzLcexyhdT";
const msgsCol = db.collection("clients").doc(cid).collection("mas_mail_messages");

// 1) Migration: folder "SENT" -> "Sent" (behaelt direction/out und alles andere)
const legacy = await msgsCol.where("folder", "==", "SENT").get();
if (legacy.size) {
  const batch = db.batch();
  legacy.docs.forEach((d) => batch.update(d.ref, { folder: "Sent" }));
  await batch.commit();
}
console.log(`Migration SENT->Sent: ${legacy.size} Dokument(e).`);

// 2) Voll-Sync NUR des Gesendet-Ordners je Konto
const accounts = await listAccounts(cid);
for (const a of accounts) {
  if (a.active === false || !a.imap?.host) continue;
  console.log(`- ${a.email}: Gesendet-Backfill ... (${new Date().toLocaleTimeString("de-DE")})`);
  const t0 = Date.now();
  const r = await syncAccount(cid, a.id, { limit: 5000, inbox: false, sent: true, full: true }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
  console.log(`  -> ${JSON.stringify(r)} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}
console.log("Gesendet-Backfill fertig.");
process.exit(0);
