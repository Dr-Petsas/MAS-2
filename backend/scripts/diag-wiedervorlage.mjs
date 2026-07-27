// Kurzdiagnose W-STABIL-8: Welche Events qualifizieren fuer die Wiedervorlage
// und WARUM (deadlineStrong / invoiceOrPayment / critical)? Read-only.
import "dotenv/config";
import { queryLatest } from "../src/brain/eventStore.js";

const CLIENT = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();
const evs = await queryLatest(CLIENT, Date.now() - 60 * 86400000, 2000);
const kandidaten = evs.filter((e) =>
  e.status !== "resolved"
  && (e.signals?.invoiceOrPayment || (e.deadlineMs && (e.deadlineStrong === true || e.signals?.critical))));
for (const e of kandidaten) {
  console.log("---", e.id);
  console.log("  ts:", new Date(e.ts).toISOString().slice(0, 16), "| kanal:", e.channel, "| status:", e.status);
  console.log("  frist:", e.deadlineMs ? new Date(e.deadlineMs).toISOString().slice(0, 10) : "-",
    "| stark:", e.deadlineStrong === true, "| rechnung:", !!e.signals?.invoiceOrPayment,
    "| kritisch:", !!e.signals?.critical, "| betrag:", e.amountCents ?? "-");
  console.log("  von:", e.counterparty?.name || "?");
  console.log("  summary:", String(e.summary || "").replace(/\s+/g, " ").slice(0, 150));
}
console.log(`\n${kandidaten.length} Kandidaten.`);
process.exit(0);
