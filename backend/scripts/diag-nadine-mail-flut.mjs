// Diagnose 07.07.2026 Teil 4 (READ-ONLY): Hat die AERA-Flut vom 06.07.
// (458 Mails in 21 Min) echte Mails aus dem 20er-Sync-Fenster verdraengt?
// Abgleich Server-INBOX seq 1050:1641 (med-dent) gegen Firestore, fehlende
// NICHT-AERA-Mails werden einzeln gelistet. Zusaetzlich messageId-Formatcheck.
import "dotenv/config";
import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import admin from "../src/firebase.js";
import { getAccountWithSecrets } from "../src/mail/accounts.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT";
const accId = "5RhejapGKhvOvxIj3AkM";
const msgsCol = db.collection("clients").doc(cid).collection("mas_mail_messages");
const docIdFor = (a, mid) => "m_" + createHash("sha256").update(`${a}:${mid}`).digest("hex").slice(0, 28);
const norm = (v) => { const m = String(v || "").trim().match(/<[^>]+>/); return String(m?.[0] || v || "").trim(); };

const acc = await getAccountWithSecrets(cid, accId);
const client = new ImapFlow({
  host: acc.imap.host, port: acc.imap.port || 993, secure: true,
  auth: { user: acc.imap.user, pass: acc.imapPassword }, logger: false,
  connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 60000,
});
await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  const exists = Number(client.mailbox?.exists || 0);
  console.log(`INBOX exists=${exists}, pruefe seq 1050:${exists}`);
  let total = 0, have = 0, missAera = 0, missOther = 0;
  const missing = [];
  for await (const msg of client.fetch(`1050:*`, { envelope: true, uid: true })) {
    const env = msg.envelope || {};
    const mid = norm(env.messageId);
    if (!mid) continue;
    total++;
    const snap = await msgsCol.doc(docIdFor(accId, mid)).get();
    if (snap.exists) { have++; continue; }
    const fromA = (env.from?.[0]?.address || "").toLowerCase();
    if (fromA === "no-reply@aera-gmbh.de") { missAera++; continue; }
    missOther++;
    missing.push(`  FEHLT seq=${msg.seq} uid=${msg.uid} | ${env.date ? new Date(env.date).toISOString().slice(0, 16) : "?"} | ${env.from?.[0]?.name || ""} <${fromA}> | ${String(env.subject || "").slice(0, 60)}`);
    // Format-Check: warum meldet der Abgleich diese als fehlend? messageId roh zeigen
    if (missing.length <= 3 || msg.seq === 1569 || msg.seq === 1570) {
      missing.push(`        env.messageId roh: ${JSON.stringify(env.messageId)}`);
    }
  }
  console.log(`gesamt=${total} | in Firestore=${have} | fehlend AERA=${missAera} | fehlend SONSTIGE=${missOther}`);
  for (const r of missing) console.log(r);
} finally {
  lock.release();
  try { await client.logout(); } catch { client.close(); }
}
process.exit(0);
