// Kontaktverlauf (rein, ohne Datenbank): was aus einem Kontaktversuch geworden ist.
//
// Je Kontaktversuch aus Luecke fuellen, Kampagne oder Recall gibt es EINEN Eintrag im Praxisgedaechtnis:
// den Anruf-Eintrag von Lisa (lisaAnrufe.js) oder einen Eintrag je SMS/E-Mail, den die Plattform meldet.
// Jeder traegt den Block `verlauf` mit drei Stufen:
//   kontakt     kam der Kontakt zustande
//   termin      wurde ein Termin vereinbart (verknuepft ueber die Kennung des Termins)
//   einhaltung  wurde der Termin eingehalten (aus dem Terminstatus in Pickadoc)
// und die Quelle (kampagne, luecke, recall, sonst), damit die Zahlen je Quelle getrennt bleiben.
//
// Entscheidungen (Chef 27.11.2026): verschickt zaehlt als kontaktiert, erreicht ist erst eine Reaktion;
// gezaehlt werden Patienten, Versuche daneben; ein spaeter gebuchter Termin wird 14 Tage dem letzten
// Kontakt davor zugerechnet; Termin vorbei ohne Kennzeichen ist "unklar" und nicht eingehalten.
//
// Vertrag: internal/kontakt-verlauf-schnittstelle.md (Projektspeicher).

import { buildEvent, nameKeyOf, CHANNELS, DIRECTIONS, EVENT_TYPES, ITEM_STATUS } from "./events.js";

const TZ = "Europe/Berlin";
const TAG_MS = 24 * 3_600_000;
export const ZURECHNEN_MS = 14 * TAG_MS;
export const UNKLAR_NACHSEHEN_MS = 14 * TAG_MS;
// Eine Absage und ein neuer Termin innerhalb dieser Spanne gelten als Verlegung.
const ERSATZ_MS = TAG_MS;

export const WEGE = ["anruf", "sms", "email"];
export const QUELLEN = ["kampagne", "luecke", "recall", "sonst"];
export const SENDUNG_EXTRACTOR = "plattform-versand";
export const SENDUNG_PREFIX = "kontakt-";
const UEBER = ["lisa", "telefon_ki", "praxis", "online"];

const KONTAKT_TEXT = {
  erreicht: "erreicht",
  nicht_erreicht: "nicht erreicht",
  anrufbeantworter: "Anrufbeantworter",
  abgelehnt: "Anruf abgelehnt",
  gesendet: "verschickt",
  fehlgeschlagen: "nicht zustande gekommen",
};
const REAKTION_TEXT = { link_geoeffnet: "Link geöffnet", antwort: "hat geantwortet", rueckruf: "hat zurückgerufen", buchung: "hat gebucht" };
const EINHALTUNG_TEXT = {
  kein_termin: "",
  offen: "steht noch aus",
  wahrgenommen: "wahrgenommen",
  abgesagt: "abgesagt",
  nicht_erschienen: "nicht erschienen",
  verlegt: "verlegt",
  unklar: "unklar, im Kalender ist nichts vermerkt",
};
const UEBER_TEXT = { lisa: "von Lisa", telefon_ki: "am Telefon (Bianca)", praxis: "von der Praxis", online: "online" };

function text(v, max = 0) {
  const t = v == null ? "" : String(v).trim();
  return max && t.length > max ? t.slice(0, max).trim() : t;
}

const zwei = (v) => String(v).padStart(2, "0");

function zeitMs(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (v && typeof v.toMillis === "function") return v.toMillis();
  const t = text(v);
  if (!t) return 0;
  const alsZahl = Number(t);
  if (Number.isFinite(alsZahl) && alsZahl > 0) return alsZahl;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** "JJJJ-MM-TT" in Berliner Zeit. */
export function berlinTag(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** "HH:MM" in Berliner Zeit. */
export function berlinUhrzeit(ms) {
  const teile = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const h = teile.find((p) => p.type === "hour")?.value || "00";
  const m = teile.find((p) => p.type === "minute")?.value || "00";
  return `${zwei(Number(h) % 24)}:${m}`;
}

export const monatVon = (ms) => berlinTag(ms).slice(0, 7);

function uhrzeitNorm(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(text(v));
  return m ? `${zwei(m[1])}:${m[2]}` : "";
}

function istTag(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(v));
}

function tagLang(datum) {
  const ms = istTag(datum) ? new Date(`${datum}T12:00:00Z`).getTime() : NaN;
  if (!Number.isFinite(ms)) return text(datum);
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(ms));
}

function kennungAus(v) {
  let out = "";
  for (const z of text(v)) {
    const ok = (z >= "0" && z <= "9") || (z >= "a" && z <= "z") || (z >= "A" && z <= "Z") || z === "-" || z === "_";
    out += ok ? z : "-";
  }
  return out.slice(0, 120);
}

