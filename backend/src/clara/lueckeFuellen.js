// Luecke fuellen (Chef 26.11.2026): EINE Datengrundlage fuer das Gespraech mit Clara und fuer
// die Maske "Luecke fuellen" im Kalender. Liest nur: es wird nichts angelegt, niemand angerufen,
// nichts verschickt. Der Start ueber Lisa kommt spaeter und nimmt genau diese Auswahl.
//
//   lueckenFinden      -> welche Luecken gibt es (Sprechzeit minus Termine, wie runGapFill)
//   passendFuerLuecke  -> wer passt in EINE Luecke, gruppiert nach Besuchsgrund
import { loadBooking } from "./booking.js";
import { runGapFill, kandidatenBestand, rankCandidatesForGap, spokenMotiveLabel, faelligSeit } from "./gapFill.js";

const TZ = "Europe/Berlin";
const s = (v) => String(v ?? "").trim();
const hhmm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

/** "2026-11-27" -> "Freitag, den 27. November". */
export function tagGesprochen(day) {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return s(day);
  const wt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(d);
  const dm = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "numeric", month: "long" }).format(d);
  return `${wt}, den ${dm}`;
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

/** Die Luecke, in der die genannte Uhrzeit liegt; sonst die, deren Beginn am naechsten liegt (bis 30 Minuten). */
export function lueckeZurUhrzeit(gaps, minuten) {
  if (minuten == null) return null;
  const drin = gaps.find((g) => g.startMin <= minuten && minuten < g.endMin);
  if (drin) return drin;
  const nah = [...gaps].sort((a, b) => Math.abs(a.startMin - minuten) - Math.abs(b.startMin - minuten))[0];
  return nah && Math.abs(nah.startMin - minuten) <= 30 ? nah : null;
}

/** Pure: Kandidaten einer Luecke nach Besuchsgrund gruppieren, groesste Gruppe zuerst. */
export function nachBesuchsgrund(kandidaten) {
  const gruppen = new Map();
  for (const c of kandidaten) {
    const name = spokenMotiveLabel(c.visitMotiveName) || s(c.visitMotiveName) || s(c.campaignName) || "Recall";
    const key = name.toLowerCase();
    if (!gruppen.has(key)) gruppen.set(key, { besuchsgrund: name, visitMotiveId: s(c.visitMotiveId), dauerMin: Number(c.durationMin) || 0, patienten: [] });
    gruppen.get(key).patienten.push({
      patientId: s(c.patientId),
      name: s(c.name),
      faellig: faelligSeit(c.overdueDays, c.source || (c.campaignId ? "campaign" : "recall")),
      overdueDays: Number(c.overdueDays) || 0,
      telefon: !!s(c.phone),
      quelle: c.campaignId ? "kampagne" : "recall",
      kampagne: s(c.campaignName),
      behandler: s(c.doctorName),
    });
  }
  return [...gruppen.values()]
    .map((g) => ({ ...g, anzahl: g.patienten.length }))
    .sort((a, b) => b.anzahl - a.anzahl);
}

/**
 * Wer passt in diese eine Luecke? Dieselben Tore und dieselbe Reihenfolge wie frueher bei den
 * Anruflisten (Dauer passt, Behandler passt, nicht kuerzlich kontaktiert, kein Spam-Risiko),
 * aber ohne etwas zu speichern.
 */
export async function passendFuerLuecke(clientId, { date, calendarId, startMin, minutes, besuchsgrund = "" } = {}) {
  const booking = await loadBooking(clientId).catch(() => null);
  if (!booking?.locationId) return { ok: false, reason: "no_booking_config", gruppen: [], gesamt: 0 };
  const dauer = Number(minutes) || 0;
  if (!s(date) || !s(calendarId) || !(dauer > 0)) return { ok: false, reason: "luecke_unvollstaendig", gruppen: [], gesamt: 0 };
  const { allCandidates, throttled } = await kandidatenBestand(clientId, booking);
  const gap = { startMin: Number(startMin) || 0, endMin: (Number(startMin) || 0) + dauer, minutes: dauer };
  let passend = rankCandidatesForGap(allCandidates, gap, { calendarId: s(calendarId), throttled, max: 300 });
  const wunsch = s(besuchsgrund).toLowerCase();
  let gruppen = nachBesuchsgrund(passend);
  if (wunsch) {
    const treffer = gruppen.filter((g) => g.besuchsgrund.toLowerCase().includes(wunsch) || wunsch.includes(g.besuchsgrund.toLowerCase()));
    if (treffer.length) gruppen = treffer;
  }
  passend = gruppen.flatMap((g) => g.patienten);
  const calendar = (booking.calendars || []).find((c) => c.id === s(calendarId));
  return {
    ok: true,
    luecke: { date: s(date), calendarId: s(calendarId), calendarName: s(calendar?.name), ...gap },
    gruppen,
    gesamt: passend.length,
  };
}

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
  const wo = `die Lücke am ${tagGesprochen(l.date)} von ${lueckeGesprochen(l)}${l.calendarName ? ` bei ${l.calendarName}` : ""}`;
  if (!fund.gesamt) return `Für ${wo} finde ich im Recall gerade niemanden, der hineinpasst.`;
  const gruende = fund.gruppen.slice(0, 4).map((g) => {
    const namen = g.patienten.slice(0, namenJeGrund).map((p) => (p.faellig ? `${p.name} (${p.faellig})` : p.name));
    return `${g.besuchsgrund}${g.dauerMin ? `, ${g.dauerMin} Minuten` : ""}: ${zahl(g.anzahl, "ein Patient", "Patienten")}, vorn ${namen.join(", ")}`;
  });
  const mehr = fund.gruppen.length > 4 ? ` Dazu ${fund.gruppen.length - 4} weitere Besuchsgründe.` : "";
  return `In ${wo} passen ${zahl(fund.gesamt, "ein Patient", "Patienten")}. ${gruende.join(". ")}.${mehr}`;
}

export const NICHTS_ANGELEGT = "Es ist nichts angelegt und niemand wird angerufen: besprochen wird nur die Auswahl. "
  + "Der Start über Lisa ist noch nicht freigeschaltet.";
