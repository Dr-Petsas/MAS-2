// ============================================================================
// Übersichts-Karten (04.07.2026): strukturierte "Cards" für die Clara-Handy-App
// im Design des pickadoc.ai-Heros (Nächster Patient / Das Wichtigste / Chips).
//
// Jede Karte ist REINE Daten (kein HTML) und fährt ADDITIV in den bestehenden
// Tool-Antworten mit (Feld `card` bzw. `cards`). Der Sprach-Worker reicht sie
// als DataChannel-Event {type:"card", card} ans Handy durch; dort rendert
// /m/call.html sie im Chat inline und im Audio-Modus auf der Flip-Rückseite.
//
// Vertragstreue: bestehende Antwortfelder bleiben unverändert — Karten sind
// nur ein Zusatzfeld. Sprachtext (message) bleibt die Wahrheit fürs Vorlesen;
// die Karte ist die Sichtform derselben Fakten (deterministisch, kein LLM).
//
// Schema:
//   { kind, tag, title, time, subtitle, heading,
//     items: [{ level: "alert"|"warn"|"info"|"ok", icon, text, href? }],
//     detail?, footer }
// Icons (Handy rendert Inline-SVG, Fallback nach level):
//   alert droplet heart scissors mail phone pen note ray euro calendar
//   check clock doc person tooth question mic
//
// `detail` (W-FLIP-TIEFE, additiv/optional): reicher, DETERMINISTISCHER
// Fakten-Text hinter den (fuer die Anzeige gekappten) `items`-Chips. Der
// Sprach-Worker legt ihn in seinen turn-uebergreifenden Anzeige-Kontext
// (displayed_context) und speist ihn als gesicherten Grounding-Block ins LLM —
// so kann Clara auf einen angezeigten Punkt fundiert & eloquent eingehen, ohne
// zu halluzinieren (Fakten-Waechter behandelt Angezeigtes als gedeckt). `items`
// bleibt unveraendert die Anzeige-Zusammenfassung; das Handy ignoriert `detail`.
// ============================================================================

const TZ = "Europe/Berlin";

function hhmm(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  } catch { return ""; }
}

function datumKurz(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: TZ });
  } catch { return ""; }
}

/** "11:30 Uhr" fuer heute, sonst "07.07. 11:30" — Karten sind datumsehrlich. */
function zeitLabel(ms) {
  if (!ms) return "";
  const heute = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const tag = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
  return tag === heute ? `${hhmm(ms)} Uhr` : `${datumKurz(ms)} ${hhmm(ms)}`;
}

function clip(s, n = 90) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** "2026-07-03" -> "03.07." — der Doku-Wächter liefert ISO-Tage. */
function isoKurz(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "").trim());
  return m ? `${m[3]}.${m[2]}.` : String(iso || "");
}

/** Nur tel:/mailto: — die Flip-Karte macht daraus einen Tipp-Link. */
function telHref(n) {
  const digits = String(n || "").replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 6) return "";
  return `tel:${digits}`;
}

