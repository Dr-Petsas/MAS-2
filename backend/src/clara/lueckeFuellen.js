// Luecke fuellen (Chef 26.11.2026): EINE Datengrundlage fuer das Gespraech mit Clara und fuer
// die Maske "Luecke fuellen" im Kalender. Liest nur: es wird nichts angelegt, niemand angerufen,
// nichts verschickt. Der Start ueber Lisa kommt spaeter und nimmt genau diese Auswahl.
//
//   lueckenFinden      -> welche Luecken gibt es (Sprechzeit minus Termine, wie runGapFill)
//   passendFuerLuecke  -> wer passt in EINE Luecke, gruppiert nach Besuchsgrund
//   absagerKandidaten  -> wer abgesagt hat oder nicht erschienen ist und keinen neuen Termin hat
import admin from "../firebase.js";
import { loadBooking } from "./booking.js";
import { normalizePhone } from "./callerLookup.js";
import { runGapFill, interneKalender, kandidatenBestand, rankCandidatesForGap, spokenMotiveLabel, faelligSeit, durationOfMotive, bucketKeyOf, fachbereichOf } from "./gapFill.js";
import { anlassAbgleichen } from "./anlassAbgleich.js";
import { bestaetigterAbstand, mitKontrollabstand, SPIEL_BUCKET_TAGE } from "./kontrollabstand.js";
import { anlassAn } from "./leistungsAnlass.js";
import { ladeVisitMotives } from "./motiveOverwatch.js";
import { loadStatsMap, contactsInWindow, isBookedSuppressed, isSpamRisk } from "./outreachStats.js";
import { log } from "../log.js";

const TZ = "Europe/Berlin";
const s = (v) => String(v ?? "").trim();
const hhmm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/** "2026-11-27" -> "Freitag, den 27. November"; heute und morgen werden dazugesagt. */
export function tagGesprochen(day, jetzt = new Date()) {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return s(day);
  const wt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(d);
  const dm = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric", month: "long" }).format(d);
  const nah = day === ymd(jetzt) ? "heute, " : day === ymd(new Date(jetzt.getTime() + 86400000)) ? "morgen, " : "";
  return `${nah}${wt}, den ${dm}`;
}

export const lueckeGesprochen = (g) => `${hhmm(g.startMin)} bis ${hhmm(g.endMin)} Uhr (${g.minutes} Minuten)`;

/** "9:30", "09.30", "9" -> Minuten seit Mitternacht, sonst null. */
export function uhrzeitMinuten(v) {
  const teile = s(v).replace(".", ":").split(":");
  const h = Number(teile[0]);
  const m = teile.length > 1 ? Number(teile[1]) : 0;
  if (!s(v) || !Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export async function lueckenFinden(clientId, { date, horizonDays = 1, calendarId = null } = {}) {
  const lauf = await runGapFill(clientId, { date, horizonDays, calendarId, scanOnly: true });
  return { ok: !!lauf?.ok, reason: lauf?.reason || null, date: lauf?.date || s(date), gaps: lauf?.gaps || [] };
}

/**
 * Luecken fuers Gespraech: ist am gefragten Tag nichts frei und kein Zeitraum genannt, gleich die
 * naechsten Tage mitsehen, damit Clara etwas zum Besprechen hat. `leerAm` nennt dann den leeren Tag.
 */
export async function lueckenMitAusblick(clientId, { date, horizonDays, calendarId = null } = {}) {
  const tage = Number(horizonDays) || 0;
  const fund = await lueckenFinden(clientId, { date, horizonDays: tage || 1, calendarId });
  if (!fund.ok || fund.gaps.length || tage > 1) return { fund, leerAm: "" };
  const weiter = await lueckenFinden(clientId, { date, horizonDays: AUSBLICK_TAGE, calendarId });
  return weiter.gaps.length ? { fund: weiter, leerAm: fund.date } : { fund, leerAm: "" };
}
const AUSBLICK_TAGE = 5;

/** Die Luecke, in der die genannte Uhrzeit liegt; sonst die, deren Beginn am naechsten liegt (bis 30 Minuten). */
export function lueckeZurUhrzeit(gaps, minuten) {
  if (minuten == null) return null;
  const drin = gaps.find((g) => g.startMin <= minuten && minuten < g.endMin);
  if (drin) return drin;
  const nah = [...gaps].sort((a, b) => Math.abs(a.startMin - minuten) - Math.abs(b.startMin - minuten))[0];
  return nah && Math.abs(nah.startMin - minuten) <= 30 ? nah : null;
}

const JE_GRUND = 100;
const TAG_MS = 86400000;

// Kennzeichen am Termin, das die Praxis im Kalender setzt (Plattform: PatientStatus).
const NICHT_ERSCHIENEN = 4; // absentUnexcused
const ABGESAGT = 5; // absentExcused
const ABSAGER_TAGE = Number(process.env.MAS_LUECKE_ABSAGER_TAGE || 730);
const ABSAGER_CACHE_MS = 10 * 60 * 1000;
const absagerCache = new Map();

const millis = (v) => v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0);

/**
 * Pure: aus den Terminen eines Zeitraums die Patienten, deren LETZTER vergangener Termin mit
 * Kennzeichen "abgesagt" oder "nicht erschienen" endet und die danach keinen neuen Termin haben
 * (weder wahrgenommen noch vor sich). Gelesen wird nur das Kennzeichen am Termin, kein Freitext.
 */
export function absagerAusTerminen(termine, jetzt = Date.now()) {
  const fehl = new Map();
  const neuer = new Map();
  for (const t of termine) {
    const pid = s(t.patient?.id);
    const ms = millis(t.start);
    if (!pid || !ms) continue;
    const ps = Number(t.patientStatus) || 0;
    if (ps === NICHT_ERSCHIENEN || ps === ABGESAGT) {
      if (ms <= jetzt && (!fehl.has(pid) || fehl.get(pid).ms < ms)) fehl.set(pid, { ms, ps, termin: t });
    } else if (!t.isDeleted && (t.status === "confirmed" || t.status === "reserved")) {
      if ((neuer.get(pid) || 0) < ms) neuer.set(pid, ms);
    }
  }
  const aus = [];
  for (const [pid, f] of fehl) {
    if ((neuer.get(pid) || 0) > f.ms) continue;
    aus.push({ patientId: pid, wannMs: f.ms, art: f.ps === ABGESAGT ? "absage" : "nicht_erschienen", termin: f.termin });
  }
  return aus;
}

const tagKurz = (ms) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));