// --- Bezug und Quelle -------------------------------------------------------

/** Lisas Block `bezug` (aus dem Auftrag der Plattform durchgereicht) in die gespeicherte Form. Ohne Inhalt: null. */
export function bezugAus(roh) {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const b = {
    quelle: text(roh.quelle, 40),
    kennung: text(roh.kennung, 160),
    aktion_id: text(roh.aktionId ?? roh.aktion_id, 120),
    kampagne_id: text(roh.campaignId ?? roh.kampagne_id, 120),
    phone_call_id: text(roh.phoneCallId ?? roh.phone_call_id, 160),
  };
  return b.quelle || b.kennung || b.aktion_id || b.kampagne_id || b.phone_call_id ? b : null;
}

/** Quelle eines Anrufs: Kampagne, Luecke fuellen, einzelner Recall-Anruf oder sonst. */
export function quelleVonAnruf(anruf) {
  const b = anruf?.bezug || {};
  const art = text(anruf?.auftrag?.art);
  if (text(b.kampagne_id)) return "kampagne";
  if (text(b.aktion_id) || text(b.quelle) === "luecke-fuellen" || art === "luecke") return "luecke";
  if (art === "nachricht") return "sonst";
  if (art === "recall") return text(anruf?.auftrag?.kampagne) ? "kampagne" : "recall";
  if (["plattform", "campaigner"].includes(text(b.quelle))) return "recall";
  return "sonst";
}

function kontaktVonAnruf(anruf) {
  const e = text(anruf?.erreicht);
  if (e === "person") return text(anruf?.ausgang) === "falsche_person" ? "nicht_erreicht" : "erreicht";
  if (e === "mailbox") return "anrufbeantworter";
  if (e === "abgelehnt") return "abgelehnt";
  if (e === "gescheitert") return "fehlgeschlagen";
  return "nicht_erreicht";
}

const KEIN_TERMIN = Object.freeze({ stand: "keiner", termin_id: "", datum: "", uhrzeit: "", behandler: "", ueber: "", vereinbart_ms: 0 });

/** Muss der Eintrag weiter nachgesehen werden? Nur mit vereinbartem Termin, dessen Einhaltung noch nicht feststeht. */
function mussPruefen(v) {
  return v?.termin?.stand === "vereinbart" && ["offen", "verlegt", "unklar"].includes(v?.einhaltung?.stand) && v?.einhaltung?.fertig !== true;
}

/** Der Block `verlauf` fuer einen Anruf von Lisa, so wie er beim Speichern feststeht. */
export function verlaufAusAnruf(anruf) {
  const stand = kontaktVonAnruf(anruf);
  const ms = Number(anruf?.beginnMs) || 0;
  const ausgang = text(anruf?.erreicht) === "person" ? text(anruf?.ausgang) : "";
  let termin = { ...KEIN_TERMIN };
  if (ausgang === "termin" && anruf?.termin) {
    termin = { stand: "vereinbart", termin_id: text(anruf.termin.termin_id), datum: text(anruf.termin.datum), uhrzeit: uhrzeitNorm(anruf.termin.uhrzeit),
      behandler: text(anruf.termin.behandler), ueber: "lisa", vereinbart_ms: ms };
  } else if (ausgang === "eintrag_gescheitert") {
    termin = { ...KEIN_TERMIN, stand: "zugesagt_nicht_eingetragen", datum: text(anruf?.zugesagt?.datum), uhrzeit: uhrzeitNorm(anruf?.zugesagt?.uhrzeit),
      behandler: text(anruf?.zugesagt?.behandler) };
  }
  const v = {
    weg: "anruf",
    quelle: quelleVonAnruf(anruf),
    kampagne_id: text(anruf?.bezug?.kampagne_id),
    kampagne_name: text(anruf?.auftrag?.kampagne),
    aktion_id: text(anruf?.bezug?.aktion_id),
    standort: text(anruf?.standort),
    monat: ms ? monatVon(ms) : "",
    kontakt: { stand, erreicht: stand === "erreicht", ms, reaktion: "", reaktion_ms: 0 },
    termin,
    einhaltung: { stand: termin.stand === "vereinbart" ? "offen" : "kein_termin", geprueft_ms: 0, verlegt: false },
  };
  return { ...v, pruefen: mussPruefen(v) };
}