function mailHref(e) {
  const raw = String(e || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return "";
  return `mailto:${raw}`;
}

function item(level, icon, text, href) {
  const row = { level, icon, text: clip(text, 110) };
  if (href) row.href = href;
  return row;
}

/**
 * Reicher, UNGEKAPPTER Fakten-Text fuer `detail` (W-FLIP-TIEFE). Anders als
 * `items` (fuer die Anzeige geclippt/limitiert) traegt `detail` die VOLLEN
 * Quelldaten, damit Clara auf Nachfrage vertiefen kann. Reine Anzeige-Fakten,
 * additiv. Leere Zeilen fallen raus; einzelne Zeilen bleiben je eine Aussage.
 */
function detailText(lines) {
  const out = (lines || [])
    .map((l) => String(l == null ? "" : l).replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  return out.length ? out.join("\n") : "";
}

/** Volle Anamnese-Zeile (ohne Chip-Kappung) fuer den detail-Block. */
function anamneseZeile(f) {
  const cat = String(f?.category || "").trim();
  if (!cat) return "";
  return f?.text && f.text !== "ja" ? `${cat}: ${f.text}` : cat;
}

/** Anamnese-Kategorie -> Chip (Farbe + Icon) wie im Website-Hero. */
function anamneseItem(f) {
  const cat = String(f?.category || "").toLowerCase();
  const txt = f?.text && f.text !== "ja" ? `${f.category}: ${f.text}` : f?.category || "";
  if (!txt) return null;
  if (cat.startsWith("allerg")) return item("alert", "alert", txt);
  if (cat.startsWith("medikament")) return item("alert", "droplet", txt);
  if (cat.startsWith("blutung") || cat.includes("gerinnung")) return item("alert", "droplet", txt);
  if (cat.startsWith("vorerkrank")) return item("warn", "heart", txt);
  if (cat.startsWith("schwanger")) return item("warn", "person", txt);
  if (cat.startsWith("raucher")) return item("info", "note", txt);
  return item("warn", "note", txt);
}

/**
 * Patienten-Heads-up-Karte — das Website-Hero-Motiv ("Nächster Patient",
 * "Das Wichtigste") mit ECHTEN Daten.
 */
export function kartePatient({
  name, startMs, motive, neupatient = false, comments = "",
  anamneseFindings = [], klinikHinweise = [], letzterBesuch = null,
  fallText = "", docsStatus = "", tag = "Nächster Patient", calendarName = "",
  commentsFull = "",
} = {}) {
  const items = [];

  for (const f of (anamneseFindings || []).slice(0, 5)) {
    const it = anamneseItem(f);
    if (it) items.push(it);
  }
  for (const h of (klinikHinweise || []).slice(0, 2)) {
    items.push(item("warn", "note", h));
  }
  if (letzterBesuch?.motive) {
    const wann = letzterBesuch.startMs ? ` (${datumKurz(letzterBesuch.startMs)})` : "";
    items.push(item("info", "calendar", `Zuletzt: ${letzterBesuch.motive}${wann}`));
    if (letzterBesuch.note) items.push(item("info", "note", `Notiz: ${letzterBesuch.note}`));
  }
  if (comments) items.push(item("info", "pen", `Geplant: ${comments}`));
  if (fallText) items.push(item("info", "mail", fallText));
  if (neupatient) items.push(item("info", "person", "Neupatient"));
  if (docsStatus === "red") items.push(item("alert", "pen", "Einwilligung fehlt"));
  else if (docsStatus === "yellow") items.push(item("warn", "pen", "Unterlagen verschickt, nicht unterschrieben"));

  // W-FLIP-TIEFE: volle Fakten (alle Anamnese-Funde, ganze Letzter-Besuch-Notiz,
  // kompletter Geplant-/Fall-Text) — ungekappt fuer die Tiefen-Nachfrage.
  const dLines = [];
  const wann = startMs ? zeitLabel(startMs) : "";
  dLines.push(`${name || "Patient"}${wann ? ` — ${wann}` : ""}${motive ? `, ${motive}` : ""}${calendarName ? ` (bei ${calendarName})` : ""}.`);
  if (neupatient) dLines.push("Neupatient.");
  const anamnese = (anamneseFindings || []).map(anamneseZeile).filter(Boolean);
  if (anamnese.length) dLines.push(`Anamnese: ${anamnese.join("; ")}.`);
  for (const h of (klinikHinweise || [])) if (h) dLines.push(`Hinweis: ${h}`);
  if (letzterBesuch?.motive) {
    const lb = letzterBesuch.startMs ? ` am ${datumKurz(letzterBesuch.startMs)}` : "";
    dLines.push(`Letzter Besuch${lb}: ${letzterBesuch.motive}.`);
  }
  if (letzterBesuch?.note) dLines.push(`Notiz vom letzten Besuch: ${letzterBesuch.note}`);
  if (commentsFull || comments) dLines.push(`Für heute geplant: ${commentsFull || comments}`);
  if (fallText) dLines.push(fallText);
  if (docsStatus === "red") dLines.push("Einwilligung/Unterlagen fehlen noch komplett.");
  else if (docsStatus === "yellow") dLines.push("Unterlagen wurden verschickt, sind aber noch nicht unterschrieben.");

  return {
    kind: "patient",
    tag,
    title: clip(name, 40) || "Patient",
    time: zeitLabel(startMs),
    subtitle: [motive || "", calendarName ? `bei ${calendarName}` : ""].filter(Boolean).join(" · "),
    heading: "Das Wichtigste",
    items: items.slice(0, 8),
    detail: detailText(dLines),
    footer: "",
  };
}

/** Tagesplan-Karte fürs Lagebild ("Tagesbriefing"). */
export function karteTag({
  dateLabel = "Heute", total = 0, firstMs = 0, lastMs = 0,
  newPatients = 0, unconfirmed = 0, docsRed = 0, docsYellow = 0,
  gaps = [], attention = [], mails = 0, calls = 0, highlights = [],
} = {}) {
  const items = [];
  for (const h of (highlights || []).slice(0, 2)) items.push(item("alert", "alert", h));
  for (const g of (gaps || []).slice(0, 3)) {
    items.push(item("info", "clock", `Frei: ${hhmm(g.startMs)}–${hhmm(g.endMs)} Uhr`));
  }
  if (newPatients) items.push(item("info", "person", newPatients === 1 ? "1 Neupatient" : `${newPatients} Neupatienten`));
  if (unconfirmed) items.push(item("warn", "question", `${unconfirmed} Termin${unconfirmed === 1 ? "" : "e"} unbestätigt`));
  if (docsRed) items.push(item("alert", "pen", `${docsRed}× Unterlagen fehlen ganz`));
  if (docsYellow) items.push(item("warn", "pen", `${docsYellow}× Unterlagen nicht unterschrieben`));
  for (const a of (attention || []).slice(0, 3)) {
    const wer = a.patientName || a.patientLastName || "";
    if (a.comments) items.push(item("info", "note", `${hhmm(a.startMs)} ${wer}: ${a.comments}`));
  }
  if (mails) items.push(item("info", "mail", mails === 1 ? "1 E-Mail eingegangen" : `${mails} E-Mails eingegangen`));
  if (calls) items.push(item("info", "phone", calls === 1 ? "1 Anruf eingegangen" : `${calls} Anrufe eingegangen`));
  if (!items.length && !total) items.push(item("ok", "check", "Keine Termine gebucht"));

  const spanne = firstMs && lastMs ? `${hhmm(firstMs)}–${hhmm(lastMs)} Uhr` : "";

  // W-FLIP-TIEFE: vollstaendiges Lagebild (ALLE Luecken/Highlights/Attention),
  // ungekappt — Grundlage fuer "geh genauer auf den Tag ein".
  const dLines = [];
  dLines.push(`${dateLabel}: ${total === 1 ? "1 Termin" : `${total} Termine`}${spanne ? `, ${spanne}` : ""}.`);
  for (const h of (highlights || [])) if (h) dLines.push(`Wichtig: ${h}`);
  if (newPatients) dLines.push(newPatients === 1 ? "1 Neupatient." : `${newPatients} Neupatienten.`);
  if (unconfirmed) dLines.push(`${unconfirmed} Termin${unconfirmed === 1 ? "" : "e"} noch unbestätigt.`);
  if (docsRed) dLines.push(`${docsRed}× Unterlagen fehlen komplett.`);
  if (docsYellow) dLines.push(`${docsYellow}× Unterlagen nicht unterschrieben.`);
  for (const g of (gaps || [])) dLines.push(`Freie Zeit: ${hhmm(g.startMs)}–${hhmm(g.endMs)} Uhr.`);
  for (const a of (attention || [])) {
    const wer = a.patientName || a.patientLastName || "";
    if (a.comments) dLines.push(`${hhmm(a.startMs)} ${wer}: ${a.comments}`.trim());
  }
  if (mails) dLines.push(mails === 1 ? "1 E-Mail eingegangen." : `${mails} E-Mails eingegangen.`);
  if (calls) dLines.push(calls === 1 ? "1 Anruf eingegangen." : `${calls} Anrufe eingegangen.`);

  return {
    kind: "tag",
    tag: "Tagesplan",
    title: dateLabel,
    time: spanne,
    subtitle: total === 1 ? "1 Termin" : `${total} Termine`,
    heading: "Auf einen Blick",
    items: items.slice(0, 8),
    detail: detailText(dLines),
    footer: "",
  };
}

/** ISO-Tag -> kurzes Kartenlabel ("Heute", "Morgen", sonst "Do 23.07."). */
export function tagLabelKurz(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const heute = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const diff = Math.round((Date.parse(`${s}T12:00:00Z`) - Date.parse(`${heute}T12:00:00Z`)) / 86400000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === -1) return "Gestern";
  const d = new Date(`${s}T12:00:00Z`);
  const wt = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: TZ }).format(d);
  return `${wt} ${isoKurz(s)}`;
}

