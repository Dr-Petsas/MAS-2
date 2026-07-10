import "dotenv/config";
import admin from "../src/firebase.js";
import { masCollection } from "../src/tenant.js";
import {
  PAIRING_TOKEN_TTL_MS, platformFromUserAgent, validateSubscription,
  createPairingToken, redeemPairingToken, listDevices, removeDevice, removeOwnDevice,
  identifyByDevice, refreshSubscription, buildCallPayload,
  sendCallToDevice, callDevice, callOperator, pushConfigured,
} from "../src/clara/devices.js";

// Clara ruft aufs Handy: Pairing-Token-Lebenszyklus (einmalig, befristet),
// Geräte-Registry, deviceKey-Identität, Push-Payload (PII-frei) und das
// Fehlverhalten beim Senden (kaputte Subscription => kein Crash). Run:
//   node scripts/test-devices.mjs

let failed = 0;
function check(cond, msg) {
  console.log((cond ? "  ok: " : "  FAIL: ") + msg);
  if (!cond) failed++;
}

const C = "zzz-mas2-devices";
const db = admin.firestore();

async function wipe(colRef) {
  const snap = await colRef.get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
async function cleanup() {
  await wipe(masCollection(C, "mas_pairing_tokens"));
  await wipe(masCollection(C, "mas_devices"));
}

const FAKE_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-123",
  keys: { p256dh: "BPub-fake-p256dh-key", auth: "fake-auth" },
};
const OP = { id: "op_test1", name: "Dr. Test", role: "doctor", doctorName: "Dr. Test" };