/** Der wirksame Block eines Eintrags: gespeichert, sonst aus dem Anruf abgeleitet. null, wenn es kein Kontaktversuch ist. */
export function verlaufVon(event) {
  const gespeichert = event?.verlauf && WEGE.includes(event.verlauf.weg) ? event.verlauf : null;
  const ausAnruf = event?.anruf && String(event?.id || "").startsWith("lisa-anruf-") ? verlaufAusAnruf(event.anruf) : null;
  if (!gespeichert && !ausAnruf) return null;
  const v = { ...(ausAnruf || {}), ...(gespeichert || {}) };
  v.kontakt = { ...(ausAnruf?.kontakt || {}), ...(gespeichert?.kontakt || {}) };
  v.termin = { ...KEIN_TERMIN, ...(ausAnruf?.termin || {}), ...(gespeichert?.termin || {}) };
  v.einhaltung = { stand: "kein_termin", geprueft_ms: 0, verlegt: false, ...(ausAnruf?.einhaltung || {}), ...(gespeichert?.einhaltung || {}) };
  if (!QUELLEN.includes(v.quelle)) v.quelle = "sonst";
  return v;
}

// --- Meldung der Plattform: eine SMS oder E-Mail ----------------------------

/**
 * Meldung einer Sendung pruefen und in die gespeicherte Form bringen (rein).
 * @returns {{ok:true, sendung:object}|{ok:false, grund:string, klartext:string}}
 */
export function pruefeSendung(roh = {}) {
  const nein = (grund, klartext) => ({ ok: false, grund, klartext });
  const kennung = kennungAus(roh.kontakt_id);
  if (!kennung) return nein("kontakt_id_fehlt", "Die Kennung der Sendung (kontakt_id) fehlt.");
  const weg = text(roh.weg);
  if (weg !== "sms" && weg !== "email") return nein("weg_unbekannt", "weg muss sms oder email sein.");
  const ms = zeitMs(roh.zeit);
  if (!ms) return nein("zeit_unlesbar", "Der Zeitpunkt des Versands (zeit) fehlt oder ist nicht lesbar.");
  const ergebnis = text(roh.ergebnis);
  if (ergebnis !== "gesendet" && ergebnis !== "fehlgeschlagen") return nein("ergebnis_unbekannt", "ergebnis muss gesendet oder fehlgeschlagen sein.");
  const quelle = text(roh.quelle);
  if (!["kampagne", "luecke", "recall"].includes(quelle)) return nein("quelle_unbekannt", "quelle muss kampagne, luecke oder recall sein.");
  const kampagneId = text(roh.kampagne_id ?? roh.campaignId, 120);
  const aktionId = text(roh.aktion_id ?? roh.aktionId, 120);
  if (quelle === "kampagne" && !kampagneId) return nein("bezug_fehlt", "Bei quelle=kampagne fehlt kampagne_id.");
  if (quelle === "luecke" && !aktionId) return nein("bezug_fehlt", "Bei quelle=luecke fehlt aktion_id.");
  const patientId = text(roh.patient?.id, 120);
  if (!patientId) return nein("patient_fehlt", "Die Kennung des Patienten (patient.id) fehlt.");
  const standort = text(roh.standort, 120);
  if (!standort) return nein("standort_fehlt", "Der Standort (locationId) fehlt.");
  const vorname = text(roh.patient?.vorname, 60);
  const nachname = text(roh.patient?.nachname, 60);
  return { ok: true, sendung: {
    kontakt_id: text(roh.kontakt_id, 160),
    kennung: `${SENDUNG_PREFIX}${kennung}`,
    weg, ms, ergebnis, quelle,
    kampagne_id: kampagneId,
    kampagne_name: text(roh.kampagne_name, 120),
    aktion_id: aktionId,
    patient: { id: patientId, vorname, nachname, name: [vorname, nachname].filter(Boolean).join(" ") },
    standort,
    anlass: text(roh.anlass, 160),
    link: roh.link === true,
    angebot_termin_id: text(roh.angebot_termin_id, 120),
  } };
}

function sendungSatz(s) {
  const was = s.weg === "sms" ? "eine SMS" : "eine E-Mail";
  const wer = s.patient.name || "den Patienten";
  const um = `um ${berlinUhrzeit(s.ms)} Uhr`;
  const worum = s.anlass ? ` Es ging um: ${s.anlass}.` : "";
  return s.ergebnis === "gesendet"
    ? `Die Praxis hat ${um} ${was} an ${wer} geschickt.${worum}`
    : `Die Praxis wollte ${um} ${was} an ${wer} schicken. Der Versand ist fehlgeschlagen.${worum}`;
}

/**
 * Der Eintrag fuers Praxisgedaechtnis zu einer gemeldeten Sendung (rein).
 *
 * Er steht AUSSERHALB der Zeitreihe: er traegt kein Feld `ts`, seine Zeit steht in `zeitMs`. Alle Stellen, die
 * "die neuesten N Eintraege seit einem Zeitpunkt" lesen (Biancas Auskunft ueber den Anrufer, Tagesliste, Suche,
 * Morgenlage, rote Liste), fragen ueber `ts` und sehen ihn deshalb nie. So verdraengt eine Kampagne mit
 * tausenden Sendungen dort keinen offenen Anruf von Lisa. Gefunden wird der Eintrag ueber den Patienten
 * (eventStore.queryByPatient gibt ihm die Zeit zurueck) und ueber `verlauf.monat` (die Auskunft).
 *
 * Weil die Aufbewahrung der Praxis ueber `ts` loescht, braucht er eine eigene Frist: `verfallMs` wird zu
 * `expiresAtMs`, der taegliche Aufraeumlauf (retention.js, Schritt 1b) loescht ihn danach.
 */
