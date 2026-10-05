// Diagnose 28.07.2026: Chef sieht KEINE Anruflisten im Monitor, obwohl
// gap_briefing um 11:05 "Die Anrufliste wartet im Monitor" gesagt hat.
// Liest die juengsten gapfill-Vorgaenge samt Audit-Trail.
import "dotenv/config";
import { masCollection } from "../src/tenant.js";

const C = process.env.MAS_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT";
const snap = await masCollection(C, "mas_cases")
  .orderBy("updatedAt", "desc").limit(25).get();

let n = 0;
for (const d of snap.docs) {
  const c = d.data();
  const isGap = String(d.id).startsWith("gapfill") || c.kind === "gapfill_call_list" || !!c.callList;
  if (!isGap) continue;
  n++;
  const cl = c.callList || {};
  const upd = c.updatedAt?.toDate ? c.updatedAt.toDate().toISOString() : String(c.updatedAt);
  console.log("====", d.id, "status=" + c.status, "updatedAt=" + upd);
  console.log("  date=" + cl.date, "fenster=" + (cl.startHHMM || "?") + "-" + (cl.endHHMM || "?"),
    "bucket=" + (cl.bucketLabel || "-"), "kandidaten=" + (cl.candidates || []).length,
    "calId=" + (cl.calendarId || "-"));
  for (const u of (c.updates || []).slice(-5)) {
    const t = u.at?.toDate ? u.at.toDate().toISOString().slice(11, 19) : "";
    console.log("  update", t, (u.text || "").slice(0, 170));
  }
}
if (!n) console.log("KEINE gapfill-Vorgaenge unter den letzten 25 Cases.");
process.exit(0);
