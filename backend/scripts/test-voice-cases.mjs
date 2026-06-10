import "dotenv/config";
import admin from "../src/firebase.js";
import { createSession, setActiveCase, getActiveCase, clearActiveCase, endSession } from "../src/clara/sessions.js";
import { createCase } from "../src/brain/caseStore.js";

// Verifies the server-side "active case" plumbing the voice tools rely on
// (so the 8B model never carries a case id). Isolated test client, cleaned up.
const TEST_CLIENT = "zzz-mas2-voicetest";
const db = admin.firestore();
let failed = 0;
const check = (c, m) => { console.log((c ? "  ok: " : "  FAIL: ") + m); if (!c) failed++; };

async function cleanup() {
  for (const c of ["mas_cases", "mas_sessions", "mas_config"]) {
    const snap = await db.collection("clients").doc(TEST_CLIENT).collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

async function run() {
  await cleanup();
  await createSession(TEST_CLIENT);
  const c = await createCase(TEST_CLIENT, { topic: "billing", subject: { patientId: "p1", name: "Gisela Meier", matchStatus: "matched" }, createdBy: "Bianca" });

  await setActiveCase(TEST_CLIENT, { id: c.id, title: c.title, subject: c.subject, topic: c.topic, status: c.status, contactCount: c.contactCount });
  const active = await getActiveCase(TEST_CLIENT);
  check(active && active.id === c.id, "Aktiver Vorgang server-seitig gemerkt");
  check(active.subject?.name === "Gisela Meier", "Aktiver Vorgang traegt Patientennamen");

  await clearActiveCase(TEST_CLIENT);
  const cleared = await getActiveCase(TEST_CLIENT);
  check(!cleared, "Aktiver Vorgang wieder geleert");

  await endSession(TEST_CLIENT);
  await cleanup();
  console.log("");
  process.exit(failed ? 1 : 0);
}
run().catch((e) => { console.error("ERROR:", e); process.exit(1); });
