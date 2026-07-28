// Livetest-Fenster fuer den Lueckenfueller steuern (28.07.2026).
//
//   node scripts/set-live-test-redirect.mjs 120   -> Fenster fuer 120 Minuten AN
//   node scripts/set-live-test-redirect.mjs off   -> Fenster AUS
//   node scripts/set-live-test-redirect.mjs       -> Status anzeigen
//
// Solange das Fenster laeuft, geht JEDE ausgehende Lisa-Nachricht (Anruf +
// SMS) dieses Mandanten an den Testpatienten (Chef-Handy), und alle
// Buchungswege (Online-Zusage, Sweep, Live-Buchung) buchen den TESTPATIENTEN
// statt des echten Patienten. Hartes Maximum: 240 Minuten.

import "dotenv/config";
import { saveTestPatient, loadTestPatient, activeTenantRedirect } from "../src/clara/testRedirect.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const MAX_MINUTES = 240;

const arg = String(process.argv[2] || "").trim().toLowerCase();

const bestehend = await loadTestPatient(clientId);

if (!arg) {
  const aktiv = await activeTenantRedirect(clientId);
  console.log("Testpatient:", bestehend
    ? `${bestehend.name} (${bestehend.phone}, patientId=${bestehend.patientId || "—"})`
    : "(keiner hinterlegt)");
  console.log("Livetest-Fenster:", aktiv
    ? `AKTIV bis ${new Date(aktiv.liveUntilMs).toLocaleString("de-DE")}`
    : "aus");
  process.exit(0);
}

if (arg === "off" || arg === "aus" || arg === "0") {
  await saveTestPatient(clientId, { ...(bestehend || {}), liveUntilMs: 0 });
  console.log("Livetest-Fenster AUS — Normalbetrieb.");
  process.exit(0);
}

const minuten = Math.min(MAX_MINUTES, Math.max(1, Number(arg) || 0));
if (!minuten) {
  console.error(`Unverstanden: "${arg}" — erwartet Minutenzahl (1-${MAX_MINUTES}) oder "off".`);
  process.exit(1);
}

// Ohne hinterlegten Testpatienten waere das Fenster wirkungslos — Standard:
// Testpatient Michael Petsassss mit der Chef-Handynummer (verifiziert 28.07.).
const doc = await saveTestPatient(clientId, {
  phone: bestehend?.phone || "+491776004600",
  name: bestehend?.name || "Michael Petsassss",
  patientId: bestehend?.patientId || "demo_petsassss",
  email: bestehend?.email || "",
  note: "Livetest-Fenster Lueckenfueller",
  liveUntilMs: Date.now() + minuten * 60000,
});

console.log(`Livetest-Fenster AN fuer ${minuten} Minuten (bis ${new Date(doc.liveUntilMs).toLocaleString("de-DE")}).`);
console.log(`Alle Lisa-Anrufe/SMS gehen an: ${doc.name} ${doc.phone}; Buchungen laufen auf patientId=${doc.patientId}.`);
