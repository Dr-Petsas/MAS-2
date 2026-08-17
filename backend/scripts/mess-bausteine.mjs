/**
 * Welcher Baustein kostet die Zeit? Einzelmessung der Lese-Schritte hinter
 * asap-queue und nadine-briefing (nur lesend).
 *
 * Aufruf: node backend/scripts/mess-bausteine.mjs
 */
import "dotenv/config";

import "../src/firebase.js";
import { listMessages } from "../src/mail/store.js";
import { listCases } from "../src/brain/caseStore.js";
import { queryRecent } from "../src/brain/eventStore.js";
import { buildRedList } from "../src/brain/redList.js";
import { findePraxisLuecken } from "../src/clara/dokuWaechter.js";
import { gapFillOverview } from "../src/clara/gapFill.js";
import { buildMailBriefing } from "../src/mail/briefing.js";
import { loadBooking } from "../src/clara/booking.js";
import { getDayAppointments } from "../src/clara/daySchedule.js";

const CLIENT = process.env.MESS_CLIENT || "MEe4ZQHEzOPzLcexyhdT";

async function mess(name, fn) {
    const t0 = Date.now();
    try {
        const r = await fn();
        const menge = Array.isArray(r) ? `${r.length} Eintraege`
            : r?.luecken ? `${r.luecken.length} Luecken`
                : r?.appointments ? `${r.appointments.length} Termine`
                    : typeof r === "object" && r ? Object.keys(r).slice(0, 4).join(",") : String(r);
        console.log(`${name.padEnd(34)} ${String(Date.now() - t0).padStart(6)} ms   ${menge}`);
    } catch (e) {
        console.log(`${name.padEnd(34)} ${String(Date.now() - t0).padStart(6)} ms   FEHLER ${String(e?.message || e).slice(0, 60)}`);
    }
}

console.log(`Mandant ${CLIENT}\n--- nadine-briefing`);
await mess("listMessages INBOX 150", () => listMessages(CLIENT, { folder: "INBOX", limit: 150 }));
await mess("listMessages INBOX 30", () => listMessages(CLIENT, { folder: "INBOX", limit: 30 }));
await mess("listCases Nadine 200", () => listCases(CLIENT, { assignee: "Nadine", activeOnly: true, limit: 200 }));
await mess("buildMailBriefing gesamt", () => buildMailBriefing(CLIENT, {}));

console.log("\n--- asap-queue");
await mess("buildRedList", () => buildRedList(CLIENT));
await mess("queryRecent 48h/800", () => queryRecent(CLIENT, Date.now() - 48 * 3600e3, 800));
await mess("findePraxisLuecken 7 Tage", () => findePraxisLuecken(CLIENT, { tageZurueck: 7 }));
await mess("gapFillOverview", () => gapFillOverview(CLIENT));
await mess("loadBooking", () => loadBooking(CLIENT));
await mess("getDayAppointments heute", () => getDayAppointments(CLIENT, {}));

console.log("\n--- zweiter Lauf (warm)");
await mess("listMessages INBOX 150", () => listMessages(CLIENT, { folder: "INBOX", limit: 150 }));
await mess("findePraxisLuecken 7 Tage", () => findePraxisLuecken(CLIENT, { tageZurueck: 7 }));
await mess("buildRedList", () => buildRedList(CLIENT));
process.exit(0);
