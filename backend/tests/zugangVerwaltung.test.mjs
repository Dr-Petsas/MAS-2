// Verwaltungspfade und das Starten des Aufraeumens gehen nie ohne Nachweis, auch wenn die Anmeldung sonst nicht
// erzwungen ist. Schreibt und loescht nichts: jede Anfrage endet an der Ablehnung.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.MAS_REQUIRE_AUTH = "0";
delete process.env.MAS_SERVICE_TOKEN;

const CID = "zzz-mas2-zugang";
const { default: admin } = await import("../src/firebase.js");
const { authMiddleware, AUTH_ENFORCED } = await import("../src/auth.js");
const { nurAngemeldet } = await import("../src/routes/_shared.js");
const { default: miscRouter } = await import("../src/routes/misc.js");
const { default: brainRouter } = await import("../src/routes/brain.js");
const app = express();
app.use(express.json());
app.use(authMiddleware());
app.use(miscRouter);
app.use(brainRouter);
const srv = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });

async function rufe(pfad, { method = "GET", body, kopf = {} } = {}) {
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${pfad}`, {
    method, headers: { "Content-Type": "application/json", "X-Client-Id": CID, ...kopf }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, daten: await r.json().catch(() => ({})) };
}

test.after(async () => {
  srv.close();
  await admin.app().delete().catch(() => {});
});

test("ohne Anmeldung abgelehnt: alles herunterladen, alles loeschen, aufraeumen", async () => {
  assert.equal(AUTH_ENFORCED, false);
  const faelle = [
    ["GET", "/admin/tenant/export"],
    ["GET", "/admin/tenant/export?includeSecrets=1"],
    ["GET", "/Admin/Tenant/Export"],
    ["GET", "/admin/tenant/export/"],
    ["POST", "/admin/tenant/erase"],
    ["POST", "/admin/tenant/retention"],
    ["POST", "/brain/retention/run"],
    ["POST", "/BRAIN/retention/run/"],
  ];
  for (const [method, pfad] of faelle) {
    const a = await rufe(pfad, { method, body: method === "POST" ? {} : undefined });
    assert.deepEqual([a.status, a.daten.grund], [401, "anmeldung_noetig"], `${method} ${pfad}`);
  }
  // Ein abgelaufener oder erfundener Nachweis zaehlt nicht, ein unbekannter Schluessel auch nicht.
  const falsch = await rufe("/admin/tenant/export", { kopf: { Authorization: "Bearer nicht-echt" } });
  assert.equal(falsch.status, 401);
  const schluessel = await rufe("/brain/retention/run", { method: "POST", body: {}, kopf: { "X-Service-Token": "irgendwas" } });
  assert.equal(schluessel.status, 401);
});

test("nurAngemeldet: Nutzer und Dienst gehen durch, alles andere nicht", () => {
  const antwort = () => { const r = { code: 0, status(c) { r.code = c; return r; }, json() { return r; } }; return r; };
  for (const art of ["user", "service"]) {
    const res = antwort();
    assert.equal(nurAngemeldet({ auth: { kind: art } }, res), true, art);
    assert.equal(res.code, 0);
  }
  for (const art of ["anon", "public", undefined]) {
    const res = antwort();
    assert.equal(nurAngemeldet({ auth: art ? { kind: art } : undefined }, res), false, String(art));
    assert.equal(res.code, 401);
  }
});

test("andere Pfade bleiben, wie sie sind", async () => {
  const gesund = await rufe("/health");
  assert.equal(gesund.status, 200);
});