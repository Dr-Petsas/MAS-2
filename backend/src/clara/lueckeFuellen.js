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
import { runGapFill, kandidatenBestand, rankCandidatesForGap, spokenMotiveLabel, faelligSeit, durationOfMotive } from "./gapFill.js";

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

/**
 * Wer passt in diese eine Luecke? Dieselben Tore und dieselbe Reihenfolge wie frueher bei den
 * Anruflisten (Dauer passt, Behandler passt, nicht kuerzlich kontaktiert, kein Spam-Risiko),
 * aber ohne etwas zu speichern.
 */
export async function passendFuerLuecke(clientId, { date, calendarId, startMin, minutes, besuchsgrund = "", nurAbsager = false } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  if (!booking?.locationId) return { ok: false, reason: "no_booking_config", gruppen: [], gesamt: 0 };
  const dauer = Number(minutes) || 0;
  if (!s(date) || !s(calendarId) || !(dauer > 0)) return { ok: false, reason: "luecke_unvollstaendig", gruppen: [], gesamt: 0 };
  const [{ allCandidates, throttled }, absager] = await Promise.all([
    kandidatenBestand(clientId, booking),
    absagerKandidaten(clientId, booking).catch(() => []),
  ]);
  const gap = { startMin: Number(startMin) || 0, endMin: (Number(startMin) || 0) + dauer, minutes: dauer };
  // Wer abgesagt hat UND im Recall faellig ist, zaehlt als Absager, gleich welcher Eintrag vorn steht.
  const absagerIds = new Set(absager.map((c) => s(c.patientId)));
  const hatAbgesagt = (c) => istAbsager(c) || absagerIds.has(s(c.patientId));
  const passend = rankCandidatesForGap([...absager, ...allCandidates], gap, {
    calendarId: s(calendarId), throttled, max: Infinity, reihenfolge: juengsterAnlassZuerst,
  }).filter((c) => !nurAbsager || hatAbgesagt(c));
  const gruppen0 = nachBesuchsgrund(passend);
  let gruppen = besuchsgrundWaehlen(gruppen0, besuchsgrund);
  // Gezaehlt werden alle, mitgeliefert je Besuchsgrund nur die vordersten (juengster Anlass zuerst).
  const gesamt = gruppen.reduce((n, g) => n + g.anzahl, 0);
  const gewaehlt = new Set(gruppen.flatMap((g) => g.patienten.map((p) => p.patientId)));
  const gezaehlt = passend.filter((c) => gewaehlt.has(s(c.patientId)));
  const absagerZahl = gezaehlt.filter(hatAbgesagt).length;
  const juengst = gezaehlt.filter((c) => !hatAbgesagt(c) && (Number(c.overdueDays) || 0) <= 730).length;
  gruppen = gruppen.map((g) => ({ ...g, patienten: g.patienten.slice(0, JE_GRUND) }));
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
