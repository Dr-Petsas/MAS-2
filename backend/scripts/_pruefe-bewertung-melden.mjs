// ============================================================================
// Bewertungs-Meldekette pruefen (30.08.2026) — NUR LESEND.
//
//   1. Liest spokenRatings: kommen jetzt die Kommentartexte mit (comment-Fix)?
//   2. Baut die ASAP-Queue: taucht die Quelle "bewertung" auf (48-h-Fenster)?
//   3. Zeigt, was die letzten 7 Tage gemeldet worden WAEREN (Simulation der
//      Fenster-Logik, ohne Push).
//
//   node scripts/_pruefe-bewertung-melden.mjs
// ============================================================================
import "dotenv/config";
import admin from "../src/firebase.js";
import { spokenRatings, recentRatings } from "../src/clara/ratings.js";
import { buildAsapQueue } from "../src/clara/asapQueue.js";

const CLIENT_ID = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();

console.log("== 1. spokenRatings (mit comment-Fix) ==");
console.log(await spokenRatings(CLIENT_ID, { limit: 3 }));

console.log("\n== 2. ASAP-Queue (echtes 48-h-Fenster) ==");
const queue = await buildAsapQueue(CLIENT_ID);
console.log("counts:", queue.counts);
const bew = queue.items.filter((i) => i.source === "bewertung");
console.log(`Quelle "bewertung": ${bew.length} Item(s)`);
for (const b of bew) console.log(`  [${b.prio}] ${b.spoken}`);

console.log("\n== 3. Simulation: Meldungen der letzten 7 Tage ==");
const res = await recentRatings(CLIENT_ID, { windowDays: 60 });
const woche = (res.ratings || []).filter((r) => r.ratedAtMs >= Date.now() - 7 * 86400000);
if (!woche.length) console.log("  (keine beantworteten Bewertungen in den letzten 7 Tagen)");
for (const r of woche) {
  const sterne = r.rating === 1 ? "einem Stern" : `${r.rating} Sternen`;
  const kommentar = r.comments ? ` — "${r.comments.slice(0, 80)}"` : " (ohne Kommentar!)";
  console.log(`  ${new Date(r.ratedAtMs).toISOString().slice(0, 16)}  Neue Bewertung: ${r.patientName} hat uns mit ${sterne} bewertet${kommentar}`);
}

await admin.app().delete();
