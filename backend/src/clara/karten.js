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
//     items: [{ level: "alert"|"warn"|"info"|"ok", icon, text }], footer }
// Icons (Handy rendert Inline-SVG, Fallback nach level):
//   alert droplet heart scissors mail phone pen note ray euro calendar
//   check clock doc person tooth question mic
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

function item(level, icon, text) {
  return { level, icon, text: clip(text, 110) };
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

  return {
    kind: "patient",
    tag,
    title: clip(name, 40) || "Patient",
    time: zeitLabel(startMs),
    subtitle: [motive || "", calendarName ? `bei ${calendarName}` : ""].filter(Boolean).join(" · "),
    heading: "Das Wichtigste",
    items: items.slice(0, 8),
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
  return {
    kind: "tag",
    tag: "Tagesplan",
    title: dateLabel,
    time: spanne,
    subtitle: total === 1 ? "1 Termin" : `${total} Termine`,
    heading: "Auf einen Blick",
    items: items.slice(0, 8),
    footer: "",
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
  return {
    kind: "doku",
    tag: "Doku-Memo",
    title: clip(patientName, 40) || "Termin",
    time: apptStartMs ? `${datumKurz(apptStartMs)}` : "",
    subtitle: motiveName || "",
    heading: "Notizen",
    items: items.slice(0, 9),
    footer: offen ? `${offen} Punkt${offen === 1 ? "" : "e"} offen` : "Doku vollständig",
  };
}

/** Praxisweite Doku-Lücken ("Welche Dokus fehlen noch?"). */
export function karteLuecken(luecken = []) {
  const items = (luecken || []).slice(0, 7).map((l) => item(
    "warn", "calendar",
    `${isoKurz(l.date)} ${l.patientName || ""}${l.motive ? ` — ${l.motive}` : ""}`.trim(),
  ));
  if (!items.length) items.push(item("ok", "check", "Alle Termine sind dokumentiert"));
  return {
    kind: "luecken",
    tag: "Doku-Wächter",
    title: "Offene Dokumentationen",
    time: "",
    subtitle: luecken?.length ? `${luecken.length} Termin${luecken.length === 1 ? "" : "e"} ohne Doku` : "Alles vollständig",
    heading: "Nachzutragen",
    items,
    footer: "",
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
  return {
    kind: "sophie",
    tag: "Abrechnung",
    title: r.label || "Abrechnungsvorschlag",
    time: "",
    subtitle: r.status === "complete" ? "Sophie hat gerechnet" : "Sophie fragt nach",
    heading: r.status === "complete" ? "Endsummen" : "Offen",
    items: items.slice(0, 8),
    footer: "",
  };
}