/**
 * Terminlisten-Karte (27.07.2026, Chef-Befund "das Flippen gibt keine
 * Informationen mehr"): Die meistgestellte Frage — "Was habe ich heute für
 * Termine?" — landet deterministisch bei list_day_appointments, und genau
 * dieses Tool hatte als einziges Kalender-Tool KEINE Karte. Die Flip-Rückseite
 * blieb deshalb im Alltag leer, obwohl gesprochen alles kam. Diese Karte zeigt
 * dieselben Fakten wie der gesprochene Text: Uhrzeit, Name, Motiv, Unterlagen.
 *
 * `appointments`: {startMs, patientName, patientLastName, visitMotive,
 * calendarName, comments, docsStatus}.
 */
export function karteTerminliste({
  dateIso = "", appointments = [], remaining = false, doctorName = "",
} = {}) {
  const liste = (appointments || []).filter(Boolean);
  const label = tagLabelKurz(dateIso) || "Termine";
  const zeile = (a) => {
    const wer = a.patientName || a.patientLastName || "Patient";
    const was = a.visitMotive ? ` — ${a.visitMotive}` : "";
    return `${hhmm(a.startMs)} ${wer}${was}`.trim();
  };
  const levelOf = (a) => (a.docsStatus === "red" ? "alert" : a.docsStatus === "yellow" ? "warn" : "info");
  const iconOf = (a) => (a.docsStatus === "red" || a.docsStatus === "yellow" ? "pen" : "clock");

  const items = liste.slice(0, 8).map((a) => item(levelOf(a), iconOf(a), zeile(a)));
  if (!items.length) items.push(item("ok", "check", remaining ? "Keine weiteren Termine" : "Keine Termine an diesem Tag"));

  const firstMs = liste.length ? liste[0].startMs : 0;
  const lastMs = liste.length ? liste[liste.length - 1].startMs : 0;

  // W-FLIP-TIEFE: ALLE Termine mit Notiz und Unterlagen-Stand (die Anzeige
  // zeigt nur die ersten 8) — Grundlage für "geh auf den Dritten ein".
  const dLines = [`${label}${doctorName ? ` (${doctorName})` : ""}: ${
    liste.length === 1 ? "1 Termin" : `${liste.length} Termine`}${remaining ? " (nur noch anstehende)" : ""}.`];
  for (const a of liste) {
    const zusatz = [];
    if (a.calendarName) zusatz.push(`bei ${a.calendarName}`);
    if (a.comments) zusatz.push(`Notiz: ${a.comments}`);
    if (a.docsStatus === "red") zusatz.push("Unterlagen fehlen komplett");
    else if (a.docsStatus === "yellow") zusatz.push("Unterlagen nicht unterschrieben");
    dLines.push(`${zeile(a)}${zusatz.length ? ` (${zusatz.join("; ")})` : ""}`);
  }

  return {
    kind: "terminliste",
    tag: remaining ? "Noch anstehend" : "Terminliste",
    title: label,
    time: firstMs && lastMs && liste.length > 1 ? `${hhmm(firstMs)}–${hhmm(lastMs)} Uhr` : (firstMs ? `${hhmm(firstMs)} Uhr` : ""),
    subtitle: [
      liste.length === 1 ? "1 Termin" : `${liste.length} Termine`,
      doctorName ? `bei ${doctorName}` : "",
    ].filter(Boolean).join(" · "),
    heading: "Der Reihe nach",
    items,
    detail: detailText(dLines),
    footer: liste.length > 8 ? `${liste.length - 8} weitere` : "",
  };
}

