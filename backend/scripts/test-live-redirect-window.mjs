// Livetest-Fenster (befristete Mandanten-Umleitung, 28.07.2026) — Pins ohne
// jeden Versand. Sichert den Originalzustand von mas_config/test_redirect und
// stellt ihn am Ende byte-gleich wieder her.

import "dotenv/config";
import { masCollection } from "../src/tenant.js";
import { activeTenantRedirect, resolveOutboundRedirect, saveTestPatient, TEST_MARKER } from "../src/clara/testRedirect.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";

let fehler = 0;
function check(was, ok) {
  console.log(`${ok ? "  OK  " : "  FAIL"} ${was}`);
  if (!ok) fehler++;
}

const ref = masCollection(clientId, "mas_config").doc("test_redirect");
const vorher = await ref.get();
const original = vorher.exists ? vorher.data() : null;

try {
  console.log("[1] Fenster AUS -> keine Umleitung");
  await saveTestPatient(clientId, {
    phone: "+491776004600", name: "Michael Petsassss", patientId: "demo_petsassss", liveUntilMs: 0,
  });
  check("activeTenantRedirect -> null", (await activeTenantRedirect(clientId)) === null);
  check("resolveOutboundRedirect -> null (Normalbetrieb)",
    (await resolveOutboundRedirect(clientId, { phone: "+4915112345678", text: "Hallo", recipientName: "Echter Patient" })) === null);

  console.log("[2] Fenster AN -> alles laeuft auf den Testpatienten");
  await saveTestPatient(clientId, {
    phone: "+491776004600", name: "Michael Petsassss", patientId: "demo_petsassss",
    liveUntilMs: Date.now() + 5 * 60000,
  });
  const aktiv = await activeTenantRedirect(clientId);
  check("activeTenantRedirect liefert Testpatient inkl. patientId",
    aktiv?.phone === "+491776004600" && aktiv?.patientId === "demo_petsassss");
  const um = await resolveOutboundRedirect(clientId, { phone: "+4915112345678", text: "Ihr Termin morgen", recipientName: "Echter Patient" });
  check("Nummer umgebogen", um?.phone === "+491776004600");
  check("Text traegt TESTLAUF-Marker + Originalempfaenger",
    um?.text?.startsWith(TEST_MARKER) && um.text.includes("Echter Patient"));
  check("target.patientId fuer Buchungswege dabei", um?.target?.patientId === "demo_petsassss");
  check("mode benennt das Fenster", um?.mode === "tenant_window");

  console.log("[3] Abgelaufenes Fenster -> Normalbetrieb");
  await saveTestPatient(clientId, {
    phone: "+491776004600", name: "Michael Petsassss", patientId: "demo_petsassss",
    liveUntilMs: Date.now() - 1000,
  });
  check("abgelaufen -> null", (await activeTenantRedirect(clientId)) === null);
} finally {
  if (original) await ref.set(original);
  else await ref.delete().catch(() => {});
  console.log("[4] Originalzustand von test_redirect wiederhergestellt.");
}

console.log();
if (fehler) {
  console.log(`FAZIT: ${fehler} Pin(s) verletzt.`);
  process.exit(1);
}
console.log("FAZIT: Livetest-Fenster haelt — befristet, markiert, mit Testpatient-Buchungsziel.");
process.exit(0);
