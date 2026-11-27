// Weiterleitung /lisa-v8/* zur Auftragsannahme von Lisa V8: nur vier Pfade, Kopf und Koerper unveraendert.
// Lisa ist hier ein kleiner Server auf diesem Rechner; es geht nichts ins Netz.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

const gesehen = [];
const lisa = http.createServer((req, res) => {
  const teile = [];
  req.on("data", (t) => teile.push(t));
  req.on("end", () => {
    const koerper = Buffer.concat(teile).toString("utf8");
    gesehen.push({ methode: req.method, url: req.url, kopf: req.headers, koerper });
    if (req.url === "/langsam") return; // antwortet nie
    if (req.url === "/gesund") { res.writeHead(200, { "content-type": "application/json" }); return res.end('{"ok":true}'); }
    if (req.headers.authorization !== "Bearer geheim") { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"error":"schluessel"}'); }
    res.writeHead(req.method === "POST" ? 202 : 200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ angenommen: true, echo: koerper }));
  });
});
await new Promise((ok) => lisa.listen(0, "127.0.0.1", ok));
process.env.LISA_V8_BASIS = `http://127.0.0.1:${lisa.address().port}/`;
process.env.LISA_V8_PROXY_ZEITGRENZE_MS = "400";

const zeilen = [];
const echt = process.stdout.write.bind(process.stdout);
const echtFehler = process.stderr.write.bind(process.stderr);
process.stdout.write = (s, ...r) => { zeilen.push(String(s)); return echt(s, ...r); };
process.stderr.write = (s, ...r) => { zeilen.push(String(s)); return echtFehler(s, ...r); };

const { default: lisaV8Proxy, zielPfad } = await import("../src/routes/lisaV8Proxy.js");
const app = express();
app.use("/lisa-v8", lisaV8Proxy);
app.use(express.json());
app.use((req, res) => res.status(418).end());
const mas = http.createServer(app);
await new Promise((ok) => mas.listen(0, "127.0.0.1", ok));
const MAS = `http://127.0.0.1:${mas.address().port}`;

test.after(() => { process.stdout.write = echt; process.stderr.write = echtFehler; lisa.closeAllConnections(); lisa.close(); mas.closeAllConnections(); mas.close(); });

test("nur vier Pfade sind zugelassen", () => {
  assert.equal(zielPfad("GET", "/gesund"), "/gesund");
  assert.equal(zielPfad("POST", "/anruf"), "/anruf");
  assert.equal(zielPfad("POST", "/api/outbound/dial"), "/api/outbound/dial");
  assert.equal(zielPfad("GET", "/anruf/ab-12_Cd"), "/anruf/ab-12_Cd");
  for (const [m, p] of [["POST", "/gesund"], ["GET", "/anruf"], ["GET", "/api/outbound/dial"], ["DELETE", "/anruf/ab"], ["POST", "/anruf/ab"],
    ["GET", "/anruf/"], ["GET", "/anruf/a/b"], ["GET", "/anruf/..%2Fgeheim"], ["GET", "/anruf/a.b"], ["GET", "/"], ["GET", "/zustand"],
    ["POST", "/api/outbound/dial/"], ["GET", "/Gesund"], ["PUT", "/anruf"]]) {
    assert.equal(zielPfad(m, p), "", `${m} ${p}`);
  }
});

test("gesund geht ohne Schluessel durch", async () => {
  const r = await fetch(`${MAS}/lisa-v8/gesund`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test("Methode, Pfad, Abfrage, Koerper und Authorization kommen unveraendert an", async () => {
  const koerper = '{"nummer":"+491700000302",  "text":"Grüße"}';
  const r = await fetch(`${MAS}/lisa-v8/api/outbound/dial?probe=1`, {
    method: "POST", headers: { Authorization: "Bearer geheim", "Content-Type": "application/json" }, body: koerper,
  });
  assert.equal(r.status, 202);
  assert.equal((await r.json()).echo, koerper);
  const g = gesehen.at(-1);
  assert.equal(g.methode, "POST");
  assert.equal(g.url, "/api/outbound/dial?probe=1");
  assert.equal(g.kopf.authorization, "Bearer geheim");
  assert.equal(g.koerper, koerper);
  const r2 = await fetch(`${MAS}/lisa-v8/anruf/abc-123`, { headers: { Authorization: "Bearer geheim", Cookie: "x=1", "X-Service-Token": "mas" } });
  assert.equal(r2.status, 200);
  assert.equal(gesehen.at(-1).url, "/anruf/abc-123");
  assert.equal(gesehen.at(-1).kopf.cookie, undefined);
  assert.equal(gesehen.at(-1).kopf["x-service-token"], undefined);
});

test("Lisas 401 ohne Schluessel kommt als 401 zurueck", async () => {
  const r = await fetch(`${MAS}/lisa-v8/api/outbound/dial`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(r.status, 401);
  const r2 = await fetch(`${MAS}/lisa-v8/anruf`, { method: "POST", headers: { Authorization: "Bearer falsch" }, body: "{}" });
  assert.equal(r2.status, 401);
});

test("alles andere ist 404 und erreicht Lisa nicht", async () => {
  const vorher = gesehen.length;
  for (const [m, p] of [["GET", "/lisa-v8/zustand"], ["DELETE", "/lisa-v8/anruf/abc"], ["GET", "/lisa-v8/"], ["POST", "/lisa-v8/gesund"], ["GET", "/lisa-v8/anruf/a/b"]]) {
    const r = await fetch(`${MAS}${p}`, { method: m });
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  assert.equal(gesehen.length, vorher);
});

test("Zeitgrenze: 504, nicht erreichbar: 502", async () => {
  const alt = process.env.LISA_V8_BASIS;
  const langsam = http.createServer(() => {});
  await new Promise((ok) => langsam.listen(0, "127.0.0.1", ok));
  process.env.LISA_V8_BASIS = `http://127.0.0.1:${langsam.address().port}`;
  const r = await fetch(`${MAS}/lisa-v8/gesund`);
  assert.equal(r.status, 504);
  langsam.closeAllConnections(); langsam.close();
  process.env.LISA_V8_BASIS = "http://127.0.0.1:1";
  const r2 = await fetch(`${MAS}/lisa-v8/gesund`);
  assert.equal(r2.status, 502);
  process.env.LISA_V8_BASIS = alt;
});

test("im Log stehen weder Schluessel noch Koerper noch Abfrage", async () => {
  await fetch(`${MAS}/lisa-v8/anruf?geheimnis=abfrage77`, { method: "POST", headers: { Authorization: "Bearer geheim", "Content-Type": "application/json" }, body: '{"nummer":"+4917611112222"}' });
  await new Promise((ok) => setTimeout(ok, 50));
  const log = zeilen.join("");
  assert.ok(log.includes("/lisa-v8/anruf"), "Zugriff steht im Log");
  for (const wort of ["geheim", "Bearer", "+4917611112222", "abfrage77", "+491700000302"]) assert.equal(log.includes(wort), false, wort);
});

test("auth.js fuehrt /lisa-v8/ als oeffentlich", async () => {
  const quelle = (await import("node:fs")).readFileSync(new URL("../src/auth.js", import.meta.url), "utf8");
  assert.ok(quelle.includes('p.startsWith("/lisa-v8/")'));
});