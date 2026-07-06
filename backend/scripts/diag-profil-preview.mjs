// Diagnose Teil 2: buildProfilePreviewFast + buildEntityProfile direkt
// aufrufen (wie /brain/profile-preview und /brain/profile) und die Kern-
// Felder vergleichen — deckt Vermischung/Leerstellen auf. READ-ONLY.
import "dotenv/config";
import { buildProfilePreviewFast, buildEntityProfile } from "../src/brain/entityProfile.js";

const cid = "MEe4ZQHEzOPzLcexyhdT";
const cases = [
  { pid: "5viR6kC9WsUWLgSWtD6M", firstName: "Kiriakos", lastName: "Tzannis" },
  { pid: "J4GIpZOSRHdhuk0JGyYa", firstName: "Andrea", lastName: "Sablon" },
  { pid: "sHmpjp5zCE5DvihCK16e", firstName: "Andreza", lastName: "Queiroz" },
];

const fmt = (a) => (a ? `${new Date(a.startMs).toISOString().slice(0, 16)} ${a.visitMotive || ""} (${a.calendarName || "?"})` : "—");

for (const c of cases) {
  const t0 = Date.now();
  const prev = await buildProfilePreviewFast(cid, c.pid ? { patientId: c.pid, firstName: c.firstName, lastName: c.lastName } : {});
  const t1 = Date.now();
  console.log(`\n===== ${c.firstName} ${c.lastName} =====`);
  console.log(`preview (${t1 - t0} ms):`);
  console.log(`  phone=${prev.phone || "—"}  behandler=${prev.behandler?.name || "—"}`);
  console.log(`  last=${prev.lastAppointment ? fmt(prev.lastAppointment) : "—"}`);
  console.log(`  next=${prev.nextAppointment ? fmt(prev.nextAppointment) : "—"}`);
  console.log(`  anamneseFlags=${prev.anamneseCount}  hasAnamnese=${prev.hasAnamnese}`);

  const t2 = Date.now();
  const prof = await buildEntityProfile(cid, { patientId: c.pid, name: `${c.firstName} ${c.lastName}` });
  const t3 = Date.now();
  console.log(`profile (${t3 - t2} ms): ok=${prof.ok}`);
  if (prof.ok) {
    console.log(`  patient.name=${prof.patient?.name}  behandler=${prof.behandler?.name || "—"}`);
    console.log(`  termine: past=${prof.appointments?.past?.length ?? 0} upcoming=${prof.appointments?.upcoming?.length ?? 0} count=${prof.appointments?.count}`);
    console.log(`  last=${prof.appointments?.last ? fmt(prof.appointments.last) : "—"}  next=${prof.appointments?.next ? fmt(prof.appointments.next) : "—"}`);
    console.log(`  anamnese findings=${prof.anamnese?.findings?.length}`);
    console.log(`  memory events=${prof.stats?.eventCount ?? "?"} cases=${prof.stats?.caseCount ?? "?"}`);
  } else {
    console.log(`  reason=${prof.reason}`);
  }
}
process.exit(0);