/**
 * Zeitraum-Karte ("Wie war letzte Woche?", "Termine nächsten Monat") — die
 * Tages-Aufschlüsselung, die gesprochen ohnehin kommt, auch auf dem Flip.
 * `days`: {date, count}.
 */
export function karteZeitraum({ label = "Zeitraum", from = "", to = "", days = [], total = 0 } = {}) {
  const tage = (days || []).filter((d) => d && d.date);
  const zeile = (d) => `${tagLabelKurz(d.date) || isoKurz(d.date)}: ${
    Number(d.count) === 1 ? "1 Termin" : `${Number(d.count) || 0} Termine`}`;
  const items = tage.slice(0, 8).map((d) => item(Number(d.count) ? "info" : "ok", "calendar", zeile(d)));
  if (!items.length) items.push(item("ok", "check", "Keine Termine im Zeitraum"));

  const dLines = [`${label}${from && to ? ` (${isoKurz(from)}–${isoKurz(to)})` : ""}: ${
    total === 1 ? "1 Termin" : `${total} Termine`}.`];
  for (const d of tage) dLines.push(zeile(d));

  return {
    kind: "zeitraum",
    tag: "Zeitraum",
    title: label,
    time: from && to ? `${isoKurz(from)}–${isoKurz(to)}` : "",
    subtitle: total === 1 ? "1 Termin" : `${total} Termine`,
    heading: "Tag für Tag",
    items,
    detail: detailText(dLines),
    footer: tage.length > 8 ? `${tage.length - 8} weitere Tage` : "",
  };
}

/**
 * Kontaktkarte auf dem Flip (27.07.2026): contact_card sagt "Ich habe dir die
 * Kontaktkarte aufs Handy geschickt" und verschickt dafür eine Push-Nachricht.
 * Auf der Flip-Rückseite stand trotzdem nichts — deshalb dieselben Daten auch
 * als Karte. Die Nummer bleibt als ZIFFERN stehen (Ablesen), bekommt aber
 * einen tel:/mailto-Tipp (Chef 14.08.2026). Gesprochen weiter in Gruppen.
 */
export function karteKontakt({ name = "", mobile = "", phone = "", email = "", pushed = false } = {}) {
  const items = [];
  if (mobile) items.push(item("info", "phone", `Mobil: ${mobile}`, telHref(mobile)));
  if (phone) items.push(item("info", "phone", `Festnetz: ${phone}`, telHref(phone)));
  if (email) items.push(item("info", "mail", email, mailHref(email)));
  if (!items.length) items.push(item("warn", "question", "Keine Kontaktdaten hinterlegt"));

  const dLines = [`Kontakt ${name}:`];
  if (mobile) dLines.push(`Mobil ${mobile}`);
  if (phone) dLines.push(`Festnetz ${phone}`);
  if (email) dLines.push(`E-Mail ${email}`);

  return {
    kind: "kontakt",
    tag: "Kontakt",
    title: clip(name, 40) || "Kontakt",
    time: "",
    subtitle: mobile || phone || email || "",
    heading: "Erreichbar über",
    items,
    detail: detailText(dLines),
    footer: pushed ? "Auch als Push aufs Handy geschickt" : "",
  };
}

const LISA_AUSGANG = {
  reached: { wort: "erreicht", level: "ok", icon: "check" },
  voicemail: { wort: "auf die Mailbox gesprochen", level: "warn", icon: "phone" },
  no_answer: { wort: "nicht erreicht", level: "warn", icon: "phone" },
  failed: { wort: "nicht zustande gekommen", level: "alert", icon: "alert" },
};

/**
 * Ergebnis eines von Clara delegierten Lisa-Anrufs (Chef 27.07.2026: "sie gibt
 * keine Rueckmeldung ueber den Gespraechsverlauf"). Vorne der Ausgang und die
 * Zusammenfassung des GANZEN Dialogs, hinten (detail) der vollstaendige
 * Wortlaut — damit Clara auf Nachfragen dazu fundiert antworten kann, ohne zu
 * raten (der Anzeige-Kontext gilt dem Fakten-Waechter als gedeckt).
 */
/**
 * Live-Karte, sobald Clara einen Anruf an Lisa gibt. Das Handy flippt darauf
 * und pollt den Task — kein Ergebnis-Bericht, sondern der laufende Anruf.
 */
export function karteLisaLive({
  taskId = "", contactName = "", phone = "", status = "calling", instruction = "",
  scheduledForText = "",
} = {}) {
  const wer = clip(contactName || phone, 40) || "Kontakt";
  const phase = status === "confirm"
    ? "Bitte bestätigen — noch kein Anruf."
    : status === "scheduled"
      ? `Eingeplant — Lisa ruft ${scheduledForText || "später"} an (Anrufzeiten).`
      : `Lisa wählt ${phone || "die Nummer"} …`;
  return {
    kind: "lisa_live",
    taskId: String(taskId || ""),
    phone: String(phone || ""),
    contactName: String(contactName || ""),
    status: String(status || "calling"),
    instruction: String(instruction || ""),
    scheduledForText: String(scheduledForText || ""),
    tag: status === "confirm" ? "Lisa · Bestätigen" : "Lisa live",
    title: wer,
    time: "",
    subtitle: phase,
    heading: "Auftrag",
    items: [
      item("info", "phone", phase),
      ...(instruction ? [item("info", "note", clip(instruction, 110))] : []),
    ].slice(0, 6),
    detail: detailText([
      status === "confirm" ? `Bitte bestätigen: ${wer}.` : `Lisa ruft ${wer} an.`,
      phone ? `Nummer: ${phone}` : "",
      instruction ? `Auftrag: ${instruction}` : "",
    ].filter(Boolean)),
  };
}

