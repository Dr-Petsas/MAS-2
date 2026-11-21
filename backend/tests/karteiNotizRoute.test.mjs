// Memo in die Karteikarte (Chef 14.11.2026): erst vorlesen, nach dem Ja genau diesen Text fuer genau diesen
// Patienten ins eingestellte Praxisprogramm. PlanR ist ein lokaler Nachbau.
import "dotenv/config";
process.env.MAS_HKP_FACH ??= "0";
process.env.MAS_HKP_MUND ??= "0";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

const CID = "zzz-mas2-karteinotiz";
process.env.PLANR_HKP_KEY = "k";
const geschrieben = [];
let fehler = null;

const planr = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://planr");
  let roh = "";
  for await (const c of req) roh += c;
  const senden = (status, d) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  if (req.headers["x-planr-key"] !== "k" || u.searchParams.get("clientId") !== CID) return senden(401, { ok: false });
  if (u.pathname === "/api/intern/pvs/patienten") {
    return senden(200, { ok: true, patienten: [{ id: "4711", vorname: "Helga", name: "Appler", geburtsdatum: "1950-02-03" }] });
  }
  if (u.pathname === "/api/intern/pvs/doku" && req.method === "POST") {
    if (fehler) return senden(422, { ok: false, pvs: "CGM Z1", meldung: fehler });
    geschrieben.push(JSON.parse(roh));
    return senden(200, { ok: true, pvs: "DENSoffice", patient: "4711" });
  }
  return senden(404, { ok: false });
});
await new Promise((r) => planr.listen(0, "127.0.0.1", r));
process.env.PLANR_URL = `http://127.0.0.1:${planr.address().port}`;

const { _setBillingLaden } = await import("../src/hkp/planrClara.js");
_setBillingLaden(async () => ({ subscriptions: { planr: { enabled: true, sprachsteuerung: true } } }));
const { default: router } = await import("../src/routes/hkp.js");

const app = express();
app.use(express.json());
app.use(router);
const mas = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });

async function rufe(body) {
  const r = await fetch(`http://127.0.0.1:${mas.address().port}/tools/kartei-notiz`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": CID }, body: JSON.stringify({ name: "Helga Appler", ...body }),
  });
  return r.json();
}

test.after(() => {
  _setBillingLaden(null);
  mas.close();
  planr.close();
});

test("ohne Text fragt das Werkzeug nach dem Inhalt", async () => {
  const r = await rufe({});
  assert.match(r.message, /Was soll ich bei Helga Appler, geboren 03\.02\.1950 in die Kartei schreiben\?/);
  assert.equal(geschrieben.length, 0);
});

test("erst vorlesen, dann nach dem Ja genau diesen Text schreiben", async () => {
  // Ein bestaetigt ohne vorherige Vorschau schreibt nichts
  const vorschnell = await rufe({ text: "braucht PAR", bestaetigt: true });
  assert.equal(vorschnell.geschrieben, false);
  assert.match(vorschnell.message, /Für Helga Appler, geboren 03\.02\.1950 schreibe ich in die Kartei: braucht PAR Soll ich das so eintragen\?/);
  assert.equal(vorschnell.patient_nummer, "4711");
  assert.equal(geschrieben.length, 0);

  // Anderer Text mit Ja: neue Vorschau statt Schreiben
  const anders = await rufe({ text: "braucht PAR und PZR", bestaetigt: true });
  assert.equal(anders.geschrieben, false);
  assert.equal(geschrieben.length, 0);

  const ja = await rufe({ text: "braucht  PAR und PZR", bestaetigt: true });
  assert.equal(ja.geschrieben, true, ja.message);
  assert.equal(ja.message, "Eingetragen in DENSoffice bei Helga Appler: braucht PAR und PZR");
  assert.equal(geschrieben.length, 1);
  assert.equal(geschrieben[0].patient, "4711");
  assert.equal(geschrieben[0].text, "braucht PAR und PZR");

  // Dasselbe Ja noch einmal schreibt nicht doppelt
  const nochmal = await rufe({ text: "braucht PAR und PZR", bestaetigt: true });
  assert.equal(nochmal.geschrieben, false);
  assert.equal(geschrieben.length, 1);
});

test("lehnt das Praxisprogramm ab, sagt das Werkzeug ehrlich, dass nichts eingetragen ist", async () => {
  fehler = "CGM Z1: Der Text ist zu lang (höchstens 8 Zeilen mit 60 Zeichen).";
  await rufe({ text: "langer Text" });
  const r = await rufe({ text: "langer Text", bestaetigt: true });
  fehler = null;
  assert.equal(r.geschrieben, false);
  assert.match(r.message, /^Das ist nicht eingetragen\. CGM Z1: Der Text ist zu lang/);
});
