// ============================================================================
// Bewertungs-Kette pruefen (30.08.2026) — NUR LESEND.
//
// Beantwortet drei Fragen mit Live-Daten:
//   1. Werden Bewertungsanfragen (E-Mail/SMS) wirklich versendet?
//      -> ratings-Collection: sendAt/sendBy/messageStatus
//   2. Kommen Antworten an und wie heisst das Kommentar-Feld wirklich?
//      -> rating>0, ratedAt, comment vs. comments (Verdacht: MAS-2 liest falsches Feld)
//   3. Stehen die LiveBot-Eintraege da?
//      -> logItems: Typ 20 (E-Mail gesendet) mit "Bewertungsanfrage", Typ 16 (Bewertung erhalten)
//
//   node scripts/_pruefe-bewertungen.mjs
// ============================================================================
import "dotenv/config";
import admin, { db } from "../src/firebase.js";

const CLIENT_ID = (process.env.DEFAULT_CLIENT_ID || "MEe4ZQHEzOPzLcexyhdT").trim();

const ms = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
};
const tag = (msVal) => (msVal ? new Date(msVal).toISOString().slice(0, 16).replace("T", " ") : "-");
// Datenschutz: nur Initialen ausgeben.
const kurz = (vor, nach) => `${String(vor || "?").charAt(0)}. ${String(nach || "?").charAt(0)}.`;

// ---------------------------------------------------------------- ratings ---
// Gleiche Abfrageform wie MAS-2 ratings.js (Index locationId+sendAt existiert).
// Ohne orderBy+Limit wuerde Firestore eine willkuerliche Teilmenge liefern.
const LOC_ID = "VjdvbRQHH8oTId4f0GiX";
const seit = new Date(Date.now() - 180 * 86400000);
const snap = await db.collection("ratings")
  .orderBy("sendAt")
  .where("sendAt", ">=", seit)
  .where("locationId", "==", LOC_ID)
  .get();
const alle = snap.docs.map((d) => {
  const o = d.data();
  return {
    id: d.id,
    locationId: o.locationId || "",
    sendAtMs: ms(o.sendAt), sendBy: o.sendBy || "?",
    messageStatus: o.messageStatus, rating: Number(o.rating || 0),
    ratedAtMs: ms(o.ratedAt),
    hatComment: Object.prototype.hasOwnProperty.call(o, "comment"),
    hatComments: Object.prototype.hasOwnProperty.call(o, "comments"),
    commentLaenge: String(o.comment || "").length,
    wer: kurz(o.patientFirstName, o.patientLastName),
  };
}).sort((a, b) => b.sendAtMs - a.sendAtMs);

const jetzt = Date.now();
const t30 = jetzt - 30 * 86400000;
const t90 = jetzt - 90 * 86400000;
const s30 = alle.filter((r) => r.sendAtMs >= t30);
const s90 = alle.filter((r) => r.sendAtMs >= t90);
const beantwortet = (list) => list.filter((r) => r.rating > 0);

console.log(`\n== ratings der letzten 180 Tage (Location ${LOC_ID}): ${alle.length} ==`);
console.log(`letzte 30 Tage: ${s30.length} Anfragen, davon beantwortet: ${beantwortet(s30).length}`);
console.log(`letzte 90 Tage: ${s90.length} Anfragen, davon beantwortet: ${beantwortet(s90).length}`);
const perStatus = {};
for (const r of alle) perStatus[r.messageStatus] = (perStatus[r.messageStatus] || 0) + 1;
console.log(`messageStatus-Verteilung:`, perStatus);
const perWeg = {};
for (const r of alle) perWeg[r.sendBy] = (perWeg[r.sendBy] || 0) + 1;
console.log(`Versandweg:`, perWeg);

console.log(`\n-- die 12 neuesten Anfragen --`);
for (const r of alle.slice(0, 12)) {
  console.log(`  ${tag(r.sendAtMs)}  ${r.sendBy.padEnd(5)} status=${String(r.messageStatus).padEnd(3)} ` +
    `${r.rating > 0 ? `${r.rating}*  beantwortet ${tag(r.ratedAtMs)}` : "offen"}  ${r.wer}`);
}

const mitAntwort = beantwortet(alle).sort((a, b) => b.ratedAtMs - a.ratedAtMs);
console.log(`\n-- Feldnamen-Check bei den 8 neuesten BEANTWORTETEN --`);
for (const r of mitAntwort.slice(0, 8)) {
  console.log(`  ${tag(r.ratedAtMs)}  ${r.rating}*  comment=${r.hatComment ? `ja(${r.commentLaenge})` : "nein"} ` +
    `comments=${r.hatComments ? "ja" : "nein"}  ${r.wer}`);
}

// --------------------------------------------------------------- logItems ---
const locId = alle.find((r) => r.locationId)?.locationId;
if (!locId) {
  console.log("\nKeine locationId in ratings gefunden — logItems-Check uebersprungen.");
} else {
  const logSnap = await db.collection("clients").doc(CLIENT_ID)
    .collection("locations").doc(locId)
    .collection("logItems")
    .orderBy("createdAt", "desc")
    .limit(400)
    .get();
  const logs = logSnap.docs.map((d) => {
    const o = d.data();
    return { type: o.type, createdAtMs: ms(o.createdAt), message: String(o.message || ""), source: o.source || "" };
  });
  const mailBewertung = logs.filter((l) => l.type === 20 && l.message.startsWith("Bewertungsanfrage"));
  const erhalten = logs.filter((l) => l.type === 16);
  console.log(`\n== logItems (letzte 400, Location ${locId}) ==`);
  console.log(`Typ 20 "Bewertungsanfrage ... gesendet": ${mailBewertung.length}`);
  for (const l of mailBewertung.slice(0, 5)) {
    console.log(`  ${tag(l.createdAtMs)}  ${l.message.replace(/an [^ ]+@/i, "an ***@").slice(0, 90)}`);
  }
  console.log(`Typ 16 "Bewertung erhalten": ${erhalten.length}`);
  for (const l of erhalten.slice(0, 5)) {
    console.log(`  ${tag(l.createdAtMs)}  [${l.source}] ${l.message.slice(0, 90)}`);
  }
  const aeltester = logs.length ? tag(logs[logs.length - 1].createdAtMs) : "-";
  console.log(`(Zeitfenster der 400 Eintraege reicht zurueck bis: ${aeltester})`);
}

await admin.app().delete();
