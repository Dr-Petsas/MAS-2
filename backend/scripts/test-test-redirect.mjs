// Schnelltest (<1 s, ohne Server) fuer die Testpatient-Umleitung.
//
// Sichert die Lehre aus dem Vorfall vom 27.07.2026 ab: Im Testbetrieb darf
// KEIN Werkzeug schreiben, das nicht ausdruecklich freigegeben ist. Wenn hier
// etwas rot wird, kann ein Testlauf echte Patienten erreichen -> nicht starten.
//
// Aufruf: node scripts/test-test-redirect.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  classifyToolPath, redirectOutbound, runWithTestRedirect, TEST_MARKER,
} from "../src/clara/testRedirect.js";

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("PASS ", name);
  } catch (e) {
    failed += 1;
    console.log("FAIL ", name, "-", e.message);
  }
}

check("Lesendes Werkzeug laeuft", () => {
  assert.equal(classifyToolPath("/tools/day-briefing"), "read");
  assert.equal(classifyToolPath("/tools/search-patient"), "read");
});

check("Umgeleitete Werkzeuge sind genau die zwei Versandwege", () => {
  assert.equal(classifyToolPath("/tools/send-sms"), "redirect");
  assert.equal(classifyToolPath("/tools/delegate-call"), "redirect");
});

check("Schreibende Werkzeuge sind gesperrt", () => {
  for (const p of [
    "/tools/plan-absence", "/tools/absence-approve", "/tools/book-appointment",
    "/tools/book-for-patient", "/tools/recall-approve", "/tools/send-prepared-email",
    "/tools/save-treatment-dictation", "/tools/create-task", "/tools/motive-overwatch",
  ]) {
    assert.equal(classifyToolPath(p), "deny", `${p} muesste gesperrt sein`);
  }
});

check("Unbekanntes Werkzeug ist gesperrt (Kern der Lehre)", () => {
  assert.equal(classifyToolPath("/tools/irgendwas-neues"), "deny");
  assert.equal(classifyToolPath("/tools/"), "deny");
  assert.equal(classifyToolPath(""), "deny");
});

check("JEDE Route aus tools.js ist eingeordnet", () => {
  // Faellt auf, wenn jemand eine Route ergaenzt, ohne sie einzuordnen: sie
  // landet automatisch auf "deny" - das ist gewollt, aber es soll auffallen.
  const src = fs.readFileSync(new URL("../src/routes/tools.js", import.meta.url), "utf8");
  const re = /router\.(?:get|post|put|delete)\(\s*["'`]([^"'`]+)/g;
  const unklar = [];
  let m;
  while ((m = re.exec(src))) {
    if (classifyToolPath(m[1]) === "deny") unklar.push(m[1]);
  }
  // Reine Information: die Liste darf wachsen, aber nie schrumpfen, ohne dass
  // jemand bewusst eine Freigabe erteilt hat.
  console.log(`       (${unklar.length} von ${unklar.length + 32} Routen gesperrt)`);
  assert.ok(unklar.length > 0);
});

check("Ohne Testlauf bleibt alles unveraendert", () => {
  assert.equal(redirectOutbound({ phone: "+4917012345", text: "Hallo" }), null);
});

check("Im Testlauf geht die Nachricht an den Testpatienten", () => {
  runWithTestRedirect(
    { mode: "redirect", target: { phone: "+491700000000", name: "Testpatient" } },
    () => {
      const r = redirectOutbound({
        phone: "+4917012345", text: "Ihr Termin ist morgen.", recipientName: "Frau Thrandorf",
      });
      assert.equal(r.phone, "+491700000000");
      assert.equal(r.recipientName, "Testpatient");
      assert.ok(r.text.startsWith(TEST_MARKER), "Kennzeichnung fehlt");
      assert.ok(r.text.includes("Frau Thrandorf"), "gemeinter Empfaenger fehlt");
      assert.ok(r.text.includes("Ihr Termin ist morgen."), "Text fehlt");
      assert.equal(r.originalPhone, "+4917012345");
    },
  );
});

check("Der Testlauf-Zustand leckt nicht nach draussen", () => {
  runWithTestRedirect({ mode: "redirect", target: { phone: "+49170", name: "T" } }, () => {});
  assert.equal(redirectOutbound({ phone: "+4917012345", text: "Hallo" }), null);
});

if (failed) {
  console.log(`\nFEHLGESCHLAGEN: ${failed}`);
  process.exit(1);
}
console.log("\nTestpatient-Umleitung: alle Pruefungen bestanden.");
