// Timing-Zerlegung von buildProfilePreviewFast fuer einen Patienten. READ-ONLY.
import "dotenv/config";
import { getPatientAnamnese } from "../src/clara/anamnese.js";
import { getPatientAppointments } from "../src/clara/daySchedule.js";

const cid = "MEe4ZQHEzOPzLcexyhdT";
const pid = process.argv[2] || "5viR6kC9WsUWLgSWtD6M"; // Kiriakos Tzannis

let t = Date.now();
const appts = await getPatientAppointments(cid, { patientId: pid });
console.log(`getPatientAppointments: ${Date.now() - t} ms (count=${appts.count})`);

t = Date.now();
const ana = await getPatientAnamnese(cid, { patientId: pid });
console.log(`getPatientAnamnese:     ${Date.now() - t} ms (hasAnamnese=${ana.hasAnamnese}, ausPdf=${ana.ausPdf}, findings=${ana.findings?.length})`);

t = Date.now();
const ana2 = await getPatientAnamnese(cid, { patientId: pid });
console.log(`getPatientAnamnese #2:  ${Date.now() - t} ms (Cache?)`);
process.exit(0);