/** Flip-Karte fuer eine von Lisa versendete SMS — der Vorgang, nicht nur „raus“. */
export function karteLisaSms({
  taskId = "", contactName = "", phone = "", body = "", status = "done",
} = {}) {
  const wer = clip(contactName || phone, 40) || "Kontakt";
  const ok = status !== "failed" && status !== "no_phone";
  return {
    kind: "lisa_sms",
    taskId: String(taskId || ""),
    phone: String(phone || ""),
    contactName: String(contactName || ""),
    body: String(body || ""),
    status: String(status || "done"),
    tag: "Lisa · SMS",
    title: wer,
    time: "",
    subtitle: ok ? "Lisa schreibt eine SMS." : "Lisa kommt nicht durch.",
    heading: "Vorgang",
    items: [
      item("info", "person", `Sucht ${wer}`),
      item(phone ? "ok" : "warn", "phone", phone ? `Nummer ${clip(phone, 24)}` : "Keine Nummer"),
      ...(body ? [item("info", "note", clip(body, 110))] : []),
      item(ok ? "ok" : "alert", "mail", ok ? "SMS versendet" : "Nicht versendet"),
    ].slice(0, 6),
    detail: detailText([
      `Lisa schreibt eine SMS an ${wer}.`,
      phone ? `Nummer: ${phone}` : "Keine Nummer hinterlegt.",
      body ? `Text: ${body}` : "",
    ].filter(Boolean)),
  };
}

export function karteLisaErgebnis({
  contactName = "", phone = "", outcome = "", summary = "", auftrag = "",
  transcript = "", endedMs = 0, durationSecs = 0,
} = {}) {
  const a = LISA_AUSGANG[outcome] || { wort: outcome || "unbekannt", level: "info", icon: "phone" };
  const items = [item(a.level, a.icon, `Ausgang: ${a.wort}`)];
  if (summary) items.push(item("info", "note", summary));
  if (auftrag) items.push(item("info", "pen", `Auftrag: ${auftrag}`));
  if (durationSecs > 0) {
    const min = Math.floor(durationSecs / 60);
    const sek = durationSecs % 60;
    items.push(item("info", "clock", min ? `Dauer: ${min} Min. ${sek} Sek.` : `Dauer: ${sek} Sek.`));
  }

  const dLines = [`Lisas Anruf bei ${contactName || phone || "unbekannt"}: ${a.wort}.`];
  if (auftrag) dLines.push(`Auftrag war: ${auftrag}`);
  if (summary) dLines.push(`Zusammenfassung: ${summary}`);
  if (transcript) {
    dLines.push("Gesprächsverlauf:");
    for (const zeile of String(transcript).split("\n").slice(0, 60)) {
      const m = /^([A-Za-z_]+):\s*(.+)$/.exec(zeile.trim());
      if (!m) continue;
      const wer = ["agent", "assistant"].includes(m[1].toLowerCase()) ? "Lisa" : contactName || "Gegenüber";
      dLines.push(`${wer}: ${m[2].trim()}`);
    }
  }

  return {
    kind: "lisa",
    tag: "Lisas Anruf",
    title: clip(contactName || phone, 40) || "Anruf",
    time: endedMs ? zeitLabel(endedMs) : "",
    subtitle: a.wort,
    heading: "Ergebnis",
    items: items.slice(0, 8),
    detail: detailText(dLines),
  };
}

/**
 * Doku-Memo-Karte — die "geflippte Rückseite" beim Diktieren: gespeicherte
 * Notiz-Punkte + was für die lückenlose Doku/Abrechnung noch fehlt.
 */
