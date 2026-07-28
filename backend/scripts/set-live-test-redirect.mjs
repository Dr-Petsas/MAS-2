// Livetest-Fenster fuer den Lueckenfueller steuern (28.07.2026).
//
//   node scripts/set-live-test-redirect.mjs day   -> bis Mitternacht Berlin AN
//   node scripts/set-live-test-redirect.mjs 120   -> Fenster fuer 120 Minuten AN
//   node scripts/set-live-test-redirect.mjs off   -> Fenster AUS
//   node scripts/set-live-test-redirect.mjs       -> Status anzeigen
//
// Solange das Fenster laeuft, geht JEDE ausgehende Lisa-Nachricht (Anruf +
// SMS) dieses Mandanten an den Testpatienten (Chef-Handy), und alle
// Buchungswege (Online-Zusage, Sweep, Live-Buchung) buchen den TESTPATIENTEN
// statt des echten Patienten. Hartes Maximum: bis Mitternacht Berlin (Tag)
// bzw. 24 h bei Minutenangabe.

import "dotenv/config";
import { saveTestPatient, loadTestPatient, activeTenantRedirect } from "../src/clara/testRedirect.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const MAX_MINUTES = 24 * 60; // ganzer Tag
// Chef-Handy — alles geht dorthin, solange das Fenster laeuft.
const PETSAS_PHONE = "+491776004600";
const PETSAS_NAME = "Michael Petsassss";
const PETSAS_PATIENT_ID = "demo_petsassss";

/** Ende des heutigen Kalendertags in Europe/Berlin (ms seit Epoch). */
function endOfBerlinDayMs() {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  // 23:59:59.999 Berlin = naechster Tag 00:00 Berlin minus 1 ms.
  // Offset Berlin zur Laufzeit aus einer bekannten lokalen Uhr ableiten.
  const probe = new Date(`${day}T12:00:00Z`);
  const berlinNoon = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(probe);
  const [bh, bm] = berlinNoon.split(":").map(Number);
  // UTC-Zeit, zu der in Berlin 12:00 ist: probe zeigt UTC 12:00, Berlin bh:bm
  // -> Offset-Minuten = (bh*60+bm) - 12*60
  const offsetMin = (bh * 60 + bm) - 12 * 60;
  // Berlin-Mitternacht des Folgetags in UTC:
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
  return next.getTime() - offsetMin * 60000 - 1;
}

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

let liveUntilMs = 0;
let label = "";
if (arg === "day" || arg === "heute" || arg === "tag") {
  liveUntilMs = endOfBerlinDayMs();
  label = "ganzen heutigen Tag (bis Mitternacht Berlin)";
} else {
  const minuten = Math.min(MAX_MINUTES, Math.max(1, Number(arg) || 0));
  if (!minuten) {
    console.error(`Unverstanden: "${arg}" — erwartet "day", Minutenzahl (1-${MAX_MINUTES}) oder "off".`);
    process.exit(1);
  }
  liveUntilMs = Date.now() + minuten * 60000;
  label = `${minuten} Minuten`;
}

// Immer auf Petsas-Handy — Chef 28.07.2026: "alles geht zu Petsas 01776004600".
const doc = await saveTestPatient(clientId, {
  phone: PETSAS_PHONE,
  name: PETSAS_NAME,
  patientId: bestehend?.patientId || PETSAS_PATIENT_ID,
  email: bestehend?.email || "",
  note: "Livetest-Fenster Lueckenfueller — gesamter Tag an Petsas",
  liveUntilMs,
});

console.log(`Livetest-Fenster AN fuer ${label} (bis ${new Date(doc.liveUntilMs).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}).`);
console.log(`Alle Lisa-Anrufe/SMS gehen an: ${doc.name} ${doc.phone}; Buchungen laufen auf patientId=${doc.patientId}.`);
