// Diagnose 07.07.2026 Teil 2 (READ-ONLY): exakter Abgleich Server vs. Firestore.
// Fuer jeden IMAP-Treffer (dampsoft/tzannis) wird die deterministische Doc-ID
// (sha256(accountId:messageId)) berechnet und in Firestore nachgeschlagen —
// Ergebnis ist die praezise Liste FEHLENDER Mails. Zusaetzlich: Abdeckung der
// letzten 100 INBOX-Mails je Konto und Aufschluesselung des 476er-Spikes vom 06.07.
// Aufruf: node scripts/diag-nadine-mail-fehlend.mjs
import "dotenv/config";
import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import admin from "../src/firebase.js";
import { getAccountWithSecrets, listAccounts } from "../src/mail/accounts.js";

const db = admin.firestore();
const cid = "MEe4ZQHEzOPzLcexyhdT";
const terms = ["dampsoft", "tzannis"];
const msgsCol = db.collection("clients").doc(cid).collection("mas_mail_messages");

const norm = (v) => { const m = String(v || "").trim().match(/<[^>]+>/); return String(m?.[0] || v || "").trim(); };
const docIdFor = (accountId, messageId) => "m_" + createHash("sha256").update(`${accountId}:${messageId}`).digest("hex").slice(0, 28);

// --- Spike 06.07. aufschluesseln ---------------------------------------------
const d0 = new Date("2026-07-06T00:00:00+02:00").getTime();
const d1 = new Date("2026-07-07T00:00:00+02:00").getTime();
const spike = await msgsCol.where("date", ">=", d0).where("date", "<", d1).get();
const bySender = new Map();
for (const d of spike.docs) {
  const m = d.data();
  if ((m.direction || "in") !== "in") continue;
  const k = m.from?.address || "?";
  bySender.set(k, (bySender.get(k) || 0) + 1);
}
console.log(`=== Spike 06.07.: ${spike.size} Mails, Top-Absender ===`);
for (const [k, n] of [...bySender.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(4)}  ${k}`);
}

// --- Server vs. Firestore ------------------------------------------------------
const accounts = await listAccounts(cid);
for (const pub of accounts) {
  if (pub.active === false || !pub.imap?.host) continue;
  const acc = await getAccountWithSecrets(cid, pub.id);
  console.log(`\n=== Konto ${pub.email} (accountId=${pub.id}) ===`);
  const client = new ImapFlow({
    host: acc.imap.host, port: acc.imap.port || 993, secure: acc.imap.secure !== false,
    auth: { user: acc.imap.user, pass: acc.imapPassword }, logger: false,
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 45000,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const exists = Number(client.mailbox?.exists || 0);

      // a) Alle Treffer der Suchbegriffe: fehlt die Mail in Firestore?
      for (const term of terms) {
        const seqs = new Set([
          ...(await client.search({ from: term }).catch(() => [])),
          ...(await client.search({ subject: term }).catch(() => [])),
        ]);
        const sorted = [...seqs].sort((a, b) => a - b);
        if (!sorted.length) { console.log(`  "${term}": keine Treffer im INBOX`); continue; }
        let missing = 0, present = 0;
        const missingRows = [];
        for await (const msg of client.fetch(sorted.join(","), { envelope: true, uid: true })) {
          const env = msg.envelope || {};
          const mid = norm(env.messageId);
          if (!mid) continue;
          const snap = await msgsCol.doc(docIdFor(pub.id, mid)).get();
          if (snap.exists) { present++; continue; }
          missing++;
          const from = env.from?.[0] ? `${env.from[0].name || ""} <${env.from[0].address || ""}>`.trim() : "?";
          missingRows.push(`      FEHLT: ${env.date ? new Date(env.date).toISOString().slice(0, 16) : "?"} | seq=${msg.seq} | ${from} | ${String(env.subject || "").slice(0, 60)}`);
        }
        console.log(`  "${term}": ${present + missing} auf Server, davon in Firestore: ${present}, FEHLEND: ${missing}`);
        for (const r of missingRows.slice(-15)) console.log(r);
      }

      // b) Abdeckung: die letzten 100 INBOX-Mails — wie viele fehlen?
      const from100 = Math.max(1, exists - 99);
      let miss100 = 0, have100 = 0;
      const missSamples = [];
      for await (const msg of client.fetch(`${from100}:*`, { envelope: true, uid: true })) {
        const env = msg.envelope || {};
        const mid = norm(env.messageId);
        if (!mid) continue;
        const snap = await msgsCol.doc(docIdFor(pub.id, mid)).get();
        if (snap.exists) have100++;
        else {
          miss100++;
          if (missSamples.length < 12) {
            const from = env.from?.[0] ? `${env.from[0].name || ""} <${env.from[0].address || ""}>`.trim() : "?";
            missSamples.push(`      ${env.date ? new Date(env.date).toISOString().slice(0, 16) : "?"} | seq=${msg.seq} | ${from} | ${String(env.subject || "").slice(0, 55)}`);
          }
        }
      }
      console.log(`  Abdeckung letzte 100 INBOX-Mails: vorhanden=${have100}, FEHLEND=${miss100}`);
      for (const r of missSamples) console.log(r);
    } finally {
      lock.release();
    }
  } catch (e) {
    console.log(`  IMAP-Fehler: ${e?.message || e}`);
  } finally {
    try { await client.logout(); } catch { try { client.close(); } catch { /* */ } }
  }
}
console.log("\nFertig (READ-ONLY).");
process.exit(0);