export function karteDoku({
  patientName = "", motiveName = "", apptStartMs = 0, combinedText = "",
  fragen = [], abrechnung = null, luecken = [], lernVorschlag = null,
  gestrichen = "",
} = {}) {
  const items = [];

  const zeilen = String(combinedText || "").split("\n").map((z) => z.trim()).filter(Boolean);
  for (const z of zeilen.slice(-5)) items.push(item("ok", "note", z));
  if (gestrichen) items.push(item("info", "pen", `Gestrichen: ${gestrichen}`));

  for (const f of (fragen || []).slice(0, 3)) {
    items.push(item("warn", "question", f?.frage || f));
  }
  if (abrechnung?.status === "needs_input" && abrechnung.frage) {
    items.push(item("warn", "euro", `Sophie fragt: ${abrechnung.frage}`));
  } else if (abrechnung?.status === "complete") {
    items.push(item("ok", "euro", `Abrechnung vollständig${abrechnung.label ? ` — ${abrechnung.label}` : ""}`));
  }
  for (const l of (luecken || []).slice(0, 2)) {
    items.push(item("alert", "calendar", `Doku fehlt: ${isoKurz(l.date)} ${l.motive || ""}`.trim()));
  }
  if (lernVorschlag?.feldKey) {
    items.push(item("info", "question", `Künftig immer nach „${lernVorschlag.feldKey.replace(/_/g, " ")}" fragen?`));
  }
  if (!items.length) items.push(item("ok", "check", "Noch nichts dokumentiert"));

  const offen = (fragen || []).length + (abrechnung?.status === "needs_input" ? 1 : 0);

  // W-FLIP-TIEFE: ganze Doku (ALLE Notiz-Zeilen, alle offenen Fragen/Luecken)
  // ungekappt — die Anzeige zeigt nur die letzten 5 Zeilen.
  const dLines = [];
  dLines.push(`Doku-Memo${patientName ? ` für ${patientName}` : ""}${motiveName ? `, ${motiveName}` : ""}${apptStartMs ? ` (${datumKurz(apptStartMs)})` : ""}.`);
  for (const z of zeilen) dLines.push(`• ${z}`);
  if (gestrichen) dLines.push(`Gestrichen: ${gestrichen}`);
  for (const f of (fragen || [])) { const q = f?.frage || f; if (q) dLines.push(`Offene Frage: ${q}`); }
  if (abrechnung?.status === "needs_input" && abrechnung.frage) dLines.push(`Sophie fragt: ${abrechnung.frage}`);
  else if (abrechnung?.status === "complete") dLines.push(`Abrechnung vollständig${abrechnung.label ? ` — ${abrechnung.label}` : ""}.`);
  for (const l of (luecken || [])) dLines.push(`Doku fehlt: ${isoKurz(l.date)} ${l.motive || ""}`.trim());
  if (lernVorschlag?.feldKey) dLines.push(`Vorschlag: künftig immer nach „${lernVorschlag.feldKey.replace(/_/g, " ")}" fragen?`);

  return {
    kind: "doku",
    tag: "Doku-Memo",
    title: clip(patientName, 40) || "Termin",
    time: apptStartMs ? `${datumKurz(apptStartMs)}` : "",
    subtitle: motiveName || "",
    heading: "Notizen",
    items: items.slice(0, 9),
    detail: detailText(dLines),
    footer: offen ? `${offen} Punkt${offen === 1 ? "" : "e"} offen` : "Doku vollständig",
  };
}

/**
 * Patienten-Dokumente-Karte (Chef 29.07.2026): welche Dokumente liegen vor,
 * unterschrieben/offen, Pflicht, abgelaufen. Ehrliche Sichtform der echten
 * pdocuments — Gegengift zur Dokument-Halluzination.
 */
export function karteDokumente({ who = "", docs = [] } = {}) {
  const liste = Array.isArray(docs) ? docs : [];
  const signierte = liste.filter((d) => d.signed);
  const offene = liste.filter((d) => !d.signed);
  const items = [];
  for (const d of signierte.slice(0, 6)) {
    const wann = d.ms ? ` (${datumKurz(d.ms)})` : "";
    items.push(item(d.expired ? "warn" : "ok", d.expired ? "clock" : "check", `${d.name}${wann}${d.expired ? " — abgelaufen" : ""}`));
  }
  for (const d of offene.slice(0, 4)) {
    items.push(item(d.mandatory ? "alert" : "warn", "pen", `Offen: ${d.name}${d.mandatory ? " (Pflicht)" : ""}`));
  }
  if (!items.length) items.push(item("info", "doc", "Keine Dokumente hinterlegt"));

  const dLines = [`Dokumente${who ? ` von ${who}` : ""}:`];
  for (const d of liste) {
    const wann = d.ms ? ` ${datumKurz(d.ms)}` : "";
    const st = d.signed ? "unterschrieben" : (d.mandatory ? "offen (Pflicht)" : "offen");
    dLines.push(`• ${d.name} — ${st}${wann}${d.expired ? ", abgelaufen" : ""}`);
  }

  return {
    kind: "dokumente",
    tag: "Dokumente",
    title: clip(who, 40) || "Patient",
    subtitle: liste.length ? `${signierte.length} von ${liste.length} unterschrieben` : "",
    heading: "Dokumente",
    items: items.slice(0, 10),
    detail: detailText(dLines),
    footer: offene.length ? `${offene.length} offen` : (liste.length ? "alle unterschrieben" : ""),
  };
}

/** Praxisweite Doku-Lücken ("Welche Dokus fehlen noch?"). */
export function karteLuecken(luecken = []) {
  const items = (luecken || []).slice(0, 7).map((l) => item(
    "warn", "calendar",
    `${isoKurz(l.date)} ${l.patientName || ""}${l.motive ? ` — ${l.motive}` : ""}`.trim(),
  ));
  if (!items.length) items.push(item("ok", "check", "Alle Termine sind dokumentiert"));
  // W-FLIP-TIEFE: ALLE offenen Doku-Termine (Anzeige zeigt nur die ersten 7).
  const dLines = (luecken || []).map((l) => (
    `${isoKurz(l.date)} ${l.patientName || ""}${l.motive ? ` — ${l.motive}` : ""}`.trim()
  ));
  return {
    kind: "luecken",
    tag: "Doku-Wächter",
    title: "Offene Dokumentationen",
    time: "",
    subtitle: luecken?.length ? `${luecken.length} Termin${luecken.length === 1 ? "" : "e"} ohne Doku` : "Alles vollständig",
    heading: "Nachzutragen",
    items,
    detail: dLines.length ? `Offene Dokumentationen (${luecken.length}):\n${detailText(dLines)}` : "",
    footer: "",
  };
}

/**
 * Recall-Kandidaten-Karte (Chef 28.07.2026): die vorgeschlagenen Patienten
 * EINER Anrufliste, gruppiert lesbar mit Kontakt-Zaehlern am Namen —
 * hochgestellte Gesamtzahl + ✓-Erfolgszahl ("Maria Ackermann ⁵ ✓²"). Die
 * Rohwerte fahren strukturiert mit (stats), damit die App die Erfolgszahl
 * echt gruen rendern kann. Level macht die Spam-Sicht farbig: ok = hat schon
 * gebucht, warn = mehrfach kontaktiert ohne Termin, info = neutral.
 * candidates: {anzeigeName, name, thema, faellig, viaWort, stats}.
 */
