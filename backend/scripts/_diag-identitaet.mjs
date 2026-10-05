// Live-Probe 28.07.: loest loadPraxisIdentitaet Name/Telefon/Adresse auf?
import "dotenv/config";
import { loadPraxisIdentitaet } from "../src/clara/booking.js";
import { composeRecallCallInstruction } from "../src/clara/outreachTemplates.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const i = await loadPraxisIdentitaet(clientId);
console.log("Identitaet:", JSON.stringify(i));

const instr = composeRecallCallInstruction({
  practiceName: i.name, practicePhone: i.phone, practiceAddress: i.addressLine,
  patientName: "Elisabeth Xanthopoulou", date: "2026-07-29", timeLabel: "09:00",
  calendarName: "Dr. Petsas", visitMotiveName: "ZE Eingliederung groß",
  overdueDays: 1700, source: "recall", liveBooking: true,
});
console.log("--- Instruktion (Auszug Einwand-Block):");
const idx = instr.indexOf("erwartet diesen Anruf nicht");
console.log(idx >= 0 ? instr.slice(idx - 30, idx + 700) : "EINWAND-BLOCK FEHLT!");
console.log(`--- Laenge: ${instr.length}`);
process.exit(0);