export function sendungEintrag(clientId, s, { verfallMs = 0 } = {}) {
  const { ts: _ausserhalbDerZeitreihe, ...event } = buildEvent({
    clientId,
    id: s.kennung,
    ts: s.ms,
    expiresAtMs: verfallMs,
    channel: s.weg === "sms" ? CHANNELS.PRAXIS_SMS : CHANNELS.PRAXIS_EMAIL,
    direction: DIRECTIONS.OUT,
    type: EVENT_TYPES.INTERACTION,
    counterparty: { kind: "patient", name: s.patient.name },
    subject: { patientId: s.patient.id, name: s.patient.name },
    summary: sendungSatz(s),
    status: ITEM_STATUS.NONE,
    extractor: SENDUNG_EXTRACTOR,
    tags: ["kontakt", s.weg, s.quelle],
  });
  const verlauf = {
    weg: s.weg,
    quelle: s.quelle,
    kampagne_id: s.kampagne_id,
    kampagne_name: s.kampagne_name,
    aktion_id: s.aktion_id,
    standort: s.standort,
    monat: monatVon(s.ms),
    kontakt: { stand: s.ergebnis, erreicht: false, ms: s.ms, reaktion: "", reaktion_ms: 0 },
    termin: { ...KEIN_TERMIN },
    einhaltung: { stand: "kein_termin", geprueft_ms: 0, verlegt: false },
    pruefen: false,
  };
  return { ...event, zeitMs: s.ms, sendung: { kontakt_id: s.kontakt_id, anlass: s.anlass, link: s.link, angebot_termin_id: s.angebot_termin_id }, verlauf };
}

// --- Meldung der Plattform: eine Reaktion ------------------------------------

/** @returns {{ok:true, reaktion:object}|{ok:false, grund:string, klartext:string}} */
export function pruefeReaktion(roh = {}) {
  const nein = (grund, klartext) => ({ ok: false, grund, klartext });
  const art = text(roh.art);
  if (!["link_geoeffnet", "antwort", "buchung"].includes(art)) return nein("art_unbekannt", "art muss link_geoeffnet, antwort oder buchung sein.");
  const ms = zeitMs(roh.zeit);
  if (!ms) return nein("zeit_unlesbar", "Der Zeitpunkt der Reaktion (zeit) fehlt oder ist nicht lesbar.");
  const patientId = text(roh.patient_id ?? roh.patient?.id, 120);
  if (!patientId) return nein("patient_fehlt", "Die Kennung des Patienten (patient_id) fehlt.");
  let termin = null;
  if (art === "buchung") {
    const t = roh.termin && typeof roh.termin === "object" ? roh.termin : {};
    if (!text(t.termin_id)) return nein("termin_fehlt", "Bei art=buchung fehlt termin.termin_id.");
    termin = { termin_id: text(t.termin_id, 120), standort: text(t.standort, 120), datum: istTag(t.datum) ? text(t.datum) : "", uhrzeit: uhrzeitNorm(t.uhrzeit),
      behandler: text(t.behandler, 80) };
  }
  const ueber = UEBER.includes(text(roh.ueber)) && text(roh.ueber) !== "lisa" ? text(roh.ueber) : "online";
  return { ok: true, reaktion: { art, ms, patient_id: patientId, kontakt_id: text(roh.kontakt_id, 160) ? `${SENDUNG_PREFIX}${kennungAus(roh.kontakt_id)}` : "",
    kampagne_id: text(roh.kampagne_id ?? roh.campaignId, 120), aktion_id: text(roh.aktion_id ?? roh.aktionId, 120), termin, ueber } };
}

/**
 * Der Eintrag, zu dem eine Reaktion gehoert (rein): die genannte Sendung, sonst der juengste Kontakt des
 * Patienten vor der Reaktion, hoechstens 14 Tage alt und, wenn genannt, aus dieser Kampagne oder Aktion.
 */
export function eintragFuerReaktion(events, r) {
  const passend = (events || []).map((e) => ({ e, v: verlaufVon(e) })).filter(({ e, v }) => v
    && text(e.subject?.patientId) === r.patient_id && v.kontakt.stand !== "fehlgeschlagen"
    && v.kontakt.ms <= r.ms && r.ms - v.kontakt.ms <= ZURECHNEN_MS);
  if (r.kontakt_id) return passend.find(({ e }) => e.id === r.kontakt_id)?.e || null;
  const enger = passend.filter(({ v }) => (!r.kampagne_id || v.kampagne_id === r.kampagne_id) && (!r.aktion_id || v.aktion_id === r.aktion_id));
  enger.sort((a, b) => b.v.kontakt.ms - a.v.kontakt.ms);
  return enger[0]?.e || null;
}

