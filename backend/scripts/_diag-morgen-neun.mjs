// Diagnose 28.07. 16:38: Warum war morgen 09:00 fuer Lisa "nicht mehr verfuegbar",
// obwohl der Luecken-Scan 09:00-11:15 als frei zeigte?
import "dotenv/config";
import { getDayAppointments } from "../src/clara/daySchedule.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const CAL = "zex5bmv5jfIHWVW6zHbg";

const day = await getDayAppointments(clientId, { date: "2026-07-29", includeVirtual: true }).catch((e) => ({ ok: false, err: String(e) }));
if (!day.ok) { console.log("Fehler:", day.err || JSON.stringify(day)); process.exit(0); }
console.log(`Termine 29.07. gesamt: ${day.appointments.length}`);
for (const a of day.appointments) {
  const start = new Date(a.startMs).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  const end = new Date(a.endMs || a.startMs).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  console.log(`${start}-${end} | cal=${a.calendarId === CAL ? "PETSAS" : (a.calendarId || "praxisweit")} | status=${a.status || "-"} | absence=${!!a.isAbsence} | ${String(a.patientName || a.title || "").slice(0, 40)} | createdBy=${a.createdBy || "-"}`);
}
process.exit(0);