async function run() {
  console.log("=== pure: Plattform-Erkennung + Subscription-Validierung ===");
  check(platformFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)") === "ios", "iPhone-UA -> ios");
  check(platformFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)") === "android", "Android-UA -> android");
  check(platformFromUserAgent("") === "", "leerer UA -> leer");
  check(validateSubscription(null).ok === false, "null Subscription -> abgelehnt");
  check(validateSubscription({ endpoint: "http://insecure" }).ok === false, "http-Endpoint -> abgelehnt");
  check(validateSubscription({ endpoint: FAKE_SUB.endpoint, keys: { p256dh: "x" } }).ok === false, "fehlender auth-Key -> abgelehnt");
  check(validateSubscription(FAKE_SUB).ok === true, "vollständige Subscription -> ok");

  console.log("\n=== pure: Push-Payload ist PII-frei + korrekt verlinkt ===");
  const payload = buildCallPayload({ publicBaseUrl: "https://mas.example.com/", clientId: C, deviceId: "dev_x", reason: "Tagesbriefing" });
  check(payload.title === "Clara ruft an", "Titel 'Clara ruft an'");
  check(payload.reason === "Tagesbriefing", "Grund übernommen");
  check(payload.url.startsWith("https://mas.example.com/m/call.html?c="), "URL zeigt auf /m/call.html (ohne Doppel-Slash)");
  check(payload.url.includes(encodeURIComponent("Tagesbriefing")), "Grund in URL kodiert");
  const longReason = "x".repeat(300);
  check(buildCallPayload({ publicBaseUrl: "", clientId: C, deviceId: "d", reason: longReason }).reason.length <= 90, "Grund auf 90 Zeichen gekappt");
  check(buildCallPayload({ publicBaseUrl: "", clientId: C, deviceId: "d" }).reason.length > 0, "leerer Grund -> neutraler Standardtext");

  console.log("\n=== firestore: Pairing-Token-Lebenszyklus ===");
  await cleanup();
  const t1 = await createPairingToken(C, OP, { createdBy: "uid123" });
  check(typeof t1.token === "string" && t1.token.length >= 20, "Token erzeugt (unguessable)");
  check(t1.expiresAtMs - t1.createdAtMs === PAIRING_TOKEN_TTL_MS, "TTL = 10 Minuten");
  check(t1.operatorId === OP.id && t1.operatorName === OP.name, "Token an Person gebunden");

  // unknown token
  const rUnknown = await redeemPairingToken(C, "gibt-es-nicht", { subscription: FAKE_SUB });
  check(rUnknown.ok === false && rUnknown.reason === "token_unknown", "unbekannter Token -> token_unknown");

  // invalid subscription is rejected BEFORE burning the token
  const rBadSub = await redeemPairingToken(C, t1.token, { subscription: { endpoint: "kaputt" } });
  check(rBadSub.ok === false && rBadSub.reason === "endpoint_invalid", "kaputte Subscription -> abgelehnt, Token bleibt gültig");

  // successful redeem
  const r1 = await redeemPairingToken(C, t1.token, {
    subscription: FAKE_SUB,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
  });
  check(r1.ok === true && r1.deviceId.startsWith("dev_"), "Einlösen erzeugt Gerät");
  check(typeof r1.deviceKey === "string" && r1.deviceKey.length >= 24, "deviceKey wird genau einmal zurückgegeben");
  check(r1.operator?.name === OP.name && r1.operator?.role === "doctor", "Operator-Identität kommt mit");

  // single-use
  const r2 = await redeemPairingToken(C, t1.token, { subscription: FAKE_SUB });
  check(r2.ok === false && r2.reason === "token_used", "zweites Einlösen -> token_used");

  // expired token
  const t2 = await createPairingToken(C, OP);
  await masCollection(C, "mas_pairing_tokens").doc(t2.token).update({ expiresAtMs: Date.now() - 1000 });
  const r3 = await redeemPairingToken(C, t2.token, { subscription: FAKE_SUB });
  check(r3.ok === false && r3.reason === "token_expired", "abgelaufener Token -> token_expired");

  console.log("\n=== firestore: Geräte-Registry + deviceKey-Identität ===");
  const list1 = await listDevices(C);
  check(list1.length === 1 && list1[0].id === r1.deviceId, "Geräteliste enthält das gekoppelte Handy");
  check(!("subscription" in list1[0]) && !("secretHash" in list1[0]), "Liste enthält weder Subscription noch Secret");
  check(list1[0].platform === "ios", "Plattform aus UA abgeleitet");

  const who = await identifyByDevice(C, r1.deviceId, r1.deviceKey);
  check(who?.name === OP.name && who?.role === "doctor", "deviceId+deviceKey -> Operator (PIN-los)");
  check((await identifyByDevice(C, r1.deviceId, "falscher-key")) === null, "falscher deviceKey -> null");
  check((await identifyByDevice(C, "dev_unbekannt", r1.deviceKey)) === null, "unbekanntes Gerät -> null");

  const filtered = await listDevices(C, { operatorId: OP.id });
  check(filtered.length === 1, "Filter nach operatorId findet das Gerät");
  check((await listDevices(C, { operatorId: "op_anders" })).length === 0, "fremde operatorId -> leer");

  console.log("\n=== firestore: Subscription-Refresh (Rotation) ===");
  const newSub = { endpoint: "https://fcm.googleapis.com/fcm/send/rotated-456", keys: { p256dh: "BNeu", auth: "neu" } };
  const rf1 = await refreshSubscription(C, r1.deviceId, r1.deviceKey, newSub);
  check(rf1.ok === true, "Refresh mit gültigem deviceKey -> ok");
  const devDoc = await masCollection(C, "mas_devices").doc(r1.deviceId).get();
  check(devDoc.data()?.subscription?.endpoint === newSub.endpoint, "neue Subscription gespeichert");
  const rf2 = await refreshSubscription(C, r1.deviceId, "falsch", newSub);
  check(rf2.ok === false && rf2.reason === "device_auth_failed", "Refresh mit falschem Key -> abgelehnt");

  console.log("\n=== push: Senden gegen tote Endpoints crasht nie ===");
  // The fake endpoint is unreachable/rejected by FCM — the call must return a
  // structured failure, never throw, and must NOT delete the device on generic
  // errors (only 404/410 mean "subscription gone").
  if (pushConfigured()) {
    const dev = (await masCollection(C, "mas_devices").doc(r1.deviceId).get()).data();
    const sendR = await sendCallToDevice(C, dev, { reason: "Test", publicBaseUrl: "https://x.example" });
    check(sendR.ok === false, "Senden an Fake-Endpoint schlägt kontrolliert fehl");
    const stillThere = await masCollection(C, "mas_devices").doc(r1.deviceId).get();
    // 404/410 => removed is legitimate; anything else must keep the device.
    if (sendR.removed) {
      check(!stillThere.exists, "410/404 -> Gerät aufgeräumt");
      // restore for the remaining checks
      await masCollection(C, "mas_devices").doc(r1.deviceId).set(dev);
    } else {
      check(stillThere.exists, "generischer Fehler -> Gerät bleibt registriert");
      check(stillThere.data()?.lastPushOk === false, "lastPushOk=false protokolliert");
    }
    const cd = await callDevice(C, "dev_unbekannt", { reason: "x" });
    check(cd.ok === false && cd.reason === "device_unknown", "callDevice auf unbekanntes Gerät -> device_unknown");
    const co = await callOperator(C, "op_ohne_geraete", { reason: "x" });
    check(co.ok === false && co.reason === "no_devices", "callOperator ohne Geräte -> no_devices");
  } else {
    const sendR = await sendCallToDevice(C, { id: "d", subscription: FAKE_SUB }, { reason: "Test" });
    check(sendR.ok === false && sendR.reason === "push_not_configured", "ohne VAPID-Keys -> push_not_configured (kein Crash)");
  }

  console.log("\n=== firestore: Gerät entfernen ===");
  await removeDevice(C, r1.deviceId);
  check((await listDevices(C)).length === 0, "Gerät entfernt -> Liste leer");
  check((await identifyByDevice(C, r1.deviceId, r1.deviceKey)) === null, "entferntes Gerät kann sich nicht mehr ausweisen");

  console.log("\n=== firestore: Endpoint-Dedupe (dasselbe Handy koppelt erneut) ===");
  await cleanup();
  const tA = await createPairingToken(C, OP);
  const rA = await redeemPairingToken(C, tA.token, { subscription: FAKE_SUB });
  const tB = await createPairingToken(C, OP);
  const rB = await redeemPairingToken(C, tB.token, { subscription: FAKE_SUB });
  const afterRepair = await listDevices(C);
  check(rA.ok && rB.ok, "beide Kopplungen erfolgreich eingelöst");
  check(afterRepair.length === 1 && afterRepair[0].id === rB.deviceId, "gleicher Endpoint -> nur die NEUE Registrierung bleibt (Dedupe)");
  check((await identifyByDevice(C, rA.deviceId, rA.deviceKey)) === null, "alte Dublette entfernt (kann nicht mehr klingeln)");

  console.log("\n=== firestore: Selbst-Entkoppeln (deviceKey-gesichert) ===");
  const uBad = await removeOwnDevice(C, rB.deviceId, "falscher-key");
  check(uBad.ok === false && uBad.reason === "device_auth_failed", "falscher deviceKey -> abgelehnt, Gerät bleibt");
  check((await listDevices(C)).length === 1, "Gerät nach abgelehntem Unpair noch da");
  const uOk = await removeOwnDevice(C, rB.deviceId, rB.deviceKey);
  check(uOk.ok === true, "richtiger deviceKey -> Selbst-Entkoppeln ok");
  check((await listDevices(C)).length === 0, "nach Selbst-Entkoppeln -> Liste leer");
  const uGone = await removeOwnDevice(C, rB.deviceId, rB.deviceKey);
  check(uGone.ok === true && uGone.alreadyGone === true, "erneutes Entkoppeln -> idempotent (alreadyGone)");

  console.log("\n=== firestore: removeDevice räumt Geschwister mit gleichem Endpoint ===");
  await cleanup();
  // Zwei Alt-Dubletten mit identischem Endpoint direkt anlegen (Vor-Dedupe-Zustand).
  await masCollection(C, "mas_devices").doc("dev_dup1").set({ id: "dev_dup1", operatorId: OP.id, subscription: FAKE_SUB, secretHash: "x", createdAtMs: Date.now() });
  await masCollection(C, "mas_devices").doc("dev_dup2").set({ id: "dev_dup2", operatorId: OP.id, subscription: FAKE_SUB, secretHash: "y", createdAtMs: Date.now() });
  const rmDup = await removeDevice(C, "dev_dup1");
  check(rmDup.ok === true && rmDup.siblingsRemoved === 1, "removeDevice meldet 1 entferntes Geschwister");
  check((await listDevices(C)).length === 0, "beide Dubletten mit gleichem Endpoint entfernt");

  await cleanup();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALLE CHECKS OK");
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error("test crashed:", e); process.exit(1); });