/** Kandidaten aus Absagen und Nichterscheinen, in der Form der Recall-Kandidaten. Liest nur. */
export async function absagerKandidaten(clientId, booking, jetzt = Date.now()) {
  const cached = absagerCache.get(clientId);
  if (cached && jetzt - cached.at < ABSAGER_CACHE_MS) return cached.rows;
  const col = admin.firestore().collection("clients").doc(clientId)
    .collection("locations").doc(booking.locationId).collection("appointments");
  const base = col.where("start", ">=", admin.firestore.Timestamp.fromMillis(jetzt - ABSAGER_TAGE * TAG_MS))
    .select("start", "patientStatus", "status", "isDeleted",
      "patient.id", "patient.firstName", "patient.lastName", "patient.mobilePhoneNumber", "patient.phoneNumber",
      "visitMotive.id", "visitMotive.name", "calendar.id", "calendar.name")
    .orderBy("start").limit(2000);
  const termine = [];
  let cursor = null;
  while (termine.length < 40000) {
    const snap = await (cursor ? base.startAfter(cursor) : base).get();
    if (snap.empty) break;
    for (const d of snap.docs) termine.push(d.data());
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 2000) break;
  }
  const rows = [];
  for (const a of absagerAusTerminen(termine, jetzt)) {
    const t = a.termin;
    const phone = s(t.patient?.mobilePhoneNumber) || s(t.patient?.phoneNumber);
    const name = `${s(t.patient?.firstName)} ${s(t.patient?.lastName)}`.trim();
    if (!phone || !name) continue;
    rows.push({
      source: a.art,
      patientId: a.patientId,
      name,
      phone,
      phoneNorm: normalizePhone(phone),
      visitMotiveId: s(t.visitMotive?.id),
      visitMotiveName: s(t.visitMotive?.name),
      durationMin: durationOfMotive(booking, s(t.visitMotive?.id), s(t.visitMotive?.name)),
      calendarId: s(t.calendar?.id) || null,
      doctorName: s(t.calendar?.name),
      overdueDays: Math.max(0, Math.round((jetzt - a.wannMs) / TAG_MS)),
      anlass: a.art === "absage" ? `hat den Termin am ${tagKurz(a.wannMs)} abgesagt` : `ist am ${tagKurz(a.wannMs)} nicht erschienen`,
      alreadyCalled: false,
    });
  }
  absagerCache.set(clientId, { at: jetzt, rows });
  return rows;
}

/** Pure: je Patient die Besuchsgruende, fuer die ein Termin bevorsteht (bestaetigt oder reserviert, nicht geloescht, nicht abgesagt). */
export function kommendeGruendeAus(termine, jetzt = Date.now()) {
  const aus = new Map();
  for (const t of termine || []) {
    const pid = s(t.patient?.id);
    const grund = s(t.visitMotive?.id);
    if (!pid || !grund || t.isDeleted || millis(t.start) <= jetzt) continue;
    if (t.status !== "confirmed" && t.status !== "reserved") continue;
    const ps = Number(t.patientStatus) || 0;
    if (ps === NICHT_ERSCHIENEN || ps === ABGESAGT) continue;
    if (!aus.has(pid)) aus.set(pid, new Set());
    aus.get(pid).add(grund);
  }
  return aus;
}

