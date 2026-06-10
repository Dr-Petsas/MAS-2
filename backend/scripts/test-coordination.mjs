import "dotenv/config";
import admin from "../src/firebase.js";
import { recordCommunication } from "../src/brain/record.js";
import { appendEvent, getEvent } from "../src/brain/eventStore.js";
import { getCase, listCases, setStatus } from "../src/brain/caseStore.js";
import { enqueueBrainWrite, processBrainOutbox, outboxHealth } from "../src/brain/outbox.js";

// End-to-end coordination loop for Clara <-> Nadine: the single reliable brain
// logger (recordCommunication), the dead-letter outbox repair, event<->case
// lifecycle coupling, and anonymous-contact threading. Runs against an isolated
// throwaway tenant. Run: node scripts/test-coordination.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const C = "zzz-mas2-coord";
const db = admin.firestore();

async function cleanup() {
  for (const c of ["mas_cases", "mas_events", "mas_brain_outbox"]) {
    const snap = await db.collection("clients").doc(C).collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

async function run() {
  await cleanup();

  console.log("=== recordCommunication: append + thread, idempotent ===");
  const inbound = {
    id: "mail-in:m1",
    channel: "nadine_email",
    direction: "in",
    subject: { patientId: "patX", name: "Anna Test", matchStatus: "matched", matchMethod: "email" },
    counterparty: { kind: "patient", name: "Anna Test", ref: "anna@test.de" },
    signals: { billingQuestion: true },
    summary: "Frau Test fragt zur Rechnung.",
  };
  const r1 = await recordCommunication(C, inbound, { by: "Nadine" });
  check(r1.ok && !!r1.caseId, "Eingehende Mail -> Event + Vorgang erstellt");

  const r2 = await recordCommunication(C, {
    id: "mail-out:m1",
    channel: "nadine_email",
    direction: "out",
    subject: { patientId: "patX", name: "Anna Test", matchStatus: "matched" },
    counterparty: { kind: "patient", name: "Anna Test", ref: "anna@test.de" },
    signals: { billingQuestion: true },
    summary: "Nadine antwortet zur Rechnung.",
  }, { by: "Nadine" });
  check(r2.caseId === r1.caseId, "Ausgehende Antwort (gleicher Patient/Thema) -> selber Vorgang");

  let caseDoc = await getCase(C, r1.caseId);
  check(caseDoc.eventIds.includes("mail-in:m1") && caseDoc.eventIds.includes("mail-out:m1"), "Beide Events am Vorgang verknüpft");
  check(caseDoc.contactCount === 2, `contactCount = 2 (war ${caseDoc.contactCount})`);

  await recordCommunication(C, inbound, { by: "Nadine" }); // re-deliver
  caseDoc = await getCase(C, r1.caseId);
  check(caseDoc.contactCount === 2, "Idempotent: erneute Zustellung zählt nicht doppelt");

  console.log("\n=== Dead-letter outbox: Reparatur eines Link-Jobs ===");
  await appendEvent(C, {
    id: "orphan1",
    channel: "nadine_email",
    direction: "in",
    subject: { patientId: "patY", name: "Bert Beispiel", matchStatus: "matched" },
    signals: { appointmentRequest: true },
    summary: "Terminwunsch.",
  });
  await enqueueBrainWrite(C, { kind: "link", eventId: "orphan1", by: "Nadine" });
  let h = await outboxHealth(C);
  check(h.pending >= 1, `Outbox hat ${h.pending} ausstehende(n) Job(s)`);
  const proc = await processBrainOutbox(C);
  check(proc.repaired >= 1, `Outbox repariert (${proc.repaired})`);
  const casesY = await listCases(C, { patientId: "patY" });
  check(casesY.length === 1 && casesY[0].eventIds.includes("orphan1"), "Verwaistes Event per Outbox an Vorgang gehängt");
  h = await outboxHealth(C);
  check(h.pending === 0, "Keine ausstehenden Jobs nach Drain");

  console.log("\n=== Lebenszyklus-Kopplung: Vorgang resolved -> Events resolved ===");
  let evIn = await getEvent(C, "mail-in:m1");
  check(evIn.status === "open", "Eingehendes Event ist offen (vor Abschluss)");
  await setStatus(C, r1.caseId, "resolved", { by: "Dr. Test", note: "erledigt" });
  evIn = await getEvent(C, "mail-in:m1");
  check(evIn.status === "resolved", "Verknüpftes offenes Event wird mit Vorgang aufgelöst");

  console.log("\n=== Anonyme Kontakte: Threading per Kontaktschlüssel ===");
  const anon = (id, ref) => recordCommunication(C, {
    id,
    channel: "nadine_email",
    direction: "in",
    subject: { name: "", matchStatus: "unmatched" },
    counterparty: { kind: "unknown", name: ref, ref },
    signals: { documentRelated: true },
    summary: `Anfrage von ${ref}`,
  }, { by: "Nadine" });
  const a1 = await anon("anon1", "stranger@x.de");
  const a2 = await anon("anon2", "stranger@x.de");
  check(a1.caseId === a2.caseId, "Gleicher anonymer Absender + Thema -> EIN Vorgang (kein Duplikat)");
  const a3 = await anon("anon3", "other@x.de");
  check(a3.caseId !== a1.caseId, "Anderer anonymer Absender -> eigener Vorgang");

  await cleanup();
  console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : "ALL CHECKS PASSED"}`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
