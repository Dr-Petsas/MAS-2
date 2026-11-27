// Zugang zum Kontaktverlauf bei erzwungener Anmeldung (MAS_REQUIRE_AUTH=1): die beiden Meldepfade pruefen selbst
// ihren Schluessel, die Auskunft bleibt hinter der Anmeldung. Schreibt nichts (nur Trockenlauf).
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";

process.env.MAS_REQUIRE_AUTH = "1";
const DIENST = randomBytes(32).toString("hex");
process.env.MAS_SERVICE_TOKEN = DIENST;
const SCHLUESSEL = randomBytes(32).toString("hex");
const DATEI = join(tmpdir(), `mas-kontaktverlauf-zugang-${process.pid}.txt`);
writeFileSync(DATEI, SCHLUESSEL);
process.env.MAS_KONTAKT_VERLAUF_SCHLUESSEL_DATEI = DATEI;

const CID = "zzz-mas2-kontaktverlauf";
const { default: admin } = await import("../src/firebase.js");
const { authMiddleware, AUTH_ENFORCED } = await import("../src/auth.js");
const { default: verlaufRouter } = await import("../src/routes/kontaktVerlauf.js");
const app = express();
app.use(express.json());
app.use(authMiddleware());
app.use(verlaufRouter);
const srv = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });

async function rufe(pfad, { method = "GET", body, kopf = {} } = {}) {
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${pfad}`, {
    method, headers: { "Content-Type": "application/json", "X-Client-Id": CID, ...kopf }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, daten: await r.json().catch(() => ({})) };
}

test.after(async () => {
  rmSync(DATEI, { force: true });
  srv.close();
  await admin.app().delete().catch(() => {});
});

test("erzwungene Anmeldung: Meldepfade nur mit dem eigenen Schluessel, die Auskunft nur angemeldet", async () => {
  assert.equal(AUTH_ENFORCED, true);
  const sendung = { trocken: true, kontakt_id: "zugang-1", weg: "sms", zeit: Date.now(), ergebnis: "gesendet", quelle: "luecke", aktion_id: "akt-1",
    patient: { id: "pat-zugang" }, standort: "ort-1" };
  const reaktion = { trocken: true, art: "antwort", zeit: Date.now(), patient_id: "pat-zugang-niemand" };
  for (const [pfad, body] of [["sendung", sendung], ["reaktion", reaktion]]) {
    const ohne = await rufe(`/brain/kontakt-verlauf/${pfad}`, { method: "POST", body });
    assert.deepEqual([ohne.status, ohne.daten.grund], [401, "schluessel_ungueltig"], `${pfad} ohne Schluessel`);
    // Der allgemeine Dienstschluessel des MAS oeffnet die Meldepfade nicht.
    const dienst = await rufe(`/brain/kontakt-verlauf/${pfad}`, { method: "POST", body, kopf: { "X-Service-Token": DIENST } });
    assert.deepEqual([dienst.status, dienst.daten.grund], [401, "schluessel_ungueltig"], `${pfad} mit dem Dienstschluessel`);
    const mit = await rufe(`/brain/kontakt-verlauf/${pfad}`, { method: "POST", body, kopf: { "X-Service-Token": SCHLUESSEL } });
    assert.deepEqual([mit.status, mit.daten.ok], [200, true], `${pfad} mit Schluessel`);
  }

  // Die Auskunft ist kein Meldepfad: ohne Anmeldung abgewiesen, der Schluessel der Meldungen oeffnet sie nicht.
  const offen = await rufe("/brain/kontakt-verlauf?eintraege=0");
  assert.deepEqual([offen.status, offen.daten.error], [401, "unauthenticated"]);
  const mitMelde = await rufe("/brain/kontakt-verlauf?eintraege=0", { kopf: { "X-Service-Token": SCHLUESSEL } });
  assert.equal(mitMelde.status, 401);
  // Ein anderer Pfad unter demselben Anfang und die falsche Methode sind nicht freigestellt.
  assert.equal((await rufe("/brain/kontakt-verlauf/sendung")).status, 401);
  assert.equal((await rufe("/brain/kontakt-verlauf/anderes", { method: "POST", body: {} })).status, 401);
});