/** Was eine Reaktion am Block aendert (rein). null, wenn sich nichts aendert. */
export function reaktionAnwenden(v, r) {
  const neu = { ...v, kontakt: { ...v.kontakt }, termin: { ...v.termin }, einhaltung: { ...v.einhaltung } };
  let geaendert = false;
  // Die erste Reaktion bleibt stehen; eine Buchung geht einer blossen Reaktion vor.
  if (!neu.kontakt.reaktion || (r.art === "buchung" && neu.kontakt.reaktion !== "buchung")) {
    neu.kontakt.reaktion = r.art;
    neu.kontakt.reaktion_ms = r.ms;
    neu.kontakt.erreicht = true;
    geaendert = true;
  }
  if (r.art === "buchung" && r.termin && neu.termin.stand !== "vereinbart") {
    neu.termin = { stand: "vereinbart", termin_id: r.termin.termin_id, datum: r.termin.datum, uhrzeit: r.termin.uhrzeit, behandler: r.termin.behandler,
      ueber: r.ueber || "online", vereinbart_ms: r.ms };
    if (r.termin.standort && !neu.standort) neu.standort = r.termin.standort;
    neu.einhaltung = { stand: "offen", geprueft_ms: 0, verlegt: false };
    geaendert = true;
  }
  if (!geaendert) return null;
  return { ...neu, pruefen: mussPruefen(neu) };
}

// --- Termine aus dem Kalender ------------------------------------------------

/** Ein Termin aus Pickadoc in der Form, mit der hier gerechnet wird (rein). */
export function terminForm(id, d = {}) {
  return {
    id: text(id),
    startMs: zeitMs(d.start),
    createdMs: zeitMs(d.createdAt),
    updatedMs: zeitMs(d.updatedAt),
    absageMs: zeitMs(d.deletedAt) || zeitMs(d.patientAbsentExcusedAt),
    status: text(d.status),
    patientStatus: Number(d.patientStatus) || 0,
    isDeleted: d.isDeleted === true,
    createdBy: text(d.createdBy),
    behandler: text(d.calendar?.name, 80),
  };
}

const abgesagt = (t) => t.patientStatus === 5 || t.isDeleted || t.status === "declined";

function ueberVon(t) {
  if (t.createdBy === "agent" || t.createdBy === "callr") return "telefon_ki";
  if (["online", "patient", "campaign", "recaller"].includes(t.createdBy)) return "online";
  return "praxis";
}

function terminBlock(t, ueber, vereinbartMs) {
  return { stand: "vereinbart", termin_id: t.id, datum: t.startMs ? berlinTag(t.startMs) : "", uhrzeit: t.startMs ? berlinUhrzeit(t.startMs) : "",
    behandler: t.behandler, ueber, vereinbart_ms: vereinbartMs };
}

/**
 * Spaeter gebuchte Termine den Kontakten EINES Patienten zurechnen (rein).
 * `eintraege`: [{ id, verlauf, angebotTerminId }] dieses Patienten. `termine`: seine Termine (terminForm).
 * Ein bestaetigter Termin, der nach einem Kontakt angelegt wurde, gehoert zum letzten Kontakt davor, wenn der
 * hoechstens 14 Tage zurueckliegt und noch keinen Termin hat. Ein vorlaeufiger Termin der Kampagne
 * (`angebotTerminId`) zaehlt, sobald er bestaetigt ist.
 * @returns {{id:string, termin:object}[]}
 */
export function termineZurechnen(eintraege, termine, { jetzt = Date.now() } = {}) {
  const liste = (eintraege || []).filter((x) => x?.verlauf && x.verlauf.kontakt.stand !== "fehlgeschlagen")
    .sort((a, b) => a.verlauf.kontakt.ms - b.verlauf.kontakt.ms);
  const vergeben = new Set(liste.flatMap((x) => [text(x.verlauf.termin?.termin_id), text(x.verlauf.einhaltung?.verlegt_auf?.termin_id)]).filter(Boolean));
  const hatTermin = new Set(liste.filter((x) => x.verlauf.termin?.stand === "vereinbart").map((x) => x.id));
  const aus = [];
  const nimm = (x, t, ueber, ms) => { aus.push({ id: x.id, termin: terminBlock(t, ueber, ms) }); vergeben.add(t.id); hatTermin.add(x.id); };

  // Der vorlaeufige Termin der Kampagne, vom Patienten bestaetigt.
  for (const x of liste) {
    const id = text(x.angebotTerminId);
    if (!id || hatTermin.has(x.id) || vergeben.has(id)) continue;
    const t = (termine || []).find((k) => k.id === id);
    if (t && t.status === "confirmed") nimm(x, t, "online", t.updatedMs > x.verlauf.kontakt.ms ? t.updatedMs : jetzt);
  }

  // Nicht abgesagte zuerst: wurde gleich nach dem Buchen umgebucht, zaehlt der Termin, der steht.
  const kandidaten = (termine || []).filter((t) => t.id && t.status === "confirmed" && t.createdMs > 0 && !vergeben.has(t.id))
    .sort((a, b) => Number(abgesagt(a)) - Number(abgesagt(b)) || a.createdMs - b.createdMs);
  for (const t of kandidaten) {
    let letzter = null;
    for (const x of liste) if (x.verlauf.kontakt.ms < t.createdMs) letzter = x;
    if (!letzter || hatTermin.has(letzter.id) || t.createdMs - letzter.verlauf.kontakt.ms > ZURECHNEN_MS) continue;
    nimm(letzter, t, ueberVon(t), t.createdMs);
  }
  return aus;
}

