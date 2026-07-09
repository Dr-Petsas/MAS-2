// End-zu-End-Diagnose: ruft getPatientAppointments + buildProfilePreviewFast
// GENAU wie der /brain/profile-Endpunkt auf — zeigt, was das MAS-Profil
// wirklich sieht (inkl. booking.locationId). READ-ONLY.
import "dotenv/config";
import { loadBooking } from "../src/clara/booking.js";
import { getPatientAppointments } from "../src/clara/daySchedule.js";

const cid = "MEe4ZQHEzOPzLcexyhdT";
const cases = [
  { pid: "5viR6kC9WsUWLgSWtD6M", firstName: "Kiriakos", lastName: "Tzannis" },
  { pid: "J4GIpZOSRHdhuk0JGyYa", firstName: "Andrea", lastName: "Sablon" },
  { pid: "sHmpjp5zCE5DvihCK16e", firstName: "Andreza", lastName: "Queiroz" },
];

const booking = await loadBooking(cid).catch((e) => ({ err: String(e) }));
console.log("booking.clientId  =", booking?.clientId);
console.log("booking.locationId =", booking?.locationId);

for (const c of cases) {
  const r = await getPatientAppointments(cid, { patientId: c.pid, firstName: c.firstName, lastName: c.lastName });
  const fmt = (a) => (a ? `${new Date(a.startMs).toISOString().slice(0, 16)} (${a.visitMotive || "—"})` : "—");
  console.log(`\n${c.firstName} ${c.lastName} (${c.pid}):`);
  console.log(`  ok=${r.ok} count=${r.count ?? "—"} reason=${r.reason || "—"}`);
  console.log(`  past=${r.past?.length ?? 0}  upcoming=${r.upcoming?.length ?? 0}`);
  console.log(`  last=${fmt(r.last)}  next=${fmt(r.next)}`);
}
process.exit(0);
