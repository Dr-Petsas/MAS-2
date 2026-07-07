// Diagnose 07.07.2026 (READ-ONLY): Nadine "empfaengt nicht alle E-Mails" —
// fehlende Absender z. B. Dampsoft und Kirikos Tzannis.
// Prueft ohne jede Schreiboperation:
//  1. Mail-Konten + letzter Sync/Fehler
//  2. Firestore: existieren Mails der gesuchten Absender? (folder/relevant/Kategorie)
//  3. IMAP direkt: in WELCHEM Server-Ordner liegen die Mails der Absender —
//     und liegen INBOX-Treffer ausserhalb des 20er-Sync-Fensters?
// Aufruf: node scripts/diag-nadine-mail-luecken.mjs [clientId] [suchbegriff ...]
import "dotenv/config";
import { ImapFlow } from "imapflow";
import admin from "../src/firebase.js";
import { getAccountWithSecrets, listAccounts } from "../src/mail/accounts.js";

const db = admin.firestore();
const args = process.argv.slice(2);
const cid = args[0] && args[0].length > 15 ? args[0] : "MEe4ZQHEzOPzLcexyhdT";
const terms = (args[0] && args[0].length > 15 ? args.slice(1) : args);
if (!terms.length) terms.push("dampsoft", "tzannis");

const fmt = (ms) => (ms ? new Date(ms).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "—");
const msgsCol = db.collection("clients").doc(cid).collection("mas_mail_messages");

console.log(`Mandant: ${cid} | Suchbegriffe: ${terms.join(", ")}\n`);

// --- 1) Konten + Sync-Status -------------------------------------------------
const accounts = await listAccounts(cid);
console.log(`=== Mail-Konten (${accounts.length}) ===`);
for (const a of accounts) {
  console.log(`- ${a.id} | ${a.email} | aktiv=${a.active} | letzter Sync: ${fmt(a.lastSyncAt?.toMillis?.() ?? a.lastSyncAt)} | Fehler: ${a.lastError || "—"}`);
}

// --- 2) Firestore: gespeicherte Mails der Absender ---------------------------
console.log(`\n=== Firestore-Bestand (letzte 600 Mails) ===`);
const snap = await msgsCol.orderBy("date", "desc").limit(600).get();
console.log(`geladen: ${snap.size} Nachrichten`);
const perDay = new Map();
const hits = [];
for (const d of snap.docs) {
  const m = d.data();
  const day = m.date ? new Date(m.date).toISOString().slice(0, 10) : "?";
  if ((m.direction || "in") === "in" && m.folder === "INBOX") {
    perDay.set(day, (perDay.get(day) || 0) + 1);
  }
  const hay = `${m.from?.address || ""} ${m.from?.name || ""} ${m.subject || ""}`.toLowerCase();
  if (terms.some((t) => hay.includes(t.toLowerCase()))) {
    hits.push({ id: d.id, date: m.date, from: `${m.from?.name || ""} <${m.from?.address || ""}>`, subject: m.subject, folder: m.folder, relevant: m.relevant, category: m.category, uid: m.uid, accountId: m.accountId });
  }
}
console.log(`Treffer fuer [${terms.join(", ")}]: ${hits.length}`);
for (const h of hits.slice(0, 25)) {
  console.log(`  ${fmt(h.date)} | ${h.folder} | relevant=${h.relevant} | ${h.category} | uid=${h.uid} | ${h.from} | ${String(h.subject).slice(0, 60)}`);
}
console.log(`\nEingang je Tag (letzte 14 Tage, nur INBOX/in):`);
const days = [...perDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
for (const [day, n] of days) console.log(`  ${day}: ${n}`);

// --- 3) IMAP: wo liegen die Mails auf dem Server? ----------------------------
for (const pub of accounts) {
  if (pub.active === false || !pub.imap?.host) continue;
  const acc = await getAccountWithSecrets(cid, pub.id);
  if (!acc?.imapPassword) { console.log(`\n=== IMAP ${pub.email}: kein Passwort entschluesselbar ===`); continue; }
  console.log(`\n=== IMAP ${pub.email} (${acc.imap.host}) ===`);
  const client = new ImapFlow({
    host: acc.imap.host, port: acc.imap.port || 993, secure: acc.imap.secure !== false,
    auth: { user: acc.imap.user, pass: acc.imapPassword }, logger: false,
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000,
  });
  try {
    await client.connect();
    const boxes = await client.list();
    for (const box of boxes) {
      let lock;
      try {
        lock = await client.getMailboxLock(box.path);
      } catch { continue; }
      try {
        const exists = Number(client.mailbox?.exists || 0);
        const info = [`${box.path} (${exists} Mails)`];
        if (box.path === "INBOX") info.push(`Sync-Fenster: seq ${Math.max(1, exists - 19)}:${exists}`);
        console.log(`  Ordner ${info.join(" | ")}`);
        if (!exists) continue;
        for (const term of terms) {
          // OR-Suche: FROM enthaelt Begriff ODER Betreff enthaelt Begriff
          const seqsFrom = await client.search({ from: term }).catch(() => []);
          const seqsSubj = await client.search({ subject: term }).catch(() => []);
          const seqs = [...new Set([...(seqsFrom || []), ...(seqsSubj || [])])].sort((a, b) => a - b);
          if (!seqs.length) continue;
          console.log(`    Treffer "${term}": ${seqs.length}`);
          const show = seqs.slice(-6); // die neuesten
          for await (const msg of client.fetch(show.join(","), { envelope: true, uid: true })) {
            const env = msg.envelope || {};
            const from = env.from?.[0] ? `${env.from[0].name || ""} <${env.from[0].address || ""}>` : "?";
            const inWindow = box.path === "INBOX" ? (msg.seq >= Math.max(1, exists - 19) ? "IM Fenster" : "AUSSERHALB des 20er-Fensters") : "";
            console.log(`      seq=${msg.seq} uid=${msg.uid} | ${env.date ? new Date(env.date).toISOString().slice(0, 16) : "?"} | ${from} | ${String(env.subject || "").slice(0, 55)} ${inWindow ? "| " + inWindow : ""}`);
          }
        }
      } finally {
        lock?.release?.();
      }
    }
  } catch (e) {
    console.log(`  IMAP-Fehler: ${e?.message || e}`);
  } finally {
    try { await client.logout(); } catch { try { client.close(); } catch { /* */ } }
  }
}
console.log("\nFertig (READ-ONLY, nichts veraendert).");
process.exit(0);
