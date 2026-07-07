// Einmaliger Historien-Backfill (07.07.2026): importiert ALLE Mails der
// IMAP-Postfaecher in Nadines Firestore-Bestand. Hintergrund: syncAccount holt
// pro Tick nur die letzten ~20 Mails — alles vor der Konto-Anlage (med-dent:
// 15.06., pickadoc: 05.07.) fehlte komplett (z. B. Dampsoft-Rechnungen 18.05.,
// aeltere Tzannis-Mails). Idempotent: bestehende Docs werden nur gemerged.
// Die Frische-Wache in storeMessage sorgt dafuer, dass alte Mails KEINE neuen
// Brain-Vorgaenge/Adressbuch-Eintraege erzeugen (nur Mails < 14 Tage).
// Aufruf: node scripts/backfill-nadine-mail-historie.mjs [clientId]
import "dotenv/config";
import { listAccounts } from "../src/mail/accounts.js";
import { syncAccount } from "../src/mail/mailbox.js";

const cid = process.argv[2] || "MEe4ZQHEzOPzLcexyhdT";
const LIMIT = 5000; // > groesstes Postfach (2357) => Fenster beginnt bei seq 1

const accounts = await listAccounts(cid);
console.log(`Backfill fuer ${cid}: ${accounts.length} Konten, Limit ${LIMIT}`);
for (const a of accounts) {
  if (a.active === false || !a.imap?.host) { console.log(`- ${a.email}: uebersprungen (inaktiv/kein IMAP)`); continue; }
  console.log(`- ${a.email}: starte Voll-Sync ... (${new Date().toLocaleTimeString("de-DE")})`);
  const t0 = Date.now();
  const r = await syncAccount(cid, a.id, { limit: LIMIT }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`  -> ${JSON.stringify(r)} (${mins} min)`);
}
console.log("Backfill fertig.");
process.exit(0);
