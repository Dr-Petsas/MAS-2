// Test W-MANDANT-0: Mandanten-Registry (src/tenants.js).
// Prueft: Default-Mandant immer enthalten und vorn, Env-Override, Notaus,
// zzz-mas2-Testmandanten werden ausgefiltert. Legt dazu einen eigenen
// zzz-Testmandanten mit Kalender-Config an und raeumt ihn wieder ab.
import "dotenv/config";
import admin from "../src/firebase.js";
import { DEFAULT_CLIENT_ID } from "../src/routes/_shared.js";
import { aktiveMandanten, schedulerMandanten, mandantenCacheLeeren } from "../src/tenants.js";

let fails = 0;
const check = (ok, name, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fails++;
};

const db = admin.firestore();
const TEST_ID = "zzz-mas2-mandanten-registry";
const testBooking = db.doc(`clients/${TEST_ID}/mas_config/booking`);

try {
  // Vorbereitung: Testmandant MIT Kalender-Config — darf trotzdem nie in der
  // Registry auftauchen (zzz-Filter).
  await testBooking.set({ locationId: "zzz-test-location" }, { merge: true });

  // 1) Grundzustand: Default-Mandant enthalten und an erster Stelle.
  mandantenCacheLeeren();
  const liste = await aktiveMandanten();
  check(Array.isArray(liste) && liste.length >= 1, "Registry liefert eine Liste", JSON.stringify(liste));
  check(liste[0] === DEFAULT_CLIENT_ID, "Default-Mandant steht an erster Stelle");
  check(!liste.includes(TEST_ID), "zzz-Testmandant wird ausgefiltert");
  check(new Set(liste).size === liste.length, "keine Doppelten");

  // 2) Cache: zweiter Aufruf identisch (und ohne neue Query beobachtbar gleich).
  const liste2 = await aktiveMandanten();
  check(JSON.stringify(liste2) === JSON.stringify(liste), "Cache liefert identische Liste");

  // 3) Env-Override MAS_MANDANTEN.
  process.env.MAS_MANDANTEN = "praxisA, praxisB";
  mandantenCacheLeeren();
  const overr = await aktiveMandanten();
  check(JSON.stringify(overr) === JSON.stringify(["praxisA", "praxisB"]), "MAS_MANDANTEN-Override greift", JSON.stringify(overr));
  delete process.env.MAS_MANDANTEN;
  mandantenCacheLeeren();

  // 4) Notaus fuer den Scheduler: exakt [DEFAULT_CLIENT_ID].
  process.env.MAS_MULTI_TENANT_SCHEDULER = "0";
  const notaus = await schedulerMandanten();
  check(JSON.stringify(notaus) === JSON.stringify([DEFAULT_CLIENT_ID]), "Notaus: Scheduler sieht nur den Default-Mandanten");
  delete process.env.MAS_MULTI_TENANT_SCHEDULER;

  // 5) Ohne Notaus: schedulerMandanten == aktiveMandanten.
  mandantenCacheLeeren();
  const sched = await schedulerMandanten();
  check(sched.includes(DEFAULT_CLIENT_ID), "Scheduler-Liste traegt den Default-Mandanten");

  console.log(`\nRegistry heute: ${JSON.stringify(sched)}`);
} finally {
  await testBooking.delete().catch(() => {});
}

if (fails) { console.error(`\n${fails} Pruefung(en) rot.`); process.exit(1); }
console.log("\nAlle Registry-Pruefungen bestanden.");
process.exit(0);
