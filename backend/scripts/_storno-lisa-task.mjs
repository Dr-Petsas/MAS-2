// Storno 14.08.2026 20:4x: Testlauf ausserhalb der Anrufzeiten hatte einen
// ECHTEN Anruf an Frau El-Otmani fuer Samstag 09:00 eingeplant (L4-Fenster).
// Chef-Entscheid: stornieren, bevor der Sweep ihn Samstagfrueh startet.
import "dotenv/config";
import { masCollection } from "../src/tenant.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const taskId = process.argv[2] || "Q2uoz6AJk6BEquDEUkFL";

const ref = masCollection(clientId, "mas_lisa_tasks").doc(taskId);
const t = await ref.get();
if (!t.exists) { console.log("Task fehlt:", taskId); process.exit(1); }
const d = t.data();
console.log("Vorher:", { status: d.status, phone: d.phone, contactName: d.contactName,
  scheduledForMs: d.scheduledForMs, prompt: String(d.prompt || "").slice(0, 120) });
if (d.status !== "scheduled") {
  console.log("Nicht mehr 'scheduled' -> kein Storno noetig/moeglich.");
  process.exit(0);
}
await ref.update({
  status: "cancelled",
  outcome: "cancelled",
  resultSummary: "Storniert vor Ausfuehrung: Testlauf vom 14.08. abends, Chef-Entscheid.",
  cancelledAtMs: Date.now(),
});
const nach = (await ref.get()).data();
console.log("Nachher:", { status: nach.status, outcome: nach.outcome });
process.exit(0);
