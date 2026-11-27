// Der Schalter MAS_TUNNEL_NUR_ANGEMELDET: von aussen (Koepfe des Tunnels) geht ohne Anmeldung und ohne Schluessel
// nur noch, was sich selbst schuetzt, und der Uebergang fuer Bianca und Lisa. Dieser Rechner und das Praxisnetz
// bleiben, wie sie sind. Schreibt nichts: die Routen hier sind Attrappen.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import express from "express";

process.env.MAS_REQUIRE_AUTH = "0";
process.env.MAS_TUNNEL_NUR_ANGEMELDET = "1";
const DIENST = randomBytes(32).toString("hex");
process.env.MAS_SERVICE_TOKEN = DIENST;

const { default: admin } = await import("../src/firebase.js");
const { authMiddleware, AUTH_ENFORCED, TUNNEL_NUR_ANGEMELDET } = await import("../src/auth.js");
const app = express();
app.use(express.json());
app.use(authMiddleware());
app.use((req, res) => res.json({ ok: true, art: req.auth?.kind, zugang: req.zugang }));
const srv = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });

const TUNNEL = { "Cf-Ray": "8f0a1b2c3d4e5f60-FRA", "Cf-Connecting-Ip": "203.0.113.7", "X-Forwarded-For": "203.0.113.7", "Cdn-Loop": "cloudflare" };
async function rufe(pfad, { method = "GET", kopf = {}, body } = {}) {
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${pfad}`, {
    method, headers: { "Content-Type": "application/json", ...kopf }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, daten: await r.json().catch(() => ({})) };
}

test.after(async () => {
  srv.close();
  await admin.app().delete().catch(() => {});
});

test("von aussen ohne Nachweis: abgelehnt, lesend wie schreibend", async () => {
  assert.equal(AUTH_ENFORCED, false);
  assert.equal(TUNNEL_NUR_ANGEMELDET, true);
  for (const [method, pfad] of [
    ["GET", "/brain/search?q=x"], ["GET", "/brain/karteikarte"], ["GET", "/brain/tagesliste"], ["GET", "/brain/kontakt-verlauf"],
    ["GET", "/mail/accounts"], ["GET", "/mail/messages"], ["POST", "/mail/send"], ["POST", "/tools/send-sms"],
    ["POST", "/tools/delegate-call"], ["POST", "/tools/search-patient"], ["POST", "/cf/createAppointment"],
    ["GET", "/lisa/tasks"], ["GET", "/clara/qm/praxen"], ["GET", "/admin/tenant/export"], ["POST", "/brain/luecke-fuellen"],
    ["GET", "/treatment/room-capture-state"], ["GET", "/gibt/es/nicht"],
  ]) {
    const a = await rufe(pfad, { method, kopf: TUNNEL, body: method === "POST" ? {} : undefined });
    assert.deepEqual([a.status, a.daten.grund, a.daten.error], [401, "anmeldung_noetig", "unauthenticated"], `${method} ${pfad}`);
  }
  // Ein einziger Kopf des Tunnels genuegt; ein erfundener Nachweis oder ein falscher Schluessel hilft nicht.
  assert.equal((await rufe("/brain/search", { kopf: { "X-Forwarded-For": "203.0.113.7" } })).status, 401);
  const erfunden = await rufe("/brain/search", { kopf: { ...TUNNEL, Authorization: "Bearer nicht-echt" } });
  assert.deepEqual([erfunden.status, erfunden.daten.error], [401, "invalid_token"]);
  assert.equal((await rufe("/brain/search?t=nicht-echt", { kopf: TUNNEL })).status, 401);
  assert.equal((await rufe("/brain/search", { kopf: { ...TUNNEL, "X-Service-Token": "falsch" } })).status, 401);
});

test("von aussen weiter offen: was sich selbst schuetzt, der Dienstschluessel, der Uebergang", async () => {
  for (const [method, pfad] of [
    ["GET", "/health"], ["POST", "/brain/kontakt-verlauf/sendung"], ["POST", "/brain/kontakt-verlauf/reaktion"],
    ["GET", "/clara/qm/portal/job"], ["POST", "/clara/devices/refresh"], ["GET", "/clara/pending-context"],
    ["POST", "/lisa/tools/offer-slots"], ["POST", "/lisa/twilio/status"], ["GET", "/planr/berechtigung"],
    ["GET", "/z/abc/def"], ["GET", "/remote/pending"], ["POST", "/treatment/heartbeat"], ["POST", "/treatment/lena-segment"],
    ["POST", "/treatment/room-capture"], ["POST", "/treatment/lena-suggest"], ["POST", "/treatment/lena-consolidate-01"],
    ["OPTIONS", "/brain/search"],
  ]) {
    const a = await rufe(pfad, { method, kopf: TUNNEL, body: method === "POST" ? {} : undefined });
    assert.deepEqual([a.status, a.daten.art], [200, "public"], `${method} ${pfad}`);
  }
  const dienst = await rufe("/mail/accounts", { kopf: { ...TUNNEL, "X-Service-Token": DIENST } });
  assert.deepEqual([dienst.status, dienst.daten.art], [200, "service"]);
  for (const [method, pfad] of [["GET", "/brain/caller-context?phone=0"], ["POST", "/brain/caller-context/resolve"], ["POST", "/brain/events"], ["POST", "/brain/lisa-anrufe"]]) {
    const a = await rufe(pfad, { method, kopf: TUNNEL, body: method === "POST" ? {} : undefined });
    assert.deepEqual([a.status, a.daten.art], [200, "anon"], `${method} ${pfad}`);
  }
});

test("feste Clara-Routen mit einem Abschnitt: von aussen nur mit Nachweis, die Koppelseite bleibt offen", async () => {
  // Das alte Muster /clara/<ein Abschnitt> stellte sie alle frei, auch die mit Patientennamen.
  for (const [method, pfad] of [
    ["GET", "/clara/stt-patient-names"], ["GET", "/clara/pruefliste"], ["GET", "/clara/team"], ["PUT", "/clara/team"],
    ["GET", "/clara/directory"], ["POST", "/clara/directory"], ["DELETE", "/clara/directory"], ["GET", "/clara/devices"],
    ["POST", "/clara/call-operator"], ["POST", "/clara/session-start"], ["POST", "/clara/session-end"],
    ["GET", "/clara/sophie-hinweis"], ["POST", "/clara/billing-intake"], ["GET", "/clara/greeting-context"],
    ["POST", "/clara/stt-korrektur"], ["GET", "/clara/tool-errors"], ["GET", "/clara/noch-nicht-erfunden"],
    ["GET", "/clara/team/"], ["GET", "/CLARA/Team"], ["GET", "/clara/team/status"], ["GET", "/clara/devices/connect"],
    // Eine Praxiskennung macht nur GET zur Koppelseite.
    ["POST", "/clara/MEe4ZQHEzOPzLcexyhdT"], ["DELETE", "/clara/MEe4ZQHEzOPzLcexyhdT/status"],
  ]) {
    const a = await rufe(pfad, { method, kopf: TUNNEL, body: ["POST", "PUT"].includes(method) ? {} : undefined });
    assert.deepEqual([a.status, a.daten.grund], [401, "anmeldung_noetig"], `${method} ${pfad}`);
  }
  const erfunden = await rufe("/clara/team", { kopf: { ...TUNNEL, Authorization: "Bearer nicht-echt" } });
  assert.deepEqual([erfunden.status, erfunden.daten.error], [401, "invalid_token"]);
  // Mit dem Dienstschluessel wie bisher offen.
  const dienst = await rufe("/clara/devices", { kopf: { ...TUNNEL, "X-Service-Token": DIENST } });
  assert.deepEqual([dienst.status, dienst.daten.art, dienst.daten.zugang.mit], [200, "public", "schluessel"]);
  // Die Koppelseite und die namentlich freigestellten Pfade bleiben von aussen offen.
  for (const [method, pfad] of [
    ["GET", "/clara/MEe4ZQHEzOPzLcexyhdT"], ["GET", "/clara/MEe4ZQHEzOPzLcexyhdT/connect"], ["GET", "/clara/MEe4ZQHEzOPzLcexyhdT/status"],
    ["POST", "/clara/session"], ["POST", "/clara/identify"], ["GET", "/clara/health"], ["GET", "/clara/assistant-name"],
    ["POST", "/clara/pending-context"],
  ]) {
    const a = await rufe(pfad, { method, kopf: TUNNEL, body: method === "POST" ? {} : undefined });
    assert.deepEqual([a.status, a.daten.art], [200, "public"], `${method} ${pfad}`);
  }
  // Dieser Rechner (Sprach-Worker, Clara V8): unveraendert offen.
  for (const [method, pfad] of [["GET", "/clara/stt-patient-names"], ["GET", "/clara/greeting-context"], ["POST", "/clara/stt-korrektur"], ["GET", "/clara/devices"], ["POST", "/clara/session-start"]]) {
    const a = await rufe(pfad, { method, body: method === "POST" ? {} : undefined });
    assert.deepEqual([a.status, a.daten.art, a.daten.zugang.mit], [200, "public", "offen"], `lokal ${method} ${pfad}`);
  }
});

test("PVS-Ablage und Karteitext: von aussen nur mit Nachweis, Ablegen nur mit gekoppeltem Geraet", async () => {
  // "Nur dieser Rechner" traegt ueber den Tunnel nicht: cloudflared laeuft auf diesem Rechner.
  for (const [method, pfad] of [
    ["GET", "/pvs/outbox"], ["GET", "/pvs/outbox?status=collected"], ["GET", "/pvs/pending-chart"], ["PUT", "/pvs/pending-chart"],
    ["POST", "/pvs/outbox/abc/collected"], ["POST", "/pvs/outbox/abc/undo"], ["PUT", "/pvs/write-path"], ["GET", "/pvs/paths"],
  ]) {
    const a = await rufe(pfad, { method, kopf: TUNNEL, body: ["POST", "PUT"].includes(method) ? {} : undefined });
    assert.deepEqual([a.status, a.daten.grund], [401, "anmeldung_noetig"], `${method} ${pfad}`);
  }
  const dienst = await rufe("/pvs/outbox", { kopf: { ...TUNNEL, "X-Service-Token": DIENST } });
  assert.deepEqual([dienst.status, dienst.daten.art], [200, "public"]);
  // Der Name des Schreibwegs bleibt fuer das iPad lesbar.
  assert.equal((await rufe("/pvs/write-path", { kopf: TUNNEL })).status, 200);
  // Dieser Rechner (Connector, VDDS-Knopf): unveraendert.
  for (const [method, pfad] of [["GET", "/pvs/outbox"], ["GET", "/pvs/pending-chart"], ["POST", "/pvs/outbox/abc/collected"], ["POST", "/pvs/outbox"]]) {
    const a = await rufe(pfad, { method, body: method === "POST" ? {} : undefined });
    assert.deepEqual([a.status, a.daten.art, a.daten.zugang.mit, a.daten.zugang.geraetNoetig], [200, "public", "offen", undefined], `lokal ${method} ${pfad}`);
  }
  // Ablegen von aussen ohne Anmeldung: die Anmeldung laesst durch, die Route verlangt dann das Geraet.
  const ablegen = await rufe("/pvs/outbox", { method: "POST", kopf: TUNNEL, body: {} });
  assert.deepEqual([ablegen.status, ablegen.daten.art, ablegen.daten.zugang.geraetNoetig], [200, "public", true]);

  // Die echte Route: ohne Geraet 403, bevor irgendetwas abgelegt wird.
  const { default: pvsRouter } = await import("../src/routes/pvs.js");
  const echt = express();
  echt.use(express.json());
  echt.use(authMiddleware());
  echt.use(pvsRouter);
  const s2 = await new Promise((r) => { const s = echt.listen(0, "127.0.0.1", () => r(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${s2.address().port}/pvs/outbox`, {
      method: "POST", headers: { "Content-Type": "application/json", ...TUNNEL },
      body: JSON.stringify({ clientId: "zzz-mas2-zugang", text: "darf nie ankommen", lastName: "Test", firstName: "Test" }),
    });
    assert.deepEqual([r.status, (await r.json()).error], [403, "forbidden"]);
    const lesen = await fetch(`http://127.0.0.1:${s2.address().port}/pvs/outbox?clientId=zzz-mas2-zugang`, { headers: TUNNEL });
    assert.equal(lesen.status, 401);
  } finally {
    s2.close();
  }
});

test("dieser Rechner bleibt, wie er ist", async () => {
  for (const [method, pfad] of [["GET", "/brain/search"], ["POST", "/tools/send-sms"], ["GET", "/mail/accounts"], ["POST", "/mail/sync"], ["GET", "/brain/tagesliste"]]) {
    const a = await rufe(pfad, { method, body: method === "POST" ? {} : undefined });
    assert.deepEqual([a.status, a.daten.art, a.daten.zugang.mit], [200, "anon", "nichts"], `${method} ${pfad}`);
  }
});