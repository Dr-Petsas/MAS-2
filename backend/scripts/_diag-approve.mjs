// Diagnose 28.07. 15:30: approve_recall sagte "keine wartende Liste",
// obwohl gap_briefing 14 s vorher 24 ZE-Kandidaten meldete. Wo ist die Liste?
import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import { listCases } from "../src/brain/caseStore.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";

// 1) Alle gapfill-Cases der letzten 24h, roh aus Firestore (ohne listCases).
const snap = await masCollection(clientId, "mas_cases")
  .orderBy("updatedAt", "desc")
  .limit(60)
  .get();
console.log("--- Juengste Cases (roh, updatedAt DESC):");
for (const d of snap.docs) {
  const c = d.data();
  if (!d.id.startsWith("gapfill_")) continue;
  const up = c.updatedAt?.toDate ? c.updatedAt.toDate().toISOString() : String(c.updatedAt);
  console.log(`${d.id} | status=${c.status} | assignee=${c.assignee} | updatedAt=${up} | list=${c.callList ? `${c.callList.date} ${c.callList.slot?.label} bucket=${c.callList.bucketKey || "-"} cand=${(c.callList.candidates || []).length} approvedBy=${c.callList.approvedBy || "-"}` : "KEINE"}`);
}

// 2) Was sieht listCases (der Weg von pendingGapCases)?
const cases = await listCases(clientId, { activeOnly: true, assignee: "Lisa", limit: 100 });
console.log(`\n--- listCases(activeOnly, Lisa, 100): ${cases.length} Treffer`);
for (const c of cases.filter((x) => x.id.startsWith("gapfill_")).slice(0, 15)) {
  console.log(`${c.id} | status=${c.status} | callList=${c.callList ? "ja" : "nein"} | date=${c.callList?.date}`);
}
process.exit(0);
