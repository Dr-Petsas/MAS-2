// ============================================================================
// Gezieltes Einbestellen — Clara bereitet einen INDIVIDUELLEN Lisa-Anruf vor,
// um eine konkrete Lücke mit einem vom Chef genannten Patienten zu füllen.
//
// Anders als der Massen-Recall (gapFill/recallCoach) wird hier NICHT gebucht und
// kein automatischer Sweep gestartet: Lisa ruft genau EINEN Patienten an und
// bietet den Termin an. Die Anweisung an Lisa wird aus festen, sicheren
// Bausteinen + den Vorgaben des Chefs zusammengesetzt (keine medizinischen
// Details, keine verbindlichen Zusagen außer dem Terminangebot). Vor dem
// Auslösen liest Clara dem Chef die Instruktion zur Bestätigung vor.
// ============================================================================

const TZ = "Europe/Berlin";

function s(v) {
  return v == null ? "" : String(v).trim();
}

/** ISO-Datum (YYYY-MM-DD) -> "Montag, 16. Juni"; gibt Eingabe bei Müll zurück. */
export function dateDe(isoDate) {
  const d = new Date(`${s(isoDate)}T12:00:00Z`);
  if (isNaN(d.getTime())) return s(isoDate);
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
}

/** "14", "14:30", "14.30", "9 Uhr" -> "14:30" / "09:00". Tolerant. */
export function normTime(t) {
  const m = s(t).match(/(\d{1,2})\s*(?:[:.]\s*(\d{2}))?/);
  if (!m) return s(t);
  const h = String(Math.min(23, Number(m[1]))).padStart(2, "0");
  const min = m[2] ? m[2] : "00";
  return `${h}:${min}`;
}

/**
 * Baut die sichere, strukturierte Anweisung für Lisas Outbound-Call.
 * @param {{patientName?:string, practiceName?:string, date?:string, time?:string,
 *          calendarName?:string, reason?:string, message?:string, liveBooking?:boolean}} input
 * @returns {string} die Anweisung (geht als task_prompt zu Lisa)
 */
// Obergrenze der Gesamtanweisung. lisaStartCall kappt bei 2200 — wir bleiben
// darunter und kürzen NUR die freie Chef-Botschaft, niemals die (vorangestellten)
// Sicherheitsregeln oder die Gesprächsführung am Ende.
const HARD_LIMIT = 1200;

export function composeInviteInstruction({ patientName, practiceName, date, time, calendarName, reason, message, liveBooking = false } = {}) {
  const praxis = s(practiceName) || "der Praxis";
  const t = time ? normTime(time) : "";
  const when = `${date ? `am ${dateDe(date)}` : "kurzfristig"}${t ? ` um ${t} Uhr` : ""}`;
  const bei = calendarName ? ` bei ${s(calendarName)}` : "";

  const head = `Du rufst freundlich im Auftrag von ${praxis} an. Gesprächspartner: ${s(patientName) || "der Patient"}.`;
  // Sicherheitsregeln ZUERST — kritisch (DSGVO/Haftung), dürfen nie gekürzt werden.
  const rules = "Regeln: Nenne KEINE medizinischen Details oder Diagnosen, gib keine Behandlungsauskünfte und mache außer dem Terminangebot keine verbindlichen Zusagen. Bleib kurz und höflich.";
  const anliegen = `Anliegen: Es ist ${when}${bei} kurzfristig ein Termin frei geworden, den wir anbieten möchten.`;
  const anlass = s(reason) ? `Anlass: ${s(reason)}.` : "";
  // W-OUTREACH-2: Mit Kalender-Werkzeugen bucht Lisa live und bietet bei
  // Bedarf sofort Alternativen an — kein Terminwunsch wird abgelehnt.
  const closing = liveBooking
    ? "Frage, ob der Termin passt. Bei Zusage: buche SOFORT mit book_slot und bestätige den Termin erst nach der Werkzeug-Bestätigung. " +
      "Wünscht der Patient einen anderen Zeitpunkt: rufe offer_slots auf (den Wunsch als wish übergeben) und biete die freien Termine an — kein Terminwunsch wird abgelehnt. " +
      "Meldet book_slot, dass der Termin vergeben ist, biete die zurückgemeldeten Alternativen direkt an. " +
      "Nur wenn der Patient gar keinen Termin möchte: bedanke dich freundlich."
    : "Frage, ob der Termin passt. Bei Zusage: bestätige, dass die Praxis den Termin reserviert und sich zur Bestätigung meldet. " +
      "Bei Terminwunsch zu anderer Zeit: sichere zu, dass die Praxis kurzfristig mit passenden Vorschlägen zurückruft. Bei Absage: bedanke dich freundlich.";

  const fixed = [head, rules, anliegen, anlass].filter(Boolean);
  // Budget für die Botschaft = Restplatz bis HARD_LIMIT (fixe Teile + Abschluss
  // + Label "Sage sinngemäß: " gehen immer mit, die Botschaft passt sich an).
  const overhead = [...fixed, closing].join(" ").length + " Sage sinngemäß: ".length + 1;
  const budget = Math.max(0, HARD_LIMIT - overhead);
  let msg = s(message);
  if (msg.length > budget) msg = budget > 1 ? msg.slice(0, budget - 1) + "…" : "";

  const parts = [...fixed];
  if (msg) parts.push(`Sage sinngemäß: ${msg}`);
  parts.push(closing);
  return parts.join(" ");
}

/** Vorlese-Text für die Bestätigung durch den Chef, BEVOR Lisa anruft. */
export function inviteReadback({ patientName, date, time, calendarName, message, liveBooking = false } = {}) {
  const t = time ? normTime(time) : "";
  const when = `${date ? dateDe(date) : "kurzfristig"}${t ? ` um ${t} Uhr` : ""}`;
  const bei = calendarName ? ` bei ${s(calendarName)}` : "";
  const kern = s(message) ? ` Kernbotschaft: ${s(message).replace(/[.!?\s]+$/, "")}.` : "";
  const buchung = liveBooking
    ? " Medizinische Details nennt sie nicht; sagt der Patient zu, bucht Lisa den Termin direkt fest — auf Wunsch auch einen Alternativtermin aus dem Kalender."
    : " Medizinische Details nennt sie nicht und sie bucht nichts fest.";
  return (
    `Ich habe den Anruf für Lisa vorbereitet: Lisa ruft ${s(patientName) || "den Patienten"} an und bietet den Termin ${when}${bei} an.` +
    `${kern}${buchung} Soll Lisa jetzt so anrufen? Sag: ja, anrufen.`
  );
}