const istAbsager = (c) => c.source === "absage" || c.source === "nicht_erschienen";

/**
 * Pure: Reihenfolge der Vorschlaege (Chef 26.11.2026): der juengste Anlass zuerst. Anlass ist
 * der Tag, an dem der Recall faellig wurde, bzw. der abgesagte oder versaeumte Termin. Wer seit
 * Jahren faellig ist, steht damit hinten. Bei gleichem Tag zuerst, wer seltener kontaktiert wurde.
 */
export function juengsterAnlassZuerst(a, b) {
  return ((Number(a.overdueDays) || 0) - (Number(b.overdueDays) || 0))
    || (Number(istAbsager(b)) - Number(istAbsager(a)))
    || ((a.stats?.recent || 0) - (b.stats?.recent || 0))
    || ((b.stats?.booked || 0) - (a.stats?.booked || 0));
}

// Unter einem gesprochenen Besuchsgrund liegen teils mehrere Terminarten: genannt wird die haeufigste Dauer.
function haeufigste(werte) {
  const n = new Map();
  for (const w of werte) if (w) n.set(w, (n.get(w) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 0;
}

/** Pure: Kandidaten einer Luecke nach Besuchsgrund gruppieren, groesste Gruppe zuerst. */
export function nachBesuchsgrund(kandidaten) {
  const gruppen = new Map();
  for (const c of kandidaten) {
    const name = spokenMotiveLabel(c.visitMotiveName) || s(c.visitMotiveName) || s(c.campaignName) || "Recall";
    const key = name.toLowerCase();
    if (!gruppen.has(key)) gruppen.set(key, { besuchsgrund: name, visitMotiveId: s(c.visitMotiveId), dauerMin: Number(c.durationMin) || 0, dauern: [], patienten: [] });
    gruppen.get(key).dauern.push(Number(c.durationMin) || 0);
    gruppen.get(key).patienten.push({
      patientId: s(c.patientId),
      name: s(c.name),
      faellig: s(c.anlass) || faelligSeit(c.overdueDays, c.source || (c.campaignId ? "campaign" : "recall")),
      overdueDays: Number(c.overdueDays) || 0,
      telefon: !!s(c.phone),
      quelle: istAbsager(c) ? c.source : c.campaignId ? "kampagne" : "recall",
      kampagne: s(c.campaignName),
      behandler: s(c.doctorName),
      // Nur mit verlaesslichem Wert aus der Recall-Einstellung des Besuchsgrunds; sonst fehlt das Feld.
      ...(Number.isInteger(c.kontrollabstandMonate) ? { kontrollabstand_monate: c.kontrollabstandMonate } : {}),
    });
  }
  return [...gruppen.values()]
    .map((g) => ({ ...g, dauerMin: haeufigste(g.dauern) || g.dauerMin, dauern: undefined, anzahl: g.patienten.length }))
    .sort((a, b) => b.anzahl - a.anzahl);
}

const woerter = (text) => s(text).toLowerCase().split("/").join(" ").split("-").join(" ").split(" ").filter((w) => w.length >= 4);
const gleicherAnfang = (a, b) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
};

/**
 * Pure: die Gruppen zum genannten Besuchsgrund. Erst der Name selbst ("Zahnreinigung" in
 * "professionelle Zahnreinigung"), sonst ein Wort mit gleichem Anfang ("Kontrolle" und
 * "Kontrolluntersuchung"). Passt nichts, bleiben alle Gruppen.
 */
export function besuchsgrundWaehlen(gruppen, besuchsgrund) {
  const wunsch = s(besuchsgrund).toLowerCase();
  if (!wunsch) return gruppen;
  const genau = gruppen.filter((g) => g.besuchsgrund.toLowerCase().includes(wunsch) || wunsch.includes(g.besuchsgrund.toLowerCase()));
  if (genau.length) return genau;
  const ww = woerter(wunsch);
  const nah = gruppen.filter((g) => woerter(g.besuchsgrund).some((a) => ww.some((b) => gleicherAnfang(a, b) >= Math.min(6, a.length, b.length))));
  return nah.length ? nah : gruppen;
}

// Vorschlaege nur fuer Patienten, deren Akte es in der Kartei gibt (27.11.2026): an einer geloeschten
// Dublette hingen noch alte Recall-Termine, sie wurde vorgeschlagen, und die Plattform fand die Akte nicht.
const AKTE_CACHE_MS = 5 * 60 * 1000;
const akteCache = new Map();

async function akteHolen(clientId, locationId, ids) {
  const col = admin.firestore().collection("clients").doc(clientId).collection("locations").doc(locationId).collection("patients");
  const docs = await admin.firestore().getAll(...ids.map((id) => col.doc(id)), { fieldMask: ["lastName"] });
  return docs.filter((d) => d.exists).map((d) => d.id);
}

/** Welche dieser Patienten-Kennungen haben eine Akte? Wirft, wenn die Kartei nicht lesbar ist. */
export async function aktenVorhanden(clientId, locationId, ids, { holen = akteHolen, jetzt = Date.now() } = {}) {
  const alle = [...new Set((ids || []).map(s).filter(Boolean))];
  const da = new Set();
  const offen = [];
  for (const id of alle) {
    const c = akteCache.get(`${clientId}/${locationId}/${id}`);
    if (c && jetzt - c.at < AKTE_CACHE_MS) { if (c.da) da.add(id); } else offen.push(id);
  }
  for (let i = 0; i < offen.length; i += 300) {
    const teil = offen.slice(i, i + 300);
    const gefunden = new Set(await holen(clientId, locationId, teil));
    for (const id of teil) {
      akteCache.set(`${clientId}/${locationId}/${id}`, { at: jetzt, da: gefunden.has(id) });
      if (gefunden.has(id)) da.add(id);
    }
  }
  return da;
}

/** Pure: nur Kandidaten, deren Akte vorhanden ist. */
export function nurMitAkte(kandidaten, vorhanden) {
  return (kandidaten || []).filter((c) => vorhanden.has(s(c.patientId)));
}

/** Nur fuer Tests. */
export function _akteCacheLeeren() { akteCache.clear(); }

// Faellige Recalls aus den Recall-Buckets der Plattform (27.11.2026). Die Plattform legt seit Juni 2026 keine
// Platzhalter-Termine mehr an: sie rechnet jede Nacht aus den bestaetigten Terminen, wer faellig ist, und schreibt
// das an die Akte (recallBuckets) und als Mitgliederliste je Bucket. Gelesen wird die Mitgliederliste, weil nur
// dort die Faelligkeit steht, und nur je Kalender und Besuchsgrund ("calmot:"), damit jeder Anlass einmal vorkommt.
// Die Liste ist bis zu einem Tag alt: wer inzwischen einen Termin fuer den Besuchsgrund hat, faellt hier heraus.
// Schalter je Praxis: MAS_LUECKE_BUCKETS=<clientId,...> oder *. Leer = wie vorher.
const BUCKET_CACHE_MS = 10 * 60 * 1000;
const BUCKET_ZAEHLER_MS = 45 * 1000;
const bucketCache = new Map();
const bucketZaehlerCache = new Map();
const kommendCache = new Map();
const liste = (roh) => s(roh).split(",").map(s).filter(Boolean);

export function bucketsAn(clientId, roh = process.env.MAS_LUECKE_BUCKETS) {
  const praxen = liste(roh);
  return praxen.includes("*") || (!!s(clientId) && praxen.includes(s(clientId)));
}

/** Welche Anlaesse zaehlen: "recall" (Recall-Muster des Besuchsgrunds), auf Wunsch auch "successor" (Folgetermin). */
export const bucketGruende = (roh = process.env.MAS_LUECKE_BUCKET_GRUENDE) => new Set(liste(roh).length ? liste(roh) : ["recall"]);

// Einengung der Bucket-Quelle (Chef 27.11.2026: hoechstens zwei Jahre faellig, alle Besuchsgruende).
// MAS_LUECKE_BUCKET_TAGE=<Tage>: wer laenger faellig ist, kommt aus den Buckets nicht. 0 = ohne Grenze.
// MAS_LUECKE_BUCKET_BESUCHSGRUENDE=<Kennung oder Name,...>: nur diese Besuchsgruende. Leer = alle.
// Beides gilt nur fuer die Bucket-Quelle, die bisherigen Quellen bleiben, wie sie sind.
const BUCKET_TAGE_VORGABE = 730;

export function bucketHoechstensTage(roh = process.env.MAS_LUECKE_BUCKET_TAGE) {
  if (!s(roh)) return BUCKET_TAGE_VORGABE;
  const n = Number(s(roh));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : BUCKET_TAGE_VORGABE;
}

export const bucketBesuchsgruende = (roh = process.env.MAS_LUECKE_BUCKET_BESUCHSGRUENDE) => new Set(liste(roh).map((x) => x.toLowerCase()));

const grundGewaehlt = (nur, id, name) => !nur.size || nur.has(s(id).toLowerCase()) || nur.has(s(name).toLowerCase())
  || nur.has((spokenMotiveLabel(name) || "").toLowerCase());

async function bucketMitgliederLesen(clientId, locationId) {
  const loc = admin.firestore().collection("clients").doc(clientId).collection("locations").doc(locationId);
  const stand = (await loc.collection("recallBucketsSummary").doc("default").get()).data() || {};
  const generation = s(stand.memberGenerationId);
  const keys = Object.entries(stand.counts || {}).filter(([k, n]) => k.startsWith("calmot:") && Number(n) > 0).map(([k]) => k);
  if (!generation || !keys.length) return [];
  const aus = [];
  for (let i = 0; i < keys.length; i += 10) {
    const teil = await Promise.all(keys.slice(i, i + 10).map((k) => loc.collection("recallBucketMembers").doc(k).collection("patients")
      .where("generationId", "==", generation)
      .select("patientId", "firstName", "lastName", "mobilePhoneNumber", "phoneNumber", "smsAllowed", "calendarId", "dueAtMs",
        "lastAppointmentDateMs", "recallReason", "sourceVisitMotiveId", "targetVisitMotiveId", "targetVisitMotiveName")
      .get()));
    for (const snap of teil) for (const d of snap.docs) aus.push(d.data());
  }
  return aus;
}

/** Mitglieder der Recall-Buckets einer Praxis, zehn Minuten gemerkt. */
export async function bucketMitglieder(clientId, locationId, { lesen = bucketMitgliederLesen, jetzt = Date.now() } = {}) {
  const c = bucketCache.get(clientId);
  if (c && jetzt - c.at < BUCKET_CACHE_MS) return c.rows;
  const rows = await lesen(clientId, locationId);
  bucketCache.set(clientId, { at: jetzt, rows });
  return rows;
}

async function kommendeTermineLesen(clientId, locationId, jetzt) {
  const base = admin.firestore().collection("clients").doc(clientId).collection("locations").doc(locationId).collection("appointments")
    .where("start", ">", admin.firestore.Timestamp.fromMillis(jetzt))
    .select("start", "patientStatus", "status", "isDeleted", "patient.id", "visitMotive.id")
    .orderBy("start").limit(2000);
  const termine = [];
  let cursor = null;
  for (;;) {
    const snap = await (cursor ? base.startAfter(cursor) : base).get();
    for (const d of snap.docs) termine.push(d.data());
    if (snap.size < 2000) return termine;
    if (termine.length >= 60000) throw new Error("zu_viele_kommende_termine");
    cursor = snap.docs[snap.docs.length - 1];
  }
}

/** Je Patient die Besuchsgruende mit bevorstehendem Termin, zehn Minuten gemerkt. */
export async function kommendeGruende(clientId, locationId, { lesen = kommendeTermineLesen, jetzt = Date.now() } = {}) {
  const c = kommendCache.get(clientId);
  if (c && jetzt - c.at < BUCKET_CACHE_MS) return c.map;
  const map = kommendeGruendeAus(await lesen(clientId, locationId, jetzt), jetzt);
  kommendCache.set(clientId, { at: jetzt, map });
  return map;
}

/** Nur fuer Tests. */
export function _bucketCacheLeeren() { bucketCache.clear(); bucketZaehlerCache.clear(); kommendCache.clear(); }

/**
 * Pure: Bucket-Mitglieder in der Form der Recall-Kandidaten. Bleibt nur, wer faellig und erreichbar ist und fuer
 * den Besuchsgrund (Ausloeser oder Ziel) keinen Termin vor sich hat. `motive`: Kennung -> { name, duration },
 * `kalender`: Kennung -> Name, `kommend`: Patient -> Kennungen der Besuchsgruende mit bevorstehendem Termin.
 * `hoechstensTage`: laenger Faellige bleiben draussen (0 = ohne Grenze), `nurGruende`: nur diese Besuchsgruende (leer = alle).
 */
export function bucketKandidatenAus(mitglieder, {
  motive = new Map(), kalender = new Map(), kommend = new Map(), gruende = bucketGruende(),
  hoechstensTage = bucketHoechstensTage(), nurGruende = bucketBesuchsgruende(), jetzt = Date.now(),
} = {}) {
  const aus = [];
  for (const m of mitglieder || []) {
    const patientId = s(m.patientId);
    const grundId = s(m.targetVisitMotiveId);
    const faelligMs = Number(m.dueAtMs) || 0;
    const phone = s(m.mobilePhoneNumber) || s(m.phoneNumber);
    const name = `${s(m.firstName)} ${s(m.lastName)}`.trim();
    if (!patientId || !grundId || !phone || !name || !gruende.has(s(m.recallReason))) continue;
    if (!faelligMs || faelligMs > jetzt) continue;
    const overdueDays = Math.max(0, Math.round((jetzt - faelligMs) / TAG_MS));
    if (hoechstensTage > 0 && overdueDays > hoechstensTage) continue;
    const vor = kommend.get(patientId);
    if (vor && (vor.has(grundId) || vor.has(s(m.sourceVisitMotiveId)))) continue;
    const grund = motive.get(grundId);
    const grundName = s(grund?.name) || s(m.targetVisitMotiveName);
    if (!grundGewaehlt(nurGruende, grundId, grundName)) continue;
    // Kontrollabstand: Recall-Abstand am ausloesenden Besuchsgrund, wenn die Faelligkeit genau so gerechnet ist.
    const monate = s(m.recallReason) === "recall"
      ? bestaetigterAbstand(motive.get(s(m.sourceVisitMotiveId)), Number(m.lastAppointmentDateMs), faelligMs, SPIEL_BUCKET_TAGE)
      : null;
    aus.push({
      source: "recall",
      herkunft: "bucket",
      patientId,
      name,
      phone,
      phoneNorm: normalizePhone(phone),
      visitMotiveId: grundId,
      visitMotiveName: grundName,
      bucketKey: bucketKeyOf(grundName),
      fachbereich: fachbereichOf(grundName),
      durationMin: Number(grund?.duration) || 30,
      calendarId: s(m.calendarId) || null,
      doctorName: s(kalender.get(s(m.calendarId))),
      overdueDays,
      alreadyCalled: false,
      consent: { sms: m.smsAllowed === true ? true : null, reminder: null },
      ...(monate ? { kontrollabstandMonate: monate } : {}),
    });
  }
  return aus;
}

const grundSchluessel = (c) => (spokenMotiveLabel(c.visitMotiveName) || s(c.visitMotiveName)).toLowerCase();

/**
 * Pure: neue Kandidaten ohne die Anlaesse, die es schon gibt. Derselbe Anlass ist derselbe Patient mit demselben
 * Besuchsgrund (Kennung oder gesprochener Name), gleich aus welcher Quelle.
 */
export function ohneDoppelte(vorhandene, neue) {
  const da = new Set();
  const merken = (c) => {
    const pid = s(c.patientId);
    if (s(c.visitMotiveId)) da.add(`${pid}|id|${s(c.visitMotiveId)}`);
    if (grundSchluessel(c)) da.add(`${pid}|name|${grundSchluessel(c)}`);
  };
  for (const c of vorhandene || []) merken(c);
  const aus = [];
  for (const c of neue || []) {
    const pid = s(c.patientId);
    if (da.has(`${pid}|id|${s(c.visitMotiveId)}`) || da.has(`${pid}|name|${grundSchluessel(c)}`)) continue;
    merken(c);
    aus.push(c);
  }
  return aus;
}

// Dieselben Kontakt-Zaehler wie am uebrigen Bestand (frisch gebucht, Spam-Wache), kurz gemerkt.
async function mitZaehlern(clientId, kandidaten, jetzt) {
  if (!kandidaten.length) return kandidaten;
  let c = bucketZaehlerCache.get(clientId);
  if (!c || jetzt - c.at >= BUCKET_ZAEHLER_MS) {
    c = { at: jetzt, map: await loadStatsMap(clientId, kandidaten.map((k) => k.patientId)) };
    bucketZaehlerCache.set(clientId, c);
  }
  return kandidaten.map((k) => {
    const st = c.map.get(k.patientId);
    if (!st) return k;
    return { ...k, stats: { contacts: st.contacts, booked: st.booked, recent: contactsInWindow(st), suppressed: isBookedSuppressed(st), spamRisk: isSpamRisk(st) } };
  });
}

/** Faellige aus den Recall-Buckets, die der uebrige Bestand noch nicht kennt. Liest nur. */
export async function bucketKandidaten(clientId, booking, vorhandene, jetzt = Date.now()) {
  // Sind die kommenden Termine nicht lesbar, wirft das hier: dann kommt aus den Buckets niemand.
  const [mitglieder, kommend, motive] = await Promise.all([
    bucketMitglieder(clientId, booking.locationId, { jetzt }),
    kommendeGruende(clientId, booking.locationId, { jetzt }),
    ladeVisitMotives(clientId, booking.locationId, booking),
  ]);
  const roh = bucketKandidatenAus(mitglieder, {
    motive: new Map((motive || []).map((v) => [s(v.id), v])),
    kalender: new Map((booking.calendars || []).map((k) => [s(k.id), s(k.name)])),
    kommend,
    jetzt,
  });
  return mitZaehlern(clientId, ohneDoppelte(vorhandene, roh), jetzt);
}

/**
 * Wer passt in diese eine Luecke? Dieselben Tore und dieselbe Reihenfolge wie frueher bei den
 * Anruflisten (Dauer passt, Behandler passt, nicht kuerzlich kontaktiert, kein Spam-Risiko),
 * aber ohne etwas zu speichern.
 */
export async function passendFuerLuecke(clientId, { date, calendarId, startMin, minutes, besuchsgrund = "", nurAbsager = false, anlassFuer = [] } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  if (!booking?.locationId) return { ok: false, reason: "no_booking_config", gruppen: [], gesamt: 0 };
  const dauer = Number(minutes) || 0;
  if (!s(date) || !s(calendarId) || !(dauer > 0)) return { ok: false, reason: "luecke_unvollstaendig", gruppen: [], gesamt: 0 };
  // Interne Kalender (Labor, OP) bekommen keine Vorschlaege - auch nicht aus der Maske im Kalender.
  if ((await interneKalender(clientId, booking.locationId)).has(s(calendarId))) {
    return { ok: false, reason: "interner_kalender", gruppen: [], gesamt: 0 };
  }
  const [{ allCandidates, throttled }, absager] = await Promise.all([
    kandidatenBestand(clientId, booking),
    absagerKandidaten(clientId, booking).catch(() => []),
  ]);
  const gap = { startMin: Number(startMin) || 0, endMin: (Number(startMin) || 0) + dauer, minutes: dauer };
  // Wer abgesagt hat UND im Recall faellig ist, zaehlt als Absager, gleich welcher Eintrag vorn steht.
  const absagerIds = new Set(absager.map((c) => s(c.patientId)));
  const hatAbgesagt = (c) => istAbsager(c) || absagerIds.has(s(c.patientId));
  // Faellige aus den Recall-Buckets der Plattform kommen dazu, die bisherigen Quellen bleiben und gehen vor.
  const ausBuckets = bucketsAn(clientId)
    ? await bucketKandidaten(clientId, booking, [...absager, ...allCandidates]).catch((e) => {
      log.warn("luecke.buckets_nicht_lesbar", { clientId, error: String(e?.message || e) });
      return [];
    })
    : [];
  const tore = { calendarId: s(calendarId), throttled, max: Infinity, reihenfolge: juengsterAnlassZuerst };
  const bisher = [...absager, ...allCandidates];
  // Wer schon ueber eine bisherige Quelle in dieser Luecke steht, behaelt genau diesen Eintrag.
  const schonDa = new Set(ausBuckets.length ? rankCandidatesForGap(bisher, gap, tore).map((c) => s(c.patientId)) : []);
  const passendRoh = rankCandidatesForGap([...bisher, ...ausBuckets.filter((c) => !schonDa.has(s(c.patientId)))], gap, tore)
    .filter((c) => !nurAbsager || hatAbgesagt(c));
  let vorhanden;
  try {
    vorhanden = await aktenVorhanden(clientId, booking.locationId, passendRoh.map((c) => c.patientId));
  } catch {
    // Ohne Blick in die Kartei wird nichts vorgeschlagen, statt eine geloeschte Akte anzubieten.
    return { ok: false, reason: "kartei_nicht_lesbar", gruppen: [], gesamt: 0 };
  }
  const mitAkte = nurMitAkte(passendRoh, vorhanden);
  // Alte Recall-Platzhalter: Kontrollabstand aus dem Besuchsgrund des Termins, aus dem der Recall entstand.
  const passend = mitAkte.some((c) => c.parentRecallId)
    ? await mitKontrollabstand(clientId, booking.locationId, mitAkte,
      new Map(((await ladeVisitMotives(clientId, booking.locationId, booking).catch(() => [])) || []).map((v) => [s(v.id), v])))
    : mitAkte;
  const gruppen0 = nachBesuchsgrund(passend);
  let gruppen = besuchsgrundWaehlen(gruppen0, besuchsgrund);
  // Gezaehlt werden alle, mitgeliefert je Besuchsgrund nur die vordersten (juengster Anlass zuerst).
  const gesamt = gruppen.reduce((n, g) => n + g.anzahl, 0);
  const gewaehlt = new Set(gruppen.flatMap((g) => g.patienten.map((p) => p.patientId)));
  const gezaehlt = passend.filter((c) => gewaehlt.has(s(c.patientId)));
  const absagerZahl = gezaehlt.filter(hatAbgesagt).length;
  const juengst = gezaehlt.filter((c) => !hatAbgesagt(c) && (Number(c.overdueDays) || 0) <= 730).length;
  gruppen = gruppen.map((g) => ({ ...g, patienten: g.patienten.slice(0, JE_GRUND) }));
  // Anlass-Abgleich Praxisprogramm gegen Terminhistorie; `anlassFuer`: Patienten, die die Maske zuerst geprueft haben will.
  if (anlassAn(clientId)) gruppen = await anlassAbgleichen(clientId, gruppen, { zuerst: anlassFuer });
  const calendar = (booking.calendars || []).find((c) => c.id === s(calendarId));
  return {
    ok: true,
    luecke: { date: s(date), calendarId: s(calendarId), calendarName: s(calendar?.name), ...gap },
    gruppen,
    gesamt,
    absager: absagerZahl,
    faelligBisZweiJahre: juengst,
    jeGrundHoechstens: JE_GRUND,
  };
}

/** Antwort auf "gib das frei" / "Lisa soll die anrufen": ehrlich, ohne etwas anzulegen. */
export const START_GESPERRT = "Freigeben kann ich das noch nicht, und Lisa ruft aus diesem Gespräch niemanden an: der Start ist noch nicht freigeschaltet. Angelegt ist nichts. Wenn Sie möchten, bereite ich eine einzelne SMS an einen Patienten vor, den Sie mir nennen, oder hinterlege dem Team einen Auftrag.";

const zahl = (n, eins, viele) => (n === 1 ? eins : `${n} ${viele}`);

/** Sprechtext: welche Luecken es gibt. Fakten, die Frage dazu stellt Clara selbst. */
export function lueckenSatz(fund) {
  if (!fund.ok) return "Die Lückensuche ist für diese Praxis nicht eingerichtet.";
  if (!fund.gaps.length) return `Für ${tagGesprochen(fund.date)} sehe ich keine Lücke von mindestens 25 Minuten.`;
  const jeTag = new Map();
  for (const g of fund.gaps) {
    if (!jeTag.has(g.date)) jeTag.set(g.date, []);
    jeTag.get(g.date).push(g);
  }
  const mehrereBehandler = new Set(fund.gaps.map((g) => g.calendarId)).size > 1;
  const teile = [...jeTag.entries()].map(([tag, liste]) => {
    const stuecke = liste.slice(0, 6).map((g) => `${lueckeGesprochen(g)}${mehrereBehandler && g.calendarName ? ` bei ${g.calendarName}` : ""}`);
    const rest = liste.length > 6 ? ` und ${liste.length - 6} weitere` : "";
    return `${tagGesprochen(tag)}: ${stuecke.join("; ")}${rest}`;
  });
  return `${zahl(fund.gaps.length, "Eine Lücke", "Lücken")} im Kalender. ${teile.join(". ")}.`;
}

/** Sprechtext: wer sich fuer eine Luecke anbietet, je Besuchsgrund mit den am laengsten Faelligen. */
export function passendSatz(fund, { namenJeGrund = 3 } = {}) {
  if (fund.reason === "interner_kalender") return "Das ist ein interner Kalender. Dort fülle ich keine Lücken.";
  if (fund.reason === "kartei_nicht_lesbar") return "Die Kartei kann ich gerade nicht lesen, deshalb schlage ich niemanden vor. Bitte gleich noch einmal.";
  if (!fund.ok) return "Dazu fehlt mir die Buchungskonfiguration der Praxis.";
  const l = fund.luecke;
  const tag = tagGesprochen(l.date);
  const wo = `die Lücke ${tag.startsWith("heute") || tag.startsWith("morgen") ? "" : "am "}${tag} von ${lueckeGesprochen(l)}${l.calendarName ? ` bei ${l.calendarName}` : ""}`;
  if (!fund.gesamt) return `Für ${wo} finde ich gerade niemanden, der hineinpasst.`;
  const gruende = fund.gruppen.slice(0, 4).map((g) => {
    const namen = g.patienten.slice(0, namenJeGrund).map((p) => (p.faellig ? `${p.name} (${p.faellig})` : p.name));
    return `${g.besuchsgrund}${g.dauerMin ? `, ${g.dauerMin} Minuten` : ""}: ${zahl(g.anzahl, "ein Patient", "Patienten")}, vorn ${namen.join(", ")}`;
  });
  const mehr = fund.gruppen.length > 4 ? ` Dazu ${fund.gruppen.length - 4} weitere Besuchsgründe.` : "";
  const davon = [
    fund.absager ? `${fund.absager} mit abgesagtem oder versäumtem Termin ohne neuen` : "",
    fund.faelligBisZweiJahre ? `${fund.faelligBisZweiJahre} in den letzten zwei Jahren fällig geworden` : "",
  ].filter(Boolean);
  const kopf = fund.gesamt === 1
    ? `In ${wo} passt ein Patient${fund.absager ? " mit abgesagtem oder versäumtem Termin ohne neuen" : ""}.`
    : `In ${wo} passen ${fund.gesamt} Patienten${davon.length ? `, davon ${davon.join(" und ")}` : ""}.`;
  return `${kopf} Der jüngste Anlass steht vorn. ${gruende.join(". ")}.${mehr}`;
}

export const NICHTS_ANGELEGT = "Es ist nichts angelegt und niemand wird angerufen: besprochen wird nur die Auswahl. "
  + "Der Start über Lisa ist noch nicht freigeschaltet, freigeben lässt sich also nichts, und Lisa ruft aus diesem Gespräch niemanden an: verlangt der Arzt das, sag es ihm und lege nichts stattdessen an, auch keinen Termin. "
  + "Nur wenn der Arzt es ausdrücklich verlangt: eine einzelne SMS an einen von ihm genannten Patienten (erst Vorschau, dann sein Ja) oder ein Auftrag ans Team. Von dir aus nichts davon anbieten oder anlegen. "
  + "Einen Termin eintragen nur für einen Patienten, den der Arzt selbst ausdrücklich nennt.";
