// Einmalige Zuordnung des Altbestands (Buecher/Jobs ohne praxisId) zur bereits
// angelegten Standardpraxis. Noetig, weil "Praxis 1" vor Einfuehrung des
// Backfill-Hooks geseedet wurde. Danach starten neue Praxen leer.
//
//   node scripts/backfill-praxis-scope.mjs [clientId]
import "dotenv/config";
import { listPraxen, backfillPraxisId, resolveActivePraxisId } from "../src/qm/praxis.js";

const clientId = process.argv[2] || "MEe4ZQHEzOPzLcexyhdT";

const { praxen, activePraxisId } = await listPraxen(clientId);
const pid = activePraxisId || (await resolveActivePraxisId(clientId)) || (praxen[0] && praxen[0].id);
if (!pid) { console.error("Keine Praxis gefunden fuer", clientId); process.exit(1); }

const name = (praxen.find((p) => p.id === pid) || {}).name || pid;
const res = await backfillPraxisId(clientId, pid);
console.log(`Backfill fuer ${clientId} -> Praxis "${name}" (${pid}):`, res);
process.exit(0);
