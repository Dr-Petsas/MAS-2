import "dotenv/config";
import { listAccounts } from "../src/mail/accounts.js";
import { sendMail } from "../src/mail/mailbox.js";

// Einmalige Zustellung der STT-Test- und Fernsteuerungs-Links an Dr. Petsas.
const clientId = process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const to = "dr.petsas@pickadoc.de";
const sttUrl = "http://127.0.0.1:8150";
const chatUrl = "https://mas-fernsteuerung.web.app";

const accounts = await listAccounts(clientId);
const acc = accounts.find((a) => a.enabled !== false && a.smtp?.host) || accounts[0];
if (!acc?.id) {
  console.error("Kein Mailkonto fuer", clientId);
  process.exit(1);
}

const subject = "STT-Testseite + Fernsteuerung — Links (heute)";
const text = `Guten Tag Dr. Petsas,

hier die beiden Links fuer heute:

1) STT-Bench (Spracherkennung testen, Aufnahmen speichern)
   ${sttUrl}
   - Mikro: Aufnahme starten/stoppen
   - Jede Live-Aufnahme wird automatisch als WAV gespeichert (Ordner recordings)
   - Pro STT-Modell einzeln transkribieren

2) MAS Fernsteuerung (Auftraege an den Agenten / Chat)
   ${chatUrl}
   - Auftraege eingeben, Antworten vom Agenten lesen

Voraussetzung: Der Praxisrechner laeuft (MAS-Backend + STT-Bench gestartet).

Viele Gruesse
Pickadoc / MAS`;

const out = await sendMail(clientId, acc.id, { to: [to], subject, text });
console.log(JSON.stringify({ ok: out.ok, account: acc.label || acc.email, to, ...out }, null, 2));
process.exit(out.ok ? 0 : 1);
