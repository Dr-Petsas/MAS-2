import { getDayAppointments, computeDayBriefing, buildSpokenDayBriefing, todayBerlin } from "./daySchedule.js";
import { runGapFill } from "./gapFill.js";
import { loadBooking, resolveCalendar } from "./booking.js";
import { queryRecent } from "../brain/eventStore.js";
import { buildBriefing } from "../brain/briefing.js";
import { buildRedList, spokenRedList } from "../brain/redList.js";
import { buildMailBriefing } from "../mail/briefing.js";
import { pick, chance } from "./variation.js";
import { ratingsBriefingLine } from "./ratings.js";

// ============================================================================
// Morgen-Moment (Jawdropper ②, Nacht 11./12.06.2026).
//
// Der Chef sagt "Guten Morgen, Clara" — und bekommt EINEN flüssigen Auftakt
// statt vier einzelner Tool-Abfragen: Tagesform, was über Nacht reinkam
// (Anrufe, Mails), was offen ist und wo Geld in Lücken liegt. Salienz vor
// Vollständigkeit: Sektionen ohne Inhalt werden GAR NICHT erwähnt, von
// offenen Anliegen wird nur das wichtigste ausformuliert, der Rest gezählt.
// Formulierungs-Pools sorgen dafür, dass es nicht jeden Morgen die gleiche
// Bandansage ist (O-Ton: "nicht jeden Tag dieselben Formulierungen").
// ============================================================================

// Nur die letzten 48 h zaehlen fuer "was liegt an": ein 7-Tage-Fenster ergab
// im Live-Test "141 offene Anliegen" — das erschlaegt morgens jeden. Aeltere
// offene Sachen bleiben im Monitor und in read_briefing.
const OPEN_LOOKBACK_MS = 48 * 60 * 60 * 1000;

// Anrede: "Dr. Michael Petsas" -> "Dr. Petsas", sonst der Vorname. Der erste
// Token blind ("Dr.!") war die Live-Panne vom ersten Testlauf.
function salutationOf(name) {
  const tokens = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  if (/^(dr|prof)\.?$/i.test(tokens[0])) {
    const last = tokens[tokens.length - 1];
    return last && last !== tokens[0] ? `${tokens[0].replace(/\.?$/, ".")} ${last}` : "";
  }
  return tokens[0];
}

function greetingLine(operatorName) {
  const name = salutationOf(operatorName);
  const base = pick([
    "Guten Morgen",
    "Schönen guten Morgen",
    "Morgen",
  ]);
  const tail = pick([
    "Hier ist Ihr Auftakt für heute.",
    "Ich hab schon mal vorgearbeitet — hier der Überblick.",
    "Kurzer Rundumblick, dann gehört der Tag Ihnen.",
    "Einmal alles Wichtige in einer Minute.",
  ]);
  return `${base}${name ? `, ${name}` : ""}! ${tail}`;
}

// Über Nacht offen gebliebene Anliegen: nur das DRINGENDSTE ausformulieren,
// alles Weitere als Anzahl. Niemand will morgens sieben Listenpunkte hören.
function openItemsLines(briefing) {
  const g = briefing.groups;
  const urgent = g.complaints[0] || g.unresolvedByAI[0] || null;
  const restCount =
    briefing.counts.openTotal - (urgent ? 1 : 0);

  const lines = [];
  if (urgent) {
    lines.push(pick([
      `Eins sollten Sie zuerst wissen: ${urgent.who} — ${urgent.summary}`,
      `Das Wichtigste vorweg: ${urgent.who} — ${urgent.summary}`,
      `Bevor ich's vergesse, das brennt am ehesten: ${urgent.who} — ${urgent.summary}`,
    ]));
  }
  if (restCount > 12) {
    // Massenlage (z.B. nach Import/Testdaten): keine grosse Zahl zelebrieren,
    // sondern einordnen und Filter anbieten.
    lines.push(pick([
      `Daneben ist einiges aufgelaufen — über ${Math.floor(restCount / 10) * 10} offene Einträge, vieles davon Routine. Sag Bescheid, dann filtere ich Ihnen das Wichtigste raus.`,
      `Es liegen außerdem ungewöhnlich viele offene Einträge an, rund ${Math.floor(restCount / 10) * 10}. Die gehen wir besser gezielt durch, wenn Sie mögen.`,
    ]));
    return lines;
  }
  if (restCount > 0) {
    const what = [];
    if (g.callbacks.length) what.push(`${g.callbacks.length} Rückrufbitte${g.callbacks.length === 1 ? "" : "n"}`);
    if (g.billing.length) what.push(`${g.billing.length} Rechnungsfrage${g.billing.length === 1 ? "" : "n"}`);
    if (g.documents.length) what.push(`${g.documents.length} Dokumenten-Anliegen`);
    const detail = what.length ? ` — darunter ${what.join(" und ")}` : "";
    lines.push(pick([
      `Daneben ${restCount === 1 ? "liegt noch ein offenes Anliegen" : `liegen noch ${restCount} offene Anliegen`}${detail}. Sag einfach Bescheid, wenn ich sie durchgehen soll.`,
      `${restCount === 1 ? "Ein weiteres Anliegen ist" : `${restCount} weitere Anliegen sind`} offen${detail} — Details auf Zuruf.`,
    ]));
  }
  return lines;
}

