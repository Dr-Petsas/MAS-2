// ============================================================================
// Rote Liste nachpruefen (27.07.2026).
//
// Das Eskalations-Radar hat Werbemails als "Post von Kammer oder Behoerde"
// gefuehrt, weil die PFLICHT-FUSSZEILE deutscher Geschaeftsmails
// ("Registergericht: Amtsgericht ... HRB", "zustaendige Kammer: IHK") die
// Behoerden-Muster traf. Der Fehler ist in src/brain/critical.js behoben —
// aber die alten Eintraege stehen weiter in der roten Liste und verstopfen
// Claras Tages-Lagebild.
//
// Dieses Skript bewertet die OFFENEN kritischen Events neu (mit der
// reparierten Logik, auf Basis der gespeicherten Zusammenfassung) und nimmt
// nur jene aus der roten Liste, bei denen KEIN Stichwort mehr greift.
// Standard ist Trockenlauf; erst "--apply" schreibt.
//
//   node scripts/redlist-recheck.mjs                 (nur anzeigen)
//   node scripts/redlist-recheck.mjs --apply         (bereinigen)
// ============================================================================
import "dotenv/config";
import { assessCritical } from "../src/brain/critical.js";
import { queryRecent } from "../src/brain/eventStore.js";
import { masCollection } from "../src/tenant.js";

const APPLY = process.argv.includes("--apply");
const clientId = (process.argv.find((a) => a.startsWith("--client="))
  || `--client=${process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT"}`).split("=")[1];
const LOOKBACK_MS = 21 * 24 * 60 * 60 * 1000;

const events = await queryRecent(clientId, Date.now() - LOOKBACK_MS, 2000);
const offen = events.filter((e) => e.status === "open" && e.signals?.critical);

// Die gespeicherte Zusammenfassung traegt vorn das Etikett der damaligen
// Einstufung ("[Kammer/Behörde] E-Mail von ..."). Wer das mitbewertet, prueft
// sich selbst und bestaetigt jeden Fehler — Etikett runter vor der Neubewertung.
const ohneEtikett = (s) => String(s || "").replace(/^\s*\[[^\]]{3,40}\]\s*/, "");

// Sicherheitsnetz: im Zweifel BEHALTEN. Die harten Muster verlangen ganze
// Woerter ("pfaendung"), die Wirklichkeit schreibt Plural und Paragrafen
// ("Ausgleich der Pfaendungen", "Unterlagen gem. § 630g"). Wer hier haengen
// bleibt, bleibt auf der roten Liste — lieber ein Fehlalarm zu viel als ein
// uebersehenes Anwaltsschreiben.
const STAMM_RE = /(pf(?:ä|ae)ndung|mahnung|mahnstufe|anwalt|anw(?:ä|ae)lt|kanzlei|rechtsanw|zwangsvollstreck|inkasso|kammer|behörde|behoerde|amtsgericht|staatsanwalt|§\s*\d|frist|klage|verklag|anzeige|mandant)/i;

const bleibt = [];
const raus = [];
for (const e of offen) {
  const text = ohneEtikett(e.summary);
  const neu = assessCritical({ subject: "", text });
  // Absender zaehlt mit: eine Kanzlei/Kammer bleibt kritisch, auch wenn im
  // Vorschautext gerade nur eine Rechnungskopie steht.
  const absender = /(rechtsanw|anw(?:ä|ae)lt|kanzlei|kammer|gericht|finanzamt|inkasso|notar)/i
    .test(String(e.counterparty?.name || ""));
  const stamm = STAMM_RE.test(text) || absender;
  (neu.critical || stamm ? bleibt : raus).push({ ...e, neu, stamm });
}

const kurz = (e) => `${new Date(e.ts).toLocaleString("de-DE")} | ${(e.counterparty?.name || "?").slice(0, 34)} | ${ohneEtikett(e.summary).replace(/\s+/g, " ").slice(0, 90)}`;

console.log(`Rote Liste ${clientId}: ${offen.length} offene kritische Vorgaenge\n`);
console.log(`BLEIBEN (${bleibt.length}):`);
for (const e of bleibt) console.log(`   [${e.neu.category || (e.stamm ? "Stichwort im Text" : "?")}] ${kurz(e)}`);
console.log(`\nFALLEN RAUS (${raus.length}) — kein Stichwort mehr, nur Etikett/Fusszeile:`);
for (const e of raus) console.log(`   ${kurz(e)}`);

if (!APPLY) {
  console.log("\nTrockenlauf. Zum Bereinigen: node scripts/redlist-recheck.mjs --apply");
  process.exit(0);
}

let n = 0;
for (const e of raus) {
  await masCollection(clientId, "mas_events").doc(e.id)
    .set({ signals: { ...(e.signals || {}), critical: false }, redlistRecheckedAt: Date.now() }, { merge: true });
  n += 1;
}
console.log(`\n${n} Vorgaenge aus der roten Liste genommen.`);
process.exit(0);
