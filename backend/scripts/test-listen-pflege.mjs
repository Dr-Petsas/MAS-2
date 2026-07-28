// Listen-Pflege + Puffer (Chef 28.07.2026) — Firestore-Pins mit Aufraeumen.
//   1. Wisch-Entfernen: removed=true bleibt als Audit, remaining stimmt,
//      Doppel-Entfernen idempotent, Kontaktierte sind geschuetzt.
//   2. Verfall: Liste mit verstrichenem Slot verschwindet aus dem Overview
//      und der Fall wird geschlossen.
//   3. Auffrischen uebernimmt removed-Markierungen (Scan holt Entfernte
//      nicht zurueck) — geprueft ueber die Kandidaten-Ansage/Karten-Daten.

import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import { createCase } from "../src/brain/caseStore.js";
import {
  removeCandidateFromList, gapFillOverview, gapCandidateCardData, aktiveKandidaten,
  gapFillCalendarBoundary, listRecallBuckets, resolveBucketKey, setListBucket,
} from "../src/clara/gapFill.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const suffix = Date.now().toString(36);
const CASE_AKTIV = `gapfill_pflege_aktiv_${suffix}`;
const CASE_ALT = `gapfill_pflege_alt_${suffix}`;
const CASE_FREMD = `gapfill_pflege_fremd_${suffix}`;

let fehler = 0;
function check(was, ok) {
  console.log(`${ok ? "  OK  " : "  FAIL"} ${was}`);
  if (!ok) fehler++;
}

function kandidat(n, extra = {}) {
  return {
    patientId: `pflege_p${n}`,
    name: `Testfall Pflege ${n}`,
    phone: `+4917000000${n}`,
    visitMotiveName: "Kontrolle",
    durationMin: 30,
    overdueDays: 100 - n,
    consent: { sms: null, reminder: true },
    reason: "Fälliger Recall — Kontrolle",
    stats: { contacts: n, booked: n % 2, recent: 0, suppressed: false, spamRisk: false },
    ...extra,
  };
}

// Kalender-Grenze (Chef 28.07.2026): Das Overview zeigt nur Listen des
// gekoppelten Behandlers — Testfaelle deshalb auf DESSEN Kalender anlegen,
// sonst wuerden sie als fremd geschlossen statt geprueft.
const BOUNDARY_CAL = (await gapFillCalendarBoundary(clientId)) || "cal_pflege";

// Testfall wie die Produktion anlegen (createCase schreibt die Zeitstempel,
// ohne die listCases den Fall gar nicht sieht), dann callList nachtragen.
async function seedCase(id, { date, startMin, endMin, candidates }) {
  await createCase(clientId, {
    id,
    title: `TESTFALL Listen-Pflege (${id})`,
    topic: "appointment",
    subject: { name: "Listen-Pflege-Test" },
    status: "waiting_approval",
    assignee: "Lisa",
    createdBy: "Clara",
    updates: [],
  });
  await masCollection(clientId, "mas_cases").doc(id).update({
    callList: {
      kind: "gap_fill",
      date,
      calendarId: BOUNDARY_CAL,
      calendarName: "Dr. Pflege",
      slot: { startMin, endMin, minutes: endMin - startMin, label: "Test" },
      candidates,
      approvedBy: null,
    },
  });
}

const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const gestern = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

