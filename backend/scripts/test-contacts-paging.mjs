import "dotenv/config";
import admin from "../src/firebase.js";
import { listContacts } from "../src/mail/store.js";

// Verifies cursor-based pagination of the address book against an isolated test
// client: bounded windows, no duplicates/gaps across pages, newest-first order,
// relevance + search filters honoured. Run: node scripts/test-contacts-paging.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const TEST_CLIENT = "zzz-mas2-contacts";
const db = admin.firestore();
const col = () => db.collection("clients").doc(TEST_CLIENT).collection("mas_contacts");

async function cleanup() {
  const refs = await col().listDocuments();
  await Promise.all(refs.map((r) => r.delete().catch(() => {})));
}

async function seed(n) {
  const base = Date.now();
  for (let i = 0; i < n; i++) {
    await col().doc(`c${String(i).padStart(3, "0")}`).set({
      address: `person${i}@example.com`,
      name: `Person ${i}`,
      lastSeenAt: base - i * 1000, // strictly descending, unique
      relevant: true,
    });
  }
  // noise that must be filtered out
  await col().doc("bulk").set({ address: "newsletter@shop.com", lastSeenAt: base + 5000, relevant: false });
}

async function pageAll(opts = {}) {
  const seen = [];
  let cursor = null;
  for (let guard = 0; guard < 50; guard++) {
    const { items, nextCursor } = await listContacts(TEST_CLIENT, { ...opts, cursor });
    seen.push(...items.map((c) => c.id));
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return seen;
}

async function run() {
  console.log("=== Adressbuch-Pagination (isolierter Test-Mandant) ===");
  await cleanup();
  await seed(25);

  console.log("\n--- erste Seite ---");
  const first = await listContacts(TEST_CLIENT, { limit: 10 });
  check(first.items.length === 10, `Seite 1 hat 10 Eintraege (war ${first.items.length})`);
  check(first.items[0].id === "c000", "neuester Kontakt zuerst (c000)");
  check(!!first.nextCursor, "nextCursor gesetzt (mehr vorhanden)");
  check(first.items.every((c) => c.relevant !== false), "kein irrelevanter/Bulk-Kontakt dabei");

  console.log("\n--- alle Seiten durchblaettern ---");
  const all = await pageAll({ limit: 10 });
  check(all.length === 25, `insgesamt 25 Kontakte ueber alle Seiten (war ${all.length})`);
  check(new Set(all).size === 25, "keine Duplikate ueber Seitengrenzen");
  check(!all.includes("bulk"), "Bulk-Sender niemals enthalten");
  // order preserved across pages (descending lastSeenAt == ascending index)
  const ordered = all.every((id, i) => id === `c${String(i).padStart(3, "0")}`);
  check(ordered, "globale Reihenfolge (neueste zuerst) ueber Seiten erhalten");

  console.log("\n--- letzte Seite ohne nextCursor ---");
  const last = await listContacts(TEST_CLIENT, { limit: 10, cursor: String(Date.now() - 24 * 1000) });
  check(last.nextCursor === null, "keine weitere Seite am Ende (nextCursor null)");

  console.log("\n--- Suche ---");
  const search = await listContacts(TEST_CLIENT, { q: "person1", limit: 100 });
  // matches Person 1, 10..19, 21..  -> contains "person1" substring in address/name
  check(search.items.length > 0 && search.items.every((c) => /person1/.test(c.address)), "Suche filtert auf Treffer");

  await cleanup();
  console.log("\n(cleanup done)\n");
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