export function karteRecallKandidaten({
  caseId = "", slotLabel = "", calendarName = "", date = "", candidates = [], status = "",
} = {}) {
  const levelFor = (c) => {
    const st = c.stats || {};
    if ((st.booked || 0) > 0) return "ok";
    if ((st.contacts || 0) >= 2) return "warn";
    return "info";
  };
  // pid je Item: Handgriff fuer die Muelltonne auf der Telefon-Karte
  // (call.html) — ohne pid rendert die App eine reine Anzeige-Zeile.
  const items = (candidates || []).slice(0, 7).map((c) => ({
    ...item(
      levelFor(c),
      c.viaWort === "SMS" ? "mail" : "phone",
      `${c.anzeigeName || c.name}${c.thema ? ` — ${c.thema}` : ""}${c.faellig ? ` (${c.faellig})` : ""}`,
    ),
    pid: String(c.patientId || ""),
    name: String(c.name || ""),
  }));
  if (!items.length) items.push(item("info", "question", "Keine Kandidaten hinterlegt"));

  // W-FLIP-TIEFE: volle Zeilen inkl. ausgeschriebener Zaehler fuer Rueckfragen.
  const dLines = (candidates || []).map((c) => {
    const st = c.stats || {};
    const z = (st.contacts || 0) > 0
      ? ` — ${st.contacts} Kontakt${st.contacts === 1 ? "" : "e"} bisher, ${st.booked || 0} Termin${(st.booked || 0) === 1 ? "" : "e"} daraus`
      : "";
    return `${c.name}${c.thema ? ` (${c.thema})` : ""}${c.faellig ? `, ${c.faellig}` : ""}${z}`;
  });
  return {
    kind: "recall_kandidaten",
    caseId: String(caseId || ""),
    tag: "Anrufliste",
    title: `${slotLabel}${calendarName ? ` · ${calendarName}` : ""}`.trim() || "Anrufliste",
    time: date ? isoKurz(date) : "",
    subtitle: `${candidates.length} Kandidat${candidates.length === 1 ? "" : "en"}${status ? ` · ${status}` : ""}`,
    heading: "Vorschläge (Kontakte ✓Termine)",
    items,
    detail: dLines.length ? `Kandidaten (${candidates.length}):\n${detailText(dLines)}` : "",
    footer: "Freigabe: „Recall freigeben“ — SMS-Zusage-Links buchen automatisch",
  };
}

/**
 * Eingaenge-Karte (Post/Anrufe/Bewertungen) fuer "Was ist heute reingekommen?"
 * — W-FLIP-TIEFE (WP8). Anzeige: Zaehlung + die wichtigsten Eingaenge; `detail`:
 * ALLE Eingaenge mit vollem Inhalt, damit Clara auf "geh auf die Mails ein"
 * fundiert antworten kann. `entries`: {startMs, kind, word, who, text, open}.
 */
export function karteEingaenge({
  dateLabel = "Heute", total = 0, calls = 0, mails = 0, letters = 0,
  front = 0, open = 0, entries = [],
} = {}) {
  const iconFor = (kind) => (kind === "call" ? "phone" : kind === "frontdesk" ? "person" : "mail");
  const zeile = (en) => (
    `${hhmm(en.startMs)} ${en.word}${en.who ? ` von ${en.who}` : ""}${en.text ? `: ${en.text}` : ""}`.trim()
  );

  const items = [];
  for (const en of (entries || []).slice(0, 6)) {
    items.push(item(en.open ? "warn" : "info", iconFor(en.kind), zeile(en)));
  }
  if (!items.length) items.push(item("ok", "check", "Nichts reingekommen"));

  const bits = [];
  if (calls) bits.push(calls === 1 ? "1 Anruf" : `${calls} Anrufe`);
  if (mails) bits.push(mails === 1 ? "1 E-Mail" : `${mails} E-Mails`);
  if (letters) bits.push(letters === 1 ? "1 Brief" : `${letters} Briefe`);
  if (front) bits.push(front === 1 ? "1 Besuch am Empfang" : `${front} Besuche am Empfang`);

  // W-FLIP-TIEFE: ALLE Eingaenge ungekappt fuer die Tiefen-Nachfrage.
  const dLines = [`${dateLabel}: ${total === 1 ? "1 Eingang" : `${total} Eingänge`}${bits.length ? ` (${bits.join(", ")})` : ""}.`];
  for (const en of (entries || [])) dLines.push(`${zeile(en)}${en.open ? " [offen]" : ""}`);
  if (open) dLines.push(open === 1 ? "1 Anliegen ist noch offen." : `${open} Anliegen sind noch offen.`);

  return {
    kind: "eingaenge",
    tag: "Eingänge",
    title: dateLabel,
    time: "",
    subtitle: bits.length ? bits.join(" · ") : "Nichts reingekommen",
    heading: "Reingekommen",
    items: items.slice(0, 8),
    detail: detailText(dLines),
    footer: open ? `${open} offen` : "",
  };
}

/**
 * Wiedervorlage-Karte (W-STABIL-8): Fristen + Rechnungen aus Mail, gescannter
 * Post und Telefonaten. HIER (und nur hier) stehen die Euro-Betraege — der
 * gesprochene Text nennt sie nie (Chef-Regel). `items`: Ausgabe von
 * brain/wiedervorlage.buildWiedervorlage (wer/was/quelle/stage/amountCents).
 */