/** Ein Termin ohne Kennung (Lisa hat keine gemeldet): derselbe Tag und dieselbe Uhrzeit beim selben Patienten. */
export function terminNachZeit(termin, termine) {
  if (!istTag(termin?.datum) || !uhrzeitNorm(termin?.uhrzeit)) return null;
  return (termine || []).find((t) => t.startMs && t.status === "confirmed" && berlinTag(t.startMs) === termin.datum
    && berlinUhrzeit(t.startMs) === uhrzeitNorm(termin.uhrzeit)) || null;
}

/** Der Ersatz fuer einen abgesagten Termin: ein anderer, der um die Absage herum angelegt wurde und steht. */
export function ersatzTermin(alt, termine) {
  if (!alt?.absageMs) return null;
  const k = (termine || []).filter((t) => t.id && t.id !== alt.id && t.status === "confirmed" && !abgesagt(t)
    && Math.abs(t.createdMs - alt.absageMs) <= ERSATZ_MS && t.startMs > alt.absageMs);
  k.sort((a, b) => a.createdMs - b.createdMs);
  return k[0] || null;
}

/**
 * Einhaltung aus dem Terminstand (rein). `v`: der Block, `t`: der Termin (terminForm) oder null, wenn es ihn
 * unter der Kennung nicht gibt. Der Vergleich fuer "verlegt" geht gegen die vereinbarte Zeit, nach einer
 * Verlegung gegen die neue.
 */
export function einhaltungAus(v, t, { jetzt = Date.now() } = {}) {
  const bisher = v?.einhaltung || {};
  const verlegtAuf = bisher.verlegt_auf && typeof bisher.verlegt_auf === "object" ? bisher.verlegt_auf : null;
  const basis = { geprueft_ms: jetzt, verlegt: bisher.verlegt === true, ...(verlegtAuf ? { verlegt_auf: verlegtAuf } : {}) };
  if (!t || !t.startMs) {
    // Unter der Kennung gibt es keinen Termin. Nachgesehen wird, bis der vereinbarte Tag 14 Tage vorbei ist.
    const soll = verlegtAuf?.datum || v?.termin?.datum;
    return { ...basis, stand: "unklar", hinweis: "termin_nicht_gefunden", fertig: istTag(soll) && soll < berlinTag(jetzt - UNKLAR_NACHSEHEN_MS) };
  }
  if ([1, 2, 3].includes(t.patientStatus)) return { ...basis, stand: "wahrgenommen", fertig: true };
  if (t.patientStatus === 4) return { ...basis, stand: "nicht_erschienen", fertig: true };
  if (abgesagt(t)) return { ...basis, stand: "abgesagt", fertig: true };
  const tag = berlinTag(t.startMs);
  const zeit = berlinUhrzeit(t.startMs);
  const soll = verlegtAuf || v.termin || {};
  const andereZeit = (istTag(soll.datum) && soll.datum !== tag) || (uhrzeitNorm(soll.uhrzeit) && uhrzeitNorm(soll.uhrzeit) !== zeit);
  const neu = andereZeit
    ? { ...basis, verlegt: true, verlegt_auf: { ...(verlegtAuf?.termin_id ? { termin_id: verlegtAuf.termin_id } : {}), datum: tag, uhrzeit: zeit } }
    : basis;
  if (tag < berlinTag(jetzt)) {
    // Der Tag ist vorbei und nichts ist vermerkt. Eine Weile wird weiter nachgesehen, falls die Praxis nachtraegt.
    return { ...neu, stand: "unklar", fertig: jetzt - t.startMs > UNKLAR_NACHSEHEN_MS };
  }
  return { ...neu, stand: neu.verlegt ? "verlegt" : "offen", fertig: false };
}

