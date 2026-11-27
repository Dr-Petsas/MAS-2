// Mitzaehlen des Zugangs: Herkunft, Programm, Seite und die Regel fuer den Tunnel. Rein, ohne Netz und ohne Datenbank.
import test from "node:test";
import assert from "node:assert/strict";
import { herkunft, programm, seite, tunnelLehntAb, uebergang } from "../src/zugang.js";

const anfrage = ({ koepfe = {}, von = "127.0.0.1", method = "GET", path = "/brain/search" } = {}) => ({
  headers: koepfe, socket: { remoteAddress: von }, method, path,
});

test("Herkunft: Tunnel an den Koepfen von Cloudflare, sonst dieser Rechner oder das Praxisnetz", () => {
  assert.equal(herkunft(anfrage()), "lokal");
  assert.equal(herkunft(anfrage({ von: "::1" })), "lokal");
  assert.equal(herkunft(anfrage({ von: "::ffff:127.0.0.1" })), "lokal");
  assert.equal(herkunft(anfrage({ von: "192.168.0.17" })), "netz");
  assert.equal(herkunft(anfrage({ von: "::ffff:192.168.0.17" })), "netz");
  // cloudflared verbindet sich von diesem Rechner aus; entscheidend sind die Koepfe.
  for (const kopf of ["cf-ray", "cf-connecting-ip", "cdn-loop", "x-forwarded-for", "cf-visitor"]) {
    assert.equal(herkunft(anfrage({ koepfe: { [kopf]: "x" } })), "tunnel", kopf);
  }
  assert.equal(herkunft({}), "netz");
});

test("Programm: nur der Produktname", () => {
  const p = (ua) => programm(anfrage({ koepfe: ua === null ? {} : { "user-agent": ua } }));
  assert.equal(p(null), "ohne");
  assert.equal(p("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"), "browser");
  assert.equal(p("Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15"), "browser-ipad");
  assert.equal(p("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)"), "browser-handy");
  assert.equal(p("Mozilla/5.0 (Windows NT; Windows NT 10.0; de-DE) WindowsPowerShell/5.1.26100.1"), "powershell");
  assert.equal(p("python-httpx/0.27.2"), "python-httpx");
  assert.equal(p("Python-urllib/3.12"), "python-urllib");
  assert.equal(p("node"), "node");
  assert.equal(p("curl/8.9.1"), "curl");
  assert.equal(p("  "), "sonst");
});

test("Seite: Rechnername, bei einer Seite des MAS der Dateiname, nie Abfrage oder Kennung", () => {
  const s = (koepfe) => seite(anfrage({ koepfe }));
  assert.equal(s({}), undefined);
  assert.equal(s({ origin: "https://app.example.de" }), "app.example.de");
  assert.equal(s({ referer: "https://mas.pickadoc-tunnel.com/m/clara-start.html?t=geheim&c=praxis" }), "mas.pickadoc-tunnel.com/m/clara-start.html");
  assert.equal(s({ referer: "https://mas.pickadoc-tunnel.com/improve-zentrale.html" }), "mas.pickadoc-tunnel.com/improve-zentrale.html");
  // Pfade mit Kennungen (Praxis, Einmal-Kennung) gehen nicht ins Protokoll.
  assert.equal(s({ referer: "https://mas.pickadoc-tunnel.com/z/abc123/def456" }), "mas.pickadoc-tunnel.com");
  assert.equal(s({ referer: "https://mas.pickadoc-tunnel.com/clara/praxis-kennung/connect?pin=1234" }), "mas.pickadoc-tunnel.com");
  assert.equal(s({ referer: "kein-url" }), undefined);
});

test("Regel fuer den Tunnel: von aussen abgelehnt, ausser auf den vier Pfaden des Uebergangs", () => {
  const tunnel = { "cf-ray": "x" };
  assert.equal(tunnelLehntAb(anfrage({ koepfe: tunnel })), true);
  assert.equal(tunnelLehntAb(anfrage({ koepfe: tunnel, method: "POST", path: "/tools/send-sms" })), true);
  assert.equal(tunnelLehntAb(anfrage()), false, "dieser Rechner");
  assert.equal(tunnelLehntAb(anfrage({ von: "192.168.0.17" })), false, "Praxisnetz");
  for (const [method, path] of [["GET", "/brain/caller-context"], ["POST", "/brain/caller-context/resolve"], ["POST", "/brain/events"], ["POST", "/brain/lisa-anrufe"]]) {
    assert.equal(uebergang(anfrage({ method, path })), true, path);
    assert.equal(tunnelLehntAb(anfrage({ koepfe: tunnel, method, path })), false, path);
  }
  // Andere Methode, anderer Pfad darunter, andere Schreibweise: keine Ausnahme.
  for (const [method, path] of [["POST", "/brain/caller-context"], ["GET", "/brain/events"], ["GET", "/brain/events/abc"], ["GET", "/brain/lisa-anrufe"], ["POST", "/Brain/Events"], ["POST", "/brain/events/"]]) {
    assert.equal(tunnelLehntAb(anfrage({ koepfe: tunnel, method, path })), true, `${method} ${path}`);
  }
});