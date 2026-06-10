import "dotenv/config";
import admin from "../src/firebase.js";
import { exportTenant, eraseTenant, applyRetention, MAS_COLLECTIONS } from "../src/dsgvo.js";

// Tests the DSGVO lifecycle (export / erasure / retention) against a throwaway
// test client that is created and deleted within the test — no real tenant is
// touched. Run: node scripts/test-dsgvo.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const TEST_CLIENT = "zzz-mas2-dsgvo";
const db = admin.firestore();

function col(name) {
  return db.collection("clients").doc(TEST_CLIENT).collection(name);
}

async function hardCleanup() {
  for (const name of MAS_COLLECTIONS) {
    const refs = await col(name).listDocuments();
    await Promise.all(refs.map((r) => r.delete().catch(() => {})));
  }
}

async function seed() {
  const old = admin.firestore.Timestamp.fromMillis(Date.now() - 200 * 86400 * 1000);
  await col("mas_cases").doc("c1").set({ clientId: TEST_CLIENT, title: "Test", status: "open" });
  await col("mas_tasks").doc("t1").set({ clientId: TEST_CLIENT, title: "Aufgabe", status: "open" });
  await col("mas_config").doc("team").set({ members: [{ name: "Lisa", pinHash: "abc" }] });
  // a fresh trashed mail (within retention) + an old trashed mail (purgeable)
  await col("mas_mail_messages").doc("mFresh").set({ folder: "Trash", updatedAt: admin.firestore.Timestamp.now(), attachments: [] });
  await col("mas_mail_messages").doc("mOld").set({ folder: "Trash", updatedAt: old, attachments: [] });
  await col("mas_mail_messages").doc("mInbox").set({ folder: "INBOX", date: Date.now() });
  // an old ended session (purgeable) + a normal one
  await col("mas_sessions").doc("sOld").set({ status: "ended", endedAt: old });
  await col("mas_sessions").doc("sLive").set({ status: "live", createdAt: admin.firestore.Timestamp.now() });
}

async function run() {
  console.log("=== DSGVO lifecycle (isolierter Test-Mandant) ===");
  await hardCleanup();
  await seed();

  console.log("\n--- Export (Art. 20) ---");
  const exp = await exportTenant(TEST_CLIENT);
  check(exp.ok && exp.clientId === TEST_CLIENT, "Export liefert ok + clientId");
  check(exp.counts.mas_cases === 1 && exp.counts.mas_tasks === 1, "Export zaehlt cases/tasks");
  check(exp.counts.mas_mail_messages === 3, "Export zaehlt alle Mails (3)");
  check(Array.isArray(exp.firestore.mas_config) && exp.firestore.mas_config[0].id === "team", "mas_config exportiert (team)");
  check(typeof exp.exportedAt === "string", "Export hat ISO-Zeitstempel");

  console.log("\n--- Retention (Dry-Run) ---");
  const retDry = await applyRetention(TEST_CLIENT, { dryRun: true });
  check(retDry.dryRun === true, "Retention Dry-Run markiert");
  check(retDry.trashedMail === 1, `nur alte Trash-Mail zaehlt (1, war ${retDry.trashedMail})`);
  check(retDry.sessions === 1, `nur alte Session zaehlt (1, war ${retDry.sessions})`);
  // nothing deleted on dry run
  const stillThere = await col("mas_mail_messages").doc("mOld").get();
  check(stillThere.exists, "Dry-Run loescht nichts");

  console.log("\n--- Retention (apply) ---");
  const ret = await applyRetention(TEST_CLIENT, { dryRun: false });
  check(ret.trashedMail === 1 && ret.sessions === 1, "Apply purgt alte Trash-Mail + Session");
  check(!(await col("mas_mail_messages").doc("mOld").get()).exists, "alte Trash-Mail geloescht");
  check((await col("mas_mail_messages").doc("mFresh").get()).exists, "frische Trash-Mail bleibt");
  check((await col("mas_mail_messages").doc("mInbox").get()).exists, "INBOX-Mail bleibt (med. Akte)");
  check(!(await col("mas_sessions").doc("sOld").get()).exists, "alte Session geloescht");
  check((await col("mas_sessions").doc("sLive").get()).exists, "Live-Session bleibt");

  console.log("\n--- Erasure (Dry-Run) ---");
  const eraseDry = await eraseTenant(TEST_CLIENT, { dryRun: true });
  check(eraseDry.dryRun === true && eraseDry.totalDocs > 0, `Erase Dry-Run meldet Umfang (${eraseDry.totalDocs} Docs)`);
  check((await col("mas_cases").doc("c1").get()).exists, "Dry-Run loescht keine Faelle");

  console.log("\n--- Erasure (apply) ---");
  const erased = await eraseTenant(TEST_CLIENT, { dryRun: false });
  check(erased.totalDocs > 0, `Erasure loescht ${erased.totalDocs} Docs`);
  const after = await exportTenant(TEST_CLIENT);
  const remaining = Object.values(after.counts).reduce((a, b) => a + (Number(b) || 0), 0);
  check(remaining === 0, `nach Erasure keine Daten mehr (Rest: ${remaining})`);

  await hardCleanup();
  console.log("\n(cleanup done)\n");
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