/** Einen Block nach einer Aenderung an Termin oder Einhaltung wieder schluessig machen (rein). */
export function mitPruefen(v) {
  return { ...v, pruefen: mussPruefen(v) };
}

// --- Auskunft: Zeilen und Zahlen ---------------------------------------------

function terminText(t) {
  if (!t?.datum && !t?.uhrzeit) return "";
  return [tagLang(t.datum), t.uhrzeit ? `${t.uhrzeit} Uhr` : ""].filter(Boolean).join(", ") + (t.behandler ? ` bei ${t.behandler}` : "");
}

function kontaktText(k, weg) {
  const grund = KONTAKT_TEXT[k.stand] || "";
  const reaktion = REAKTION_TEXT[k.reaktion] || "";
  if (weg === "anruf") return reaktion ? `${grund}, ${reaktion}` : grund;
  if (k.stand === "fehlgeschlagen") return "Versand fehlgeschlagen";
  return reaktion ? `verschickt, ${reaktion}` : "verschickt, keine Reaktion";
}

function einhaltungText(e) {
  const grund = EINHALTUNG_TEXT[e.stand] || "";
  if (!grund) return "";
  const auf = e.verlegt_auf ? terminText(e.verlegt_auf) : "";
  if (e.stand === "verlegt") return auf ? `verlegt auf ${auf}` : "verlegt";
  return e.verlegt ? `${grund} (nach Verlegung${auf ? ` auf ${auf}` : ""})` : grund;
}

/** Zeile der Auskunft zu einem Eintrag (rein). null, wenn der Eintrag kein Kontaktversuch ist. */
export function verlaufZeile(event) {
  const v = verlaufVon(event);
  if (!v) return null;
  const a = event.anruf || null;
  const patientId = text(event.subject?.patientId) || text(a?.patient?.id);
  const name = text(a?.patient?.name) || text(event.subject?.name) || text(event.counterparty?.name);
  const anlass = a ? text(a.anlass) + (text(a.behandler) && !text(a.anlass).toLowerCase().includes(text(a.behandler).toLowerCase()) ? ` bei ${text(a.behandler)}` : "")
    : text(event.sendung?.anlass);
  return {
    id: event.id,
    zeitMs: Number(v.kontakt.ms) || Number(event.ts) || 0,
    weg: v.weg,
    quelle: v.quelle,
    kampagne_id: text(v.kampagne_id),
    kampagne_name: text(v.kampagne_name),
    aktion_id: text(v.aktion_id),
    standort: text(v.standort),
    patient: name,
    patientId: patientId || null,
    // Zum Zaehlen: ohne Kennung gilt der Name zusammen mit der Nummer.
    patientSchluessel: patientId ? `p:${patientId}` : `n:${nameKeyOf(name)}|${text(a?.nummer)}`,
    anlass,
    kontakt: { stand: v.kontakt.stand, erreicht: v.kontakt.erreicht === true, text: kontaktText(v.kontakt, v.weg), reaktion: text(v.kontakt.reaktion), reaktionMs: Number(v.kontakt.reaktion_ms) || 0 },
    termin: { stand: v.termin.stand, termin_id: text(v.termin.termin_id), datum: text(v.termin.datum), uhrzeit: text(v.termin.uhrzeit), behandler: text(v.termin.behandler),
      ueber: text(v.termin.ueber), vereinbartMs: Number(v.termin.vereinbart_ms) || 0,
      text: v.termin.stand === "vereinbart" ? [terminText(v.termin), UEBER_TEXT[v.termin.ueber] ? `gebucht ${UEBER_TEXT[v.termin.ueber]}` : ""].filter(Boolean).join(", ")
        : v.termin.stand === "zugesagt_nicht_eingetragen" ? "zugesagt, aber nicht eingetragen" : "" },
    einhaltung: { stand: v.einhaltung.stand, text: einhaltungText(v.einhaltung), verlegt: v.einhaltung.verlegt === true,
      verlegtAuf: v.einhaltung.verlegt_auf ? { datum: text(v.einhaltung.verlegt_auf.datum), uhrzeit: text(v.einhaltung.verlegt_auf.uhrzeit) } : null,
      geprueftMs: Number(v.einhaltung.geprueft_ms) || 0 },
    phoneCallId: text(a?.phone_call_id) || null,
  };
}

const KONTAKT_STAENDE = ["erreicht", "nicht_erreicht", "anrufbeantworter", "abgelehnt", "gesendet", "fehlgeschlagen"];
const EINHALTUNG_STAENDE = ["offen", "wahrgenommen", "abgesagt", "nicht_erschienen", "verlegt", "unklar"];

function vier(zeilen) {
  const menge = (bedingung) => new Set(zeilen.filter(bedingung).map((z) => z.patientSchluessel)).size;
  return {
    kontaktiert: menge((z) => z.kontakt.stand !== "fehlgeschlagen"),
    erreicht: menge((z) => z.kontakt.erreicht),
    termin: menge((z) => z.termin.stand === "vereinbart"),
    eingehalten: menge((z) => z.termin.stand === "vereinbart" && z.einhaltung.stand === "wahrgenommen"),
    versuche: zeilen.length,
  };
}