function mailLine(counts) {
  if (!counts) return "";
  const bits = [];
  if (counts.newMail > 0) {
    bits.push(pick([
      `${counts.newMail === 1 ? "Eine neue E-Mail ist" : `${counts.newMail} neue E-Mails sind`} über Nacht reingekommen`,
      `im Postfach ${counts.newMail === 1 ? "wartet eine neue E-Mail" : `warten ${counts.newMail} neue E-Mails`}`,
    ]));
  }
  if (counts.awaitingApproval > 0) {
    bits.push(`${counts.awaitingApproval === 1 ? "ein Entwurf von Nadine wartet" : `${counts.awaitingApproval} Entwürfe von Nadine warten`} auf Ihre Freigabe`);
  }
  if (!bits.length) return "";
  const line = bits.join(", und ");
  return line.charAt(0).toUpperCase() + line.slice(1) + ".";
}

function gapLines(run) {
  if (!run?.ok || !run.gaps?.length) return [];
  const withCands = run.gaps.filter((g) => g.candidateCount > 0).length;
  const lines = [];
  lines.push(pick([
    `Im Kalender ${run.gaps.length === 1 ? "klafft noch eine Lücke" : `klaffen noch ${run.gaps.length} Lücken`}${withCands ? `, für ${withCands === 1 ? "eine" : withCands} hätte ich passende Recall-Kandidaten` : ""}.`,
    `Mir ${run.gaps.length === 1 ? "ist eine freie Lücke aufgefallen" : `sind ${run.gaps.length} freie Lücken aufgefallen`}${withCands ? ` — und ich hätte auch schon Kandidaten dafür` : ""}.`,
  ]));
  // Kein Euro-Satz mehr: Umsatzzahlen sind raus aus allen gesprochenen
  // Briefings (Chef, 12.06.2026) — das wird ein eigenes Lena/Sophie-Element.
  if (run.callLists?.length) {
    lines.push(pick([
      "Die Anruflisten liegen fertig im Monitor — ein Wort von Ihnen und Lisa legt los.",
      "Wenn Sie sie freigeben, telefoniert Lisa die Kandidaten ab.",
    ]));
  }
  return lines;
}

function closingLine() {
  if (!chance(0.6)) return "";
  return pick([
    "Soll ich irgendwo tiefer reingehen?",
    "Wo fangen wir an?",
    "Wenn Sie mehr zu einem Punkt wollen, sagen Sie es einfach.",
    "Das war's von mir — guten Start!",
  ]);
}

/**
 * One flowing spoken morning briefing. Every data source is best-effort: a
 * failing section is silently skipped, the greeting always survives.
 *
 * @param {string} clientId
 * @param {{operatorName?: string, operatorDoctorName?: string, mailAccountIds?: string[]}} opts
 */
export async function spokenMorningBriefing(clientId, opts = {}) {
  const date = todayBerlin();

  // Freie Luecken nur im Kalender des angemeldeten Behandlers zaehlen (sonst
  // meldet Clara leere Kollegen-Kalender als frei, 17.07.2026). Ohne bekannten
  // Behandler bleibt es praxisweit.
  let gapCalId = null;
  if (opts.operatorDoctorName) {
    const booking = await loadBooking(clientId).catch(() => null);
    const cal = booking ? resolveCalendar(booking, opts.operatorDoctorName) : null;
    if (cal) gapCalId = cal.id;
  }

  const [day, events, mail, gapRun, redList, ratingsLine] = await Promise.all([
    getDayAppointments(clientId, { date }).catch(() => null),
    queryRecent(clientId, Date.now() - OPEN_LOOKBACK_MS, 600).catch(() => []),
    buildMailBriefing(clientId, { sinceMinutes: 960, accountIds: opts.mailAccountIds }).catch(() => null),
    runGapFill(clientId, { date, horizonDays: 1, calendarId: gapCalId }).catch(() => null),
    buildRedList(clientId).catch(() => ({ critical: [], deadlines: [] })),
    ratingsBriefingLine(clientId).catch(() => ""),
  ]);

  const parts = [greetingLine(opts.operatorName)];

  // First thing to do: die rote Liste kommt VOR allem anderen — Anwalt,
  // Kammer, Mahnung, Pfändung, verstreichende Fristen (O-Ton Chef).
  const red = spokenRedList(redList, { max: 2, bare: true });
  if (red) {
    parts.push(pick([
      `Zuerst das Unangenehme: ${red}.`,
      `Bevor irgendwas anderes kommt — ${red}.`,
    ]));
  }

  if (day?.ok) {
    const dayBriefing = computeDayBriefing(day.appointments, { calendars: day.calendars });
    parts.push(buildSpokenDayBriefing(dayBriefing, { date, operatorDoctorName: opts.operatorDoctorName || "" }));
  }

  try {
    parts.push(...openItemsLines(buildBriefing(events)));
  } catch { /* Abschnitt entfällt */ }

  const mails = mailLine(mail?.counts);
  if (mails) parts.push(mails);

  // Neue Bewertung seit gestern? Vorlesen UND kommentieren (Wunsch 12.06.:
  // schleimig bei gut, sarkastisch bei schlecht).
  if (ratingsLine) parts.push(ratingsLine.trim());

  parts.push(...gapLines(gapRun));

  const closing = closingLine();
  if (closing) parts.push(closing);

  return parts.filter(Boolean).join(" ");
}