try {
  console.log("[0] Aufbau: eine gueltige Liste (morgen) + eine verstrichene (gestern)");
  await seedCase(CASE_AKTIV, {
    date: morgen, startMin: 13 * 60, endMin: 15 * 60,
    candidates: [
      kandidat(1),
      kandidat(2, { contact: { via: "sms", taskId: "t_pflege", ok: true, at: Date.now() } }),
      kandidat(3),
      kandidat(4),
    ],
  });
  await seedCase(CASE_ALT, {
    date: gestern, startMin: 9 * 60, endMin: 10 * 60, candidates: [kandidat(5)],
  });

  console.log("[1] Wisch-Entfernen");
  const r1 = await removeCandidateFromList(clientId, CASE_AKTIV, { patientId: "pflege_p1", by: "Chef (Test)" });
  check("Entfernen ok, 3 aktive bleiben (p2 kontaktiert, p3, p4)", r1.ok === true && r1.remaining === 3);
  const r2 = await removeCandidateFromList(clientId, CASE_AKTIV, { patientId: "pflege_p1", by: "Chef (Test)" });
  check("Doppel-Entfernen idempotent", r2.ok === true && r2.already === true);
  const r3 = await removeCandidateFromList(clientId, CASE_AKTIV, { patientId: "pflege_p2" });
  check("Kontaktierter Kandidat ist geschuetzt", r3.ok === false && r3.reason === "already_contacted");
  const r4 = await removeCandidateFromList(clientId, CASE_AKTIV, { patientId: "gibtsnicht" });
  check("Unbekannter Kandidat -> candidate_not_found", r4.ok === false && r4.reason === "candidate_not_found");
  const snap = await masCollection(clientId, "mas_cases").doc(CASE_AKTIV).get();
  const cands = snap.data().callList.candidates;
  const p1 = cands.find((c) => c.patientId === "pflege_p1");
  check("removed bleibt als Audit (removedBy gesetzt)", p1?.removed === true && p1?.removedBy === "Chef (Test)");
  check("aktiveKandidaten filtert entfernte raus", aktiveKandidaten(snap.data().callList).length === 3);

  console.log("[2] Verfall + Kalender-Grenze im Overview");
  const hatGrenze = BOUNDARY_CAL !== "cal_pflege";
  if (hatGrenze) {
    // Liste eines fremden Behandler-Kalenders (gueltiger Slot morgen) —
    // gehoert nicht zu dieser Clara und darf nie auf Freigabe warten.
    await seedCase(CASE_FREMD, { date: morgen, startMin: 10 * 60, endMin: 11 * 60, candidates: [kandidat(6)] });
    await masCollection(clientId, "mas_cases").doc(CASE_FREMD).update({
      "callList.calendarId": "fremder_kollegen_kalender",
      "callList.calendarName": "Dr. Kollege",
    });
  }
  const ov = await gapFillOverview(clientId);
  const alle = [...ov.pending, ...ov.approved].map((l) => l.caseId);
  check("gueltige Liste (morgen) wird angezeigt", alle.includes(CASE_AKTIV));
  check("verstrichene Liste (gestern) ist raus", !alle.includes(CASE_ALT));
  if (hatGrenze) check("fremder Kalender ist raus (Kalender-Grenze)", !alle.includes(CASE_FREMD));
  // Schliessen laeuft fire-and-forget — kurz warten, dann Status pruefen.
  await new Promise((r) => setTimeout(r, 1500));
  const altSnap = await masCollection(clientId, "mas_cases").doc(CASE_ALT).get();
  check("verstrichener Fall wurde geschlossen", altSnap.data()?.status === "closed");
  if (hatGrenze) {
    const fremdSnap = await masCollection(clientId, "mas_cases").doc(CASE_FREMD).get();
    check("fremder Fall wurde geschlossen", fremdSnap.data()?.status === "closed");
  } else {
    console.log("  (kein gekoppelter Behandler aufloesbar — Grenz-Pins uebersprungen)");
  }

  console.log("[3] Anzeige-Wege ohne Entfernte");
  const karten = await gapCandidateCardData(clientId);
  const meine = karten.find((k) => k.calendarName === "Dr. Pflege");
  check("Karte zeigt nur aktive Kandidaten (3)", (meine?.candidates || []).length === 3);
  check("Karte traegt Zaehler am Namen (z. B. ³ oder ✓)", (meine?.candidates || []).some((c) => /[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(c.anzeigeName)));

  console.log("[4] Themen-Buckets (Auswahl + Listenwechsel)");
  const inv = await listRecallBuckets(clientId);
  check("Bucket-Inventar liefert", inv.ok === true && Array.isArray(inv.buckets));
  const top = (inv.buckets || []).find((b) => b.passend > 0);
  if (top) {
    console.log(`  groesstes Bucket: »${top.label}« (${top.passend} passend / ${top.gesamt} gesamt, Pool ${inv.candidatesTotal})`);
    check("resolveBucketKey: Kons -> Fachbereich", resolveBucketKey(inv.buckets, "Kons") === "fach:kons");
    check("resolveBucketKey: Prophylaxe -> Fachbereich", resolveBucketKey(inv.buckets, "Prophylaxe") === "fach:prophylaxe");
    check("resolveBucketKey: Implantat -> Fachbereich", resolveBucketKey(inv.buckets, "Implantat") === "fach:implantat");
    check("resolveBucketKey: alle Themen -> null", resolveBucketKey(inv.buckets, "alle Themen") === null);
    check("resolveBucketKey: Unbekanntes bleibt leer", resolveBucketKey(inv.buckets, "voellig-unbekanntes-thema-xyz") === null);

    const sb = await setListBucket(clientId, CASE_AKTIV, { bucketKey: top.key, by: "Chef (Test)" });
    check("setListBucket stellt um", sb.ok === true && sb.bucketKey === top.key);
    const nachher = (await masCollection(clientId, "mas_cases").doc(CASE_AKTIV).get()).data()?.callList || {};
    check("bucketKey/-Label gespeichert", nachher.bucketKey === top.key && !!nachher.bucketLabel);
    const proId = new Map((nachher.candidates || []).map((c) => [c.patientId, c]));
    check("kontaktierter Kandidat bleibt vorn", proId.get("pflege_p2")?.contact?.taskId === "t_pflege");
    check("weggewischter Kandidat bleibt draussen", proId.get("pflege_p1")?.removed === true);
  } else {
    console.log("  (kein Bucket mit passenden Kandidaten — Wechsel-Pins uebersprungen)");
  }
} finally {
  console.log("[5] Aufraeumen");
  await masCollection(clientId, "mas_cases").doc(CASE_AKTIV).delete().catch(() => {});
  await masCollection(clientId, "mas_cases").doc(CASE_ALT).delete().catch(() => {});
  await masCollection(clientId, "mas_cases").doc(CASE_FREMD).delete().catch(() => {});
  console.log("  Testfaelle geloescht.");
}

console.log();
if (fehler) {
  console.log(`FAZIT: ${fehler} Pin(s) verletzt.`);
  process.exit(1);
}
console.log("FAZIT: Listen-Pflege haelt — Wisch-Entfernen, Verfall, Anzeige ohne Entfernte.");
process.exit(0);
