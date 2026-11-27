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

test("dieser Rechner bleibt, wie er ist", async () => {
  for (const [method, pfad] of [["GET", "/brain/search"], ["POST", "/tools/send-sms"], ["GET", "/mail/accounts"], ["POST", "/mail/sync"], ["GET", "/brain/tagesliste"]]) {
    const a = await rufe(pfad, { method, body: method === "POST" ? {} : undefined });
    assert.deepEqual([a.status, a.daten.art, a.daten.zugang.mit], [200, "anon", "nichts"], `${method} ${pfad}`);
  }
});