/** Ein Zahlenblock ueber Zeilen der Auskunft (rein). Gezaehlt werden Patienten, `versuche` sind Eintraege. */
export function zahlenBlock(zeilen = []) {
  const kontakt = Object.fromEntries(KONTAKT_STAENDE.map((k) => [k, 0]));
  const einhaltung = Object.fromEntries(EINHALTUNG_STAENDE.map((k) => [k, 0]));
  for (const z of zeilen) {
    if (z.kontakt.stand in kontakt) kontakt[z.kontakt.stand] += 1;
    if (z.termin.stand === "vereinbart" && z.einhaltung.stand in einhaltung) einhaltung[z.einhaltung.stand] += 1;
  }
  return { ...vier(zeilen), kontakt, einhaltung, je_weg: Object.fromEntries(WEGE.map((w) => [w, vier(zeilen.filter((z) => z.weg === w))])) };
}

/** Die Zahlen der Auskunft (rein): je Quelle immer alle vier, dazu gesamt und je Kampagne oder Aktion. */
export function zahlenAus(zeilen = []) {
  const jeAktion = new Map();
  for (const z of zeilen) {
    const id = z.quelle === "kampagne" ? z.kampagne_id : z.quelle === "luecke" ? z.aktion_id : "";
    if (!id) continue;
    const k = `${z.quelle}:${id}`;
    if (!jeAktion.has(k)) jeAktion.set(k, { quelle: z.quelle, id, name: "", zeilen: [], zuletzt: 0 });
    const g = jeAktion.get(k);
    g.zeilen.push(z);
    if (!g.name && z.kampagne_name) g.name = z.kampagne_name;
    if (z.zeitMs > g.zuletzt) g.zuletzt = z.zeitMs;
  }
  return {
    je_quelle: Object.fromEntries(QUELLEN.map((q) => [q, zahlenBlock(zeilen.filter((z) => z.quelle === q))])),
    gesamt: zahlenBlock(zeilen),
    je_aktion: [...jeAktion.values()].sort((a, b) => b.zuletzt - a.zuletzt).map((g) => ({
      quelle: g.quelle, ...(g.quelle === "kampagne" ? { kampagne_id: g.id } : { aktion_id: g.id }), name: g.name, zuletztMs: g.zuletzt, zahlen: zahlenBlock(g.zeilen) })),
  };
}

/** Abfrage der Auskunft lesen (rein): Zeitraum in Berliner Tagen, Filter. */
export function abfrageAus(q = {}, { jetzt = Date.now() } = {}) {
  const heute = berlinTag(jetzt);
  const bis = istTag(q.bis) && text(q.bis) <= heute ? text(q.bis) : heute;
  let von = istTag(q.von) ? text(q.von) : berlinTag(new Date(`${bis}T12:00:00Z`).getTime() - 29 * TAG_MS);
  if (von > bis) von = bis;
  // Hoechstens zwoelf Monate zurueck.
  const fruehest = berlinTag(new Date(`${bis}T12:00:00Z`).getTime() - 365 * TAG_MS);
  if (von < fruehest) von = fruehest;
  const liste = (v, erlaubt) => text(v).split(",").map((x) => x.trim()).filter((x) => erlaubt.includes(x));
  return { von, bis, quellen: liste(q.quelle, QUELLEN), wege: liste(q.weg, WEGE), kampagne_id: text(q.kampagne_id, 120), aktion_id: text(q.aktion_id, 120),
    mitEintraegen: text(q.eintraege) !== "0" };
}

/** Die Monate ("JJJJ-MM") eines Zeitraums, beide Enden eingeschlossen. */
export function monateVon(von, bis) {
  const aus = [];
  let [j, m] = von.slice(0, 7).split("-").map(Number);
  const ende = bis.slice(0, 7);
  for (let i = 0; i < 14; i += 1) {
    const k = `${j}-${zwei(m)}`;
    aus.push(k);
    if (k >= ende) break;
    m += 1;
    if (m > 12) { m = 1; j += 1; }
  }
  return aus;
}

/** Passt die Zeile zur Abfrage? */
export function passtZurAbfrage(z, a) {
  const tag = berlinTag(z.zeitMs);
  if (tag < a.von || tag > a.bis) return false;
  if (a.quellen.length && !a.quellen.includes(z.quelle)) return false;
  if (a.wege.length && !a.wege.includes(z.weg)) return false;
  if (a.kampagne_id && z.kampagne_id !== a.kampagne_id) return false;
  if (a.aktion_id && z.aktion_id !== a.aktion_id) return false;
  return true;
}