export function karteWiedervorlage({ items = [], euro = (c) => "" } = {}) {
  const levelOf = (it) => (it.stage === "overdue" ? "alert"
    : it.stage === "today" || it.kritisch ? "alert"
      : it.stage === "soon" ? "warn"
        : it.rechnung ? "warn" : "info");
  const iconOf = (it) => (it.rechnung ? "euro" : "clock");
  const zeile = (it) => {
    const frist = it.deadlineMs
      ? (it.stage === "overdue" ? "ÜBERFÄLLIG" : `bis ${datumKurz(it.deadlineMs)}`)
      : "ohne Datum";
    const betrag = it.amountCents ? ` · ${euro(it.amountCents)}` : "";
    const mehrfach = it.schreiben > 1 ? ` (${it.schreiben} Schreiben)` : "";
    return clip(`${frist} — ${it.wer}${mehrfach}: ${it.was}${betrag}`, 110);
  };

  const rows = (items || []).slice(0, 8).map((it) => item(levelOf(it), iconOf(it), zeile(it)));
  if (!rows.length) rows.push(item("ok", "check", "Keine Fristen, keine offenen Rechnungen"));

  const dLines = [(items || []).length
    ? `Wiedervorlage (${items.length} offen):`
    : "Wiedervorlage: nichts offen."];
  for (const it of items || []) {
    dLines.push(`${it.deadlineMs ? `Frist ${datumKurz(it.deadlineMs)}` : "Ohne Datum"} — ${it.wer} (${it.quelle}): ${it.was}${it.amountCents ? ` — ${euro(it.amountCents)}` : ""}${it.kritisch ? " [kritisch]" : ""}`);
  }
  dLines.push('Abhaken per Sprache: "Die Sache mit ... ist erledigt."');

  const dringend = (items || []).filter((i) => i.stage === "overdue" || i.stage === "today").length;
  return {
    kind: "wiedervorlage",
    tag: "Wiedervorlage",
    title: "Fristen & Rechnungen",
    time: "",
    subtitle: items?.length
      ? `${items.length} offen${dringend ? ` · ${dringend} dringend` : ""}`
      : "Nichts offen",
    heading: "Nicht liegen lassen",
    items: rows,
    detail: detailText(dLines),
    footer: items?.length > 8 ? `${items.length - 8} weitere` : "",
  };
}

/** Sophie-Abrechnungs-Karte (nur beim EXPLIZITEN "rechne ab" — kein Briefing). */
export function karteSophie(r = {}) {
  const items = [];
  if (r.status === "complete" && r.summen) {
    const s = r.summen;
    const eur = (n) => `${Math.round(Number(n) || 0).toLocaleString("de-DE")} €`;
    if (s.goz23) items.push(item("ok", "euro", `GOZ 2,3-fach: rund ${eur(s.goz23.gesamt)}`));
    if (s.goz35) items.push(item("ok", "euro", `GOZ 3,5-fach: rund ${eur(s.goz35.gesamt)}`));
    if (s.bema) items.push(item(s.bema.gesamt > 0 ? "ok" : "info", "euro", s.bema.gesamt > 0 ? `BEMA: rund ${eur(s.bema.gesamt)}` : "BEMA: keine Kassenleistung"));
    if (s.bemaplus) items.push(item("info", "euro", `BEMA plus: rund ${eur(s.bemaplus.gesamt)}`));
    items.push(item("info", "note", "Unverbindlicher Vorschlag, bitte fachlich prüfen"));
  } else if (r.status === "needs_input") {
    items.push(item("warn", "question", r.message || "Sophie braucht noch eine Angabe"));
  } else if (r.status === "no_match") {
    items.push(item("warn", "question", "Behandlung nicht eindeutig — bitte genauer beschreiben"));
  }
  if (!items.length) return null;
  // W-FLIP-TIEFE: volle Abrechnungs-Fakten (alle Summen/Meldungen) ungekappt.
  const dLines = [];
  dLines.push(`${r.label || "Abrechnungsvorschlag"} — ${r.status === "complete" ? "Sophie hat gerechnet" : "Sophie fragt nach"}.`);
  if (r.status === "complete" && r.summen) {
    const s = r.summen;
    const eur = (n) => `${Math.round(Number(n) || 0).toLocaleString("de-DE")} €`;
    if (s.goz23) dLines.push(`GOZ 2,3-fach: rund ${eur(s.goz23.gesamt)}.`);
    if (s.goz35) dLines.push(`GOZ 3,5-fach: rund ${eur(s.goz35.gesamt)}.`);
    if (s.bema) dLines.push(s.bema.gesamt > 0 ? `BEMA: rund ${eur(s.bema.gesamt)}.` : "BEMA: keine Kassenleistung.");
    if (s.bemaplus) dLines.push(`BEMA plus: rund ${eur(s.bemaplus.gesamt)}.`);
    dLines.push("Unverbindlicher Vorschlag, bitte fachlich prüfen.");
  } else if (r.message) {
    dLines.push(r.message);
  }
  return {
    kind: "sophie",
    tag: "Abrechnung",
    title: r.label || "Abrechnungsvorschlag",
    time: "",
    subtitle: r.status === "complete" ? "Sophie hat gerechnet" : "Sophie fragt nach",
    heading: r.status === "complete" ? "Endsummen" : "Offen",
    items: items.slice(0, 8),
    detail: detailText(dLines),
    footer: "",
  };
}
