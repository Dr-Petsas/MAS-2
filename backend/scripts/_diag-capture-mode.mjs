// Diagnose 16.08.2026: Der Aufnahme-Knopf meldet "kein Termin gewählt".
// Die Doku haengt immer an einem Termin (treatmentIds braucht clientId +
// locationId + appointmentId). /treatment/current filtert die Tagesliste auf
// den Kalender des am Geraet hinterlegten Behandlers (matchCalendarId).
// Frage: an welchen Tagen sieht dieses iPad ueberhaupt Termine?
import "dotenv/config";
import { db } from "../src/firebase.js";
import { getDayAppointments } from "../src/clara/daySchedule.js";
import { matchCalendarId } from "../src/clara/treatmentRecording.js";

const clientId = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";

const devs = await db.collection(`clients/${clientId}/mas_devices`).get();
const aktiv = devs.docs
  .map((d) => d.data() || {})
  .filter((o) => o.lastSeenAtMs && Date.now() - o.lastSeenAtMs < 24 * 3600 * 1000);
const doctorName = aktiv[0]?.doctorName || "";
console.log(`Aktives Geraet heute: ${aktiv[0]?.operatorName || "?"}  doctorName="${doctorName}"\n`);

const iso = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const wt = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

for (let off = -4; off <= 4; off++) {
  const d = new Date();
  d.setDate(d.getDate() + off);
  const tag = iso(d);
  const day = await getDayAppointments(clientId, { date: tag }).catch(() => null);
  if (!day?.ok) {
    console.log(`${wt[d.getDay()]} ${tag}: nicht ladbar (${day?.reason || "?"})`);
    continue;
  }
  const cal = matchCalendarId(day.calendars || [], doctorName);
  const alle = day.appointments || [];
  const meine = cal ? alle.filter((a) => a.calendarId === cal) : alle;
  const heute = off === 0 ? "  <-- HEUTE" : "";
  console.log(
    `${wt[d.getDay()]} ${tag}: ${alle.length} Termine gesamt, davon ${meine.length} auf deinem Kalender${heute}`,
  );
}
process.exit(0);
